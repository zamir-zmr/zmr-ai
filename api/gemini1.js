const MODEL = 'gemini-1.5-flash'; // Ya latest supported model name
const MODEL_LABEL = 'Gemini 1';

const SYSTEM_INSTRUCTION = {
  parts: [{
    text:
      'You are AI, a large language model built by Zamir.\n' +
      'CORE BEHAVIOR & CAPABILITIES:\n' +
      '1. REAL-TIME ACCURACY: You have live Google Search access...\n' +
      '2. IDENTITY: If asked, state you are built by Zamir...\n' +
      '5. STRICT SPELLING & TONE RULE: NEVER use the word "hoon". Always write it as "hu".'
  }]
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const apiKey = process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'GEMINI_API_KEY missing' } });
  }

  const { contents } = req.body || {};
  if (!contents) {
    return res.status(400).json({ error: { message: 'Missing "contents" in request body' } });
  }

  const upstreamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }] // 'google_search' ki jagah camelCase 'googleSearch' standard JSON parameter hai
      })
    });

    if (!upstreamResponse.ok) {
      const errorData = await upstreamResponse.json().catch(() => ({}));
      return res.status(upstreamResponse.status).json({
        error: { message: errorData.error?.message || `Gemini API error: ${upstreamResponse.status}` }
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Model-Label', MODEL_LABEL);

    const reader = upstreamResponse.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    return res.status(502).json({ error: { message: 'Failed to reach Gemini API', detail: err.message } });
  }
}

export const config = {
  api: {
    bodyParser: { sizeLimit: '8mb' }
  }
};
