import { GoogleGenAI, Type } from '@google/genai';

export default async function handler(req, res) {
  // Chỉ cho phép phương thức POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Phương thức không được hỗ trợ (Method Not Allowed)' });
  }

  try {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Không tìm thấy dữ liệu hình ảnh.' });
    }

    // Đọc API Key an toàn từ biến môi trường của Vercel
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Cấu hình Server thiếu GEMINI_API_KEY.' });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Tách phần tiền tố data:image/...;base64, nếu có
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const promptText = `
    Bạn là một chuyên gia xử lý ngôn ngữ tiếng Nhật. Hãy quét và đọc toàn bộ văn bản tiếng Nhật trong hình ảnh này.
    
    Yêu cầu trả về kết quả theo định dạng JSON với 2 phần:
    1. "annotatedHtml": Đoạn văn bản tiếng Nhật nguyên bản đã được bọc hoàn toàn bằng các thẻ HTML <ruby> chuẩn để hiển thị Furigana (chữ Kana nhỏ trên đầu Kanji).
       Ví dụ: <p><ruby>私<rt>わたし</rt></ruby>は<ruby>日<rt>に</rt>本<rt>ほん</rt>語<rt>ご</rt></ruby>を<ruby>勉<rt>べん</rt>強<rt>きょう</rt></ruby>します。</p>
    2. "vocabulary": Mảng danh sách các từ vựng xuất hiện trong bài (mỗi từ gồm các trường: word, reading, type, meaning bằng tiếng Việt).
    `;

    // Gọi mô hình gemini-2.5-flash với Structured Outputs (JSON Schema)
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            mimeType: mimeType || 'image/jpeg',
            data: cleanBase64,
          },
        },
        { text: promptText },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            annotatedHtml: {
              type: Type.STRING,
              description: 'Đoạn văn bản HTML chứa các thẻ <ruby> kèm Furigana',
            },
            vocabulary: {
              type: Type.ARRAY,
              description: 'Danh sách các từ vựng nổi bật trong văn bản',
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING, description: 'Từ vựng tiếng Nhật (Ví dụ: 漢字)' },
                  reading: { type: Type.STRING, description: 'Cách đọc Furigana/Hiragana (Ví dụ: かんじ)' },
                  type: { type: Type.STRING, description: 'Loại từ bằng tiếng Việt (Ví dụ: Danh từ, Động từ)' },
                  meaning: { type: Type.STRING, description: 'Nghĩa tiếng Việt (Ví dụ: Chữ Hán)' },
                },
                required: ['word', 'reading', 'type', 'meaning'],
              },
            },
          },
          required: ['annotatedHtml', 'vocabulary'],
        },
      },
    });

    const result = JSON.parse(response.text);
    return res.status(200).json(result);

  } catch (error) {
    console.error('Lỗi khi xử lý ảnh với Gemini:', error);
    return res.status(500).json({ 
      error: 'Không thể nhận diện văn bản hoặc có lỗi kết nối đến Gemini AI.',
      details: error.message 
    });
  }
}