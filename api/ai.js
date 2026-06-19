// Vercel Edge Function — Gemini AI proxy
// Keeps API key hidden on server

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured in Vercel environment variables' });
  }

  try {
    const { prompt, imageBase64, imageType } = req.body;
    if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

    // Build Gemini message parts
    const parts = [];

    // Add image if provided (photo-to-meal feature)
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: imageType || 'image/jpeg',
          data: imageBase64
        }
      });
    }

    parts.push({ text: prompt });

    const geminiBody = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      }
    };

    // gemini-2.5-flash with x-goog-api-key header (current API format May 2026)
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': API_KEY
        },
        body: JSON.stringify(geminiBody)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini error:', JSON.stringify(data));
      return res.status(response.status).json({
        error: data.error?.message || 'Gemini API error'
      });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
      return res.status(500).json({ error: 'Empty response from Gemini' });
    }

    res.json({ text });

  } catch (err) {
    console.error('AI proxy error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
