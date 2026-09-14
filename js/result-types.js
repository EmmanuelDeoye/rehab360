// js/result-types.js
// Defines how each "kind" of generated result plugs into the single, shared
// result.html page. Add a new generator's result view here instead of
// creating a brand new xxxresult.html + xxxresult.js pair.

(function () {
  const CASE_MODE_LABELS = {
    presentation: 'Case Presentation',
    report: 'Clinical Report',
    documentation: 'Documentation'
  };
  const CASE_MODE_SHORT = {
    presentation: 'case presentation',
    report: 'report',
    documentation: 'documentation'
  };

  function fallbackContent(data, htmlField, markdownField, altField) {
    if (data[htmlField] && data[htmlField].trim().length > 0) return data[htmlField];
    if (markdownField && data[markdownField] && data[markdownField].trim().length > 0) {
      return (typeof marked !== 'undefined') ? marked.parse(data[markdownField]) : data[markdownField];
    }
    if (altField && data[altField] && data[altField].trim().length > 0) {
      return (typeof marked !== 'undefined') ? marked.parse(data[altField]) : data[altField];
    }
    return '<p>No content available</p>';
  }

  window.RESULT_TYPES = {
    // ================= Case Presentation / Report / Documentation =================
    case: {
      accent: '#009688',
      pageTitle: 'Case Presentation',
      shortLabel: 'case presentation',
      historyPath: (uid, id) => `history/${uid}/caseHistory/${id}`,
      validate: (data) => !!CASE_MODE_LABELS[data.contentType] || true,
      titleFor: (data) => CASE_MODE_LABELS[data.contentType] || 'Clinical Document',
      shortTitleFor: (data) => CASE_MODE_SHORT[data.contentType] || 'document',
      fileBase: (data) => `${(CASE_MODE_LABELS[data.contentType] || 'Document').replace(/\s+/g, '_')}_${(data.patientName || 'Patient').replace(/\s+/g, '_')}`,
      metadata: (data) => {
        const details = [data.patientAge, data.patientGender].filter(Boolean).join(', ');
        const nameText = details ? `${data.patientName || 'Patient'} (${details})` : (data.patientName || 'Patient');
        return [
          { icon: 'fa-user', text: nameText },
          { icon: 'fa-calendar-alt', text: data.date || new Date().toLocaleDateString() },
          { icon: 'fa-briefcase', text: data.profession || 'Healthcare Professional' },
          { icon: 'fa-notes-medical', text: data.diagnosis || 'Not specified' },
          { icon: 'fa-clock', text: data.lastEditedDate || data.date || '-' }
        ];
      },
      getContentHtml: (data) => fallbackContent(data, 'resultsHtml', 'resultsMarkdown', 'results'),
      buildSaveUpdates: ({ html, markdown }) => ({ resultsMarkdown: markdown, resultsHtml: html }),
      closeUrl: 'presentation.html',
      showPptExport: true,
      pptExportData: (data, html) => ({
        content: html,
        patientName: data.patientName || 'Patient',
        profession: data.profession || '',
        diagnosis: data.diagnosis || '',
        modeLabel: CASE_MODE_LABELS[data.contentType] || 'Presentation',
        mode: data.contentType
      }),
      shareSubject: (data) => `${CASE_MODE_LABELS[data.contentType] || 'Document'}: ${data.patientName || 'Patient'}`,
      printMeta: (data) => [
        ['Clinician', data.profession || 'N/A'],
        ['Diagnosis', data.diagnosis || 'N/A']
      ]
    },

    // ================= Assignment =================
    answer: {
      accent: '#6d28d9',
      pageTitle: 'Assignment',
      shortLabel: 'assignment',
      historyPath: (uid, id) => `history/${uid}/assignments/${id}`,
      localFallback: { key: 'rehab_assignment_current', matchField: 'historyId' },
      validate: () => true,
      titleFor: (data) => data.topic || 'Assignment',
      shortTitleFor: () => 'assignment',
      fileBase: (data) => `Assignment_${(data.topic || 'Untitled').replace(/\s+/g, '_')}`,
      metadata: (data) => [
        { icon: 'fa-book', text: data.topic || 'Untitled Assignment' },
        { icon: 'fa-graduation-cap', text: data.course || 'N/A' },
        { icon: 'fa-tag', text: data.typeLabel || data.type || 'N/A' },
        { icon: 'fa-ruler', text: (data.volume && data.volumeUnit) ? `${data.volume} ${data.volumeUnit}` : '-' },
        { icon: 'fa-smile', text: data.toneLabel || data.tone || '-' },
        { icon: 'fa-calendar-alt', text: data.date || new Date().toLocaleDateString() },
        { icon: 'fa-clock', text: data.lastEditedDate || data.date || '-' }
      ],
      getContentHtml: (data) => (data.html && data.html.trim().length > 0) ? data.html : '<p>No content available</p>',
      buildSaveUpdates: ({ html, text }) => ({ html: html, plainPreview: (text || '').substring(0, 200) }),
      closeUrl: 'assignment.html',
      showPptExport: true,
      pptExportData: (data, html) => ({
        content: html,
        modeLabel: data.topic || 'Assignment',
        patientName: data.course || 'N/A',
        diagnosis: data.typeLabel || data.type || 'N/A',
        profession: data.toneLabel || data.tone || 'N/A'
      }),
      shareSubject: (data) => `Assignment: ${data.topic || 'Untitled'}`,
      printMeta: (data) => [
        ['Course', data.course || 'N/A'],
        ['Type', data.typeLabel || data.type || 'N/A']
      ]
    },

    // ================= Gait Analysis =================
    gait: {
      accent: '#0ea5e9',
      pageTitle: 'Gait Analysis Report',
      shortLabel: 'gait report',
      historyPath: (uid, id) => `history/${uid}/gaitHistory/${id}`,
      validate: () => true,
      titleFor: () => 'Gait Analysis Report',
      shortTitleFor: () => 'gait report',
      fileBase: (data) => `Gait_${(data.patientName || data.fileName || 'Report').replace(/\s+/g, '_')}`,
      metadata: (data) => [
        { icon: 'fa-user', text: data.patientName || data.fileName || 'Unnamed Patient' },
        { icon: 'fa-calendar-alt', text: data.date || new Date().toLocaleDateString() },
        { icon: 'fa-eye', text: data.view || 'Not specified' },
        { icon: 'fa-clock', text: data.lastEditedDate || data.date || '-' }
      ],
      getContentHtml: (data) => fallbackContent(data, 'resultsHtml', 'resultsMarkdown'),
      buildSaveUpdates: ({ html, markdown }) => ({ resultsMarkdown: markdown, resultsHtml: html }),
      closeUrl: 'rom.html?mode=gait',
      showPptExport: false,
      shareSubject: (data) => `Gait Analysis Report: ${data.patientName || data.fileName || 'Report'}`,
      printMeta: (data) => [
        ['View', data.view || 'N/A']
      ]
    },

    // ================= Range of Motion =================
    rom: {
      accent: '#f59e0b',
      pageTitle: 'ROM Analysis Report',
      shortLabel: 'rom report',
      historyPath: (uid, id) => `history/${uid}/analysisHistory/${id}`,
      validate: () => true,
      titleFor: () => 'ROM Analysis Report',
      shortTitleFor: () => 'rom report',
      fileBase: (data) => `ROM_${(data.fileName || 'Report').replace(/\s+/g, '_')}`,
      metadata: (data) => {
        const measurements = Array.isArray(data.measurements) ? data.measurements : [];
        const measuredCount = measurements.filter(m => m.measured).length;
        const measureText = measurements.length === 0
          ? 'N/A'
          : measuredCount === measurements.length
            ? `${measuredCount}/${measurements.length} measured`
            : `${measuredCount}/${measurements.length} measured, rest AI estimate`;
        return [
          { icon: 'fa-user', text: data.patientName || 'Unnamed Patient' },
          { icon: 'fa-running', text: data.fileName || 'ROM Analysis' },
          { icon: 'fa-calendar-alt', text: data.date || new Date().toLocaleDateString() },
          { icon: 'fa-layer-group', text: data.assessmentMode === 'full' ? 'Full Assessment' : 'Isolate Joint' },
          { icon: 'fa-ruler-combined', text: measureText },
          { icon: 'fa-images', text: `${data.frameCount || 0} frames` },
          { icon: 'fa-clock', text: data.lastEditedDate || data.date || '-' }
        ];
      },
      getContentHtml: (data) => fallbackContent(data, 'resultsHtml', 'resultsMarkdown'),
      buildSaveUpdates: ({ html, markdown }) => ({ resultsMarkdown: markdown, resultsHtml: html }),
      closeUrl: 'rom.html',
      showPptExport: false,
      shareSubject: (data) => `ROM Analysis Report: ${data.fileName || 'Report'}`,
      printMeta: (data) => [
        ['Patient', data.patientName || 'N/A'],
        ['Mode', data.assessmentMode === 'full' ? 'Full Assessment' : 'Isolate Joint'],
        ['Frames', `${data.frameCount || 0}`]
      ]
    },

    // ================= Ask AI response =================
    ask: {
      accent: '#009688',
      pageTitle: 'AI Response',
      shortLabel: 'AI response',
      historyPath: (uid, id) => `history/${uid}/askResults/${id}`,
      validate: () => true,
      titleFor: (data) => data.question ? `Re: ${data.question}` : 'AI Response',
      shortTitleFor: () => 'AI response',
      fileBase: () => `Ask_AI_Response`,
      metadata: (data) => [
        { icon: 'fa-comment-dots', text: data.question || 'Ask AI' },
        { icon: 'fa-calendar-alt', text: data.date || new Date().toLocaleDateString() },
        { icon: 'fa-clock', text: data.lastEditedDate || data.date || '-' }
      ],
      getContentHtml: (data) => fallbackContent(data, 'resultsHtml', 'resultsMarkdown'),
      buildSaveUpdates: ({ html, markdown }) => ({ resultsMarkdown: markdown, resultsHtml: html }),
      closeUrl: 'index.html',
      showPptExport: false,
      shareSubject: (data) => data.question ? `AI answer: ${data.question}` : 'AI Response',
      printMeta: (data) => [
        ['Question', data.question || 'N/A']
      ]
    },

    // ================= Standardized Assessment Format =================
    format: {
      accent: '#00695c',
      pageTitle: 'Assessment Result',
      shortLabel: 'assessment result',
      historyPath: (uid, id) => `history/${uid}/formats/${id}`,
      validate: () => true,
      titleFor: (data) => `Assessment: ${data.patientName || 'Result'}`,
      shortTitleFor: () => 'assessment result',
      fileBase: (data) => `Assessment_${(data.patientName || 'Result').replace(/\s+/g, '_')}`,
      metadata: (data) => [
        { icon: 'fa-user', text: data.patientName || 'Unknown' },
        { icon: 'fa-clipboard-list', text: data.assessmentType || 'Assessment' },
        { icon: 'fa-hospital', text: data.department || 'General' },
        { icon: 'fa-clock', text: data.lastEditedDate || (data.timestamp ? new Date(data.timestamp).toLocaleString() : '-') }
      ],
      getContentHtml: (data) => (data.generatedText && data.generatedText.trim().length > 0) ? data.generatedText : '<p>No content available</p>',
      buildSaveUpdates: ({ html }) => ({
        generatedText: html,
        preview: html.replace(/<[^>]*>/g, ' ').substring(0, 150).replace(/\n/g, ' ')
      }),
      closeUrl: 'format.html',
      showPptExport: false,
      shareSubject: (data) => `Assessment Result: ${data.patientName || 'Result'}`,
      printMeta: (data) => [
        ['Assessment Type', data.assessmentType || 'N/A'],
        ['Department', data.department || 'N/A']
      ]
    }
  };
})();
