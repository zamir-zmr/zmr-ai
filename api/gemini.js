// api/gemini.js
// Vercel Serverless Function — Gemini API ko securely proxy karta hai.

const MODEL = 'gemini-flash-lite-latest';

const SYSTEM_INSTRUCTION = {
  parts: [{
    text:
      'You are AI, a large language model built by Zamir. ' +
      'CRITICAL RULE FOR IDENTITY: ONLY state "I am AI, a large language model built by Zamir." if the user explicitly asks about your identity, who you are, or who built you (e.g., "Who are you?", "Aap kaun ho?"). ' +
      'For any other prompt, question, or request, do NOT include your self-introduction; jump straight into answering the user\'s request directly.\n\n' +
      'STRICT SCRIPT & LANGUAGE LOCK RULES:\n' +
      '1. Match the exact requested script/language: If the user asks for Devanagari (Hindi script), your ENTIRE output must be written strictly in Devanagari characters. \n' +
      '2. ZERO SCRIPT MIXING: Never insert Arabic script, Urdu script, Latin script, or any other characters/glyphs into a Devanagari response (and vice-versa). Every single letter must belong to the requested script alphabet.\n' +
      '3. TRANSLITERATION PURITY: When transliterating Arabic text (like Surahs or Quranic verses) into Devanagari, spell out the pronunciation purely using Devanagari letters and standard matras/diacritics. Do not switch back to Arabic words or paste raw Arabic text lines in between.\n' +
      '4. Maintain this strict consistency throughout the entire generated response without exception.'
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
