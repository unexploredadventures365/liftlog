// Vercel Edge Function — AI proxy
// Keeps API key hidden on server, forwards requests to Gemini

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers so the app can call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { prompt, imageBase64, imageType } = req.body;

    // Build Gemini message parts
    const parts = [];

    // Add image if provided (for photo-to-meal feature)
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: imageType || 'image/jpeg',
          data: imageBase64
        }
      });
    }

    // Add text prompt
    parts.push({ text: prompt });

    const geminiBody = {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      }
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Gemini API error' });
    }

    // Extract text from Gemini response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.json({ text });

  } catch (err) {
    console.error('AI proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
