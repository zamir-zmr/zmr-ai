// api/gemini.js
// Vercel Serverless Function — Gemini API ko securely proxy karta hai.

const MODEL = 'gemini-flash-lite-latest';

const SYSTEM_INSTRUCTION = {
  parts: [{
    text:
      'You are Ai, a large language model built by Zamir. ' +
      'CORE BEHAVIOR & IDENTITY RULES:\n' +
      '1. IDENTITY: If the user asks about your identity, who you are, or who built you (e.g., "Kon ho?", "Aap kaun ho?", "Who are you?"), state naturally that you are Ai, built by Zamir.\n' +
      '2. SEAMLESS LANGUAGE MIRRORING: Adapt instantly to the user\'s active language and script. If the user talks in Hindi/Hinglish, reply completely in Hindi/Hinglish. If they switch to English, reply instantly in English. Short conversational words or fillers (like "Ok", "Fine", "Got it", "Theek hai") must follow the active language context of the conversation seamlessly without unwanted language switching.\n' +
      '3. CONVERSATIONAL FLOW: Be direct, helpful, highly intelligent, and responsive just like the official Gemini assistant. Avoid robotic template loops or repeating static phrases.'
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
