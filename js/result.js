// js/result.js
// Single shared controller for every generated-result page (case, answer,
// gait, rom, format, ...). Behavior for a given result is supplied by
// js/result-types.js via the ?type= URL parameter, so this file itself
// never needs to change when a new generator is added.

document.addEventListener('DOMContentLoaded', function () {
  const urlParams = new URLSearchParams(window.location.search);
  const type = urlParams.get('type');
  const historyId = urlParams.get('id');
  const sharedOwnerUid = urlParams.get('uid'); // present on shared/public links so a non-owner can locate the record

  const config = (window.RESULT_TYPES || {})[type];

  // DOM elements (shared shell, present on every result view)
  const editor = document.getElementById('editorContent');
  const pageTitleEl = document.querySelector('head title');
  const pageModeLabel = document.getElementById('pageModeLabel');
  const headerTitle = document.getElementById('resultTitle');
  const metadataContainer = document.getElementById('resultMetadata');
  const wordCountSpan = document.getElementById('wordCount');
  const charCountSpan = document.getElementById('charCount');
  const saveStatusSpan = document.getElementById('saveStatus');
  const editModeSpan = document.getElementById('editMode');
  const toastContainer = document.getElementById('toast-container');

  const shareBtn = document.getElementById('shareBtn');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const pdfBtn = document.getElementById('pdfBtn');
  const printBtn = document.getElementById('printBtn');
  const pptExportBtn = document.getElementById('pptExportBtn');
  const saveEditBtn = document.getElementById('saveEditBtn');
  const closeBtn = document.getElementById('closeResultBtn');

  const shareModal = document.getElementById('shareModal');
  const shareLink = document.getElementById('shareLink');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const shareEmailBtn = document.getElementById('shareEmailBtn');
  const shareWhatsAppBtn = document.getElementById('shareWhatsAppBtn');
  const shareTwitterBtn = document.getElementById('shareTwitterBtn');

  const fontFamilySelect = document.getElementById('fontFamilySelect');
  const fontSizeSelect = document.getElementById('fontSizeSelect');

  const publicToggleContainer = document.getElementById('publicToggleContainer');
  const publicToggle = document.getElementById('publicToggle');

  function showToast(message, kind, duration) {
    kind = kind || 'success';
    duration = duration || 3000;
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${kind}`;
    const icon = kind === 'success' ? 'check-circle' : kind === 'error' ? 'exclamation-circle' : 'info-circle';
    toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }

  // --- Guard: unknown type or missing id ---------------------------------
  if (!config) {
    if (editor) editor.innerHTML = '<div class="loading-editor"><i class="fas fa-exclamation-circle"></i> Unknown result type. Please generate a document first.</div>';
    return;
  }
  if (!historyId) {
    if (editor) editor.innerHTML = '<div class="loading-editor"><i class="fas fa-exclamation-circle"></i> No document found. Please generate one first.</div>';
    return;
  }

  document.body.setAttribute('data-result-type', type);
  document.documentElement.style.setProperty('--result-accent', config.accent || '#009688');
  if (pageModeLabel) pageModeLabel.textContent = config.shortLabel || 'result';
  if (pptExportBtn) pptExportBtn.style.display = config.showPptExport ? '' : 'none';

  let currentUser = null;
  let resultData = null;
  let currentIsOwner = false;
  let autoSaveTimer = null;
  let isSaving = false;

  const database = firebase.database();

  // --- Helpers -------------------------------------------------------------
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, (m) => (m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;'));
  }

  function updateWordAndCharCount() {
    const text = (editor && editor.innerText) || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    if (wordCountSpan) wordCountSpan.textContent = `${words} word${words !== 1 ? 's' : ''}`;
    if (charCountSpan) charCountSpan.textContent = `${chars} character${chars !== 1 ? 's' : ''}`;
  }

  function updateSaveStatus(status) {
    if (!saveStatusSpan) return;
    saveStatusSpan.textContent = status;
    saveStatusSpan.style.color = status === 'Saving...' ? '#f59e0b' : 'var(--result-accent)';
  }

  function setEditorReadOnly(readOnly) {
    if (!editor) return;
    editor.setAttribute('contenteditable', readOnly ? 'false' : 'true');
    document.querySelectorAll('.format-btn, .format-select, .action-btn#saveEditBtn').forEach((el) => {
      el.disabled = readOnly;
      el.style.opacity = readOnly ? '0.5' : '1';
      el.style.cursor = readOnly ? 'not-allowed' : 'pointer';
    });
    if (editModeSpan) editModeSpan.textContent = readOnly ? 'Read-only Mode' : 'Editing Mode';
  }

  function htmlToMarkdown(html) {
    let text = html || '';
    text = text.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n');
    text = text.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n');
    text = text.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n');
    text = text.replace(/<h4>(.*?)<\/h4>/gi, '#### $1\n\n');
    text = text.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
    text = text.replace(/<b>(.*?)<\/b>/gi, '**$1**');
    text = text.replace(/<em>(.*?)<\/em>/gi, '*$1*');
    text = text.replace(/<i>(.*?)<\/i>/gi, '*$1*');
    text = text.replace(/<ul>(.*?)<\/ul>/gis, (m, c) => c.replace(/<li>(.*?)<\/li>/gi, '- $1\n'));
    text = text.replace(/<ol>(.*?)<\/ol>/gis, (m, c) => {
      let i = 1;
      return c.replace(/<li>(.*?)<\/li>/gi, () => `${i++}. $1\n`);
    });
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<p>(.*?)<\/p>/gi, '$1\n\n');
    text = text.replace(/<[^>]*>/g, '');
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value.trim();
  }

  function renderMetadata(data) {
    if (!metadataContainer) return;
    metadataContainer.innerHTML = '';
    (config.metadata(data) || []).forEach((item) => {
      const div = document.createElement('div');
      div.className = 'metadata-item';
      div.innerHTML = `<i class="fas ${item.icon}"></i><span>${escapeHtml(item.text)}</span>`;
      metadataContainer.appendChild(div);
    });
  }

  function updatePublicToggleVisibility() {
    if (!publicToggleContainer || !publicToggle) return;
    if (currentIsOwner && resultData) {
      publicToggleContainer.style.display = 'flex';
      publicToggle.checked = resultData.isPublic === true;
    } else {
      publicToggleContainer.style.display = 'none';
    }
  }

  async function togglePublic(event) {
    const isChecked = event.target.checked;
    if (!currentUser || !historyId || !currentIsOwner) {
      showToast('You are not the owner of this document.', 'error');
      event.target.checked = !isChecked;
      return;
    }
    try {
      const updates = {
        isPublic: isChecked,
        lastEdited: firebase.database.ServerValue.TIMESTAMP,
        lastEditedDate: new Date().toLocaleString(),
        lastModified: new Date().toISOString()
      };
      await database.ref(config.historyPath(currentUser.uid, historyId)).update(updates);
      resultData.isPublic = isChecked;

      showToast(isChecked
        ? '✅ Document is now public. Anyone with the link can view it.'
        : '🔒 Document is now private.', 'success');
      renderMetadata(resultData);
    } catch (err) {
      console.error('Error toggling public status:', err);
      showToast('Failed to update sharing setting', 'error');
      event.target.checked = !isChecked;
    }
  }

  // --- Load ------------------------------------------------------------
  async function loadResult() {
    try {
      let data = null;
      let ownerId = null;
      currentIsOwner = false;

      if (currentUser) {
        const snapshot = await database.ref(config.historyPath(currentUser.uid, historyId)).once('value');
        data = snapshot.val();
        if (data) {
          ownerId = currentUser.uid;
          currentIsOwner = true;
        }
      }

      if (!data && sharedOwnerUid) {
        // Shared/public link: read straight from the owner's own record and
        // only accept it if it's actually flagged public (or we ARE the owner,
        // handled above already). No separate public mirror node needed.
        const sharedSnapshot = await database.ref(config.historyPath(sharedOwnerUid, historyId)).once('value');
        const sharedData = sharedSnapshot.val();
        if (sharedData && sharedData.isPublic === true) {
          data = sharedData;
          ownerId = sharedOwnerUid;
          currentIsOwner = !!(currentUser && currentUser.uid === ownerId);
        }
      }

      if (!data && config.localFallback) {
        const stored = localStorage.getItem(config.localFallback.key);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed[config.localFallback.matchField] === historyId) {
            data = parsed;
            currentIsOwner = true;
          }
        }
      }

      if (!data || (config.validate && !config.validate(data))) {
        throw new Error('Document not found or is private');
      }

      resultData = data;
      const label = config.titleFor(data);
      if (pageTitleEl) pageTitleEl.textContent = `rehablix · ${label}`;
      if (headerTitle) headerTitle.textContent = label;
      if (pageModeLabel) pageModeLabel.textContent = config.shortTitleFor ? config.shortTitleFor(data) : config.shortLabel;

      renderMetadata(data);

      if (editor) editor.innerHTML = config.getContentHtml(data);
      updateWordAndCharCount();
      setEditorReadOnly(!currentIsOwner);
      updatePublicToggleVisibility();

      if (!currentIsOwner) showToast('📖 You are viewing a shared document (read-only)', 'info', 3000);
    } catch (err) {
      console.error('Load error:', err);
      showToast('Failed to load document: ' + err.message, 'error');
      if (editor) editor.innerHTML = '<div class="loading-editor"><i class="fas fa-exclamation-circle"></i> Error loading document. It may be private or does not exist.</div>';
    }
  }

  // --- Save --------------------------------------------------------------
  async function saveToFirebase() {
    if (!currentUser || !historyId || isSaving) return;
    if (!currentIsOwner) {
      showToast('You cannot edit a shared document.', 'error');
      return;
    }
    isSaving = true;
    updateSaveStatus('Saving...');
    try {
      const html = editor.innerHTML;
      const markdown = htmlToMarkdown(html);
      const updates = Object.assign(
        {
          lastEdited: firebase.database.ServerValue.TIMESTAMP,
          lastEditedDate: new Date().toLocaleString(),
          lastModified: new Date().toISOString()
        },
        config.buildSaveUpdates({ html, markdown, text: editor.innerText })
      );

      await database.ref(config.historyPath(currentUser.uid, historyId)).update(updates);

      Object.assign(resultData, updates);

      updateSaveStatus('Saved');
      showToast('Changes saved successfully', 'success');
      renderMetadata(resultData);
    } catch (err) {
      console.error('Save error:', err);
      updateSaveStatus('Error saving');
      showToast('Failed to save changes', 'error');
    } finally {
      isSaving = false;
    }
  }

  // --- Editing toolbar -----------------------------------------------------
  function execCommand(command, value) {
    if (!currentIsOwner) {
      showToast('Read-only mode: cannot edit', 'error', 1500);
      return;
    }
    document.execCommand(command, false, value || null);
    editor.focus();
    updateWordAndCharCount();
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => saveToFirebase(), 3000);
    updateSaveStatus('Editing...');
  }

  document.querySelectorAll('.format-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const command = btn.dataset.command;
      if (command === 'createLink') {
        const url = prompt('Enter URL:', 'https://');
        if (url) execCommand('createLink', url);
      } else if (command === 'unlink') {
        execCommand('unlink');
      } else if (command === 'undo' || command === 'redo') {
        document.execCommand(command);
        editor.focus();
        updateWordAndCharCount();
      } else {
        execCommand(command);
      }
    });
  });

  if (fontFamilySelect) fontFamilySelect.addEventListener('change', () => execCommand('fontName', fontFamilySelect.value));
  if (fontSizeSelect) fontSizeSelect.addEventListener('change', () => execCommand('fontSize', fontSizeSelect.value));

  if (editor) {
    editor.addEventListener('input', () => {
      if (!currentIsOwner) return;
      updateWordAndCharCount();
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => saveToFirebase(), 3000);
      updateSaveStatus('Editing...');
    });

    editor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (currentIsOwner) saveToFirebase();
        else showToast('Read-only mode: cannot save', 'error', 1500);
      }
    });
  }

  // --- Action buttons --------------------------------------------------
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const shareUrl = `${window.location.origin}${window.location.pathname}?type=${type}&id=${historyId}&uid=${currentUser ? currentUser.uid : (sharedOwnerUid || '')}`;
      shareLink.value = shareUrl;
      shareModal.classList.add('show');
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(editor.innerText);
        showToast('Content copied to clipboard', 'success');
      } catch (err) {
        showToast('Failed to copy', 'error');
      }
    });
  }

  // ==============================================================
  // HTML -> docx.js conversion
  // ==============================================================
  // BEFORE: Word export used `editor.innerText` split by newline, which
  // throws away every bit of structure — headings, bold text, bullet
  // lists, and tables all became identical flat paragraphs. That's not
  // acceptable for a document meant to be handed to a hospital or
  // presented at a multidisciplinary meeting. This walks the actual
  // rendered DOM and rebuilds it as real Word structure: heading styles,
  // bold/italic/underline runs, bulleted/numbered lists, and tables with
  // a shaded header row — so the exported .docx looks like a properly
  // formatted clinical document, not a text dump.
  function inlineRunsFromNode(node, baseFormatting = {}) {
    const runs = [];
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent;
        if (text) runs.push(new docx.TextRun({ text, ...baseFormatting }));
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;

      const tag = child.tagName.toLowerCase();
      if (tag === 'br') {
        runs.push(new docx.TextRun({ text: '', break: 1 }));
        return;
      }
      const nextFormatting = { ...baseFormatting };
      if (tag === 'strong' || tag === 'b') nextFormatting.bold = true;
      if (tag === 'em' || tag === 'i') nextFormatting.italics = true;
      if (tag === 'u') nextFormatting.underline = {};
      runs.push(...inlineRunsFromNode(child, nextFormatting));
    });
    return runs;
  }

  function blockToDocxElements(el, listContext = null) {
    const tag = el.tagName.toLowerCase();

    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
      const levelMap = {
        h1: docx.HeadingLevel.HEADING_1,
        h2: docx.HeadingLevel.HEADING_2,
        h3: docx.HeadingLevel.HEADING_3,
        h4: docx.HeadingLevel.HEADING_4
      };
      return [new docx.Paragraph({
        heading: levelMap[tag],
        spacing: { before: 240, after: 120 },
        children: inlineRunsFromNode(el)
      })];
    }

    if (tag === 'p') {
      const runs = inlineRunsFromNode(el);
      if (runs.length === 0) return [new docx.Paragraph({ text: '' })];
      return [new docx.Paragraph({ spacing: { after: 120 }, children: runs })];
    }

    if (tag === 'ul' || tag === 'ol') {
      const elements = [];
      Array.from(el.children).forEach((li, idx) => {
        if (li.tagName.toLowerCase() !== 'li') return;
        const runs = inlineRunsFromNode(li);
        elements.push(new docx.Paragraph({
          spacing: { after: 60 },
          bullet: tag === 'ul' ? { level: 0 } : undefined,
          numbering: tag === 'ol' ? { reference: 'docx-export-numbering', level: 0 } : undefined,
          children: runs.length ? runs : [new docx.TextRun({ text: li.textContent || '' })]
        }));
      });
      return elements;
    }

    if (tag === 'table') {
      const rows = [];
      Array.from(el.querySelectorAll('tr')).forEach((tr, rowIdx) => {
        const isHeaderRow = rowIdx === 0 && tr.querySelector('th');
        const cells = Array.from(tr.children).map((cell) => {
          const runs = inlineRunsFromNode(cell, isHeaderRow ? { bold: true } : {});
          return new docx.TableCell({
            shading: isHeaderRow ? { fill: 'E3E6EA' } : undefined,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new docx.Paragraph({ children: runs.length ? runs : [new docx.TextRun('')] })]
          });
        });
        rows.push(new docx.TableRow({ children: cells }));
      });
      if (rows.length === 0) return [];
      return [
        new docx.Table({
          width: { size: 100, type: docx.WidthType.PERCENTAGE },
          rows
        }),
        new docx.Paragraph({ text: '' }) // breathing room after the table
      ];
    }

    if (tag === 'blockquote') {
      return [new docx.Paragraph({
        indent: { left: 360 },
        spacing: { after: 120 },
        children: [new docx.TextRun({ text: el.textContent || '', italics: true })]
      })];
    }

    if (tag === 'hr') {
      return [new docx.Paragraph({
        border: { bottom: { color: 'CCCCCC', space: 1, style: docx.BorderStyle.SINGLE, size: 6 } },
        spacing: { before: 120, after: 120 },
        text: ''
      })];
    }

    // Unknown/unsupported element (e.g. div wrapper): recurse into children
    // rather than dropping the content, falling back to plain paragraphs.
    if (el.children.length > 0) {
      const nested = [];
      Array.from(el.children).forEach((child) => nested.push(...blockToDocxElements(child)));
      if (nested.length > 0) return nested;
    }
    const text = el.textContent.trim();
    return text ? [new docx.Paragraph({ text })] : [];
  }

  function editorContentToDocxElements(editorEl) {
    const elements = [];
    Array.from(editorEl.children).forEach((child) => {
      elements.push(...blockToDocxElements(child));
    });
    // Fully empty editor (shouldn't happen given the generation-side
    // validation, but keep export from producing a broken/blank .docx).
    if (elements.length === 0) {
      elements.push(new docx.Paragraph({ text: editorEl.innerText || '' }));
    }
    return elements;
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      if (!window.docx) {
        showToast('Word export library not loaded', 'error');
        return;
      }
      const original = downloadBtn.innerHTML;
      downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
      try {
        const title = config.titleFor(resultData);
        const printMeta = config.printMeta ? config.printMeta(resultData) : [];
        const bodyElements = editorContentToDocxElements(editor);

        const doc = new docx.Document({
          numbering: {
            config: [{
              reference: 'docx-export-numbering',
              levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: docx.AlignmentType.START }]
            }]
          },
          sections: [{
            children: [
              new docx.Paragraph({ text: title, heading: docx.HeadingLevel.HEADING_1, spacing: { after: 120 } }),
              new docx.Paragraph({ text: `Date: ${new Date().toLocaleString()}`, spacing: { after: 60 } }),
              ...printMeta.map(([k, v]) => new docx.Paragraph({ text: `${k}: ${v}`, spacing: { after: 40 } })),
              new docx.Paragraph({ text: '' }),
              ...bodyElements
            ]
          }]
        });

        const blob = await docx.Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${config.fileBase(resultData)}_${Date.now()}.docx`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Document downloaded successfully', 'success');
      } catch (err) {
        console.error('Download error:', err);
        showToast('Export failed', 'error');
      } finally {
        downloadBtn.innerHTML = original;
      }
    });
  }

  if (pdfBtn) {
    pdfBtn.addEventListener('click', () => {
      if (!window.html2pdf) {
        showToast('PDF library not loaded', 'error');
        return;
      }
      const original = pdfBtn.innerHTML;
      pdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating PDF...';
      const opt = {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: `${config.fileBase(resultData)}_${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, letterRendering: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
      };
      html2pdf().set(opt).from(editor).save()
        .then(() => showToast('PDF generated successfully', 'success'))
        .catch((err) => {
          console.error('PDF error:', err);
          showToast('PDF generation failed', 'error');
        })
        .finally(() => { pdfBtn.innerHTML = original; });
    });
  }

  if (printBtn) {
    printBtn.addEventListener('click', () => {
      const printWindow = window.open('', '_blank');
      const title = config.titleFor(resultData);
      const printMeta = config.printMeta ? config.printMeta(resultData) : [];
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; padding: 2rem; max-width: 800px; margin: 0 auto; }
            h1 { color: ${config.accent}; border-bottom: 2px solid ${config.accent}; padding-bottom: 0.5rem; }
            h2 { color: ${config.accent}; margin-top: 1.5rem; }
            table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f5f5f5; }
            ul, ol { margin: 0.5rem 0; padding-left: 1.5rem; }
            @media print { body { margin: 0; padding: 0.5in; } }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          ${printMeta.map(([k, v]) => `<p><strong>${k}:</strong> ${v}</p>`).join('')}
          <hr>
          ${editor.innerHTML}
          <hr>
          <p style="font-size: 0.8rem; color: #666;">Generated by rehablix</p>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    });
  }

  if (pptExportBtn) {
    pptExportBtn.addEventListener('click', () => {
      if (!resultData || !config.pptExportData) {
        showToast('No content to export.', 'error');
        return;
      }
      try {
        const data = config.pptExportData(resultData, editor.innerHTML, editor.innerText);
        localStorage.setItem('pptExportData', JSON.stringify(data));
        window.open('ppt-export.html', '_blank');
      } catch (err) {
        console.error('Export error:', err);
        showToast('Failed to export: ' + err.message, 'error');
      }
    });
  }

  if (saveEditBtn) {
    saveEditBtn.addEventListener('click', () => {
      if (currentIsOwner) saveToFirebase();
      else showToast('Read-only mode: cannot save', 'error');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.location.href = config.closeUrl || 'index.html';
    });
  }

  if (publicToggle) publicToggle.addEventListener('change', togglePublic);

  // --- Share modal ---------------------------------------------------------
  function closeShareModal() {
    shareModal.classList.remove('show');
  }
  document.querySelectorAll('.share-close, .modal-close').forEach((btn) => btn.addEventListener('click', closeShareModal));
  if (shareModal) shareModal.addEventListener('click', (e) => { if (e.target === shareModal) closeShareModal(); });

  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareLink.value);
        showToast('Link copied to clipboard', 'success');
      } catch (err) {
        showToast('Failed to copy link', 'error');
      }
    });
  }

  if (shareEmailBtn) {
    shareEmailBtn.addEventListener('click', () => {
      const subject = encodeURIComponent(config.shareSubject ? config.shareSubject(resultData) : config.pageTitle);
      const body = encodeURIComponent(`Check this out: ${shareLink.value}`);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    });
  }

  if (shareWhatsAppBtn) {
    shareWhatsAppBtn.addEventListener('click', () => {
      const text = encodeURIComponent(`Check this out: ${shareLink.value}`);
      window.open(`https://wa.me/?text=${text}`, '_blank');
    });
  }

  if (shareTwitterBtn) {
    shareTwitterBtn.addEventListener('click', () => {
      const text = encodeURIComponent(`${config.shareSubject ? config.shareSubject(resultData) : config.pageTitle}: ${shareLink.value}`);
      window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
    });
  }

  // --- Auth & init ---------------------------------------------------------
  firebase.auth().onAuthStateChanged(async (user) => {
    currentUser = user;
    await loadResult();
  });

  updateWordAndCharCount();
});
