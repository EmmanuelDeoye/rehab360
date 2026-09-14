// js/exam.js
// Exam Simulator: generates a timed, AI-written practice exam for a subject
// (shared with Study Buddy), optionally focused on that subject's weakest
// topics, then scores it and writes topic-level results back to the same
// shared `subjects/{uid}/{subjectId}/topics` record that study.js reads
// from and writes to — that shared record is the sync between the two tools.

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

  async function callAI(systemPrompt, userPrompt, maxTokens = 3500) {
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

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ===== Toast =====
  function showToast(message, type = 'success', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.style.cssText = 'background:var(--exam-surface,#fff);border:1px solid var(--exam-border,#e5e7eb);color:var(--exam-text,#111);padding:0.8rem 1.1rem;border-radius:0.7rem;box-shadow:0 8px 24px rgba(0,0,0,0.15);margin-top:0.5rem;font-size:0.85rem;max-width:320px;';
    if (type === 'error') toast.style.borderColor = '#dc2626';
    if (type === 'success') toast.style.borderColor = '#16a34a';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, duration);
  }

  // ===== State =====
  let currentUser = null;
  let scopeUid = null; // center owner's uid for center members, so exam subjects/attempts are shared
  let subjects = {};      // shared with study.js: subjectId -> {name, topics:{...}}
  let attempts = {};      // attemptId -> {subjectId, title, questions, answers, score, topicBreakdown, createdAt}
  let activeSubjectId = null;
  let activeSubjectName = '';
  let currentExam = null; // {title, questions:[{question,options,correctIndex,explanation,topic,difficulty}]}
  let examAnswers = [];
  let examFlags = [];
  let currentQIndex = 0;
  let timerInterval = null;
  let timeRemainingSec = 0;
  let trendChartInstance = null;
  let topicChartInstance = null;

  const $ = (id) => document.getElementById(id);
  const viewSetup = $('viewSetup');
  const viewExam = $('viewExam');
  const viewResults = $('viewResults');
  function showView(view) { [viewSetup, viewExam, viewResults].forEach(v => v.style.display = 'none'); view.style.display = ''; }

  function showLoading(text) { $('loadingText').textContent = text || 'Working…'; $('loadingOverlay').style.display = 'flex'; }
  function hideLoading() { $('loadingOverlay').style.display = 'none'; }

  // =========================================================================
  // Shared subject/topic data (same schema study.js uses)
  // =========================================================================
  async function loadSubjects() {
    if (!currentUser) return;
    const snap = await database.ref(`history/${scopeUid}/subjects`).once('value');
    subjects = snap.val() || {};
  }

  async function loadAttempts() {
    if (!currentUser) return;
    const snap = await database.ref(`history/${scopeUid}/exam/attempts`).once('value');
    attempts = snap.val() || {};
  }

  async function getOrCreateSubject(name) {
    const trimmed = name.trim();
    const existingId = Object.keys(subjects).find(id => (subjects[id].name || '').toLowerCase() === trimmed.toLowerCase());
    if (existingId) return existingId;
    const ref = database.ref(`history/${scopeUid}/subjects`).push();
    await ref.set({ name: trimmed, topics: {}, createdAt: firebase.database.ServerValue.TIMESTAMP });
    subjects[ref.key] = { name: trimmed, topics: {}, createdAt: Date.now() };
    return ref.key;
  }

  async function updateTopicMastery(subjectId, topicName, correct, total) {
    if (!subjectId || !topicName || total === 0) return;
    const topicId = topicName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) || 'general';
    const path = `history/${scopeUid}/subjects/${subjectId}/topics/${topicId}`;
    const snap = await database.ref(path).once('value');
    const existing = snap.val() || { name: topicName, masteryScore: 50, timesReviewed: 0 };
    const newPerformance = (correct / total) * 100;
    const blended = existing.timesReviewed > 0
      ? Math.round(existing.masteryScore * 0.6 + newPerformance * 0.4) // exam results weigh slightly more than a single flashcard grade
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

  function weakTopics(subjectId, threshold = 60) {
    const topics = subjects[subjectId]?.topics || {};
    return Object.entries(topics).filter(([, t]) => (t.masteryScore ?? 100) < threshold).map(([id, t]) => ({ id, ...t }));
  }

  function masteryColor(score) {
    if (score >= 75) return '#16a34a';
    if (score >= 45) return '#d97706';
    return '#dc2626';
  }

  // =========================================================================
  // Setup view
  // =========================================================================
  function populateSubjectDatalist() {
    $('existingSubjectsList').innerHTML = Object.values(subjects).map(s => `<option value="${escapeHtml(s.name)}"></option>`).join('');
  }

  $('subjectInput').addEventListener('input', onSubjectInputChange);
  function onSubjectInputChange() {
    const name = $('subjectInput').value.trim();
    const match = Object.entries(subjects).find(([, s]) => s.name.toLowerCase() === name.toLowerCase());
    const materialGroup = $('topicMaterialGroup');
    const banner = $('weakTopicsBanner');

    if (match) {
      activeSubjectId = match[0];
      materialGroup.style.display = 'none';
      const weak = weakTopics(activeSubjectId);
      if (weak.length > 0) {
        banner.style.display = 'flex';
        $('weakTopicsText').textContent = `Focus on your weak topics: ${weak.map(t => t.name).join(', ')}`;
      } else {
        banner.style.display = 'none';
      }
      renderTrendChart(activeSubjectId);
    } else {
      activeSubjectId = null;
      materialGroup.style.display = name ? '' : 'none';
      banner.style.display = 'none';
      $('pastAttemptsSection').style.display = 'none';
    }
  }

  $('startExamBtn').addEventListener('click', async () => {
    if (!currentUser) { showToast('Please log in to start an exam', 'info'); document.getElementById('loginBtn')?.click(); return; }
    if (window.rehabPlans && !window.rehabPlans.isFeatureAllowed('exam')) {
      window.rehabPlans.showUpgradePrompt('exam');
      return;
    }
    const subjectName = $('subjectInput').value.trim();
    if (!subjectName) { showToast('Please enter a subject', 'warning'); return; }

    const questionCount = Math.min(50, Math.max(5, parseInt($('questionCount').value, 10) || 15));
    const duration = Math.min(180, Math.max(5, parseInt($('durationInput').value, 10) || 20));
    const difficulty = $('difficultySelect').value;
    const focusWeak = $('focusWeakToggle').checked;
    const notes = $('notesInput').value.trim();

    showLoading('Building your exam…');
    try {
      const subjectId = await getOrCreateSubject(subjectName);
      activeSubjectId = subjectId;
      const weak = focusWeak ? weakTopics(subjectId) : [];
      const allTopics = Object.values(subjects[subjectId]?.topics || {}).map(t => t.name);

      const systemPrompt = `You are an exam-writing specialist for rehabilitation/healthcare education. Produce a JSON object with EXACTLY these keys (no markdown, no code fences, no commentary):
{
  "title": "a short exam title",
  "questions": [{"question": "...", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "...", "topic": "short topic name", "difficulty": "easy|moderate|hard"}]
}
Generate exactly ${questionCount} multiple-choice questions at "${difficulty}" difficulty (if "mixed", vary difficulty across questions). Each question must be answerable from general clinical/academic knowledge of the subject unless material is provided below.`;

      let userPrompt = `Subject: ${subjectName}\n`;
      if (weak.length > 0) {
        userPrompt += `\nPrioritize these topics the student is weak on (spend roughly 60% of questions here): ${weak.map(t => t.name).join(', ')}\n`;
      }
      if (allTopics.length > 0) {
        userPrompt += `\nOther known topics in this subject: ${allTopics.join(', ')}\n`;
      }
      if (notes) userPrompt += `\nBase questions on this material where relevant:\n${notes.slice(0, 8000)}\n`;

      const response = await callAI(systemPrompt, userPrompt, 4500);
      const parsed = parseAIJson(response);
      if (!parsed.questions || parsed.questions.length === 0) throw new Error('AI response was missing questions');

      currentExam = parsed;
      activeSubjectName = subjectName;
      examAnswers = new Array(parsed.questions.length).fill(undefined);
      examFlags = new Array(parsed.questions.length).fill(false);
      currentQIndex = 0;
      timeRemainingSec = duration * 60;

      hideLoading();
      $('examTitleSmall').textContent = `${subjectName} — ${parsed.questions.length} questions`;
      showView(viewExam);
      renderPalette();
      renderQuestion();
      startTimer();
    } catch (error) {
      console.error(error);
      hideLoading();
      showToast('Error generating exam: ' + (error.message || 'unknown error'), 'error', 6000);
    }
  });

  // =========================================================================
  // Timer
  // =========================================================================
  function startTimer() {
    clearInterval(timerInterval);
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      timeRemainingSec--;
      updateTimerDisplay();
      if (timeRemainingSec <= 0) {
        clearInterval(timerInterval);
        showToast('Time is up — submitting your exam.', 'warning', 4000);
        submitExam(true);
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const m = Math.floor(timeRemainingSec / 60);
    const s = timeRemainingSec % 60;
    const el = $('examTimer');
    el.innerHTML = `<i class="fas fa-clock"></i> ${m}:${s.toString().padStart(2, '0')}`;
    el.classList.toggle('timer-warning', timeRemainingSec <= 60);
  }

  // =========================================================================
  // Exam-taking UI
  // =========================================================================
  function renderPalette() {
    const palette = $('questionPalette');
    palette.innerHTML = currentExam.questions.map((q, i) => `<button class="palette-btn" data-index="${i}">${i + 1}</button>`).join('');
    palette.querySelectorAll('.palette-btn').forEach(btn => {
      btn.addEventListener('click', () => { currentQIndex = parseInt(btn.dataset.index, 10); renderQuestion(); });
    });
    updatePalette();
  }

  function updatePalette() {
    document.querySelectorAll('.palette-btn').forEach((btn, i) => {
      btn.classList.toggle('current', i === currentQIndex);
      btn.classList.toggle('answered', examAnswers[i] !== undefined);
      btn.classList.toggle('flagged', examFlags[i]);
    });
  }

  function renderQuestion() {
    const q = currentExam.questions[currentQIndex];
    const area = $('questionCardArea');
    area.innerHTML = `
      <div class="question-meta">
        <span class="question-topic-tag">${escapeHtml(q.topic || '')} · Q${currentQIndex + 1} of ${currentExam.questions.length}</span>
        <button class="flag-btn ${examFlags[currentQIndex] ? 'flagged' : ''}" id="flagBtn"><i class="fas fa-flag"></i></button>
      </div>
      <div class="question-text-exam">${escapeHtml(q.question)}</div>
      <div id="examOptions">
        ${q.options.map((opt, i) => `
          <div class="exam-option ${examAnswers[currentQIndex] === i ? 'selected' : ''}" data-index="${i}">
            <span class="exam-option-letter">${String.fromCharCode(65 + i)}</span><span>${escapeHtml(opt)}</span>
          </div>`).join('')}
      </div>
      <div class="exam-nav">
        <button class="btn-secondary" id="prevQBtn" ${currentQIndex === 0 ? 'disabled' : ''}><i class="fas fa-arrow-left"></i> Previous</button>
        <button class="btn-primary" id="nextQBtn">${currentQIndex === currentExam.questions.length - 1 ? 'Finish' : 'Next'} <i class="fas fa-arrow-right"></i></button>
      </div>
    `;
    area.querySelectorAll('.exam-option').forEach(opt => {
      opt.addEventListener('click', () => {
        examAnswers[currentQIndex] = parseInt(opt.dataset.index, 10);
        area.querySelectorAll('.exam-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        updatePalette();
      });
    });
    $('flagBtn').addEventListener('click', () => { examFlags[currentQIndex] = !examFlags[currentQIndex]; updatePalette(); renderQuestion(); });
    $('prevQBtn').addEventListener('click', () => { currentQIndex--; renderQuestion(); });
    $('nextQBtn').addEventListener('click', () => {
      if (currentQIndex === currentExam.questions.length - 1) { attemptSubmit(); return; }
      currentQIndex++; renderQuestion();
    });
    updatePalette();
  }

  function attemptSubmit() {
    const unanswered = examAnswers.filter(a => a === undefined).length;
    if (unanswered > 0) {
      $('confirmModalText').textContent = `You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. Submit anyway?`;
      $('confirmModal').classList.add('show');
    } else {
      submitExam(false);
    }
  }
  $('submitExamBtn').addEventListener('click', attemptSubmit);
  $('confirmCancelBtn').addEventListener('click', () => $('confirmModal').classList.remove('show'));
  $('confirmSubmitBtn').addEventListener('click', () => { $('confirmModal').classList.remove('show'); submitExam(false); });

  // =========================================================================
  // Scoring + results
  // =========================================================================
  async function submitExam(timedOut) {
    clearInterval(timerInterval);
    const questions = currentExam.questions;
    const topicBreakdown = {};
    let correctCount = 0;
    questions.forEach((q, i) => {
      const topic = q.topic || 'General';
      if (!topicBreakdown[topic]) topicBreakdown[topic] = { correct: 0, total: 0 };
      topicBreakdown[topic].total++;
      if (examAnswers[i] === q.correctIndex) { topicBreakdown[topic].correct++; correctCount++; }
    });
    const scorePct = Math.round((correctCount / questions.length) * 100);

    for (const [topic, result] of Object.entries(topicBreakdown)) {
      await updateTopicMastery(activeSubjectId, topic, result.correct, result.total);
    }

    const attemptRef = database.ref(`history/${scopeUid}/exam/attempts`).push();
    const attemptRecord = {
      subjectId: activeSubjectId,
      subjectName: activeSubjectName,
      title: currentExam.title || `${activeSubjectName} Exam`,
      questions,
      answers: examAnswers,
      score: scorePct,
      correctCount,
      totalQuestions: questions.length,
      topicBreakdown,
      timedOut: !!timedOut,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };
    await attemptRef.set(attemptRecord);
    attempts[attemptRef.key] = { ...attemptRecord, createdAt: Date.now() };

    renderResults(attemptRecord);
  }

  function renderResults(attempt) {
    showView(viewResults);
    const score = attempt.score;
    $('scoreRing').style.background = `conic-gradient(${masteryColor(score)} ${score * 3.6}deg, var(--exam-border) 0deg)`;
    $('scoreRingText').textContent = score + '%';
    $('resultsHeadline').textContent = score >= 70 ? 'Great work!' : 'Keep practicing!';
    $('resultsSubtext').textContent = `${attempt.correctCount} of ${attempt.totalQuestions} correct on ${attempt.subjectName}${attempt.timedOut ? ' (time ran out)' : ''}.`;

    const answerList = $('answerReviewList');
    answerList.innerHTML = attempt.questions.map((q, i) => {
      const userAns = attempt.answers[i];
      const isCorrect = userAns === q.correctIndex;
      return `<div class="answer-review-item">
        <div class="answer-review-q">${i + 1}. ${escapeHtml(q.question)} ${isCorrect ? '✅' : '❌'}</div>
        <div class="answer-review-meta">Correct: ${escapeHtml(q.options[q.correctIndex])}${!isCorrect ? ' · Your answer: ' + escapeHtml(q.options[userAns] ?? '(skipped)') : ''}</div>
        <div class="answer-review-explain">${escapeHtml(q.explanation || '')}</div>
      </div>`;
    }).join('');

    renderTopicChart(attempt.topicBreakdown);

    const weak = Object.entries(attempt.topicBreakdown).filter(([, r]) => (r.correct / r.total) < 0.6).map(([t]) => t);
    $('reviewWeakBtn').onclick = () => {
      window.location.href = `study.html?subject=${attempt.subjectId}&focus=${encodeURIComponent(weak.join(','))}`;
    };
  }

  function renderTopicChart(topicBreakdown) {
    const ctx = document.getElementById('topicChart');
    if (!ctx || typeof Chart === 'undefined') return;
    if (topicChartInstance) topicChartInstance.destroy();
    const labels = Object.keys(topicBreakdown);
    const data = labels.map(t => Math.round((topicBreakdown[t].correct / topicBreakdown[t].total) * 100));
    topicChartInstance = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Score %', data, backgroundColor: data.map(masteryColor), borderRadius: 6 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
    });
  }

  function renderTrendChart(subjectId) {
    const relevant = Object.values(attempts).filter(a => a.subjectId === subjectId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const section = $('pastAttemptsSection');
    if (relevant.length === 0) { section.style.display = 'none'; return; }
    section.style.display = '';
    const ctx = document.getElementById('trendChart');
    if (!ctx || typeof Chart === 'undefined') return;
    if (trendChartInstance) trendChartInstance.destroy();
    trendChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: relevant.map((a, i) => `Attempt ${i + 1}`),
        datasets: [{ label: 'Score %', data: relevant.map(a => a.score), borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', fill: true, tension: 0.3 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
    });
  }

  $('newExamBtn').addEventListener('click', () => { showView(viewSetup); $('subjectInput').value = ''; onSubjectInputChange(); });

  // =========================================================================
  // History Drawer
  // =========================================================================
  function renderHistoryList() {
    const list = $('historyList');
    const ids = Object.keys(attempts).sort((a, b) => (attempts[b].createdAt || 0) - (attempts[a].createdAt || 0));
    if (ids.length === 0) { list.innerHTML = `<div class="empty-state"><i class='bx bx-folder-open'></i><p>No exam attempts yet</p></div>`; return; }
    list.innerHTML = ids.map(id => {
      const a = attempts[id];
      return `<div class="history-item" data-id="${id}">
        <div class="history-item-title">${escapeHtml(a.title)}</div>
        <div class="history-item-meta">${a.score}% · ${a.correctCount}/${a.totalQuestions}</div>
      </div>`;
    }).join('');
    list.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => { renderResults(attempts[item.dataset.id]); closeDrawer(); });
    });
  }
  function openDrawer() { $('historyDrawer').classList.add('open'); renderHistoryList(); }
  function closeDrawer() { $('historyDrawer').classList.remove('open'); }
  $('historyNavBtn')?.addEventListener('click', openDrawer);
  $('closeDrawerBtn')?.addEventListener('click', closeDrawer);

  // =========================================================================
  // Init
  // =========================================================================
  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (!user) { $('historyNavBtn').style.display = 'none'; return; }
    $('historyNavBtn').style.display = '';

    if (window.RehablixCenter && typeof window.RehablixCenter.getEffectiveScopeUid === 'function') {
      try { scopeUid = await window.RehablixCenter.getEffectiveScopeUid('exam'); }
      catch (err) { scopeUid = user.uid; }
    } else {
      scopeUid = user.uid;
    }
    if (scopeUid === null) {
      showToast('Your access to Exam Simulator has been turned off by your center admin.', 'error', 6000);
      return;
    } else if (scopeUid !== user.uid) {
      showToast('Working on your center\'s shared subjects', 'info', 3000);
    }

    await loadSubjects();
    await loadAttempts();
    populateSubjectDatalist();

    // Coming from Study Buddy's "Practice Exam" button
    const params = new URLSearchParams(window.location.search);
    const subjectParam = params.get('subject');
    const subjectNameParam = params.get('subjectName');
    if (subjectParam && subjects[subjectParam]) {
      $('subjectInput').value = subjects[subjectParam].name;
      onSubjectInputChange();
    } else if (subjectNameParam) {
      $('subjectInput').value = subjectNameParam;
      onSubjectInputChange();
    }
  });
});
