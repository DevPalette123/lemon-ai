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

    const prompt = `أنت خبير زراعي متخصص في أمراض الليمون العُماني. حلل هذه الصورة بدقة واكشف:
1. هل الشجرة سليمة أم مريضة؟
2. إذا مريضة: ما المرض أو نقص العنصر؟
3. الأعراض الظاهرة
4. التوصيات العلاجية

أجب فقط بـ JSON صالح بدون أي نص خارجه ولا backticks:
{"status":"مريضة أو سليمة","disease":"اسم المرض بالعربي أو null","diseaseEn":"Disease name or null","confidence":0-100,"type":"مرض أو نقص عنصر أو سليمة","symptoms":["عرض1","عرض2","عرض3"],"recommendations":["توصية1","توصية2","توصية3"],"severity":"خفيف أو متوسط أو شديد أو null","description":"جملة واحدة تصف الحالة"}`;

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
          generationConfig: { temperature: 0.1, maxOutputTokens: 1000 }
        })
      }
    );

    const rawText = await geminiRes.text();
    let geminiData;
    try {
      geminiData = JSON.parse(rawText);
    } catch (err) {
      return res.status(500).json({ error: 'Gemini returned invalid response', raw: rawText });
    }

    if (geminiData.error) {
      return res.status(400).json({ error: 'Gemini Error: ' + geminiData.error.message });
    }

    // gemini-2.5-flash يرجع parts متعددة بسبب Thinking mode
    // نأخذ فقط النص الحقيقي ونتجاهل thought
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const text = parts
      .filter(p => p.text && !p.thought)
      .map(p => p.text)
      .join('');

    if (!text) {
      return res.status(500).json({ error: 'No text returned from Gemini', raw: geminiData });
    }

    // تنظيف النص واستخراج JSON
    let clean = text.replace(/```json|```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) clean = jsonMatch[0];

    let result;
    try {
      result = JSON.parse(clean);
    } catch (e) {
      return res.status(500).json({
        error: 'Failed to parse JSON from Gemini',
        raw: clean
      });
    }

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: 'Server Error: ' + err.message });
  }
};
