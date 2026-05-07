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

    const prompt = `أنت خبير زراعي. حلل صورة الليمون وأجب بـ JSON فقط بدون أي نص آخر أبداً.
المطلوب بالضبط:
{"status":"مريضة","disease":"اسم المرض","diseaseEn":"Disease name","confidence":90,"type":"مرض","symptoms":["عرض1","عرض2"],"recommendations":["توصية1","توصية2"],"severity":"متوسط","description":"وصف الحالة"}`;

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
            maxOutputTokens: 1000
          }
        })
      }
    );

    const rawText = await geminiRes.text();
    let geminiData;
    try {
      geminiData = JSON.parse(rawText);
    } catch (err) {
      return res.status(500).json({ error: 'Gemini response error' });
    }

    if (geminiData.error) {
      return res.status(400).json({ error: 'Gemini Error: ' + geminiData.error.message });
    }

    // جمع كل النصوص وتجاهل thought
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    let text = parts
      .filter(p => p.text && !p.thought)
      .map(p => p.text)
      .join('');

    if (!text) {
      return res.status(500).json({ error: 'No response from Gemini' });
    }

    // تنظيف وإيجاد JSON
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(500).json({ error: 'No JSON found', raw: text.substring(0, 300) });
    }

    let result;
    try {
      result = JSON.parse(match[0]);
    } catch (e) {
      return res.status(500).json({ error: 'Invalid JSON', raw: match[0].substring(0, 300) });
    }

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: 'Server Error: ' + err.message });
  }
};
