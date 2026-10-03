// api/gemini3.js
const MODEL = 'gemini-flash-lite-latest';

// Family birthdays (month is 1-12)
const FAMILY_BIRTHDAYS = [
  { name: 'Zamir', rel: 'husband', relHi: 'pati', month: 3, day: 17, label: '17 March' },
  { name: 'Rahima', rel: 'wife', relHi: 'patni', month: 1, day: 1, label: '1 January' },
  { name: 'Zaina Praveen', rel: 'daughter', relHi: 'beti', month: 5, day: 24, label: '24 May' }
];

const DEFAULT_ZONE = 'Asia/Muscat'; // Oman (GST, UTC+4)

function safeZone(tz) {
  try {
    if (typeof tz !== 'string' || !tz) return DEFAULT_ZONE;
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch (_) {
    return DEFAULT_ZONE;
  }
}

function todayParts(zone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
  return { y: get('year'), m: get('month'), d: get('day') };
}

function daysUntil(t, month, day) {
  const today = Date.UTC(t.y, t.m - 1, t.d);
  let next = Date.UTC(t.y, month - 1, day);
  if (next < today) next = Date.UTC(t.y + 1, month - 1, day);
  return Math.round((next - today) / 86400000);
}

function buildSystemText(clientTime) {
  const zone = safeZone(clientTime && clientTime.timeZone);
  const t = todayParts(zone);
  const local = clientTime && typeof clientTime.localString === 'string'
    ? clientTime.localString.slice(0, 120)
    : '';

  const statusLines = FAMILY_BIRTHDAYS.map((b) => {
    const dd = daysUntil(t, b.month, b.day);
    const when = dd === 0 ? 'TODAY is the birthday!' : dd === 1 ? 'tomorrow' : `${dd} days left`;
    return `- ${b.name} (${b.rel}/${b.relHi}) — ${b.label} — ${when}`;
  }).join('\n');

  return [
    `Current user local time: ${local || 'unknown'} (timezone: ${zone}). When asked for the time or date, answer using exactly this local time.`,
    'User location is Oman (GST, UTC+4) unless the device timezone above says otherwise.',
    '',
    'Family details you must remember:',
    '- The user is Zamir (husband). His wife is Rahima. Their daughter is Zaina Praveen.',
    '',
    `Family birthdays (today's date: ${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}):`,
    statusLines,
    '',
    'If asked about birthdays, ages or how many days are left, answer from the list above.',
    'If today is someone\'s birthday, wish them warmly in the user\'s language (Hinglish is fine).',
    'Do not mention birthdays unprompted unless a birthday is today or within the next 7 days and the user is just greeting or starting a chat.'
  ].join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY_3;
  if (!apiKey) {
    res.status(500).json({ error: { message: 'Server misconfigured: GEMINI_API_KEY_3 missing' } });
    return;
  }

  const { contents, systemInstruction, clientTime } = req.body || {};
  if (!contents) {
    res.status(400).json({ error: { message: 'Missing "contents" in request body' } });
    return;
  }

  // Server-side system prompt (time + family birthdays), plus any frontend systemInstruction
  let systemText = buildSystemText(clientTime);
  const extra = systemInstruction && Array.isArray(systemInstruction.parts)
    ? systemInstruction.parts.map((p) => (p && p.text) || '').filter(Boolean).join('\n')
    : '';
  if (extra) systemText += '\n\n' + extra;

  const finalSystemInstruction = { parts: [{ text: systemText }] };

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
    
