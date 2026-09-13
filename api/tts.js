// api/tts.js
// Vercel Serverless Function — Gemini TTS ko securely proxy karta hai.
// Frontend { text, voice } bhejta hai; yeh server par Gemini ke TTS
// model se asli audio (PCM) generate karke, use ek chalu WAV file mein
// wrap karke, base64 string ke roop mein wapas bhejta hai. API key
// kabhi bhi frontend ko nahi bheji jaati.

const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

function pcmToWav(pcmBuffer, sampleRate, numChannels, bitsPerSample) {
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);           // fmt chunk size
  header.writeUInt16LE(1, 20);            // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

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

  const { text, voice } = req.body || {};
  if (!text || !voice) {
    res.status(400).json({ error: { message: 'Missing "text" or "voice" in request body' } });
    return;
  }

  const upstreamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${apiKey}`;

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } }
          }
        }
      })
    });
  } catch (err) {
    res.status(502).json({ error: { message: 'Failed to reach Gemini TTS API', detail: err.message } });
    return;
  }

  if (!upstreamResponse.ok) {
    let detail = null;
    try { detail = await upstreamResponse.json(); } catch (_) {}
    res.status(upstreamResponse.status).json({
      error: { message: detail?.error?.message || `Gemini TTS error: ${upstreamResponse.status}` }
    });
    return;
  }

  let data;
  try {
    data = await upstreamResponse.json();
  } catch (err) {
    res.status(502).json({ error: { message: 'Invalid response from Gemini TTS API' } });
    return;
  }

  const part = data?.candidates?.[0]?.content?.parts?.[0];
  const inline = part?.inlineData || part?.inline_data;
  if (!inline?.data) {
    res.status(502).json({ error: { message: 'No audio returned by Gemini TTS API' } });
    return;
  }

  const mime = inline.mimeType || inline.mime_type || 'audio/L16;rate=24000';
  const rateMatch = /rate=(\d+)/.exec(mime);
  const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;

  const pcmBuffer = Buffer.from(inline.data, 'base64');
  const wavBuffer = pcmToWav(pcmBuffer, sampleRate, 1, 16);

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

