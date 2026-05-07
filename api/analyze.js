module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'لم يتم استلام الصورة' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'مفتاح API غير موجود' });

    const prompt = `You are an expert in Omani lemon diseases. Analyze this image.
Reply with ONLY a JSON object, no other text, no markdown, no backticks:
{"status":"مريضة","disease":"اسم المرض","diseaseEn":"Disease name","confidence":90,"type":"مرض","symptoms":["symptom1","symptom2"],"recommendations":["rec1","rec2"],"severity":"متوسط","description":"brief description"}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: 'image/jpeg', data: image } },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 800
          }
        })
      }
    );

    const rawText = await geminiRes.text();
    let geminiData;
    try {
      geminiData = JSON.parse(rawText);
    } catch (err) {
      return res.status(500).json({ error: 'Gemini parse error' });
    }

    if (geminiData.error) {
      return res.status(400).json({ error: 'Gemini Error: ' + geminiData.error.message });
    }

    // جمع كل النصوص
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    let text = parts.map(p => p.text || '').join('');

    if (!text) {
      return res.status(500).json({ error: 'No response from Gemini' });
    }

    // تنظيف
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    // إيجاد JSON الكامل — نبحث عن أكبر {} 
    let result = null;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    
    if (start !== -1 && end !== -1 && end > start) {
      try {
        result = JSON.parse(text.substring(start, end + 1));
      } catch (e) {
        return res.status(500).json({ 
          error: 'JSON parse failed', 
          raw: text.substring(start, Math.min(start + 300, end + 1))
        });
      }
    } else {
      return res.status(500).json({ error: 'No JSON found', raw: text.substring(0, 300) });
    }

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: 'Server Error: ' + err.message });
  }
};
