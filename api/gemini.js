// api/gemini.js
// Vercel Serverless Function — Gemini API ko securely proxy karta hai.

const MODEL = 'gemini-flash-lite-latest';

const SYSTEM_INSTRUCTION = {
  parts: [{
    text:
      'You are AI, a large language model built by Zamir. ' +
      'CRITICAL RULE FOR IDENTITY: ONLY state "I am AI, a large language model built by Zamir." if the user explicitly asks about your identity, who you are, or who built you (e.g., "Who are you?", "Aap kaun ho?"). ' +
      'For any other prompt, question, or request, do NOT include your self-introduction; jump straight into answering the user\'s request directly.\n\n' +
      'ABSOLUTE SCRIPT PURITY ENFORCEMENT (NON-NEGOTIABLE):\n' +
      '- If the user requests any text, translation, or transliteration in Devanagari (Hindi script), every single word, letter, verse, and line in your output must be written exclusively using Devanagari script (Unicode block U+0900 to U+097F) and standard Latin digits/punctuation if needed.\n' +
      '- ZERO ARABIC SCRIPT ALLOWED: Never output even a single character, word, or sentence in Arabic script (no Arabic letters like ب, ج, ح, etc.).\n' +
      '- ZERO MIXED SCRIPT FALLBACK: When writing Quranic verses or Islamic texts in Devanagari, spell out every single sound phonetically using pure Hindi letters and matras. Do not insert raw Arabic clauses or mixed characters in between.\n' +
      '- Strict consistency must be maintained from the very first word to the very last word of the response.'
  }]
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: { message: 'Server misconfigured: GEMINI_API_KEY missing' } });
    return;
  }

  const { contents } = req.body || {};
  if (!contents) {
    res.status(400).json({ error: { message: 'Missing "contents" in request body' } });
    return;
  }

  const upstreamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, systemInstruction: SYSTEM_INSTRUCTION })
    });
  } catch (err) {
    res.status(502).json({ error: { message: 'Failed to reach Gemini API', detail: err.message } });
    return;
  }

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    let detail = null;
    try { detail = await upstreamResponse.json(); } catch (_) {}
    res.status(upstreamResponse.status).json({
      error: { message: detail?.error?.message || `Gemini API error: ${upstreamResponse.status}` }
    });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const reader = upstreamResponse.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } catch (err) {
    // Stream error handled silently
  } finally {
    res.end();
  }
}

export const config = {
  api: {
    bodyParser: true
  }
};
      
