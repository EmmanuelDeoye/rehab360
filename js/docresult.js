// docresult.js - Complete document editor with full synchronization to doc.html

document.addEventListener('DOMContentLoaded', async function() {
    // =========================================================================
    // DOM Elements
    // =========================================================================
    const editor = document.getElementById('editorContent');
    const docTitle = document.getElementById('docTitle');
    const docFileNameSpan = document.getElementById('docFileName');
    const docDateSpan = document.getElementById('docDate');
    const docTypeSpan = document.getElementById('docType');
    const docLastEditedSpan = document.getElementById('docLastEdited');
    const wordCountSpan = document.getElementById('wordCount');
    const charCountSpan = document.getElementById('charCount');
    const saveStatusSpan = document.getElementById('saveStatus');
    const toastContainer = document.getElementById('toast-container');

    // Action Buttons
    const shareBtn = document.getElementById('shareBtn');
    const copyBtn = document.getElementById('copyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const pdfBtn = document.getElementById('pdfBtn');
    const printBtn = document.getElementById('printBtn');
    const saveEditBtn = document.getElementById('saveEditBtn');
    const closeDocBtn = document.getElementById('closeDocBtn');
    const regenerateBtn = document.getElementById('regenerateBtn');
    const deleteBtn = document.getElementById('deleteBtn');

    // Inline regeneration input
    const regenerateInstructions = document.getElementById('regenerateInstructions');

    // Share Modal
    const shareModal = document.getElementById('shareModal');
    const shareLink = document.getElementById('shareLink');
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    const shareEmailBtn = document.getElementById('shareEmailBtn');
    const shareWhatsAppBtn = document.getElementById('shareWhatsAppBtn');
    const shareTwitterBtn = document.getElementById('shareTwitterBtn');

    // Formatting elements
    const fontFamilySelect = document.getElementById('fontFamilySelect');
    const fontSizeSelect = document.getElementById('fontSizeSelect');

    // =========================================================================
    // State
    // =========================================================================
    let currentUser = null;
    let scopeUid = null; // resolves to the center owner's uid for center members, so shared patient docs are visible
    let documentData = null;
    let docId = null;
    let docType = null; // 'summary', 'treatment', 'session', 'report', 'progress', 'discharge', 'nextsession'
    let docIndex = null;
    let sessionId = null;
    let reportId = null;
    let action = null;
    let autoSaveTimer = null;
    let isSaving = false;
    let currentIsOwner = true;
    let isNewDocument = false;

    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    docId = urlParams.get('id');
    docType = urlParams.get('type');
    docIndex = urlParams.get('index') !== null ? parseInt(urlParams.get('index')) : null;
    sessionId = urlParams.get('sessionId');
    reportId = urlParams.get('reportId');
    action = urlParams.get('action');

    const database = firebase.database();

    // =========================================================================
    // Helper Functions
    // =========================================================================
    function showToast(message, type = 'success', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    }

    function updateWordAndCharCount() {
        const text = editor.innerText || '';
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const chars = text.length;
        wordCountSpan.textContent = `${words} word${words !== 1 ? 's' : ''}`;
        charCountSpan.textContent = `${chars} character${chars !== 1 ? 's' : ''}`;
    }

    function updateSaveStatus(status, isError = false) {
        saveStatusSpan.textContent = status;
        saveStatusSpan.className = '';
        if (isError) {
            saveStatusSpan.style.color = '#dc2626';
        } else if (status === 'Saving...') {
            saveStatusSpan.style.color = '#f59e0b';
            saveStatusSpan.className = 'saving';
        } else if (status === 'Saved') {
            saveStatusSpan.style.color = 'var(--accent)';
            saveStatusSpan.className = 'saved';
        } else {
            saveStatusSpan.style.color = 'var(--text-secondary)';
        }
    }

    function setEditorReadOnly(readOnly) {
        if (readOnly) {
            editor.setAttribute('contenteditable', 'false');
            document.querySelectorAll('.format-btn, .format-select, #saveEditBtn, #regenerateBtn, #deleteBtn').forEach(el => {
                if (el) {
                    el.disabled = true;
                    el.style.opacity = '0.5';
                    el.style.cursor = 'not-allowed';
                }
            });
            if (regenerateInstructions) {
                regenerateInstructions.disabled = true;
                regenerateInstructions.style.opacity = '0.5';
            }
            const statusRight = document.querySelector('.status-right');
            if (statusRight) {
                let msg = document.getElementById('readOnlyMsg');
                if (!msg) {
                    msg = document.createElement('span');
                    msg.id = 'readOnlyMsg';
                    msg.textContent = ' | Read-only mode';
                    msg.style.color = '#f59e0b';
                    statusRight.appendChild(msg);
                }
            }
        } else {
            editor.setAttribute('contenteditable', 'true');
            document.querySelectorAll('.format-btn, .format-select, #saveEditBtn, #regenerateBtn, #deleteBtn').forEach(el => {
                if (el) {
                    el.disabled = false;
                    el.style.opacity = '1';
                    el.style.cursor = 'pointer';
                }
            });
            if (regenerateInstructions) {
                regenerateInstructions.disabled = false;
                regenerateInstructions.style.opacity = '1';
            }
            const msg = document.getElementById('readOnlyMsg');
            if (msg) msg.remove();
        }
    }

    // =========================================================================
    // Markdown to HTML converter (clean, minimal)
    // =========================================================================
    function markdownToHtml(markdown) {
        if (!markdown) return '<p>No content available</p>';
        
        // If it already looks like HTML, return as is
        if (markdown.trim().startsWith('<') && markdown.includes('>')) {
            return markdown;
        }

        let html = markdown;

        // Escape HTML entities first to prevent issues
        html = html.replace(/&/g, '&amp;');
        html = html.replace(/</g, '&lt;');
        html = html.replace(/>/g, '&gt;');

        // Headings
        html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

        // Bold & italic
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        html = html.replace(/_(.*?)_/g, '<em>$1</em>');

        // Strikethrough
        html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');

        // Code
        html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Handle unordered lists
        html = html.replace(/^[\s]*[-*+] (.*?)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
        // Clean up duplicate ul tags
        html = html.replace(/<\/ul>\s*<ul>/g, '');

        // Handle ordered lists
        html = html.replace(/^[\s]*\d+\. (.*?)$/gm, '<li>$1</li>');
        // Wrap consecutive li in ol (only if not already wrapped)
        html = html.replace(/(<li>.*?<\/li>)/gs, '<ol>$1</ol>');
        html = html.replace(/<\/ol>\s*<ol>/g, '');

        // Handle blockquotes
        html = html.replace(/^&gt; (.*?)$/gm, '<blockquote>$1</blockquote>');
        // Clean up blockquote stacking
        html = html.replace(/<\/blockquote>\s*<blockquote>/g, '<br>');

        // Handle horizontal rules
        html = html.replace(/^---$/gm, '<hr>');

        // Handle line breaks - convert double newlines to paragraphs
        const paragraphs = html.split('\n\n');
        if (paragraphs.length > 1) {
            html = paragraphs.map(p => {
                p = p.trim();
                if (!p) return '';
                // If it's already wrapped in a tag, leave it
                if (p.match(/^<[a-z]/i)) return p;
                return `<p>${p}</p>`;
            }).join('');
        } else {
            // Single paragraph or no double breaks
            html = html.replace(/\n/g, '<br>');
        }

        // Clean up empty paragraphs
        html = html.replace(/<p><\/p>/g, '');
        html = html.replace(/<p>\s*<\/p>/g, '');

        // Fix nested tags issue: ensure proper nesting
        html = html.replace(/<p><(h[1-6])/g, '<$1');
        html = html.replace(/<\/(h[1-6])><\/p>/g, '</$1>');
        html = html.replace(/<p><(ul|ol|li|blockquote|pre|hr)/g, '<$1');
        html = html.replace(/<\/(ul|ol|li|blockquote|pre)><\/p>/g, '</$1>');

        // Clean up multiple spaces
        html = html.replace(/&nbsp;/g, ' ');
        html = html.replace(/ {2,}/g, ' ');

        return html || '<p>No content available</p>';
    }

    // =========================================================================
    // AI API helpers
    // =========================================================================
    let aiConfig = { token: null, endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash' };

    async function fetchTokens() {
        try {
            const snapshot = await database.ref('tokens/deepseek').once('value');
            const data = snapshot.val();
            if (data?.api_key) {
                aiConfig.token = data.api_key;
                console.log('[docresult] DeepSeek API loaded');
                return true;
            }
            console.warn('[docresult] DeepSeek API key missing');
            return false;
        } catch (error) {
            console.error('[docresult] Token fetch error:', error);
            return false;
        }
    }

    async function callDeepSeek(systemPrompt, userPrompt, maxTokens = 2000) {
        if (!aiConfig.token) {
            const ok = await fetchTokens();
            if (!ok) throw new Error('AI service not available');
        }
        const url = `${aiConfig.endpoint}/chat/completions`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${aiConfig.token}`
            },
            body: JSON.stringify({
                model: aiConfig.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: maxTokens,
                temperature: 0.7,
                top_p: 0.9
            })
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData?.error?.message || `API error: ${response.status}`);
        }
        const data = await response.json();
        return data.choices[0].message.content;
    }

    // =========================================================================
    // Save to Firebase (doc.html compatible paths)
    // =========================================================================
    async function saveToFirebase() {
        if (!currentUser || !docId || isSaving) return;
        if (!currentIsOwner) {
            showToast('You cannot edit a shared document.', 'error');
            return;
        }

        isSaving = true;
        updateSaveStatus('Saving...');

        try {
            const htmlContent = editor.innerHTML;
            const plainText = editor.innerText || '';
            const path = `history/${scopeUid}/patients/${docId}`;
            let ref, snap, data;

            switch (docType) {
                case 'summary':
                    ref = database.ref(`${path}/summaries`);
                    snap = await ref.once('value');
                    let summaries = snap.val() || [];
                    if (isNewDocument || docIndex === null || docIndex >= summaries.length) {
                        summaries.push({
                            title: `Summary - ${new Date().toLocaleDateString()}`,
                            content: htmlContent,
                            plainText: plainText,
                            date: new Date().toLocaleDateString()
                        });
                        docIndex = summaries.length - 1;
                        isNewDocument = false;
                    } else {
                        summaries[docIndex].content = htmlContent;
                        summaries[docIndex].plainText = plainText;
                        summaries[docIndex].lastEdited = new Date().toLocaleString();
                    }
                    await ref.set(summaries);
                    documentData = summaries[docIndex];
                    break;

                case 'treatment':
                    ref = database.ref(`${path}/treatmentPlans`);
                    snap = await ref.once('value');
                    let plans = snap.val() || [];
                    if (isNewDocument || docIndex === null || docIndex >= plans.length) {
                        plans.push({
                            title: `Treatment Plan - ${new Date().toLocaleDateString()}`,
                            content: htmlContent,
                            plainText: plainText,
                            date: new Date().toLocaleDateString(),
                            category: documentData?.category || '',
                            profession: documentData?.profession || '',
                            state: documentData?.state || ''
                        });
                        docIndex = plans.length - 1;
                        isNewDocument = false;
                    } else {
                        plans[docIndex].content = htmlContent;
                        plans[docIndex].plainText = plainText;
                        plans[docIndex].lastEdited = new Date().toLocaleString();
                    }
                    await ref.set(plans);
                    documentData = plans[docIndex];
                    break;

                case 'session':
                    if (isNewDocument || !sessionId) {
                        const newRef = database.ref(`${path}/sessions`).push();
                        data = {
                            id: newRef.key,
                            date: new Date().toISOString().split('T')[0],
                            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            type: 'Session',
                            therapist: currentUser.displayName || currentUser.email || 'Clinician',
                            notes: htmlContent,
                            content: htmlContent,
                            plainText: plainText,
                            signed: false,
                            timestamp: firebase.database.ServerValue.TIMESTAMP
                        };
                        await newRef.set(data);
                        sessionId = newRef.key;
                        
                        // Update session count
                        const countRef = database.ref(`${path}/sessionCount`);
                        const countSnap = await countRef.once('value');
                        const count = (countSnap.val() || 0) + 1;
                        await countRef.set(count);
                        
                        documentData = data;
                        isNewDocument = false;
                    } else {
                        ref = database.ref(`${path}/sessions/${sessionId}`);
                        snap = await ref.once('value');
                        const existing = snap.val() || {};
                        existing.id = existing.id || sessionId; // self-heal older sessions saved before the id fix
                        existing.notes = htmlContent;
                        existing.content = htmlContent;
                        existing.plainText = plainText;
                        existing.lastEdited = new Date().toLocaleString();
                        await ref.set(existing);
                        documentData = existing;
                    }
                    break;

                case 'report':
                    ref = database.ref(`${path}/reports`);
                    snap = await ref.once('value');
                    let reports = snap.val() || [];
                    if (isNewDocument || !reportId) {
                        const newReport = {
                            id: Date.now().toString(),
                            title: `Report - ${new Date().toLocaleDateString()}`,
                            content: htmlContent,
                            plainText: plainText,
                            date: new Date().toLocaleDateString(),
                            status: 'Draft'
                        };
                        reports.push(newReport);
                        reportId = newReport.id;
                        docIndex = reports.length - 1;
                        isNewDocument = false;
                    } else {
                        const idx = reports.findIndex(r => r.id === reportId);
                        if (idx >= 0) {
                            reports[idx].content = htmlContent;
                            reports[idx].plainText = plainText;
                            reports[idx].lastEdited = new Date().toLocaleString();
                        }
                    }
                    await ref.set(reports);
                    documentData = reports.find(r => r.id === reportId) || null;
                    break;

                case 'progress':
                    ref = database.ref(`${path}/progressNotes`);
                    snap = await ref.once('value');
                    let notes = snap.val() || [];
                    if (isNewDocument || docIndex === null || docIndex >= notes.length) {
                        const newNote = {
                            id: Date.now().toString(),
                            title: `Progress Note - ${new Date().toLocaleDateString()}`,
                            content: htmlContent,
                            plainText: plainText,
                            date: new Date().toLocaleDateString()
                        };
                        notes.push(newNote);
                        docIndex = notes.length - 1;
                        isNewDocument = false;
                    } else {
                        notes[docIndex].content = htmlContent;
                        notes[docIndex].plainText = plainText;
                        notes[docIndex].lastEdited = new Date().toLocaleString();
                    }
                    await ref.set(notes);
                    documentData = notes[docIndex];
                    break;

                case 'discharge':
                    ref = database.ref(`${path}/dischargeSummaries`);
                    snap = await ref.once('value');
                    let dischargeSummaries = snap.val() || [];
                    if (isNewDocument || docIndex === null || docIndex >= dischargeSummaries.length) {
                        dischargeSummaries.push({
                            title: `Discharge Summary - ${new Date().toLocaleDateString()}`,
                            content: htmlContent,
                            plainText: plainText,
                            date: new Date().toLocaleDateString()
                        });
                        docIndex = dischargeSummaries.length - 1;
                        isNewDocument = false;
                    } else {
                        dischargeSummaries[docIndex].content = htmlContent;
                        dischargeSummaries[docIndex].plainText = plainText;
                        dischargeSummaries[docIndex].lastEdited = new Date().toLocaleString();
                    }
                    await ref.set(dischargeSummaries);
                    documentData = dischargeSummaries[docIndex];
                    break;

                case 'nextsession':
                    ref = database.ref(`${path}/nextSessionPlan`);
                    data = {
                        title: `Next Session - ${new Date().toLocaleDateString()}`,
                        content: htmlContent,
                        plainText: plainText,
                        date: new Date().toLocaleDateString(),
                        completed: false,
                        lastEdited: new Date().toLocaleString()
                    };
                    await ref.set(data);
                    documentData = data;
                    isNewDocument = false;
                    break;

                default:
                    throw new Error('Unknown document type: ' + docType);
            }

            updateSaveStatus('Saved');
            if (docLastEditedSpan) docLastEditedSpan.textContent = new Date().toLocaleString();
            showToast('Changes saved successfully', 'success');

        } catch (error) {
            console.error('Save error:', error);
            updateSaveStatus('Save failed', true);
            showToast('Failed to save: ' + error.message, 'error');
        } finally {
            isSaving = false;
        }
    }

    // =========================================================================
    // Load Document
    // =========================================================================
    async function loadDocument() {
        // Show loading state immediately
        editor.innerHTML = '<div class="loading-editor"><i class="fas fa-spinner fa-spin"></i> Loading document...</div>';
        
        if (!docId) {
            showToast('No document ID provided', 'error');
            editor.innerHTML = '<div class="loading-editor"><i class="fas fa-exclamation-circle"></i> No document ID provided.</div>';
            return;
        }

        if (!currentUser) {
            // Wait for auth
            editor.innerHTML = '<div class="loading-editor"><i class="fas fa-spinner fa-spin"></i> Authenticating...</div>';
            return;
        }

        try {
            let data = null;
            const path = `history/${scopeUid}/patients/${docId}`;
            let ref, snap;

            switch (docType) {
                case 'summary':
                    ref = database.ref(`${path}/summaries`);
                    snap = await ref.once('value');
                    const summaries = snap.val() || [];
                    if (action === 'new' || docIndex === null || docIndex >= summaries.length) {
                        data = { title: 'New Summary', content: '', date: new Date().toLocaleDateString() };
                        isNewDocument = true;
                    } else {
                        data = summaries[docIndex];
                        isNewDocument = false;
                    }
                    break;

                case 'treatment':
                    ref = database.ref(`${path}/treatmentPlans`);
                    snap = await ref.once('value');
                    const plans = snap.val() || [];
                    if (action === 'new' || docIndex === null || docIndex >= plans.length) {
                        data = { title: 'New Treatment Plan', content: '', date: new Date().toLocaleDateString() };
                        isNewDocument = true;
                    } else {
                        data = plans[docIndex];
                        isNewDocument = false;
                    }
                    break;

                case 'session':
                    if (sessionId) {
                        ref = database.ref(`${path}/sessions/${sessionId}`);
                        snap = await ref.once('value');
                        data = snap.val();
                        if (!data) throw new Error('Session not found');
                        isNewDocument = false;
                    } else if (action === 'new') {
                        data = { title: 'New Session', notes: '', date: new Date().toLocaleDateString() };
                        isNewDocument = true;
                    } else {
                        throw new Error('No session ID provided');
                    }
                    break;

                case 'report':
                    if (reportId) {
                        ref = database.ref(`${path}/reports`);
                        snap = await ref.once('value');
                        const reports = snap.val() || [];
                        const found = reports.find(r => r.id === reportId);
                        if (found) {
                            data = found;
                            isNewDocument = false;
                        } else {
                            throw new Error('Report not found');
                        }
                    } else if (action === 'new') {
                        data = { title: 'New Report', content: '', date: new Date().toLocaleDateString() };
                        isNewDocument = true;
                    } else {
                        throw new Error('No report ID provided');
                    }
                    break;

                case 'progress':
                    ref = database.ref(`${path}/progressNotes`);
                    snap = await ref.once('value');
                    const notes = snap.val() || [];
                    if (action === 'new' || docIndex === null || docIndex >= notes.length) {
                        data = { title: 'New Progress Note', content: '', date: new Date().toLocaleDateString() };
                        isNewDocument = true;
                    } else {
                        data = notes[docIndex];
                        isNewDocument = false;
                    }
                    break;

                case 'discharge':
                    ref = database.ref(`${path}/dischargeSummaries`);
                    snap = await ref.once('value');
                    const dischargeSummaries = snap.val() || [];
                    if (action === 'new' || docIndex === null || docIndex >= dischargeSummaries.length) {
                        data = { title: 'New Discharge Summary', content: '', date: new Date().toLocaleDateString() };
                        isNewDocument = true;
                    } else {
                        data = dischargeSummaries[docIndex];
                        isNewDocument = false;
                    }
                    break;

                case 'nextsession':
                    ref = database.ref(`${path}/nextSessionPlan`);
                    snap = await ref.once('value');
                    data = snap.val();
                    if (!data) {
                        data = { title: 'New Next Session Plan', content: '', date: new Date().toLocaleDateString() };
                        isNewDocument = true;
                    } else {
                        isNewDocument = false;
                    }
                    break;

                default:
                    throw new Error('Unknown document type: ' + docType);
            }

            if (!data) throw new Error('Document data not found');

            documentData = data;

            // Update metadata
            const typeLabels = {
                summary: 'Summary Report',
                treatment: 'Treatment Plan',
                session: 'Session Note',
                report: 'Clinical Report',
                progress: 'Progress Note',
                discharge: 'Discharge Summary',
                nextsession: 'Next Session Plan'
            };
            const label = typeLabels[docType] || 'Document';

            docTitle.textContent = `${label} Editor`;
            docFileNameSpan.textContent = data.title || `${label} - ${new Date().toLocaleDateString()}`;
            docDateSpan.textContent = data.date || new Date().toLocaleDateString();
            docTypeSpan.textContent = label;
            docLastEditedSpan.textContent = data.lastEdited || data.date || '-';

            // Determine content field (varies by type)
            let content = '';
            if (docType === 'session') {
                // Sessions store content in 'notes' or 'content' field
                content = data.notes || data.content || '';
            } else {
                content = data.content || data.notes || '';
            }

            // If empty, show placeholder
            if (!content || content.trim() === '') {
                if (isNewDocument) {
                    content = '<p>Start writing here...</p>';
                } else {
                    content = '<p>No content available</p>';
                }
            } else if (!content.trim().startsWith('<')) {
                // Convert plain text/markdown to HTML
                content = markdownToHtml(content);
            }

            editor.innerHTML = content;
            updateWordAndCharCount();

            // Enable editing
            setEditorReadOnly(false);

        } catch (error) {
            console.error('Load error:', error);
            showToast('Failed to load document: ' + error.message, 'error');
            editor.innerHTML = `<div class="loading-editor"><i class="fas fa-exclamation-circle"></i> Error: ${error.message}</div>`;
        }
    }

    // =========================================================================
    // Regenerate with AI (using inline instructions)
    // =========================================================================
    async function regenerateDocument() {
        if (!currentUser || !currentIsOwner) {
            showToast('You cannot edit a shared document.', 'error');
            return;
        }

        const instructions = regenerateInstructions?.value?.trim();
        if (!instructions) {
            showToast('Please enter specific regeneration instructions in the text field above.', 'warning');
            regenerateInstructions?.focus();
            return;
        }

        let patientData = null;
        try {
            const snap = await database.ref(`history/${scopeUid}/patients/${docId}`).once('value');
            patientData = snap.val();
        } catch (e) {
            console.error('Could not fetch patient data:', e);
        }

        if (!patientData) {
            showToast('Patient data not found', 'error');
            return;
        }

        const context = {
            name: patientData.name || 'Patient',
            diagnosis: patientData.primaryDx || 'Unknown',
            chiefComplaint: patientData.chiefComplaint || '',
            goals: patientData.goals || '',
            category: patientData.category || '',
            profession: patientData.profession || patientData.department || '',
            state: patientData.state || '',
            assessment: patientData.assessment || '',
            currentContent: editor.innerText || '',
            instructions: instructions
        };

        // Build prompts with human touch
        const typePrompts = {
            summary: {
                system: `You are an experienced medical writer creating a clinical summary. Write in a clear, natural, and professional tone—as if you're explaining the case to a trusted colleague. Use clinical terminology but keep the language flowing and human. Avoid robotic phrasing, bullet lists, or markdown. Write in complete sentences and well-structured paragraphs.`,
                user: `Patient: ${context.name}\nDiagnosis: ${context.diagnosis}\nChief Complaint: ${context.chiefComplaint}\nFunctional Goals: ${context.goals}\nCategory: ${context.category}\nProfession: ${context.profession}\nState: ${context.state}\nAssessment: ${context.assessment || 'Not provided'}\n\nCurrent document content:\n${context.currentContent}\n\nSpecific regeneration instructions:\n${context.instructions}\n\nPlease regenerate this summary report according to the instructions above.`
            },
            treatment: {
                system: `You are a thoughtful rehabilitation specialist creating a treatment plan. Write in a natural, human tone as if you're sitting down with a colleague to discuss the patient's care. Include specific, actionable steps while keeping the language warm and professional. Avoid bullet lists and markdown—use flowing paragraphs with clear section breaks.`,
                user: `Patient: ${context.name}\nDiagnosis: ${context.diagnosis}\nChief Complaint: ${context.chiefComplaint}\nFunctional Goals: ${context.goals}\nCategory: ${context.category}\nProfession: ${context.profession}\nState: ${context.state}\n\nCurrent treatment plan:\n${context.currentContent}\n\nSpecific regeneration instructions:\n${context.instructions}\n\nPlease regenerate this treatment plan according to the instructions above.`
            },
            session: {
                system: `You are a rehabilitation clinician writing session notes. Document the session in a warm, professional, and human manner—as if you're recording observations for the care team. Keep clinical accuracy but sound like a real person wrote it. Use complete sentences and avoid robotic or overly terse language. Do not use markdown.`,
                user: `Patient: ${context.name}\nDiagnosis: ${context.diagnosis}\nChief Complaint: ${context.chiefComplaint}\nFunctional Goals: ${context.goals}\nCategory: ${context.category}\nProfession: ${context.profession}\nState: ${context.state}\n\nCurrent session notes:\n${context.currentContent}\n\nSpecific regeneration instructions:\n${context.instructions}\n\nPlease regenerate these session notes according to the instructions above.`
            },
            report: {
                system: `You are an experienced medical report writer. Create a comprehensive, professional clinical report that reads like a well-crafted narrative. Use natural language while maintaining clinical precision. Avoid robotic phrasing, bullet lists, and markdown. Write in clear paragraphs with logical flow and appropriate section headings in plain text.`,
                user: `Patient: ${context.name}\nDiagnosis: ${context.diagnosis}\nChief Complaint: ${context.chiefComplaint}\nFunctional Goals: ${context.goals}\nCategory: ${context.category}\nProfession: ${context.profession}\nState: ${context.state}\nAssessment: ${context.assessment || 'Not provided'}\n\nCurrent report:\n${context.currentContent}\n\nSpecific regeneration instructions:\n${context.instructions}\n\nPlease regenerate this report according to the instructions above.`
            },
            progress: {
                system: `You are a rehabilitation clinician writing a progress note. Document the patient's progress in a warm, natural, and professional tone—like you're updating a colleague. Include specific observations and clinical details while keeping the writing human and readable. Do not use markdown or bullet lists.`,
                user: `Patient: ${context.name}\nDiagnosis: ${context.diagnosis}\nChief Complaint: ${context.chiefComplaint}\nFunctional Goals: ${context.goals}\nCategory: ${context.category}\nProfession: ${context.profession}\nState: ${context.state}\n\nCurrent progress note:\n${context.currentContent}\n\nSpecific regeneration instructions:\n${context.instructions}\n\nPlease regenerate this progress note according to the instructions above.`
            },
            discharge: {
                system: `You are a senior clinician writing a discharge summary. Write in a clear, compassionate, and professional tone that summarizes the patient's entire journey. Use natural, flowing language while covering all necessary clinical details. Avoid robotic phrasing, bullet lists, and markdown. Think of this as the final narrative of the patient's care episode.`,
                user: `Patient: ${context.name}\nDiagnosis: ${context.diagnosis}\nChief Complaint: ${context.chiefComplaint}\nFunctional Goals: ${context.goals}\nCategory: ${context.category}\nProfession: ${context.profession}\nState: ${context.state}\nAssessment: ${context.assessment || 'Not provided'}\n\nCurrent discharge summary:\n${context.currentContent}\n\nSpecific regeneration instructions:\n${context.instructions}\n\nPlease regenerate this discharge summary according to the instructions above.`
            },
            nextsession: {
                system: `You are a rehabilitation specialist planning the next session. Write naturally and conversationally, as if you're providing guidance to a colleague who will run the session. Include specific activities, exercises, and goals while keeping the tone warm, encouraging, and professional. Use plain text paragraphs—no markdown or bullet lists.`,
                user: `Patient: ${context.name}\nDiagnosis: ${context.diagnosis}\nChief Complaint: ${context.chiefComplaint}\nFunctional Goals: ${context.goals}\nCategory: ${context.category}\nProfession: ${context.profession}\nState: ${context.state}\n\nCurrent next session plan:\n${context.currentContent}\n\nSpecific regeneration instructions:\n${context.instructions}\n\nPlease regenerate this next session plan according to the instructions above.`
            }
        };

        const prompts = typePrompts[docType] || typePrompts.summary;
        const systemPrompt = prompts.system;
        const userPrompt = prompts.user;

        showLoading('Regenerating document with AI…', 10);
        try {
            updateLoadingProgress(30, 'Analyzing patient context…');
            const response = await callDeepSeek(systemPrompt, userPrompt, 2000);
            
            updateLoadingProgress(80, 'Formatting document…');
            const newHtml = markdownToHtml(response);
            editor.innerHTML = newHtml;
            updateWordAndCharCount();
            
            updateLoadingProgress(90, 'Saving changes…');
            await saveToFirebase();
            
            updateLoadingProgress(100, 'Done!');
            setTimeout(() => {
                hideLoading();
                showToast('Document regenerated successfully!', 'success');
                // Clear the instructions field
                if (regenerateInstructions) regenerateInstructions.value = '';
            }, 500);
        } catch (error) {
            console.error('Regenerate error:', error);
            hideLoading();
            showToast('Error regenerating document: ' + error.message, 'error');
        }
    }

    // =========================================================================
    // Delete Document
    // =========================================================================
    async function deleteDocument() {
        if (!currentUser || !docId || !currentIsOwner) {
            showToast('Cannot delete: missing permission', 'error');
            return;
        }
        
        if (!confirm(`Are you sure you want to delete this ${docType || 'document'}? This action cannot be undone.`)) {
            return;
        }

        try {
            const path = `history/${scopeUid}/patients/${docId}`;
            let ref, snap;

            switch (docType) {
                case 'summary':
                    ref = database.ref(`${path}/summaries`);
                    snap = await ref.once('value');
                    let summaries = snap.val() || [];
                    if (docIndex !== null && docIndex < summaries.length) {
                        summaries.splice(docIndex, 1);
                        await ref.set(summaries);
                    }
                    break;

                case 'treatment':
                    ref = database.ref(`${path}/treatmentPlans`);
                    snap = await ref.once('value');
                    let plans = snap.val() || [];
                    if (docIndex !== null && docIndex < plans.length) {
                        plans.splice(docIndex, 1);
                        await ref.set(plans);
                    }
                    break;

                case 'session':
                    if (sessionId) {
                        await database.ref(`${path}/sessions/${sessionId}`).remove();
                        
                        // Update session count
                        const countRef = database.ref(`${path}/sessionCount`);
                        const countSnap = await countRef.once('value');
                        const count = Math.max(0, (countSnap.val() || 1) - 1);
                        await countRef.set(count);
                    }
                    break;

                case 'report':
                    ref = database.ref(`${path}/reports`);
                    snap = await ref.once('value');
                    let reports = snap.val() || [];
                    reports = reports.filter(r => r.id !== reportId);
                    await ref.set(reports);
                    break;

                case 'progress':
                    ref = database.ref(`${path}/progressNotes`);
                    snap = await ref.once('value');
                    let notes = snap.val() || [];
                    if (docIndex !== null && docIndex < notes.length) {
                        notes.splice(docIndex, 1);
                        await ref.set(notes);
                    }
                    break;

                case 'discharge':
                    ref = database.ref(`${path}/dischargeSummaries`);
                    snap = await ref.once('value');
                    let dischargeSummaries = snap.val() || [];
                    if (docIndex !== null && docIndex < dischargeSummaries.length) {
                        dischargeSummaries.splice(docIndex, 1);
                        await ref.set(dischargeSummaries);
                    }
                    break;

                case 'nextsession':
                    await database.ref(`${path}/nextSessionPlan`).remove();
                    break;

                default:
                    showToast('Unknown document type for deletion', 'error');
                    return;
            }

            showToast('Document deleted successfully', 'success');
            setTimeout(() => {
                window.location.href = 'doc.html';
            }, 500);

        } catch (error) {
            console.error('Delete error:', error);
            showToast('Error deleting document: ' + error.message, 'error');
        }
    }

    // =========================================================================
    // Loading Overlay
    // =========================================================================
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'aiLoadingOverlay';
    loadingOverlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
        z-index: 10000; display: none;
        align-items: center; justify-content: center;
    `;
    loadingOverlay.innerHTML = `
        <div style="background:var(--card-bg);backdrop-filter:blur(12px);border-radius:1.5rem;padding:2rem 3rem;max-width:400px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="width:48px;height:48px;border:4px solid var(--border-light);border-top-color:var(--accent);border-right-color:var(--accent);border-radius:50%;margin:0 auto 1rem;animation:spin 0.8s linear infinite;"></div>
            <p id="aiLoadingMessage" style="color:var(--text-primary);font-size:1rem;font-weight:600;margin-bottom:0.5rem;">Generating with AI…</p>
            <div style="height:4px;background:var(--border-light);border-radius:2px;overflow:hidden;margin-top:0.8rem;">
                <div id="aiLoadingProgress" style="height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-light));border-radius:2px;transition:width 0.3s ease;width:0%;"></div>
            </div>
        </div>
    `;
    document.body.appendChild(loadingOverlay);

    function showLoading(message = 'Generating with AI…', progress = 0) {
        const msgEl = document.getElementById('aiLoadingMessage');
        const progressEl = document.getElementById('aiLoadingProgress');
        if (msgEl) msgEl.textContent = message;
        if (progressEl) progressEl.style.width = progress + '%';
        loadingOverlay.style.display = 'flex';
    }

    function updateLoadingProgress(progress, message) {
        const msgEl = document.getElementById('aiLoadingMessage');
        const progressEl = document.getElementById('aiLoadingProgress');
        if (message && msgEl) msgEl.textContent = message;
        if (progressEl) progressEl.style.width = Math.min(progress, 100) + '%';
    }

    function hideLoading() {
        loadingOverlay.style.display = 'none';
        const progressEl = document.getElementById('aiLoadingProgress');
        if (progressEl) progressEl.style.width = '0%';
    }

    // =========================================================================
    // Formatting Commands
    // =========================================================================
    function execCommand(command, value = null) {
        if (!currentIsOwner) {
            showToast('Read-only mode: cannot edit', 'error', 1500);
            return;
        }
        document.execCommand(command, false, value);
        editor.focus();
        updateWordAndCharCount();
        
        // Auto-save after formatting changes
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => saveToFirebase(), 3000);
    }

    // Bind formatting buttons
    document.querySelectorAll('.format-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const command = btn.dataset.command;
            if (command === 'createLink') {
                const url = prompt('Enter URL:', 'https://');
                if (url) execCommand(command, url);
            } else if (command === 'unlink') {
                execCommand('unlink');
            } else if (command === 'undo') {
                document.execCommand('undo');
                editor.focus();
                updateWordAndCharCount();
            } else if (command === 'redo') {
                document.execCommand('redo');
                editor.focus();
                updateWordAndCharCount();
            } else if (command === 'strikeThrough') {
                execCommand('strikeThrough');
            } else if (command === 'indent') {
                execCommand('indent');
            } else if (command === 'outdent') {
                execCommand('outdent');
            } else {
                execCommand(command);
            }
        });
    });

    // Bind font/format selects
    if (fontFamilySelect) {
        fontFamilySelect.addEventListener('change', () => {
            execCommand('fontName', fontFamilySelect.value);
        });
    }

    if (fontSizeSelect) {
        fontSizeSelect.addEventListener('change', () => {
            execCommand('fontSize', fontSizeSelect.value);
        });
    }

    // =========================================================================
    // Auto-save on input
    // =========================================================================
    editor.addEventListener('input', () => {
        if (!currentIsOwner) return;
        updateWordAndCharCount();
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => saveToFirebase(), 3000);
        updateSaveStatus('Editing...');
    });

    // Keyboard shortcuts
    editor.addEventListener('keydown', (e) => {
        // Ctrl+S / Cmd+S to save
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (currentIsOwner) {
                saveToFirebase();
            } else {
                showToast('Read-only mode: cannot save', 'error', 1500);
            }
        }
        
        // Ctrl+B for bold
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            execCommand('bold');
        }
        
        // Ctrl+I for italic
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
            e.preventDefault();
            execCommand('italic');
        }
        
        // Ctrl+U for underline
        if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
            e.preventDefault();
            execCommand('underline');
        }
    });

    // =========================================================================
    // Action Button Handlers
    // =========================================================================

    // Share
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            let shareUrl = `${window.location.origin}${window.location.pathname}?id=${docId}&type=${docType}`;
            if (docIndex !== null) shareUrl += `&index=${docIndex}`;
            if (sessionId) shareUrl += `&sessionId=${sessionId}`;
            if (reportId) shareUrl += `&reportId=${reportId}`;
            if (shareLink) shareLink.value = shareUrl;
            if (shareModal) shareModal.classList.add('show');
        });
    }

    // Copy
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            try {
                const text = editor.innerText;
                await navigator.clipboard.writeText(text);
                showToast('Content copied to clipboard', 'success');
            } catch (err) {
                showToast('Failed to copy content', 'error');
            }
        });
    }

    // Download as Word
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            if (!window.docx) {
                showToast('Word export library not loaded', 'error');
                return;
            }
            
            const originalHTML = downloadBtn.innerHTML;
            downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Generating...</span>';
            
            try {
                const content = editor.innerText;
                const paragraphs = content.split('\n').map(line => {
                    if (line.trim() === '') {
                        return new docx.Paragraph({ text: '' });
                    }
                    return new docx.Paragraph({ text: line });
                });
                
                const doc = new docx.Document({
                    sections: [{
                        properties: {},
                        children: [
                            new docx.Paragraph({
                                text: documentData?.title || 'rehablix Document',
                                heading: docx.HeadingLevel.HEADING_1
                            }),
                            new docx.Paragraph({
                                text: `Date: ${new Date().toLocaleString()}`
                            }),
                            new docx.Paragraph({ text: '' }),
                            ...paragraphs
                        ]
                    }]
                });
                
                const blob = await docx.Packer.toBlob(doc);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `rehablix_document_${Date.now()}.docx`;
                a.click();
                URL.revokeObjectURL(url);
                showToast('Document downloaded successfully', 'success');
            } catch (err) {
                console.error('Download error:', err);
                showToast('Export failed', 'error');
            } finally {
                downloadBtn.innerHTML = originalHTML;
            }
        });
    }

    // PDF
    if (pdfBtn) {
        pdfBtn.addEventListener('click', () => {
            if (!window.html2pdf) {
                showToast('PDF library not loaded', 'error');
                return;
            }
            
            const originalHTML = pdfBtn.innerHTML;
            pdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Generating PDF...</span>';
            
            const element = document.getElementById('editorContent');
            const opt = {
                margin: [0.5, 0.5, 0.5, 0.5],
                filename: `rehablix_document_${Date.now()}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, letterRendering: true },
                jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
            };
            
            html2pdf().set(opt).from(element).save()
                .then(() => showToast('PDF generated successfully', 'success'))
                .catch((err) => {
                    console.error('PDF error:', err);
                    showToast('PDF generation failed', 'error');
                })
                .finally(() => {
                    pdfBtn.innerHTML = originalHTML;
                });
        });
    }

    // Print
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${documentData?.title || 'rehablix Document'}</title>
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            line-height: 1.6; 
                            padding: 2rem; 
                            max-width: 800px; 
                            margin: 0 auto; 
                        }
                        h1 { 
                            color: #00695c; 
                            border-bottom: 2px solid #00695c; 
                            padding-bottom: 0.5rem; 
                        }
                        h2 { 
                            color: #00695c; 
                            margin-top: 1.5rem; 
                        }
                        @media print { 
                            body { 
                                margin: 0; 
                                padding: 0.5in; 
                            } 
                        }
                    </style>
                </head>
                <body>
                    <h1>${documentData?.title || 'rehablix Document'}</h1>
                    <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
                    <hr>
                    ${editor.innerHTML}
                    <hr>
                    <p style="font-size: 0.8rem; color: #666;">Generated by rehablix - Intelligent Rehabilitation Tools</p>
                </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.print();
        });
    }

    // Save Edit
    if (saveEditBtn) {
        saveEditBtn.addEventListener('click', () => {
            if (currentIsOwner) {
                saveToFirebase();
            } else {
                showToast('Read-only mode: cannot save', 'error');
            }
        });
    }

    // Regenerate
    if (regenerateBtn) {
        regenerateBtn.addEventListener('click', () => {
            if (!currentIsOwner) {
                showToast('Read-only mode: cannot regenerate', 'error');
                return;
            }
            regenerateDocument();
        });
    }

    // Delete
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteDocument);
    }

    // Close
    if (closeDocBtn) {
        closeDocBtn.addEventListener('click', () => {
            window.location.href = 'doc.html';
        });
    }

    // =========================================================================
    // Share Modal Handlers
    // =========================================================================
    function closeShareModal() {
        if (shareModal) shareModal.classList.remove('show');
    }

    document.querySelectorAll('.share-close, .modal-close').forEach(btn => {
        if (btn) btn.addEventListener('click', closeShareModal);
    });

    if (shareModal) {
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) closeShareModal();
        });
    }

    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(shareLink?.value || '');
                showToast('Link copied to clipboard', 'success');
            } catch (err) {
                showToast('Failed to copy link', 'error');
            }
        });
    }

    if (shareEmailBtn) {
        shareEmailBtn.addEventListener('click', () => {
            const subject = encodeURIComponent(`rehablix Document: ${documentData?.title || 'Document'}`);
            const body = encodeURIComponent(`Check out this document: ${shareLink?.value || ''}`);
            window.location.href = `mailto:?subject=${subject}&body=${body}`;
        });
    }

    if (shareWhatsAppBtn) {
        shareWhatsAppBtn.addEventListener('click', () => {
            const text = encodeURIComponent(`Check out this rehablix document: ${shareLink?.value || ''}`);
            window.open(`https://wa.me/?text=${text}`, '_blank');
        });
    }

    if (shareTwitterBtn) {
        shareTwitterBtn.addEventListener('click', () => {
            const text = encodeURIComponent(`Check out this rehablix document: ${shareLink?.value || ''}`);
            window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
        });
    }

    // =========================================================================
    // Theme Toggle
    // =========================================================================
    document.getElementById('themeToggle')?.addEventListener('click', () => {
        const html = document.documentElement;
        const current = html.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem('rehab-theme', next);
    });

    // =========================================================================
    // Auth & Initialization
    // =========================================================================
    firebase.auth().onAuthStateChanged(async (user) => {
        currentUser = user;
        if (user) {
            if (window.RehablixCenter && typeof window.RehablixCenter.getEffectiveScopeUid === 'function') {
                try { scopeUid = await window.RehablixCenter.getEffectiveScopeUid('doc'); }
                catch (err) { scopeUid = user.uid; }
            } else {
                scopeUid = user.uid;
            }
            if (scopeUid === null) {
                editor.innerHTML = '<div class="loading-editor"><i class="fas fa-exclamation-circle"></i> Your access to Documentation has been turned off by your center admin.</div>';
                showToast('Access to Documentation has been turned off', 'error');
                return;
            }
            await fetchTokens();
            await loadDocument();
        } else {
            editor.innerHTML = '<div class="loading-editor"><i class="fas fa-exclamation-circle"></i> Please log in to access documents.</div>';
            showToast('Please log in to access documents', 'error');
        }
    });
});