// api/gemini.js
const MODEL = 'gemini-flash-lite-latest';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY_1;
  if (!apiKey) {
    res.status(500).json({ error: { message: 'Server misconfigured: GEMINI_API_KEY missing' } });
    return;
  }

  const { contents, systemInstruction } = req.body || {};
  if (!contents) {
    res.status(400).json({ error: { message: 'Missing "contents" in request body' } });
    return;
  }

  // Frontend se aaye hue systemInstruction ko hi pass karein
  const finalSystemInstruction = systemInstruction || {
    parts: [{
      text: `Current device time is requested. User location is Oman (GST, UTC+4). Respond using exact user local time.`
    }]
  };

  const upstreamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        contents, 
        systemInstruction: finalSystemInstruction 
      })
    });

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
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    res.status(502).json({ error: { message: 'Failed to reach Gemini API', detail: err.message } });
  }
}
