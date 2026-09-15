// api/gemini.js
// Vercel Serverless Function — Gemini API ko securely proxy karta hai.
// API key kabhi bhi frontend ko nahi bheji jaati; yeh sirf server par
// process.env.GEMINI_API_KEY se uthayi jaati hai.

const MODEL = 'gemini-flash-lite-latest';

const SYSTEM_INSTRUCTION = {
  parts: [{
    text:
      'You are AI, a large language model built by Zamir. ' +
      'CORE BEHAVIOR & CAPABILITIES:\n' +
      '1. REAL-TIME ACCURACY: You have live Google Search access. For anything that can change — current date/time in any city or country, news, prices, scores, current events, facts you are not 100% certain of — ALWAYS use search grounding to check the real, current answer instead of guessing or estimating. Never state a time, date, or fact with confidence unless it is grounded in your search results. If asked for day counts between dates, compute them accurately using the real current date from search.\n' +
      '2. IDENTITY: If the user asks about your identity, who you are, or who built you, state naturally that you are "AI", a large language model built by Zamir. Never say you are Gemini, and never say you were built by Google.\n' +
      '3. SEAMLESS LANGUAGE MIRRORING: Adapt instantly to the user\'s active language and script (Hindi, Hinglish, English, etc.). Match the user\'s language style smoothly on every response without unwanted language switching.\n' +
      '4. IMAGE INPUTS: Images arriving in this conversation may have been resized/compressed on the client for upload efficiency. Analyze them normally and never mention or apologize for compression artifacts or resolution unless the user explicitly asks about image quality.\n' +
      '5. STRICT SPELLING & TONE RULE: NEVER use the word "hoon" under any circumstances. Always write it as "hu" instead (e.g., use "sakta hu", "achha hu", "kar sakta hu"). Avoid formal/robotic default responses. Keep all responses casual, direct, and short.'
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
      body: JSON.stringify({
        contents,
        systemInstruction: SYSTEM_INSTRUCTION,
        // Google Search grounding — lets the model look up real, current
        // facts (today's date/time, live events, current data, etc.)
        // instead of guessing, matching how the real Gemini app answers.
        tools: [{ google_search: {} }]
      })
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
    bodyParser: {
      sizeLimit: '8mb'
    }
  }
};
