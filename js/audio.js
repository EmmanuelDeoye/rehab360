// js/audio.js — Audio Transcription: live recording (with Web Speech API
// live captions) or file upload (Whisper transcription), a careful
// non-hallucinating AI cleanup pass, and local-first persistence so a
// reload/crash/background-tab never loses a recording in progress.

document.addEventListener('DOMContentLoaded', () => {
  const database = firebase.database();

  // =========================================================================
  // CONSTANTS
  // =========================================================================
  const DB_NAME = 'rehablix_audio_db';
  const DB_VERSION = 1;
  const STORE_SESSIONS = 'sessions';
  const STORE_CHUNKS = 'chunks';
  const CHUNK_INTERVAL_MS = 20000; // periodic local backup chunks, for crash-recovery + audio download only
  const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // Whisper's practical file-size ceiling
  const CLEANUP_CHUNK_CHARS = 6000; // split very long transcripts before the AI narrative pass

  const PROFESSIONAL_LABELS = {
    occupational_therapist: 'Occupational Therapist',
    physiotherapist: 'Physiotherapist',
    speech_language_therapist: 'Speech-Language Therapist',
    psychologist: 'Psychologist',
    psychiatrist: 'Psychiatrist',
    rehab_nurse: 'Rehabilitation Nurse',
    general_clinician: 'Clinician'
  };

  // =========================================================================
  // DOM REFS
  // =========================================================================
  const $ = (id) => document.getElementById(id);

  const resumeBanner = $('resumeBanner');
  const resumeBannerText = $('resumeBannerText');
  const resumeSessionBtn = $('resumeSessionBtn');
  const discardSessionBtn = $('discardSessionBtn');

  const stageSetup = $('stageSetup');
  const stageRecord = $('stageRecord');
  const stageProcessing = $('stageProcessing');
  const stageResult = $('stageResult');
  const progressSteps = document.querySelectorAll('.progress-step');

  const sessionTitleInput = $('sessionTitle');
  const sessionTypeSelect = $('sessionType');
  const professionalSelect = $('professionalType');
  const sourceModeTabs = $('sourceModeTabs');
  const liveSetupPanel = $('liveSetupPanel');
  const uploadSetupPanel = $('uploadSetupPanel');
  const startSetupBtn = $('startSetupBtn');

  const uploadDropzone = $('uploadDropzone');
  const audioFileInput = $('audioFileInput');
  const uploadFileInfo = $('uploadFileInfo');
  const transcribeUploadBtn = $('transcribeUploadBtn');

  const recIndicator = $('recIndicator');
  const recStatusText = $('recStatusText');
  const recTimer = $('recTimer');
  const waveformCanvas = $('waveformCanvas');
  const pauseResumeBtn = $('pauseResumeBtn');
  const stopRecordingBtn = $('stopRecordingBtn');
  const liveTranscriptText = $('liveTranscriptText');

  const processingTitle = $('processingTitle');
  const processingStatus = $('processingStatus');
  const processingProgressFill = $('processingProgressFill');

  const resultTitle = $('resultTitle');
  const resultMeta = $('resultMeta');
  const newSessionBtn = $('newSessionBtn');
  const viewCleanedBtn = $('viewCleanedBtn');
  const viewRawBtn = $('viewRawBtn');
  const transcriptTextarea = $('transcriptTextarea');
  const copyTranscriptBtn = $('copyTranscriptBtn');
  const downloadTranscriptBtn = $('downloadTranscriptBtn');
  const downloadAudioBtn = $('downloadAudioBtn');
  const saveTranscriptBtn = $('saveTranscriptBtn');

  const toggleHistoryBtn = $('toggleHistoryBtn');
  const historyDrawer = $('historyDrawer');
  const closeDrawerBtn = $('closeDrawerBtn');
  const historyList = $('historyList');

  // =========================================================================
  // STATE
  // =========================================================================
  let currentUser = null;
  let scopeUid = null; // center owner's uid for center members, own uid otherwise
  let aiConfig = { token: null, endpoint: null, model: 'openai/gpt-4.1' };
  let idb = null;

  let sourceMode = 'live'; // 'live' | 'upload'
  let localSessionId = null;
  let sessionMeta = null; // { title, sessionType, sourceType, startedAt, pausedAccumMs, mimeType }
  let mediaStream = null;
  let mediaRecorder = null;
  let chunkIndex = 0;
  let isPaused = false;
  let timerInterval = null;
  let pauseStartedAt = null;
  let wakeLockSentinel = null;
  let rawSegments = []; // ordered array of finalized speech-recognition segments (or one Whisper fallback segment)
  let cleanedTranscript = '';
  let audioContext = null, analyser = null, waveformRAF = null;
  let uploadedFile = null;
  let firebaseAudioId = null; // once saved, the history record's key
  let currentView = 'cleaned';
  let recordedMimeType = 'audio/webm';
  let interimEl = null; // trailing <span> showing not-yet-final speech recognition text
  let hasReceivedAnyResult = false; // did recognition produce anything this session?
  let noResultWatchdog = null;

  // =========================================================================
  // TOAST (self-contained, matches the rest of the app's look)
  // =========================================================================
  function showToast(message, type = 'success', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = 'background:var(--surface,#222);color:var(--text-primary,#fff);padding:0.7rem 1.1rem;border-radius:0.6rem;margin-top:0.5rem;box-shadow:0 6px 20px rgba(0,0,0,0.2);font-size:0.85rem;border-left:4px solid ' +
      (type === 'error' ? '#ef4444' : type === 'info' ? '#3b82f6' : '#22c55e');
    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }

  // =========================================================================
  // INDEXEDDB — local-first persistence so nothing is lost on reload/crash
  // =========================================================================
  function openIDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { idb = request.result; resolve(idb); };
      request.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE_SESSIONS)) d.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(STORE_CHUNKS)) d.createObjectStore(STORE_CHUNKS, { keyPath: 'key' });
      };
    });
  }

  async function idbPutSession(session) {
    if (!idb) await openIDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_SESSIONS], 'readwrite');
      tx.objectStore(STORE_SESSIONS).put(session);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbGetSession(id) {
    if (!idb) await openIDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_SESSIONS], 'readonly');
      const req = tx.objectStore(STORE_SESSIONS).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGetAllSessions() {
    if (!idb) await openIDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_SESSIONS], 'readonly');
      const req = tx.objectStore(STORE_SESSIONS).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbDeleteSession(id) {
    if (!idb) await openIDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_SESSIONS], 'readwrite');
      tx.objectStore(STORE_SESSIONS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbPutChunk(sessionId, index, blob) {
    if (!idb) await openIDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_CHUNKS], 'readwrite');
      tx.objectStore(STORE_CHUNKS).put({ key: `${sessionId}_${index}`, sessionId, index, blob });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbGetChunksForSession(sessionId) {
    if (!idb) await openIDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_CHUNKS], 'readonly');
      const req = tx.objectStore(STORE_CHUNKS).getAll();
      req.onsuccess = () => {
        const all = (req.result || []).filter(c => c.sessionId === sessionId);
        all.sort((a, b) => a.index - b.index);
        resolve(all);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function idbDeleteChunksForSession(sessionId) {
    const chunks = await idbGetChunksForSession(sessionId);
    if (!idb) await openIDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction([STORE_CHUNKS], 'readwrite');
      const store = tx.objectStore(STORE_CHUNKS);
      chunks.forEach(c => store.delete(c.key));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function newSessionId() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  // =========================================================================
  // STAGE SWITCHING
  // =========================================================================
  function setStage(n) {
    [stageSetup, stageRecord, stageProcessing, stageResult].forEach(s => s.classList.remove('active'));
    [stageSetup, stageRecord, stageProcessing, stageResult][n - 1].classList.add('active');
    progressSteps.forEach(step => {
      const stepNum = parseInt(step.dataset.step, 10);
      step.classList.toggle('active', stepNum === Math.min(n, 3));
      step.classList.toggle('completed', stepNum < n);
    });
  }

  // =========================================================================
  // SOURCE MODE TABS (Record Live vs Upload File)
  // =========================================================================
  sourceModeTabs.querySelectorAll('.source-mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      sourceModeTabs.querySelectorAll('.source-mode-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sourceMode = btn.dataset.source;
      liveSetupPanel.style.display = sourceMode === 'live' ? 'block' : 'none';
      uploadSetupPanel.style.display = sourceMode === 'upload' ? 'block' : 'none';
    });
  });

  // =========================================================================
  // UPLOAD FLOW
  // =========================================================================
  uploadDropzone.addEventListener('click', () => audioFileInput.click());
  uploadDropzone.addEventListener('dragover', (e) => { e.preventDefault(); uploadDropzone.classList.add('dragover'); });
  uploadDropzone.addEventListener('dragleave', () => uploadDropzone.classList.remove('dragover'));
  uploadDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadDropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileSelected(e.dataTransfer.files[0]);
  });
  audioFileInput.addEventListener('change', () => {
    if (audioFileInput.files[0]) handleFileSelected(audioFileInput.files[0]);
  });

  function handleFileSelected(file) {
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|webm|ogg|aac|flac)$/i.test(file.name)) {
      showToast('Please choose an audio file', 'error');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      showToast('That file is over 25MB. Please trim it or split it into shorter clips.', 'error', 5000);
      return;
    }
    uploadedFile = file;
    uploadFileInfo.style.display = 'flex';
    uploadFileInfo.innerHTML = `<i class="fas fa-file-audio"></i> ${escapeHtml(file.name)} (${(file.size / 1024 / 1024).toFixed(1)}MB)`;
    transcribeUploadBtn.disabled = false;
  }

  transcribeUploadBtn.addEventListener('click', async () => {
    if (!uploadedFile || !currentUser) return;
    if (scopeUid === null) { showToast('Your access to Audio Transcription has been turned off by your center admin.', 'error', 6000); return; }

    localSessionId = newSessionId();
    sessionMeta = {
      id: localSessionId,
      title: sessionTitleInput.value.trim() || defaultTitle(),
      sessionType: sessionTypeSelect.value,
      professional: professionalSelect.value,
      sourceType: 'upload',
      status: 'transcribing',
      startedAt: new Date().toISOString(),
      elapsedSeconds: 0,
      rawSegments: [],
      cleanedTranscript: '',
      mimeType: uploadedFile.type || 'audio/mpeg'
    };
    await idbPutSession(sessionMeta);

    setStage(3);
    showProcessing('Transcribing your file…', 'This can take a moment for longer recordings.', 10);

    try {
      const text = await transcribeBlob(uploadedFile);
      rawSegments = [text || ''];
      sessionMeta.rawSegments = rawSegments;
      await idbPutSession(sessionMeta);
      await finalizeSession();
    } catch (err) {
      console.error(err);
      showToast('Transcription failed: ' + err.message, 'error', 5000);
      setStage(1);
    }
  });

  // =========================================================================
  // LIVE RECORDING FLOW
  // =========================================================================
  startSetupBtn.addEventListener('click', startNewRecording);

  async function startNewRecording() {
    if (!currentUser) { showToast('Please log in first', 'error'); return; }
    if (scopeUid === null) { showToast('Your access to Audio Transcription has been turned off by your center admin.', 'error', 6000); return; }

    if (!window.isSecureContext) {
      showToast('Microphone access needs a secure connection (https://). This page must be opened via your website URL, not a local file.', 'error', 7000);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('This browser doesn\'t support microphone recording. Please try an up-to-date Chrome, Safari, or Firefox.', 'error', 6000);
      return;
    }

    localSessionId = newSessionId();
    chunkIndex = 0;
    rawSegments = [];
    isPaused = false;
    interimEl = null;
    hasReceivedAnyResult = false;

    // On phones, the OS/browser's own speech-recognition engine and our
    // getUserMedia backup recorder both want the microphone, and — unlike
    // desktop Chrome, which happily shares it between the two — mobile
    // devices often only deliver real audio to whichever claims it first.
    // Starting recognition here, before opening our own stream below,
    // gives it first claim.
    if (SpeechRecognitionAPI) {
      startLiveTranscription();
      await new Promise(resolve => setTimeout(resolve, 250));
    } else {
      showToast('Live captions aren\'t supported in this browser — your words will be transcribed once you tap Stop.', 'info', 6000);
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('getUserMedia failed:', err.name, err.message);
      const messages = {
        NotAllowedError: 'Microphone permission was denied for this site. Check your browser\'s site settings (not just the app-level OS permission) and allow microphone access for rehablix, then reload.',
        PermissionDeniedError: 'Microphone permission was denied for this site. Check your browser\'s site settings and allow microphone access for rehablix, then reload.',
        NotFoundError: 'No microphone was found on this device.',
        NotReadableError: 'Your microphone is being used by another app. Close other apps using it and try again.',
        OverconstrainedError: 'No microphone matches the requested settings.',
        SecurityError: 'Microphone access was blocked for security reasons on this page.'
      };
      showToast(messages[err.name] || `Couldn't access the microphone (${err.name || 'unknown error'}). Please check your browser's site permissions.`, 'error', 7000);
      stopLiveTranscription();
      return;
    }

    recordedMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
      : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
      : '';

    sessionMeta = {
      id: localSessionId,
      title: sessionTitleInput.value.trim() || defaultTitle(),
      sessionType: sessionTypeSelect.value,
      professional: professionalSelect.value,
      sourceType: 'live',
      status: 'recording',
      startedAt: new Date().toISOString(),
      elapsedSeconds: 0,
      rawSegments: [],
      cleanedTranscript: '',
      mimeType: recordedMimeType || 'audio/webm'
    };
    await idbPutSession(sessionMeta);

    beginRecorder();
  }

  function beginRecorder() {
    // A single continuous recorder, purely for local crash-recovery backup
    // and the optional audio download — NOT for transcription. (Live text
    // comes from the Web Speech API below; if that's unavailable, the whole
    // assembled recording is sent to Whisper once, after Stop, since a
    // complete file is always safely decodable — unlike individual
    // timesliced fragments, which only the first of would have a valid
    // container header.)
    mediaRecorder = recordedMimeType
      ? new MediaRecorder(mediaStream, { mimeType: recordedMimeType })
      : new MediaRecorder(mediaStream);

    mediaRecorder.ondataavailable = async (e) => {
      if (!e.data || e.data.size === 0) return;
      const idx = chunkIndex++;
      await idbPutChunk(localSessionId, idx, e.data);
    };

    mediaRecorder.onstop = () => {
      if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
      releaseWakeLock();
    };

    mediaRecorder.start(CHUNK_INTERVAL_MS);
    requestWakeLock();
    setupWaveform();
    startTimer();
    startLiveTranscription();

    recIndicator.classList.remove('paused');
    recStatusText.textContent = 'Recording';
    pauseResumeBtn.innerHTML = '<i class="fas fa-pause"></i>';
    pauseResumeBtn.setAttribute('aria-label', 'Pause recording');
    liveTranscriptText.innerHTML = '<span class="transcript-placeholder">Your words will appear here as you speak…</span>';

    setStage(2);
    showToast('Recording started — you can switch tabs, it keeps going.', 'info', 3500);
  }

  pauseResumeBtn.addEventListener('click', async () => {
    if (!mediaRecorder) return;
    if (isPaused) {
      isPaused = false;
      recIndicator.classList.remove('paused');
      recStatusText.textContent = 'Recording';
      pauseResumeBtn.innerHTML = '<i class="fas fa-pause"></i>';
      pauseResumeBtn.setAttribute('aria-label', 'Pause recording');
      if (pauseStartedAt) {
        sessionMeta.pausedAccumMs = (sessionMeta.pausedAccumMs || 0) + (Date.now() - pauseStartedAt);
        pauseStartedAt = null;
      }
      startTimer();
      requestWakeLock();
      if (mediaRecorder.state === 'paused') mediaRecorder.resume();
      startLiveTranscription();
    } else {
      isPaused = true;
      pauseStartedAt = Date.now();
      recIndicator.classList.add('paused');
      recStatusText.textContent = 'Paused';
      pauseResumeBtn.innerHTML = '<i class="fas fa-play"></i>';
      pauseResumeBtn.setAttribute('aria-label', 'Resume recording');
      stopTimer();
      sessionMeta.status = 'paused';
      idbPutSession(sessionMeta);
      releaseWakeLock();
      if (mediaRecorder.state === 'recording') mediaRecorder.pause();
      stopLiveTranscription();
    }
  });

  stopRecordingBtn.addEventListener('click', async () => {
    if (!mediaRecorder) return;
    stopTimer();
    stopWaveform();
    stopLiveTranscription();
    sessionMeta.status = 'transcribing';
    await idbPutSession(sessionMeta);

    if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();

    showProcessing('Finishing up transcription…', 'Wrapping up.', 40);
    setStage(3);

    setTimeout(async () => {
      let hasText = rawSegments.some(s => s && s.trim());

      if (!hasText) {
        // Live captions weren't available (or picked nothing up) — fall
        // back to transcribing the whole recording in one Whisper call,
        // the same reliable approach the file-upload flow already uses.
        try {
          updateProcessingProgress(55, 'Transcribing the recording…');
          const chunks = await idbGetChunksForSession(localSessionId);
          if (chunks.length) {
            const fullBlob = new Blob(chunks.map(c => c.blob), { type: sessionMeta.mimeType || 'audio/webm' });
            const text = await transcribeBlob(fullBlob);
            if (text) { rawSegments = [text]; appendLiveTranscript(text); }
          }
        } catch (err) {
          console.error('Fallback transcription failed:', err);
        }
      }

      sessionMeta.rawSegments = rawSegments;
      await idbPutSession(sessionMeta);
      await finalizeSession();
    }, 400);
  });

  // ---- Timer (drift-proof: computed from real timestamps, not just tick count) ----
  function startTimer() {
    stopTimer();
    const baseStartedAt = new Date(sessionMeta.startedAt).getTime();
    timerInterval = setInterval(() => {
      const pausedMs = sessionMeta.pausedAccumMs || 0;
      const elapsedMs = Date.now() - baseStartedAt - pausedMs;
      const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
      sessionMeta.elapsedSeconds = totalSeconds;
      recTimer.textContent = formatTime(totalSeconds);
    }, 500);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  // ---- Waveform visualizer (cosmetic; pauses automatically if tab is hidden) ----
  function setupWaveform() {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(mediaStream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      drawWaveform();
    } catch (err) {
      console.warn('Waveform visualizer unavailable:', err);
    }
  }

  function drawWaveform() {
    if (!analyser || document.hidden) { waveformRAF = requestAnimationFrame(drawWaveform); return; }
    const ctx = waveformCanvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const w = waveformCanvas.width = waveformCanvas.clientWidth;
    const h = waveformCanvas.height;
    ctx.clearRect(0, 0, w, h);
    const barWidth = (w / bufferLength) * 2.5;
    let x = 0;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--audio-accent').trim() || '#7c3aed';
    ctx.fillStyle = accent;
    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * h;
      ctx.fillRect(x, h - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
    waveformRAF = requestAnimationFrame(drawWaveform);
  }

  function stopWaveform() {
    if (waveformRAF) cancelAnimationFrame(waveformRAF);
    waveformRAF = null;
    if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
    analyser = null;
  }

  // ---- Wake Lock: keep the screen on while actively recording, where supported ----
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
      }
    } catch (err) {
      // Not fatal — recording still continues, the screen may just dim/lock.
      console.warn('Wake lock unavailable:', err);
    }
  }

  function releaseWakeLock() {
    if (wakeLockSentinel) {
      wakeLockSentinel.release().catch(() => {});
      wakeLockSentinel = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    // Re-acquire the wake lock if the tab regains visibility mid-recording
    // (the OS releases it automatically when a tab is hidden).
    if (document.visibilityState === 'visible' && mediaRecorder && mediaRecorder.state === 'recording') {
      requestWakeLock();
    }
  });

  // =========================================================================
  // LIVE TRANSCRIPTION (Web Speech API) — same mic-to-text mechanism used
  // by the mic button on ask.html. Runs alongside the recording so text
  // appears as the person talks, rather than waiting on file uploads.
  // =========================================================================
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let recognitionShouldRun = false; // true whenever we're recording and not paused

  if (SpeechRecognitionAPI) {
    recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      hasReceivedAnyResult = true;
      clearTimeout(noResultWatchdog);
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const clean = transcript.trim();
          if (clean) {
            rawSegments.push(clean);
            sessionMeta.rawSegments = rawSegments;
            idbPutSession(sessionMeta); // fire-and-forget autosave of progress
            appendLiveTranscript(clean);
          }
        } else {
          interim += transcript;
        }
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        recognitionShouldRun = false;
        showToast('Microphone permission is needed for live captions.', 'error', 5000);
      }
      // 'no-speech' fires constantly during natural pauses — not an error worth surfacing.
    };

    recognition.onend = () => {
      // Chrome/Safari can end recognition on their own after a stretch of
      // silence, even mid-session — restart it automatically as long as
      // we're still meant to be listening.
      if (recognitionShouldRun) {
        try { recognition.start(); } catch (e) { /* already running */ }
      }
    };
  }

  function startLiveTranscription() {
    if (!recognition) return;
    recognitionShouldRun = true;
    try { recognition.start(); } catch (e) { /* already started */ }

    // On some phones, the browser's speech engine and our own microphone
    // stream both want the mic, and recognition can end up listening to
    // silence without ever erroring — it just never produces a result.
    // If nothing comes through for a while, let the person know the full
    // recording will still be transcribed once they stop, rather than
    // leaving them staring at an apparently-broken box.
    clearTimeout(noResultWatchdog);
    noResultWatchdog = setTimeout(() => {
      if (recognitionShouldRun && !hasReceivedAnyResult) {
        showToast('Live captions aren\'t picking up audio on this device — no problem, the full recording will still be transcribed once you tap Stop.', 'info', 7000);
      }
    }, 15000);
  }

  function stopLiveTranscription() {
    recognitionShouldRun = false;
    clearTimeout(noResultWatchdog);
    if (recognition) { try { recognition.stop(); } catch (e) { /* ignore */ } }
    setInterimTranscript('');
  }

  function setInterimTranscript(text) {
    const placeholder = liveTranscriptText.querySelector('.transcript-placeholder');
    if (text && placeholder) placeholder.remove();
    if (!interimEl || !interimEl.isConnected) {
      interimEl = document.createElement('span');
      interimEl.className = 'transcript-interim';
      liveTranscriptText.appendChild(interimEl);
    }
    const needsSpace = liveTranscriptText.textContent && !liveTranscriptText.textContent.endsWith(' ') && text;
    interimEl.textContent = text ? (needsSpace ? ' ' : '') + text : '';
    liveTranscriptText.scrollTop = liveTranscriptText.scrollHeight;
  }

  function appendLiveTranscript(text) {
    if (!text) return;
    const placeholder = liveTranscriptText.querySelector('.transcript-placeholder');
    if (placeholder) placeholder.remove();
    const span = document.createElement('span');
    span.className = 'transcript-segment';
    const needsSpace = liveTranscriptText.textContent && !liveTranscriptText.textContent.endsWith(' ');
    span.textContent = (needsSpace ? ' ' : '') + text;
    if (interimEl && interimEl.isConnected) {
      liveTranscriptText.insertBefore(span, interimEl);
    } else {
      liveTranscriptText.appendChild(span);
    }
    liveTranscriptText.scrollTop = liveTranscriptText.scrollHeight;
  }

  // =========================================================================
  // WHISPER TRANSCRIPTION (single blob/file -> text)
  // =========================================================================
  async function transcribeBlob(blob) {
    if (!aiConfig.token) await loadAiConfig();
    if (!aiConfig.token) throw new Error('Transcription service is not configured right now.');

    const formData = new FormData();
    const filename = blob.name || `audio.${(blob.type || 'audio/webm').split('/')[1]?.split(';')[0] || 'webm'}`;
    formData.append('file', blob, filename);
    formData.append('model', 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${aiConfig.token}` },
      body: formData
    });

    if (!response.ok) {
      let msg = 'Transcription request failed';
      let errBody = '';
      try { const err = await response.json(); msg = err.error?.message || msg; errBody = JSON.stringify(err); } catch (e) {}
      if (window.reportApiError) {
        window.reportApiError({
          status: response.status,
          bodyText: errBody,
          tool: 'audio',
          context: 'transcribe audio'
        });
      }
      throw new Error(msg);
    }
    const data = await response.json();
    return (data.text || '').trim();
  }

  async function loadAiConfig() {
    try {
      const tokens = await window.fetchTokens();
      if (tokens) {
        aiConfig.token = tokens.token;
        aiConfig.endpoint = tokens.endpoint;
      }
    } catch (err) {
      console.error('Could not load AI config:', err);
    }
  }

  // =========================================================================
  // AI NARRATIVE PASS — turns the raw transcript into a professional
  // session narrative, written from the perspective of the chosen
  // professional's documentation style. Unlike a literal formatter, this
  // may reorganize and paraphrase into flowing prose — but it must never
  // invent facts, observations, or outcomes that weren't actually said.
  // Long transcripts are split into pieces so nothing gets silently
  // truncated by the model.
  // =========================================================================
  function buildNarrativeSystemPrompt(professionalLabel) {
    return `You are helping a ${professionalLabel} turn a raw speech-to-text transcript of a real session into a professional session narrative — the kind of note this ${professionalLabel} would write to document what took place, for the clinical record.

Your job:
1. Write a clear, well-organized narrative, in third person, describing what happened throughout the session — what was discussed, done, observed, or reported, in the order it makes sense as a summary (you do not need to follow the transcript's exact sentence order).
2. Use professional documentation language and terminology appropriate to a ${professionalLabel}, while staying faithful to what was actually said.
3. You may paraphrase, combine related points, and smooth out filler words, false starts, and speech-to-text artifacts — this is expected and different from a verbatim transcript.

You must NOT:
- Invent observations, assessments, measurements, scores, outcomes, diagnoses, or clinical judgments that are not present in the transcript.
- Add details, names, numbers, or events that were not mentioned.
- Fill in gaps with assumptions when the transcript is ambiguous, sparse, or unclear — in that case, just describe plainly what is known and leave it at that.
- Include a title, heading, signature block, or placeholder fields (e.g. "Patient Name: ___").
- Include meta-commentary, disclaimers, or notes about the transcript itself.

Output ONLY the narrative text, as flowing paragraphs.`;
  }

  function splitForCleanup(text) {
    if (text.length <= CLEANUP_CHUNK_CHARS) return [text];
    const pieces = [];
    let remaining = text;
    while (remaining.length > CLEANUP_CHUNK_CHARS) {
      let splitAt = remaining.lastIndexOf('. ', CLEANUP_CHUNK_CHARS);
      if (splitAt < CLEANUP_CHUNK_CHARS * 0.5) splitAt = CLEANUP_CHUNK_CHARS; // no good sentence break found
      pieces.push(remaining.slice(0, splitAt + 1));
      remaining = remaining.slice(splitAt + 1);
    }
    if (remaining.trim()) pieces.push(remaining);
    return pieces;
  }

  async function cleanupTranscript(rawText, professionalKey, onProgress) {
    if (!rawText || !rawText.trim()) return '';
    if (!aiConfig.token) await loadAiConfig();
    if (!aiConfig.token || !aiConfig.endpoint) return rawText; // graceful fallback: show raw text rather than fail entirely

    const professionalLabel = PROFESSIONAL_LABELS[professionalKey] || 'clinician';
    const systemPrompt = buildNarrativeSystemPrompt(professionalLabel);
    const pieces = splitForCleanup(rawText);
    const cleanedPieces = [];

    for (let i = 0; i < pieces.length; i++) {
      if (onProgress) onProgress(i, pieces.length);
      try {
        const url = `${aiConfig.endpoint.replace(/\/$/, '')}/chat/completions`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiConfig.token}` },
          body: JSON.stringify({
            model: aiConfig.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: pieces[i] }
            ],
            max_tokens: 4000,
            temperature: 0.3
          })
        });
        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          if (window.reportApiError) {
            window.reportApiError({
              status: response.status,
              bodyText: errBody,
              tool: 'audio',
              context: 'narrative cleanup pass'
            });
          }
          throw new Error('Narrative request failed');
        }
        const data = await response.json();
        cleanedPieces.push(data.choices?.[0]?.message?.content?.trim() || pieces[i]);
      } catch (err) {
        console.error('Narrative pass failed for a section, keeping raw text for it:', err);
        cleanedPieces.push(pieces[i]); // never lose content — fall back to raw for that piece
      }
    }
    return cleanedPieces.join('\n\n');
  }

  // =========================================================================
  // FINALIZE: run cleanup, save to Firebase history, update local state,
  // show the result screen.
  // =========================================================================
  async function finalizeSession() {
    const rawText = rawSegments.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const professionalKey = sessionMeta.professional || professionalSelect.value;
    const professionalLabel = PROFESSIONAL_LABELS[professionalKey] || 'Clinician';

    showProcessing('Writing the session narrative…', `Summarizing what happened, from a ${professionalLabel}'s documentation perspective.`, 70);
    cleanedTranscript = await cleanupTranscript(rawText, professionalKey, (i, total) => {
      const pct = 70 + Math.round(((i + 1) / total) * 25);
      updateProcessingProgress(pct, `Writing section ${i + 1} of ${total}…`);
    });

    sessionMeta.rawTranscript = rawText;
    sessionMeta.cleanedTranscript = cleanedTranscript;
    sessionMeta.status = 'done';
    await idbPutSession(sessionMeta);

    showProcessing('Saving…', 'Almost done.', 95);
    try {
      const payload = {
        title: sessionMeta.title,
        sessionType: sessionMeta.sessionType,
        professional: professionalKey,
        sourceType: sessionMeta.sourceType,
        createdAt: sessionMeta.startedAt,
        updatedAt: new Date().toISOString(),
        durationSeconds: sessionMeta.elapsedSeconds || 0,
        rawTranscript: rawText,
        cleanedTranscript: cleanedTranscript,
        isPublic: false
      };
      const ref = await database.ref(`history/${scopeUid}/audio`).push(payload);
      firebaseAudioId = ref.key;

      if (window.RehablixCenter) {
        window.RehablixCenter.logActivity('audio', 'Transcribed session', sessionMeta.title).catch(() => {});
      }
    } catch (err) {
      console.error('Could not save transcript to history:', err);
      showToast('Transcript ready, but saving to history failed — your text is still safe below.', 'error', 5000);
    }

    updateProcessingProgress(100, 'Done!');
    setTimeout(() => showResult(), 300);
  }

  function showProcessing(title, status, progressPct) {
    processingTitle.textContent = title;
    processingStatus.textContent = status;
    processingProgressFill.style.width = progressPct + '%';
  }

  function updateProcessingProgress(pct, status) {
    processingProgressFill.style.width = pct + '%';
    if (status) processingStatus.textContent = status;
  }

  function showResult() {
    resultTitle.textContent = sessionMeta.title;
    const dateStr = new Date(sessionMeta.startedAt).toLocaleString();
    const professionalLabel = PROFESSIONAL_LABELS[sessionMeta.professional];
    const metaParts = [capitalize(sessionMeta.sessionType)];
    if (professionalLabel) metaParts.push(professionalLabel);
    metaParts.push(formatTime(sessionMeta.elapsedSeconds || 0), dateStr);
    resultMeta.textContent = metaParts.join(' · ');
    currentView = 'cleaned';
    viewCleanedBtn.classList.add('active');
    viewRawBtn.classList.remove('active');
    transcriptTextarea.value = sessionMeta.cleanedTranscript || sessionMeta.rawTranscript || '';

    downloadAudioBtn.style.display = (sessionMeta.sourceType === 'live' && localSessionId) ? 'inline-flex' : 'none';

    setStage(4);
  }

  viewCleanedBtn.addEventListener('click', () => {
    currentView = 'cleaned';
    viewCleanedBtn.classList.add('active');
    viewRawBtn.classList.remove('active');
    transcriptTextarea.value = sessionMeta.cleanedTranscript || '';
  });

  viewRawBtn.addEventListener('click', () => {
    currentView = 'raw';
    viewRawBtn.classList.add('active');
    viewCleanedBtn.classList.remove('active');
    transcriptTextarea.value = sessionMeta.rawTranscript || '';
  });

  transcriptTextarea.addEventListener('input', () => {
    if (currentView === 'cleaned') sessionMeta.cleanedTranscript = transcriptTextarea.value;
    else sessionMeta.rawTranscript = transcriptTextarea.value;
  });

  copyTranscriptBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(transcriptTextarea.value)
      .then(() => showToast('Copied to clipboard', 'success'))
      .catch(() => showToast('Could not copy', 'error'));
  });

  downloadTranscriptBtn.addEventListener('click', () => {
    const blob = new Blob([transcriptTextarea.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(sessionMeta.title || 'transcript').replace(/[^\w\- ]/g, '')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  downloadAudioBtn.addEventListener('click', async () => {
    try {
      const chunks = await idbGetChunksForSession(localSessionId);
      if (!chunks.length) { showToast('Audio is no longer available locally', 'error'); return; }
      const blob = new Blob(chunks.map(c => c.blob), { type: sessionMeta.mimeType || 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(sessionMeta.title || 'recording').replace(/[^\w\- ]/g, '')}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast('Could not prepare audio download', 'error');
    }
  });

  saveTranscriptBtn.addEventListener('click', async () => {
    if (!firebaseAudioId) { showToast('Nothing to save yet', 'error'); return; }
    try {
      await database.ref(`history/${scopeUid}/audio/${firebaseAudioId}`).update({
        cleanedTranscript: sessionMeta.cleanedTranscript,
        rawTranscript: sessionMeta.rawTranscript,
        title: sessionMeta.title,
        updatedAt: new Date().toISOString()
      });
      showToast('Saved', 'success');
      if (window.RehablixCenter) {
        window.RehablixCenter.logActivity('audio', 'Edited transcript', sessionMeta.title).catch(() => {});
      }
      // Local copy no longer needs to be kept once safely saved.
      if (localSessionId) {
        await idbDeleteChunksForSession(localSessionId);
        await idbDeleteSession(localSessionId);
      }
      loadHistory();
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
    }
  });

  newSessionBtn.addEventListener('click', resetToSetup);

  function resetToSetup() {
    localSessionId = null;
    sessionMeta = null;
    rawSegments = [];
    cleanedTranscript = '';
    uploadedFile = null;
    firebaseAudioId = null;
    chunkIndex = 0;
    stopLiveTranscription();
    uploadFileInfo.style.display = 'none';
    transcribeUploadBtn.disabled = true;
    audioFileInput.value = '';
    sessionTitleInput.value = '';
    setStage(1);
  }

  // =========================================================================
  // RESUME BANNER — an interrupted session (reload/crash mid-recording)
  // =========================================================================
  async function checkForInterruptedSession() {
    const all = await idbGetAllSessions();
    const interrupted = all.find(s => s.status === 'recording' || s.status === 'paused' || s.status === 'transcribing');
    if (!interrupted) return;

    localSessionId = interrupted.id;
    sessionMeta = interrupted;
    rawSegments = interrupted.rawSegments || [];

    const when = new Date(interrupted.startedAt).toLocaleString();
    resumeBannerText.textContent = `You have an unfinished recording ("${interrupted.title}") from ${when}.`;
    resumeBanner.style.display = 'flex';
  }

  resumeSessionBtn.addEventListener('click', async () => {
    resumeBanner.style.display = 'none';
    showProcessing('Picking up where you left off…', 'Finishing transcription of what was already recorded.', 30);
    setStage(3);
    await finalizeSession();
  });

  discardSessionBtn.addEventListener('click', async () => {
    if (sessionMeta) {
      await idbDeleteChunksForSession(sessionMeta.id);
      await idbDeleteSession(sessionMeta.id);
    }
    resumeBanner.style.display = 'none';
    resetToSetup();
    showToast('Discarded', 'info');
  });

  // Warn before leaving mid-recording — browsers show their own generic text.
  window.addEventListener('beforeunload', (e) => {
    if (sessionMeta && (sessionMeta.status === 'recording' || sessionMeta.status === 'paused')) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // =========================================================================
  // HISTORY DRAWER
  // =========================================================================
  toggleHistoryBtn.addEventListener('click', () => {
    if (!currentUser) { showToast('Please log in to view history', 'error'); document.getElementById('loginBtn')?.click(); return; }
    loadHistory();
    historyDrawer.classList.add('active');
  });
  closeDrawerBtn.addEventListener('click', () => historyDrawer.classList.remove('active'));

  document.addEventListener('click', (e) => {
    if (historyDrawer.classList.contains('active') &&
        !historyDrawer.contains(e.target) &&
        e.target !== toggleHistoryBtn &&
        !toggleHistoryBtn.contains(e.target)) {
      historyDrawer.classList.remove('active');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && historyDrawer.classList.contains('active')) {
      historyDrawer.classList.remove('active');
    }
  });

  async function loadHistory() {
    if (!scopeUid) return;
    try {
      const snap = await database.ref(`history/${scopeUid}/audio`).limitToLast(50).once('value');
      const val = snap.val() || {};
      const items = Object.keys(val).map(key => ({ key, ...val[key] })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      if (!items.length) {
        historyList.innerHTML = `<div class="empty-state"><i class='bx bx-folder-open'></i><p>No history found</p></div>`;
        return;
      }
      historyList.innerHTML = items.map(item => `
        <div class="audio-history-item" data-key="${item.key}">
          <button class="ahi-delete-btn" data-key="${item.key}" title="Delete"><i class="fas fa-trash-alt"></i></button>
          <div class="ahi-title">${escapeHtml(item.title || 'Untitled')}</div>
          <div class="ahi-meta">${capitalize(item.sessionType || '')} · ${formatTime(item.durationSeconds || 0)} · ${new Date(item.createdAt).toLocaleDateString()}</div>
        </div>
      `).join('');

      historyList.querySelectorAll('.audio-history-item').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('.ahi-delete-btn')) return;
          openHistoryItem(el.dataset.key, val[el.dataset.key]);
        });
      });
      historyList.querySelectorAll('.ahi-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => deleteHistoryItem(btn.dataset.key, e));
      });
    } catch (err) {
      console.error('Could not load history:', err);
    }
  }

  async function deleteHistoryItem(key, event) {
    event.stopPropagation();
    if (!scopeUid) return;
    if (!confirm('Delete this transcription? This cannot be undone.')) return;
    try {
      await database.ref(`history/${scopeUid}/audio/${key}`).remove();
      if (firebaseAudioId === key) firebaseAudioId = null;
      showToast('Transcription deleted', 'success');
      loadHistory();
    } catch (err) {
      console.error('Could not delete history item:', err);
      showToast('Failed to delete', 'error');
    }
  }

  function openHistoryItem(key, data) {
    firebaseAudioId = key;
    localSessionId = null; // no local audio for a re-opened saved item
    sessionMeta = {
      title: data.title,
      sessionType: data.sessionType,
      professional: data.professional,
      sourceType: data.sourceType,
      startedAt: data.createdAt,
      elapsedSeconds: data.durationSeconds,
      rawTranscript: data.rawTranscript,
      cleanedTranscript: data.cleanedTranscript
    };
    downloadAudioBtn.style.display = 'none';
    historyDrawer.classList.remove('active');
    showResult();
  }

  // =========================================================================
  // HELPERS
  // =========================================================================
  function defaultTitle() {
    const typeLabel = capitalize(sessionTypeSelect.value);
    return `${typeLabel} – ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // =========================================================================
  // AUTH + SCOPE RESOLUTION + INIT
  // =========================================================================
  firebase.auth().onAuthStateChanged(async (user) => {
    currentUser = user;
    if (!user) {
      toggleHistoryBtn.style.display = 'none';
      return;
    }

    if (window.RehablixCenter && typeof window.RehablixCenter.getEffectiveScopeUid === 'function') {
      try { scopeUid = await window.RehablixCenter.getEffectiveScopeUid('audio'); }
      catch (err) { scopeUid = user.uid; }
    } else {
      scopeUid = user.uid;
    }

    if (scopeUid === null) {
      showToast('Your access to Audio Transcription has been turned off by your center admin.', 'error', 6000);
    } else if (scopeUid !== user.uid) {
      showToast('Working on your center\'s shared transcripts', 'info', 3000);
    }

    toggleHistoryBtn.style.display = 'block';
    await loadAiConfig();
    loadHistory();
  });

  openIDB().then(checkForInterruptedSession).catch(err => console.warn('IndexedDB unavailable:', err));
});
