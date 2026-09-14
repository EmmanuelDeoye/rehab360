// js/gait.js – Complete with patient name, search, modal, brightness check, auto-scroll, and subscription gating
document.addEventListener('DOMContentLoaded', async () => {
  // =========================================================================
  // 1. DOM ELEMENTS
  // =========================================================================
  // Stages
  const stageRecord = document.getElementById('stageRecord');
  const stageAnalyze = document.getElementById('stageAnalyze');
  const stageResults = document.getElementById('stageResults');
  const steps = document.querySelectorAll('.step');
  
  // Camera elements
  const gaitCameraPreview = document.getElementById('gaitCameraPreview');
  const gaitCameraPlaceholder = document.getElementById('gaitCameraPlaceholder');
  const gaitStartCameraBtn = document.getElementById('gaitStartCameraBtn');
  const recordBtn = document.getElementById('recordBtn');
  const recordingTimer = document.getElementById('recordingTimer');
  const timerDisplay = document.getElementById('timerDisplay');
  const videoPreview = document.getElementById('videoPreview');
  const recordedVideo = document.getElementById('recordedVideo');
  const reRecordBtn = document.getElementById('reRecordBtn');
  const proceedBtn = document.getElementById('gaitProceedToAnalysisBtn');
  const gaitViewSelect = document.getElementById('gaitViewSelect');
  const gaitNotes = document.getElementById('gaitNotes');
  const patientNameInput = document.getElementById('patientName');
  
  // Analysis elements
  const analysisStatus = document.getElementById('analysisStatus');
  const progressBar = document.getElementById('analysisProgressBar');
  
  // Results elements (kept for compatibility but hidden)
  const gaitResultsContent = document.getElementById('gaitResultsContent');
  const resultDate = document.getElementById('resultDate');
  const downloadGaitReport = document.getElementById('downloadGaitReport');
  const newGaitBtn = document.getElementById('newGaitBtn');
  
  // History drawer elements
  const historyDrawer = document.getElementById('historyDrawer');
  const toggleHistoryBtn = document.getElementById('toggleHistoryBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const gaitHistoryList = document.getElementById('gaitHistoryList');
  const gaitHistorySearchInput = document.getElementById('gaitHistorySearchInput');
  
  // Toast container
  let toastContainer = document.getElementById('toast-container');
  
  // =========================================================================
  // 2. STATE VARIABLES
  // =========================================================================
  let stream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordedVideoURL = null;
  let recordingStartTime = null;
  let timerInterval = null;
  let maxRecordTimeout = null;
  let aiConfig = { token: null, endpoint: 'https://api.openai.com/v1', model: 'gpt-4.1' };
  let currentUser = null;
  let scopeUid = null; // center owner's uid for center members, so gait history is shared
  let analysisResults = null;
  let isCameraActive = false;
  let isRecording = false;
  let videoBlob = null;
  let allHistoryEntries = [];
  
  // Plan gating state
  let currentPlan = 'free';  // 'free' | 'student' | 'pro'
  let generationCount = 0;
  let generationResetDate = null;
  
  const database = firebase.database();
  
  // IndexedDB setup
  const DB_NAME = 'GaitMonitorDB';
  const STORE_NAME = 'videos';
  let db = null;
  
  // Plan limits
  const FREE_MONTHLY_LIMIT = 3;
  const STUDENT_MONTHLY_LIMIT = 10;
  const LIMIT_DAYS = 30;
  
  // =========================================================================
  // 3. UTILITY FUNCTIONS
  // =========================================================================
  function ensureToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }
  
  function showToast(message, type = 'success', duration = 3500) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
  
  async function fetchTokens() {
    try {
      const snapshot = await database.ref('tokens/open_ai').once('value');
      const data = snapshot.val();
      if (data && data.api_key) {
        aiConfig.token = data.api_key;
        aiConfig.endpoint = 'https://api.openai.com/v1';
        console.log('AI tokens loaded');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Token fetch error:', error);
      return false;
    }
  }
  
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }
  
  // =========================================================================
  // 4. INDEXEDDB FOR VIDEO PERSISTENCE (only for Student/Pro plans)
  // =========================================================================
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }
  
  async function saveVideoToStorage(blob) {
    // Free users do not persist videos
    if (currentPlan === 'free') return;
    
    try {
      if (!db) await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(blob, 'currentVideo');
        request.onsuccess = () => {
          console.log('Video saved to IndexedDB');
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.error('Failed to save video:', err);
    }
  }
  
  async function loadVideoFromStorage() {
    // Free users never restore videos
    if (currentPlan === 'free') return null;
    
    try {
      if (!db) await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get('currentVideo');
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.error('Failed to load video:', err);
      return null;
    }
  }
  
  async function clearVideoFromStorage() {
    try {
      if (!db) await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete('currentVideo');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.error('Failed to clear video:', err);
    }
  }
  
  // =========================================================================
  // 5. STAGE MANAGEMENT
  // =========================================================================
  function setStage(stageNum) {
    [stageRecord, stageAnalyze, stageResults].forEach(s => {
      if (s) s.classList.remove('active');
    });
    
    if (stageNum === 1 && stageRecord) stageRecord.classList.add('active');
    else if (stageNum === 2 && stageAnalyze) stageAnalyze.classList.add('active');
    else if (stageNum === 3 && stageResults) stageResults.classList.add('active');
    
    steps.forEach((step, idx) => {
      step.classList.remove('active', 'completed');
      if (idx < stageNum - 1) step.classList.add('completed');
      if (idx === stageNum - 1) step.classList.add('active');
    });
  }
  
  // =========================================================================
  // 6. VIDEO BRIGHTNESS VALIDATION
  // =========================================================================
  async function checkVideoBrightness(videoBlob, sampleFrames = 3) {
    return new Promise((resolve, reject) => {
      const videoUrl = URL.createObjectURL(videoBlob);
      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      
      video.onloadedmetadata = async () => {
        const duration = video.duration;
        const interval = duration / (sampleFrames + 1);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 320;
        canvas.height = 180;
        
        let totalBrightness = 0;
        let frameCount = 0;
        
        try {
          for (let i = 1; i <= sampleFrames; i++) {
            const time = interval * i;
            await seekTo(video, time);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            let sum = 0;
            let pixelCount = 0;
            
            for (let j = 0; j < data.length; j += 16) {
              sum += 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
              pixelCount++;
            }
            
            const avg = sum / pixelCount;
            totalBrightness += avg;
            frameCount++;
          }
          
          URL.revokeObjectURL(videoUrl);
          const avgBrightness = totalBrightness / frameCount;
          resolve(avgBrightness);
        } catch (err) {
          URL.revokeObjectURL(videoUrl);
          reject(err);
        }
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(videoUrl);
        reject(new Error('Failed to load video for brightness check'));
      };
    });
  }
  
  function seekTo(video, time) {
    return new Promise((resolve) => {
      video.currentTime = time;
      video.onseeked = resolve;
    });
  }
  
  async function validateVideoQuality(videoBlob) {
    try {
      const brightness = await checkVideoBrightness(videoBlob, 3);
      const DARK_THRESHOLD = 40;
      
      if (brightness < DARK_THRESHOLD) {
        return { 
          valid: false, 
          reason: 'Video appears too dark. Please ensure proper lighting and a clear view of the patient.' 
        };
      }
      
      if (brightness < 60) {
        return { 
          valid: true, 
          warning: true, 
          reason: 'Video is somewhat dark. Consider improving lighting for better accuracy.' 
        };
      }
      
      return { valid: true, warning: false };
    } catch (err) {
      console.warn('Brightness check failed:', err);
      return { valid: true, warning: false };
    }
  }
  
  // =========================================================================
  // 7. CAMERA FUNCTIONS
  // =========================================================================
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }, 
        audio: false 
      });
      
      gaitCameraPreview.srcObject = stream;
      gaitCameraPlaceholder.style.display = 'none';
      gaitCameraPreview.style.display = 'block';
      
      const scanOverlay = document.querySelector('.scan-overlay');
      if (scanOverlay) scanOverlay.style.display = 'block';
      
      gaitStartCameraBtn.style.display = 'none';
      recordBtn.disabled = false;
      isCameraActive = true;
      
      showToast('Camera ready - Record patient walking (max 30s)', 'success');
      
      setTimeout(() => {
        gaitCameraPreview.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
      
    } catch (err) {
      console.error('Camera error:', err);
      showToast('Camera access denied or not available', 'error');
      gaitStartCameraBtn.style.display = 'block';
      gaitStartCameraBtn.disabled = false;
    }
  }
  
  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    
    gaitCameraPreview.srcObject = null;
    gaitCameraPreview.style.display = 'none';
    gaitCameraPlaceholder.style.display = 'flex';
    
    const scanOverlay = document.querySelector('.scan-overlay');
    if (scanOverlay) scanOverlay.style.display = 'none';
    
    isCameraActive = false;
    gaitStartCameraBtn.style.display = 'block';
    gaitStartCameraBtn.disabled = false;
    recordBtn.disabled = true;
  }
  
  // =========================================================================
  // 8. RECORDING FUNCTIONS
  // =========================================================================
  function startRecording() {
    if (!stream) return;
    
    recordedChunks = [];
    videoBlob = null;
    
    const options = { mimeType: 'video/webm;codecs=vp9,opus' };
    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
      mediaRecorder = new MediaRecorder(stream);
    }
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
      recordedVideoURL = URL.createObjectURL(videoBlob);
      recordedVideo.src = recordedVideoURL;
      videoPreview.style.display = 'block';
      proceedBtn.disabled = false;
      stopCamera();
      
      // Only persist video for Student and Pro plans
      if (currentPlan !== 'free') {
        await saveVideoToStorage(videoBlob);
      } else {
        await clearVideoFromStorage();
      }
      
      showToast('Recording complete! Ready for analysis.', 'success');
      
      if (maxRecordTimeout) {
        clearTimeout(maxRecordTimeout);
        maxRecordTimeout = null;
      }
    };
    
    mediaRecorder.start();
    isRecording = true;
    
    recordBtn.classList.add('recording');
    recordBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Recording';
    
    recordingTimer.style.display = 'flex';
    recordingStartTime = Date.now();
    
    timerInterval = setInterval(updateTimer, 1000);
    
    maxRecordTimeout = setTimeout(() => {
      if (isRecording) {
        showToast('Maximum recording time (30 seconds) reached', 'info');
        stopRecording();
      }
    }, 30000);
    
    showToast('Recording started - 30s max', 'info');
  }
  
  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      
      recordBtn.classList.remove('recording');
      recordBtn.innerHTML = '<i class="fas fa-circle"></i> Record';
      
      recordingTimer.style.display = 'none';
      clearInterval(timerInterval);
      
      if (maxRecordTimeout) {
        clearTimeout(maxRecordTimeout);
        maxRecordTimeout = null;
      }
    }
  }
  
  function updateTimer() {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const remaining = 30 - elapsed;
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    timerDisplay.textContent = `${mins}:${secs} (max 30s)`;
    
    if (remaining <= 5 && remaining > 0) {
      timerDisplay.style.color = '#dc2626';
    } else {
      timerDisplay.style.color = '';
    }
  }
  
  async function resetRecording() {
    if (recordedVideoURL) {
      URL.revokeObjectURL(recordedVideoURL);
      recordedVideoURL = null;
    }
    recordedVideo.src = '';
    videoBlob = null;
    recordedChunks = [];
    videoPreview.style.display = 'none';
    proceedBtn.disabled = true;
    
    await clearVideoFromStorage();
  }
  
  // =========================================================================
  // 9. RESTORE SAVED VIDEO ON PAGE LOAD (Student/Pro only)
  // =========================================================================
  async function restoreSavedVideo() {
    if (currentPlan === 'free') return;
    
    try {
      const savedBlob = await loadVideoFromStorage();
      if (savedBlob) {
        videoBlob = savedBlob;
        recordedVideoURL = URL.createObjectURL(videoBlob);
        recordedVideo.src = recordedVideoURL;
        videoPreview.style.display = 'block';
        proceedBtn.disabled = false;
        showToast('Previous recording restored', 'info', 2000);
        console.log('Restored saved video from IndexedDB');
      }
    } catch (err) {
      console.warn('Could not restore video:', err);
    }
  }
  
  // =========================================================================
  // 10. AI ANALYSIS
  // =========================================================================
  async function extractVideoFrames(videoBlob, frameCount = 5) {
    return new Promise((resolve, reject) => {
      const videoUrl = URL.createObjectURL(videoBlob);
      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      
      video.onloadedmetadata = async () => {
        const duration = video.duration;
        const interval = duration / (frameCount + 1);
        const frames = [];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = 640;
        canvas.height = 360;
        
        try {
          for (let i = 1; i <= frameCount; i++) {
            const time = interval * i;
            await seekTo(video, time);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            frames.push(dataUrl);
          }
          URL.revokeObjectURL(videoUrl);
          resolve(frames);
        } catch (err) {
          URL.revokeObjectURL(videoUrl);
          reject(err);
        }
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(videoUrl);
        reject(new Error('Failed to load video'));
      };
    });
  }
  
  async function analyzeGait() {
    if (!aiConfig.token) {
      const success = await fetchTokens();
      if (!success) throw new Error('AI service unavailable. Please try again.');
    }
    
    const frames = await extractVideoFrames(videoBlob, 5);
    
    const view = gaitViewSelect.options[gaitViewSelect.selectedIndex].text;
    const notes = gaitNotes.value.trim() || 'No additional notes provided';
    const patientName = patientNameInput.value.trim() || 'Unnamed Patient';
    
    const systemPrompt = `You are rehablix Gait Monitor, a clinical AI specialized in gait analysis for rehabilitation professionals.
Analyze the provided video frames showing patient "${patientName}" walking (${view} view).

Provide a comprehensive clinical gait analysis including:
1. **Observed Gait Pattern** - Identify pattern type (antalgic, Trendelenburg, steppage, etc.)
2. **Key Deviations** - Note abnormalities in:
   - Stride length and cadence
   - Arm swing symmetry
   - Pelvic tilt and rotation
   - Foot clearance and strike pattern
   - Trunk stability
3. **Likely Impairments** - Probable underlying issues based on observed deviations
4. **Clinical Recommendations** - Suggested interventions or further assessments

Format your response with clear headings (## for sections), bullet points for observations, and professional clinical language. Do NOT use tables.`;
    
    const userContent = `Patient: ${patientName}
View: ${view}
Additional Notes: ${notes}

The video frames show the patient walking. Please analyze the gait pattern and provide clinical insights.`;
    
    const messages = [
      { role: "system", content: systemPrompt },
      { 
        role: "user", 
        content: [
          { type: "text", text: userContent },
          ...frames.map(url => ({ type: "image_url", image_url: { url } }))
        ]
      }
    ];
    
    const url = `${aiConfig.endpoint.replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${aiConfig.token}` 
      },
      body: JSON.stringify({ 
        model: aiConfig.model, 
        messages: messages, 
        max_tokens: 2000, 
        temperature: 0.3 
      })
    });
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (window.reportApiError) {
        window.reportApiError({
          status: response.status,
          bodyText: JSON.stringify(err),
          tool: 'gait',
          context: 'analyze gait images'
        });
      }
      throw new Error(err.error?.message || 'API error');
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
  }
  
  async function saveToHistory(result) {
    if (!currentUser) return null;
    
    try {
      const view = gaitViewSelect.options[gaitViewSelect.selectedIndex].text;
      const notes = gaitNotes.value.trim() || '';
      const patientName = patientNameInput.value.trim() || 'Unnamed Patient';
      
      const newRef = await database.ref(`history/${scopeUid}/gaitHistory`).push({
        contentType: 'gait',
        fileName: `Gait - ${patientName}`,
        documentType: 'Gait Analysis',
        request: `Analyze gait pattern from video (${view} view). Notes: ${notes}`,
        results: result,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        date: new Date().toLocaleDateString(),
        patientName: patientName,
        view: view,
        notes: notes
      });
      
      showToast('Analysis saved to history', 'info', 2000);
      if (window.RehablixCenter) {
        window.RehablixCenter.logActivity('rom', 'Saved gait analysis', patientName).catch(() => {});
      }
      return newRef.key;
    } catch (error) {
      console.error('Error saving to history:', error);
      return null;
    }
  }
  
  // =========================================================================
  // 11. PREVIEW MODAL
  // =========================================================================
  function showPreviewModal(result, historyKey) {
    const existingModal = document.querySelector('.preview-modal');
    if (existingModal) existingModal.remove();
    
    const patientName = patientNameInput.value.trim() || 'Unnamed Patient';
    const dateStr = new Date().toLocaleString();
    const view = gaitViewSelect.options[gaitViewSelect.selectedIndex].text;
    
    const modalHtml = `
      <div class="preview-modal">
        <div class="preview-overlay"></div>
        <div class="preview-card">
          <div class="preview-card-header">
            <div class="preview-icon">🚶</div>
            <h3>Gait Analysis Complete</h3>
            <button class="preview-close">&times;</button>
          </div>
          <div class="preview-card-body">
            <div class="preview-info">
              <span class="preview-badge">✅ Ready to view</span>
              <span class="preview-date">${dateStr}</span>
            </div>
            <p class="preview-description">
              Gait analysis for <strong>${escapeHtml(patientName)}</strong> (${escapeHtml(view)}) has been generated successfully.
            </p>
            <div class="preview-actions">
              <button class="preview-btn primary" id="viewFullAnalysisBtn">
                📖 View Full Report
              </button>
              <button class="preview-btn secondary" id="closePreviewBtn">
                Close
              </button>
            </div>
            <div class="preview-note">
              <small>🔒 The full report will open in a new tab with export options.</small>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.querySelector('.preview-modal');
    
    const closeModal = () => modal.remove();
    
    modal.querySelector('.preview-close').addEventListener('click', closeModal);
    modal.querySelector('#closePreviewBtn').addEventListener('click', closeModal);
    modal.querySelector('.preview-overlay').addEventListener('click', closeModal);
    
    modal.querySelector('#viewFullAnalysisBtn').addEventListener('click', () => {
      if (historyKey) {
        window.open(`result.html?type=gait&id=${historyKey}`, '_blank');
        closeModal();
      } else {
        showToast('Error: Analysis ID not found', 'error');
      }
    });
  }
  
  // =========================================================================
  // 12. PLAN GATING - Generation Limits & UI
  // =========================================================================
  function loadGenerationData() {
    try {
      const data = JSON.parse(localStorage.getItem('rehab_gait_gen_data') || '{}');
      generationCount = data.count || 0;
      generationResetDate = data.resetDate ? new Date(data.resetDate) : null;
      
      const now = new Date();
      if (!generationResetDate || (now - generationResetDate) >= (LIMIT_DAYS * 24 * 60 * 60 * 1000)) {
        generationCount = 0;
        generationResetDate = now;
        saveGenerationData();
      }
    } catch (e) {
      generationCount = 0;
      generationResetDate = new Date();
      saveGenerationData();
    }
  }

  function saveGenerationData() {
    const data = {
      count: generationCount,
      resetDate: generationResetDate ? generationResetDate.toISOString() : new Date().toISOString()
    };
    localStorage.setItem('rehab_gait_gen_data', JSON.stringify(data));
  }

  function getMonthlyLimit() {
    if (currentPlan === 'pro') return Infinity;
    if (currentPlan === 'student') return STUDENT_MONTHLY_LIMIT;
    return FREE_MONTHLY_LIMIT;
  }

  function canGenerateMore() {
    if (currentPlan === 'pro') return true;
    
    const limit = getMonthlyLimit();
    const now = new Date();
    
    if (!generationResetDate || (now - generationResetDate) >= (LIMIT_DAYS * 24 * 60 * 60 * 1000)) {
      generationCount = 0;
      generationResetDate = now;
      saveGenerationData();
      return true;
    }
    
    return generationCount < limit;
  }

  function getRemainingGenerations() {
    if (currentPlan === 'pro') return Infinity;
    return Math.max(0, getMonthlyLimit() - generationCount);
  }

  function getDaysUntilReset() {
    if (!generationResetDate) return 0;
    const now = new Date();
    const diffTime = (LIMIT_DAYS * 24 * 60 * 60 * 1000) - (now - generationResetDate);
    return Math.max(0, Math.ceil(diffTime / (24 * 60 * 60 * 1000)));
  }

  function incrementGenerationCount() {
    if (currentPlan === 'pro') return;
    generationCount++;
    saveGenerationData();
    updatePlanUI();
  }

  function goToSubscription() {
    window.location.href = 'sub.html';
  }

  // =========================================================================
  // 13. PLAN UI - Upgrade Notice & Counter
  // =========================================================================
  function updatePlanUI() {
    const existingNotice = document.getElementById('planNotice');
    if (existingNotice) existingNotice.remove();

    if (currentPlan === 'pro') return;

    const notice = document.createElement('div');
    notice.id = 'planNotice';
    
    const remaining = getRemainingGenerations();
    const limit = getMonthlyLimit();
    const daysLeft = getDaysUntilReset();
    const isFree = currentPlan === 'free';
    
    notice.style.cssText = `
      background: ${isFree ? '#fef3c7' : '#e0f2fe'};
      border: 2px solid ${isFree ? '#fbbf24' : '#38bdf8'};
      border-radius: 1rem;
      padding: 0.9rem 1.1rem;
      margin-top: 1rem;
      font-size: 0.85rem;
      text-align: center;
      color: ${isFree ? '#92400e' : '#075985'};
      animation: fadeSlideDown 0.4s ease;
    `;

    const planLabel = isFree ? 'Free Plan' : 'Student Plan';
    const persistenceNote = isFree ? '<div style="font-size: 0.78rem; opacity: 0.8; margin-bottom: 0.3rem;">⚠️ Video will not be saved</div>' : '<div style="font-size: 0.78rem; opacity: 0.8; margin-bottom: 0.3rem;">✅ Video auto-saved</div>';
    
    let remainingHTML = '';
    if (remaining === Infinity) {
      remainingHTML = '<strong>Unlimited</strong>';
    } else if (remaining <= 0) {
      remainingHTML = `<strong style="color: #dc2626;">Limit reached!</strong>`;
    } else {
      remainingHTML = `<strong>${remaining}</strong> remaining`;
    }

    notice.innerHTML = `
      <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.3rem;">${planLabel}</div>
      ${persistenceNote}
      <div style="margin-bottom: 0.3rem;">
        ${remainingHTML} · <strong>${limit}</strong> analyses/month
      </div>
      ${remaining <= 0 ? `<div style="color: #dc2626; font-size: 0.8rem; margin-bottom: 0.4rem;">Resets in <strong>${daysLeft}</strong> days</div>` : 
        daysLeft > 0 ? `<div style="font-size: 0.75rem; opacity: 0.7;">Resets in ${daysLeft} days</div>` : ''}
      <button id="upgradeGaitBtn" style="
        margin-top: 0.5rem;
        padding: 0.5rem 1.5rem;
        border-radius: 2rem;
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: white;
        border: none;
        cursor: pointer;
        font-weight: 600;
        font-size: 0.85rem;
        transition: all 0.2s ease;
        font-family: inherit;
      " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(245,158,11,0.4)';"
         onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none';">
        ⚡ Upgrade Now
      </button>
    `;

    const controlsColumn = document.querySelector('.controls-column');
    if (controlsColumn) {
      const recordControls = controlsColumn.querySelector('.record-controls');
      if (recordControls) {
        controlsColumn.insertBefore(notice, recordControls);
      } else {
        controlsColumn.appendChild(notice);
      }
    }

    const upgradeBtn = document.getElementById('upgradeGaitBtn');
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', goToSubscription);
    }
  }

  // =========================================================================
  // 14. PLAN UPDATE LISTENER
  // =========================================================================
  document.addEventListener('planUpdated', (e) => {
    const newPlan = e.detail?.plan || 'free';
    if (newPlan !== currentPlan) {
      currentPlan = newPlan;
      console.log('[GAIT] Plan updated to:', currentPlan);
      
      loadGenerationData();
      updatePlanUI();
      
      if (currentPlan === 'free') {
        clearVideoFromStorage();
        if (videoPreview.style.display === 'block') {
          resetRecording();
        }
      } else {
        restoreSavedVideo();
      }
    }
  });

  if (window.rehabPlans) {
    currentPlan = window.rehabPlans.getCurrentPlan() || 'free';
    console.log('[GAIT] Initial plan:', currentPlan);
  }

  // =========================================================================
  // 15. EVENT LISTENERS
  // =========================================================================
  gaitStartCameraBtn.addEventListener('click', startCamera);
  
  recordBtn.addEventListener('click', () => {
    if (!isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  });
  
  reRecordBtn.addEventListener('click', async () => {
    await resetRecording();
    startCamera();
  });
  
  proceedBtn.addEventListener('click', async () => {
    if (!videoBlob) {
      showToast('No video recorded', 'error');
      return;
    }
    
    if (!currentUser) {
      showToast('Please login to analyze', 'error');
      const loginBtn = document.getElementById('loginBtn');
      if (loginBtn) loginBtn.click();
      return;
    }
    
    if (!canGenerateMore()) {
      const daysLeft = getDaysUntilReset();
      const limit = getMonthlyLimit();
      showToast(`⚠️ You've reached your ${limit} analysis limit. Upgrade to continue. Resets in ${daysLeft} days.`, 'error', 6000);
      goToSubscription();
      return;
    }
    
    const quality = await validateVideoQuality(videoBlob);
    if (!quality.valid) {
      showToast(quality.reason, 'error', 5000);
      return;
    }
    if (quality.warning) {
      showToast(quality.reason, 'warning', 4000);
    }
    
    setStage(2);
    analysisStatus.textContent = 'Extracting frames from video...';
    progressBar.style.width = '25%';
    
    try {
      analysisStatus.textContent = 'Analyzing gait pattern with AI...';
      progressBar.style.width = '50%';
      
      const result = await analyzeGait();
      
      progressBar.style.width = '100%';
      analysisResults = result;
      
      const historyKey = await saveToHistory(result);
      
      incrementGenerationCount();
      
      await clearVideoFromStorage();
      
      showPreviewModal(result, historyKey);
      
      setStage(1);
      await resetRecording();
      
      gaitStartCameraBtn.style.display = 'block';
      gaitStartCameraBtn.disabled = false;
      recordBtn.disabled = true;
      recordingTimer.style.display = 'none';
      clearInterval(timerInterval);
      isRecording = false;
      recordBtn.classList.remove('recording');
      recordBtn.innerHTML = '<i class="fas fa-circle"></i> Record';
      
      if (maxRecordTimeout) {
        clearTimeout(maxRecordTimeout);
        maxRecordTimeout = null;
      }
      
      showToast('Gait analysis complete! View full report in new tab.', 'success');
      
    } catch (err) {
      console.error('Analysis error:', err);
      let errorMsg = err.message;
      if (errorMsg.includes('token') || errorMsg.includes('API')) {
        errorMsg = 'AI service temporarily unavailable. Please try again.';
      }
      showToast('Analysis failed: ' + errorMsg, 'error');
      setStage(1);
    } finally {
      progressBar.style.width = '0%';
    }
  });
  
  newGaitBtn?.addEventListener('click', async () => {
    await resetRecording();
    setStage(1);
    gaitStartCameraBtn.style.display = 'block';
    gaitStartCameraBtn.disabled = false;
    recordBtn.disabled = true;
    recordingTimer.style.display = 'none';
    clearInterval(timerInterval);
    isRecording = false;
    recordBtn.classList.remove('recording');
    recordBtn.innerHTML = '<i class="fas fa-circle"></i> Record';
    if (maxRecordTimeout) {
      clearTimeout(maxRecordTimeout);
      maxRecordTimeout = null;
    }
  });
  
  downloadGaitReport?.addEventListener('click', async () => {
    if (!analysisResults) {
      showToast('No analysis results to export', 'warning');
      return;
    }
    
    downloadGaitReport.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    
    try {
      const { Document, Packer, Paragraph, HeadingLevel } = docx;
      
      const lines = analysisResults.split('\n');
      const children = [];
      
      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) {
          children.push(new Paragraph({ text: '' }));
        } else if (trimmed.startsWith('# ')) {
          children.push(new Paragraph({ 
            text: trimmed.substring(2), 
            heading: HeadingLevel.HEADING_1 
          }));
        } else if (trimmed.startsWith('## ')) {
          children.push(new Paragraph({ 
            text: trimmed.substring(3), 
            heading: HeadingLevel.HEADING_2 
          }));
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          children.push(new Paragraph({ 
            text: trimmed, 
            bullet: { level: 0 } 
          }));
        } else {
          children.push(new Paragraph({ text: trimmed }));
        }
      });
      
      const patientName = patientNameInput.value.trim() || 'Unnamed Patient';
      const view = gaitViewSelect.options[gaitViewSelect.selectedIndex]?.text || 'N/A';
      
      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({
              text: 'rehablix Gait Analysis Report',
              heading: HeadingLevel.TITLE
            }),
            new Paragraph({
              text: `Patient: ${patientName}`,
              spacing: { after: 100 }
            }),
            new Paragraph({
              text: `Generated: ${new Date().toLocaleString()}`,
              spacing: { after: 100 }
            }),
            new Paragraph({
              text: `View: ${view}`,
              spacing: { after: 300 }
            }),
            new Paragraph({ text: '' }),
            ...children
          ]
        }]
      });
      
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Gait_Analysis_${patientName.replace(/\s+/g, '_')}_${Date.now()}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      
      showToast('Report exported successfully', 'success');
    } catch (err) {
      console.error('Export error:', err);
      showToast('Export failed', 'error');
    } finally {
      downloadGaitReport.innerHTML = '<i class="fas fa-file-pdf"></i> Export Report';
    }
  });
  
  // =========================================================================
  // 16. HISTORY DRAWER WITH SEARCH
  // =========================================================================
  function renderHistory(entries) {
    gaitHistoryList.innerHTML = '';
    
    if (entries.length === 0) {
      gaitHistoryList.innerHTML = '<div class="empty-state"><i class="bx bx-folder-open"></i><p>No matching history found</p></div>';
      return;
    }
    
    entries.forEach(([key, item]) => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <div class="history-info">
          <span class="history-name">${escapeHtml(item.patientName || item.fileName || 'Gait Analysis')}</span>
          <div class="history-meta">
            <span class="meta-tag"><i class="bx bx-walk"></i> Gait</span>
            <span>${escapeHtml(item.date)}</span>
            ${item.view ? `<span>${escapeHtml(item.view)}</span>` : ''}
          </div>
        </div>
        <button class="view-btn" data-key="${key}"><i class="bx bx-chevron-right"></i></button>
      `;
      
      div.querySelector('.view-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(`result.html?type=gait&id=${key}`, '_blank');
      });
      
      div.addEventListener('click', () => {
        window.open(`result.html?type=gait&id=${key}`, '_blank');
      });
      
      gaitHistoryList.appendChild(div);
    });
  }
  
  function filterHistory(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    
    if (!term) {
      renderHistory(allHistoryEntries);
      return;
    }
    
    const filtered = allHistoryEntries.filter(([_, item]) => {
      const name = (item.patientName || item.fileName || '').toLowerCase();
      const view = (item.view || '').toLowerCase();
      return name.includes(term) || view.includes(term);
    });
    
    renderHistory(filtered);
  }
  
  function loadGaitHistory() {
    if (!currentUser) return;
    
    database.ref(`history/${scopeUid}/gaitHistory`)
      .orderByChild('timestamp')
      .on('value', (snapshot) => {
        const data = snapshot.val();
        
        if (!data) {
          allHistoryEntries = [];
          renderHistory([]);
          return;
        }
        
        const entries = Object.entries(data)
          .filter(([_, item]) => item.contentType === 'gait')
          .sort((a, b) => b[1].timestamp - a[1].timestamp);
        
        allHistoryEntries = entries;
        
        const searchTerm = gaitHistorySearchInput ? gaitHistorySearchInput.value : '';
        filterHistory(searchTerm);
      });
  }
  
  function toggleHistoryDrawer() {
    if (!currentUser) {
      showToast('Please login to view history', 'error');
      const loginBtn = document.getElementById('loginBtn');
      if (loginBtn) loginBtn.click();
      return;
    }
    loadGaitHistory();
    historyDrawer.classList.add('active');
  }
  
  if (toggleHistoryBtn) {
    toggleHistoryBtn.addEventListener('click', toggleHistoryDrawer);
  }
  
  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', () => {
      historyDrawer.classList.remove('active');
    });
  }
  
  if (gaitHistorySearchInput) {
    gaitHistorySearchInput.addEventListener('input', (e) => {
      filterHistory(e.target.value);
    });
  }
  
  document.addEventListener('click', (e) => {
    if (historyDrawer && historyDrawer.classList.contains('active') &&
        !historyDrawer.contains(e.target) &&
        e.target !== toggleHistoryBtn &&
        !toggleHistoryBtn?.contains(e.target)) {
      historyDrawer.classList.remove('active');
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && historyDrawer && historyDrawer.classList.contains('active')) {
      historyDrawer.classList.remove('active');
    }
  });
  
  if (patientNameInput) {
    patientNameInput.addEventListener('input', () => {
      gaitStartCameraBtn.disabled = false;
    });
  }
  
  // =========================================================================
  // 17. THEME & INITIALIZATION
  // =========================================================================
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme');
      const newTheme = current === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', newTheme);
      localStorage.setItem('rehab-theme', newTheme);
    });
  }
  
  const savedTheme = localStorage.getItem('rehab-theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  // =========================================================================
  // 18. AUTH STATE LISTENER
  // =========================================================================
  firebase.auth().onAuthStateChanged(async (user) => {
    currentUser = user;
    if (user) {
      console.log('User logged in:', user.email);
      if (window.RehablixCenter && typeof window.RehablixCenter.getEffectiveScopeUid === 'function') {
        try { scopeUid = await window.RehablixCenter.getEffectiveScopeUid('rom'); }
        catch (err) { scopeUid = user.uid; }
      } else {
        scopeUid = user.uid;
      }
      if (scopeUid === null) {
        showToast('Your access to the Motion Analyzer has been turned off by your center admin.', 'error', 6000);
      } else if (scopeUid !== user.uid) {
        showToast('Working on your center\'s shared records', 'info', 3000);
      }
      loadGaitHistory();
      if (toggleHistoryBtn) toggleHistoryBtn.style.display = 'block';
    } else {
      console.log('User logged out');
      if (toggleHistoryBtn) toggleHistoryBtn.style.display = 'none';
    }
  });
  
  // =========================================================================
  // 19. INITIAL SETUP
  // =========================================================================
  async function initialize() {
    ensureToastContainer();
    await openDatabase();
    
    loadGenerationData();
    
    if (currentPlan !== 'free') {
      await restoreSavedVideo();
    }
    
    fetchTokens();
    setStage(1);
    gaitStartCameraBtn.disabled = false;
    
    updatePlanUI();
    
    const scanOverlay = document.querySelector('.scan-overlay');
    if (scanOverlay) {
      scanOverlay.style.display = 'none';
    }
    
    if (toggleHistoryBtn) toggleHistoryBtn.style.display = 'none';
  }
  
  initialize();
  
  window.addEventListener('beforeunload', () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    if (recordedVideoURL) {
      URL.revokeObjectURL(recordedVideoURL);
    }
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    if (maxRecordTimeout) {
      clearTimeout(maxRecordTimeout);
    }
  });
  
  console.log('Gait Monitor initialized with subscription gating');

  // Let the mode-tab switcher stop this camera/recording when the user switches to ROM mode.
  window.__gaitStopCamera = () => { if (isCameraActive) stopCamera(); };
  window.addEventListener('rehablix:modechange', (e) => {
    if (e.detail?.mode !== 'gait' && isCameraActive) stopCamera();
  });
});