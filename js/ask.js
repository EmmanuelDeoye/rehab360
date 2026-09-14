// js/ask.js – Ask AI: chat with history, file attachments (incl. real
// image/video vision), voice input, editable prompts, link/URL reading,
// site-aware system knowledge, cross-page handoff, and "export to
// result.html" for AI answers.

// Marked configuration
if (typeof marked !== 'undefined') {
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
  });
}

document.addEventListener('DOMContentLoaded', async () => {

  // =========================================================================
  // DOM Elements
  // =========================================================================
  const chatMessages = document.getElementById('chatMessages');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const newChatBtn = document.getElementById('newChatBtn');
  const attachBtn = document.getElementById('attachBtn');
  const attachMenu = document.getElementById('attachMenu');
  const fileInput = document.getElementById('fileInput');
  const attachmentsStrip = document.getElementById('attachmentsStrip');
  const micBtn = document.getElementById('micBtn');
  const inputHint = document.getElementById('inputHint');
  const modelPickerBtn = document.getElementById('modelPickerBtn');
  const modelPickerMenu = document.getElementById('modelPickerMenu');
  const modelPickerLabel = document.getElementById('modelPickerLabel');

  const historyDrawer = document.getElementById('historyDrawer');
  const historyNavBtn = document.getElementById('historyNavBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const historyList = document.getElementById('historyList');
  const historySearchInput = document.getElementById('historySearchInput');

  const toastContainer = document.getElementById('toast-container');

  // =========================================================================
  // State
  // =========================================================================
  let currentUser = null;
  // Text-only model (fast, cheap) – used whenever nothing in the turn needs vision.
  let aiConfig = { token: null, endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash' };
  // Vision-capable model (GPT-4.1 via GitHub Models marketplace) – used when
  // an image or a video (sampled as frames) is attached.
  let visionConfig = { token: null, endpoint: null, model: 'gpt-4.1' };

  // Phase 8: user-selectable model tier for harder, multi-step requests.
  // "standard" (default) is the fast aiConfig above. The other two reuse
  // the SAME already-working token/endpoint fetches as the standard and
  // vision configs — just a different `model` string — rather than
  // introducing new Firebase token paths:
  //   - deepseek-reasoning: same DeepSeek key as aiConfig, model swapped
  //     to DeepSeek's reasoning model.
  //   - openai-gpt4-1: same OpenAI key already used for vision (tokens/open_ai).
  // A request that needs vision (an attached image/video) always uses
  // visionConfig regardless of the chosen tier — reasoning models
  // generally don't support image input, and silently ignoring an
  // attached image would be worse than keeping the picker's choice from
  // overriding vision when it matters.
  let selectedModelTier = 'standard';

  let currentConversationId = null;
  let conversationTitle = null;
  let titleIsFinal = false;
  let messages = [];                     // [{role, content, displayContent, attachmentMeta, timestamp, visionImages?, _rawFiles?}]
  let isWaiting = false;
  let attachedFiles = [];                // [{id, file, name, type, status, extractedText, visionImages, error}]

  const database = firebase.database();

  const isMobile = window.matchMedia('(pointer: coarse)').matches ||
                    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (inputHint) {
    inputHint.textContent = isMobile
      ? 'Tap ➤ to send · Enter adds a new line'
      : 'Shift+Enter for a new line · Enter to send';
  }

  const TOOL_PAGES = ['format.html', 'standardized.html', 'doc.html', 'rom.html', 'audio.html',
    'presentation.html', 'assignment.html', 'project.html', 'study.html', 'exam.html', 'ask.html'];

  // =========================================================================
  // Helpers
  // =========================================================================

  // Phase 9 fix: the AI already only links a tool when it's decided the
  // user wants the real generated thing, not a description (see the
  // "STRICT RULE" in buildSystemPrompt). Requiring a second tap on that
  // link to actually run it was pure friction for a request like "create
  // a file for the COTE scale" — the user asked for the file, got a
  // paragraph with a link to tap for the file. For inline-capable tools,
  // auto-run the first recommended one instead of waiting for a click;
  // the link stays in the text too, so nothing is hidden, and
  // handoff-only (full-page) tools still require an explicit tap since
  // those navigate away from the conversation entirely.
  function findFirstAutoRunToolLink(markdownText) {
    if (!window.RehablixTools) return null;
    const linkRegex = /\[[^\]]*\]\(([^)]+)\)/g;
    let m;
    while ((m = linkRegex.exec(markdownText)) !== null) {
      const href = m[1];
      const matchedPage = TOOL_PAGES.find(p => href === p || href.startsWith(p + '?'));
      if (!matchedPage) continue;
      if (window.RehablixTools.isDirect(matchedPage)) return { href, mode: 'direct' };
      if (window.RehablixTools.isInline(matchedPage)) return { href, mode: 'inline' };
    }
    return null;
  }
  function showToast(message, type = 'success', duration = 3500) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i><span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
  }

  async function fetchTokens() {
    try {
      const snapshot = await database.ref('tokens/deepseek').once('value');
      const data = snapshot.val();
      if (data?.api_key) {
        aiConfig.token = data.api_key;
        return true;
      }
      console.warn('DeepSeek API key missing');
      return false;
    } catch (error) {
      console.error('Token fetch error:', error);
      return false;
    }
  }

  async function fetchVisionTokens() {
    if (visionConfig.token) return true;
    try {
      const snapshot = await database.ref('tokens/open_ai').once('value');
      const data = snapshot.val();
      if (data?.api_key) {
        visionConfig.token = data.api_key;
        visionConfig.endpoint = 'https://api.openai.com/v1';
        return true;
      }
      console.warn('Vision (OpenAI) credentials missing');
      return false;
    } catch (error) {
      console.error('Vision token fetch error:', error);
      return false;
    }
  }

  // Lazy-load a third-party script only when actually needed
  const loadedScripts = {};
  function loadScript(src) {
    if (loadedScripts[src]) return loadedScripts[src];
    loadedScripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
    return loadedScripts[src];
  }

  // Render markdown for AI messages, style + classify links, and make
  // internal tool-page links hand off context instead of navigating cold.
  function renderAssistantHtml(content) {
    const html = marked.parse(content || '');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    wrapper.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href') || '';
      const isExternal = /^https?:\/\//i.test(href) && !href.includes(window.location.hostname);
      if (isExternal) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        a.classList.add('external-link');
      } else if (TOOL_PAGES.some(p => href === p || href.startsWith(p + '?'))) {
        const matchedPage = TOOL_PAGES.find(p => href === p || href.startsWith(p + '?'));
        // Inline-capable tools (brief request, latest round): stop
        // showing these as a clickable link entirely. They already
        // auto-run (see findFirstAutoRunToolLink/runDirectToolGeneration/
        // appendInlineToolResult)
        // the moment this reply finishes rendering, so a link here was
        // asking the user to do something the app was about to do for
        // them anyway — exactly the "still feels like a separate page"
        // problem, just one layer deeper. Render the tool's name as
        // plain bold text instead of a link; the result appears right
        // below automatically, the same way Claude/ChatGPT's own tool
        // calls show up after the explanation, not as a link to tap.
        if (window.RehablixTools && (window.RehablixTools.isInline(matchedPage) || window.RehablixTools.isDirect(matchedPage))) {
          const strong = document.createElement('strong');
          strong.textContent = a.textContent;
          a.replaceWith(strong);
          return;
        }
        // Handoff tools (Smart EMR, Motion & Gait, Project Maker, Exam
        // Simulator) genuinely navigate away from the conversation, so
        // those stay real, clickable links — the user should choose to
        // leave, not have it happen underneath them.
        a.classList.add('internal-link');
        a.dataset.handoffPage = matchedPage;
      }
    });
    return wrapper.innerHTML;
  }

  // =========================================================================
  // Site & company knowledge baked into the system prompt (feature 7 & 8)
  // =========================================================================
  function buildSystemPrompt() {
    return `You are the "Ask AI" assistant embedded inside rehablix (rehablix.com), an AI toolkit for rehabilitation professionals and healthcare students. You provide accurate, evidence-based answers about rehabilitation, medical conditions, treatments, clinical reasoning, and academic work. Use clear language and markdown formatting (headings, bullet points, bold, tables) to keep answers readable. Be concise but thorough.

You know the rehablix website well and should proactively recommend/redirect the user to the right internal page (as a markdown link, using the exact relative path below) whenever their request matches a dedicated tool — that tool will do a much better job than a chat answer alone. IMPORTANT: linking one of these already hands off what the user told you. Several of them (marked below) then run automatically right here in the conversation — for those, do NOT talk about them as a separate page/destination at all: don't say "open the page," "go to," "visit," or give step-by-step instructions for using it. Just say what you're doing, in the present tense, as something Lixa itself is doing right now — "Generating that with Standardized Tools now" — the same way you'd describe running any other capability. Reserve "opens its own page" language only for the tools actually marked that way below. Available capabilities:

${(window.RehablixTools && window.RehablixTools.buildPromptList()) || '(tool list unavailable — see js/lixa/tool-registry.js)'}

When a user's need clearly matches one of these, say so directly and link to it, e.g. "Generating that with the [Motion & Gait Analyzer](rom.html?mode=gait) now — it's built exactly for this." Don't link a page unless it's actually relevant, and never give step-by-step instructions for using it ("open the page, enter X, click Generate") — that describes work the handoff already does automatically.

STRICT RULE: most messages do NOT need a page recommendation. Do not mention or link ANY of these pages in greetings, small talk, or when the user is asking you to explain/describe something ("what is the COTE scale", "how does the Berg Balance Scale work") — answer those directly in chat. But when the user is asking to actually GET the thing — the real form/document/file itself ("give me the COTE scale", "I need the MMSE", "create an assessment for a stroke patient", "generate a Berg Balance Scale for this patient") — that is exactly what [Standardized Tools](standardized.html) or [Assessment Format Generator](format.html) are built to produce as a real, downloadable file, and a description typed into chat is not an adequate substitute; always link the tool in that case rather than answering from your own knowledge, even if you could describe the instrument accurately. The test is "does the user want to READ about it, or GET it" — not whether you're capable of answering. Even then, mention at most one page per response. If in doubt about which category a message falls into, lean toward linking the tool.

About rehablix itself: rehablix was built by rehabverve enterprise, founded by Emmanuel Adeoye — an occupational therapist by profession and a programmer by passion. Only share this if asked about the creator, company, or "who made this."

You should also know about two related businesses and point users to them when relevant (always as a clickable markdown link, opening in a new tab):
- **rehabverve.com.ng** — for anyone who wants to hire a rehabilitation professional directly, or needs bespoke professional/consulting help beyond what the AI tools can do. Link: [rehabverve.com.ng](https://rehabverve.com.ng)
- **rehabace.com** — for sensory room construction/design or therapy equipment and supplies. Link: [rehabace.com](https://rehabace.com)

Only mention rehabverve.com.ng or rehabace.com when the user's request genuinely matches (e.g. "I need to hire a therapist", "who can build a sensory room", "where can I buy therapy equipment") — don't force them into unrelated answers.

If the user's message includes content extracted from an uploaded file, an image, video frames, or a URL they shared (you'll see it clearly marked, e.g. "[Attached file: ...]" or "[Content from URL: ...]"), use that content as context to answer their actual question — don't just describe it back to them unless asked to.`;
  }

  // =========================================================================
  // URL detection & reading (feature 9)
  // =========================================================================
  function extractUrls(text) {
    const matches = text.match(/(https?:\/\/[^\s)]+)/g) || [];
    return [...new Set(matches)].slice(0, 2);
  }

  async function fetchUrlContent(url) {
    const readerUrl = `https://r.jina.ai/${url}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(readerUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error('reader error ' + res.status);
      const text = await res.text();
      return text.slice(0, 3000);
    } catch (err) {
      clearTimeout(timeout);
      console.warn('URL fetch failed for', url, err);
      return null;
    }
  }

  // =========================================================================
  // File attachments (feature 1) + real image/video vision (feature 5)
  // =========================================================================
  function fileTypeIcon(file) {
    const t = file.type;
    const n = file.name.toLowerCase();
    if (t.startsWith('image/')) return 'fa-file-image';
    if (t.startsWith('video/')) return 'fa-file-video';
    if (t.startsWith('audio/')) return 'fa-file-audio';
    if (n.endsWith('.pdf')) return 'fa-file-pdf';
    if (n.endsWith('.doc') || n.endsWith('.docx')) return 'fa-file-word';
    if (n.endsWith('.zip')) return 'fa-file-zipper';
    if (n.endsWith('.csv')) return 'fa-file-csv';
    return 'fa-file-lines';
  }

  function renderAttachmentsStrip() {
    if (!attachmentsStrip) return;
    if (attachedFiles.length === 0) {
      attachmentsStrip.hidden = true;
      attachmentsStrip.innerHTML = '';
      return;
    }
    attachmentsStrip.hidden = false;
    attachmentsStrip.innerHTML = '';
    attachedFiles.forEach(att => {
      const chip = document.createElement('div');
      chip.className = 'attachment-chip';
      const statusText = att.status === 'reading' ? 'Reading…' : att.status === 'error' ? 'Not readable' : 'Ready';
      const statusIcon = att.status === 'reading' ? '<i class="fas fa-spinner fa-spin"></i> ' : '';
      chip.innerHTML = `
        <i class="fas ${fileTypeIcon(att.file)} file-type-icon"></i>
        <span class="attachment-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
        <span class="attachment-status">${statusIcon}${statusText}</span>
        <button class="remove-attachment" data-id="${att.id}" aria-label="Remove attachment"><i class="fas fa-times"></i></button>
      `;
      attachmentsStrip.appendChild(chip);
    });
    attachmentsStrip.querySelectorAll('.remove-attachment').forEach(btn => {
      btn.addEventListener('click', () => {
        attachedFiles = attachedFiles.filter(a => a.id !== btn.dataset.id);
        renderAttachmentsStrip();
      });
    });
    // Real-time feedback: don't let the user fire off a send while a file
    // is still being read/OCR'd — the 45s wait in handleSend is a safety
    // net, this is what actually prevents the premature-send race in the
    // first place for anyone who clicks Send quickly.
    const stillReading = attachedFiles.some(a => a.status === 'reading');
    if (sendBtn) sendBtn.disabled = stillReading || isWaiting || (messageInput.value.trim() === '' && attachedFiles.length === 0);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // Resize/compress an image (or a canvas frame) down to a sane size before
  // sending it to the vision model, to keep payloads fast and cheap.
  function downscaleImage(source, maxDim = 1024, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = source;
    });
  }

  async function extractPdfText(file) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const buf = await readFileAsArrayBuffer(file);
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    const maxPages = Math.min(pdf.numPages, 15);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it => it.str).join(' ') + '\n';
      if (text.length > 8000) break;
    }
    return text.trim();
  }

  async function extractDocxText(file) {
    await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
    const buf = await readFileAsArrayBuffer(file);
    const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return (result.value || '').trim();
  }

  async function extractZipText(file) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const buf = await readFileAsArrayBuffer(file);
    const zip = await window.JSZip.loadAsync(buf);
    const entries = Object.values(zip.files).filter(f => !f.dir);
    let summary = `Zip archive with ${entries.length} file(s): ${entries.slice(0, 30).map(f => f.name).join(', ')}\n\n`;
    let charsUsed = summary.length;
    for (const entry of entries) {
      if (charsUsed > 6000) break;
      if (/\.(txt|md|csv|json|log)$/i.test(entry.name) && entry._data && entry._data.uncompressedSize < 200000) {
        try {
          const content = await entry.async('text');
          const snippet = content.slice(0, 1500);
          summary += `--- ${entry.name} ---\n${snippet}\n\n`;
          charsUsed += snippet.length;
        } catch (e) { /* skip unreadable entry */ }
      }
    }
    return summary.trim();
  }

  // Real vision path: downscale the image for the model, and also run OCR
  // so any legible text still ends up in the text-only fallback/context.
  async function processImageAttachment(file) {
    const dataUrl = await readFileAsDataUrl(file);
    const visionUrl = await downscaleImage(dataUrl).catch(() => dataUrl);
    let ocrText = '';
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
      const { data } = await window.Tesseract.recognize(dataUrl, 'eng');
      ocrText = (data.text || '').trim();
    } catch (e) { /* OCR is best-effort */ }
    return {
      visionImages: [visionUrl],
      text: `[Image attached: ${file.name}]` + (ocrText ? ` Detected text: ${ocrText}` : ' (analyzed visually)')
    };
  }

  // Sample a handful of frames from a video so the vision model can "see"
  // it, since there's no direct video-understanding endpoint available here.
  function extractVideoFrames(file, frameCount = 4) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      const url = URL.createObjectURL(file);
      video.src = url;

      video.onloadedmetadata = async () => {
        try {
          const duration = video.duration;
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(video.videoWidth, 960) || 640;
          canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth || 0.5625));
          const ctx = canvas.getContext('2d');
          const frames = [];
          for (let i = 0; i < frameCount; i++) {
            const t = (duration / (frameCount + 1)) * (i + 1);
            await new Promise((res) => {
              video.currentTime = t;
              video.onseeked = res;
            });
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push(canvas.toDataURL('image/jpeg', 0.75));
          }
          URL.revokeObjectURL(url);
          resolve(frames);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('video load failed')); };
    });
  }

  async function processAttachment(att) {
    try {
      const file = att.file;
      const name = file.name.toLowerCase();
      if (file.type === 'text/plain' || /\.(txt|md|csv|log)$/i.test(name)) {
        att.extractedText = (await readFileAsText(file)).slice(0, 6000);
      } else if (name.endsWith('.pdf')) {
        att.extractedText = await extractPdfText(file);
      } else if (name.endsWith('.docx') || name.endsWith('.doc')) {
        att.extractedText = await extractDocxText(file);
      } else if (name.endsWith('.zip')) {
        att.extractedText = await extractZipText(file);
      } else if (file.type.startsWith('image/')) {
        const result = await processImageAttachment(file);
        att.extractedText = result.text;
        att.visionImages = result.visionImages;
      } else if (file.type.startsWith('video/')) {
        const frames = await extractVideoFrames(file, 4).catch(() => []);
        if (frames.length > 0) {
          att.visionImages = frames;
          att.extractedText = `[Video attached: ${file.name} — ${frames.length} frames sampled across its duration for visual analysis.]`;
        } else {
          att.extractedText = `[Video file "${file.name}" attached, but frames could not be extracted in this browser.]`;
        }
      } else if (file.type.startsWith('audio/')) {
        att.extractedText = `[Audio file "${file.name}" attached. Its contents cannot be transcribed automatically here — ask the user to describe what's in it if you need details.]`;
      } else {
        att.extractedText = `[File "${file.name}" attached — this file type can't be read automatically.]`;
      }
      att.status = 'ready';
    } catch (err) {
      console.warn('Attachment extraction failed:', err);
      att.status = 'error';
      att.extractedText = `[File "${att.name}" was attached but could not be read.]`;
    }
    renderAttachmentsStrip();
  }

  function handleFilesSelected(fileList) {
    Array.from(fileList).forEach(file => {
      if (file.size > 25 * 1024 * 1024) {
        showToast(`${file.name} is too large (max 25MB)`, 'error');
        return;
      }
      const att = {
        id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        file,
        name: file.name,
        type: file.type,
        status: 'reading',
        extractedText: '',
        visionImages: null
      };
      attachedFiles.push(att);
      processAttachment(att);
    });
    renderAttachmentsStrip();
  }

  // ---- Attach menu (Camera / Photos / Videos / Files) ----
  function closeAttachMenu() {
    if (attachMenu) attachMenu.hidden = true;
    if (attachBtn) attachBtn.classList.remove('active');
  }

  if (attachBtn && attachMenu) {
    attachBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = attachMenu.hidden;
      closeAttachMenu();
      if (willOpen) {
        attachMenu.hidden = false;
        attachBtn.classList.add('active');
      }
    });

    attachMenu.querySelectorAll('button[data-mode]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = btn.dataset.mode;
        if (mode === 'camera') {
          fileInput.setAttribute('accept', 'image/*');
          fileInput.setAttribute('capture', 'environment');
        } else if (mode === 'photos') {
          fileInput.setAttribute('accept', 'image/*');
          fileInput.removeAttribute('capture');
        } else if (mode === 'videos') {
          fileInput.setAttribute('accept', 'video/*');
          fileInput.removeAttribute('capture');
        } else {
          fileInput.setAttribute('accept', 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.csv,.md');
          fileInput.removeAttribute('capture');
        }
        closeAttachMenu();
        fileInput.click();
      });
    });

    document.addEventListener('click', (e) => {
      if (!attachMenu.hidden && !attachMenu.contains(e.target) && e.target !== attachBtn) closeAttachMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAttachMenu();
    });
  }

  // ---- Model picker (Phase 8: Standard / DeepSeek Reasoning / GPT-4.1) ----
  const MODEL_TIER_LABELS = {
    'standard': 'Standard',
    'deepseek-reasoning': 'DeepSeek Reasoning',
    'openai-gpt4-1': 'GPT-4.1'
  };
  const MODEL_TIER_STORAGE_KEY = 'rehab-lixa-model-tier';

  function closeModelPicker() {
    if (modelPickerMenu) modelPickerMenu.hidden = true;
    if (modelPickerBtn) modelPickerBtn.setAttribute('aria-expanded', 'false');
  }

  // Applies a tier to the UI (label + selected option + aria state)
  // without necessarily being a user click — also used to restore the
  // saved choice from localStorage on load.
  function applyModelTier(tier, options) {
    options = options || {};
    if (!MODEL_TIER_LABELS[tier]) tier = 'standard';
    selectedModelTier = tier;
    const label = MODEL_TIER_LABELS[tier];
    if (modelPickerLabel) modelPickerLabel.textContent = label;
    if (modelPickerBtn) modelPickerBtn.setAttribute('aria-label', `Choose AI model — currently ${label}`);
    if (modelPickerMenu) {
      modelPickerMenu.querySelectorAll('.model-picker-option').forEach((b) => {
        const isSelected = b.dataset.tier === tier;
        b.classList.toggle('is-selected', isSelected);
        b.setAttribute('aria-pressed', String(isSelected));
      });
    }
    if (options.persist) {
      try { localStorage.setItem(MODEL_TIER_STORAGE_KEY, tier); } catch (e) { /* storage unavailable, ignore */ }
    }
    if (options.toast && tier !== 'standard') {
      showToast(`Switched to ${label} for this conversation.`, 'info', 3000);
    }
  }

  if (modelPickerBtn && modelPickerMenu) {
    // Restore the last-chosen model tier (saved per browser, not per
    // conversation) so it doesn't silently reset to Standard on reload.
    let savedTier = null;
    try { savedTier = localStorage.getItem(MODEL_TIER_STORAGE_KEY); } catch (e) { /* storage unavailable, ignore */ }
    if (savedTier) applyModelTier(savedTier);

    modelPickerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = modelPickerMenu.hidden;
      closeModelPicker();
      if (willOpen) {
        modelPickerMenu.hidden = false;
        modelPickerBtn.setAttribute('aria-expanded', 'true');
      }
    });

    modelPickerMenu.querySelectorAll('.model-picker-option').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyModelTier(btn.dataset.tier, { persist: true, toast: true });
        closeModelPicker();
      });
    });

    document.addEventListener('click', (e) => {
      if (!modelPickerMenu.hidden && !modelPickerMenu.contains(e.target) && e.target !== modelPickerBtn) closeModelPicker();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModelPicker();
    });
  }

  if (fileInput) fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFilesSelected(e.target.files);
    fileInput.value = '';
  });

  // Drag & drop onto the chat area
  chatMessages.addEventListener('dragover', (e) => e.preventDefault());
  chatMessages.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) handleFilesSelected(e.dataTransfer.files);
  });

  // =========================================================================
  // Voice input (feature 3)
  // =========================================================================
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isRecording = false;

  if (SpeechRecognitionAPI && micBtn) {
    recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let baseText = '';

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += transcript;
        else interimTranscript += transcript;
      }
      const sep = baseText && !baseText.endsWith(' ') ? ' ' : '';
      messageInput.value = baseText + sep + finalTranscript + interimTranscript;
      messageInput.dispatchEvent(new Event('input'));
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error !== 'no-speech') showToast('Voice input error: ' + event.error, 'error');
      stopRecording();
    };

    recognition.onend = () => stopRecording();

    function startRecording() {
      baseText = messageInput.value.trim();
      if (baseText) baseText += ' ';
      isRecording = true;
      micBtn.classList.add('recording');
      micBtn.querySelector('i').className = 'fas fa-stop';
      try { recognition.start(); } catch (e) { /* already started */ }
      showToast('Listening… tap the mic to stop', 'info', 2000);
    }

    function stopRecording() {
      isRecording = false;
      micBtn.classList.remove('recording');
      micBtn.querySelector('i').className = 'fas fa-microphone';
      try { recognition.stop(); } catch (e) { /* ignore */ }
    }

    micBtn.addEventListener('click', () => {
      if (isRecording) stopRecording();
      else startRecording();
    });
  } else if (micBtn) {
    micBtn.addEventListener('click', () => {
      showToast('Voice input is not supported in this browser', 'error');
    });
  }

  // =========================================================================
  // Render messages (with action buttons, attachments, and suggestions)
  // =========================================================================
  function renderMessages() {
    chatMessages.innerHTML = '';
    if (messages.length === 0) {
      chatMessages.innerHTML = `
        <div class="empty-chat">
          <div class="empty-chat-icon">💬</div>
          <p>Ask me anything about rehabilitation, conditions, assignments, or clinical reasoning.</p>
          <p class="empty-chat-hint">Your conversation will be saved automatically when you're logged in.</p>
        </div>
      `;
      return;
    }

    messages.forEach((msg, index) => {
      // Phase 7: an inline tool result isn't a normal text bubble — build
      // its sandboxed card and skip the rest of the per-message rendering
      // below (no bubble/edit-box/action-buttons apply to it).
      if (msg.role === 'tool-result') {
        chatMessages.appendChild(buildInlineToolCardElementSafe(msg.content));
        return;
      }
      if (msg.role === 'direct-result') {
        chatMessages.appendChild(buildDirectResultCardElementSafe(msg));
        return;
      }

      const msgDiv = document.createElement('div');
      msgDiv.className = `message ${msg.role}`;
      msgDiv.setAttribute('data-index', index);
      if (msg.role === 'assistant') {
        msgDiv.setAttribute('data-raw-content', msg.content);
      }

      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';
      if (msg.role === 'assistant') {
        bubble.innerHTML = renderAssistantHtml(msg.content);
      } else {
        bubble.textContent = msg.displayContent || msg.content;
      }
      msgDiv.appendChild(bubble);

      if (msg.role === 'user') {
        const editBox = document.createElement('div');
        editBox.className = 'user-edit-box';
        editBox.innerHTML = `
          <textarea class="edit-textarea">${escapeHtml(msg.displayContent || msg.content)}</textarea>
          <div class="edit-actions">
            <button class="cancel-edit-btn">Cancel</button>
            <button class="save-edit-btn">Save &amp; resend</button>
          </div>
        `;
        msgDiv.appendChild(editBox);

        if (msg.attachmentMeta && msg.attachmentMeta.length > 0) {
          const attWrap = document.createElement('div');
          attWrap.className = 'message-attachments';
          msg.attachmentMeta.forEach(a => {
            const chip = document.createElement('div');
            chip.className = 'attachment-chip';
            chip.innerHTML = `<i class="fas ${a.icon || 'fa-file-lines'} file-type-icon"></i><span class="attachment-name">${escapeHtml(a.name)}</span>`;
            attWrap.appendChild(chip);
          });
          msgDiv.appendChild(attWrap);
        }
      }

      if (msg.role === 'assistant') {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        actionsDiv.innerHTML = `
          <button class="action-btn copy-btn" title="Copy response"><i class="fas fa-copy"></i> Copy</button>
          <button class="action-btn download-btn" title="Open in editor to export"><i class="fas fa-download"></i> Word</button>
          <button class="action-btn regenerate-btn" title="Regenerate response"><i class="fas fa-redo"></i> Regenerate</button>
        `;
        msgDiv.appendChild(actionsDiv);

        const isLastAiMessage = index === messages.length - 1 && msg.role === 'assistant';
        if (isLastAiMessage && msg.suggestions && msg.suggestions.length > 0) {
          const suggestionsDiv = document.createElement('div');
          suggestionsDiv.className = 'suggestions-container';

          const suggestionsLabel = document.createElement('p');
          suggestionsLabel.className = 'suggestions-label';
          suggestionsLabel.textContent = '💡 Suggested follow‑up questions:';
          suggestionsDiv.appendChild(suggestionsLabel);

          const suggestionsRow = document.createElement('div');
          suggestionsRow.className = 'suggestions-row';

          msg.suggestions.forEach(suggestion => {
            const chip = document.createElement('button');
            chip.className = 'suggestion-chip';
            chip.textContent = suggestion;
            chip.title = 'Click to ask this question';
            chip.addEventListener('click', () => {
              if (isWaiting) return;
              messageInput.value = suggestion;
              handleSend();
            });
            suggestionsRow.appendChild(chip);
          });

          suggestionsDiv.appendChild(suggestionsRow);
          msgDiv.appendChild(suggestionsDiv);
        }
      }

      const time = document.createElement('div');
      time.className = 'message-time';
      if (msg.timestamp) {
        const date = new Date(msg.timestamp);
        time.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      msgDiv.appendChild(time);

      chatMessages.appendChild(msgDiv);
    });

    setTimeout(() => {
      const lastAssistantMsg = chatMessages.querySelector('.message.assistant:last-of-type');
      if (lastAssistantMsg) {
        lastAssistantMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }, 50);
  }

  // =========================================================================
  // Long-press to edit/copy a previous user prompt (feature 4)
  // =========================================================================
  let longPressTimer = null;
  let activePopover = null;

  function closeActivePopover() {
    if (activePopover) {
      activePopover.remove();
      activePopover = null;
    }
  }

  function openUserMsgPopover(msgDiv, index) {
    closeActivePopover();
    const popover = document.createElement('div');
    popover.className = 'user-msg-popover';
    popover.innerHTML = `
      <button class="popover-copy-btn" title="Copy"><i class="fas fa-copy"></i></button>
      <button class="popover-edit-btn" title="Edit"><i class="fas fa-pen"></i></button>
    `;
    msgDiv.appendChild(popover);
    activePopover = popover;

    popover.querySelector('.popover-copy-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const text = messages[index].displayContent || messages[index].content;
      navigator.clipboard.writeText(text)
        .then(() => showToast('Prompt copied', 'success'))
        .catch(() => showToast('Copy failed', 'error'));
      closeActivePopover();
    });

    popover.querySelector('.popover-edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      closeActivePopover();
      msgDiv.classList.add('editing');
      const textarea = msgDiv.querySelector('.edit-textarea');
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  }

  chatMessages.addEventListener('mousedown', (e) => startLongPress(e));
  chatMessages.addEventListener('touchstart', (e) => startLongPress(e), { passive: true });
  chatMessages.addEventListener('mouseup', cancelLongPress);
  chatMessages.addEventListener('mouseleave', cancelLongPress);
  chatMessages.addEventListener('touchend', cancelLongPress);
  chatMessages.addEventListener('touchmove', cancelLongPress);

  function startLongPress(e) {
    const msgDiv = e.target.closest('.message.user');
    if (!msgDiv || msgDiv.classList.contains('editing')) return;
    const index = parseInt(msgDiv.getAttribute('data-index'), 10);
    longPressTimer = setTimeout(() => {
      openUserMsgPopover(msgDiv, index);
    }, 550);
  }

  function cancelLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  document.addEventListener('click', (e) => {
    if (activePopover && !activePopover.contains(e.target)) closeActivePopover();
  });

  chatMessages.addEventListener('click', (e) => {
    const cancelBtn = e.target.closest('.cancel-edit-btn');
    if (cancelBtn) {
      cancelBtn.closest('.message.user').classList.remove('editing');
      return;
    }
    const saveBtn = e.target.closest('.save-edit-btn');
    if (saveBtn) {
      const msgDiv = saveBtn.closest('.message.user');
      const index = parseInt(msgDiv.getAttribute('data-index'), 10);
      const newText = msgDiv.querySelector('.edit-textarea').value.trim();
      if (!newText) { showToast('Prompt cannot be empty', 'error'); return; }
      editAndResend(index, newText);
      return;
    }

    // --- Internal tool-page link: hand off context, then navigate (feature 7) ---
    const link = e.target.closest('a.internal-link');
    if (link) {
      e.preventDefault();
      handoffAndNavigate(link);
    }
  });

  async function editAndResend(index, newText) {
    if (isWaiting) { showToast('Please wait for the current response to finish', 'error'); return; }
    messages = messages.slice(0, index);
    messages.push({ role: 'user', content: newText, displayContent: newText, timestamp: Date.now() });
    renderMessages();
    if (currentUser) await saveConversation();
    await runAssistantTurn(newText);
  }

  // Shared by the handoff/inline/direct paths: the most recent thing the
  // user actually typed, used as the input to whichever capability runs.
  function lastUserMessageText() {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i].displayContent || messages[i].content || '';
      }
    }
    return '';
  }

  // Light, best-effort cleanup for tools (currently just "standardized")
  // that take a short name/topic rather than free-form text — strips
  // common imperative lead-ins ("create a file for", "generate", "give
  // me the") so "Create a file for the COTE scale" becomes "the COTE
  // scale" rather than being passed to the generator (and shown in the
  // result card's own title) verbatim. Deliberately simple regex
  // heuristics, not real NLU — falls back to the original text if
  // stripping would leave nothing useful, so it can only ever help, not
  // break a request that doesn't match the pattern.
  function cleanToolNameHint(text) {
    const original = (text || '').trim();
    const cleaned = original
      .replace(/^(please\s+)?(can you\s+|could you\s+)?(create|generate|make|build|produce|give me|i need|i want)\b\s*/i, '')
      .replace(/^(a|an|the)\s+/i, '')
      .replace(/^file\s+(for|of|with)\s+/i, '')
      .replace(/^(a|an|the)\s+/i, '')
      .replace(/[.?!]+$/, '')
      .trim();
    return cleaned || original;
  }

  // Gather context from the most recent user turn and send it ahead of
  // navigating to the chosen tool page.
  async function handoffAndNavigate(link) {
    const targetPage = link.dataset.handoffPage || link.getAttribute('href');
    let text = lastUserMessageText();
    let rawFile = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        if (messages[i]._rawFiles && messages[i]._rawFiles.length) rawFile = messages[i]._rawFiles[0];
        break;
      }
    }
    const payload = { text };
    if (rawFile && window.RehablixHandoff) {
      try {
        payload.fileDataUrl = await readFileAsDataUrl(rawFile);
        payload.fileName = rawFile.name;
        payload.fileMime = rawFile.type;
      } catch (e) { /* file transfer is best-effort */ }
    }
    if (window.RehablixHandoff) window.RehablixHandoff.send(targetPage, payload);

    // Phase 3: capabilities registered as "inline" in js/lixa/tool-registry.js
    // run right inside the conversation (same handoff context, same tool
    // page/JS, just shown in a sandboxed frame instead of a full-page
    // navigation) rather than leaving the chat. Everything else keeps the
    // exact Phase 1/2 handoff-and-navigate behavior.
    if (window.RehablixTools && window.RehablixTools.isInline(targetPage)) {
      appendInlineToolResult(targetPage);
      return;
    }

    window.location.href = link.getAttribute('href');
  }

  // Phase 7 fix: inline tool cards are now a real entry in `messages`
  // (role: 'tool-result', content: <page>) instead of a DOM node
  // appended straight to #chatMessages. Previously, since renderMessages()
  // wipes and rebuilds #chatMessages from `messages` on every send/edit/
  // regenerate, a directly-appended card would be silently destroyed the
  // very next time the user sent anything — exactly the kind of
  // continuity break Phase 7 set out to check for. Persisting it as a
  // message means it survives re-renders, gets included (as a short
  // descriptive note, not the raw role) in what the AI sees on later
  // turns via buildApiContent(), and is saved/reloaded with the rest of
  // the conversation history like any other turn.
  function appendInlineToolResult(targetPage) {
    messages.push({ role: 'tool-result', content: targetPage, timestamp: Date.now() });
    renderMessages();
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (currentUser) saveConversation();
  }

  // This round's core change: for "direct" tools, Lixa calls the tool's
  // own extracted generation function IN-PROCESS — no iframe, no
  // separate page context. The function does the exact same AI call +
  // history save the standalone page's own button does (see
  // generateForLixa in js/standardized.js); nothing about the generator
  // itself is reimplemented here, this just calls it and renders
  // whatever it returns as a native Lixa result message.
  async function runDirectToolGeneration(targetPage) {
    const tool = window.RehablixTools && window.RehablixTools.byPage(targetPage);
    const api = tool && window.RehablixGenerators && window.RehablixGenerators[tool.generatorKey];
    const resultMsg = { role: 'direct-result', content: targetPage, timestamp: Date.now(), result: null };
    messages.push(resultMsg);
    renderMessages(); // shows the card in a "working" state immediately

    if (!api || typeof api.generate !== 'function') {
      resultMsg.result = { status: 'error', message: `${tool ? tool.name : 'This tool'} isn't ready yet — its script may not have loaded.` };
      renderMessages();
      return;
    }

    try {
      const result = await api.generate(cleanToolNameHint(lastUserMessageText()), false);
      resultMsg.result = result;
    } catch (err) {
      console.error('[Lixa] direct generation failed:', err);
      resultMsg.result = { status: 'error', message: err && err.message ? err.message : 'Something went wrong generating this.' };
    }
    renderMessages();
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (currentUser) saveConversation();
  }

  // Builds (but does not insert) the sandboxed inline-tool-card element
  // for a given `messages` entry. Reuses the existing dedicated page and
  // its JS completely unmodified in normal operation — the target page
  // only gets a `?embed=1` flag it uses to hide its own navbar (see the
  // embed-mode block added to e.g. standardized.html).
  //
  // Shows a simple, user-facing progress checklist (brief section 7)
  // while the tool page loads, instead of just a bare spinner — no
  // internal reasoning is exposed, just what's happening. Known
  // limitation: because renderMessages() rebuilds every message's DOM
  // node from scratch on each send/edit/regenerate, an already-loaded
  // inline tool re-plays this load (the iframe re-fetches) rather than
  // staying exactly as the user left it — acceptable for today's
  // largely stateless generation tools, but worth revisiting if a truly
  // stateful inline tool is added later.
  function buildInlineToolCardElement(targetPage) {
    const tool = window.RehablixTools && window.RehablixTools.byPage(targetPage);
    const toolName = tool ? tool.name : 'Tool';
    const [path, existingQuery] = targetPage.split('?');
    const embedSrc = path + '?' + (existingQuery ? existingQuery + '&' : '') + 'embed=1';

    const steps = ['Understanding your request', `Running ${toolName}`, 'Preparing the result'];

    const card = document.createElement('div');
    card.className = 'message assistant inline-tool-card';
    card.innerHTML = `
      <div class="inline-tool-card-header">
        <span class="inline-tool-card-title"><i class="fas fa-wand-magic-sparkles"></i> ${escapeHtml(toolName)}</span>
        <a class="inline-tool-card-openfull" href="${path}" target="_blank" rel="noopener">Open in new tab <i class="fas fa-arrow-up-right-from-square"></i></a>
      </div>
      <div class="inline-tool-card-status" hidden></div>
      <ul class="progress-steps">
        ${steps.map((s, i) => `<li data-step="${i}"><i class="fas fa-circle-notch"></i> ${escapeHtml(s)}</li>`).join('')}
      </ul>
      <div class="inline-tool-card-fallback" hidden>
        <p>This is taking longer than expected to load inline.</p>
        <a href="${path}" target="_blank" rel="noopener" class="inline-tool-card-fallback-btn">Open ${escapeHtml(toolName)} in a new tab <i class="fas fa-arrow-up-right-from-square"></i></a>
      </div>
      <iframe class="inline-tool-card-frame" src="${embedSrc}" title="${escapeHtml(toolName)}" hidden></iframe>
    `;

    const statusBox = card.querySelector('.inline-tool-card-status');
    const progressList = card.querySelector('.progress-steps');
    const fallback = card.querySelector('.inline-tool-card-fallback');
    const stepEls = progressList.querySelectorAll('li');
    const iframe = card.querySelector('.inline-tool-card-frame');

    let stepIndex = 0;
    let settled = false;
    stepEls[0].classList.add('active');
    const stepTimer = setInterval(() => {
      if (stepIndex >= stepEls.length - 1) { clearInterval(stepTimer); return; }
      stepEls[stepIndex].classList.remove('active');
      stepEls[stepIndex].classList.add('done');
      stepIndex++;
      stepEls[stepIndex].classList.add('active');
    }, 550);

    // Phase 10 fix: if the iframe never fires 'load' (blocked by the
    // server's X-Frame-Options/CSP, a network error, etc.), the card was
    // previously left stuck on the progress checklist forever with no
    // visible sign anything went wrong — reported as "a thin line" with
    // nothing happening. Now: an 8s timeout surfaces a clear fallback
    // with a working link instead of hanging silently.
    const loadTimeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearInterval(stepTimer);
      progressList.hidden = true;
      fallback.hidden = false;
    }, 8000);

    function onSettled() {
      if (settled) return;
      settled = true;
      clearTimeout(loadTimeout);
      clearInterval(stepTimer);
      stepEls.forEach((el) => { el.classList.remove('active'); el.classList.add('done'); });
      setTimeout(() => {
        progressList.remove();
        iframe.hidden = false;
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }, 300);
    }

    iframe.addEventListener('load', onSettled, { once: true });
    iframe.addEventListener('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(loadTimeout);
      clearInterval(stepTimer);
      progressList.hidden = true;
      fallback.hidden = false;
    }, { once: true });

    // Phase 11: listen for the tool page telling us what actually
    // happened (see notifyLixaInlineStatus() in js/standardized.js) —
    // the iframe's own `load` event only means the PAGE loaded, not that
    // generation succeeded. Without this, failures like "not logged in"
    // or "hit your monthly limit" were only shown as a toast buried
    // inside the small embedded frame, easy to miss entirely. Renders a
    // clear status banner in the card itself instead. Pages that don't
    // send this (not yet wired up) simply never trigger it — harmless.
    function renderStatusBanner(status, data) {
      data = data || {};
      let html = '';
      if (status === 'success') {
        html = `<div class="status-banner status-success"><i class="fas fa-circle-check"></i> ${escapeHtml(data.toolName || toolName)} generated successfully.</div>`;
      } else if (status === 'auth-required') {
        html = `<div class="status-banner status-warn"><i class="fas fa-circle-info"></i> You'll need to log in to generate this. <button type="button" class="status-banner-action" id="statusLoginBtn">Log in</button></div>`;
      } else if (status === 'limit-reached') {
        html = `<div class="status-banner status-warn"><i class="fas fa-circle-info"></i> You've reached your monthly generation limit${data.daysLeft ? ` (resets in ${data.daysLeft} days)` : ''}. <a href="sub.html" target="_blank" rel="noopener">Upgrade plan →</a></div>`;
      } else if (status === 'error') {
        html = `<div class="status-banner status-error"><i class="fas fa-triangle-exclamation"></i> ${escapeHtml(data.message || 'Something went wrong generating this.')}</div>`;
      } else {
        return;
      }
      statusBox.innerHTML = html;
      statusBox.hidden = false;
      const loginBtnInBanner = statusBox.querySelector('#statusLoginBtn');
      if (loginBtnInBanner) {
        loginBtnInBanner.addEventListener('click', () => {
          // Trigger the PARENT page's own login modal (full-screen, fully
          // functional) rather than relying on the one buried inside the
          // small embedded iframe.
          document.getElementById('loginBtn')?.click();
        });
      }
      if (status === 'error' || status === 'auth-required' || status === 'limit-reached') {
        onSettled(); // stop the progress checklist from spinning through a failure
      }
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function onToolMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.source !== 'rehablix-inline-tool') return;
      if (event.source !== iframe.contentWindow) return;
      renderStatusBanner(event.data.status, event.data);
      if (event.data.status === 'success' || event.data.status === 'error') {
        window.removeEventListener('message', onToolMessage);
      }
    }
    window.addEventListener('message', onToolMessage);

    return card;
  }

  // Renders a native Lixa result card for a "direct" tool (this round's
  // core feature): no iframe, just the actual returned content shown
  // right in the conversation with real actions. Called both while the
  // generation is still in flight (msg.result === null — shows the same
  // progress checklist as the iframe cards, for a consistent feel) and
  // once it settles into success/auth-required/limit-reached/error.
  function buildDirectResultCardElement(msg) {
    const tool = window.RehablixTools && window.RehablixTools.byPage(msg.content);
    const toolName = tool ? tool.name : 'Tool';
    const card = document.createElement('div');
    card.className = 'message assistant native-result-card';

    if (!msg.result) {
      const steps = ['Understanding your request', `Running ${toolName}`, 'Preparing the result'];
      card.innerHTML = `
        <div class="inline-tool-card-header">
          <span class="inline-tool-card-title"><i class="fas fa-wand-magic-sparkles"></i> ${escapeHtml(toolName)}</span>
        </div>
        <ul class="progress-steps">
          ${steps.map((s, i) => `<li data-step="${i}" class="${i === 0 ? 'active' : ''}"><i class="fas fa-circle-notch"></i> ${escapeHtml(s)}</li>`).join('')}
        </ul>
      `;
      // Purely cosmetic step-advance while the real await is in flight —
      // there's no per-step signal from the generator itself (it's one
      // AI call, not a multi-stage pipeline), so this just keeps the
      // same reassuring motion the iframe cards have.
      const stepEls = card.querySelectorAll('.progress-steps li');
      let i = 0;
      const timer = setInterval(() => {
        if (i >= stepEls.length - 1) { clearInterval(timer); return; }
        stepEls[i].classList.remove('active');
        i++;
        stepEls[i].classList.add('active');
      }, 700);
      return card;
    }

    const r = msg.result;
    if (r.status === 'auth-required') {
      card.innerHTML = `
        <div class="inline-tool-card-header"><span class="inline-tool-card-title"><i class="fas fa-wand-magic-sparkles"></i> ${escapeHtml(toolName)}</span></div>
        <div class="inline-tool-card-status">
          <div class="status-banner status-warn"><i class="fas fa-circle-info"></i> You'll need to log in to generate this. <button type="button" class="status-banner-action" id="directLoginBtn-${index_(msg)}">Log in</button></div>
        </div>`;
      const btn = card.querySelector(`#directLoginBtn-${index_(msg)}`);
      if (btn) btn.addEventListener('click', () => document.getElementById('loginBtn')?.click());
      return card;
    }
    if (r.status === 'limit-reached') {
      card.innerHTML = `
        <div class="inline-tool-card-header"><span class="inline-tool-card-title"><i class="fas fa-wand-magic-sparkles"></i> ${escapeHtml(toolName)}</span></div>
        <div class="inline-tool-card-status">
          <div class="status-banner status-warn"><i class="fas fa-circle-info"></i> You've reached your monthly generation limit${r.daysLeft ? ` (resets in ${r.daysLeft} days)` : ''}. <a href="sub.html" target="_blank" rel="noopener">Upgrade plan →</a></div>
        </div>`;
      return card;
    }
    if (r.status === 'error') {
      card.innerHTML = `
        <div class="inline-tool-card-header"><span class="inline-tool-card-title"><i class="fas fa-wand-magic-sparkles"></i> ${escapeHtml(toolName)}</span></div>
        <div class="inline-tool-card-status">
          <div class="status-banner status-error"><i class="fas fa-triangle-exclamation"></i> ${escapeHtml(r.message || 'Something went wrong generating this.')}</div>
        </div>`;
      return card;
    }

    // Success — the actual native result: a scrollable preview of the
    // real generated content plus a working action button. The action
    // itself depends on what this tool's generator API exposes — some
    // (standardized) export directly via their own print-to-PDF
    // function; others (presentation) save to Firebase history and
    // point at result.html, the same universal result viewer/exporter
    // already used by several other tools, rather than duplicating its
    // PPTX export logic here.
    const previewId = `native-preview-${msg.timestamp || Date.now()}`;
    const api = tool && window.RehablixGenerators && window.RehablixGenerators[tool.generatorKey];
    const hasDirectExport = api && typeof api.exportToPdf === 'function';
    const actionLabel = hasDirectExport ? 'Download PDF' : 'View &amp; Download';
    const actionIcon = hasDirectExport ? 'fa-download' : 'fa-arrow-up-right-from-square';

    card.innerHTML = `
      <div class="inline-tool-card-header">
        <span class="inline-tool-card-title"><i class="fas fa-circle-check"></i> ${escapeHtml(r.toolName || toolName)}</span>
      </div>
      <div class="inline-tool-card-status">
        <div class="status-banner status-success"><i class="fas fa-circle-check"></i> ${r.fromHistory ? 'Already generated — showing your saved copy.' : 'Generated successfully' + (currentUser ? ' and saved to your history.' : '.')}</div>
      </div>
      <div class="native-result-preview" id="${previewId}">${r.content || ''}</div>
      <div class="native-result-actions">
        <button type="button" class="native-result-btn" data-action="expand"><i class="fas fa-up-right-and-down-left-from-center"></i> Expand</button>
        <button type="button" class="native-result-btn native-result-btn-primary" data-action="download"><i class="fas ${actionIcon}"></i> ${actionLabel}</button>
      </div>
    `;

    const preview = card.querySelector('.native-result-preview');
    const expandBtn = card.querySelector('[data-action="expand"]');
    const downloadBtn = card.querySelector('[data-action="download"]');

    expandBtn.addEventListener('click', () => {
      const expanded = preview.classList.toggle('is-expanded');
      expandBtn.innerHTML = expanded
        ? '<i class="fas fa-down-left-and-up-right-to-center"></i> Collapse'
        : '<i class="fas fa-up-right-and-down-left-from-center"></i> Expand';
    });

    downloadBtn.addEventListener('click', () => {
      if (hasDirectExport) {
        api.exportToPdf(r.content, r.toolName || toolName);
      } else if (api && typeof api.viewUrl === 'function' && r.historyId) {
        window.open(api.viewUrl(r.historyId), '_blank', 'noopener');
      } else if (r.viewUrl) {
        window.open(r.viewUrl, '_blank', 'noopener');
      } else {
        showToast('Download isn\'t available right now — try refreshing.', 'error');
      }
    });

    return card;
  }

  // Same defensive wrapper as buildInlineToolCardElementSafe, for the
  // same reason: a thrown error while building one card must not abort
  // rendering every message after it.
  function buildDirectResultCardElementSafe(msg) {
    try {
      return buildDirectResultCardElement(msg);
    } catch (err) {
      console.error('[Lixa] direct result card failed to build:', err);
      const fallback = document.createElement('div');
      fallback.className = 'message assistant';
      fallback.innerHTML = `<div class="message-bubble">Couldn't display that result — try asking again.</div>`;
      return fallback;
    }
  }

  // Small helper so the login-button id above is unique per card without
  // adding an index parameter through every call site.
  let _directCardCounter = 0;
  function index_(msg) {
    if (!msg._cardIndex) msg._cardIndex = ++_directCardCounter;
    return msg._cardIndex;
  }

  // Safe wrapper: if buildInlineToolCardElement throws for any reason
  // (e.g. the registry isn't loaded), show a plain-text fallback with a
  // working link instead of silently breaking the render loop — a
  // thrown error inside renderMessages()'s forEach would otherwise abort
  // rendering every message after this one with no visible explanation.
  function buildInlineToolCardElementSafe(targetPage) {
    try {
      return buildInlineToolCardElement(targetPage);
    } catch (err) {
      console.error('[Lixa] inline tool card failed to build:', err);
      const fallback = document.createElement('div');
      fallback.className = 'message assistant';
      fallback.innerHTML = `<div class="message-bubble">Couldn't load that inline — <a href="${escapeHtml(targetPage.split('?')[0])}" target="_blank" rel="noopener">open it in a new tab instead →</a></div>`;
      return fallback;
    }
  }

  // =========================================================================
  // Event delegation for AI response action buttons (Copy, Word, Regenerate)
  // =========================================================================
  chatMessages.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.classList.contains('suggestion-chip')) return;
    if (btn.classList.contains('cancel-edit-btn') || btn.classList.contains('save-edit-btn')) return;

    const messageDiv = btn.closest('.message.assistant');
    if (!messageDiv) return;

    const index = parseInt(messageDiv.getAttribute('data-index'), 10);
    if (isNaN(index) || !messages[index]) return;

    if (btn.classList.contains('copy-btn')) {
      const rawContent = messageDiv.getAttribute('data-raw-content') || messages[index].content;
      navigator.clipboard.writeText(rawContent)
        .then(() => {
          btn.classList.add('copied');
          const icon = btn.querySelector('i');
          if (icon) icon.className = 'fas fa-check';
          showToast('Copied to clipboard', 'success');
          setTimeout(() => {
            btn.classList.remove('copied');
            if (icon) icon.className = 'fas fa-copy';
          }, 2000);
        })
        .catch(() => showToast('Copy failed', 'error'));
    }

    if (btn.classList.contains('download-btn')) {
      openInResultEditor(index);
    }

    if (btn.classList.contains('regenerate-btn')) {
      if (isWaiting) {
        showToast('Please wait for the current response to finish', 'error');
        return;
      }
      let userMessageIndex = index - 1;
      while (userMessageIndex >= 0 && messages[userMessageIndex].role !== 'user') {
        userMessageIndex--;
      }
      if (userMessageIndex < 0) {
        showToast('No previous user message to regenerate from', 'error');
        return;
      }
      const userMessageContent = messages[userMessageIndex].content;
      messages.splice(index, 1);
      renderMessages();
      if (currentUser) saveConversation();
      runAssistantTurn(userMessageContent, { isRegenerate: true });
    }
  });

  async function openInResultEditor(index) {
    const msg = messages[index];
    if (!msg) return;
    if (!currentUser) {
      showToast('Log in to open this in the editor and export it', 'info');
      const loginBtn = document.getElementById('loginBtn');
      if (loginBtn) loginBtn.click();
      return;
    }
    let question = '';
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { question = messages[i].displayContent || messages[i].content; break; }
    }
    try {
      const resultsMarkdown = msg.content;
      const resultsHtml = marked.parse(resultsMarkdown);
      const ref = await database.ref(`history/${currentUser.uid}/askResults`).push({
        question: question.slice(0, 200),
        resultsMarkdown,
        resultsHtml,
        date: new Date().toLocaleDateString(),
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });
      window.open(`result.html?type=ask&id=${ref.key}`, '_blank');
    } catch (err) {
      console.error('Failed to open in editor:', err);
      showToast('Could not open the editor. Please try again.', 'error');
    }
  }

  // =========================================================================
  // Typing indicator / task-progress checklist (brief section 7)
  // =========================================================================
  let typingStepTimer = null;
  const TYPING_STEPS = ['Understanding your request', 'Thinking it through', 'Preparing your response'];

  function showTyping() {
    const existingTyping = document.getElementById('typingIndicator');
    if (existingTyping) existingTyping.remove();
    if (typingStepTimer) { clearInterval(typingStepTimer); typingStepTimer = null; }

    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant typing-indicator';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `
      <ul class="progress-steps">
        ${TYPING_STEPS.map((s, i) => `<li data-step="${i}"><i class="fas fa-circle-notch"></i> ${escapeHtml(s)}</li>`).join('')}
      </ul>
    `;
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    const stepEls = typingDiv.querySelectorAll('li');
    let stepIndex = 0;
    stepEls[0].classList.add('active');
    typingStepTimer = setInterval(() => {
      if (stepIndex >= stepEls.length - 1) { clearInterval(typingStepTimer); typingStepTimer = null; return; }
      stepEls[stepIndex].classList.remove('active');
      stepEls[stepIndex].classList.add('done');
      stepIndex++;
      stepEls[stepIndex].classList.add('active');
    }, 900);
  }

  function removeTyping() {
    if (typingStepTimer) { clearInterval(typingStepTimer); typingStepTimer = null; }
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
  }

  // =========================================================================
  // Generate suggested follow‑up questions
  // =========================================================================
  async function generateSuggestions(lastUserMessage, lastAiResponse) {
    if (!aiConfig.token) {
      const ok = await fetchTokens();
      if (!ok) return [];
    }

    const systemPrompt = `You are a helpful assistant that generates short, natural follow‑up questions based on a conversation.

Given the user's last question and the AI's response, suggest exactly 3 follow‑up questions the user might want to ask next. The questions should:
- Be concise (one sentence each, max 15 words)
- Cover different aspects of the topic
- Sound natural and conversational
- Not repeat the original question

Return ONLY a JSON array of strings. Example format:
["What are the common causes of this condition?","How long does recovery typically take?","Are there any exercises I should avoid?"]

Do NOT include any other text, explanations, or markdown. Return ONLY the JSON array.`;

    try {
      const response = await fetch(`${aiConfig.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiConfig.token}`
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `User asked: "${lastUserMessage}"\n\nAI responded: "${lastAiResponse.substring(0, 500)}"\n\nGenerate 3 follow‑up questions as a JSON array.` }
          ],
          max_tokens: 200,
          temperature: 0.8,
          top_p: 0.95
        })
      });

      if (!response.ok) return [];
      const data = await response.json();
      const content = data.choices[0].message.content.trim();

      const jsonMatch = content.match(/\[.*\]/s);
      if (jsonMatch) {
        const suggestions = JSON.parse(jsonMatch[0]);
        if (Array.isArray(suggestions) && suggestions.length > 0) return suggestions.slice(0, 3);
      }

      const lines = content.split('\n')
        .map(l => l.replace(/^[\d.\-•*]+\s*/, '').replace(/^["']|["']$/g, '').trim())
        .filter(l => l.length > 10 && l.endsWith('?'))
        .slice(0, 3);

      return lines.length > 0 ? lines : [];
    } catch (error) {
      console.warn('Failed to generate suggestions:', error);
      return [];
    }
  }

  // Turns the first exchange into a short, professional conversation title,
  // instead of just truncating the user's raw first message (feature 3).
  //
  // FIX: this used to request only max_tokens: 30 and simply give up (falling
  // back to the literal string "New Conversation") on any failure — including
  // the AI backend returning a 200 OK with empty content, which happens more
  // often than you'd expect with a tight token budget. It now retries once
  // with more headroom, and if the AI is genuinely unavailable, falls back to
  // a title derived from the user's own first message instead of a useless
  // generic placeholder.
  async function generateConversationTitle(userText, aiReply) {
    if (!aiConfig.token) {
      const ok = await fetchTokens();
      if (!ok) {
        console.warn('[generateConversationTitle] No API token available');
        return localTitleFallback(userText);
      }
    }
    
    // Make sure we have enough text to work with
    const userSnippet = (userText || '').slice(0, 300);
    const aiSnippet = (aiReply || '').slice(0, 300);
    
    if (!userSnippet || !aiSnippet) {
      console.warn('[generateConversationTitle] Insufficient text for title generation');
      return localTitleFallback(userText);
    }

    const aiTitle = await requestTitleFromAI(userSnippet, aiSnippet, 1)
      || await requestTitleFromAI(userSnippet, aiSnippet, 2);

    return aiTitle || localTitleFallback(userText);
  }

  // Derives a readable title straight from the user's own message when the
  // AI is unavailable/empty, so the history list never shows the generic
  // "New Conversation" placeholder just because a single API call failed.
  function localTitleFallback(userText) {
    const cleaned = (userText || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return 'New Conversation';
    const words = cleaned.split(' ').slice(0, 8).join(' ');
    const title = words.length < cleaned.length ? `${words}…` : words;
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  async function requestTitleFromAI(userSnippet, aiSnippet, attempt) {
    try {
      console.log(`[generateConversationTitle] Calling API for title generation (attempt ${attempt})...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      const response = await fetch(`${aiConfig.endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${aiConfig.token}` 
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [
            { 
              role: 'system', 
              content: 'Generate a short, professional conversation title (4-7 words, title case, no quotes, no trailing period) that summarizes what the user is asking about. Return ONLY the title text, nothing else.' 
            },
            { 
              role: 'user', 
              content: `User asked: "${userSnippet}"\n\nAI answered about: "${aiSnippet}"` 
            }
          ],
          // Bumped from 30: too tight a budget is exactly what let a 200 OK
          // response come back with zero visible content on the first attempt.
          max_tokens: attempt === 1 ? 60 : 150,
          temperature: 0.5
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error('[generateConversationTitle] API returned error:', response.status);
        return null;
      }
      
      const data = await response.json();
      const choice = data.choices && data.choices[0];
      let title = (choice && choice.message && choice.message.content ? choice.message.content : '')
        .trim().replace(/^["']|["']$/g, '');
      
      // Validate the title
      if (!title || title.length < 3 || title.length > 50) {
        console.warn(`[generateConversationTitle] Invalid/empty title on attempt ${attempt}:`, title);
        return null;
      }
      
      console.log('[generateConversationTitle] Generated title:', title);
      return title;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn('[generateConversationTitle] Title generation timed out');
      } else {
        console.error('[generateConversationTitle] Error:', err);
      }
      return null;
    }
  }

  // =========================================================================
  // AI Call (auto-switches to the vision model when images/video frames are present)
  // =========================================================================
  function buildApiContent(msg) {
    // Phase 7 fix: a 'tool-result' entry (see renderInlineToolCard) isn't
    // a valid chat-completion role — translate it into a plain assistant
    // note so the AI has real continuity ("I already opened this tool
    // and the user saw the result") instead of either crashing the API
    // call or silently losing that context.
    if (msg.role === 'tool-result') {
      const tool = window.RehablixTools && window.RehablixTools.byPage(msg.content);
      return `(Opened the ${tool ? tool.name : 'requested tool'} inline and showed the result to the user.)`;
    }
    if (msg.role === 'direct-result') {
      const tool = window.RehablixTools && window.RehablixTools.byPage(msg.content);
      const toolName = tool ? tool.name : 'requested tool';
      if (!msg.result) return `(Generating with ${toolName} now.)`;
      if (msg.result.status === 'success') return `(Generated the ${toolName} result directly and showed it to the user, with a download option.)`;
      if (msg.result.status === 'auth-required') return `(Tried to generate with ${toolName}, but the user isn't logged in — shown a log-in prompt.)`;
      if (msg.result.status === 'limit-reached') return `(Tried to generate with ${toolName}, but the user hit their monthly generation limit.)`;
      return `(Tried to generate with ${toolName} but it failed: ${msg.result.message || 'unknown error'}.)`;
    }
    if (msg.visionImages && msg.visionImages.length > 0) {
      const parts = [{ type: 'text', text: msg.content }];
      msg.visionImages.forEach(url => parts.push({ type: 'image_url', image_url: { url } }));
      return parts;
    }
    return msg.content;
  }

  async function callAI() {
    const recentMessages = messages.slice(-20);
    const needsVision = recentMessages.some(m => m.visionImages && m.visionImages.length > 0);

    let config = aiConfig;
    if (needsVision) {
      const ok = await fetchVisionTokens();
      if (ok) {
        config = visionConfig;
      } else {
        showToast('Vision model is not configured — answering from extracted text only.', 'info', 4000);
      }
    } else if (selectedModelTier === 'deepseek-reasoning') {
      // Same DeepSeek key/endpoint as the standard tier — just a
      // reasoning-tuned model for harder, multi-step requests.
      const ok = aiConfig.token || await fetchTokens();
      if (ok) {
        config = { token: aiConfig.token, endpoint: aiConfig.endpoint, model: 'deepseek-reasoner' };
      } else {
        showToast('Could not reach DeepSeek Reasoning — falling back to Standard.', 'info', 4000);
      }
    } else if (selectedModelTier === 'openai-gpt4-1') {
      const ok = await fetchVisionTokens(); // same OpenAI key already used for vision
      if (ok) {
        config = visionConfig;
      } else {
        showToast('Could not reach GPT-4.1 — falling back to Standard.', 'info', 4000);
      }
    }
    if (!config.token) {
      const ok = await fetchTokens();
      if (!ok) throw new Error('AI service is not configured.');
      config = aiConfig;
    }

    const apiMessages = [
      { role: 'system', content: buildSystemPrompt() },
      ...recentMessages.map(m => ({
        // 'tool-result' isn't a real chat-completion role — send it to
        // the API as 'assistant' (buildApiContent already turns it into
        // a short descriptive note); the UI still renders it specially.
        role: m.role === 'tool-result' ? 'assistant' : m.role,
        content: buildApiContent(m)
      }))
    ];

    const url = `${config.endpoint}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: apiMessages,
        max_tokens: 1500,
        temperature: 0.7,
        top_p: 0.9
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const msg = errData?.error?.message || `API error (${response.status})`;
      if (window.reportApiError) {
        window.reportApiError({
          status: response.status,
          bodyText: JSON.stringify(errData),
          tool: 'ask',
          context: `chat completion (${needsVision ? 'vision' : 'text'})`
        });
      }
      throw new Error(msg);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  // Shared "ask the AI and append its reply" logic, used by send/edit/regenerate
  async function runAssistantTurn(promptTextForSuggestions) {
    isWaiting = true;
    sendBtn.disabled = true;
    showTyping();
    try {
      const reply = await callAI();
      removeTyping();
      const assistantMsg = { role: 'assistant', content: reply, timestamp: Date.now() };
      const suggestions = await generateSuggestions(promptTextForSuggestions, reply);
      assistantMsg.suggestions = suggestions;
      messages.push(assistantMsg);
      renderMessages();

      // Auto-run the first auto-capable tool the AI recommended instead
      // of waiting for the user to tap a link (there isn't one to tap —
      // see renderAssistantHtml). "direct" tools call their generator
      // function in-process and render a native result card; "inline"
      // tools still use the sandboxed iframe card from earlier rounds.
      const autoTool = findFirstAutoRunToolLink(reply);
      if (autoTool && autoTool.mode === 'direct') {
        runDirectToolGeneration(autoTool.href);
      } else if (autoTool && autoTool.mode === 'inline') {
        appendInlineToolResult(autoTool.href);
      }

      // ---- Generate title BEFORE saving, with retry + local fallback ----
      if (currentUser && !titleIsFinal && messages.filter(m => m.role === 'user').length === 1) {
        console.log('[runAssistantTurn] Attempting to generate title for new conversation...');
        try {
          const generatedTitle = await generateConversationTitle(promptTextForSuggestions, reply);
          conversationTitle = generatedTitle && generatedTitle.trim().length > 0
            ? generatedTitle
            : localTitleFallback(promptTextForSuggestions);
          titleIsFinal = true;
          console.log('[runAssistantTurn] Title finalized:', conversationTitle);
        } catch (titleError) {
          console.error('[runAssistantTurn] Title generation failed with error:', titleError);
          conversationTitle = localTitleFallback(promptTextForSuggestions);
          titleIsFinal = true;
        }
      } else if (currentUser && titleIsFinal) {
        console.log('[runAssistantTurn] Title already finalized:', conversationTitle);
      } else if (!currentUser) {
        console.log('[runAssistantTurn] No user logged in, skipping title generation');
      }

      if (currentUser) {
        console.log('[runAssistantTurn] Saving conversation with title:', conversationTitle || 'New Conversation');
        const saved = await saveConversation();
        if (!saved) {
          console.warn('[runAssistantTurn] First save attempt failed, retrying...');
          setTimeout(async () => {
            await saveConversation();
          }, 500);
        } else {
          console.log('[runAssistantTurn] Conversation saved successfully');
          // Refresh the history list to show the new title
          await loadHistoryList();
        }
      }
    } catch (error) {
      removeTyping();
      const errorMsg = (error.message || '').includes('Service error') ? 'AI service error. Please try again.' : error.message;
      showToast(`Error: ${errorMsg}`, 'error', 5000);
      renderMessages();
      if (currentUser) saveConversation();
    } finally {
      isWaiting = false;
      sendBtn.disabled = false;
      messageInput.disabled = false;
      // Don't force the mobile keyboard back open right after a reply lands —
      // it's disruptive while the user is trying to read (feature 4).
      if (!isMobile) messageInput.focus();
    }
  }

  // =========================================================================
  // Conversation persistence
  // =========================================================================
  async function saveConversation() {
    if (!currentUser) {
      console.warn('[saveConversation] No user logged in – skipping save');
      return false;
    }
    if (messages.length === 0) {
      console.warn('[saveConversation] No messages to save');
      return false;
    }

    const cleanMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
      displayContent: m.displayContent || null,
      attachmentMeta: m.attachmentMeta || null,
      timestamp: m.timestamp || Date.now(),
      result: m.result || null // direct-result messages only; harmless null for every other role
    }));

    // Use the AI-refined title if we have one; otherwise derive something
    // useful from the conversation itself rather than a generic placeholder.
    let title = conversationTitle;
    if (!title) {
      const firstUserMsg = messages.find(m => m.role === 'user');
      title = localTitleFallback(firstUserMsg ? firstUserMsg.content : '');
    }

    try {
      const refPath = `history/${currentUser.uid}/askConversations`;
      
      if (currentConversationId) {
        // Update existing conversation
        await database.ref(`${refPath}/${currentConversationId}`).update({
          title,
          messages: cleanMessages,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        console.log('[saveConversation] Updated conversation:', currentConversationId);
        return true;
      } else {
        // Create new conversation
        const newRef = await database.ref(refPath).push({
          title,
          messages: cleanMessages,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        currentConversationId = newRef.key;
        console.log('[saveConversation] Created new conversation:', currentConversationId);
        return true;
      }
    } catch (error) {
      console.error('[saveConversation] Error:', error);
      showToast('Failed to save conversation. Check console for details.', 'error', 4000);
      return false;
    }
  }

  // =========================================================================
  // LOAD CONVERSATION - FIXED: No automatic save/update timestamp
  // =========================================================================
  async function loadConversation(convId) {
    if (!currentUser) return;
    try {
      const snap = await database.ref(`history/${currentUser.uid}/askConversations/${convId}`).once('value');
      const data = snap.val();
      if (data) {
        currentConversationId = convId;
        conversationTitle = data.title || null;
        titleIsFinal = true;
        messages = data.messages || [];
        
        // Generate suggestions for the last assistant message
        if (messages.length >= 2) {
          const lastAi = messages[messages.length - 1];
          const lastUser = messages[messages.length - 2];
          if (lastAi.role === 'assistant' && lastUser.role === 'user') {
            try {
              const suggestions = await generateSuggestions(
                lastUser.displayContent || lastUser.content, 
                lastAi.content
              );
              lastAi.suggestions = suggestions;
            } catch (e) {
              // Suggestions are non-critical
              console.warn('Could not generate suggestions for loaded conversation:', e);
            }
          }
        }
        
        renderMessages();
        historyDrawer.classList.remove('active');
        showToast('Conversation loaded', 'success');
        
        // FIXED: Do NOT automatically save/update the timestamp.
        // Only update the timestamp when the user actually sends a new message.
        // Removed the setTimeout(() => saveConversation(), 1000) call.
      }
    } catch (error) {
      console.error('[loadConversation] Error:', error);
      showToast('Failed to load conversation', 'error');
    }
  }

  async function deleteConversation(convId, event) {
    event.stopPropagation();
    if (!currentUser) return;
    if (!confirm('Delete this conversation?')) return;
    try {
      await database.ref(`history/${currentUser.uid}/askConversations/${convId}`).remove();
      if (currentConversationId === convId) newChat();
      loadHistoryList();
      showToast('Conversation deleted', 'success');
    } catch (error) {
      showToast('Failed to delete', 'error');
    }
  }

  function newChat() {
    currentConversationId = null;
    conversationTitle = null;
    titleIsFinal = false;
    messages = [];
    attachedFiles = [];
    renderAttachmentsStrip();
    renderMessages();
    if (!isMobile) messageInput.focus();
  }

  // =========================================================================
  // History list
  // =========================================================================
  let allConversations = [];

  async function loadHistoryList() {
    if (!currentUser) {
      console.warn('[loadHistoryList] No user logged in');
      return;
    }
    try {
      console.log('[loadHistoryList] Fetching conversations for user:', currentUser.uid);
      const snap = await database.ref(`history/${currentUser.uid}/askConversations`).orderByChild('updatedAt').once('value');
      const data = snap.val();
      allConversations = [];
      if (data) {
        allConversations = Object.entries(data).map(([id, item]) => ({ id, ...item }));
        allConversations.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
        console.log('[loadHistoryList] Loaded', allConversations.length, 'conversations');
        allConversations.forEach(c => {
          console.log('  -', c.title, '(ID:', c.id, ')');
        });
      } else {
        console.log('[loadHistoryList] No conversations found');
      }
      renderHistoryList(allConversations);
    } catch (error) {
      console.error('[loadHistoryList] Error:', error);
    }
  }

  function renderHistoryList(conversations) {
    if (!historyList) return;
    historyList.innerHTML = '';
    if (conversations.length === 0) {
      historyList.innerHTML = `
        <div class="empty-state">
          <i class='bx bx-folder-open'></i>
          <p>No conversations yet</p>
        </div>
      `;
      return;
    }

    const searchTerm = historySearchInput?.value.toLowerCase().trim() || '';
    const filtered = conversations.filter(c =>
      !searchTerm || (c.title || '').toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
      historyList.innerHTML = `
        <div class="empty-state">
          <i class='bx bx-search'></i>
          <p>No matching conversations</p>
        </div>
      `;
      return;
    }

    filtered.forEach(conv => {
      const div = document.createElement('div');
      div.className = 'history-item';
      const date = new Date(conv.updatedAt || conv.createdAt);
      div.innerHTML = `
        <button class="delete-btn" data-id="${conv.id}" title="Delete conversation">
          <i class="fas fa-trash-alt"></i>
        </button>
        <span class="history-title">${escapeHtml(conv.title || 'Untitled')}</span>
        <div class="history-meta">
          <span><i class="far fa-calendar-alt"></i> ${date.toLocaleDateString()}</span>
          <span><i class="far fa-clock"></i> ${date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
          <span>${conv.messages?.length || 0} messages</span>
        </div>
      `;
      div.addEventListener('click', (e) => {
        if (e.target.closest('.delete-btn')) return;
        loadConversation(conv.id);
      });
      div.querySelector('.delete-btn').addEventListener('click', (e) => deleteConversation(conv.id, e));
      historyList.appendChild(div);
    });
  }

  // =========================================================================
  // Send message (assembles text + attachments + URL context)
  // =========================================================================
  async function handleSend() {
    const text = messageInput.value.trim();
    if ((!text && attachedFiles.length === 0) || isWaiting) return;

    if (!currentUser) showToast('Log in to save your conversation', 'info');

    isWaiting = true;
    sendBtn.disabled = true;
    messageInput.disabled = true;

    messages.forEach(m => { if (m.role === 'assistant') delete m.suggestions; });

    // Attachments (especially OCR on images and multi-page PDFs) can
    // legitimately take longer than a few seconds, particularly on the
    // first use when the extraction library is still downloading from its
    // CDN. Sending before extraction finished was the reason files/images
    // sometimes reached the AI as "(no content extracted)" — wait properly
    // and tell the user why, instead of racing ahead after a short timeout.
    if (attachedFiles.some(a => a.status === 'reading')) {
      showToast('Finishing up your file(s) — this can take a bit longer for scanned images or PDFs…', 'info', 4000);
    }
    const waitStart = Date.now();
    while (attachedFiles.some(a => a.status === 'reading') && Date.now() - waitStart < 45000) {
      await new Promise(r => setTimeout(r, 250));
    }
    if (attachedFiles.some(a => a.status === 'reading')) {
      showToast('Still processing a file — sending now with what\'s ready so far.', 'warning', 4000);
    }

    let fullContent = text || '(see attached file)';
    const attachmentMeta = [];
    const visionImages = [];
    const rawFiles = [];
    if (attachedFiles.length > 0) {
      let block = '\n\n';
      attachedFiles.forEach(att => {
        attachmentMeta.push({ name: att.name, icon: fileTypeIcon(att.file) });
        block += `[Attached file: ${att.name}]\n${att.extractedText || '(no content extracted)'}\n\n`;
        if (att.visionImages) visionImages.push(...att.visionImages);
        rawFiles.push(att.file);
      });
      fullContent += block;
    }

    const urls = extractUrls(text);
    if (urls.length > 0) {
      showToast('Reading linked page(s)…', 'info', 2000);
      for (const url of urls) {
        const content = await fetchUrlContent(url);
        if (content) {
          fullContent += `\n\n[Content from URL: ${url}]\n${content}\n`;
        } else {
          fullContent += `\n\n[Could not read URL: ${url}]\n`;
        }
      }
    }

    const userMsg = {
      role: 'user',
      content: fullContent,
      displayContent: text,
      attachmentMeta,
      timestamp: Date.now(),
      _rawFiles: rawFiles // in-memory only; not persisted (see saveConversation)
    };
    if (visionImages.length > 0) userMsg.visionImages = visionImages;

    messages.push(userMsg);
    renderMessages();
    messageInput.value = '';
    messageInput.style.height = 'auto';
    attachedFiles = [];
    renderAttachmentsStrip();

    if (currentUser) {
      const saved = await saveConversation();
      if (!saved) {
        console.warn('[handleSend] First save attempt failed – will retry after AI response');
      }
    }

    // Store the conversation ID so runAssistantTurn can use it
    const convIdBefore = currentConversationId;
    await runAssistantTurn(text || 'this file');

    // If the conversation ID changed (new conversation), make sure we have it
    if (!convIdBefore && currentConversationId) {
      console.log('[handleSend] New conversation created with ID:', currentConversationId);
    }
  }

  // =========================================================================
  // Event listeners
  // =========================================================================
  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
    const stillReading = attachedFiles.some(a => a.status === 'reading');
    sendBtn.disabled = stillReading || isWaiting || (messageInput.value.trim() === '' && attachedFiles.length === 0);
  });

  // Enter-to-send behavior differs on mobile so multi-paragraph prompts are easy to type (feature 2)
  messageInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (isMobile) return; // let Enter insert a newline; only the send button sends
    if (!e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  sendBtn.addEventListener('click', handleSend);

  // If arriving from the homepage search bar (index.html?…redirect to ask.html?q=...),
  // prefill the question and send it automatically.
  (function prefillFromQueryParam() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q && q.trim()) {
      messageInput.value = q.trim();
      messageInput.dispatchEvent(new Event('input'));
      // Clean the URL so a refresh doesn't resend the same question.
      // Uses the CURRENT page's path rather than a hardcoded 'ask.html'
      // — this file now also runs embedded in index.html (Lixa), and
      // hardcoding the old page here would silently rewrite the address
      // bar to ask.html while still showing index.html's content.
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => handleSend(), 300);
    }
  })();

  newChatBtn.addEventListener('click', () => {
    if (messages.length > 0 && !confirm('Start a new chat? Current conversation will be saved.')) return;
    newChat();
    historyDrawer.classList.remove('active');
    showToast('New conversation started', 'info');
  });

  // =========================================================================
  // History drawer controls
  // =========================================================================
  if (historyNavBtn) {
    historyNavBtn.addEventListener('click', () => {
      if (!currentUser) {
        showToast('Please log in to view history', 'error');
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) loginBtn.click();
        return;
      }
      historyDrawer.classList.add('active');
      loadHistoryList();
    });
  }

  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', () => {
      historyDrawer.classList.remove('active');
    });
  }

  document.addEventListener('click', (e) => {
    if (historyDrawer?.classList.contains('active') &&
        !historyDrawer.contains(e.target) &&
        e.target !== historyNavBtn &&
        !historyNavBtn?.contains(e.target)) {
      historyDrawer.classList.remove('active');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && historyDrawer?.classList.contains('active')) {
      historyDrawer.classList.remove('active');
    }
  });

  if (historySearchInput) {
    historySearchInput.addEventListener('input', () => renderHistoryList(allConversations));
  }

  // =========================================================================
  // Auth & initialization
  // =========================================================================
  firebase.auth().onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
      historyNavBtn.style.display = 'block';
      loadHistoryList();
    } else {
      historyNavBtn.style.display = 'none';
    }
  });

  async function initialize() {
    await fetchTokens();
    renderMessages();
    // Skip auto-focus on mobile so the keyboard doesn't pop up unprompted
    // the moment the page loads (feature 4).
    if (!isMobile) messageInput.focus();
    console.log('[INIT] Ask AI ready: attachments+vision, voice input, editable prompts, link reading, handoff');
  }

  initialize();
});