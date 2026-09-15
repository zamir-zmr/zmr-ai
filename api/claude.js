// api/claude.js
// Vercel Serverless Function — Anthropic Claude API ko securely proxy
// karta hai. Frontend { contents } bhejta hai (Gemini-shape: [{ role,
// parts:[{text}] }]); yeh server par usko Claude ke messages format
// mein convert karke Anthropic API ko call karta hai, aur stream ko
// wapas Gemini-shape SSE chunks (`candidates[0].content.parts[0].text`)
// mein re-emit karta hai — taaki frontend ka existing streaming parser
// (jo gemini.js ke liye bana hai) bina kisi badlav ke Claude ke liye
// bhi kaam kare. API key kabhi bhi frontend ko nahi bheji jaati.

const MODEL = 'claude-sonnet-5';

const SYSTEM_INSTRUCTION =
  'You are AI, a large language model built by Zamir. ' +
  'CORE BEHAVIOR & CAPABILITIES:\n' +
  '1. IDENTITY: If the user asks about your identity, who you are, or who built you, state naturally that you are "AI", a large language model built by Zamir. Never say you are Claude, and never say you were built by Anthropic.\n' +
  '2. SEAMLESS LANGUAGE MIRRORING: Adapt instantly to the user\'s active language and script (Hindi, Hinglish, English, etc.). Match the user\'s language style smoothly on every response without unwanted language switching.\n' +
  '3. STRICT SPELLING & TONE RULE: NEVER use the word "hoon" under any circumstances. Always write it as "hu" instead (e.g., use "sakta hu", "achha hu", "kar sakta hu"). Avoid formal/robotic default responses. Keep all responses casual, direct, and short.';

function toClaudeMessages(contents) {
  const messages = [];
  for (const c of contents || []) {
    const role = c.role === 'model' ? 'assistant' : 'user';
    const textParts = (c.parts || [])
      .filter(p => typeof p.text === 'string')
      .map(p => ({ type: 'text', text: p.text }));
    const imageParts = (c.parts || [])
      .filter(p => p.inlineData || p.inline_data)
      .map(p => {
        const inline = p.inlineData || p.inline_data;
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: inline.mimeType || inline.mime_type || 'image/jpeg',
            data: inline.data
          }
        };
      });
    const content = [...imageParts, ...textParts];
    if (content.length) messages.push({ role, content });
  }
  return messages;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    res.status(500).json({ error: { message: 'Server misconfigured: ANTHROPIC_API_KEY missing' } });
    return;
  }

  const { contents } = req.body || {};
  if (!contents) {
    res.status(400).json({ error: { message: 'Missing "contents" in request body' } });
    return;
  }

  const messages = toClaudeMessages(contents);

  let upstreamResponse;
  try {
    upstreamResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_INSTRUCTION,
        messages,
        stream: true
      })
    });
  } catch (err) {
    res.status(502).json({ error: { message: 'Failed to reach Claude API', detail: err.message } });
    return;
  }

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    let detail = null;
    try { detail = await upstreamResponse.json(); } catch (_) {}
    res.status(upstreamResponse.status).json({
      error: { message: detail?.error?.message || `Claude API error: ${upstreamResponse.status}` }
    });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const evt = JSON.parse(jsonStr);
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            const chunk = { candidates: [{ content: { parts: [{ text: evt.delta.text }] } }] };
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
        } catch (_) {
          // ignore malformed/partial lines
        }
      }
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
