export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: { message: 'GEMINI_API_KEY not set on server' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const model = 'gemini-flash-lite-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const body = await req.text();

  const geminiResponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });

  return new Response(geminiResponse.body, {
    status: geminiResponse.status,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }
  });
}