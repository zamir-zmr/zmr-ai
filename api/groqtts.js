// api/groqtts.js
// Vercel Serverless Function — Groq TTS (PlayAI) ko securely proxy karta hai.
// Frontend { text, voice } bhejta hai; yeh server par Groq ke TTS
// model se audio generate karke base64 string ke roop mein wapas
// bhejta hai. API key kabhi bhi frontend ko nahi bheji jaati.

const TTS_MODEL = 'playai-tts';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: { message: 'Server misconfigured: GROQ_API_KEY missing' } });
    return;
  }

  const { text, voice } = req.body || {};
  if (!text || !voice) {
    res.status(400).json({ error: { message: 'Missing "text" or "voice" in request body' } });
    return;
  }

  const upstreamUrl = 'https://api.groq.com/openai/v1/audio/speech';

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: text,
        voice,
        response_format: 'wav'
      })
    });
  } catch (err) {
    res.status(502).json({ error: { message: 'Failed to reach Groq TTS API', detail: err.message } });
    return;
  }

  if (!upstreamResponse.ok) {
    let detail = null;
    try { detail = await upstreamResponse.json(); } catch (_) {}
    res.status(upstreamResponse.status).json({
      error: { message: detail?.error?.message || `Groq TTS error: ${upstreamResponse.status}` }
    });
    return;
  }

  let wavBuffer;
  try {
    const arrayBuffer = await upstreamResponse.arrayBuffer();
    wavBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    res.status(502).json({ error: { message: 'Invalid response from Groq TTS API' } });
    return;
  }

  if (!wavBuffer || wavBuffer.length === 0) {
    res.status(502).json({ error: { message: 'No audio returned by Groq TTS API' } });
    return;
  }

  res.status(200).json({
    audioContent: wavBuffer.toString('base64'),
    mimeType: 'audio/wav'
  });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb'
    }
  }
};
