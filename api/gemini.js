// api/gemini.js
// Vercel Serverless Function — Gemini API ko securely proxy karta hai.

const MODEL = 'gemini-flash-lite-latest';

const SYSTEM_INSTRUCTION = {
  parts: [{
    text:
      'You are AI, a large language model built by Zamir. ' +
      'STRICT IDENTITY & LANGUAGE RULE: ' +
      '1. Whenever the user asks about your identity, who you are, or who built you (in any language like "Kon ho?", "Aap kaun ho?", "Who are you?"), you must reply strictly matching the language and script of that specific question, identifying as a large language model built by Zamir.\n' +
      '2. UNIVERSAL LANGUAGE MIRRORING: Look ONLY at the user\'s absolute latest prompt in the conversation. Match its language and script instantly and strictly. If the user\'s latest message is in English, your response must be 100% in English (even for short words like "Ok", "Yes", "Fine"). If the user\'s latest message is in Hindi or Hinglish, reply in Hindi/Hinglish. Never let older conversation history override the language of the user\'s current message.\n' +
      '3. For all other queries, jump straight into answering the user\'s request directly without any self-introduction.'
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
