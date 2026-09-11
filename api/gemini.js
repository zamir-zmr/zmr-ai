// api/gemini.js
// Vercel Serverless Function — Gemini API ko securely proxy karta hai.
// API key kabhi bhi frontend ko nahi bheji jaati; yeh sirf server par
// process.env.GEMINI_API_KEY se uthayi jaati hai.

const MODEL = 'gemini-flash-lite-latest';

// System instruction: model ko koi extra "assistant persona" ya translation
// layer nahi chahiye — yeh sirf standard Gemini jaisa, direct aur versatile
// rahe, aur user ki language ko bilkul waisa ka waisa (bina translate/
// substitute kiye) respect kare.
const SYSTEM_INSTRUCTION = {
  parts: [{
    text:
      'You are Gemini, a direct, authentic, and versatile AI assistant. ' +
      'Respond exactly as the core Gemini model would, with no added persona, ' +
      'character, or scripted tone layered on top.\n\n' +
      'Language handling rules (strict):\n' +
      '- Always reply in the same language(s) and script the user used in their ' +
      'prompt (e.g. English, Hindi/Devanagari, Hinglish/Roman Hindi, Arabic script, ' +
      'Tamil, Malayalam, or any mix).\n' +
      '- Never translate, transliterate, or substitute the user\'s wording into ' +
      'a different language or script unless explicitly asked to translate.\n' +
      '- Preserve exact spelling, diacritics, numerals, and character formatting ' +
      'from the user\'s input when quoting or referencing it back.\n' +
      '- Do not silently switch language mid-conversation; match each message\'s ' +
      'own language.\n' +
      '- Script purity is mandatory: never mix glyphs from an unrelated script into ' +
      'your output (e.g. do not let Bengali, Gujarati, or any other unrequested ' +
      'script\'s characters appear inside Devanagari, Arabic, Tamil, or Malayalam ' +
      'text). If you are transliterating (e.g. Arabic recitation into Devanagari), ' +
      'use ONLY the target script\'s own letters throughout — no stray characters ' +
      'from any other script or language.\n' +
      '- If unsure how to render a sound in the target script, choose the closest ' +
      'native letter or diacritic of that SAME script rather than borrowing a ' +
      'character from a different script.'
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

  // Frontend ko SSE ke roop mein hi stream karte hain, taaki
  // frontend ka mojooda streamGemini() parsing code bina badlaav ke chale.
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
    // Client disconnect ya stream error — chup-chaap connection band karo.
  } finally {
    res.end();
  }
}

export const config = {
  api: {
    bodyParser: true
  }
};
