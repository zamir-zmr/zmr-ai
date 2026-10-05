// api/gemini2.js
const MODEL = process.env.GEMINI_MODEL_2 || 'gemini-flash-lite-latest';

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

function buildSystemText(clientTime, profile, participants) {
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

  const who = (profile === 'Rahima') ? 'Rahima' : 'Zamir';
  const whoRel = (who === 'Rahima') ? 'wife' : 'husband';
  const otherName = (who === 'Rahima') ? 'Zamir' : 'Rahima';
  const otherRel = (who === 'Rahima') ? 'husband' : 'wife';

  const STAT = { online: 'online right now', typing: 'online and typing a message right now', offline: 'currently offline' };
  const pOther = (participants && typeof participants === 'object' && participants.otherUser === otherName) ? participants : null;
  const participantLine = pOther
    ? `Live status: ${otherName} is ${STAT[pOther.otherStatus] || STAT.offline}. ${who} is the one messaging you now.`
    : `${who} is the one messaging you now.`;

  return [
    `Current user local time: ${local || 'unknown'} (timezone: ${zone}). When asked for the time or date, answer using exactly this local time.`,
    'User location is Oman (GST, UTC+4) unless the device timezone above says otherwise.',
    '',
    'Family details you must remember:',
    '- This app is shared by two people: Zamir (husband) and Rahima (wife). Their daughter is Zaina Praveen.',
    '',
    `ACTIVE USER RIGHT NOW: ${who} (the ${whoRel}). The newest message was written by ${who}, not ${otherName}.`,
    'CONVERSATION FORMAT: every user turn in the history starts with a tag like "[Zamir]:" or "[Rahima]:" that shows who wrote it. Turns from the model role are your own earlier replies. Never write these tags in your own replies.',
    'Always attribute messages to the right person. If an earlier message was written by the other person, refer to it as theirs (for example "Rahima said..."), never as the active user\'s words.',
    'REPLIES: a line like [Rahima is replying to the AI\'s earlier message: "..."] means that person is responding to exactly that quoted text. Read the quoted text, use it as the context for what they wrote, and answer accordingly. If the quoted message was written by the other person, understand that the active user is responding to that person\'s words.',
    'Use the whole conversation history for context and stay consistent with it.',
    'MULTI-USER RULES: only Zamir and Rahima are authorized users of this chat. Both can write in the same conversation at any time. Always know who is speaking from the [Name]: tag of the newest turn.',
    'If a turn contains [INTERRUPTION: ...], the active user wrote while you had not yet answered the other person. Acknowledge that you were in the middle of helping the other person, answer the active user directly by name, and keep the other person\'s pending request in mind so it is not lost.',
    'If a turn contains [CONTEXT SWITCH: ...], the active user has stepped into a conversation you were having with the other person. Recognise this immediately, use the earlier conversation as context, and tailor your answer to the new speaker. Never answer as if the new speaker wrote the earlier messages, and never attribute their words to the other person.',
    'When the active user replies to something you said to the other person, make clear (briefly, naturally) that you understand it was said to the other person, then answer the active user.',
    participantLine,
    '',
    `If ${who} asks for something romantic (e.g. shayari, a love note, a message) without naming who it is for, assume it is for ${otherName} (${who}'s ${otherRel}) unless ${who} says otherwise.`,
    `Address ${who} naturally by name sometimes, and tailor tone/suggestions as if you know you're talking to ${who} specifically.`,
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

  const apiKey = process.env.GEMINI_API_KEY_2;
  if (!apiKey) {
    res.status(500).json({ error: { message: 'Server misconfigured: GEMINI_API_KEY_2 missing' } });
    return;
  }

  const { contents, systemInstruction, clientTime, profile } = req.body || {};
  if (!contents) {
    res.status(400).json({ error: { message: 'Missing "contents" in request body' } });
    return;
  }

  // Server-side system prompt (time + family birthdays), plus any frontend systemInstruction
  let systemText = buildSystemText(clientTime, (req.body || {}).profile, (req.body || {}).participants);
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
