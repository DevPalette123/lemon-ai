export default async function handler(req, res) {
  // =========================
  // CORS
  // =========================
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'لم يتم استلام الصورة' });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'مفتاح API غير موجود في Vercel' });
    }

    // =========================
    // Prompt
    // =========================
    const prompt = `
أنت خبير زراعي متخصص في أمراض الليمون العُماني.

حلل الصورة وأجب بدقة عن:
- حالة الشجرة
- المرض أو نقص العناصر
- الأعراض
- التوصيات

⚠️ أجب فقط بـ JSON بدون أي نص إضافي:

{
"status":"سليمة أو مريضة",
"disease":"اسم المرض أو null",
"diseaseEn":"English name or null",
"confidence":0-100,
"type":"مرض أو نقص عنصر أو سليمة",
"symptoms":["عرض1","عرض2"],
"recommendations":["توصية1","توصية2"],
"severity":"خفيف أو متوسط أو شديد أو null",
"description":"وصف مختصر"
}
`;

    // =========================
    // Gemini Request
    // =========================
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: image
                }
              },
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

    // =========================
    // SAFE RESPONSE HANDLING
    // =========================
    const rawText = await geminiRes.text();

    let geminiData;
    try {
      geminiData = JSON.parse(rawText);
    } catch (err) {
      return res.status(500).json({
        error: 'Gemini returned invalid response',
        raw: rawText
      });
    }

    // =========================
    // Gemini Error Check
    // =========================
    if (geminiData.error) {
      return res.status(400).json({
        error: 'Gemini Error: ' + geminiData.error.message
      });
    }

    // =========================
    // Extract AI Text
    // =========================
    const text =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      return res.status(500).json({
        error: 'No text returned from Gemini',
        raw: geminiData
      });
    }

    // =========================
    // Clean JSON
    // =========================
    const clean = text.replace(/```json|```/g, '').trim();

    let result;

    try {
      result = JSON.parse(clean);
    } catch (e) {
      return res.status(200).json({
        status: 'غير محدد',
        confidence: 60,
        description: clean,
        symptoms: [],
        recommendations: []
      });
    }

    // =========================
    // SUCCESS RESPONSE
    // =========================
    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({
      error: 'Server Error: ' + err.message
    });
  }
}
