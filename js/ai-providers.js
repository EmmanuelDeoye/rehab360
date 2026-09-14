// js/ai-providers.js
// Shared helper for Gemini calls (vision + audio understanding).
// Text-only chat still goes straight from each page's own code to DeepSeek
// (api.deepseek.com) — this file only covers the tasks DeepSeek can't do:
// reading images/video frames and transcribing audio.
//
// Requires a Gemini API key stored in Firebase at tokens/gemini -> { api_key }
// (same convention as tokens/deepseek -> { api_key }).

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Turn a data URL ("data:image/png;base64,....") into { mimeType, base64 }
function parseDataUrl(url) {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(url || '');
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function geminiPartsFromMedia(media) {
  return (media || []).map(m => {
    // Accept either a data URL string or an already-split {base64, mimeType} object
    if (typeof m === 'string') {
      const parsed = parseDataUrl(m);
      return parsed ? { inline_data: { mime_type: parsed.mimeType, data: parsed.base64 } } : null;
    }
    if (m && m.base64 && m.mimeType) {
      return { inline_data: { mime_type: m.mimeType, data: m.base64 } };
    }
    return null;
  }).filter(Boolean);
}

function extractGeminiText(data) {
  const candidate = data.candidates && data.candidates[0];
  if (!candidate || !candidate.content || !candidate.content.parts) {
    const reason = candidate?.finishReason || 'no content returned';
    throw new Error(`Gemini returned no usable content (${reason})`);
  }
  return candidate.content.parts.map(p => p.text || '').join('');
}

// Single-turn call: one prompt + zero or more images/audio/video clips.
async function callGeminiVision(apiKey, promptText, media, opts = {}) {
  if (!apiKey) throw new Error('Gemini API key is not configured.');
  const model = opts.model || GEMINI_MODEL;
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const parts = [{ text: promptText || '' }, ...geminiPartsFromMedia(media)];
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxTokens || 1500
    }
  };
  if (opts.systemPrompt) {
    body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Gemini API error ${response.status}: ${errText || response.statusText}`);
  }

  const data = await response.json();
  return extractGeminiText(data);
}

// Multi-turn version, for chat-style vision (e.g. Ask AI with image history).
// turns: [{ role: 'user'|'model', parts: [{text}, {inline_data}, ...] }]
async function callGeminiChat(apiKey, turns, opts = {}) {
  if (!apiKey) throw new Error('Gemini API key is not configured.');
  const model = opts.model || GEMINI_MODEL;
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: turns,
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens || 1500
    }
  };
  if (opts.systemPrompt) {
    body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Gemini API error ${response.status}: ${errText || response.statusText}`);
  }

  const data = await response.json();
  return extractGeminiText(data);
}

// Convenience wrapper: transcribe a single audio clip to plain text.
async function transcribeAudioGemini(apiKey, base64Audio, mimeType, opts = {}) {
  const prompt = 'Transcribe this audio exactly as spoken. Return ONLY the raw transcript text — no labels, no speaker names unless clearly distinguishable, no commentary, no markdown formatting.';
  return callGeminiVision(apiKey, prompt, [{ base64: base64Audio, mimeType }], {
    temperature: 0.2,
    maxTokens: opts.maxTokens || 4000,
    model: opts.model
  });
}

// Read a Blob/File and resolve to { base64, mimeType }
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || '';
      const commaIdx = result.indexOf(',');
      resolve({
        base64: commaIdx >= 0 ? result.slice(commaIdx + 1) : result,
        mimeType: blob.type || 'application/octet-stream'
      });
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(blob);
  });
}

window.parseDataUrl = parseDataUrl;
window.callGeminiVision = callGeminiVision;
window.callGeminiChat = callGeminiChat;
window.transcribeAudioGemini = transcribeAudioGemini;
window.blobToBase64 = blobToBase64;
window.GEMINI_MODEL = GEMINI_MODEL;
