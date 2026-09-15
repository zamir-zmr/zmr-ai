export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }

  const apiKey = (process.env.DEEPGRAM_API_KEY || '').trim();
  if (!apiKey) {
    res.status(500).json({ error: { message: 'Server misconfigured: DEEPGRAM_API_KEY missing' } });
    return;
  }

  const { text, voice } = req.body || {};
  if (!text || !voice) {
    res.status(400).json({ error: { message: 'Missing "text" or "voice" in request body' } });
    return;
  }
  const model = String(voice).trim();

  const upstreamUrl = `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=mp3`;

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${apiKey}`
      },
      body: JSON.stringify({ text })
    });
  } catch (err) {
    res.status(502).json({ error: { message: 'Failed to reach Deepgram TTS API', detail: err.message } });
    return;
  }

  if (!upstreamResponse.ok) {
    let detail = null;
    try { detail = await upstreamResponse.json(); } catch (_) {}
    res.status(upstreamResponse.status).json({
      error: { message: detail?.err_msg || detail?.error?.message || `Deepgram TTS error: ${upstreamResponse.status}` }
    });
    return;
  }

  let audioBuffer;
  try {
    const arrayBuffer = await upstreamResponse.arrayBuffer();
    audioBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    res.status(502).json({ error: { message: 'Invalid response from Deepgram TTS API' } });
    return;
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    res.status(502).json({ error: { message: 'No audio returned by Deepgram TTS API' } });
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
