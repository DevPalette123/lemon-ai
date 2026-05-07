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
Reply with ONLY this JSON, no other text:
{"status":"مريضة","disease":"name","diseaseEn":"name","confidence":90,"type":"مرض","symptoms":["s1","s2"],"recommendations":["r1","r2"],"severity":"متوسط","description":"desc"}`;

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
      return res.status(500).json({ error: 'Gemini parse error', raw: rawText.substring(0, 300) });
    }

    if (geminiData.error) {
      return res.status(400).json({ error: 'Gemini Error: ' + geminiData.error.message });
    }

    // جمع كل النصوص بدون أي فلترة
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    
    // إذا لا يوجد parts أرجع البيانات الخام للتشخيص
    if (!parts.length) {
      return res.status(500).json({ 
        error: 'No parts', 
        candidate: JSON.stringify(geminiData.candidates?.[0]).substring(0, 300)
      });
    }

    let text = parts.map(p => p.text || '').join('');

    if (!text.trim()) {
      return res.status(500).json({ 
        error: 'Empty text', 
        parts_info: parts.map(p => ({ keys: Object.keys(p), textLen: (p.text||'').length }))
      });
    }

    // تنظيف وإيجاد JSON
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');

    if (start === -1 || end === -1) {
      return res.status(500).json({ error: 'No JSON braces found', raw: text.substring(0, 400) });
    }

    let result;
    try {
      result = JSON.parse(text.substring(start, end + 1));
    } catch (e) {
      return res.status(500).json({ 
        error: 'JSON parse failed', 
        raw: text.substring(start, start + 400)
      });
    }

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: 'Server Error: ' + err.message });
  }
};
