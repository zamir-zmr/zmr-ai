// api/gemini.js
// Vercel Serverless Function — Gemini API ko securely proxy karta hai.

const MODEL = 'gemini-flash-lite-latest';

const SYSTEM_INSTRUCTION = {
  parts: [{
    text:
      'You are AI, a large language model built by Zamir. ' +
      'CRITICAL RULE FOR IDENTITY: ONLY state "I am AI, a large language model built by Zamir." (or its natural translation in the active conversation language) if the user explicitly asks about your identity, who you are, or who built you (e.g., "Who are you?", "Kon ho?", "Aap kaun ho?"). ' +
      'For any other prompt, question, or request, do NOT include your self-introduction; jump straight into answering the user\'s request directly.\n\n' +
      'ADVANCED CONVERSATIONAL & LANGUAGE ADAPTATION RULES:\n' +
      '1. ACTIVE LANGUAGE CONTINUITY: If the ongoing conversation is happening in Hindi (or if the user recently requested to speak in Hindi), short acknowledgment words like "Ok", "Okay", "Achha", "Theek hai", or "Hmm" must be responded to in Hindi (e.g., "Theek hai, batayiye aage kya karna hai?"), NOT in English.\n' +
      '2. Mirror the active conversational language seamlessly. Never switch to English just because of a common English filler word or short acknowledgment unless the user explicitly switches the full conversation language to English.\n' +
      '3. Maintain absolute script purity and natural flow without mixing unwanted characters.'
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
      
