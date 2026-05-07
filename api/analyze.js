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

    const prompt = `أنت خبير زراعي متخصص في أمراض الليمون العُماني.
حلل الصورة واكتب JSON فقط بدون أي كلام قبله أو بعده:
{"status":"مريضة","disease":"اسم المرض","diseaseEn":"Disease name","confidence":95,"type":"مرض","symptoms":["عرض1","عرض2"],"recommendations":["توصية1","توصية2"],"severity":"متوسط","description":"وصف الحالة"}

إذا الشجرة سليمة:
{"status":"سليمة","disease":null,"diseaseEn":null,"confidence":95,"type":"سليمة","symptoms":[],"recommendations":["استمر في العناية الجيدة"],"severity":null,"description":"الشجرة تبدو بصحة جيدة"}`;

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
            maxOutputTokens: 1000,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const rawText = await geminiRes.text();

    let geminiData;
    try {
      geminiData = JSON.parse(rawText);
    } catch (err) {
      return res.status(500).json({ error: 'Gemini returned invalid response' });
    }

    if (geminiData.error) {
      return res.status(400).json({ error: 'Gemini Error: ' + geminiData.error.message });
    }

    // gemini-2.5-flash له Thinking mode — نتجاهل thought ونأخذ النص فقط
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    let text = '';

    for (const part of parts) {
      if (part.text && !part.thought) {
        text += part.text;
      }
    }

    if (!text) {
      return res.status(500).json({ error: 'No text returned from Gemini' });
    }

    // تنظيف شامل
    let clean = text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    // استخراج أول JSON كامل
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      clean = jsonMatch[0];
    }

    let result;
    try {
      result = JSON.parse(clean);
    } catch (e) {
      // محاولة أخيرة — إصلاح JSON المكسور
      try {
        const fixed = clean
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/:\s*undefined/g, ': null');
        result = JSON.parse(fixed);
      } catch (e2) {
        return res.status(500).json({
          error: 'JSON parse failed',
          raw: clean.substring(0, 500)
        });
      }
    }

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: 'Server Error: ' + err.message });
  }
};
