// api/gemini3.js
// Vercel Serverless Function — Gemini API ko securely proxy karta hai (Gemini 3).
// API key kabhi bhi frontend ko nahi bheji jaati; yeh sirf server par
// process.env se uthayi jaati hai.

const MODEL = 'gemini-3.1-flash-lite';
const MODEL_LABEL = 'Gemini 3';
const KEY_ENV_NAME = 'GEMINI_API_KEY_3';

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

function maskKey(k) {
  if (!k) return null;
  if (k.length <= 8) return '****';
  return k.slice(0, 4) + '...' + k.slice(-4);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }

  // Dedicated key ONLY — no silent fallback to shared GEMINI_API_KEY, kyunki
  // fallback hi is bug ki wajah tha (sab endpoints ek hi key reuse kar rahe
  // the jab dedicated var missing/misnamed thi, isliye sab me same quota
  // error aa raha tha).
  const apiKey = process.env[KEY_ENV_NAME];
  if (!apiKey) {
    res.status(500).json({
      error: { message: `Server misconfigured: ${KEY_ENV_NAME} missing in Vercel env vars (redeploy required after adding).` }
    });
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
      error: {
        message: detail?.error?.message || `Gemini API error: ${upstreamResponse.status}`,
        keyEnv: KEY_ENV_NAME,
        keyUsed: maskKey(apiKey)
      }
    });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Model-Label', MODEL_LABEL);
  res.setHeader('X-Key-Env', KEY_ENV_NAME);
  res.setHeader('X-Key-Used', maskKey(apiKey));

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
