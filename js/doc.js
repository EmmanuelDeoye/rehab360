// js/doc.js - Complete EMR with delete, dashboard grid, file extraction, summary, next session, discharge, etc.

document.addEventListener('DOMContentLoaded', function() {
    console.log('[EMR] Initializing...');

    // =========================================================================
    // DOM Elements
    // =========================================================================
    const sidebarItems = document.querySelectorAll('.sidebar-item[data-screen]');
    const screens = {
        dashboard: document.getElementById('screen-dashboard'),
        intake: document.getElementById('screen-intake'),
        patient: document.getElementById('screen-patient'),
        patients: document.getElementById('screen-patients')
    };

    const dashStats = {
        patients: document.getElementById('statPatients'),
        notesPending: document.getElementById('statNotesPending')
    };
    const dashAIInsights = document.getElementById('dashAIInsights');
    const dashPendingDocs = document.getElementById('dashPendingDocs');

    const intakeRail = document.getElementById('intakeRail');
    const intakeRailProgress = document.getElementById('intakeRailProgress');
    const intakeRailSteps = intakeRail.querySelectorAll('.rail-step');

    const patientTabs = document.querySelectorAll('.emr-tab');
    const patientTabPanes = document.querySelectorAll('.patient-tab-pane');

    const loadingOverlay = document.getElementById('aiLoadingOverlay');
    const loadingMessage = document.getElementById('aiLoadingMessage');
    const loadingProgress = document.getElementById('aiLoadingProgress');

    // =========================================================================
    // State
    // =========================================================================
    let currentUser = null;
    let scopeUid = null; // uid whose data (patients, etc.) this session actually reads/writes —
                          // equals currentUser.uid for individuals/owners, or the center owner's
                          // uid for a center member, so everyone on the team shares the same patients.
    let currentPatientId = null;
    let currentPatientData = null;
    let currentPlan = 'free';
    let allPatients = [];
    let aiConfig = { token: null, endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash' };
    let isEditingPatient = false;
    let editingPatientId = null;
    let uploadedFileRefs = [];
    let patientListenerRef = null;
    const database = firebase.database();

    // =========================================================================
    // Firebase Auth
    // =========================================================================
    firebase.auth().onAuthStateChanged(async user => {
        currentUser = user;
        if (user) {
            console.log('[EMR] User logged in:', user.email);
            document.getElementById('clinicianName').textContent = user.displayName || user.email?.split('@')[0] || 'Clinician';

            scopeUid = await resolveScopeUid();
            if (scopeUid === null) {
                showToast('Your access to Documentation has been turned off by your center admin. Contact them to restore it.', 'error', 6000);
                return;
            }
            if (scopeUid !== user.uid) {
                showToast('Working on your center\'s shared patients', 'info', 3000);
            }

            loadDashboardData();
            loadPatientsList();
        } else {
            console.log('[EMR] User logged out');
            showToast('Please log in to use the EMR', 'info', 3000);
        }
    });

    // Resolves which uid's patient data this session should use — see the
    // scopeUid declaration above for why this differs for center members.
    async function resolveScopeUid() {
        if (window.RehablixCenter && typeof window.RehablixCenter.getEffectiveScopeUid === 'function') {
            try {
                return await window.RehablixCenter.getEffectiveScopeUid('doc');
            } catch (err) {
                console.warn('[EMR] Scope resolution failed, defaulting to own account:', err);
                return currentUser.uid;
            }
        }
        return currentUser.uid;
    }

    // =========================================================================
    // Plan detection
    // =========================================================================
    document.addEventListener('planUpdated', (e) => {
        currentPlan = e.detail?.plan || 'free';
        console.log('[EMR] Plan updated:', currentPlan);
    });
    if (window.rehabPlans) {
        currentPlan = window.rehabPlans.getCurrentPlan() || 'free';
    }

    // =========================================================================
    // DeepSeek Token Fetch
    // =========================================================================
    async function fetchTokens() {
        try {
            const snapshot = await database.ref('tokens/deepseek').once('value');
            const data = snapshot.val();
            if (data?.api_key) {
                aiConfig.token = data.api_key;
                console.log('[EMR] DeepSeek API loaded');
                return true;
            }
            console.warn('[EMR] DeepSeek API key missing');
            return false;
        } catch (error) {
            console.error('[EMR] Token fetch error:', error);
            return false;
        }
    }

    // =========================================================================
    // Generic Multi-line Input Modal (replaces ugly prompt()/single-line dialogs)
    // fields: [{ id, label, type: 'text'|'textarea', rows, placeholder, value }]
    // Resolves with an object of {id: value} on Save, or null on Cancel.
    // =========================================================================
    function showCustomModal({ title, subtitle = '', fields }) {
        return new Promise((resolve) => {
            const modal = document.getElementById('customInputModal');
            document.getElementById('customInputTitle').textContent = title;
            const subtitleEl = document.getElementById('customInputSubtitle');
            subtitleEl.textContent = subtitle;
            subtitleEl.style.display = subtitle ? 'block' : 'none';

            const fieldsContainer = document.getElementById('customInputFields');
            fieldsContainer.innerHTML = fields.map(f => `
                <div class="form-group">
                    <label class="form-label">${escapeHtml(f.label)}</label>
                    ${f.type === 'text'
                        ? `<input class="form-input" id="customField_${escapeHtml(f.id)}" placeholder="${escapeHtml(f.placeholder || '')}" value="${escapeHtml(f.value || '')}" />`
                        : `<textarea class="form-textarea" id="customField_${escapeHtml(f.id)}" rows="${f.rows || 8}" placeholder="${escapeHtml(f.placeholder || '')}">${escapeHtml(f.value || '')}</textarea>`
                    }
                </div>
            `).join('');

            const saveBtn = document.getElementById('customInputSave');
            const cancelBtn = document.getElementById('customInputCancel');
            const closeBtn = document.getElementById('customInputClose');

            function cleanup() {
                modal.classList.remove('show');
                saveBtn.removeEventListener('click', onSave);
                cancelBtn.removeEventListener('click', onCancel);
                closeBtn.removeEventListener('click', onCancel);
            }
            function onSave() {
                const result = {};
                fields.forEach(f => {
                    const el = document.getElementById(`customField_${f.id}`);
                    result[f.id] = el ? el.value.trim() : '';
                });
                cleanup();
                resolve(result);
            }
            function onCancel() {
                cleanup();
                resolve(null);
            }
            saveBtn.addEventListener('click', onSave);
            cancelBtn.addEventListener('click', onCancel);
            closeBtn.addEventListener('click', onCancel);
            modal.classList.add('show');
        });
    }

    // =========================================================================
    // Markdown Stripping Helper
    // =========================================================================
    function stripMarkdown(text) {
        if (!text) return '';
        return text
            .replace(/^#{1,6}\s+/gm, '')   // headings
            .replace(/\*\*(.*?)\*\*/g, '$1') // bold
            .replace(/\*(.*?)\*/g, '$1')    // italic
            .replace(/`(.*?)`/g, '$1')      // code
            .trim();
    }

    // =========================================================================
    // HTML Escaping (prevents stored XSS from patient-entered free text)
    // =========================================================================
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // =========================================================================
    // Robust parser for AI responses that should be a JSON array
    // =========================================================================
    function parseAIJsonArray(text) {
        if (!text) return [];
        let cleaned = text.trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim();
        const start = cleaned.indexOf('[');
        const end = cleaned.lastIndexOf(']');
        if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
        try {
            const arr = JSON.parse(cleaned);
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            console.warn('[EMR] Could not parse AI JSON, falling back to line split', e);
            return cleaned.split('\n')
                .map(l => l.replace(/^[-*\d.]+\s*/, '').trim())
                .filter(l => l)
                .map(l => ({ title: l, detail: '' }));
        }
    }

    // =========================================================================
    // Loading Overlay
    // =========================================================================
    function showLoading(message = 'Generating with AI…', progress = 0) {
        loadingMessage.textContent = message;
        loadingProgress.style.width = progress + '%';
        loadingOverlay.style.display = 'flex';
    }

    function updateLoadingProgress(progress, message) {
        if (message) loadingMessage.textContent = message;
        loadingProgress.style.width = Math.min(progress, 100) + '%';
    }

    function hideLoading() {
        loadingOverlay.style.display = 'none';
        loadingProgress.style.width = '0%';
    }

    // =========================================================================
    // Toast System
    // =========================================================================
    function showToast(message, type = 'success', duration = 3500) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: 'bx bx-check-circle',
            error: 'bx bx-error-circle',
            info: 'bx bx-info-circle',
            warning: 'bx bx-error'
        };

        toast.innerHTML = `<i class="${icons[type] || icons.info}"></i><span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // =========================================================================
    // Screen Navigation
    // =========================================================================
    function switchScreen(screenName) {
        Object.values(screens).forEach(s => s?.classList.remove('active'));
        if (screens[screenName]) screens[screenName].classList.add('active');

        sidebarItems.forEach(item => {
            item.classList.toggle('active', item.dataset.screen === screenName);
        });

        if (screenName === 'dashboard') loadDashboardData();
        if (screenName === 'patients') loadPatientsList();
    }

    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            switchScreen(item.dataset.screen);
        });
    });

    // =========================================================================
    // Patient Tab Navigation
    // =========================================================================
    function switchPatientTab(tabName) {
        patientTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        patientTabPanes.forEach(pane => {
            pane.classList.toggle('active', pane.dataset.pane === tabName);
        });
    }

    patientTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchPatientTab(tab.dataset.tab);
        });
    });

    // =========================================================================
    // Intake Rail Navigation
    // =========================================================================
    function setIntakeStep(step) {
        intakeRailSteps.forEach((s, i) => {
            s.classList.remove('active', 'done');
            if (i < step) s.classList.add('done');
            if (i === step) s.classList.add('active');
        });
        const progress = (step / (intakeRailSteps.length - 1)) * 100;
        intakeRailProgress.style.width = `${progress}%`;
    }

    intakeRailSteps.forEach((step, index) => {
        step.addEventListener('click', () => {
            if (index <= getCurrentIntakeStep()) setIntakeStep(index);
        });
    });

    function getCurrentIntakeStep() {
        let maxStep = 0;
        intakeRailSteps.forEach((s, i) => {
            if (s.classList.contains('done') || s.classList.contains('active')) maxStep = i;
        });
        return maxStep;
    }

    // =========================================================================
    // Dashboard Data
    // =========================================================================
    async function loadDashboardData() {
        if (!currentUser) return;
        try {
            const patientsSnap = await database.ref(`history/${scopeUid}/patients`).once('value');
            const patients = patientsSnap.val() || {};
            const patientCount = Object.keys(patients).length;
            dashStats.patients.textContent = patientCount;

            document.getElementById('dashboardDate').textContent = new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric'
            });

            let pendingNotes = 0;
            for (const [patientId, patient] of Object.entries(patients)) {
                if (patient.sessions) {
                    for (const [sessionId, session] of Object.entries(patient.sessions)) {
                        if (!session.signed) pendingNotes++;
                    }
                }
            }
            dashStats.notesPending.textContent = pendingNotes;

            generateAIInsights(patients);
            renderPendingDocs(patients);
        } catch (error) {
            console.error('[EMR] Dashboard load error:', error);
        }
    }

    async function generateAIInsights(patients) {
        const insights = [];
        for (const [patientId, patient] of Object.entries(patients)) {
            if (patient.sessions) {
                const sessionList = Object.values(patient.sessions).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                if (sessionList.length >= 3) {
                    const recent = sessionList.slice(-3);
                    const painTrend = recent.map(s => s.pain || 5);
                    if (painTrend[0] < painTrend[2]) {
                        insights.push({
                            patientName: patient.name || 'Patient',
                            message: 'Pain scores trending up. Consider reassessment.',
                            severity: 'warning'
                        });
                    }
                }
            }
        }
        if (insights.length === 0) {
            dashAIInsights.innerHTML = `<div class="emr-empty-state"><i class="bx bx-check-circle"></i><p>All patients on track.</p></div>`;
            return;
        }
        dashAIInsights.innerHTML = insights.map(insight => `
            <div class="ai-strip" style="margin-bottom:0.5rem;${insight.severity === 'warning' ? 'border-color:#ef4444;' : ''}">
                <div class="ai-icon"><i class="bx bx-brain"></i></div>
                <div class="ai-text"><strong>${escapeHtml(insight.patientName)}</strong> — ${escapeHtml(insight.message)}</div>
            </div>
        `).join('');
    }

    function renderPendingDocs(patients) {
        const pending = [];
        for (const [patientId, patient] of Object.entries(patients)) {
            if (patient.sessions) {
                for (const [sessionId, session] of Object.entries(patient.sessions)) {
                    if (!session.signed) {
                        pending.push({
                            patientName: patient.name || 'Unknown',
                            patientId,
                            sessionId: session.id || sessionId,
                            sessionType: session.type || 'Session',
                            date: session.date || 'Unknown',
                            hasContent: !!(session.notes || session.content || '').trim()
                        });
                    }
                }
            }
        }
        if (pending.length === 0) {
            dashPendingDocs.innerHTML = `<div class="emr-empty-state"><i class="bx bx-check-circle"></i><p>All notes signed off!</p></div>`;
            return;
        }
        dashPendingDocs.innerHTML = pending.map(doc => `
            <div style="display:flex;align-items:center;gap:0.8rem;padding:0.4rem 0;border-bottom:1px solid var(--border-light);">
                <i class="bx bx-file" style="color:var(--accent);"></i>
                <div style="flex:1;">
                    <div style="font-weight:600;font-size:0.85rem;">${escapeHtml(doc.patientName)} — ${escapeHtml(doc.sessionType)}</div>
                    <div style="font-size:0.75rem;color:var(--text-secondary);">${escapeHtml(doc.date)}${doc.hasContent ? '' : ' · No notes yet'}</div>
                </div>
                <a href="docresult.html?id=${encodeURIComponent(doc.patientId)}&type=session&sessionId=${encodeURIComponent(doc.sessionId)}" target="_blank" class="btn btn-secondary" style="font-size:0.7rem;padding:0.2rem 0.8rem;text-decoration:none;">
                    <i class="bx bx-edit"></i> Complete
                </a>
            </div>
        `).join('');
    }

    // =========================================================================
    // Patients List
    // =========================================================================
    document.getElementById('statPatientsCard')?.addEventListener('click', function() {
        switchScreen('patients');
    });

    async function loadPatientsList() {
        if (!currentUser) return;
        try {
            const snapshot = await database.ref(`history/${scopeUid}/patients`).once('value');
            const patients = snapshot.val() || {};
            allPatients = Object.entries(patients).map(([id, data]) => ({ id, ...data }));
            applyPatientsListView();
        } catch (error) {
            console.error('[EMR] Patients list error:', error);
        }
    }

    // Re-applies search + filter + sort on top of allPatients (default: newest first)
    function applyPatientsListView() {
        const searchTerm = (document.getElementById('patientsSearchInput')?.value || '').trim().toLowerCase();
        const filter = document.getElementById('patientsFilterSelect')?.value || 'all';
        const sortBy = document.getElementById('patientsSortSelect')?.value || 'newest';

        let list = [...allPatients];

        if (filter === 'active') list = list.filter(p => p.status !== 'draft' && p.active !== false);
        else if (filter === 'draft') list = list.filter(p => p.status === 'draft');
        else if (filter === 'discharged') list = list.filter(p => p.status !== 'draft' && p.active === false);

        if (searchTerm) {
            list = list.filter(p =>
                (p.name || '').toLowerCase().includes(searchTerm) ||
                (p.primaryDx || '').toLowerCase().includes(searchTerm)
            );
        }

        list.sort((a, b) => {
            if (sortBy === 'name-az') return (a.name || '').localeCompare(b.name || '');
            if (sortBy === 'name-za') return (b.name || '').localeCompare(a.name || '');
            const ta = a.createdAt || 0, tb = b.createdAt || 0;
            return sortBy === 'oldest' ? ta - tb : tb - ta; // default: newest first
        });

        renderPatientsList(list);
    }

    document.getElementById('patientsSearchInput')?.addEventListener('input', applyPatientsListView);
    document.getElementById('patientsFilterSelect')?.addEventListener('change', applyPatientsListView);
    document.getElementById('patientsSortSelect')?.addEventListener('change', applyPatientsListView);

    function renderPatientsList(patients) {
        const container = document.getElementById('patientsList');
        if (!container) return;
        if (allPatients.length === 0) {
            container.innerHTML = `<div class="emr-empty-state"><i class="bx bx-group"></i><p>No patients yet</p><button class="btn btn-primary" onclick="switchScreen('intake')"><i class="bx bx-user-plus"></i> Add First Patient</button></div>`;
            return;
        }
        if (patients.length === 0) {
            container.innerHTML = `<div class="emr-empty-state"><i class="bx bx-search"></i><p>No patients match your search/filter</p></div>`;
            return;
        }
        container.innerHTML = `
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                    <thead>
                        <tr style="border-bottom:2px solid var(--border-light);">
                            <th style="text-align:left;padding:0.6rem 0.4rem;font-weight:700;color:var(--text-secondary);font-size:0.7rem;text-transform:uppercase;">Name</th>
                            <th style="text-align:left;padding:0.6rem 0.4rem;font-weight:700;color:var(--text-secondary);font-size:0.7rem;text-transform:uppercase;">Diagnosis</th>
                            <th style="text-align:left;padding:0.6rem 0.4rem;font-weight:700;color:var(--text-secondary);font-size:0.7rem;text-transform:uppercase;">State</th>
                            <th style="text-align:right;padding:0.6rem 0.4rem;font-weight:700;color:var(--text-secondary);font-size:0.7rem;text-transform:uppercase;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${patients.map(p => `
                            <tr style="border-bottom:1px solid var(--border-light);">
                                <td style="padding:0.6rem 0.4rem;font-weight:600;">${escapeHtml(p.name) || 'Unknown'} ${p.status === 'draft' ? '<span class="tag tag-amber" style="margin-left:0.4rem;">Draft</span>' : ''}</td>
                                <td style="padding:0.6rem 0.4rem;color:var(--text-secondary);">${escapeHtml(p.primaryDx) || '—'}</td>
                                <td style="padding:0.6rem 0.4rem;color:var(--text-secondary);">${escapeHtml(p.state) || '—'}</td>
                                <td style="padding:0.6rem 0.4rem;text-align:right;">
                                    <button class="btn btn-primary" style="font-size:0.7rem;padding:0.2rem 0.8rem;" onclick="openPatient('${escapeHtml(p.id)}')">
                                        <i class="bx bx-folder-open"></i> Open
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // =========================================================================
    // Open Patient with realtime listener
    // =========================================================================
    window.openPatient = async function(patientId) {
        currentPatientId = patientId;
        if (patientListenerRef) {
            patientListenerRef.off('value');
            patientListenerRef = null;
        }
        try {
            patientListenerRef = database.ref(`history/${scopeUid}/patients/${patientId}`);
            patientListenerRef.on('value', snapshot => {
                currentPatientData = snapshot.val() || {};
                renderPatientData();
            });
            const snapshot = await patientListenerRef.once('value');
            currentPatientData = snapshot.val() || {};
            switchScreen('patient');
            renderPatientData();
        } catch (error) {
            console.error('[EMR] Open patient error:', error);
            showToast('Error loading patient data', 'error');
        }
    };

    function renderPatientData() {
        if (!currentPatientData) return;
        document.getElementById('patientHeroName').textContent = currentPatientData.name || 'Unknown Patient';
        document.getElementById('patientHeroDx').textContent = currentPatientData.primaryDx || 'No diagnosis';
        const initials = currentPatientData.name?.split(' ').map(n => n[0]).join('') || '??';
        document.getElementById('patientAvatar').textContent = initials.toUpperCase();
        document.getElementById('patientHeroAge').textContent = currentPatientData.dob ? calculateAge(currentPatientData.dob) : '—';
        document.getElementById('patientHeroCategory').textContent = currentPatientData.category || '—';
        document.getElementById('patientHeroProfession').textContent = currentPatientData.profession || currentPatientData.department || '—';
        document.getElementById('patientHeroState').textContent = currentPatientData.state || '—';
        document.getElementById('patientHeroSession').textContent = currentPatientData.sessionCount || 0;
        const statusBadge = document.getElementById('patientHeroStatusBadge');
        if (currentPatientData.status === 'draft') {
            statusBadge.textContent = 'Draft';
            statusBadge.className = 'status-badge status-pending';
        } else if (currentPatientData.active !== false) {
            statusBadge.textContent = 'Active';
            statusBadge.className = 'status-badge status-active';
        } else {
            statusBadge.textContent = 'Discharged';
            statusBadge.className = 'status-badge status-pending';
        }
        loadPatientIntake();
        loadLinkedRecords();
        renderProblemList();
        loadPatientSummary();
        loadPatientTreatmentPlans();
        loadPatientSessions();
        loadPatientNextSession();
        loadPatientProgress();
        loadPatientDischarge();
    }

    // =========================================================================
    // Linked Records — surfaces candidate entries from presentation.html
    // (Case Presentation/Report), gait.html (Gait Analysis), and rom.html
    // (ROM Analysis) history. Those pages don't share a patient ID with the
    // EMR, so nothing is auto-linked: every candidate is ranked by how well
    // it matches (patient name AND clinical "story" — diagnosis/notes
    // overlap), and the clinician reviews and explicitly links the ones
    // that are actually the same patient. Linking can be undone any time.
    // =========================================================================
    function namesLikelyMatch(a, b) {
        if (!a || !b) return false;
        const na = a.trim().toLowerCase();
        const nb = b.trim().toLowerCase();
        if (!na || !nb) return false;
        return na === nb || na.includes(nb) || nb.includes(na);
    }

    const KEYWORD_STOPWORDS = new Set(['the', 'and', 'with', 'for', 'from', 'this', 'that', 'have', 'has', 'been', 'were', 'pain', 'patient', 'right', 'left', 'both']);
    function extractKeywords(text) {
        return Array.from(new Set(
            (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
                .filter(w => w.length > 3 && !KEYWORD_STOPWORDS.has(w))
        ));
    }

    // Scores how likely a history entry belongs to the current patient:
    // name match is a strong signal, shared clinical terms ("the story
    // tallies") is a secondary signal. Both are shown to the clinician so
    // they make the final call, rather than the system silently deciding.
    function computeRecordMatch(entry, patient) {
        const reasons = [];
        let score = 0;
        if (namesLikelyMatch(entry.patientName, patient.name)) {
            reasons.push('Name matches');
            score += 100;
        }
        const patientTerms = extractKeywords(`${patient.primaryDx || ''} ${patient.chiefComplaint || ''} ${patient.goals || ''}`);
        const entryTerms = extractKeywords(`${entry.diagnosis || ''} ${entry.notes || ''} ${entry.request || ''} ${entry.view || ''} ${entry.fileName || ''}`);
        const shared = patientTerms.filter(t => entryTerms.includes(t));
        if (shared.length > 0) {
            reasons.push(`Shares details: ${shared.slice(0, 3).join(', ')}`);
            score += shared.length * 10;
        }
        return { score, reasons };
    }

    async function loadLinkedRecords() {
        const container = document.getElementById('linkedRecordsList');
        if (!container || !currentUser || !currentPatientId) return;
        container.innerHTML = `<div class="emr-empty-state"><i class="bx bx-loader-alt bx-spin"></i><p>Searching Case Presentation/Report, Gait Analysis, and ROM Analysis history…</p></div>`;

        try {
            const [caseSnap, gaitSnap, romSnap] = await Promise.all([
                database.ref(`history/${currentUser.uid}/caseHistory`).once('value'),
                database.ref(`history/${currentUser.uid}/gaitHistory`).once('value'),
                database.ref(`history/${currentUser.uid}/analysisHistory`).once('value')
            ]);

            const sourceDefs = [
                { node: caseSnap.val() || {}, source: 'caseHistory', icon: 'bx-file', typeFn: e => e.documentType || 'Case Presentation', contentFn: e => e.resultsMarkdown || e.results || '' },
                { node: gaitSnap.val() || {}, source: 'gaitHistory', icon: 'bx-walk', typeFn: () => 'Gait Analysis', contentFn: e => e.results || '' },
                { node: romSnap.val() || {}, source: 'analysisHistory', icon: 'bx-run', typeFn: () => 'ROM Analysis', contentFn: e => e.results || '' }
            ];

            const patient = currentPatientData;
            let candidates = [];
            sourceDefs.forEach(({ node, source, icon, typeFn, contentFn }) => {
                Object.entries(node).forEach(([key, entry]) => {
                    const match = computeRecordMatch(entry, patient);
                    candidates.push({
                        source, key, icon, type: typeFn(entry), date: entry.date || '',
                        content: contentFn(entry), patientName: entry.patientName || null,
                        score: match.score, reasons: match.reasons
                    });
                });
            });

            candidates.sort((a, b) => (b.score - a.score) || String(b.date).localeCompare(String(a.date)));
            const strong = candidates.filter(c => c.score > 0);
            const weak = candidates.filter(c => c.score === 0).slice(0, 5); // small "review manually" tail, not the whole database
            const shown = [...strong, ...weak];

            if (shown.length === 0) {
                container.innerHTML = `<div class="emr-empty-state"><i class="bx bx-link"></i><p>No records found yet in Case Presentation/Report, Gait Analysis, or ROM Analysis history.</p></div>`;
                return;
            }

            const linked = patient.linkedRecords || [];
            container.innerHTML = shown.map(c => {
                const isLinked = linked.some(r => r.source === c.source && r.key === c.key);
                const reasonText = c.reasons.length > 0 ? c.reasons.join(' · ') : 'No strong match — review manually';
                return `
                <div class="linked-record-item">
                    <div class="linked-record-info">
                        <div><i class="bx ${c.icon}"></i> <strong>${escapeHtml(c.type)}</strong>${c.patientName ? ' — ' + escapeHtml(c.patientName) : ''}</div>
                        <div class="linked-record-meta">${escapeHtml(c.date)} · ${escapeHtml(reasonText)}${isLinked ? ' · <span style="color:#16a34a;">Linked</span>' : ''}</div>
                    </div>
                    <div style="display:flex;gap:0.4rem;flex-shrink:0;">
                        <button class="btn btn-secondary linked-record-view-btn" data-source="${c.source}" data-key="${escapeHtml(c.key)}" style="font-size:0.7rem;padding:0.2rem 0.7rem;"><i class="bx bx-show"></i> View</button>
                        ${isLinked
                            ? `<button class="btn btn-secondary linked-record-unlink-btn" data-source="${c.source}" data-key="${escapeHtml(c.key)}" style="font-size:0.7rem;padding:0.2rem 0.7rem;"><i class="bx bx-unlink"></i> Unlink</button>`
                            : `<button class="btn btn-primary linked-record-link-btn" data-source="${c.source}" data-key="${escapeHtml(c.key)}" style="font-size:0.7rem;padding:0.2rem 0.7rem;"><i class="bx bx-link"></i> Link</button>`
                        }
                    </div>
                </div>`;
            }).join('');

            container.querySelectorAll('.linked-record-view-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const c = shown.find(x => x.source === btn.dataset.source && x.key === btn.dataset.key);
                    if (!c) return;
                    showRecordPreview(c.type, `${c.date}${c.patientName ? ' · ' + c.patientName : ''}`, stripMarkdown(c.content) || 'No content.');
                });
            });
            container.querySelectorAll('.linked-record-link-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const c = shown.find(x => x.source === btn.dataset.source && x.key === btn.dataset.key);
                    if (!c) return;
                    await linkRecord(c);
                });
            });
            container.querySelectorAll('.linked-record-unlink-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    await unlinkRecord(btn.dataset.source, btn.dataset.key);
                });
            });
        } catch (err) {
            console.error('[EMR] Error loading linked records:', err);
            container.innerHTML = `<div class="emr-empty-state"><i class="bx bx-error"></i><p>Could not load linked records: ${escapeHtml(err.message || 'unknown error')}</p></div>`;
        }
    }

    // Read-only preview modal — reuses the custom-input modal's markup so the
    // clinician can review a candidate's full content before deciding to link it.
    function showRecordPreview(title, subtitle, content) {
        return new Promise((resolve) => {
            const modal = document.getElementById('customInputModal');
            document.getElementById('customInputTitle').textContent = title;
            const subtitleEl = document.getElementById('customInputSubtitle');
            subtitleEl.textContent = subtitle;
            subtitleEl.style.display = subtitle ? 'block' : 'none';
            document.getElementById('customInputFields').innerHTML =
                `<textarea class="inline-edit-textarea" rows="14" readonly style="width:100%;">${escapeHtml(content)}</textarea>`;

            const saveBtn = document.getElementById('customInputSave');
            const cancelBtn = document.getElementById('customInputCancel');
            const closeBtn = document.getElementById('customInputClose');
            saveBtn.style.display = 'none';
            cancelBtn.textContent = 'Close';

            function cleanup() {
                modal.classList.remove('show');
                saveBtn.style.display = '';
                cancelBtn.textContent = 'Cancel';
                cancelBtn.removeEventListener('click', onClose);
                closeBtn.removeEventListener('click', onClose);
            }
            function onClose() { cleanup(); resolve(); }
            cancelBtn.addEventListener('click', onClose);
            closeBtn.addEventListener('click', onClose);
            modal.classList.add('show');
        });
    }

    async function linkRecord(match) {
        if (!currentPatientId || !currentUser) return;
        try {
            const plainContent = stripMarkdown(match.content || '');
            const currentAssessment = currentPatientData.assessment || '';
            const newAssessment = currentAssessment
                ? `${currentAssessment}\n\n--- Linked from ${match.type} (${match.date}) ---\n${plainContent}`
                : `--- Linked from ${match.type} (${match.date}) ---\n${plainContent}`;

            const linkedRecords = currentPatientData.linkedRecords || [];
            linkedRecords.push({ source: match.source, key: match.key, type: match.type, date: match.date, linkedAt: new Date().toISOString() });

            await database.ref(`history/${scopeUid}/patients/${currentPatientId}`).update({
                assessment: newAssessment,
                linkedRecords: linkedRecords
            });
            currentPatientData.assessment = newAssessment;
            currentPatientData.linkedRecords = linkedRecords;

            showToast(`Linked "${match.type}" — content added to Assessment`, 'success');
            loadPatientIntake();
            loadLinkedRecords();
        } catch (err) {
            showToast('Error linking record: ' + (err.message || 'unknown error'), 'error', 6000);
        }
    }

    async function unlinkRecord(source, key) {
        if (!currentPatientId || !currentUser) return;
        try {
            const linkedRecords = (currentPatientData.linkedRecords || []).filter(r => !(r.source === source && r.key === key));
            await database.ref(`history/${scopeUid}/patients/${currentPatientId}/linkedRecords`).set(linkedRecords);
            currentPatientData.linkedRecords = linkedRecords;
            showToast('Unlinked. Text already added to Assessment was left as-is — edit it manually if you want it removed too.', 'info', 6000);
            loadLinkedRecords();
        } catch (err) {
            showToast('Error unlinking record: ' + (err.message || 'unknown error'), 'error', 6000);
        }
    }

    document.getElementById('refreshLinkedRecordsBtn')?.addEventListener('click', function() {
        loadLinkedRecords();
    });

    function calculateAge(dob) {
        if (!dob) return '—';
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
        return age;
    }

    // =========================================================================
    // Delete / Archive Patient
    // =========================================================================
    document.getElementById('deletePatientBtn')?.addEventListener('click', function() {
        if (!currentPatientId || !currentUser) return;
        if (!confirm('Are you sure you want to delete this patient? This action cannot be undone.')) return;

        const deletedPatientName = currentPatientData?.name || 'a patient';
        database.ref(`history/${scopeUid}/patients/${currentPatientId}`).remove()
            .then(() => {
                showToast('Patient deleted successfully', 'success');
                if (window.RehablixCenter) {
                    window.RehablixCenter.logActivity('doc', 'Deleted patient', deletedPatientName).catch(() => {});
                }
                switchScreen('patients');
                loadPatientsList();
                loadDashboardData();
            })
            .catch(err => {
                showToast('Error deleting patient: ' + err.message, 'error');
            });
    });

    // =========================================================================
    // Load Patient Intake
    // =========================================================================
    function loadPatientIntake() {
        const container = document.getElementById('paneIntakeContent');
        if (!currentPatientData) return;
        const d = currentPatientData;
        container.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;font-size:0.85rem;">
                <div><strong>Name:</strong> ${escapeHtml(d.name) || '—'}</div>
                <div><strong>DOB:</strong> ${escapeHtml(d.dob) || '—'}</div>
                <div><strong>Gender:</strong> ${escapeHtml(d.gender) || '—'}</div>
                <div><strong>Phone:</strong> ${escapeHtml(d.phone) || '—'}</div>
                <div><strong>Category:</strong> ${escapeHtml(d.category) || '—'}</div>
                <div><strong>Profession:</strong> ${escapeHtml(d.profession || d.department) || '—'}</div>
                <div><strong>State:</strong> ${escapeHtml(d.state) || '—'}</div>
                <div><strong>Primary Dx:</strong> ${escapeHtml(d.primaryDx) || '—'}</div>
                <div><strong>Referring:</strong> ${escapeHtml(d.referring) || '—'}</div>
                <div><strong>Insurance:</strong> ${escapeHtml(d.insurance) || '—'}</div>
                <div style="grid-column:1/-1;"><strong>Chief Complaint:</strong> ${escapeHtml(d.chiefComplaint) || '—'}</div>
                <div style="grid-column:1/-1;"><strong>Functional Goals:</strong> ${escapeHtml(d.goals) || '—'}</div>
                ${d.assessment ? `<div style="grid-column:1/-1;"><strong>Assessment Report:</strong><br><div style="white-space:pre-wrap;font-size:0.85rem;color:var(--text-secondary);margin-top:0.3rem;">${escapeHtml(d.assessment)}</div></div>` : ''}
                ${d.uploadedFiles && d.uploadedFiles.length > 0 ? `<div style="grid-column:1/-1;"><strong>Uploaded Files:</strong><br>${d.uploadedFiles.map(f => `<span class="attachment-chip"><i class="bx bx-file"></i> ${escapeHtml(f.name)}</span>`).join(' ')}</div>` : ''}
            </div>
        `;
    }

    // =========================================================================
    // Identified Problems (AI-generated, expandable list)
    // =========================================================================
    let editingProblemId = null;

    function renderProblemList() {
        const container = document.getElementById('patientProblemList');
        if (!container) return;
        const problems = currentPatientData?.problemList || [];
        if (problems.length === 0) {
            container.innerHTML = `<div class="emr-empty-state"><i class="bx bx-list-check"></i><p>No problems identified yet. Click "AI Generate" to analyze intake data.</p></div>`;
            return;
        }
        container.innerHTML = problems.map(p => {
            if (editingProblemId === p.id) {
                return `
                <div class="problem-item expanded" data-id="${escapeHtml(p.id)}">
                    <div style="padding:0.8rem;">
                        <input class="inline-edit-title" id="editProblemTitle_${escapeHtml(p.id)}" value="${escapeHtml(p.title)}" placeholder="Problem title" />
                        <textarea class="inline-edit-textarea" id="editProblemDetail_${escapeHtml(p.id)}" rows="6" placeholder="Detail">${escapeHtml(p.detail || '')}</textarea>
                        <div class="inline-edit-actions">
                            <button class="btn btn-primary problem-save-btn" data-id="${escapeHtml(p.id)}" style="font-size:0.75rem;padding:0.3rem 0.8rem;"><i class="bx bx-check"></i> Save</button>
                            <button class="btn btn-secondary problem-cancel-btn" style="font-size:0.75rem;padding:0.3rem 0.8rem;"><i class="bx bx-x"></i> Cancel</button>
                        </div>
                    </div>
                </div>`;
            }
            return `
            <div class="problem-item" data-id="${escapeHtml(p.id)}">
                <div class="problem-item-header">
                    <div class="problem-item-title"><i class="bx bx-chevron-right problem-chevron"></i> ${escapeHtml(p.title)}</div>
                    <div style="display:flex;gap:0.3rem;">
                        <button class="card-edit-btn problem-edit" data-id="${escapeHtml(p.id)}" title="Edit"><i class="bx bx-edit"></i></button>
                        <button class="icon-btn-sm problem-delete" data-id="${escapeHtml(p.id)}" title="Remove"><i class="bx bx-trash"></i></button>
                    </div>
                </div>
                <div class="problem-item-detail">${escapeHtml(p.detail) || '<em>No further detail.</em>'}</div>
            </div>`;
        }).join('');

        container.querySelectorAll('.problem-item-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.problem-edit') || e.target.closest('.problem-delete')) return;
                header.closest('.problem-item').classList.toggle('expanded');
            });
        });
        container.querySelectorAll('.problem-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                editingProblemId = btn.dataset.id;
                renderProblemList();
            });
        });
        container.querySelectorAll('.problem-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!currentPatientId || !currentUser) return;
                const id = btn.dataset.id;
                const remaining = (currentPatientData?.problemList || []).filter(p => p.id !== id);
                try {
                    await database.ref(`history/${scopeUid}/patients/${currentPatientId}/problemList`).set(remaining);
                    currentPatientData.problemList = remaining;
                    renderProblemList();
                } catch (err) {
                    showToast('Error removing problem: ' + (err.message || 'unknown error'), 'error', 6000);
                }
            });
        });
        container.querySelectorAll('.problem-save-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const titleEl = document.getElementById(`editProblemTitle_${id}`);
                const detailEl = document.getElementById(`editProblemDetail_${id}`);
                const problems = currentPatientData?.problemList || [];
                const idx = problems.findIndex(p => p.id === id);
                if (idx === -1) return;
                problems[idx] = { ...problems[idx], title: titleEl.value.trim() || problems[idx].title, detail: detailEl.value.trim() };
                try {
                    await database.ref(`history/${scopeUid}/patients/${currentPatientId}/problemList`).set(problems);
                    currentPatientData.problemList = problems;
                    editingProblemId = null;
                    renderProblemList();
                    showToast('Problem updated', 'success');
                } catch (err) {
                    showToast('Error saving problem: ' + (err.message || 'unknown error'), 'error', 6000);
                }
            });
        });
        container.querySelectorAll('.problem-cancel-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                editingProblemId = null;
                renderProblemList();
            });
        });
    }

    document.getElementById('addProblemBtn')?.addEventListener('click', async function() {
        if (!currentPatientId || !currentUser) { showToast('Open a patient first', 'warning'); return; }
        const result = await showCustomModal({
            title: 'Add Problem',
            subtitle: 'Add a clinical problem manually — it will appear in the expandable Identified Problems list.',
            fields: [
                { id: 'title', type: 'text', label: 'Problem Title', placeholder: 'e.g. Decreased right shoulder ROM' },
                { id: 'detail', type: 'textarea', rows: 8, label: 'Detail', placeholder: 'Clinical explanation, measurements, functional impact…' }
            ]
        });
        if (!result || !result.title) return;
        const problems = currentPatientData?.problemList || [];
        problems.push({ id: Date.now().toString(), title: stripMarkdown(result.title), detail: stripMarkdown(result.detail || '') });
        try {
            await database.ref(`history/${scopeUid}/patients/${currentPatientId}/problemList`).set(problems);
            currentPatientData.problemList = problems;
            renderProblemList();
            showToast('Problem added', 'success');
        } catch (err) {
            showToast('Error saving problem: ' + (err.message || 'unknown error'), 'error', 6000);
        }
    });

    document.getElementById('generateProblemsBtn')?.addEventListener('click', async function() {
        if (!currentPatientId) { showToast('Open a patient first', 'warning'); return; }
        await generateProblemListAI();
    });

    async function generateProblemListAI() {
        if (!aiConfig.token) {
            const ok = await fetchTokens();
            if (!ok) { showToast('AI service not available', 'error'); return; }
        }
        showLoading('Analyzing patient data for problems…', 10);
        try {
            const d = currentPatientData;
            const systemPrompt = `You are a rehabilitation clinician building a clinical problem list from intake information. Return ONLY a JSON array (no markdown, no code fences, no commentary) of 3 to 6 objects, each with a "title" (short, under 10 words) and a "detail" (1-2 sentence clinical explanation). Base every problem strictly on the information provided — do not invent details that aren't supported by it.`;
            const userPrompt = `Patient: ${d.name || 'Patient'}\nDiagnosis: ${d.primaryDx || 'Unknown'}\nChief Complaint: ${d.chiefComplaint || ''}\nGoals: ${d.goals || ''}\nAssessment: ${d.assessment || 'None provided'}`;
            updateLoadingProgress(40, 'Identifying problems…');
            const response = await callDeepSeek(systemPrompt, userPrompt, 1000);
            updateLoadingProgress(75, 'Saving…');
            const parsed = parseAIJsonArray(response);
            const problems = parsed.map((p, i) => ({
                id: Date.now().toString() + '_' + i,
                title: stripMarkdown(p.title || 'Problem'),
                detail: stripMarkdown(p.detail || '')
            }));
            await database.ref(`history/${scopeUid}/patients/${currentPatientId}/problemList`).set(problems);
            currentPatientData.problemList = problems;
            updateLoadingProgress(100, 'Done!');
            setTimeout(() => {
                hideLoading();
                showToast('Problem list generated!', 'success');
                renderProblemList();
            }, 400);
        } catch (error) {
            console.error(error);
            hideLoading();
            showToast('Error generating problem list: ' + (error.message || 'unknown error'), 'error', 6000);
        }
    }

    // =========================================================================
    // Summary Tab
    // =========================================================================
    function loadPatientSummary() {
        const container = document.getElementById('paneSummaryContent');
        const summaries = currentPatientData?.summaries || [];
        if (summaries.length === 0) {
            container.innerHTML = `<div class="emr-empty-state"><i class="bx bx-file"></i><p>No summary reports yet.</p></div>`;
            return;
        }
        const indexed = summaries.map((s, i) => ({ ...s, _index: i }));
        const sorted = indexed.sort((a, b) => new Date(b.date) - new Date(a.date));
        container.innerHTML = sorted.map(summary => `
            <a href="docresult.html?id=${currentPatientId}&type=summary&index=${summary._index}" target="_blank" style="text-decoration:none;color:inherit;display:block;">
                <div class="summary-card">
                    <div class="summary-card-header">
                        <div>
                            <div class="summary-card-title">${escapeHtml(summary.title) || 'Summary Report'}</div>
                            <div class="summary-card-meta">${escapeHtml(summary.date) || ''}</div>
                        </div>
                        <div><i class="bx bx-link-external"></i></div>
                    </div>
                </div>
            </a>
        `).join('');
    }

    document.getElementById('addSummaryBtn')?.addEventListener('click', function() {
        if (!currentPatientId) { showToast('Open a patient first', 'warning'); return; }
        window.open(`docresult.html?id=${currentPatientId}&type=summary&action=new`, '_blank');
    });

    document.getElementById('generateSummaryBtn')?.addEventListener('click', async function() {
        if (!currentPatientId) { showToast('Open a patient first', 'warning'); return; }
        await generateSummaryReport();
    });

    async function generateSummaryReport() {
        if (!aiConfig.token) {
            const ok = await fetchTokens();
            if (!ok) { showToast('AI service not available', 'error'); return; }
        }
        showLoading('Generating summary report…', 10);
        try {
            const d = currentPatientData;
            const patientInfo = {
                name: d.name || 'Patient',
                diagnosis: d.primaryDx || 'Unknown',
                chiefComplaint: d.chiefComplaint || '',
                goals: d.goals || '',
                category: d.category || '',
                profession: d.profession || d.department || '',
                state: d.state || '',
                assessment: d.assessment || '',
                sessions: d.sessions ? Object.values(d.sessions).length : 0,
                treatmentPlans: d.treatmentPlans || []
            };

            updateLoadingProgress(30, 'Analyzing patient data…');

            const systemPrompt = `You are a medical writer. Generate a concise, professional summary report for a ${patientInfo.category} patient (${patientInfo.profession}, ${patientInfo.state}). Include: patient overview, diagnosis, key findings, progress, and recommendations. Use plain text. Do not use markdown formatting.`;

            let userPrompt = `Patient: ${patientInfo.name}\nDiagnosis: ${patientInfo.diagnosis}\nChief Complaint: ${patientInfo.chiefComplaint}\nGoals: ${patientInfo.goals}\nAssessment: ${patientInfo.assessment || 'None provided'}\nSessions completed: ${patientInfo.sessions}\n`;
            if (patientInfo.treatmentPlans.length > 0) {
                userPrompt += `Treatment plans:\n${patientInfo.treatmentPlans.map(p => `- ${p.title}: ${p.content}`).join('\n')}\n`;
            }

            updateLoadingProgress(50, 'Generating summary…');
            const response = await callDeepSeek(systemPrompt, userPrompt, 1500);

            updateLoadingProgress(80, 'Saving summary…');

            const summaries = currentPatientData?.summaries || [];
            summaries.push({
                title: `Summary - ${new Date().toLocaleDateString()}`,
                content: stripMarkdown(response),
                date: new Date().toLocaleDateString()
            });
            await database.ref(`history/${scopeUid}/patients/${currentPatientId}/summaries`).set(summaries);
            currentPatientData.summaries = summaries;

            updateLoadingProgress(100, 'Done!');
            setTimeout(() => {
                hideLoading();
                showToast('Summary generated!', 'success');
                loadPatientSummary();
            }, 500);
        } catch (error) {
            console.error(error);
            hideLoading();
            showToast('Error generating summary: ' + (error.message || 'unknown error'), 'error', 6000);
        }
    }

    // =========================================================================
    // Treatment Plans (expandable cards — no need to leave the page to view/edit)
    // =========================================================================
    function getLatestProgressNoteText() {
        const notes = currentPatientData?.progressNotes || [];
        if (notes.length === 0) return '';
        const latest = [...notes].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        return latest.content || '';
    }

    let editingTreatmentPlanIndex = null;

    function loadPatientTreatmentPlans() {
        const container = document.getElementById('paneTreatmentPlanContent');
        const plans = currentPatientData?.treatmentPlans || [];
        if (plans.length === 0) {
            container.innerHTML = `<div class="emr-empty-state"><i class="bx bx-clipboard"></i><p>No treatment plans yet.</p></div>`;
            return;
        }
        const indexed = plans.map((p, i) => ({ ...p, _index: i }));
        const sorted = indexed.sort((a, b) => new Date(b.date) - new Date(a.date));
        container.innerHTML = sorted.map(plan => {
            const isEditing = editingTreatmentPlanIndex === plan._index;
            if (isEditing) {
                return `
                <div class="session-card-x expanded" data-index="${plan._index}">
                    <div style="padding:0.2rem 0 0.6rem;">
                        <input class="inline-edit-title" id="editPlanTitle_${plan._index}" value="${escapeHtml(plan.title) || ''}" placeholder="Plan title" />
                        <textarea class="inline-edit-textarea" id="editPlanContent_${plan._index}" rows="10" placeholder="Plan content">${escapeHtml(plan.content || '')}</textarea>
                        <div class="inline-edit-actions">
                            <button class="btn btn-primary plan-save-btn" data-index="${plan._index}" style="font-size:0.75rem;padding:0.3rem 0.8rem;"><i class="bx bx-check"></i> Save</button>
                            <button class="btn btn-secondary plan-cancel-btn" style="font-size:0.75rem;padding:0.3rem 0.8rem;"><i class="bx bx-x"></i> Cancel</button>
                        </div>
                    </div>
                </div>`;
            }
            return `
            <div class="session-card-x" data-index="${plan._index}">
                <div class="session-card-x-header">
                    <div>
                        <div class="session-date">${escapeHtml(plan.date) || ''}</div>
                        <div class="session-title">${escapeHtml(plan.title) || 'Treatment Plan'}</div>
                        <div class="session-therapist">${escapeHtml(plan.category) || ''}${plan.profession || plan.department ? ' · ' + escapeHtml(plan.profession || plan.department) : ''}</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.4rem;">
                        <button class="card-edit-btn plan-edit-btn" data-index="${plan._index}" title="Edit"><i class="bx bx-edit"></i></button>
                        <i class="bx bx-chevron-down session-chevron"></i>
                    </div>
                </div>
                <div class="session-card-x-body">
                    <div class="session-card-x-content">${escapeHtml(stripMarkdown(plan.content || '')) || '<em>No content.</em>'}</div>
                    <button class="btn btn-secondary treatment-regenerate-btn" data-index="${plan._index}" style="font-size:0.7rem;padding:0.2rem 0.8rem;margin-top:0.6rem;"><i class="bx bx-magic"></i> Regenerate with AI</button>
                </div>
            </div>`;
        }).join('');

        container.querySelectorAll('.session-card-x-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.plan-edit-btn')) return;
                header.closest('.session-card-x').classList.toggle('expanded');
            });
        });
        container.querySelectorAll('.plan-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                editingTreatmentPlanIndex = parseInt(btn.dataset.index, 10);
                loadPatientTreatmentPlans();
            });
        });
        container.querySelectorAll('.plan-save-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index, 10);
                const titleEl = document.getElementById(`editPlanTitle_${index}`);
                const contentEl = document.getElementById(`editPlanContent_${index}`);
                const plans = currentPatientData?.treatmentPlans || [];
                if (!plans[index]) return;
                plans[index] = { ...plans[index], title: titleEl.value.trim() || plans[index].title, content: contentEl.value.trim(), lastEdited: new Date().toLocaleString() };
                try {
                    await database.ref(`history/${scopeUid}/patients/${currentPatientId}/treatmentPlans`).set(plans);
                    currentPatientData.treatmentPlans = plans;
                    editingTreatmentPlanIndex = null;
                    loadPatientTreatmentPlans();
                    showToast('Treatment plan updated', 'success');
                } catch (err) {
                    showToast('Error saving treatment plan: ' + (err.message || 'unknown error'), 'error', 6000);
                }
            });
        });
        container.querySelectorAll('.plan-cancel-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                editingTreatmentPlanIndex = null;
                loadPatientTreatmentPlans();
            });
        });
        container.querySelectorAll('.treatment-regenerate-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await regenerateTreatmentPlan(parseInt(btn.dataset.index, 10));
            });
        });
    }

    document.getElementById('addTreatmentPlanBtn')?.addEventListener('click', async function() {
        if (!currentPatientId) { showToast('Open a patient first', 'warning'); return; }
        const result = await showCustomModal({
            title: 'Add Treatment Plan',
            subtitle: 'Write the plan manually — it is saved straight to this patient, no separate editor needed.',
            fields: [
                { id: 'title', type: 'text', label: 'Plan Title', value: `Treatment Plan - ${new Date().toLocaleDateString()}` },
                { id: 'content', type: 'textarea', rows: 10, label: 'Plan Content', placeholder: 'Interventions, frequency, duration, goals…' }
            ]
        });
        if (!result || !result.content) return;
        const plans = currentPatientData?.treatmentPlans || [];
        plans.push({
            title: result.title || 'Treatment Plan',
            content: stripMarkdown(result.content),
            date: new Date().toLocaleDateString(),
            category: currentPatientData?.category || '',
            profession: currentPatientData?.profession || currentPatientData?.department || '',
            state: currentPatientData?.state || ''
        });
        try {
            await database.ref(`history/${scopeUid}/patients/${currentPatientId}/treatmentPlans`).set(plans);
            currentPatientData.treatmentPlans = plans;
            showToast('Treatment plan added', 'success');
            loadPatientTreatmentPlans();
        } catch (err) {
            showToast('Error saving treatment plan: ' + (err.message || 'unknown error'), 'error', 6000);
        }
    });

    document.getElementById('generateTreatmentPlanBtn')?.addEventListener('click', async function() {
        if (!currentPatientId) { showToast('Open a patient first', 'warning'); return; }
        const result = await showCustomModal({
            title: 'Generate Treatment Plan with AI',
            subtitle: 'Optionally add instructions below. The most recent progress note (if any) is automatically factored in for clinical accuracy.',
            fields: [{ id: 'instructions', type: 'textarea', rows: 8, label: 'Additional instructions (optional)', placeholder: 'e.g. Focus on home exercise program, twice-weekly sessions, prioritize balance training…' }]
        });
        if (result === null) return;
        await generateTreatmentPlanAI(result.instructions || '');
    });

    async function generateTreatmentPlanAI(instructions) {
        if (!aiConfig.token) {
            const ok = await fetchTokens();
            if (!ok) { showToast('AI service not available', 'error'); return; }
        }
        showLoading('Generating treatment plan…', 10);
        try {
            const d = currentPatientData;
            const latestProgress = getLatestProgressNoteText();
            const systemPrompt = `You are a rehabilitation specialist creating a treatment plan for a ${d.category || 'general'} patient (${d.profession || d.department || 'clinician'}, ${d.state || 'outpatient'}). Provide a clear, structured plan with actionable steps. Use plain text, no markdown. If a recent progress note is given, adjust the plan to reflect the patient's actual observed progress so it reads as a natural continuation of care rather than a generic plan.`;
            let userPrompt = `Patient: ${d.name || 'Patient'}\nDiagnosis: ${d.primaryDx || 'Unknown'}\nChief Complaint: ${d.chiefComplaint || ''}\nGoals: ${d.goals || ''}`;
            if (latestProgress) userPrompt += `\n\nMost recent progress note:\n${latestProgress}`;
            if (instructions) userPrompt += `\n\nAdditional instructions from the clinician:\n${instructions}`;
            updateLoadingProgress(40, 'Generating plan…');
            const response = await callDeepSeek(systemPrompt, userPrompt, 1500);
            updateLoadingProgress(80, 'Saving plan…');
            const plans = currentPatientData?.treatmentPlans || [];
            plans.push({
                title: `AI Plan - ${new Date().toLocaleDateString()}`,
                content: stripMarkdown(response),
                date: new Date().toLocaleDateString(),
                category: d?.category || '',
                profession: d?.profession || d?.department || '',
                state: d?.state || ''
            });
            await database.ref(`history/${scopeUid}/patients/${currentPatientId}/treatmentPlans`).set(plans);
            currentPatientData.treatmentPlans = plans;
            updateLoadingProgress(100, 'Done!');
            setTimeout(() => { hideLoading(); showToast('Treatment plan generated!', 'success'); loadPatientTreatmentPlans(); }, 500);
        } catch (error) {
            console.error(error);
            hideLoading();
            showToast('Error generating treatment plan: ' + (error.message || 'unknown error'), 'error', 6000);
        }
    }

    async function regenerateTreatmentPlan(index) {
        const plans = currentPatientData?.treatmentPlans || [];
        const plan = plans[index];
        if (!plan) return;
        const result = await showCustomModal({
            title: 'Regenerate Treatment Plan',
            subtitle: 'Tell the AI what to change. The current plan and most recent progress note are used as context automatically.',
            fields: [{ id: 'instructions', type: 'textarea', rows: 8, label: 'Regeneration instructions', placeholder: 'e.g. Increase frequency to 3x/week, add balance training, patient reports less pain now…' }]
        });
        if (!result || !result.instructions) { showToast('Regeneration cancelled — no instructions given', 'info'); return; }

        if (!aiConfig.token) {
            const ok = await fetchTokens();
            if (!ok) { showToast('AI service not available', 'error'); return; }
        }
        showLoading('Regenerating treatment plan…', 10);
        try {
            const d = currentPatientData;
            const latestProgress = getLatestProgressNoteText();
            const systemPrompt = `You are a rehabilitation specialist revising a treatment plan. Use plain text, no markdown. If a recent progress note is provided, factor it in so the revised plan stays clinically accurate and reads as a natural continuation of care.`;
            let userPrompt = `Patient: ${d.name || 'Patient'}\nDiagnosis: ${d.primaryDx || 'Unknown'}\n\nCurrent plan:\n${plan.content}\n`;
            if (latestProgress) userPrompt += `\nMost recent progress note:\n${latestProgress}\n`;
            userPrompt += `\nRegeneration instructions:\n${result.instructions}\n\nPlease revise the plan according to the instructions above.`;
            updateLoadingProgress(40, 'Revising…');
            const response = await callDeepSeek(systemPrompt, userPrompt, 1500);
            updateLoadingProgress(80, 'Saving…');
            plans[index] = { ...plan, content: stripMarkdown(response), lastEdited: new Date().toLocaleString() };
            await database.ref(`history/${scopeUid}/patients/${currentPatientId}/treatmentPlans`).set(plans);
            currentPatientData.treatmentPlans = plans;
            updateLoadingProgress(100, 'Done!');
            setTimeout(() => { hideLoading(); showToast('Treatment plan updated!', 'success'); loadPatientTreatmentPlans(); }, 400);
        } catch (error) {
            console.error(error);
            hideLoading();
            showToast('Error regenerating treatment plan: ' + (error.message || 'unknown error'), 'error', 6000);
        }
    }

    // =========================================================================
    // Sessions Tab (view-only — entries are created by completing a Next Session Plan)
    // =========================================================================
    function loadPatientSessions() {
        const container = document.getElementById('paneSessionsList');
        const countContainer = document.getElementById('paneSessionsCount');
        // Use Object.entries so the Firebase push-key is always available as a fallback id,
        // even for older sessions that predate the explicit `id` field.
        const sessions = currentPatientData?.sessions
            ? Object.entries(currentPatientData.sessions).map(([key, val]) => ({ ...val, id: val.id || key }))
            : [];
        countContainer.textContent = `${sessions.length} sessions`;
        if (sessions.length === 0) {
            container.innerHTML = `<div class="emr-empty-state"><i class="bx bx-calendar-check"></i><p>No sessions recorded yet</p></div>`;
            return;
        }
        const today = new Date().toISOString().split('T')[0];
        const sorted = sessions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        container.innerHTML = sorted.map(session => {
            const bodyText = stripMarkdown(session.notes || session.content || session.plainText || '');
            return `
            <div class="session-card-x ${session.date === today ? 'today' : ''}" data-id="${escapeHtml(session.id)}">
                <div class="session-card-x-header">
                    <div>
                        <div class="session-date">${escapeHtml(session.date) || 'Unknown date'} — ${escapeHtml(session.time) || '--:--'}</div>
                        <div class="session-title">${escapeHtml(session.type) || 'Session'}</div>
                        <div class="session-therapist">${escapeHtml(session.therapist || currentUser?.displayName) || 'Clinician'}</div>
                        <div class="session-tags">
                            ${session.aiGenerated ? '<span class="tag tag-blue">AI Generated</span>' : ''}
                            ${session.codes ? session.codes.map(code => `<span class="tag tag-blue">${escapeHtml(code)}</span>`).join('') : ''}
                            ${session.signed ? '<span class="tag tag-green">Signed</span>' : '<span class="tag tag-amber">Draft</span>'}
                        </div>
                    </div>
                    <i class="bx bx-chevron-down session-chevron"></i>
                </div>
                <div class="session-card-x-body">
                    <div class="session-card-x-content">${bodyText ? escapeHtml(bodyText) : '<em>No notes recorded yet.</em>'}</div>
                    <a href="docresult.html?id=${currentPatientId}&type=session&sessionId=${encodeURIComponent(session.id)}" target="_blank" class="btn btn-secondary" style="font-size:0.7rem;padding:0.2rem 0.8rem;margin-top:0.6rem;display:inline-block;text-decoration:none;"><i class="bx bx-edit"></i> Open Full Editor</a>
                </div>
            </div>`;
        }).join('');

        container.querySelectorAll('.session-card-x-header').forEach(header => {
            header.addEventListener('click', () => {
                header.closest('.session-card-x').classList.toggle('expanded');
            });
        });
    }

    // =========================================================================
    // Checklist Modal (problem list + treatment plan) — used by the
    // Next Session tab's "AI Generate"/"Regenerate" buttons.
    // =========================================================================
    function openSessionGenModal() {
        const problems = currentPatientData?.problemList || [];
        const problemsContainer = document.getElementById('sessionGenProblems');
        if (problems.length === 0) {
            problemsContainer.innerHTML = `<div class="emr-empty-state" style="padding:0.5rem;"><p style="font-size:0.8rem;">No problems on file yet. Generate a problem list from the Intake tab first, or continue without one.</p></div>`;
        } else {
            problemsContainer.innerHTML = problems.map(p => `
                <label class="checklist-item">
                    <input type="checkbox" class="sessionGenProblemCheck" value="${escapeHtml(p.id)}" checked />
                    <span><strong>${escapeHtml(p.title)}</strong>${p.detail ? ' — ' + escapeHtml(p.detail) : ''}</span>
                </label>
            `).join('');
        }

        const plans = currentPatientData?.treatmentPlans || [];
        const tpContainer = document.getElementById('sessionGenTreatmentPlan');
        if (plans.length === 0) {
            tpContainer.innerHTML = `<div class="emr-empty-state" style="padding:0.5rem;"><p style="font-size:0.8rem;">No treatment plan on file yet.</p></div>`;
        } else {
            const latest = [...plans].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            tpContainer.innerHTML = `
                <label class="checklist-item">
                    <input type="checkbox" id="sessionGenTreatmentPlanCheck" checked />
                    <span><strong>${escapeHtml(latest.title) || 'Treatment Plan'}</strong> <span style="color:var(--text-secondary);">(${escapeHtml(latest.date) || ''})</span></span>
                </label>
            `;
        }

        document.getElementById('sessionGenType').value = '';
        document.getElementById('sessionGenNotes').value = '';
        document.getElementById('sessionGenModal')?.classList.add('show');
    }

    function closeSessionGenModal() {
        document.getElementById('sessionGenModal')?.classList.remove('show');
    }

    document.getElementById('sessionGenClose')?.addEventListener('click', closeSessionGenModal);
    document.getElementById('sessionGenCancel')?.addEventListener('click', closeSessionGenModal);

    document.getElementById('sessionGenSubmit')?.addEventListener('click', async function() {
        await generateNextSessionFromChecklist();
    });

    // Builds a Next Session Plan (a list of structured activities) from the checked
    // problems + latest treatment plan, also factoring in the most recent progress note.
    async function generateNextSessionFromChecklist() {
        if (!currentPatientId || !currentUser) return;
        if (!aiConfig.token) {
            const ok = await fetchTokens();
            if (!ok) { showToast('AI service not available', 'error'); return; }
        }

        const selectedIds = Array.from(document.querySelectorAll('.sessionGenProblemCheck:checked')).map(cb => cb.value);
        const problems = (currentPatientData?.problemList || []).filter(p => selectedIds.includes(p.id));

        const includeTP = document.getElementById('sessionGenTreatmentPlanCheck')?.checked;
        const plans = currentPatientData?.treatmentPlans || [];
        const latestPlan = includeTP ? [...plans].sort((a, b) => new Date(b.date) - new Date(a.date))[0] : null;

        const sessionType = document.getElementById('sessionGenType').value.trim() || 'Follow-up Therapy Session';
        const extraNotes = document.getElementById('sessionGenNotes').value.trim();
        const latestProgress = getLatestProgressNoteText();

        closeSessionGenModal();
        showLoading('Generating next session plan…', 10);
        try {
            const d = currentPatientData;
            const systemPrompt = `You are a rehabilitation clinician planning the next session. Base the plan strictly on the problems and treatment plan given below, and the most recent progress note if provided — do not invent clinical details that aren't supported by them. Return ONLY a JSON array (no markdown, no code fences, no commentary) of 3 to 6 activities, each an object with: "timeFrame" (short, e.g. "0-10 min"), "title" (short activity name), "goal" (short, one sentence), and "details" (2-3 sentences describing exercises/interventions, cues, sets/reps as relevant).`;
            let userPrompt = `Patient: ${d.name || 'Patient'}\nDiagnosis: ${d.primaryDx || 'Unknown'}\nSession Type: ${sessionType}\n`;
            if (problems.length > 0) {
                userPrompt += `\nProblems to address:\n${problems.map(p => `- ${p.title}${p.detail ? ': ' + p.detail : ''}`).join('\n')}\n`;
            } else {
                userPrompt += `\nNo specific problem list was selected — base the plan on the patient's diagnosis and chief complaint (${d.chiefComplaint || 'not provided'}).\n`;
            }
            if (latestPlan) userPrompt += `\nLatest treatment plan to follow:\n${latestPlan.content}\n`;
            if (latestProgress) userPrompt += `\nMost recent progress note (for continuity):\n${latestProgress}\n`;
            if (extraNotes) userPrompt += `\nAdditional notes from the clinician:\n${extraNotes}\n`;

            updateLoadingProgress(40, 'Drafting activities…');
            const response = await callDeepSeek(systemPrompt, userPrompt, 1800);
            const parsed = parseAIJsonArray(response);

            updateLoadingProgress(80, 'Saving plan…');
            const activities = parsed.map((a, i) => ({
                id: Date.now().toString() + '_' + i,
                timeFrame: stripMarkdown(a.timeFrame || ''),
                title: stripMarkdown(a.title || `Activity ${i + 1}`),
                goal: stripMarkdown(a.goal || ''),
                details: stripMarkdown(a.detail || a.details || '')
            }));
            const nextPlan = {
                date: new Date().toLocaleDateString(),
                type: sessionType,
                activities: activities,
                problemIds: problems.map(p => p.id),
                treatmentPlanTitle: latestPlan ? (latestPlan.title || null) : null,
                completed: false
            };
            await database.ref(`history/${scopeUid}/patients/${currentPatientId}/nextSessionPlan`).set(nextPlan);
            currentPatientData.nextSessionPlan = nextPlan;

            updateLoadingProgress(100, 'Done!');
            setTimeout(() => {
                hideLoading();
                showToast('Next session plan generated!', 'success');
                loadPatientNextSession();
            }, 400);
        } catch (error) {
            console.error(error);
            hideLoading();
            showToast('Error generating next session plan: ' + (error.message || 'unknown error'), 'error', 6000);
        }
    }

    // =========================================================================
    // Next Session Tab (activity cards — expandable + inline-editable)
    // =========================================================================
    let editingActivityIndex = null;

    function loadPatientNextSession() {
        const container = document.getElementById('paneNextSessionContent');
        const nextPlan = currentPatientData?.nextSessionPlan || null;
        const activities = nextPlan?.activities || [];

        if (!nextPlan || activities.length === 0) {
            container.innerHTML = `<div class="emr-empty-state"><i class="bx bx-calendar"></i><p>No next session planned yet. Click "AI Generate" above, or "Add Activity" to build one manually.</p></div>`;
            return;
        }

        container.innerHTML = `
            <div style="margin-bottom:0.8rem;font-size:0.8rem;color:var(--text-secondary);">Created: ${escapeHtml(nextPlan.date) || ''}${nextPlan.type ? ' · ' + escapeHtml(nextPlan.type) : ''}</div>
            <div id="nextSessionActivitiesList"></div>
            <div style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
                <button class="btn btn-secondary" id="regenerateNextSessionBtn"><i class="bx bx-magic"></i> Regenerate All</button>
                <button class="btn btn-primary" id="completeNextSessionBtn"><i class="bx bx-check-circle"></i> Mark Session as Completed</button>
            </div>
        `;

        renderNextSessionActivities();

        document.getElementById('regenerateNextSessionBtn')?.addEventListener('click', function() {
            openSessionGenModal();
        });

        document.getElementById('completeNextSessionBtn')?.addEventListener('click', async function() {
            const result = await showCustomModal({
                title: 'Complete Next Session',
                subtitle: 'Describe how the session actually went. This becomes the Previous Session record.',
                fields: [{
                    id: 'summary',
                    type: 'textarea',
                    rows: 10,
                    label: 'Session Summary',
                    placeholder: 'What was completed, how the patient responded, any changes from the plan, pain/function observed, etc.'
                }]
            });
            if (!result || !result.summary) return;

            const plan = currentPatientData.nextSessionPlan;
            const planText = (plan.activities || []).map((a, i) =>
                `${i + 1}. [${a.timeFrame || 'N/A'}] ${a.title}\nGoal: ${a.goal || 'N/A'}\n${a.details || ''}`
            ).join('\n\n');
            const combinedText = `Plan:\n${planText}\n\nSession Summary:\n${result.summary}`;

            const newRef = database.ref(`history/${scopeUid}/patients/${currentPatientId}/sessions`).push();
            const sessionData = {
                id: newRef.key,
                date: new Date().toISOString().split('T')[0],
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                type: plan.type || 'Follow-up Therapy Session',
                therapist: currentUser.displayName || currentUser.email || 'Clinician',
                signed: false,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                notes: combinedText,
                content: combinedText,
                plainText: combinedText,
                problemIds: plan.problemIds || [],
                treatmentPlanTitle: plan.treatmentPlanTitle || null,
                aiGenerated: !!plan.problemIds
            };
            await newRef.set(sessionData);

            const sessionCount = (currentPatientData.sessionCount || 0) + 1;
            await database.ref(`history/${scopeUid}/patients/${currentPatientId}/sessionCount`).set(sessionCount);

            await database.ref(`history/${scopeUid}/patients/${currentPatientId}/nextSessionPlan`).remove();
            currentPatientData.nextSessionPlan = null;

            showToast('Session completed and moved to Previous Sessions!', 'success');
            loadPatientNextSession();
            loadPatientSessions();
            loadDashboardData();
        });
    }

    function renderNextSessionActivities() {
        const container = document.getElementById('nextSessionActivitiesList');
        if (!container) return;
        const activities = currentPatientData?.nextSessionPlan?.activities || [];
        if (activities.length === 0) {
            container.innerHTML = `<div class="emr-empty-state"><i class="bx bx-list-ul"></i><p>No activities yet.</p></div>`;
            return;
        }
        container.innerHTML = activities.map((a, i) => {
            if (editingActivityIndex === i) {
                return `
                <div class="activity-card expanded" data-index="${i}">
                    <input class="inline-edit-title" id="editActivityTimeFrame_${i}" value="${escapeHtml(a.timeFrame || '')}" placeholder="Time frame (e.g. 0-10 min)" style="margin-bottom:0.4rem;" />
                    <input class="inline-edit-title" id="editActivityTitle_${i}" value="${escapeHtml(a.title || '')}" placeholder="Activity title" style="margin-bottom:0.4rem;" />
                    <input class="inline-edit-title" id="editActivityGoal_${i}" value="${escapeHtml(a.goal || '')}" placeholder="Goal" style="margin-bottom:0.4rem;" />
                    <textarea class="inline-edit-textarea" id="editActivityDetails_${i}" rows="5" placeholder="Details / description">${escapeHtml(a.details || '')}</textarea>
                    <div class="inline-edit-actions">
                        <button class="btn btn-primary activity-save-btn" data-index="${i}" style="font-size:0.75rem;padding:0.3rem 0.8rem;"><i class="bx bx-check"></i> Save</button>
                        <button class="btn btn-secondary activity-cancel-btn" style="font-size:0.75rem;padding:0.3rem 0.8rem;"><i class="bx bx-x"></i> Cancel</button>
                    </div>
                </div>`;
            }
            return `
            <div class="activity-card" data-index="${i}">
                <div class="activity-card-header">
                    <div>
                        ${a.timeFrame ? `<div class="activity-time-badge">${escapeHtml(a.timeFrame)}</div>` : ''}
                        <div class="activity-title">${escapeHtml(a.title) || 'Activity'}</div>
                        ${a.goal ? `<div class="activity-goal">Goal: ${escapeHtml(a.goal)}</div>` : ''}
                    </div>
                    <div style="display:flex;align-items:center;gap:0.4rem;">
                        <button class="card-edit-btn activity-edit-btn" data-index="${i}" title="Edit"><i class="bx bx-edit"></i></button>
                        <button class="icon-btn-sm activity-delete-btn" data-index="${i}" title="Remove"><i class="bx bx-trash"></i></button>
                        <i class="bx bx-chevron-down activity-chevron"></i>
                    </div>
                </div>
                <div class="activity-card-body">
                    <div class="session-card-x-content">${escapeHtml(a.details) || '<em>No further detail.</em>'}</div>
                </div>
            </div>`;
        }).join('');

        container.querySelectorAll('.activity-card-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.activity-edit-btn') || e.target.closest('.activity-delete-btn')) return;
                header.closest('.activity-card').classList.toggle('expanded');
            });
        });
        container.querySelectorAll('.activity-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                editingActivityIndex = parseInt(btn.dataset.index, 10);
                renderNextSessionActivities();
            });
        });
        container.querySelectorAll('.activity-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index, 10);
                const nextPlan = currentPatientData.nextSessionPlan;
                nextPlan.activities.splice(index, 1);
                try {
                    await database.ref(`history/${scopeUid}/patients/${currentPatientId}/nextSessionPlan`).set(nextPlan);
                    currentPatientData.nextSessionPlan = nextPlan;
                    loadPatientNextSession();
                } catch (err) {
                    showToast('Error removing activity: ' + (err.message || 'unknown error'), 'error', 6000);
                }
            });
        });
        container.querySelectorAll('.activity-save-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index, 10);
                const nextPlan = currentPatientData.nextSessionPlan;
                const activity = nextPlan.activities[index];
                if (!activity) return;
                nextPlan.activities[index] = {
                    ...activity,
                    timeFrame: document.getElementById(`editActivityTimeFrame_${index}`).value.trim(),
                    title: document.getElementById(`editActivityTitle_${index}`).value.trim() || activity.title,
                    goal: document.getElementById(`editActivityGoal_${index}`).value.trim(),
                    details: document.getElementById(`editActivityDetails_${index}`).value.trim()
                };
                try {
                    await database.ref(`history/${scopeUid}/patients/${currentPatientId}/nextSessionPlan`).set(nextPlan);
                    currentPatientData.nextSessionPlan = nextPlan;
                    editingActivityIndex = null;
                    loadPatientNextSession();
                    showToast('Activity updated', 'success');
                } catch (err) {
                    showToast('Error saving activity: ' + (err.message || 'unknown error'), 'error', 6000);
                }
            });
        });
        container.querySelectorAll('.activity-cancel-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                editingActivityIndex = null;
                renderNextSessionActivities();
            });
        });
    }

    document.getElementById('addNextSessionActivityBtn')?.addEventListener('click', async function() {
        if (!currentPatientId) { showToast('Open a patient first', 'warning'); return; }
        const result = await showCustomModal({
            title: 'Add Activity',
            subtitle: 'Add one activity/treatment item to the next session plan.',
            fields: [
                { id: 'timeFrame', type: 'text', label: 'Time Frame', placeholder: 'e.g. 0-10 min' },
                { id: 'title', type: 'text', label: 'Title', placeholder: 'e.g. Warm-up: Stationary Bike' },
                { id: 'goal', type: 'text', label: 'Goal', placeholder: 'e.g. Improve cardiovascular endurance' },
                { id: 'details', type: 'textarea', rows: 6, label: 'Details / Description', placeholder: 'Describe the activity, sets/reps, intensity, cues, etc.' }
            ]
        });
        if (!result || !result.title) return;

        let nextPlan = currentPatientData?.nextSessionPlan;
        if (!nextPlan) {
            nextPlan = { date: new Date().toLocaleDateString(), type: 'Follow-up Therapy Session', activities: [], completed: false };
        }
        if (!nextPlan.activities) nextPlan.activities = [];
        nextPlan.activities.push({
            id: Date.now().toString(),
            timeFrame: result.timeFrame || '',
            title: result.title,
            goal: result.goal || '',
            details: result.details || ''
        });

        try {
            await database.ref(`history/${scopeUid}/patients/${currentPatientId}/nextSessionPlan`).set(nextPlan);
            currentPatientData.nextSessionPlan = nextPlan;
            loadPatientNextSession();
            showToast('Activity added', 'success');
        } catch (err) {
            showToast('Error saving activity: ' + (err.message || 'unknown error'), 'error', 6000);
        }
    });

    // Header "AI Generate" button on the Next Session pane
    document.getElementById('generateNextSessionBtn')?.addEventListener('click', function() {
        if (!currentPatientId) { showToast('Open a patient first', 'warning'); return; }
        openSessionGenModal();
    });

    // =========================================================================
    // Progress Notes
    // =========================================================================
    function loadPatientProgress() {
        const container = document.getElementById('paneProgressList');
        const notes = currentPatientData?.progressNotes || [];
        if (notes.length === 0) {
            container.innerHTML = `<div class="emr-empty-state"><i class="bx bx-line-chart"></i><p>No progress notes yet.</p></div>`;
            return;
        }
        const sorted = [...notes].sort((a, b) => new Date(b.date) - new Date(a.date));
        container.innerHTML = sorted.map(note => `
            <div class="progress-note">
                <div class="progress-note-header">
                    <div><strong>${note.title || 'Progress Note'}</strong></div>
                    <div class="progress-note-date">${note.date || ''}</div>
                </div>
                <div class="progress-note-content">${stripMarkdown(note.content || '')}</div>
                <div style="margin-top:0.5rem;display:flex;gap:0.5rem;">
                    <button class="btn btn-secondary" style="font-size:0.7rem;padding:0.2rem 0.8rem;" onclick="editProgressNote('${note.id}')"><i class="bx bx-edit"></i></button>
                    <button class="btn btn-secondary" style="font-size:0.7rem;padding:0.2rem 0.8rem;color:#dc2626;border-color:#dc2626;" onclick="deleteProgressNote('${note.id}')"><i class="bx bx-trash"></i></button>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('addProgressBtn')?.addEventListener('click', function() {
        if (!currentPatientId) { showToast('Open a patient first', 'warning'); return; }
        window.open(`docresult.html?id=${currentPatientId}&type=progress&action=new`, '_blank');
    });

    async function saveProgressNotes(notes) {
        try {
            await database.ref(`history/${scopeUid}/patients/${currentPatientId}/progressNotes`).set(notes);
            currentPatientData.progressNotes = notes;
            showToast('Progress note saved', 'success');
            loadPatientProgress();
        } catch (error) {
            showToast('Error saving progress note', 'error');
        }
    }

    window.editProgressNote = function(id) {
        const notes = currentPatientData?.progressNotes || [];
        const note = notes.find(n => n.id === id);
        if (!note) return;
        const newContent = prompt('Edit progress note:', note.content);
        if (newContent !== null) {
            note.content = stripMarkdown(newContent);
            saveProgressNotes(notes);
        }
    };

    window.deleteProgressNote = function(id) {
        if (!confirm('Delete this progress note?')) return;
        let notes = currentPatientData?.progressNotes || [];
        notes = notes.filter(n => n.id !== id);
        saveProgressNotes(notes);
    };

    // AI Progress Assistant
    document.getElementById('aiProgressBtn')?.addEventListener('click', function() {
        if (!currentPatientId) { showToast('Open a patient first', 'warning'); return; }
        const modal = document.getElementById('aiProgressModal');
        if (modal.style.display === 'block') { modal.style.display = 'none'; return; }
        renderProgressRatingCards();
        modal.style.display = 'block';
    });

    // Shows each identified problem as a card so the clinician can rate progress
    // and add a short discussion for it, one after another — this is what actually
    // drives the generated note, instead of generic canned questions.
    function renderProgressRatingCards() {
        const problems = currentPatientData?.problemList || [];
        const container = document.getElementById('aiProgressQuestions');

        if (problems.length === 0) {
            container.innerHTML = `
                <div class="emr-empty-state" style="padding:0.5rem;"><p style="font-size:0.8rem;">No problem list yet. Generate one from the Intake tab for a per-problem review, or describe general progress below.</p></div>
                <div class="form-group">
                    <label class="form-label">General Progress Notes</label>
                    <textarea class="form-textarea" id="generalProgressText" rows="8" placeholder="Describe the patient's current status, changes since last session, and next steps…"></textarea>
                </div>
            `;
            return;
        }

        const ratingOptions = ['Significant Improvement', 'Mild Improvement', 'No Change', 'Mild Regression', 'Significant Regression'];
        container.innerHTML = problems.map((p, i) => `
            <div class="problem-progress-card" data-id="${escapeHtml(p.id)}">
                <div class="problem-progress-title">${i + 1}. ${escapeHtml(p.title)}</div>
                ${p.detail ? `<div class="problem-progress-detail">${escapeHtml(p.detail)}</div>` : ''}
                <div class="form-group">
                    <label class="form-label">Progress Rating</label>
                    <select class="form-select problem-rating-select">
                        ${ratingOptions.map(r => `<option value="${escapeHtml(r)}" ${r === 'No Change' ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Discussion</label>
                    <textarea class="form-textarea problem-discussion" rows="3" placeholder="What did you observe for this problem today?"></textarea>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('submitAiProgressAnswers')?.addEventListener('click', async function() {
        if (!aiConfig.token) {
            const ok = await fetchTokens();
            if (!ok) { showToast('AI service not available', 'error'); return; }
        }

        const cards = document.querySelectorAll('#aiProgressQuestions .problem-progress-card');
        let promptBody = '';

        if (cards.length > 0) {
            const entries = [];
            cards.forEach(card => {
                const id = card.dataset.id;
                const problem = (currentPatientData?.problemList || []).find(p => p.id === id);
                const rating = card.querySelector('.problem-rating-select')?.value || 'No Change';
                const discussion = card.querySelector('.problem-discussion')?.value.trim() || '';
                entries.push({ title: problem?.title || 'Problem', rating, discussion });
            });
            if (entries.every(e => !e.discussion)) {
                showToast('Add at least one discussion note before generating', 'warning');
                return;
            }
            promptBody = entries.map((e, i) => `${i + 1}. ${e.title} — Rating: ${e.rating}${e.discussion ? `. Discussion: ${e.discussion}` : ' (no discussion provided).'}`).join('\n');
        } else {
            const general = document.getElementById('generalProgressText')?.value.trim();
            if (!general) { showToast('Please describe the patient\'s progress', 'warning'); return; }
            promptBody = general;
        }

        showLoading('Generating progress note…', 10);
        try {
            const prompt = `Based on the following per-problem progress review, write a professional, clinically accurate progress note. Weave the ratings and discussion into natural prose organized by problem — do not just restate the ratings verbatim.\n\n${promptBody}\n\nPatient: ${currentPatientData?.name || 'Patient'}\nDiagnosis: ${currentPatientData?.primaryDx || ''}`;
            updateLoadingProgress(30, 'Generating note…');
            const response = await callDeepSeek(
                'You are a rehabilitation specialist. Write a concise, professional progress note based on the per-problem review provided. Do not use markdown formatting.',
                prompt,
                1200
            );
            updateLoadingProgress(80, 'Saving note…');
            const notes = currentPatientData?.progressNotes || [];
            notes.push({ id: Date.now().toString(), title: `Progress Note - ${new Date().toLocaleDateString()}`, content: stripMarkdown(response), date: new Date().toLocaleDateString() });
            await saveProgressNotes(notes);
            document.getElementById('aiProgressModal').style.display = 'none';
            updateLoadingProgress(100, 'Done!');
            setTimeout(() => { hideLoading(); showToast('Progress note generated!', 'success'); }, 500);
        } catch (error) {
            console.error(error);
            hideLoading();
            showToast('Error generating progress note: ' + (error.message || 'unknown error'), 'error', 6000);
        }
    });

    document.getElementById('closeAiProgressModal')?.addEventListener('click', function() {
        document.getElementById('aiProgressModal').style.display = 'none';
    });

    // =========================================================================
    // Discharge Summary Tab
    // =========================================================================
    function loadPatientDischarge() {
        const container = document.getElementById('paneDischargeList');
        const summaries = currentPatientData?.dischargeSummaries || [];
        if (summaries.length === 0) {
            container.innerHTML = `<div class="emr-empty-state"><i class="bx bx-file"></i><p>No discharge summary yet.</p></div>`;
            return;
        }
        const sorted = [...summaries].sort((a, b) => new Date(b.date) - new Date(a.date));
        container.innerHTML = sorted.map((summary, index) => `
            <a href="docresult.html?id=${currentPatientId}&type=discharge&index=${index}" target="_blank" style="text-decoration:none;color:inherit;display:block;">
                <div class="report-item">
                    <div class="report-icon ri-amber"><i class="bx bx-file"></i></div>
                    <div>
                        <div class="report-name">${summary.title || 'Discharge Summary'}</div>
                        <div class="report-meta">${summary.date || ''}</div>
                    </div>
                    <div class="report-action"><i class="bx bx-link-external"></i></div>
                </div>
            </a>
        `).join('');
    }

    async function generateDischargeSummary() {
        if (!currentPatientId) { showToast('Open a patient first', 'warning'); return; }
        if (!aiConfig.token) {
            const ok = await fetchTokens();
            if (!ok) { showToast('AI service not available', 'error'); return; }
        }

        showToast('Gathering all patient data – this may take a moment…', 'info', 4000);
        const d = currentPatientData;
        
        // Build comprehensive history
        let fullHistory = '';
        fullHistory += `Patient: ${d.name}\n`;
        fullHistory += `Date of Birth: ${d.dob || 'N/A'}\n`;
        fullHistory += `Gender: ${d.gender || 'N/A'}\n`;
        fullHistory += `Diagnosis: ${d.primaryDx || 'N/A'}\n`;
        fullHistory += `Category: ${d.category || 'N/A'}\n`;
        fullHistory += `Profession: ${d.profession || d.department || 'N/A'}\n`;
        fullHistory += `State: ${d.state || 'N/A'}\n`;
        fullHistory += `Chief Complaint: ${d.chiefComplaint || 'N/A'}\n`;
        fullHistory += `Goals: ${d.goals || 'N/A'}\n`;
        fullHistory += `Referring Physician: ${d.referring || 'N/A'}\n`;
        fullHistory += `Insurance: ${d.insurance || 'N/A'}\n\n`;
        
        if (d.assessment) fullHistory += `Initial Assessment:\n${d.assessment}\n\n`;
        
        // Sessions
        if (d.sessions) {
            fullHistory += 'Session History:\n';
            const sessionValues = Object.values(d.sessions).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            sessionValues.forEach(s => {
                fullHistory += `- ${s.date} (${s.type || 'Session'}): ${s.notes || 'No notes'}\n`;
            });
            fullHistory += `\n`;
        }
        
        // Progress notes
        if (d.progressNotes && d.progressNotes.length) {
            fullHistory += 'Progress Notes:\n';
            d.progressNotes.forEach(n => fullHistory += `- ${n.date}: ${n.title}\n${n.content}\n\n`);
        }
        
        // Treatment plans
        if (d.treatmentPlans && d.treatmentPlans.length) {
            fullHistory += 'Treatment Plans:\n';
            d.treatmentPlans.forEach(p => fullHistory += `- ${p.title}:\n${p.content}\n\n`);
        }
        
        // Summaries
        if (d.summaries && d.summaries.length) {
            fullHistory += 'Summary Reports:\n';
            d.summaries.forEach(s => fullHistory += `- ${s.date}: ${s.content}\n\n`);
        }

        showLoading('Generating discharge summary (this may take up to a minute)…', 10);
        try {
            const systemPrompt = `You are a senior clinician preparing a discharge summary for a rehabilitation patient. Based on the complete history below, write a detailed discharge summary that includes:
- Patient demographics and diagnosis
- Summary of presenting complaints
- Key interventions and therapies provided
- Progress and response to treatment
- Current functional status
- Recommendations and follow-up plan
Use plain, professional language. Do not use markdown formatting.`;

            updateLoadingProgress(30, 'Compiling patient history…');
            const response = await callDeepSeek(systemPrompt, fullHistory, 3000);

            updateLoadingProgress(80, 'Saving discharge summary…');
            const summaries = currentPatientData?.dischargeSummaries || [];
            summaries.push({
                title: `Discharge Summary - ${new Date().toLocaleDateString()}`,
                content: stripMarkdown(response),
                date: new Date().toLocaleDateString()
            });
            await database.ref(`history/${scopeUid}/patients/${currentPatientId}/dischargeSummaries`).set(summaries);
            currentPatientData.dischargeSummaries = summaries;

            updateLoadingProgress(100, 'Done!');
            setTimeout(() => {
                hideLoading();
                showToast('Discharge summary generated!', 'success');
                loadPatientDischarge();
            }, 500);
        } catch (error) {
            console.error(error);
            hideLoading();
            showToast('Error generating discharge summary: ' + (error.message || 'unknown error'), 'error', 6000);
        }
    }

    async function dischargePatient() {
        if (!currentPatientId || !currentUser) return;
        if (!confirm('Are you sure you want to discharge this patient? This will mark them as inactive.')) return;
        try {
            await database.ref(`history/${scopeUid}/patients/${currentPatientId}/active`).set(false);
            currentPatientData.active = false;
            showToast('Patient discharged successfully', 'success');
            
            const statusBadge = document.getElementById('patientHeroStatusBadge');
            if (statusBadge) {
                statusBadge.textContent = 'Discharged';
                statusBadge.className = 'status-badge status-pending';
            }
            loadDashboardData();
        } catch (error) {
            showToast('Error discharging patient', 'error');
        }
    }

    document.getElementById('paneDischargeNew')?.addEventListener('click', generateDischargeSummary);
    document.getElementById('dischargePatientBtn')?.addEventListener('click', dischargePatient);

    // =========================================================================
    // File Upload with Extraction
    // =========================================================================
    document.getElementById('uploadAssessmentBtn')?.addEventListener('click', function() {
        document.getElementById('assessmentFileInput').click();
    });

    // Real, in-browser text extraction — no backend/server involved.
    // .txt is read natively; PDF uses pdf.js; DOCX uses mammoth.js; images use Tesseract.js OCR.
    async function extractTextFromFile(file, onProgress) {
        if (file.type === 'text/plain') {
            return (await file.text()).trim();
        }

        if (file.type === 'application/pdf') {
            if (typeof pdfjsLib === 'undefined') return '[PDF extraction library failed to load — check your internet connection]';
            const buffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
            let text = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                onProgress?.(`Reading page ${i} of ${pdf.numPages}…`);
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                text += content.items.map(item => item.str).join(' ') + '\n';
            }
            return text.trim();
        }

        if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            if (typeof mammoth === 'undefined') return '[DOCX extraction library failed to load — check your internet connection]';
            const buffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer: buffer });
            return (result.value || '').trim();
        }

        if (file.type === 'application/msword') {
            // Legacy .doc binary format isn't parseable client-side without a server.
            return '[Legacy .doc format isn\'t supported for auto-extraction — please re-save as .docx or paste the text manually]';
        }

        if (file.type.startsWith('image/')) {
            if (typeof Tesseract === 'undefined') return '[OCR library failed to load — check your internet connection]';
            const result = await Tesseract.recognize(file, 'eng', {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        onProgress?.(`OCR: ${Math.round((m.progress || 0) * 100)}%`);
                    }
                }
            });
            return (result.data.text || '').trim();
        }

        return `[Unsupported file type: ${file.type || 'unknown'}]`;
    }

    document.getElementById('assessmentFileInput')?.addEventListener('change', async function(e) {
        const files = e.target.files;
        if (!files.length) return;

        const progressDiv = document.getElementById('extractionProgress');
        const progressMsg = document.getElementById('extractionMessage');
        progressDiv.style.display = 'block';
        progressMsg.textContent = 'Processing files…';

        const fileRefs = currentPatientData?.uploadedFiles || [];

        for (const file of files) {
            try {
                progressMsg.textContent = `Extracting text from ${file.name}…`;
                const extractedText = await extractTextFromFile(file, (msg) => {
                    progressMsg.textContent = `${file.name}: ${msg}`;
                });

                const fileInfo = {
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    uploadedAt: new Date().toISOString(),
                    extractedText: extractedText
                };
                fileRefs.push(fileInfo);

                const assessmentArea = document.getElementById('intakeAssessment');
                if (extractedText && !extractedText.startsWith('[')) {
                    assessmentArea.value += (assessmentArea.value ? '\n\n--- ' + file.name + ' ---\n' : '') + extractedText;
                } else if (extractedText.startsWith('[')) {
                    showToast(`${file.name}: ${extractedText}`, 'warning', 5000);
                }

                const container = document.getElementById('assessmentAttachments');
                const chip = document.createElement('span');
                chip.className = 'attachment-chip';
                chip.innerHTML = `<i class="bx bx-file"></i> ${escapeHtml(file.name)} (${(file.size / 1024).toFixed(1)}KB)`;
                container.appendChild(chip);

                showToast(`File "${file.name}" processed`, 'success');

            } catch (err) {
                console.error('[EMR] Extraction error:', err);
                showToast('Could not process file: ' + file.name, 'error');
            }
        }

        progressDiv.style.display = 'none';

        if (currentPatientId && currentUser) {
            try {
                await database.ref(`history/${scopeUid}/patients/${currentPatientId}/uploadedFiles`).set(fileRefs);
                currentPatientData.uploadedFiles = fileRefs;
            } catch (err) {
                console.error('Error saving file references:', err);
            }
        }

        e.target.value = '';
    });

    // =========================================================================
    // Intake – Create/Update
    // =========================================================================
    function collectIntakeData() {
        return {
            name: document.getElementById('intakeName').value.trim() || 'Unknown',
            dob: document.getElementById('intakeDOB').value || '',
            gender: document.getElementById('intakeGender').value || '',
            phone: document.getElementById('intakePhone').value || '',
            primaryDx: document.getElementById('intakePrimaryDx').value || '',
            chiefComplaint: document.getElementById('intakeChiefComplaint').value || '',
            category: document.getElementById('intakeCategory').value || '',
            profession: document.getElementById('intakeProfession').value || '',
            state: document.getElementById('intakeState').value || 'Outpatient',
            referring: document.getElementById('intakeReferring').value || '',
            insurance: document.getElementById('intakeInsurance').value || '',
            goals: document.getElementById('intakeGoals').value || '',
            assessment: document.getElementById('intakeAssessment').value || ''
        };
    }

    // isDraft=true just saves the record with status:'draft' and does NOT trigger
    // an AI summary — that only fires once the patient is actually "created".
    async function createPatient(isDraft) {
        if (!currentUser) { showToast('Please log in first', 'error'); return; }
        const data = collectIntakeData();
        if (!data.name || !data.primaryDx) { showToast('Please enter patient name and primary diagnosis', 'warning'); return; }
        try {
            const ref = database.ref(`history/${scopeUid}/patients`).push();
            await ref.set({
                ...data,
                status: isDraft ? 'draft' : 'active',
                active: true,
                sessionCount: 0,
                sessions: {},
                treatmentPlans: [],
                progressNotes: [],
                reports: [],
                summaries: [],
                dischargeSummaries: [],
                problemList: [],
                generatedReport: '',
                uploadedFiles: [],
                nextSessionPlan: null,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });
            const newId = ref.key;
            await openPatient(newId);
            loadDashboardData();
            clearIntakeForm();

            if (window.RehablixCenter) {
                window.RehablixCenter.logActivity('doc', 'Created patient', data.name).catch(() => {});
            }

            if (isDraft) {
                showToast('Saved as draft. No AI report was generated yet.', 'success');
            } else {
                showToast('Patient created!', 'success');
                // Only spend an AI call if there's actually something to summarize.
                if (data.chiefComplaint || data.assessment) {
                    setTimeout(() => { generateSummaryReport(); }, 1000);
                }
            }
        } catch (error) {
            showToast('Error creating patient', 'error');
        }
    }

    async function updatePatient(isDraft) {
        if (!currentUser || !editingPatientId) { showToast('No patient to update', 'error'); return; }
        const data = collectIntakeData();
        data.status = isDraft ? 'draft' : 'active';
        try {
            await database.ref(`history/${scopeUid}/patients/${editingPatientId}`).update(data);
            showToast(isDraft ? 'Draft updated' : 'Patient updated!', 'success');
            if (window.RehablixCenter) {
                window.RehablixCenter.logActivity('doc', 'Edited patient', data.name).catch(() => {});
            }
            isEditingPatient = false;
            editingPatientId = null;
            document.getElementById('intakeModeTitle').textContent = 'New Patient';
            document.getElementById('intakeCreateBtnText').textContent = 'Create Patient';
            document.getElementById('intakeCreateBtnText2').textContent = 'Create Patient';
            document.getElementById('intakeSubtitle').textContent = 'Quick setup – you can edit all details later';
            await openPatient(editingPatientId);
            loadDashboardData();
            clearIntakeForm();
        } catch (error) {
            showToast('Error updating patient', 'error');
        }
    }

    function clearIntakeForm() {
        document.querySelectorAll('#screen-intake .form-input, #screen-intake .form-textarea').forEach(el => {
            if (el.type !== 'date') el.value = '';
        });
        document.querySelectorAll('#screen-intake .form-select').forEach(el => el.selectedIndex = 0);
        document.getElementById('intakeState').value = 'Outpatient';
        document.getElementById('assessmentAttachments').innerHTML = '';
        document.getElementById('extractionProgress').style.display = 'none';
        uploadedFileRefs = [];
    }

    document.getElementById('intakeNextBtn')?.addEventListener('click', function() {
        if (isEditingPatient) updatePatient(false);
        else createPatient(false);
    });
    document.getElementById('intakeNextBtn2')?.addEventListener('click', function() {
        if (isEditingPatient) updatePatient(false);
        else createPatient(false);
    });
    document.getElementById('intakeSaveDraft')?.addEventListener('click', function() {
        if (isEditingPatient) updatePatient(true);
        else createPatient(true);
    });
    document.getElementById('intakeSaveDraft2')?.addEventListener('click', function() {
        if (isEditingPatient) updatePatient(true);
        else createPatient(true);
    });

    document.getElementById('editPatientBtn')?.addEventListener('click', function() {
        if (!currentPatientData) return;
        isEditingPatient = true;
        editingPatientId = currentPatientId;
        switchScreen('intake');
        document.getElementById('intakeModeTitle').textContent = 'Edit Patient';
        document.getElementById('intakeCreateBtnText').textContent = 'Update Patient';
        document.getElementById('intakeCreateBtnText2').textContent = 'Update Patient';
        document.getElementById('intakeSubtitle').textContent = 'Update patient details – progress and sessions are preserved.';
        document.getElementById('intakeName').value = currentPatientData.name || '';
        document.getElementById('intakeDOB').value = currentPatientData.dob || '';
        document.getElementById('intakeGender').value = currentPatientData.gender || '';
        document.getElementById('intakePhone').value = currentPatientData.phone || '';
        document.getElementById('intakePrimaryDx').value = currentPatientData.primaryDx || '';
        document.getElementById('intakeChiefComplaint').value = currentPatientData.chiefComplaint || '';
        document.getElementById('intakeCategory').value = currentPatientData.category || '';
        document.getElementById('intakeProfession').value = currentPatientData.profession || currentPatientData.department || '';
        document.getElementById('intakeState').value = currentPatientData.state || 'Outpatient';
        document.getElementById('intakeReferring').value = currentPatientData.referring || '';
        document.getElementById('intakeInsurance').value = currentPatientData.insurance || '';
        document.getElementById('intakeGoals').value = currentPatientData.goals || '';
        document.getElementById('intakeAssessment').value = currentPatientData.assessment || '';
        
        const container = document.getElementById('assessmentAttachments');
        container.innerHTML = '';
        if (currentPatientData.uploadedFiles) {
            currentPatientData.uploadedFiles.forEach(f => {
                const chip = document.createElement('span');
                chip.className = 'attachment-chip';
                chip.innerHTML = `<i class="bx bx-file"></i> ${f.name}`;
                container.appendChild(chip);
            });
        }
        setIntakeStep(0);
    });

    document.getElementById('editIntakeBtn')?.addEventListener('click', function() {
        document.getElementById('editPatientBtn').click();
    });

    // Advanced toggle
    document.getElementById('advancedToggle')?.addEventListener('click', function() {
        const content = document.getElementById('advancedContent');
        const icon = document.getElementById('advancedIcon');
        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.className = 'bx bx-chevron-up';
        } else {
            content.style.display = 'none';
            icon.className = 'bx bx-chevron-down';
        }
    });

    // =========================================================================
    // Other button listeners
    // =========================================================================
    document.getElementById('dashNewIntakeBtn')?.addEventListener('click', () => {
        isEditingPatient = false;
        editingPatientId = null;
        document.getElementById('intakeModeTitle').textContent = 'New Patient';
        document.getElementById('intakeCreateBtnText').textContent = 'Create Patient';
        document.getElementById('intakeCreateBtnText2').textContent = 'Create Patient';
        document.getElementById('intakeSubtitle').textContent = 'Quick setup – you can edit all details later';
        clearIntakeForm();
        switchScreen('intake');
    });

    document.getElementById('dashStartSessionBtn')?.addEventListener('click', () => {
        if (allPatients.length > 0) {
            const activePatient = allPatients.find(p => p.active !== false) || allPatients[0];
            openPatient(activePatient.id);
        } else {
            switchScreen('intake');
        }
    });

    document.getElementById('patientsNewBtn')?.addEventListener('click', () => {
        isEditingPatient = false;
        editingPatientId = null;
        document.getElementById('intakeModeTitle').textContent = 'New Patient';
        document.getElementById('intakeCreateBtnText').textContent = 'Create Patient';
        document.getElementById('intakeCreateBtnText2').textContent = 'Create Patient';
        document.getElementById('intakeSubtitle').textContent = 'Quick setup – you can edit all details later';
        clearIntakeForm();
        switchScreen('intake');
    });

    document.getElementById('dashCompleteAllAI')?.addEventListener('click', async () => {
        if (!currentUser) { showToast('Please log in first', 'error'); return; }
        if (!aiConfig.token) {
            const ok = await fetchTokens();
            if (!ok) { showToast('AI service not available', 'error'); return; }
        }
        showLoading('Finding pending notes…', 5);
        try {
            const patientsSnap = await database.ref(`history/${scopeUid}/patients`).once('value');
            const patients = patientsSnap.val() || {};

            // Collect every unsigned session that has no notes yet.
            const pendingRefs = [];
            for (const [patientId, patient] of Object.entries(patients)) {
                if (!patient.sessions) continue;
                for (const [sessionId, session] of Object.entries(patient.sessions)) {
                    const hasContent = (session.notes || session.content || '').trim().length > 0;
                    if (!session.signed && !hasContent) {
                        pendingRefs.push({ patientId, patient, sessionId });
                    }
                }
            }

            if (pendingRefs.length === 0) {
                hideLoading();
                showToast('No pending notes need AI drafting.', 'info');
                return;
            }

            for (let i = 0; i < pendingRefs.length; i++) {
                const { patientId, patient, sessionId } = pendingRefs[i];
                updateLoadingProgress(10 + (80 * i) / pendingRefs.length, `Drafting note ${i + 1} of ${pendingRefs.length}…`);
                try {
                    const systemPrompt = `You are a rehabilitation clinician writing a session note. Write a concise, professional note based on the patient's diagnosis and goals. Note clearly that this is an AI-drafted note pending clinician review. Do not use markdown formatting.`;
                    const userPrompt = `Patient: ${patient.name || 'Patient'}\nDiagnosis: ${patient.primaryDx || 'Unknown'}\nChief Complaint: ${patient.chiefComplaint || ''}\nGoals: ${patient.goals || ''}`;
                    const response = await callDeepSeek(systemPrompt, userPrompt, 800);
                    const content = stripMarkdown(response);
                    await database.ref(`history/${scopeUid}/patients/${patientId}/sessions/${sessionId}`).update({
                        notes: content,
                        content: content,
                        plainText: content,
                        aiGenerated: true
                    });
                } catch (innerErr) {
                    console.error('[EMR] Failed to draft note for session', sessionId, innerErr);
                }
            }

            updateLoadingProgress(100, 'Done!');
            setTimeout(() => {
                hideLoading();
                showToast(`AI drafted ${pendingRefs.length} note(s). Please review and sign each one.`, 'success', 4500);
                loadDashboardData();
            }, 400);
        } catch (error) {
            console.error(error);
            hideLoading();
            showToast('Error completing notes with AI: ' + (error.message || 'unknown error'), 'error', 6000);
        }
    });

    document.getElementById('emrSearchToggle')?.addEventListener('click', () => {
        switchScreen('patients');
    });

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
    // DeepSeek API Call
    // =========================================================================
    async function callDeepSeek(systemPrompt, userPrompt, maxTokens = 2000) {
        if (!aiConfig.token) {
            throw new Error('AI is not configured yet (no API key loaded). Try again in a moment, or reload the page.');
        }
        const url = `${aiConfig.endpoint}/chat/completions`;
        let response;
        try {
            response = await fetch(url, {
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
                    temperature: 0.4,
                    top_p: 0.9
                })
            });
        } catch (networkErr) {
            // fetch() throws a generic TypeError for both network failures and CORS blocks.
            // The browser hides the real reason from JS — check the DevTools Console/Network tab for specifics.
            console.error('[EMR] AI request failed before reaching the server (network/CORS):', networkErr);
            throw new Error('Could not reach the AI service (network or CORS issue). Check the browser console/Network tab for details.');
        }
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const msg = errData?.error?.message || `AI service returned an error (HTTP ${response.status}).`;
            console.error('[EMR] AI API error response:', response.status, errData);
            throw new Error(msg);
        }
        const data = await response.json();
        if (!data?.choices?.[0]?.message?.content) {
            console.error('[EMR] AI response missing expected content:', data);
            throw new Error('AI service returned an unexpected response format.');
        }
        return data.choices[0].message.content;
    }

    // =========================================================================
    // Init
    // =========================================================================
    async function init() {
        console.log('[EMR] Initializing...');
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        await fetchTokens();
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
        document.getElementById('greetingTime').textContent = greeting;
        if (currentUser) {
            loadDashboardData();
            loadPatientsList();
        }
        console.log('[EMR] Ready');
    }

    init();

    // =========================================================================
    // Window Exports
    // =========================================================================
    window.switchScreen = switchScreen;
    window.switchPatientTab = switchPatientTab;
    window.openPatient = openPatient;
    window.editProgressNote = editProgressNote;
    window.deleteProgressNote = deleteProgressNote;

    console.log('[EMR] Fully loaded');
});