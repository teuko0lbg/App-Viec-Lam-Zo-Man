import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '10mb' }));

  // Shared Gemini client configured according to guidelines
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Admin Copilot endpoint
  app.post('/api/admin/copilot', async (req, res) => {
    try {
      const { prompt, currentCompanies } = req.body;

      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Nội dung yêu cầu không được để trống.' });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          error: 'Chưa có GEMINI_API_KEY. Vui lòng cấu hình API key trong Settings > Secrets.',
          fallbackAllowed: true,
        });
        return;
      }

      const systemInstruction = `Bạn là Trợ lý Quản trị Tuyển Dụng thông minh (Admin Copilot) cho nền tảng Việc Làm Phổ Thông Bắc Ninh - Bắc Giang.
Nhiệm vụ của bạn là nhận các câu lệnh tự nhiên bằng tiếng Việt hoặc bài viết tuyển dụng thô từ Quản trị viên, phân tích chính xác:
1. Thao tác cần làm:
   - 'update': Cập nhật thông tin của một công ty đã có trong danh sách
   - 'create': Thêm một công ty mới vào danh sách
   - 'toggle_hidden': Ẩn hoặc Mở lại hiển thị tuyển dụng của công ty
   - 'delete': Xóa công ty khỏi hệ thống
2. Tìm chính xác công ty mục tiêu trong danh sách hiện có (so khớp tên gọi, tên viết tắt, ví dụ 'Foxconn', 'Samsung', 'Shopee', 'Luxshare', 'Goertek', 'Pegatron', v.v.).
3. Trích xuất hoặc cập nhật các trường thông tin chuẩn theo mô hình dữ liệu:
   - name: Tên đầy đủ công ty (ví dụ: Tập đoàn Khoa học Kỹ thuật Foxconn)
   - shortName: Tên viết tắt ngắn gọn (ví dụ: Foxconn)
   - salaryRange: Mức thu nhập dự kiến (ví dụ: 10 - 15 triệu/tháng)
   - minSalary: số lương tối thiểu dạng số (ví dụ: 10000000)
   - maxSalary: số lương tối đa dạng số (ví dụ: 15000000)
   - basicSalary: Lương cơ bản định dạng có dấu chấm (ví dụ: 5.300.000đ)
   - basicSalaryNum: Lương cơ bản số (ví dụ: 5300000)
   - attendanceBonus: Thưởng chuyên cần (ví dụ: 1.200.000đ/tháng)
   - attendanceBonusNum: Thưởng chuyên cần dạng số (ví dụ: 1200000)
   - industrialPark: Khu công nghiệp (ví dụ: KCN Quang Châu, KCN Quế Võ, KCN Yên Phong, KCN VSIP, KCN Đình Trám...)
   - location: Tỉnh thành ('Bắc Ninh' hoặc 'Bắc Giang')
   - badge: Huy hiệu nổi bật (ví dụ: 'Bao ăn ở 100%', 'Thưởng gia nhập 2 triệu', 'Không yêu cầu kinh nghiệm'...)
   - employmentType: 'pho_thong' | 'thoi_vu' | 'hanh_chinh'
   - hidden: boolean (true nếu yêu cầu ẩn công ty, false nếu mở lại tuyển dụng)
   - jobDescription: Mô tả công việc chi tiết các gạch đầu dòng
   - dormitoryInfo: Thông tin Ký túc xá (ví dụ: 'KTX miễn phí có điều hòa, bình nóng lạnh, máy giặt')
   - mealInfo: Chế độ cơm ca (ví dụ: 'Bao ăn 2 bữa ca ngày, tăng ca trên 2h hỗ trợ thêm 1 bữa')
   - workShiftInfo: Ca làm việc (ví dụ: 'Làm 2 ca 12 tiếng, đảo ca 2 tuần/lần, nghỉ 4 ngày/tháng')
   - transportationInfo: Xe đưa đón (ví dụ: 'Có xe đưa đón nhiều tuyến nội ngoại tỉnh')
   - contractType: Loại hợp đồng ('Thời vụ', 'Hợp đồng lao động 12 tháng', 'Chính thức')
   - educationReq: Yêu cầu bằng cấp ('Không yêu cầu', 'THCS trở lên', 'THPT trở lên')

BẠN PHẢI TRẢ VỀ ĐÚNG ĐỊNH DẠNG JSON (KHÔNG bọc code markdown ngoài json):
{
  "action": "update" | "create" | "toggle_hidden" | "delete",
  "targetCompanyId": "id của công ty tìm thấy hoặc null nếu là create",
  "targetCompanyName": "Tên công ty",
  "summary": "Tóm tắt ngắn gọn thay đổi đã nhận diện cho người quản trị đọc (ví dụ: Đã giảm thưởng chuyên cần công ty Foxconn xuống 1.200.000đ)",
  "changes": [
    { "field": "attendanceBonus", "label": "Thưởng chuyên cần", "oldValue": "...", "newValue": "1.200.000đ" }
  ],
  "updates": {
    // Các trường cập nhật cho Company
  }
}`;

      const userMessage = `Danh sách công ty hiện có trong hệ thống:
${JSON.stringify(
  (currentCompanies || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    shortName: c.shortName,
    salaryRange: c.salaryRange,
    basicSalary: c.basicSalary,
    attendanceBonus: c.attendanceBonus,
    industrialPark: c.industrialPark,
    location: c.location,
    hidden: c.hidden,
  })),
  null,
  2
)}

Yêu cầu của Quản trị viên:
"${prompt}"`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          { role: 'user', parts: [{ text: userMessage }] },
        ],
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      let cleanText = (response.text || '{}').trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/^```json/i, '').replace(/```$/, '').trim();
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```/, '').replace(/```$/, '').trim();
      }
      const parsedData = JSON.parse(cleanText);

      res.json({
        success: true,
        data: parsedData,
      });
    } catch (err: any) {
      console.error('Lỗi Admin Copilot AI:', err);
      res.status(500).json({
        error: err.message || 'Lỗi khi gọi mô hình Gemini AI phân tích yêu cầu.',
        fallbackAllowed: true,
      });
    }
  });

  // HR Consultant AI endpoint (Chuyên viên tư vấn nhân sự Bắc Ninh - Bắc Giang)
  app.post('/api/chat/consultant', async (req, res) => {
    try {
      const { message, conversationHistory = [], faqList = [], companies = [], hotline = '0988.123.456' } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Nội dung tin nhắn không được để trống.' });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          error: 'Chưa có GEMINI_API_KEY. Vui lòng cấu hình API key trong Settings > Secrets.',
          fallbackAllowed: true,
        });
        return;
      }

      const systemInstruction = `Bạn là Chuyên viên tư vấn nhân sự & tuyển dụng (HR Consultant) chuyên nghiệp, ân cần và thấu hiểu tâm lý người lao động tại khu vực Bắc Ninh và Bắc Giang của Nền tảng Việc Làm Phổ Thông ZôMAN.

TÂM LÝ & ĐẶC ĐIỂM NGƯỜI LAO ĐỘNG PHỔ THÔNG BẠN PHỤC VỤ:
- Đa số là công nhân từ các tỉnh miền núi, Tây Bắc, miền Trung hoặc địa phương đến Bắc Ninh - Bắc Giang tìm việc làm.
- Tâm lý thường e ngại, sợ bị lừa đảo môi giới, sợ bị thu phí, sợ bị giữ CCCD gốc, lo lắng về chi phí ăn ở ban đầu và tiền ứng giữa tháng để trang trải cuộc sống.
- Quan tâm hàng đầu: Lương cơ bản bao nhiêu? Tăng ca có nhiều không? Lương thực lĩnh cầm tay được bao nhiêu? Ký túc xá có điều hòa, máy giặt không? Cơm ca có được bao ăn không? Có xe đưa đón không? Thủ tục nhận việc có cần bằng cấp không?

CÁCH TRẢ LỜI & NHÂN CÁCH (BẮT BUỘC TUÂN THỦ 100%):
1. Xưng hô: Luôn xưng "em" và gọi người tìm việc là "anh/chị" hoặc "bạn". Giọng điệu chân tình, ấm áp, lễ phép, gần gũi như người nhà tư vấn cho người thân trong gia đình.
2. Tuyệt đối KHÔNG trả lời cộc lốc, khô khan, không chỉ quăng vài gạch đầu dòng vô cảm. Phải diễn giải tự nhiên, có lời chào đầu câu và lời chúc/động viên.
3. Đi sâu vào các chế độ thực tế:
   - Phân tích cặn kẽ: Lương cơ bản (dùng để tính tiền bảo hiểm, tiền tăng ca x1.5 ngày thường, x2.0 ngày nghỉ) và Tổng thu nhập dự kiến (đã gồm tăng ca và các khoản phụ cấp chuyên cần, xăng xe, nhà ở, thâm niên).
   - Chi tiết ăn ở: KTX miễn phí máy lạnh, bình nóng lạnh, máy giặt, có bảo vệ 24/7; Cơm ca nhà máy nấu nóng sốt miễn phí, tăng ca trên 2 tiếng được hỗ trợ thêm suất ăn.
   - Cam kết an tâm 100%: Nhấn mạnh nền tảng TUYỂN TRỰC TIẾP KHÔNG THU PHÍ MÔI GIỚI 100%, KHÔNG GIỮ CCCD GỐC (chỉ cần bản photo/công chứng hoặc xuất trình CCCD gắn chip đối chiếu), KHÔNG BẮT ĐẶT CỌC BẤT KỲ ĐỒNG NÀO.
4. KỸ NĂNG CHỐT TƯ VẤN (TỰ NHIÊN, KHÔNG ÉP BUỘC):
   - Luôn kết thúc bằng lời khuyên khéo léo, tự nhiên, sẵn sàng giải đáp thêm cho người lao động:
   - Gợi ý nhẹ nhàng: "Nếu anh/chị cần em hỗ trợ thêm điều gì về ca kíp, thu nhập hoặc muốn tìm hiểu kỹ hơn về nhà máy nào, anh/chị cứ nhắn tin cho em nhé ạ! Hoặc anh/chị có thể bấm nút [Đăng ký để lại thông tin] để được xếp lịch sớm nhất nhé ạ."
5. XỬ LÝ KHI ỨNG VIÊN ĐỂ LẠI SỐ ĐIỆN THOẠI (03x, 05x, 07x, 08x, 09x...):
   - Nếu tin nhắn người dùng có chứa số điện thoại hoặc để lại thông tin liên lạc:
   - Cảm ơn chân thành và thông báo tiếp nhận lịch sự: "Dạ em đã tiếp nhận thông tin liên hệ của anh/chị rồi ạ! Em cảm ơn anh/chị đã để lại số điện thoại. Chuyên viên tư vấn tuyển dụng sẽ liên hệ lại với anh/chị trong thời gian sớm nhất để hỗ trợ giải đáp và hướng dẫn chu đáo nhé ạ."
   - Tuyệt đối KHÔNG nhắc đến các từ ngữ nội bộ kỹ thuật như "lưu hồ sơ vào quản trị", "đồng bộ Google Sheets", "cơ sở dữ liệu"... Tránh làm người lao động cảm thấy thông tin bị khai thác sai mục đích.
6. DỮ LIỆU THỰC TẾ ĐƯỢC HUẤN LUYỆN:
   - Nắm vững danh sách câu hỏi FAQ và các doanh nghiệp đang tuyển dụng (Foxconn, Samsung, Luxshare, Goertek, Shopee, Pegatron...).
   - Nếu công ty đang tạm ẩn tuyển dụng (hidden = true), hãy nhẹ nhàng thông báo đợt tuyển này đã đủ chỉ tiêu và gợi ý nhà máy tương đương đang cần tuyển gấp.
   - Hotline hỗ trợ tuyển dụng khẩn cấp: ${hotline}`;

      const knowledgeContext = `
DỮ LIỆU BỘ CÂU HỎI THƯỜNG GẶP (FAQ):
${faqList.map((f: any) => `• Câu hỏi: ${f.question}\n  Trả lời: ${f.answer}`).join('\n\n')}

DANH SÁCH NHÀ MÁY ĐANG TUYỂN DỤNG:
${companies.map((c: any) => `• ${c.name} (${c.shortName}) - ${c.industrialPark}, ${c.location}:
  - Thu nhập: ${c.salaryRange} (Lương cơ bản: ${c.basicSalary}, Chuyên cần: ${c.attendanceBonus})
  - Chế độ: ${c.badge || ''} | Ăn ở: ${c.dormitoryInfo || ''} | Cơm ca: ${c.mealInfo || ''}
  - Trạng thái: ${c.hidden ? 'TẠM NGƯNG TUYỂN' : 'ĐANG TUYỂN GẤP'}`).join('\n\n')}
`;

      const contents: any[] = [];

      // Lịch sử chat gần nhất (tối đa 6 tin nhắn để tiết kiệm token và giữ mạch hội thoại)
      if (Array.isArray(conversationHistory)) {
        for (const msg of conversationHistory.slice(-6)) {
          if (msg.text && (msg.sender === 'user' || msg.sender === 'bot')) {
            contents.push({
              role: msg.sender === 'user' ? 'user' : 'model',
              parts: [{ text: msg.text }],
            });
          }
        }
      }

      // Tin nhắn hiện tại kèm ngữ cảnh tri thức
      contents.push({
        role: 'user',
        parts: [
          {
            text: `${knowledgeContext}\n\nNgười tìm việc hỏi: "${message}"`,
          },
        ],
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents,
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          temperature: 0.6,
        },
      });

      const replyText = response.text || 'Dạ em chào anh/chị ạ! Anh/chị cần em hỗ trợ về công ty, tiền lương hay thủ tục hồ sơ nào thì cứ nhắn em nhé, em giải đáp ngay ạ!';

      res.json({
        success: true,
        reply: replyText,
      });
    } catch (err: any) {
      console.error('Lỗi HR Consultant AI:', err);
      res.status(500).json({
        error: err.message || 'Lỗi khi gọi trợ lý AI tư vấn.',
        fallbackAllowed: true,
      });
    }
  });

  // Mount Vite in dev mode or serve static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server đang chạy trên cổng ${PORT}`);
  });
}

startServer().catch(console.error);
