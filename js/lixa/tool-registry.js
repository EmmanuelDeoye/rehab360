// js/lixa/tool-registry.js
//
// The single source of truth for what Rehablix capabilities Lixa knows
// about (brief section 24). js/ask.js's link-recommendation system
// already effectively does intent detection today — the AI decides
// which page to recommend and outputs a markdown link; this registry is
// what turns "AI recommended format.html" into a controlled, known
// capability rather than an arbitrary string, and lets app code (not
// the model) decide HOW that capability runs:
//
//   - mode: "direct"   → Lixa calls the tool's own generation function
//                         DIRECTLY (window.RehablixGenerators[generatorKey]),
//                         in-process, no iframe — the file/result is
//                         produced and rendered as a native Lixa result
//                         card. This is the real "Lixa generates content
//                         itself" architecture (this round's refactor).
//                         Requires the target page's script to be loaded
//                         directly on index.html and to expose a
//                         window.RehablixGenerators[generatorKey].generate()
//                         function (see js/standardized.js for the
//                         reference implementation).
//   - mode: "inline"   → runs inside the Lixa conversation via a
//                         sandboxed iframe result card, reusing the
//                         existing tool page's own JS/UI as-is. The
//                         previous, still-valid approach for tools not
//                         yet converted to "direct".
//   - mode: "handoff"  → unchanged Phase-1/2 behavior: saves context via
//                         RehablixHandoff and navigates to the dedicated
//                         page (used for tools with a large persistent
//                         editor — Smart EMR, Motion & Gait, Project
//                         Maker, Exam Simulator).
//
// Adding a capability to Lixa going forward means adding one entry here,
// not touching ask.js's prompt string or handoff logic by hand.

(function () {
  'use strict';

  const TOOLS = {
    assessment: {
      key: 'assessment',
      name: 'Assessment Format Generator',
      description: 'Builds structured assessment write-ups from patient data and clinical guidelines.',
      page: 'format.html',
      mode: 'inline',
      promptLine: '[Assessment Format Generator](format.html) – builds structured assessment write-ups from patient data and clinical guidelines.'
    },
    standardized: {
      key: 'standardized',
      name: 'Standardized Tools',
      description: "Generates full copies of standardized assessments (MMSE, Berg Balance Scale, etc.) as downloadable PDFs.",
      page: 'standardized.html',
      mode: 'direct',
      generatorKey: 'standardized',
      promptLine: '[Standardized Tools](standardized.html) – generates full copies of standardized assessments (MMSE, Berg Balance Scale, etc.) as downloadable PDFs.'
    },
    documentation: {
      key: 'documentation',
      name: 'Documentation Assistant',
      description: 'Dictate, upload files, or upload recorded sessions; AI transcribes and organizes clinical notes.',
      page: 'doc.html',
      mode: 'handoff',
      promptLine: '[Documentation Assistant](doc.html) – dictate, upload files, or upload recorded sessions; AI transcribes and organizes clinical notes.'
    },
    audio: {
      key: 'audio',
      name: 'Audio Transcription',
      description: "Records a live assessment/therapy session or transcribes an uploaded audio file.",
      page: 'audio.html',
      mode: 'inline',
      promptLine: '[Audio Transcription](audio.html) – records a live assessment/therapy session or transcribes an uploaded audio file.'
    },
    motion: {
      key: 'motion',
      name: 'Motion & Gait Analyzer',
      description: "A voice-guided video scan that measures joint range of motion or analyzes a patient's gait, with AI tracking positioning automatically.",
      page: 'rom.html',
      mode: 'handoff',
      promptLine: "[Motion & Gait Analyzer](rom.html) – a voice-guided video scan that measures joint range of motion (rom.html?mode=rom) or analyzes a patient's gait (rom.html?mode=gait), with AI tracking positioning automatically."
    },
    presentation: {
      key: 'presentation',
      name: 'Presentation Maker',
      description: 'Turns notes/research into a case presentation, clinical report, or documentation with AI-generated slides.',
      page: 'presentation.html',
      mode: 'direct',
      generatorKey: 'presentation',
      promptLine: '[Presentation Maker](presentation.html) – turns notes/research into a case presentation, clinical report, or documentation with AI-generated slides.'
    },
    assignment: {
      key: 'assignment',
      name: 'Assignment Maker',
      description: 'Generates full academic assignments with references and a chosen tone (for students).',
      page: 'assignment.html',
      mode: 'inline',
      promptLine: '[Assignment Maker](assignment.html) – generates full academic assignments with references and a chosen tone (for students).'
    },
    project: {
      key: 'project',
      name: 'Project Maker',
      description: 'Builds an academic project chapter by chapter (literature review, methodology, references, defense prep).',
      page: 'project.html',
      mode: 'handoff',
      promptLine: '[Project Maker](project.html) – builds an academic project chapter by chapter (literature review, methodology, references, defense prep).'
    },
    study: {
      key: 'study',
      name: 'Study Buddy',
      description: 'Turns notes/textbooks/slides into flashcards, summaries, and quizzes.',
      page: 'study.html',
      mode: 'inline',
      promptLine: '[Study Buddy](study.html) – turns notes/textbooks/slides into flashcards, summaries, and quizzes.'
    },
    exam: {
      key: 'exam',
      name: 'Exam Simulator',
      description: 'Timed, AI-generated practice exams with performance analytics.',
      page: 'exam.html',
      mode: 'handoff',
      promptLine: '[Exam Simulator](exam.html) – timed, AI-generated practice exams with performance analytics.'
    }
  };

  function all() {
    return Object.values(TOOLS);
  }

  function byPage(page) {
    const clean = String(page || '').split('?')[0];
    return all().find((t) => t.page === clean) || null;
  }

  function isInline(page) {
    const tool = byPage(page);
    return !!tool && tool.mode === 'inline';
  }

  function isDirect(page) {
    const tool = byPage(page);
    return !!tool && tool.mode === 'direct';
  }

  // Builds the bullet list for the system prompt. Each line's own
  // description text is unchanged from earlier phases; a short
  // mode-based clause is appended here so the AI's own phrasing matches
  // what actually happens when it links a tool — direct/inline ones run
  // right in the conversation, handoff ones open their own page —
  // instead of talking about every one of these as if it's a separate
  // destination the user has to go visit and operate themselves.
  function buildPromptList() {
    return all().map((t) => {
      const modeClause = t.mode !== 'handoff'
        ? ' (runs right here in this conversation — no separate page, nothing to re-enter)'
        : ' (opens its own dedicated page for this)';
      return `- ${t.promptLine}${modeClause}`;
    }).join('\n');
  }

  window.RehablixTools = { all, byPage, isInline, isDirect, buildPromptList };
})();
