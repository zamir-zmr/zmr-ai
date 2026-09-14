// api/groqtts.js
// Vercel Serverless Function — Groq TTS (PlayAI) ko securely proxy karta hai.
// Frontend { text, voice } bhejta hai; yeh server par Groq ke TTS
// model se audio generate karke base64 string ke roop mein wapas
// bhejta hai. API key kabhi bhi frontend ko nahi bheji jaati.

const TTS_MODELS = ['canopylabs/orpheus-v1-english', 'playai-tts'];

async function callGroqTTS(apiKey, model, text, voice) {
  const upstreamResponse = await fetch('https://api.groq.com/openai/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      response_format: 'wav'
    })
  });
  return upstreamResponse;
}

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

  let upstreamResponse = null;
  let lastErrorDetail = null;
  let lastStatus = 502;

  for (const model of TTS_MODELS) {
    try {
      const resp = await callGroqTTS(apiKey, model, text, voice);
      if (resp.ok) {
        upstreamResponse = resp;
        break;
      }
      lastStatus = resp.status;
      try { lastErrorDetail = await resp.json(); } catch (_) { lastErrorDetail = null; }
    } catch (err) {
      res.status(502).json({ error: { message: 'Failed to reach Groq TTS API', detail: err.message } });
      return;
    }
  }

  if (!upstreamResponse) {
    res.status(lastStatus).json({
      error: { message: lastErrorDetail?.error?.message || `Groq TTS error: ${lastStatus}` }
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
