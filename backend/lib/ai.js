// =============================================
// Provider-agnostic AI client — backed by Google Gemini.
// Exposes Anthropic-style helpers (callAI / parseJsonResponse / hasApiKey) so
// the rest of the app can stay unchanged. Accepts the same message shape:
//   messages: [{ role: 'user'|'assistant', content: string | block[] }]
// where an image block is { type:'image', source:{ media_type, data } } (base64).
// =============================================

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Gemini model. 2.5 Flash is fast + multimodal (handles food photos).
export const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export function getApiKey() {
  // Accept either name; prefer the Gemini-specific one.
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

export function hasApiKey() {
  return Boolean(getApiKey());
}

// Translate one Anthropic-style content value into Gemini "parts".
function toParts(content) {
  if (typeof content === 'string') {
    return [{ text: content }];
  }
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (block.type === 'text') return { text: block.text };
      if (block.type === 'image') {
        return {
          inline_data: {
            mime_type: block.source?.media_type || 'image/jpeg',
            data: block.source?.data,
          },
        };
      }
      return { text: String(block?.text ?? '') };
    });
  }
  return [{ text: String(content ?? '') }];
}

// Map roles: Anthropic uses user|assistant; Gemini uses user|model.
function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: toParts(m.content),
  }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Low-level call to the Gemini generateContent API.
 * @param {object} opts
 * @param {string} [opts.system]   System instruction.
 * @param {Array}  opts.messages   Anthropic-style messages.
 * @param {number} [opts.maxTokens]
 * @param {string} [opts.model]
 * @param {boolean} [opts.json]    Ask Gemini to return application/json.
 * @returns {Promise<string>} The model's text output.
 */
export async function callAI({ system, messages, maxTokens = 1000, model = MODEL, json = false }) {
  const key = getApiKey();
  if (!key) throw new Error('GEMINI_API_KEY is not set');

  const generationConfig = {
    // 2.5 models spend "thinking" tokens before answering, which can eat the
    // whole budget and return empty text. Disable it for our short, structured
    // calls — faster, cheaper, and reliable.
    thinkingConfig: { thinkingBudget: 0 },
    maxOutputTokens: maxTokens,
    temperature: 0.7,
  };
  if (json) generationConfig.responseMimeType = 'application/json';

  const body = { contents: toGeminiContents(messages), generationConfig };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`;

  // Retry transient 429/503 (Gemini overload) with small backoff.
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        // API key in a header (not the URL) so it never lands in logs.
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastErr = e;
      await sleep(400 * (attempt + 1));
      continue;
    }

    if (response.ok) {
      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p) => p.text || '').join('').trim();
      if (!text) {
        const reason = data?.candidates?.[0]?.finishReason || 'empty';
        throw new Error(`Gemini returned no text (finishReason: ${reason})`);
      }
      return text;
    }

    if (response.status === 429 || response.status >= 500) {
      lastErr = new Error(`Gemini API ${response.status}`);
      await sleep(500 * (attempt + 1));
      continue;
    }

    // Non-retryable (e.g. 400/401/403): keep raw detail server-side.
    const detail = await response.text().catch(() => '');
    throw new Error(`Gemini API ${response.status}: ${detail.slice(0, 500)}`);
  }
  throw lastErr || new Error('Gemini API unavailable');
}

/**
 * Parse a JSON object out of a model response, tolerating ```json fences and
 * surrounding prose. Throws if no JSON object can be recovered.
 */
export function parseJsonResponse(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Model did not return valid JSON');
  }
}

// Backwards-compatible alias so existing imports keep working.
export const callClaude = callAI;
