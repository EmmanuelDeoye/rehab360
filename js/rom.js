// js/rom.js - Complete with preview modal + AI validation + brightness check
document.addEventListener('DOMContentLoaded', async () => {
  // =========================================================================
  // 1. DOM ELEMENTS
  // =========================================================================
  const stageScan = document.getElementById('stageScan');
  const stageAnalyze = document.getElementById('stageAnalyze');
  const stageResults = document.getElementById('stageResults');
  const steps = document.querySelectorAll('.step');
  
  const cameraPreview = document.getElementById('cameraPreview');
  const cameraPlaceholder = document.getElementById('cameraPlaceholder');
  const startCameraBtn = document.getElementById('startCameraBtn');
  const jointSelect = document.getElementById('jointSelect');
  const movementInstruction = document.getElementById('movementInstruction');
  
  const movementPromptBox = document.getElementById('movementPromptBox');
  const currentPrompt = document.getElementById('currentPrompt');
  const promptStep = document.getElementById('promptStep');
  const requiredFramesSpan = document.getElementById('requiredFrames');
  
  const capturePreview = document.getElementById('capturePreview');
  const thumbnailContainer = document.getElementById('thumbnailContainer');
  const frameCountSpan = document.getElementById('frameCount');
  const proceedBtn = document.getElementById('proceedToAnalysisBtn');
  
  const analysisStatus = document.getElementById('analysisStatus');
  const progressBar = document.getElementById('analysisProgressBar');
  
  const romResultsContent = document.getElementById('romResultsContent');
  const resultDate = document.getElementById('resultDate');
  const downloadRomReport = document.getElementById('downloadRomReport');
  const newScanBtn = document.getElementById('newScanBtn');
  
  const historyDrawer = document.getElementById('historyDrawer');
  const toggleHistoryBtn = document.getElementById('toggleHistoryBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const historyList = document.getElementById('historyList');
  
  const toastContainer = document.getElementById('toast-container');
  
  const radioIsolate = document.querySelector('input[value="isolate"]');
  const radioFull = document.querySelector('input[value="full"]');

  const autoGuidedToggle = document.getElementById('autoGuidedToggle');
  const liveAngleReadout = document.getElementById('liveAngleReadout');
  const liveAngleValue = document.getElementById('liveAngleValue');
  const liveAngleHint = document.getElementById('liveAngleHint');

  let captureFrameBtn = null;
  let captureBtnContainer = null;
  
  const database = firebase.database();

  // =========================================================================
  // 2. MOVEMENT PROMPTS & JOINT GROUPS
  // =========================================================================
  const movementPrompts = {
    // Shoulder
    shoulder_flexion: { 
      name: 'Shoulder Flexion', 
      prompts: [
        'Position 1: Arm relaxed at side (starting position)',
        'Position 2: Raise arm forward to 90°',
        'Position 3: Continue to full flexion overhead',
        'Position 4: Hold at maximum range'
      ], 
      requiredFrames: 4 
    },
    shoulder_extension: { 
      name: 'Shoulder Extension', 
      prompts: [
        'Position 1: Arm at side',
        'Position 2: Extend arm backward',
        'Position 3: Hold at maximum extension'
      ], 
      requiredFrames: 3 
    },
    shoulder_abduction: { 
      name: 'Shoulder Abduction', 
      prompts: [
        'Position 1: Arm at side',
        'Position 2: Lift arm sideways to 90°',
        'Position 3: Continue to full abduction',
        'Position 4: Hold at maximum range'
      ], 
      requiredFrames: 4 
    },
    shoulder_adduction: { 
      name: 'Shoulder Adduction', 
      prompts: [
        'Position 1: Arm abducted to 90°',
        'Position 2: Bring arm across body toward midline',
        'Position 3: Hold at maximum adduction'
      ], 
      requiredFrames: 3 
    },
    shoulder_internal_rotation: { 
      name: 'Shoulder Internal Rotation', 
      prompts: [
        'Position 1: Arm at side, elbow flexed 90°',
        'Position 2: Rotate forearm inward toward abdomen',
        'Position 3: Hold at maximum internal rotation'
      ], 
      requiredFrames: 3 
    },
    shoulder_external_rotation: { 
      name: 'Shoulder External Rotation', 
      prompts: [
        'Position 1: Arm at side, elbow flexed 90°',
        'Position 2: Rotate forearm outward away from body',
        'Position 3: Hold at maximum external rotation'
      ], 
      requiredFrames: 3 
    },
    // Elbow
    elbow_flexion: { 
      name: 'Elbow Flexion', 
      prompts: [
        'Position 1: Arm fully extended',
        'Position 2: Bend elbow to 90°',
        'Position 3: Continue to full flexion',
        'Position 4: Hold at maximum range'
      ], 
      requiredFrames: 4 
    },
    elbow_extension: { 
      name: 'Elbow Extension', 
      prompts: [
        'Position 1: Elbow fully flexed',
        'Position 2: Straighten arm to neutral',
        'Position 3: Extend as far as possible (if hyperextension)',
        'Position 4: Hold at end range'
      ], 
      requiredFrames: 4 
    },
    // Wrist
    wrist_flexion: { 
      name: 'Wrist Flexion', 
      prompts: [
        'Position 1: Wrist neutral, forearm supported',
        'Position 2: Bend wrist downward (palm toward forearm)',
        'Position 3: Hold at maximum flexion'
      ], 
      requiredFrames: 3 
    },
    wrist_extension: { 
      name: 'Wrist Extension', 
      prompts: [
        'Position 1: Wrist neutral',
        'Position 2: Bend wrist upward (back of hand toward forearm)',
        'Position 3: Hold at maximum extension'
      ], 
      requiredFrames: 3 
    },
    wrist_radial_deviation: { 
      name: 'Wrist Radial Deviation', 
      prompts: [
        'Position 1: Wrist neutral',
        'Position 2: Tilt hand toward thumb side',
        'Position 3: Hold at maximum radial deviation'
      ], 
      requiredFrames: 3 
    },
    wrist_ulnar_deviation: { 
      name: 'Wrist Ulnar Deviation', 
      prompts: [
        'Position 1: Wrist neutral',
        'Position 2: Tilt hand toward little finger side',
        'Position 3: Hold at maximum ulnar deviation'
      ], 
      requiredFrames: 3 
    },
    // Hand/Fingers
    finger_flexion: { 
      name: 'Finger Flexion', 
      prompts: [
        'Position 1: Fingers fully extended',
        'Position 2: Make a fist (flex MCP, PIP, DIP)',
        'Position 3: Hold full flexion'
      ], 
      requiredFrames: 3 
    },
    finger_extension: { 
      name: 'Finger Extension', 
      prompts: [
        'Position 1: Fingers relaxed in flexion',
        'Position 2: Extend all fingers straight',
        'Position 3: Hold full extension'
      ], 
      requiredFrames: 3 
    },
    thumb_abduction: { 
      name: 'Thumb Abduction', 
      prompts: [
        'Position 1: Thumb against index finger',
        'Position 2: Move thumb away from palm (hitchhiker position)',
        'Position 3: Hold maximum abduction'
      ], 
      requiredFrames: 3 
    },
    thumb_opposition: { 
      name: 'Thumb Opposition', 
      prompts: [
        'Position 1: Hand open, thumb extended',
        'Position 2: Touch thumb tip to little finger base',
        'Position 3: Hold opposition position'
      ], 
      requiredFrames: 3 
    },
    // Hip
    hip_flexion: { 
      name: 'Hip Flexion', 
      prompts: [
        'Position 1: Stand in neutral position',
        'Position 2: Lift knee toward chest',
        'Position 3: Continue to maximum flexion',
        'Position 4: Hold at maximum range'
      ], 
      requiredFrames: 4 
    },
    hip_extension: { 
      name: 'Hip Extension', 
      prompts: [
        'Position 1: Stand upright',
        'Position 2: Extend leg backward without arching back',
        'Position 3: Hold at maximum extension'
      ], 
      requiredFrames: 3 
    },
    hip_abduction: { 
      name: 'Hip Abduction', 
      prompts: [
        'Position 1: Stand with feet together',
        'Position 2: Lift leg out to side',
        'Position 3: Hold at maximum abduction'
      ], 
      requiredFrames: 3 
    },
    hip_adduction: { 
      name: 'Hip Adduction', 
      prompts: [
        'Position 1: Leg abducted',
        'Position 2: Bring leg back toward midline',
        'Position 3: Cross midline if possible'
      ], 
      requiredFrames: 3 
    },
    hip_internal_rotation: { 
      name: 'Hip Internal Rotation', 
      prompts: [
        'Position 1: Seated, knee flexed 90°',
        'Position 2: Rotate lower leg outward (foot moves inward)',
        'Position 3: Hold maximum internal rotation'
      ], 
      requiredFrames: 3 
    },
    hip_external_rotation: { 
      name: 'Hip External Rotation', 
      prompts: [
        'Position 1: Seated, knee flexed 90°',
        'Position 2: Rotate lower leg inward (foot moves outward)',
        'Position 3: Hold maximum external rotation'
      ], 
      requiredFrames: 3 
    },
    // Knee
    knee_flexion: { 
      name: 'Knee Flexion', 
      prompts: [
        'Position 1: Stand with leg straight',
        'Position 2: Bend knee to 90°',
        'Position 3: Continue to full flexion',
        'Position 4: Hold at maximum range'
      ], 
      requiredFrames: 4 
    },
    knee_extension: { 
      name: 'Knee Extension', 
      prompts: [
        'Position 1: Knee flexed (seated)',
        'Position 2: Straighten leg to neutral',
        'Position 3: Extend to full available range',
        'Position 4: Hold end range'
      ], 
      requiredFrames: 4 
    },
    // Ankle
    ankle_dorsiflexion: { 
      name: 'Ankle Dorsiflexion', 
      prompts: [
        'Position 1: Foot flat on ground',
        'Position 2: Lift toes up (dorsiflex)',
        'Position 3: Hold at maximum range'
      ], 
      requiredFrames: 3 
    },
    ankle_plantarflexion: { 
      name: 'Ankle Plantarflexion', 
      prompts: [
        'Position 1: Foot flat',
        'Position 2: Point toes downward',
        'Position 3: Hold maximum plantarflexion'
      ], 
      requiredFrames: 3 
    },
    // Cervical
    cervical_flexion: { 
      name: 'Cervical Flexion', 
      prompts: [
        'Position 1: Head neutral',
        'Position 2: Tuck chin to chest',
        'Position 3: Hold maximum flexion'
      ], 
      requiredFrames: 3 
    },
    cervical_extension: { 
      name: 'Cervical Extension', 
      prompts: [
        'Position 1: Head neutral',
        'Position 2: Look upward, extend neck',
        'Position 3: Hold maximum extension'
      ], 
      requiredFrames: 3 
    },
    cervical_rotation: { 
      name: 'Cervical Rotation', 
      prompts: [
        'Position 1: Head in neutral position',
        'Position 2: Rotate head to the right',
        'Position 3: Return to center',
        'Position 4: Rotate head to the left',
        'Position 5: Return to center'
      ], 
      requiredFrames: 5 
    },
    cervical_lateral_flexion: { 
      name: 'Cervical Lateral Flexion', 
      prompts: [
        'Position 1: Head neutral',
        'Position 2: Tilt ear toward right shoulder',
        'Position 3: Return to center',
        'Position 4: Tilt ear toward left shoulder',
        'Position 5: Return to center'
      ], 
      requiredFrames: 5 
    },
    // Lumbar
    lumbar_flexion: { 
      name: 'Lumbar Flexion', 
      prompts: [
        'Position 1: Stand upright',
        'Position 2: Bend forward slowly',
        'Position 3: Reach toward toes',
        'Position 4: Hold at maximum flexion'
      ], 
      requiredFrames: 4 
    },
    lumbar_extension: { 
      name: 'Lumbar Extension', 
      prompts: [
        'Position 1: Stand upright',
        'Position 2: Lean backward, support hips',
        'Position 3: Hold maximum extension'
      ], 
      requiredFrames: 3 
    },
    lumbar_lateral_flexion: { 
      name: 'Lumbar Lateral Flexion', 
      prompts: [
        'Position 1: Stand upright',
        'Position 2: Slide hand down right thigh, bend sideways',
        'Position 3: Return to center',
        'Position 4: Repeat on left side'
      ], 
      requiredFrames: 4 
    }
  };

  const jointGroups = {
    shoulder: ['shoulder_flexion', 'shoulder_extension', 'shoulder_abduction', 'shoulder_adduction', 'shoulder_internal_rotation', 'shoulder_external_rotation'],
    elbow: ['elbow_flexion', 'elbow_extension'],
    wrist: ['wrist_flexion', 'wrist_extension', 'wrist_radial_deviation', 'wrist_ulnar_deviation'],
    hand: ['finger_flexion', 'finger_extension', 'thumb_abduction', 'thumb_opposition'],
    hip: ['hip_flexion', 'hip_extension', 'hip_abduction', 'hip_adduction', 'hip_internal_rotation', 'hip_external_rotation'],
    knee: ['knee_flexion', 'knee_extension'],
    ankle: ['ankle_dorsiflexion', 'ankle_plantarflexion'],
    cervical: ['cervical_flexion', 'cervical_extension', 'cervical_rotation', 'cervical_lateral_flexion'],
    lumbar: ['lumbar_flexion', 'lumbar_extension', 'lumbar_lateral_flexion']
  };

  // =========================================================================
  // 3. STATE VARIABLES
  // =========================================================================
  let stream = null;
  let capturedFrames = [];
  let aiConfig = { token: null, endpoint: 'https://api.openai.com/v1', model: 'gpt-4.1' };
  let currentUser = null;
  let scopeUid = null; // center owner's uid for center members, so ROM/gait history is shared
  let analysisResults = null;
  let currentMovement = null;
  let promptIndex = 0;
  let isCameraActive = false;
  
  let assessmentMode = 'isolate';
  let movementQueue = [];
  let currentQueueIndex = 0;
  let allCapturedFrames = {};
  const romPatientNameInput = document.getElementById('romPatientName');

  // Auto-Guided Scan (voice prompts + live pose detection + auto-capture)
  let liveLandmarkerPromise = null;
  let autoScanRAF = null;
  let autoScanAngleBuffer = [];
  let autoScanBusy = false;       // true while a capture is being processed (debounce)
  let autoScanCooldownUntil = 0;  // timestamp; ignore holds until after this
  let autoScanLastSpokenPrompt = null;

  // =========================================================================
  // 3b. REAL ANGLE MEASUREMENT (MediaPipe Pose landmarks — runs automatically
  // in the background right after capture, no extra taps from the user).
  // This replaces a pure AI "guess" with an actual computed geometric angle
  // wherever the joint is trackable from body pose landmarks. Joints that
  // aren't trackable this way (wrist deviation, fingers, thumb, spine
  // rotation) fall back to the AI's visual estimate, and the UI is explicit
  // about which is which so results are never presented as more precise
  // than they are.
  // =========================================================================
  let poseLandmarkerPromise = null;

  function loadPoseLandmarker() {
    if (poseLandmarkerPromise) return poseLandmarkerPromise;
    poseLandmarkerPromise = (async () => {
      try {
        const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
        const filesetResolver = await vision.FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
        return await vision.PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU'
          },
          runningMode: 'IMAGE',
          numPoses: 1
        });
      } catch (err) {
        console.warn('[ROM] Pose landmark model failed to load — falling back to AI-only estimates:', err);
        return null;
      }
    })();
    return poseLandmarkerPromise;
  }

  // Which 3 landmarks define the angle at the joint for each movement.
  // Angle is measured at the middle point, between the two segments.
  const JOINT_LANDMARK_MAP = {
    shoulder_flexion: ['HIP', 'SHOULDER', 'ELBOW'],
    shoulder_extension: ['HIP', 'SHOULDER', 'ELBOW'],
    shoulder_abduction: ['HIP', 'SHOULDER', 'ELBOW'],
    shoulder_adduction: ['HIP', 'SHOULDER', 'ELBOW'],
    elbow_flexion: ['SHOULDER', 'ELBOW', 'WRIST'],
    elbow_extension: ['SHOULDER', 'ELBOW', 'WRIST'],
    hip_flexion: ['SHOULDER', 'HIP', 'KNEE'],
    hip_extension: ['SHOULDER', 'HIP', 'KNEE'],
    hip_abduction: ['SHOULDER', 'HIP', 'KNEE'],
    hip_adduction: ['SHOULDER', 'HIP', 'KNEE'],
    knee_flexion: ['HIP', 'KNEE', 'ANKLE'],
    knee_extension: ['HIP', 'KNEE', 'ANKLE'],
    ankle_dorsiflexion: ['KNEE', 'ANKLE', 'FOOT_INDEX'],
    ankle_plantarflexion: ['KNEE', 'ANKLE', 'FOOT_INDEX']
  };

  const LANDMARK_INDEX = {
    SHOULDER: [11, 12], ELBOW: [13, 14], WRIST: [15, 16],
    HIP: [23, 24], KNEE: [25, 26], ANKLE: [27, 28], FOOT_INDEX: [31, 32]
  };

  function angleAtVertex(a, b, c) {
    const v1 = { x: a.x - b.x, y: a.y - b.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const mag1 = Math.hypot(v1.x, v1.y);
    const mag2 = Math.hypot(v2.x, v2.y);
    if (mag1 === 0 || mag2 === 0) return null;
    const cos = Math.min(1, Math.max(-1, (v1.x * v2.x + v1.y * v2.y) / (mag1 * mag2)));
    return Math.acos(cos) * (180 / Math.PI);
  }

  // ===================================================================
  // AUTO-GUIDED SCAN — live pose tracking + AI voice prompts.
  // Reuses captureCurrentFrame()/the existing movement-queue logic so the
  // rest of the pipeline (AI write-up, results page, history) needs no
  // changes; this only automates *when* a frame gets captured.
  // ===================================================================

  // A second landmarker instance running in VIDEO mode (separate from the
  // IMAGE-mode one used for post-hoc angle measurement) for live tracking.
  function loadLiveLandmarker() {
    if (liveLandmarkerPromise) return liveLandmarkerPromise;
    liveLandmarkerPromise = (async () => {
      try {
        const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
        const filesetResolver = await vision.FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
        return await vision.PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numPoses: 1
        });
      } catch (err) {
        console.warn('[ROM] Live pose model failed to load — Auto-Guided Scan will fall back to voice-only prompts:', err);
        return null;
      }
    })();
    return liveLandmarkerPromise;
  }

  // Speaks a short instruction aloud. Cancels any in-progress speech first
  // so prompts don't pile up and talk over each other.
  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1;
      utter.pitch = 1;
      window.speechSynthesis.speak(utter);
    } catch (err) {
      console.warn('[ROM] Speech synthesis failed:', err);
    }
  }

  function currentAngleFromLandmarks(lm, movementKey) {
    const pointNames = JOINT_LANDMARK_MAP[movementKey];
    if (!pointNames || !lm) return null;
    const pick = (name, side) => lm[LANDMARK_INDEX[name][side]];
    const sideScore = (side) => pointNames.reduce((sum, name) => sum + (pick(name, side)?.visibility ?? 0), 0);
    const side = sideScore(1) >= sideScore(0) ? 1 : 0;
    const pts = pointNames.map(name => pick(name, side));
    if (pts.some(p => !p || (p.visibility !== undefined && p.visibility < 0.5))) return null;
    const angle = angleAtVertex(pts[0], pts[1], pts[2]);
    return angle === null ? null : Math.round(angle);
  }

  async function startAutoGuidedScan() {
    if (!currentMovement) return;
    const movementKey = movementQueue[currentQueueIndex];
    const trackable = !!JOINT_LANDMARK_MAP[movementKey];

    autoScanAngleBuffer = [];
    autoScanBusy = false;
    autoScanCooldownUntil = Date.now() + 1200; // brief grace period after camera starts
    autoScanLastSpokenPrompt = null;

    speak(`Let's begin. ${currentMovement.prompts[0]}`);
    autoScanLastSpokenPrompt = currentMovement.prompts[0];

    if (!trackable) {
      // We can still guide by voice on a timer, but the user taps to capture.
      liveAngleReadout.style.display = 'none';
      return;
    }

    const landmarker = await loadLiveLandmarker();
    if (!landmarker || !isCameraActive) {
      liveAngleReadout.style.display = 'none';
      return; // graceful fallback to manual capture with voice prompt already spoken
    }

    liveAngleReadout.style.display = 'flex';
    liveAngleHint.textContent = 'Move into position and hold…';

    const loop = () => {
      if (!isCameraActive || !stream) { stopAutoGuidedScan(); return; }

      // Speak a new prompt aloud whenever it changes (e.g. after auto-capture
      // advances promptIndex, or the movement queue advances).
      const promptNow = currentPrompt.textContent;
      if (promptNow && promptNow !== autoScanLastSpokenPrompt && !promptNow.startsWith('✓')) {
        speak(promptNow);
        autoScanLastSpokenPrompt = promptNow;
      }

      try {
        const result = landmarker.detectForVideo(cameraPreview, performance.now());
        const lm = result?.landmarks?.[0];
        const angle = lm ? currentAngleFromLandmarks(lm, movementQueue[currentQueueIndex]) : null;

        if (angle !== null) {
          liveAngleValue.textContent = angle + '°';
          autoScanAngleBuffer.push({ angle, t: Date.now() });
          // keep ~700ms of recent samples
          autoScanAngleBuffer = autoScanAngleBuffer.filter(s => Date.now() - s.t < 700);

          const readyToEvaluate = autoScanAngleBuffer.length >= 8 && Date.now() > autoScanCooldownUntil;
          if (readyToEvaluate && !autoScanBusy) {
            const angles = autoScanAngleBuffer.map(s => s.angle);
            const spread = Math.max(...angles) - Math.min(...angles);
            if (spread <= 3) {
              // Position held steady — auto-capture this frame.
              autoScanBusy = true;
              liveAngleHint.textContent = 'Captured!';
              if (navigator.vibrate) navigator.vibrate(60);
              captureCurrentFrame().finally(() => {
                autoScanAngleBuffer = [];
                autoScanCooldownUntil = Date.now() + 1500;
                autoScanBusy = false;
                liveAngleHint.textContent = isCameraActive ? 'Move into the next position and hold…' : '';
              });
            } else {
              liveAngleHint.textContent = 'Hold the position steady…';
            }
          }
        } else {
          liveAngleValue.textContent = '—';
        }
      } catch (err) {
        // Non-fatal — just skip this frame.
      }

      autoScanRAF = requestAnimationFrame(loop);
    };

    autoScanRAF = requestAnimationFrame(loop);
  }

  function stopAutoGuidedScan() {
    if (autoScanRAF) {
      cancelAnimationFrame(autoScanRAF);
      autoScanRAF = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    liveAngleReadout.style.display = 'none';
    autoScanAngleBuffer = [];
    autoScanBusy = false;
  }

  function loadImageEl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  // Detects the joint angle in a single frame, picking whichever body side
  // (left/right) the camera can see more clearly.
  async function detectAngleInFrame(dataUrl, movementKey) {
    const pointNames = JOINT_LANDMARK_MAP[movementKey];
    if (!pointNames) return null;
    const landmarker = await loadPoseLandmarker();
    if (!landmarker) return null;

    try {
      const img = await loadImageEl(dataUrl);
      const result = landmarker.detect(img);
      if (!result?.landmarks?.length) return null;
      const lm = result.landmarks[0];

      const pick = (name, side) => lm[LANDMARK_INDEX[name][side]];
      const sideScore = (side) => pointNames.reduce((sum, name) => sum + (pick(name, side)?.visibility ?? 0), 0);
      const side = sideScore(1) >= sideScore(0) ? 1 : 0;
      const pts = pointNames.map(name => pick(name, side));

      if (pts.some(p => !p || (p.visibility !== undefined && p.visibility < 0.5))) return null;
      const angle = angleAtVertex(pts[0], pts[1], pts[2]);
      return angle === null ? null : Math.round(angle);
    } catch (err) {
      console.warn('[ROM] Pose detection failed on a frame:', err);
      return null;
    }
  }

  // Measures ROM for one movement from its captured frames (start vs. end
  // range). Runs silently — no UI, no extra step for the clinician.
  async function measureMovementROM(frames, movementKey) {
    if (!JOINT_LANDMARK_MAP[movementKey] || !frames || frames.length < 2) {
      return { measured: false, degrees: null };
    }
    const startAngle = await detectAngleInFrame(frames[0], movementKey);
    const endAngle = await detectAngleInFrame(frames[frames.length - 1], movementKey);
    if (startAngle === null || endAngle === null) return { measured: false, degrees: null };
    return { measured: true, degrees: Math.round(Math.abs(endAngle - startAngle)), startAngle, endAngle };
  }

  // =========================================================================
  // 4. UTILITY FUNCTIONS
  // =========================================================================
  function showToast(message, type = 'success', duration = 3500) {
    if (!toastContainer) {
      console.warn('Toast container not found');
      return;
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i><span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
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
  
  async function compressImage(dataUrl, maxSizeMB = 1) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        const maxDim = 1024;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = (h / w) * maxDim; w = maxDim; }
          else { w = (w / h) * maxDim; h = maxDim; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        let quality = 0.8;
        let result = canvas.toDataURL('image/jpeg', quality);
        while (result.length > maxSizeMB * 1024 * 1024 && quality > 0.3) {
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(result);
      };
      img.src = dataUrl;
    });
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
  
  function setStage(stageNum) {
    [stageScan, stageAnalyze, stageResults].forEach(s => s.classList.remove('active'));
    if (stageNum === 1) stageScan.classList.add('active');
    else if (stageNum === 2) stageAnalyze.classList.add('active');
    else if (stageNum === 3) stageResults.classList.add('active');
    
    steps.forEach((step, idx) => {
      step.classList.remove('active', 'completed');
      if (idx < stageNum - 1) step.classList.add('completed');
      if (idx === stageNum - 1) step.classList.add('active');
    });
  }

  // =========================================================================
  // 5. IMAGE BRIGHTNESS CHECK (Client-side validation)
  // =========================================================================
  function checkImageBrightness(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          let totalBrightness = 0;
          let pixelCount = 0;
          
          for (let i = 0; i < data.length; i += 16) {
            const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            totalBrightness += brightness;
            pixelCount++;
          }
          
          const avgBrightness = totalBrightness / pixelCount;
          resolve(avgBrightness);
        } catch (e) {
          console.warn('Brightness check failed:', e);
          resolve(128);
        }
      };
      img.onerror = () => resolve(128);
      img.src = dataUrl;
    });
  }

  async function validateImageQuality(frames) {
    if (!frames || frames.length === 0) return { valid: false, reason: 'No frames to analyze' };
    
    let darkFrames = 0;
    const DARKNESS_THRESHOLD = 40;
    
    for (let frame of frames) {
      const brightness = await checkImageBrightness(frame);
      if (brightness < DARKNESS_THRESHOLD) {
        darkFrames++;
      }
    }
    
    const darkPercentage = (darkFrames / frames.length) * 100;
    
    if (darkPercentage > 50) {
      return { 
        valid: false, 
        reason: `Images appear too dark (${Math.round(darkPercentage)}% of frames). Please ensure proper lighting.`,
        warning: true
      };
    }
    
    if (darkPercentage > 25) {
      return { 
        valid: true, 
        warning: true,
        reason: `Some images are dark. Consider improving lighting for better accuracy.`
      };
    }
    
    return { valid: true, warning: false };
  }

  // =========================================================================
  // 6. POPULATE DROPDOWN BASED ON MODE
  // =========================================================================
  function populateJointSelect(mode) {
    jointSelect.innerHTML = '<option value="">-- Choose ' + (mode === 'isolate' ? 'movement' : 'joint region') + ' --</option>';
    
    if (mode === 'isolate') {
      const groups = {
        Shoulder: ['shoulder_flexion', 'shoulder_extension', 'shoulder_abduction', 'shoulder_adduction', 'shoulder_internal_rotation', 'shoulder_external_rotation'],
        Elbow: ['elbow_flexion', 'elbow_extension'],
        Wrist: ['wrist_flexion', 'wrist_extension', 'wrist_radial_deviation', 'wrist_ulnar_deviation'],
        'Hand/Fingers': ['finger_flexion', 'finger_extension', 'thumb_abduction', 'thumb_opposition'],
        Hip: ['hip_flexion', 'hip_extension', 'hip_abduction', 'hip_adduction', 'hip_internal_rotation', 'hip_external_rotation'],
        Knee: ['knee_flexion', 'knee_extension'],
        Ankle: ['ankle_dorsiflexion', 'ankle_plantarflexion'],
        Cervical: ['cervical_flexion', 'cervical_extension', 'cervical_rotation', 'cervical_lateral_flexion'],
        Lumbar: ['lumbar_flexion', 'lumbar_extension', 'lumbar_lateral_flexion']
      };
      for (const [groupName, keys] of Object.entries(groups)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName;
        keys.forEach(key => {
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = movementPrompts[key].name;
          optgroup.appendChild(opt);
        });
        jointSelect.appendChild(optgroup);
      }
    } else {
      const groups = [
        { label: 'Shoulder Complex', value: 'shoulder' },
        { label: 'Elbow', value: 'elbow' },
        { label: 'Wrist', value: 'wrist' },
        { label: 'Hand & Fingers', value: 'hand' },
        { label: 'Hip Complex', value: 'hip' },
        { label: 'Knee', value: 'knee' },
        { label: 'Ankle', value: 'ankle' },
        { label: 'Cervical Spine', value: 'cervical' },
        { label: 'Lumbar Spine', value: 'lumbar' }
      ];
      groups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.value;
        opt.textContent = g.label;
        jointSelect.appendChild(opt);
      });
    }
  }

  // =========================================================================
  // 7. HANDLE MODE CHANGE
  // =========================================================================
  function onModeChange() {
    assessmentMode = document.querySelector('input[name="assessmentMode"]:checked').value;
    populateJointSelect(assessmentMode);
    jointSelect.value = '';
    startCameraBtn.disabled = true;
    movementPromptBox.style.display = 'none';
    movementInstruction.textContent = assessmentMode === 'isolate' ? 'Select a movement to begin' : 'Select a joint region for full assessment';
    resetCapture();
  }
  
  if (radioIsolate) radioIsolate.addEventListener('change', onModeChange);
  if (radioFull) radioFull.addEventListener('change', onModeChange);
  
  // =========================================================================
  // 8. JOINT SELECTION & QUEUE SETUP
  // =========================================================================
  function updateForJointSelection(value) {
    if (!value) {
      startCameraBtn.disabled = true;
      movementPromptBox.style.display = 'none';
      return;
    }
    
    startCameraBtn.disabled = false;
    
    if (assessmentMode === 'isolate') {
      currentMovement = movementPrompts[value];
      movementQueue = [value];
      currentQueueIndex = 0;
      requiredFramesSpan.textContent = currentMovement.requiredFrames;
      movementInstruction.textContent = `Prepare for ${currentMovement.name}`;
      movementPromptBox.style.display = 'flex';
      currentPrompt.textContent = currentMovement.prompts[0];
      promptStep.textContent = `0/${currentMovement.requiredFrames}`;
      promptIndex = 0;
    } else {
      const groupKey = value;
      movementQueue = jointGroups[groupKey] || [];
      if (movementQueue.length === 0) {
        showToast('No movements defined for this joint', 'error');
        return;
      }
      currentQueueIndex = 0;
      currentMovement = movementPrompts[movementQueue[0]];
      requiredFramesSpan.textContent = currentMovement.requiredFrames;
      movementInstruction.textContent = `Full Assessment: ${currentMovement.name} (1/${movementQueue.length})`;
      movementPromptBox.style.display = 'flex';
      currentPrompt.textContent = currentMovement.prompts[0];
      promptStep.textContent = `Movement 1/${movementQueue.length} · 0/${currentMovement.requiredFrames} frames`;
      promptIndex = 0;
      allCapturedFrames = {};
    }
    
    capturedFrames = [];
    updateThumbnails();
    proceedBtn.disabled = true;
    if (captureFrameBtn) captureFrameBtn.disabled = !isCameraActive;
  }
  
  jointSelect.addEventListener('change', (e) => updateForJointSelection(e.target.value));
  
  // =========================================================================
  // 9. CAMERA & CAPTURE FUNCTIONS
  // =========================================================================
  function createCaptureButton() {
    const existingContainer = document.querySelector('.capture-btn-container');
    if (existingContainer) existingContainer.remove();
    
    captureBtnContainer = document.createElement('div');
    captureBtnContainer.className = 'capture-btn-container';
    captureBtnContainer.style.cssText = 'display: none; justify-content: center; margin: 1rem 0;';
    
    captureFrameBtn = document.createElement('button');
    captureFrameBtn.id = 'captureFrameBtn';
    captureFrameBtn.className = 'btn-accent';
    captureFrameBtn.innerHTML = '<i class="fas fa-camera"></i> Capture Current Position';
    captureFrameBtn.style.cssText = 'padding: 1rem 2.5rem; font-size: 1.1rem;';
    
    captureFrameBtn.addEventListener('click', captureCurrentFrame);
    
    captureBtnContainer.appendChild(captureFrameBtn);
    
    const cameraControls = document.querySelector('.camera-controls');
    cameraControls.insertAdjacentElement('afterend', captureBtnContainer);
  }
  
  function showCaptureButton() {
    if (captureBtnContainer) {
      captureBtnContainer.style.display = 'flex';
    }
  }
  
  function hideCaptureButton() {
    if (captureBtnContainer) {
      captureBtnContainer.style.display = 'none';
    }
  }
  
  async function startCamera() {
    if (!currentMovement) {
      showToast('Please select a joint first', 'warning');
      return;
    }
    
    // Fire-and-forget: warms up the pose model in the background so it's
    // ready by the time the user finishes capturing — adds no wait time.
    loadPoseLandmarker();
    
    try {
      stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }, 
        audio: false 
      });
      
      cameraPreview.srcObject = stream;
      cameraPlaceholder.style.display = 'none';
      cameraPreview.style.display = 'block';
      
      const scanOverlay = document.querySelector('.scan-overlay');
      if (scanOverlay) scanOverlay.style.display = 'block';
      
      startCameraBtn.style.display = 'none';
      showCaptureButton();
      
      isCameraActive = true;
      
      if (captureFrameBtn) {
        captureFrameBtn.disabled = false;
        captureFrameBtn.innerHTML = '<i class="fas fa-camera"></i> Capture Current Position';
      }
      
      capturedFrames = [];
      promptIndex = 0;
      updateThumbnails();
      currentPrompt.textContent = currentMovement.prompts[0];
      
      if (assessmentMode === 'full') {
        promptStep.textContent = `Movement ${currentQueueIndex+1}/${movementQueue.length} · 0/${currentMovement.requiredFrames} frames`;
      } else {
        promptStep.textContent = `0/${currentMovement.requiredFrames}`;
      }
      
      proceedBtn.disabled = true;
      
      showToast('Camera ready - Position patient and capture each position', 'success');
      
      setTimeout(() => {
        cameraPreview.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);

      if (autoGuidedToggle && autoGuidedToggle.checked) {
        startAutoGuidedScan();
      }
      
    } catch (err) {
      console.error('Camera error:', err);
      showToast('Camera access denied or not available', 'error');
      startCameraBtn.style.display = 'block';
      hideCaptureButton();
    }
  }
  
  function stopCamera() {
    stopAutoGuidedScan();

    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    
    cameraPreview.srcObject = null;
    cameraPreview.style.display = 'none';
    cameraPlaceholder.style.display = 'flex';
    
    const scanOverlay = document.querySelector('.scan-overlay');
    if (scanOverlay) scanOverlay.style.display = 'none';
    
    isCameraActive = false;
    startCameraBtn.style.display = 'block';
    startCameraBtn.disabled = !currentMovement;
    hideCaptureButton();
  }
  
  function captureFrame() {
    if (!stream || !cameraPreview.videoWidth) return null;
    
    const canvas = document.createElement('canvas');
    canvas.width = cameraPreview.videoWidth;
    canvas.height = cameraPreview.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cameraPreview, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  }
  
  async function captureCurrentFrame() {
    if (!isCameraActive) {
      showToast('Camera is not active', 'error');
      return;
    }
    
    if (!currentMovement) {
      showToast('No movement selected', 'error');
      return;
    }
    
    if (capturedFrames.length >= currentMovement.requiredFrames) {
      showToast(`All ${currentMovement.requiredFrames} positions already captured`, 'warning');
      return;
    }
    
    const dataUrl = captureFrame();
    if (!dataUrl) {
      showToast('Failed to capture frame', 'error');
      return;
    }
    
    if (captureFrameBtn) {
      captureFrameBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
      captureFrameBtn.disabled = true;
    }
    
    const compressed = await compressImage(dataUrl, 0.8);
    capturedFrames.push(compressed);
    updateThumbnails();
    
    if (navigator.vibrate) navigator.vibrate(50);
    
    promptIndex = capturedFrames.length;
    
    if (assessmentMode === 'full') {
      promptStep.textContent = `Movement ${currentQueueIndex+1}/${movementQueue.length} · ${promptIndex}/${currentMovement.requiredFrames} frames`;
    } else {
      promptStep.textContent = `${promptIndex}/${currentMovement.requiredFrames}`;
    }
    
    if (capturedFrames.length >= currentMovement.requiredFrames) {
      const movementKey = movementQueue[currentQueueIndex];
      allCapturedFrames[movementKey] = [...capturedFrames];
      
      if (assessmentMode === 'full' && currentQueueIndex < movementQueue.length - 1) {
        currentQueueIndex++;
        currentMovement = movementPrompts[movementQueue[currentQueueIndex]];
        capturedFrames = [];
        promptIndex = 0;
        
        requiredFramesSpan.textContent = currentMovement.requiredFrames;
        movementInstruction.textContent = `Full Assessment: ${currentMovement.name} (${currentQueueIndex+1}/${movementQueue.length})`;
        currentPrompt.textContent = currentMovement.prompts[0];
        promptStep.textContent = `Movement ${currentQueueIndex+1}/${movementQueue.length} · 0/${currentMovement.requiredFrames} frames`;
        updateThumbnails();
        
        showToast(`✓ ${movementPrompts[movementQueue[currentQueueIndex-1]].name} complete. Next: ${currentMovement.name}`, 'success');
        
        if (captureFrameBtn) {
          captureFrameBtn.disabled = false;
          captureFrameBtn.innerHTML = '<i class="fas fa-camera"></i> Capture Current Position';
        }
        return;
      } else {
        currentPrompt.textContent = '✓ All positions captured!';
        movementPromptBox.style.borderLeftColor = '#10b981';
        const totalMovements = assessmentMode === 'full' ? movementQueue.length : 1;
        showToast(`✅ Assessment complete! ${totalMovements} movement(s) captured. Ready for analysis.`, 'success');
        stopCamera();
        proceedBtn.disabled = false;
        capturePreview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      currentPrompt.textContent = currentMovement.prompts[promptIndex];
      showToast(`Position ${promptIndex} captured! Next: ${currentMovement.prompts[promptIndex]}`, 'success');
      if (captureFrameBtn) {
        captureFrameBtn.disabled = false;
        captureFrameBtn.innerHTML = '<i class="fas fa-camera"></i> Capture Next Position';
      }
    }
    
    setTimeout(() => {
      movementPromptBox.style.borderLeftColor = 'var(--rom-accent)';
    }, 2000);
  }
  
  function updateThumbnails() {
    thumbnailContainer.innerHTML = '';
    capturedFrames.forEach((url, i) => {
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.display = 'inline-block';
      
      const img = document.createElement('img');
      img.src = url;
      img.className = 'thumbnail';
      img.alt = `Position ${i + 1}`;
      img.addEventListener('click', () => {
        window.open(url, '_blank');
      });
      
      const label = document.createElement('span');
      label.textContent = `${i + 1}`;
      label.style.cssText = `
        position: absolute;
        top: -8px;
        right: -8px;
        background: var(--rom-accent);
        color: white;
        border-radius: 50%;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: bold;
      `;
      
      wrapper.appendChild(img);
      wrapper.appendChild(label);
      thumbnailContainer.appendChild(wrapper);
    });
    
    frameCountSpan.textContent = capturedFrames.length;
    capturePreview.style.display = capturedFrames.length ? 'block' : 'none';
  }
  
  function resetCapture() {
    capturedFrames = [];
    updateThumbnails();
    proceedBtn.disabled = true;
    capturePreview.style.display = 'none';
    
    if (currentMovement) {
      promptIndex = 0;
      currentPrompt.textContent = currentMovement.prompts[0];
      if (assessmentMode === 'full') {
        promptStep.textContent = `Movement ${currentQueueIndex+1}/${movementQueue.length} · 0/${currentMovement.requiredFrames} frames`;
      } else {
        promptStep.textContent = `0/${currentMovement.requiredFrames}`;
      }
      movementPromptBox.style.borderLeftColor = 'var(--rom-accent)';
    }
    
    if (captureFrameBtn) {
      captureFrameBtn.disabled = !isCameraActive;
      captureFrameBtn.innerHTML = '<i class="fas fa-camera"></i> Capture Current Position';
    }
  }
  
  // =========================================================================
  // 10. AI ANALYSIS WITH VALIDATION
  // =========================================================================
  async function analyzeROM() {
    if (!aiConfig.token) {
      const success = await fetchTokens();
      if (!success) throw new Error('AI service unavailable. Please try again.');
    }
    
    let jointDescription, framesToSend;
    let measurements = [];

    if (assessmentMode === 'isolate') {
      jointDescription = currentMovement.name;
      framesToSend = capturedFrames;
      const key = movementQueue[0];
      const m = await measureMovementROM(capturedFrames, key);
      measurements.push({ key, name: currentMovement.name, ...m });
    } else {
      const selectedOption = jointSelect.options[jointSelect.selectedIndex];
      jointDescription = `Full ${selectedOption.text} Assessment`;
      framesToSend = [];
      for (const key of movementQueue) {
        const frames = allCapturedFrames[key] || [];
        framesToSend = framesToSend.concat(frames);
        const m = await measureMovementROM(frames, key);
        measurements.push({ key, name: movementPrompts[key].name, ...m });
      }
    }

    // Any joint we could actually measure geometrically becomes the
    // authoritative number; the AI is told not to override it with a guess.
    const measurementLines = measurements.map(m => m.measured
      ? `${m.name}: ${m.degrees}° — computed from pose landmark analysis (start ${m.startAngle}° → end ${m.endAngle}°). Report this exact figure as the measured ROM; do not substitute your own visual estimate for it.`
      : `${m.name}: no reliable landmark measurement available for this joint/movement — provide your best visual estimate and clearly label it in your response as "AI visual estimate (not measured)".`
    ).join('\n');
    
    const systemPrompt = `You are rehablix ROM Analyzer, a clinical AI specialized in range of motion assessment for rehabilitation professionals.

IMPORTANT: First, verify that the provided images clearly show a human subject performing the specified movement (${jointDescription}). The joint/body part must be visible and adequately lit. If the images do NOT show a visible human joint (e.g., empty room, darkness, blurred, or no person), respond with exactly:
"ERROR: No joint detected in the provided images. Please ensure proper lighting and that the joint is clearly visible."
Do not provide any analysis or additional text in that case.

If a joint IS clearly visible, provide a comprehensive clinical analysis including:
1. **Range of Motion** in degrees — use the computed measurements provided below wherever available; only fall back to your own visual estimate where noted, and label those estimates explicitly
2. **Movement Quality Observations** - note any compensations, asymmetries, or deviations
3. **Comparison to Normative Values** - typical ROM for this joint
4. **Clinical Recommendations** - suggested interventions or further assessments

Format your response with clear headings (## for sections), bullet points for observations, and professional clinical language. Do NOT use tables.`;
    
    const userContent = `Joint/Movement: ${jointDescription}
Movement Sequence: ${assessmentMode === 'full' ? 'Multiple movements assessment' : currentMovement.prompts.join(' → ')}

Computed measurements (from pose landmark analysis of the captured frames):
${measurementLines}

The images show the progression from start position through full range of motion. Please analyze the patient's ROM and movement quality.`;
    
    const messages = [
      { role: "system", content: systemPrompt },
      { 
        role: "user", 
        content: [
          { type: "text", text: userContent },
          ...framesToSend.map(url => ({ type: "image_url", image_url: { url } }))
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
          tool: 'rom',
          context: 'analyze ROM images'
        });
      }
      throw new Error(err.error?.message || 'API error');
    }
    
    const data = await response.json();
    return { text: data.choices[0].message.content, measurements };
  }
  
  async function saveToHistory(result, measurements) {
    if (!currentUser) return null;
    
    try {
      const jointName = assessmentMode === 'isolate' ? currentMovement.name : `Full ${jointSelect.options[jointSelect.selectedIndex].text} Assessment`;
      const patientName = romPatientNameInput?.value.trim() || '';
      const measuredCount = (measurements || []).filter(m => m.measured).length;
      const newRef = await database.ref(`history/${scopeUid}/analysisHistory`).push({
        contentType: 'rom',
        fileName: `ROM - ${jointName}`,
        documentType: 'ROM Analysis',
        request: `Analyze ${jointName} range of motion from ${assessmentMode === 'isolate' ? capturedFrames.length : Object.values(allCapturedFrames).flat().length} captured frames`,
        results: result,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        date: new Date().toLocaleDateString(),
        frameCount: assessmentMode === 'isolate' ? capturedFrames.length : Object.values(allCapturedFrames).flat().length,
        assessmentMode: assessmentMode,
        patientName: patientName || null,
        measurements: measurements || [],
        measuredJointCount: measuredCount
      });
      
      showToast('Analysis saved to history', 'info', 2000);
      if (window.RehablixCenter) {
        window.RehablixCenter.logActivity('rom', 'Saved ROM analysis', patientName || jointName).catch(() => {});
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

    const jointName = assessmentMode === 'isolate' ? currentMovement.name : `Full ${jointSelect.options[jointSelect.selectedIndex].text} Assessment`;
    const dateStr = new Date().toLocaleString();

    const modalHtml = `
      <div class="preview-modal">
        <div class="preview-overlay"></div>
        <div class="preview-card">
          <div class="preview-card-header">
            <div class="preview-icon">📋</div>
            <h3>ROM Analysis Complete</h3>
            <button class="preview-close">&times;</button>
          </div>
          <div class="preview-card-body">
            <div class="preview-info">
              <span class="preview-badge">✅ Ready to view</span>
              <span class="preview-date">${dateStr}</span>
            </div>
            <p class="preview-description">
              Your analysis of <strong>${escapeHtml(jointName)}</strong> has been generated successfully.
            </p>
            <div class="preview-actions">
              <button class="preview-btn primary" id="viewFullAnalysisBtn">
                📖 View Full Analysis
              </button>
              <button class="preview-btn secondary" id="closePreviewBtn">
                Close
              </button>
            </div>
            <div class="preview-note">
              <small>🔒 The full report will open in a new tab for printing or saving as Word.</small>
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
        window.open(`result.html?type=rom&id=${historyKey}`, '_blank');
        closeModal();
      } else {
        showToast('Error: Analysis ID not found', 'error');
      }
    });
  }

  // =========================================================================
  // 12. HISTORY DRAWER
  // =========================================================================
  function loadRomHistory() {
    if (!currentUser) return;
    
    database.ref(`history/${scopeUid}/analysisHistory`)
      .orderByChild('timestamp')
      .on('value', (snapshot) => {
        historyList.innerHTML = '';
        const data = snapshot.val();
        
        if (!data) {
          historyList.innerHTML = '<div class="empty-state"><i class="bx bx-folder-open"></i><p>No ROM history found</p></div>';
          return;
        }
        
        const entries = Object.entries(data)
          .filter(([_, item]) => item.contentType === 'rom')
          .sort((a, b) => b[1].timestamp - a[1].timestamp);
        
        if (entries.length === 0) {
          historyList.innerHTML = '<div class="empty-state"><i class="bx bx-folder-open"></i><p>No ROM history found</p></div>';
          return;
        }
        
        entries.forEach(([key, item]) => {
          const div = document.createElement('div');
          div.className = 'history-item';
          div.innerHTML = `
            <div class="history-info">
              <span class="history-name">${escapeHtml(item.fileName || 'ROM Analysis')}</span>
              <div class="history-meta">
                <span class="meta-tag"><i class="bx bx-run"></i> ROM</span>
                <span>${escapeHtml(item.date)}</span>
                ${item.frameCount ? `<span>${item.frameCount} frames</span>` : ''}
                ${item.assessmentMode === 'full' ? '<span class="meta-tag">Full</span>' : ''}
              </div>
            </div>
            <button class="view-btn" data-key="${key}"><i class="bx bx-chevron-right"></i></button>
          `;
          
          div.querySelector('.view-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(`result.html?type=rom&id=${key}`, '_blank');
          });
          
          div.addEventListener('click', () => {
            window.open(`result.html?type=rom&id=${key}`, '_blank');
          });
          
          historyList.appendChild(div);
        });
      });
  }
  
  function toggleHistoryDrawer() {
    if (!currentUser) {
      showToast('Please login to view history', 'error');
      const loginBtn = document.getElementById('loginBtn');
      if (loginBtn) loginBtn.click();
      return;
    }
    loadRomHistory();
    historyDrawer.classList.add('active');
  }
  
  // =========================================================================
  // 13. EVENT LISTENERS
  // =========================================================================
  startCameraBtn.addEventListener('click', startCamera);
  
  proceedBtn.addEventListener('click', async () => {
    const allFrames = assessmentMode === 'isolate' ? capturedFrames : Object.values(allCapturedFrames).flat();
    const totalFrames = allFrames.length;
    
    if (totalFrames === 0) {
      showToast('No frames captured', 'error');
      return;
    }
    
    if (!currentUser) {
      showToast('Please login to analyze', 'error');
      const loginBtn = document.getElementById('loginBtn');
      if (loginBtn) loginBtn.click();
      return;
    }
    
    const qualityCheck = await validateImageQuality(allFrames);
    if (!qualityCheck.valid) {
      showToast(qualityCheck.reason, 'error', 5000);
      return;
    }
    if (qualityCheck.warning) {
      showToast(qualityCheck.reason, 'warning', 4000);
    }
    
    setStage(2);
    analysisStatus.textContent = 'Sending frames to AI...';
    progressBar.style.width = '25%';
    
    try {
      analysisStatus.textContent = 'Analyzing range of motion...';
      progressBar.style.width = '50%';
      
      const { text: aiText, measurements } = await analyzeROM();
      
      if (aiText.startsWith('ERROR:')) {
        const errorMessage = aiText.substring(6).trim();
        showToast(errorMessage, 'error', 6000);
        setStage(1);
        progressBar.style.width = '0%';
        return;
      }
      
      progressBar.style.width = '100%';

      // Prepend a compact, unambiguous summary of what was actually measured
      // vs. what's an AI visual estimate, so that distinction is never lost.
      const summaryBlock = '## Measured Range of Motion\n' + measurements.map(m => m.measured
        ? `- **${m.name}: ${m.degrees}°** (pose-landmark measured)`
        : `- **${m.name}:** AI visual estimate only — see notes below`
      ).join('\n') + '\n\n---\n\n';
      const result = summaryBlock + aiText;
      analysisResults = result;
      
      const historyKey = await saveToHistory(result, measurements);
      
      showPreviewModal(result, historyKey);
      
      setStage(1);
      resetCapture();
      if (currentMovement) {
        promptIndex = 0;
        currentPrompt.textContent = currentMovement.prompts[0];
        if (assessmentMode === 'full') {
          promptStep.textContent = `Movement 1/${movementQueue.length} · 0/${currentMovement.requiredFrames} frames`;
        } else {
          promptStep.textContent = `0/${currentMovement.requiredFrames}`;
        }
      }
      startCameraBtn.disabled = !currentMovement;
      startCameraBtn.style.display = 'block';
      hideCaptureButton();
      
      showToast('Analysis complete! View full report in new tab.', 'success');
      
    } catch (err) {
      console.error('Analysis error:', err);
      showToast('Analysis failed: ' + err.message, 'error');
      setStage(1);
    } finally {
      progressBar.style.width = '0%';
    }
  });
  
  newScanBtn.addEventListener('click', () => {
    resetCapture();
    setStage(1);
    
    if (currentMovement) {
      promptIndex = 0;
      currentPrompt.textContent = currentMovement.prompts[0];
      if (assessmentMode === 'full') {
        promptStep.textContent = `Movement 1/${movementQueue.length} · 0/${currentMovement.requiredFrames} frames`;
        movementInstruction.textContent = `Full Assessment: ${currentMovement.name} (1/${movementQueue.length})`;
      } else {
        promptStep.textContent = `0/${currentMovement.requiredFrames}`;
        movementInstruction.textContent = `Prepare for ${currentMovement.name}`;
      }
    }
    
    startCameraBtn.disabled = !currentMovement;
    startCameraBtn.style.display = 'block';
    hideCaptureButton();
  });
  
  if (downloadRomReport) {
    downloadRomReport.style.display = 'none';
  }
  
  if (toggleHistoryBtn) {
    toggleHistoryBtn.addEventListener('click', toggleHistoryDrawer);
  }
  
  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', () => {
      historyDrawer.classList.remove('active');
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
  
  // =========================================================================
  // 14. THEME & INITIALIZATION
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
  // 15. AUTH STATE LISTENER
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
      loadRomHistory();
      if (toggleHistoryBtn) toggleHistoryBtn.style.display = 'block';
    } else {
      console.log('User logged out');
      if (toggleHistoryBtn) toggleHistoryBtn.style.display = 'none';
    }
  });
  
  // =========================================================================
  // 16. INITIAL SETUP
  // =========================================================================
  fetchTokens();
  populateJointSelect('isolate');
  setStage(1);
  resetCapture();
  createCaptureButton();
  
  startCameraBtn.style.display = 'block';
  
  const scanOverlay = document.querySelector('.scan-overlay');
  if (scanOverlay) {
    scanOverlay.style.display = 'none';
  }
  
  if (toggleHistoryBtn) toggleHistoryBtn.style.display = 'none';
  
  window.addEventListener('beforeunload', () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
  });
  
  console.log('ROM Analyzer initialized with preview modal + AI validation');

  // Let the mode-tab switcher stop this camera/scan when the user switches to Gait mode.
  window.__romStopCamera = () => { if (isCameraActive) stopCamera(); };
  window.addEventListener('rehablix:modechange', (e) => {
    if (e.detail?.mode !== 'rom' && isCameraActive) stopCamera();
  });
});
