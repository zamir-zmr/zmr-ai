// api/elevenlabs.js
// Vercel Serverless Function — ElevenLabs TTS ko securely proxy karta hai.
// Frontend { text, voice } bhejta hai (voice = ElevenLabs voice_id); yeh
// server par ElevenLabs se audio generate karke base64 string ke roop
// mein wapas bhejta hai. API key kabhi bhi frontend ko nahi bheji jaati.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }

  const apiKey = (process.env.ELEVENLABS_API_KEY || '').trim();
  if (!apiKey) {
    res.status(500).json({ error: { message: 'Server misconfigured: ELEVENLABS_API_KEY missing' } });
    return;
  }

  const { text, voice } = req.body || {};
  if (!text || !voice) {
    res.status(400).json({ error: { message: 'Missing "text" or "voice" in request body' } });
    return;
  }
  const voiceId = String(voice).trim();

  const upstreamUrl = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });
  } catch (err) {
    res.status(502).json({ error: { message: 'Failed to reach ElevenLabs API', detail: err.message } });
    return;
  }

  if (!upstreamResponse.ok) {
    let detail = null;
    try { detail = await upstreamResponse.json(); } catch (_) {}
    res.status(upstreamResponse.status).json({
      error: { message: detail?.detail?.message || detail?.error?.message || `ElevenLabs TTS error: ${upstreamResponse.status}` }
    });
    return;
  }

  let audioBuffer;
  try {
    const arrayBuffer = await upstreamResponse.arrayBuffer();
    audioBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    res.status(502).json({ error: { message: 'Invalid response from ElevenLabs API' } });
    return;
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    res.status(502).json({ error: { message: 'No audio returned by ElevenLabs API' } });
    return;
  }

  res.status(200).json({
    audioContent: audioBuffer.toString('base64'),
    mimeType: 'audio/mpeg'
  });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb'
    }
  }
};
