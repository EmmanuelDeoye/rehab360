// js/study.js
// Study Buddy: turns notes/files into a summary + flashcards + quiz, tracks
// real spaced-repetition (Leitner system) per flashcard, and maintains a
// shared per-subject topic-mastery record in Firebase that Exam Simulator
// (exam.js) reads from and writes back to — that shared record is the sync
// between the two tools.

document.addEventListener('DOMContentLoaded', function () {
  const database = firebase.database();
  const auth = firebase.auth();

  // ===== AI Config =====
  let aiConfig = { token: null, endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash' };
  async function fetchTokens() {
    if (aiConfig.token) return true;
    try {
      const snap = await database.ref('tokens/deepseek').once('value');
      const data = snap.val();
      if (data?.api_key) { aiConfig.token = data.api_key; return true; }
      return false;
    } catch (err) {
      console.error('Token fetch error:', err);
      return false;
    }
  }

  async function callAI(systemPrompt, userPrompt, maxTokens = 2500) {
    if (!aiConfig.token) {
      const ok = await fetchTokens();
      if (!ok) throw new Error('AI service is not configured.');
    }
    const response = await fetch(`${aiConfig.endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiConfig.token}` },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        max_tokens: maxTokens,
        temperature: 0.5
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `AI service error (${response.status})`);
    }
    const data = await response.json();
    return data.choices[0].message.content;
  }

  function parseAIJson(text) {
    let cleaned = (text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
    return JSON.parse(cleaned);
  }

  // ===== State =====
  let currentUser = null;
  let scopeUid = null; // center owner's uid for center members, so study sets/subjects are shared
  let subjects = {};          // subjectId -> {name, topics:{topicId:{name,masteryScore,timesReviewed,lastActivity}}, createdAt}
  let studySets = {};         // setId -> {subjectId, title, summary, flashcards:[], quiz:[], createdAt}
  let activeSubjectId = null;
  let activeSetIds = [];      // all study set ids belonging to the active subject
  let flashcardQueue = [];    // working queue for the review session
  let currentCardIndex = 0;
  let quizState = null;       // {questions, index, answers, score, topicResults}

  // ===== DOM refs =====
  const $ = (id) => document.getElementById(id);
  const viewDashboard = $('viewDashboard');
  const viewCreate = $('viewCreate');
  const viewSubject = $('viewSubject');

  function showView(view) {
    [viewDashboard, viewCreate, viewSubject].forEach(v => v.style.display = 'none');
    view.style.display = '';
  }

  function showLoading(text) {
    $('loadingText').textContent = text || 'Working…';
    $('loadingOverlay').style.display = 'flex';
  }
  function hideLoading() { $('loadingOverlay').style.display = 'none'; }

  // ===== Toast =====
  function showToast(message, type = 'success', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = 'background:var(--study-surface,#fff);border:1px solid var(--study-border,#e5e7eb);color:var(--study-text,#111);padding:0.8rem 1.1rem;border-radius:0.7rem;box-shadow:0 8px 24px rgba(0,0,0,0.15);margin-top:0.5rem;font-size:0.85rem;max-width:320px;';
    if (type === 'error') toast.style.borderColor = '#dc2626';
    if (type === 'success') toast.style.borderColor = '#16a34a';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, duration);
  }

  // =========================================================================
  // Spaced repetition (Leitner system, 5 boxes, day-based intervals)
  // =========================================================================
  const LEITNER_INTERVALS_DAYS = [0, 1, 2, 4, 8, 16]; // index = box (1-5)

  function gradeCard(card, grade) {
    // grade: 'again' | 'hard' | 'good' | 'easy'
    let box = card.box || 1;
    if (grade === 'again') box = 1;
    else if (grade === 'hard') box = Math.max(1, box - 1) || 1;
    else if (grade === 'good') box = Math.min(5, box + 1);
    else if (grade === 'easy') box = Math.min(5, box + 2);
    const intervalDays = LEITNER_INTERVALS_DAYS[box] || 1;
    const nextReview = Date.now() + intervalDays * 24 * 60 * 60 * 1000;
    return { box, nextReview, timesReviewed: (card.timesReviewed || 0) + 1 };
  }

  // =========================================================================
  // Shared subject/topic mastery — this is what synchronizes with exam.js
  // =========================================================================
  async function loadSubjects() {
    if (!currentUser) return;
    const snap = await database.ref(`history/${scopeUid}/subjects`).once('value');
    subjects = snap.val() || {};
  }

  async function loadStudySets() {
    if (!currentUser) return;
    const snap = await database.ref(`history/${scopeUid}/study/sets`).once('value');
    studySets = snap.val() || {};
  }

  async function getOrCreateSubject(name) {
    const trimmed = name.trim();
    const existingId = Object.keys(subjects).find(id => (subjects[id].name || '').toLowerCase() === trimmed.toLowerCase());
    if (existingId) return existingId;
    const ref = database.ref(`history/${scopeUid}/subjects`).push();
    const record = { name: trimmed, topics: {}, createdAt: firebase.database.ServerValue.TIMESTAMP };
    await ref.set(record);
    subjects[ref.key] = { name: trimmed, topics: {}, createdAt: Date.now() };
    return ref.key;
  }

  // Blends the new performance into the topic's existing mastery score
  // rather than overwriting it, so a single bad quiz doesn't erase progress
  // and a single lucky guess doesn't inflate it.
  async function updateTopicMastery(subjectId, topicName, correct, total) {
    if (!subjectId || !topicName || total === 0) return;
    const topicId = topicName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) || 'general';
    const path = `history/${scopeUid}/subjects/${subjectId}/topics/${topicId}`;
    const snap = await database.ref(path).once('value');
    const existing = snap.val() || { name: topicName, masteryScore: 50, timesReviewed: 0 };
    const newPerformance = (correct / total) * 100;
    const blended = existing.timesReviewed > 0
      ? Math.round(existing.masteryScore * 0.65 + newPerformance * 0.35)
      : Math.round(newPerformance);
    const updated = {
      name: topicName,
      masteryScore: Math.max(0, Math.min(100, blended)),
      timesReviewed: (existing.timesReviewed || 0) + 1,
      lastActivity: new Date().toISOString()
    };
    await database.ref(path).set(updated);
    if (!subjects[subjectId].topics) subjects[subjectId].topics = {};
    subjects[subjectId].topics[topicId] = updated;
  }

  function subjectOverallMastery(subjectId) {
    const topics = subjects[subjectId]?.topics || {};
    const scores = Object.values(topics).map(t => t.masteryScore || 0);
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  function masteryColor(score) {
    if (score === null) return '#9ca3af';
    if (score >= 75) return 'var(--study-green)';
    if (score >= 45) return 'var(--study-amber)';
    return 'var(--study-red)';
  }

  // =========================================================================
  // Due-card calculation (across all subjects)
  // =========================================================================
  function allFlashcards() {
    const cards = [];
    Object.entries(studySets).forEach(([setId, set]) => {
      (set.flashcards || []).forEach((c, i) => cards.push({ ...c, setId, cardIndex: i, subjectId: set.subjectId }));
    });
    return cards;
  }

  function dueCardsCount() {
    const now = Date.now();
    return allFlashcards().filter(c => !c.nextReview || c.nextReview <= now).length;
  }

  function refreshDueBanner() {
    const due = dueCardsCount();
    const banner = $('dueBanner');
    if (due > 0) {
      $('dueCount').textContent = due;
      $('duePlural').textContent = due === 1 ? '' : 's';
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
    }
  }

  // =========================================================================
  // Dashboard rendering
  // =========================================================================
  function renderDashboard() {
    const grid = $('subjectsGrid');
    const ids = Object.keys(subjects);
    if (ids.length === 0) {
      grid.innerHTML = `<div class="empty-state"><i class="fas fa-book-open"></i><p>No subjects yet — create your first study set to get started.</p></div>`;
      refreshDueBanner();
      return;
    }
    grid.innerHTML = ids.map(id => {
      const s = subjects[id];
      const mastery = subjectOverallMastery(id);
      const cardCount = allFlashcards().filter(c => c.subjectId === id).length;
      const dueCount = allFlashcards().filter(c => c.subjectId === id && (!c.nextReview || c.nextReview <= Date.now())).length;
      return `
      <div class="subject-card" data-id="${id}">
        <div>
          <div class="subject-card-title">${escapeHtml(s.name)}</div>
          <div class="subject-card-meta">${cardCount} card${cardCount === 1 ? '' : 's'} · ${Object.keys(s.topics || {}).length} topic${Object.keys(s.topics || {}).length === 1 ? '' : 's'}</div>
        </div>
        <div class="mastery-bar-track"><div class="mastery-bar-fill" style="width:${mastery ?? 0}%;"></div></div>
        <div class="subject-card-footer">
          <span>${mastery === null ? 'Not tested yet' : mastery + '% mastery'}</span>
          ${dueCount > 0 ? `<span class="subject-due-badge">${dueCount} due</span>` : ''}
        </div>
      </div>`;
    }).join('');
    grid.querySelectorAll('.subject-card').forEach(card => {
      card.addEventListener('click', () => openSubject(card.dataset.id));
    });
    refreshDueBanner();
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // =========================================================================
  // Create Study Set flow
  // =========================================================================
  let uploadedText = '';

  $('newSubjectBtn').addEventListener('click', () => {
    if (!currentUser) { showToast('Please log in to create a study set', 'info'); document.getElementById('loginBtn')?.click(); return; }
    if (window.rehabPlans && !window.rehabPlans.isFeatureAllowed('study')) {
      window.rehabPlans.showUpgradePrompt('study');
      return;
    }
    const datalist = $('existingSubjectsList');
    datalist.innerHTML = Object.values(subjects).map(s => `<option value="${escapeHtml(s.name)}"></option>`).join('');
    showView(viewCreate);
  });

  $('cancelCreateBtn').addEventListener('click', () => showView(Object.keys(subjects).length ? viewDashboard : viewDashboard));

  $('attachBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $('fileInfo').style.display = 'inline-flex';
    $('fileInfo').innerHTML = `<i class="fas fa-spinner fa-spin"></i> Extracting ${escapeHtml(file.name)}…`;
    try {
      uploadedText = await extractFileText(file);
      $('fileInfo').innerHTML = `<i class="fas fa-check"></i> ${escapeHtml(file.name)} <button id="removeFileBtn"><i class="fas fa-times"></i></button>`;
      $('removeFileBtn').addEventListener('click', () => { uploadedText = ''; $('fileInfo').style.display = 'none'; e.target.value = ''; });
    } catch (err) {
      console.error(err);
      $('fileInfo').innerHTML = `<i class="fas fa-exclamation-triangle"></i> Could not read file`;
      showToast('Could not extract text from that file', 'error');
    }
  });

  async function extractFileText(file) {
    const name = file.name.toLowerCase();
    if (file.type === 'text/plain' || name.endsWith('.txt')) return await file.text();
    if (name.endsWith('.pdf')) {
      if (typeof pdfjsLib !== 'undefined') pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let text = '';
      const maxPages = Math.min(pdf.numPages, 20);
      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(it => it.str).join(' ') + '\n';
      }
      return text.trim();
    }
    if (name.endsWith('.docx') || name.endsWith('.doc')) {
      const buf = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: buf });
      return (result.value || '').trim();
    }
    if (file.type.startsWith('image/')) {
      const result = await Tesseract.recognize(file, 'eng');
      return (result.data.text || '').trim();
    }
    throw new Error('Unsupported file type');
  }

  $('generateSetBtn').addEventListener('click', async () => {
    const subjectName = $('subjectInput').value.trim();
    const notes = ($('notesInput').value.trim() || uploadedText || '').trim();
    if (!subjectName) { showToast('Please enter a subject name', 'warning'); return; }
    if (!notes) { showToast('Please paste some notes or attach a file', 'warning'); return; }

    const flashcardCount = Math.min(40, Math.max(5, parseInt($('flashcardCount').value, 10) || 15));
    const quizCount = Math.min(20, Math.max(3, parseInt($('quizCount').value, 10) || 8));

    showLoading('Analyzing your material…');
    try {
      const systemPrompt = `You are an expert study coach for rehabilitation/healthcare students. From the material given, produce a JSON object with EXACTLY these keys and nothing else (no markdown, no code fences, no commentary):
{
  "summary": "a well-structured markdown summary (headings, bullet points) of the key concepts, 200-400 words",
  "topics": ["3-6 short topic names that organize the material"],
  "flashcards": [{"front": "question or term", "back": "concise answer", "topic": "one of the topic names above"}],
  "quiz": [{"question": "...", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "why that's correct", "topic": "one of the topic names above"}]
}
Generate exactly ${flashcardCount} flashcards and exactly ${quizCount} quiz questions. Flashcards should test recall of specific facts/definitions. Quiz questions should test understanding, not just memorization. Every topic value must exactly match one of the strings in "topics".`;
      const userPrompt = `Subject: ${subjectName}\n\nMaterial:\n${notes.slice(0, 12000)}`;

      const response = await callAI(systemPrompt, userPrompt, 4000);
      const parsed = parseAIJson(response);

      if (!parsed.flashcards || !parsed.quiz || !parsed.topics) throw new Error('AI response was missing required fields');

      const subjectId = await getOrCreateSubject(subjectName);

      // Register any new topics with a neutral starting mastery score.
      for (const topicName of parsed.topics) {
        const topicId = topicName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) || 'general';
        if (!subjects[subjectId].topics || !subjects[subjectId].topics[topicId]) {
          await database.ref(`history/${scopeUid}/subjects/${subjectId}/topics/${topicId}`).set({ name: topicName, masteryScore: 50, timesReviewed: 0, lastActivity: new Date().toISOString() });
        }
      }
      await loadSubjects();

      const flashcards = parsed.flashcards.map((c, i) => ({
        id: 'c_' + Date.now() + '_' + i,
        front: c.front, back: c.back, topic: c.topic || parsed.topics[0],
        box: 1, nextReview: Date.now(), timesReviewed: 0
      }));

      const setRef = database.ref(`history/${scopeUid}/study/sets`).push();
      const setRecord = {
        subjectId,
        title: `${subjectName} — ${new Date().toLocaleDateString()}`,
        summary: parsed.summary,
        topics: parsed.topics,
        flashcards,
        quiz: parsed.quiz,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };
      await setRef.set(setRecord);
      studySets[setRef.key] = { ...setRecord, createdAt: Date.now() };

      hideLoading();
      showToast('Study set generated!', 'success');
      $('subjectInput').value = '';
      $('notesInput').value = '';
      uploadedText = '';
      $('fileInfo').style.display = 'none';
      openSubject(subjectId);
    } catch (error) {
      console.error(error);
      hideLoading();
      showToast('Error generating study set: ' + (error.message || 'unknown error'), 'error', 6000);
    }
  });

  // =========================================================================
  // Subject view
  // =========================================================================
  function openSubject(subjectId) {
    activeSubjectId = subjectId;
    activeSetIds = Object.keys(studySets).filter(id => studySets[id].subjectId === subjectId);
    $('subjectTitle').textContent = subjects[subjectId]?.name || 'Subject';
    showView(viewSubject);
    switchTab('overview');
    renderOverviewTab();
  }

  $('backToDashboardBtn').addEventListener('click', () => { renderDashboard(); showView(viewDashboard); });

  $('practiceExamBtn').addEventListener('click', () => {
    if (!activeSubjectId) return;
    window.location.href = `exam.html?subject=${activeSubjectId}&subjectName=${encodeURIComponent(subjects[activeSubjectId].name)}`;
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab));
    if (tab === 'flashcards') renderFlashcardArea();
    if (tab === 'quiz') renderQuizIntro();
    if (tab === 'summary') renderSummaryTab();
    if (tab === 'overview') renderOverviewTab();
  }

  function renderOverviewTab() {
    const topics = subjects[activeSubjectId]?.topics || {};
    const list = $('topicMasteryList');
    const topicIds = Object.keys(topics);
    list.innerHTML = topicIds.length === 0
      ? `<p style="color:var(--study-text-secondary);font-size:0.85rem;">No topics tracked yet.</p>`
      : topicIds.map(id => {
          const t = topics[id];
          return `<div class="topic-mastery-row">
            <div class="topic-mastery-name">${escapeHtml(t.name)}</div>
            <div class="topic-mastery-track"><div class="topic-mastery-fill" style="width:${t.masteryScore}%;background:${masteryColor(t.masteryScore)};"></div></div>
            <div class="topic-mastery-pct">${t.masteryScore}%</div>
          </div>`;
        }).join('');

    const setsList = $('subjectSetsList');
    setsList.innerHTML = activeSetIds.length === 0 ? `<p style="color:var(--study-text-secondary);font-size:0.85rem;">No study sets yet.</p>` :
      activeSetIds.map(id => {
        const s = studySets[id];
        return `<div class="set-row"><span class="set-row-name">${escapeHtml(s.title)}</span><span class="set-row-meta">${(s.flashcards || []).length} cards · ${(s.quiz || []).length} questions</span></div>`;
      }).join('');
  }

  function renderSummaryTab() {
    const latestSet = activeSetIds.map(id => studySets[id]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    $('summaryContent').innerHTML = latestSet ? (typeof marked !== 'undefined' ? marked.parse(latestSet.summary || '') : escapeHtml(latestSet.summary)) : '<p>No summary yet.</p>';
  }

  // =========================================================================
  // Flashcard review session
  // =========================================================================
  $('flashcardFilter').addEventListener('change', renderFlashcardArea);
  $('shuffleCardsBtn').addEventListener('click', () => { flashcardQueue.sort(() => Math.random() - 0.5); currentCardIndex = 0; renderCard(); });

  function renderFlashcardArea() {
    const filter = $('flashcardFilter').value;
    const all = allFlashcards().filter(c => c.subjectId === activeSubjectId);
    const now = Date.now();
    flashcardQueue = filter === 'due' ? all.filter(c => !c.nextReview || c.nextReview <= now) : all;
    currentCardIndex = 0;
    const due = all.filter(c => !c.nextReview || c.nextReview <= now).length;
    $('flashcardStats').textContent = `${due} due · ${all.length} total`;
    renderCard();
  }

  function renderCard() {
    const area = $('flashcardArea');
    if (flashcardQueue.length === 0) {
      area.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle"></i><p>Nothing to review here — nice work!</p></div>`;
      return;
    }
    if (currentCardIndex >= flashcardQueue.length) {
      area.innerHTML = `<div class="empty-state"><i class="fas fa-trophy"></i><p>Review session complete!</p></div>`;
      renderDashboard();
      return;
    }
    const card = flashcardQueue[currentCardIndex];
    area.innerHTML = `
      <div class="flashcard-progress">Card ${currentCardIndex + 1} of ${flashcardQueue.length}</div>
      <div class="flashcard" id="activeFlashcard">
        <div class="flashcard-inner">
          <div class="flashcard-face flashcard-face-front">
            <span class="flashcard-topic-tag">${escapeHtml(card.topic || '')}</span>
            ${escapeHtml(card.front)}
            <span class="flashcard-hint">Tap to flip</span>
          </div>
          <div class="flashcard-face flashcard-face-back">${escapeHtml(card.back)}</div>
        </div>
      </div>
      <div class="grade-buttons" id="gradeButtons" style="display:none;">
        <button class="grade-btn grade-again" data-grade="again">Again<small>&lt;1 day</small></button>
        <button class="grade-btn grade-hard" data-grade="hard">Hard<small>Sooner</small></button>
        <button class="grade-btn grade-good" data-grade="good">Good<small>Normal</small></button>
        <button class="grade-btn grade-easy" data-grade="easy">Easy<small>Later</small></button>
      </div>
    `;
    const cardEl = $('activeFlashcard');
    cardEl.addEventListener('click', () => {
      cardEl.classList.toggle('flipped');
      $('gradeButtons').style.display = cardEl.classList.contains('flipped') ? 'grid' : 'none';
    });
    document.querySelectorAll('.grade-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await applyGrade(card, btn.dataset.grade);
        currentCardIndex++;
        renderCard();
      });
    });
  }

  async function applyGrade(card, grade) {
    const update = gradeCard(card, grade);
    const set = studySets[card.setId];
    if (!set || !set.flashcards[card.cardIndex]) return;
    Object.assign(set.flashcards[card.cardIndex], update);
    await database.ref(`history/${scopeUid}/study/sets/${card.setId}/flashcards/${card.cardIndex}`).update(update);
    // Flashcard performance nudges topic mastery too (lighter weight than a full quiz).
    const correctish = grade === 'good' || grade === 'easy';
    await updateTopicMastery(card.subjectId, card.topic, correctish ? 1 : 0, 1);
  }

  $('dueReviewBtn').addEventListener('click', () => {
    const due = allFlashcards().filter(c => !c.nextReview || c.nextReview <= Date.now());
    if (due.length === 0) return;
    activeSubjectId = due[0].subjectId;
    $('subjectTitle').textContent = subjects[activeSubjectId]?.name || 'Subject';
    showView(viewSubject);
    switchTab('flashcards');
    $('flashcardFilter').value = 'due';
    flashcardQueue = due;
    currentCardIndex = 0;
    renderCard();
  });

  // =========================================================================
  // Quiz
  // =========================================================================
  function renderQuizIntro() {
    const latestSet = activeSetIds.map(id => studySets[id]).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    const area = $('quizArea');
    if (!latestSet || !latestSet.quiz || latestSet.quiz.length === 0) {
      area.innerHTML = `<div class="empty-state"><i class="fas fa-question-circle"></i><p>No quiz available for this subject yet.</p></div>`;
      return;
    }
    area.innerHTML = `
      <div class="glass-card" style="text-align:center;">
        <h3 style="justify-content:center;"><i class="fas fa-clipboard-question"></i> Ready to test yourself?</h3>
        <p style="color:var(--study-text-secondary);margin-bottom:1.2rem;">${latestSet.quiz.length} questions from "${escapeHtml(latestSet.title)}"</p>
        <button class="btn-primary" id="startQuizBtn"><i class="fas fa-play"></i> Start Quiz</button>
      </div>
    `;
    $('startQuizBtn').addEventListener('click', () => startQuiz(latestSet.quiz));
  }

  function startQuiz(questions) {
    quizState = { questions, index: 0, answers: [], topicResults: {} };
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    const { questions, index } = quizState;
    const q = questions[index];
    const area = $('quizArea');
    area.innerHTML = `
      <div class="quiz-progress-track"><div class="quiz-progress-fill" style="width:${(index / questions.length) * 100}%;"></div></div>
      <div class="quiz-question-card">
        <div class="quiz-question-topic">${escapeHtml(q.topic || '')} · Question ${index + 1} of ${questions.length}</div>
        <div class="quiz-question-text">${escapeHtml(q.question)}</div>
        <div id="quizOptions">
          ${q.options.map((opt, i) => `
            <div class="quiz-option" data-index="${i}">
              <span class="quiz-option-letter">${String.fromCharCode(65 + i)}</span>
              <span>${escapeHtml(opt)}</span>
            </div>`).join('')}
        </div>
        <div id="quizExplanation"></div>
        <div class="quiz-nav">
          <span></span>
          <button class="btn-primary" id="quizNextBtn" style="display:none;">${index === questions.length - 1 ? 'See Results' : 'Next Question'}</button>
        </div>
      </div>
    `;
    document.querySelectorAll('.quiz-option').forEach(opt => {
      opt.addEventListener('click', () => selectAnswer(parseInt(opt.dataset.index, 10)));
    });
  }

  function selectAnswer(selectedIndex) {
    const { questions, index } = quizState;
    const q = questions[index];
    if (quizState.answers[index] !== undefined) return; // already answered
    quizState.answers[index] = selectedIndex;

    document.querySelectorAll('.quiz-option').forEach((opt, i) => {
      opt.classList.add(i === selectedIndex ? 'selected' : '');
      if (i === q.correctIndex) opt.classList.add('correct');
      else if (i === selectedIndex) opt.classList.add('incorrect');
    });
    $('quizExplanation').innerHTML = `<div class="quiz-explanation"><strong>${selectedIndex === q.correctIndex ? 'Correct!' : 'Not quite.'}</strong> ${escapeHtml(q.explanation || '')}</div>`;
    $('quizNextBtn').style.display = 'inline-flex';

    const topic = q.topic || 'General';
    if (!quizState.topicResults[topic]) quizState.topicResults[topic] = { correct: 0, total: 0 };
    quizState.topicResults[topic].total++;
    if (selectedIndex === q.correctIndex) quizState.topicResults[topic].correct++;

    $('quizNextBtn').onclick = () => {
      if (index === questions.length - 1) finishQuiz();
      else { quizState.index++; renderQuizQuestion(); }
    };
  }

  async function finishQuiz() {
    const { questions, answers, topicResults } = quizState;
    const correctCount = questions.filter((q, i) => answers[i] === q.correctIndex).length;
    const scorePct = Math.round((correctCount / questions.length) * 100);

    for (const [topic, result] of Object.entries(topicResults)) {
      await updateTopicMastery(activeSubjectId, topic, result.correct, result.total);
    }

    $('quizArea').innerHTML = `
      <div class="quiz-results">
        <div class="quiz-score-ring" style="background:conic-gradient(${masteryColor(scorePct)} ${scorePct * 3.6}deg, var(--study-border) 0deg);">
          <div style="width:104px;height:104px;border-radius:50%;background:var(--study-surface);display:flex;align-items:center;justify-content:center;">${scorePct}%</div>
        </div>
        <h2>${correctCount} / ${questions.length} correct</h2>
        <p>Your topic mastery has been updated.</p>
        <button class="btn-primary" id="retakeQuizBtn"><i class="fas fa-redo"></i> Back to Overview</button>
        <div id="quizReviewList" style="margin-top:2rem;"></div>
      </div>
    `;
    $('quizReviewList').innerHTML = questions.map((q, i) => `
      <div class="quiz-review-item">
        <div class="quiz-review-q">${i + 1}. ${escapeHtml(q.question)} ${answers[i] === q.correctIndex ? '✅' : '❌'}</div>
        <div style="font-size:0.82rem;color:var(--study-text-secondary);">Correct answer: ${escapeHtml(q.options[q.correctIndex])}${answers[i] !== q.correctIndex ? ' · Your answer: ' + escapeHtml(q.options[answers[i]] ?? '(skipped)') : ''}</div>
      </div>
    `).join('');
    $('retakeQuizBtn').addEventListener('click', () => switchTab('overview'));
    renderDashboard();
  }

  // =========================================================================
  // History Drawer
  // =========================================================================
  function renderHistoryList() {
    const list = $('historyList');
    const ids = Object.keys(studySets).sort((a, b) => (studySets[b].createdAt || 0) - (studySets[a].createdAt || 0));
    if (ids.length === 0) {
      list.innerHTML = `<div class="empty-state"><i class='bx bx-folder-open'></i><p>No study sets yet</p></div>`;
      return;
    }
    list.innerHTML = ids.map(id => {
      const s = studySets[id];
      return `<div class="history-item" data-subject="${s.subjectId}">
        <div class="history-item-title">${escapeHtml(s.title)}</div>
        <div class="history-item-meta">${(s.flashcards || []).length} cards · ${(s.quiz || []).length} questions</div>
      </div>`;
    }).join('');
    list.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        openSubject(item.dataset.subject);
        closeDrawer();
      });
    });
  }

  function openDrawer() { $('historyDrawer').classList.add('open'); renderHistoryList(); }
  function closeDrawer() { $('historyDrawer').classList.remove('open'); }
  $('historyNavBtn')?.addEventListener('click', openDrawer);
  $('closeDrawerBtn')?.addEventListener('click', closeDrawer);

  // =========================================================================
  // Init
  // =========================================================================
  async function refreshAllData() {
    await loadSubjects();
    await loadStudySets();
    renderDashboard();
  }

  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (!user) {
      $('historyNavBtn').style.display = 'none';
      return;
    }
    $('historyNavBtn').style.display = '';

    if (window.RehablixCenter && typeof window.RehablixCenter.getEffectiveScopeUid === 'function') {
      try { scopeUid = await window.RehablixCenter.getEffectiveScopeUid('study'); }
      catch (err) { scopeUid = user.uid; }
    } else {
      scopeUid = user.uid;
    }
    if (scopeUid === null) {
      showToast('Your access to Study Buddy has been turned off by your center admin.', 'error', 6000);
      return;
    } else if (scopeUid !== user.uid) {
      showToast('Working on your center\'s shared study sets', 'info', 3000);
    }

    await refreshAllData();

    // Coming from Exam Simulator with a subject to focus on
    const params = new URLSearchParams(window.location.search);
    const subjectParam = params.get('subject');
    if (subjectParam && subjects[subjectParam]) {
      openSubject(subjectParam);
      const focusParam = params.get('focus');
      if (focusParam) showToast('Focus on the highlighted weak topics below', 'info', 5000);
    }
  });
});
