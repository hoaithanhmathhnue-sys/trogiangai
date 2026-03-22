import { GoogleGenAI, Type, Schema } from "@google/genai";
import { LessonInput, LessonPlanResponse, SchoolLevel, AnalysisSummary, TeachingActivity, TeachingMethod, Game, Simulation, DocxModificationItem } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

const getSchoolLevelText = (level: SchoolLevel): string => {
  switch (level) {
    case 'primary': return 'Tiểu học';
    case 'secondary': return 'Trung học cơ sở (THCS)';
    case 'high': return 'Trung học phổ thông (THPT)';
    case 'vocational': return 'Trung cấp';
    case 'college': return 'Cao đẳng';
    case 'university': return 'Đại học';
    default: return 'Trung học cơ sở';
  }
};

const FALLBACK_MODELS = ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-flash'];

/** Tạo phần prompt chung mô tả thông tin lớp học */
const buildClassInfoPrompt = (input: LessonInput): string => {
  const allCompetencies = [...input.config.teachingFocus];
  if (input.config.customCompetency && input.config.customCompetency.trim() !== '') {
    allCompetencies.push(input.config.customCompetency);
  }
  return `
THÔNG TIN LỚP HỌC:
- Cấp học: ${getSchoolLevelText(input.config.schoolLevel)}
- Lớp: ${input.config.grade || 'Không xác định'}
- Môn học: ${input.config.subject}
- Quy mô: ${input.config.classSize}
- Thời lượng: ${input.config.timeConstraint} phút
- Thiết bị: ${JSON.stringify(input.config.resources)} ${input.config.customResource ? ', ' + input.config.customResource : ''}
- Công nghệ/Ứng dụng mong muốn: ${input.config.techApps || 'Tự đề xuất phù hợp'}
- Tích hợp liên môn: ${input.config.integration || 'Không yêu cầu'}
- Mục tiêu phát triển năng lực: ${allCompetencies.join(', ')}
- YÊU CẦU MÔ PHỎNG: ${input.config.simulationTopic || 'Tự đề xuất mô phỏng phù hợp'}
${input.config.useAI ? `
⭐ ỨNG DỤNG AI VÀO GIẢNG DẠY: CÓ
- PHẢI đề xuất phương pháp, trò chơi, hoạt động CÓ ỨNG DỤNG AI (ChatGPT, Gemini, Canva AI, Kahoot, Quizizz, NotebookLM...)
- Với MỖI phương pháp/trò chơi có ứng dụng AI, PHẢI kèm theo mục [HƯỚNG DẪN SỬ DỤNG AI] gồm:
  + Web/App cụ thể: URL hoặc tên ứng dụng (VD: https://chatgpt.com, https://gemini.google.com)
  + Prompt mẫu: Viết sẵn prompt cụ thể GV chỉ cần copy-paste
  + Các bước thực hiện: Bước 1, Bước 2... chi tiết từ đăng nhập đến lấy kết quả
  + Mẹo sử dụng: Tips để có kết quả tốt nhất
- Ví dụ format:
  [HƯỚNG DẪN SỬ DỤNG AI]
  Công cụ: Gemini (https://gemini.google.com)
  Prompt mẫu: "Hãy tạo 10 câu hỏi trắc nghiệm về [chủ đề] cho HS lớp [X], phân loại theo 4 cấp độ Bloom"
  Các bước: 1. Truy cập gemini.google.com > 2. Đăng nhập Google > 3. Dán prompt trên > 4. Chỉnh sửa kết quả > 5. Copy vào phiếu học tập
` : ''}
`;
};

/** Tạo các parts cho file đầu vào */
const buildInputParts = (input: LessonInput): any[] => {
  const parts: any[] = [];
  if (input.fileBase64 && input.mimeType) {
    const base64Data = input.fileBase64.split(',')[1] || input.fileBase64;
    parts.push({
      inlineData: { data: base64Data, mimeType: input.mimeType }
    });
  }
  if (input.docxText) {
    parts.push({
      text: `NỘI DUNG GIÁO ÁN (trích từ file DOCX):\n\n${input.docxText}`
    });
  }
  return parts;
};

/** Post-process: normalize LaTeX in all string fields of JSON response */
const normalizeLatexInStrings = (obj: any): any => {
  if (typeof obj === 'string') {
    let s = obj;
    // Fix double-backslash: \\vec → \vec
    s = s.replace(/\\\\(vec|frac|sqrt|int|sum|prod|lim|alpha|beta|gamma|delta|theta|pi|omega|infty|cdot|times|div|pm|mp|leq|geq|neq|approx|equiv|overline|underline|hat|bar|tilde|dot|text|mathrm|mathbf)/g, '\\$1');
    // Auto-wrap bare \command{...} not inside $...$
    s = s.replace(/(?<!\$)(\\(?:vec|frac|sqrt|overline|underline|hat|bar|tilde|dot|mathrm|mathbf)\{[^}]*\}(?:\{[^}]*\})?)/g, '\$$1\$');
    return s;
  }
  if (Array.isArray(obj)) return obj.map(normalizeLatexInStrings);
  if (obj && typeof obj === 'object') {
    const out: any = {};
    for (const k of Object.keys(obj)) out[k] = normalizeLatexInStrings(obj[k]);
    return out;
  }
  return obj;
};

/** Gọi API Gemini với fallback models */
const callGemini = async <T>(
  apiKey: string, 
  model: string, 
  parts: any[], 
  schema: Schema | null, 
  systemInstruction: string,
  label: string
): Promise<T> => {
  const ai = new GoogleGenAI({ apiKey });
  const modelsToTry = [model, ...FALLBACK_MODELS.filter(m => m !== model)];
  let lastError: any = null;

  for (const currentModel of modelsToTry) {
    try {
      console.log(`[${label}] Trying model: ${currentModel}`);
      const config: any = {
        systemInstruction,
        temperature: 0.5,
      };
      if (schema) {
        config.responseMimeType = "application/json";
        config.responseSchema = schema;
      }
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: { parts },
        config
      });
      if (response.text) {
        if (schema) {
          try {
            return normalizeLatexInStrings(JSON.parse(response.text)) as T;
          } catch {
            const cleanText = response.text.replace(/[\u0000-\u001F]+/g, "");
            return normalizeLatexInStrings(JSON.parse(cleanText)) as T;
          }
        } else {
          // Trả về text (HTML)
          let html = response.text.trim();
          if (html.startsWith('```html')) html = html.replace(/^```html\s*/, '').replace(/```\s*$/, '');
          else if (html.startsWith('```')) html = html.replace(/^```\s*/, '').replace(/```\s*$/, '');
          return html as unknown as T;
        }
      }
      throw new Error("AI trả về phản hồi rỗng.");
    } catch (error: any) {
      console.error(`[${label}] Model ${currentModel} failed:`, error);
      lastError = error;
    }
  }
  if (lastError?.message?.includes("429")) {
    throw new Error("429 RESOURCE_EXHAUSTED: Hệ thống đang quá tải, vui lòng thử lại sau hoặc đổi API Key.");
  }
  throw lastError || new Error(`Không thể hoàn thành ${label} sau khi thử tất cả các model.`);
};

// ============================================
// BƯỚC 1: TẠO TỔNG QUAN
// ============================================
const summarySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    subject: { type: Type.STRING },
    topic: { type: Type.STRING },
    weakness: { type: Type.STRING },
    proposal: { type: Type.STRING },
  },
  required: ["subject", "topic", "weakness", "proposal"],
};

export const generateStepSummary = async (input: LessonInput, apiKey: string, model: string): Promise<AnalysisSummary> => {
  const parts = [
    ...buildInputParts(input),
    { text: buildClassInfoPrompt(input) + `
YÊU CẦU: Phân tích nội dung giáo án và trả về:
- subject: Môn học
- topic: Chủ đề/Tên bài
- weakness: Điểm yếu, hạn chế cần cải thiện (chi tiết)
- proposal: Giải pháp đề xuất cải tiến (chi tiết)
TUYỆT ĐỐI CHÚ Ý: Các công thức Toán PHẢI dùng LaTeX ($...$).
` }
  ];
  return callGemini<AnalysisSummary>(apiKey, model, parts, summarySchema, SYSTEM_INSTRUCTION, 'Summary');
};

// ============================================
// BƯỚC 2: TẠO TIẾN TRÌNH DẠY HỌC
// ============================================
const teachingProcessSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    teachingProcess: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          activityName: { type: Type.STRING },
          objective: { type: Type.STRING },
          content: { type: Type.STRING },
          expectedProduct: { type: Type.STRING },
          implementation: { type: Type.STRING },
          conclusion: { type: Type.STRING },
        },
        required: ["activityName", "objective", "content", "expectedProduct", "implementation", "conclusion"],
      },
    },
  },
  required: ["teachingProcess"],
};

export const generateStepTeachingProcess = async (
  input: LessonInput, summary: AnalysisSummary, apiKey: string, model: string
): Promise<TeachingActivity[]> => {
  const parts = [
    ...buildInputParts(input),
    { text: buildClassInfoPrompt(input) + `
TỔNG QUAN ĐÃ PHÂN TÍCH:
- Môn: ${summary.subject}, Chủ đề: ${summary.topic}
- Điểm yếu: ${summary.weakness}
- Đề xuất: ${summary.proposal}

YÊU CẦU: Tạo "teachingProcess" gồm 4 hoạt động:
1. Khởi động (5-7 phút): Tạo hứng thú, kích hoạt kiến thức nền
2. Hình thành kiến thức (15-20 phút): HS khám phá kiến thức mới
3. Luyện tập (10-12 phút): Củng cố, vận dụng
4. Vận dụng (5-8 phút): Liên hệ thực tế
Mỗi hoạt động PHẢI có: activityName, objective, content, expectedProduct, implementation, conclusion.
Công thức Toán PHẢI dùng LaTeX với dấu dollar: ví dụ $\\vec{AB}$, $\\frac{a}{b}$, $\\sqrt{x}$. KHÔNG viết \\vec{AB} mà PHẢI là $\\vec{AB}$.
` }
  ];
  const result = await callGemini<{teachingProcess: TeachingActivity[]}>(
    apiKey, model, parts, teachingProcessSchema, SYSTEM_INSTRUCTION, 'TeachingProcess'
  );
  return result.teachingProcess;
};

// ============================================
// BƯỚC 3: TẠO PHƯƠNG PHÁP DẠY HỌC
// ============================================
const methodsSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    methods: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          steps: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["name", "description", "steps"],
      },
    },
  },
  required: ["methods"],
};

export const generateStepMethods = async (
  input: LessonInput, summary: AnalysisSummary, apiKey: string, model: string
): Promise<TeachingMethod[]> => {
  const parts = [
    ...buildInputParts(input),
    { text: buildClassInfoPrompt(input) + `
TỔNG QUAN: Môn ${summary.subject}, Chủ đề "${summary.topic}".
Điểm yếu: ${summary.weakness}. Đề xuất: ${summary.proposal}.

YÊU CẦU: Đề xuất 2-3 phương pháp dạy học tích cực PHÙ HỢP NHẤT.
Sử dụng database phương pháp (Think-Pair-Share, Jigsaw, Gallery Walk, 5E...) từ System Instruction.
Mỗi phương pháp: name, description, steps (cụ thể cho bài học này).
Công thức Toán PHẢI dùng LaTeX với dấu dollar: ví dụ $\\vec{AB}$, $\\frac{a}{b}$. TUYỆT ĐỐI phải bọc trong $...$.
` }
  ];
  const result = await callGemini<{methods: TeachingMethod[]}>(
    apiKey, model, parts, methodsSchema, SYSTEM_INSTRUCTION, 'Methods'
  );
  return result.methods;
};

// ============================================
// BƯỚC 4: TẠO TRÒ CHƠI
// ============================================
const gamesSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    games: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          duration: { type: Type.STRING },
          type: { type: Type.STRING },
          objective: { type: Type.STRING },
          steps: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["name", "duration", "type", "objective", "steps"],
      },
    },
  },
  required: ["games"],
};

export const generateStepGames = async (
  input: LessonInput, summary: AnalysisSummary, apiKey: string, model: string
): Promise<Game[]> => {
  const parts = [
    ...buildInputParts(input),
    { text: buildClassInfoPrompt(input) + `
TỔNG QUAN: Môn ${summary.subject}, Chủ đề "${summary.topic}".

YÊU CẦU: Tạo 2-3 trò chơi giáo dục phù hợp lứa tuổi.
Mỗi trò chơi: name, duration, type, objective, steps (chi tiết, cụ thể).
Trò chơi phải liên quan trực tiếp đến nội dung bài học.
Công thức Toán PHẢI dùng LaTeX với dấu dollar: ví dụ $\\vec{AB}$, $\\frac{a}{b}$. TUYỆT ĐỐI phải bọc trong $...$.
` }
  ];
  const result = await callGemini<{games: Game[]}>(
    apiKey, model, parts, gamesSchema, SYSTEM_INSTRUCTION, 'Games'
  );
  return result.games;
};

// ============================================
// BƯỚC 5: TẠO MÔ PHỎNG (theo style trolytaomophong)
// ============================================

const SIMULATION_SYSTEM_PROMPT = `
Bạn là chuyên gia lập trình web giáo dục và thiết kế bài giảng STEM.
Nhiệm vụ: Tạo nội dung giáo dục gồm 3 phần: Code HTML mô phỏng, Câu hỏi thực hành, Hướng dẫn sử dụng.
Output Format: Bắt buộc sử dụng các separator sau để phân chia nội dung:
|||HTML_START|||
[Code HTML tại đây]
|||HTML_END|||
|||QUESTIONS_START|||
[Câu hỏi thực hành tại đây]
|||QUESTIONS_END|||
|||GUIDE_START|||
[Hướng dẫn sử dụng tại đây]
|||GUIDE_END|||
`;

/** Parse AI response theo delimiters */
const parseSimulationResponse = (text: string, topic: string): Simulation => {
  const htmlMatch = text.match(/\|\|\|HTML_START\|\|\|([\s\S]*?)\|\|\|HTML_END\|\|\|/);
  const questionsMatch = text.match(/\|\|\|QUESTIONS_START\|\|\|([\s\S]*?)\|\|\|QUESTIONS_END\|\|\|/);
  const guideMatch = text.match(/\|\|\|GUIDE_START\|\|\|([\s\S]*?)\|\|\|GUIDE_END\|\|\|/);

  let cleanHtml = htmlMatch ? htmlMatch[1].trim() : '';
  if (!cleanHtml) {
    // Fallback: tìm code block ```html
    const codeBlock = text.match(/```html\s*([\s\S]*?)```/);
    cleanHtml = codeBlock ? codeBlock[1] : '';
  }
  cleanHtml = cleanHtml.replace(/^```html\s*/, '').replace(/^```\s*/, '').replace(/```$/, '');

  if (!cleanHtml) {
    throw new Error('AI trả về dữ liệu không hợp lệ (Missing HTML code)');
  }

  return {
    title: `Mô phỏng: ${topic}`,
    description: `Mô phỏng tương tác HTML5 cho chủ đề "${topic}"`,
    code: cleanHtml,
    questions: questionsMatch ? questionsMatch[1].trim() : 'Không có câu hỏi được tạo.',
    guide: guideMatch ? guideMatch[1].trim() : 'Không có hướng dẫn được tạo.',
  };
};

export const generateStepSimulation = async (
  input: LessonInput, summary: AnalysisSummary, apiKey: string, model: string
): Promise<Simulation> => {
  const topic = input.config.simulationTopic || summary.topic;
  const parts = [
    ...buildInputParts(input),
    { text: `
YÊU CẦU TẠO MÔ PHỎNG KHOA HỌC

I. THÔNG TIN ĐẦU VÀO:
- Môn học: ${summary.subject}
- Chủ đề: ${topic}
- Cấp học: ${getSchoolLevelText(input.config.schoolLevel)}
- Lớp: ${input.config.grade || 'Không xác định'}
- Thời lượng: ${input.config.timeConstraint} phút
- Thiết bị: ${JSON.stringify(input.config.resources)} ${input.config.customResource ? ', ' + input.config.customResource : ''}

II. YÊU CẦU OUTPUT:
A. CODE MÔ PHỎNG HTML/CSS/JS
Viết code hoàn chỉnh (Single File) với yêu cầu:
- Giao diện đơn giản, hiện đại, có tiêu đề và nút Reset.
- Sử dụng Canvas/SVG để vẽ đồ họa tương tác.
- Slider/input/checkbox để điều chỉnh thông số.
- Hiển thị giá trị real-time (số + hình ảnh).
- Tất cả nhãn bằng tiếng Việt.
- Responsive: chạy tốt trên Chrome/Firefox/Edge, cả mobile.
- Đảm bảo tính chính xác khoa học.
- Mô phỏng PHẢI liên quan trực tiếp đến bài học "${topic}".
- Thêm animation/transition để trực quan hơn.

B. CÂU HỎI THỰC HÀNH (5-7 câu)
Theo cấu trúc:
- Câu 1-2: Quan sát hiện tượng (Cái gì thay đổi khi...?)
- Câu 3-4: Đo đạc và ghi chép (Điền bảng số liệu...)
- Câu 5-6: Phân tích mối quan hệ (Tỉ lệ thuận/nghịch...)
- Câu 7: Vận dụng thực tế

C. HƯỚNG DẪN SỬ DỤNG CHO GIÁO VIÊN
- Các bước mở và chạy mô phỏng
- Cách sử dụng trong tiết dạy
- Cách chia sẻ với học sinh
- Lưu ý kỹ thuật (internet, thiết bị...)

LƯU Ý QUAN TRỌNG: Hãy wrap các phần nội dung bằng các thẻ delimiter |||HTML_START|||, |||HTML_END|||, |||QUESTIONS_START|||, |||QUESTIONS_END|||, |||GUIDE_START|||, |||GUIDE_END||| để hệ thống có thể tách biệt chúng.
` }
  ];

  // Gọi API không dùng JSON schema (text-based response)
  const ai = new GoogleGenAI({ apiKey });
  const modelsToTry = [model, ...FALLBACK_MODELS.filter(m => m !== model)];
  let lastError: any = null;

  for (const currentModel of modelsToTry) {
    try {
      console.log(`[Simulation] Trying model: ${currentModel}`);
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: { parts },
        config: {
          systemInstruction: SIMULATION_SYSTEM_PROMPT,
          temperature: 0.5,
        }
      });
      const text = response.text || '';
      return parseSimulationResponse(text, topic);
    } catch (error: any) {
      console.error(`[Simulation] Model ${currentModel} failed:`, error);
      lastError = error;
    }
  }
  if (lastError?.message?.includes('429')) {
    throw new Error('429 RESOURCE_EXHAUSTED: Hệ thống đang quá tải, vui lòng thử lại sau hoặc đổi API Key.');
  }
  throw lastError || new Error('Không thể tạo mô phỏng sau khi thử tất cả các model.');
};

// ============================================
// BƯỚC 6: TẠO PHỤ LỤC (fullPlanHtml + docxModifications)
// ============================================
const appendixSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    fullPlanHtml: { type: Type.STRING },
    docxModifications: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          location: { type: Type.STRING },
          newContent: { type: Type.STRING },
          action: { type: Type.STRING },
        },
        required: ["location", "newContent", "action"],
      },
    },
  },
  required: ["fullPlanHtml"],
};

export const generateStepAppendix = async (
  input: LessonInput, summary: AnalysisSummary, methods: TeachingMethod[], apiKey: string, model: string
): Promise<{ fullPlanHtml: string; docxModifications?: DocxModificationItem[] }> => {
  const isDocxInput = !!input.docxText;
  const parts = [
    ...buildInputParts(input),
    { text: buildClassInfoPrompt(input) + `
TỔNG QUAN: Môn ${summary.subject}, Chủ đề "${summary.topic}".
Phương pháp: ${methods.map(m => m.name).join(', ')}

YÊU CẦU:
1. fullPlanHtml phải chứa danh sách các thẻ <div class="change-block type-add">...</div> hoặc <div class="change-block type-modify">...</div>.
2. Bên trong change-block: <h4 class="location">...</h4>, <div class="instruction">...</div>, <div class="content">...</div>.
3. Công thức Toán PHẢI dùng LaTeX với dấu dollar: $\\vec{AB}$, $\\frac{a}{b}$. TUYỆT ĐỐI bọc trong $...$.
${isDocxInput ? `
4. Tạo "docxModifications" chứa đề xuất chèn nội dung mới vào giáo án.
   - "location": Copy chính xác 1 đoạn text từ giáo án gốc (10-30 ký tự).
   - "newContent": Nội dung bổ sung chi tiết (sẽ bôi đỏ trong DOCX).
   - "action": "insert_after". Đề xuất ít nhất 5-10 modifications.` : ''}
` }
  ];
  return callGemini<{ fullPlanHtml: string; docxModifications?: DocxModificationItem[] }>(
    apiKey, model, parts, appendixSchema, SYSTEM_INSTRUCTION, 'Appendix'
  );
};

// ============================================
// HÀM CŨ GIỮ LẠI ĐỂ TƯƠNG THÍCH (sẽ không dùng nữa)
// ============================================
const lessonPlanSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.OBJECT,
      properties: {
        subject: { type: Type.STRING },
        topic: { type: Type.STRING },
        weakness: { type: Type.STRING },
        proposal: { type: Type.STRING },
      },
      required: ["subject", "topic", "weakness", "proposal"],
    },
    methods: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          steps: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["name", "description", "steps"],
      },
    },
    games: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          duration: { type: Type.STRING },
          type: { type: Type.STRING },
          objective: { type: Type.STRING },
          steps: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["name", "duration", "type", "objective", "steps"],
      },
    },
    simulation: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        code: { type: Type.STRING },
      },
      required: ["title", "description", "code"],
    },
    fullPlanHtml: { type: Type.STRING },
    teachingProcess: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          activityName: { type: Type.STRING },
          objective: { type: Type.STRING },
          content: { type: Type.STRING },
          expectedProduct: { type: Type.STRING },
          implementation: { type: Type.STRING },
          conclusion: { type: Type.STRING },
        },
        required: ["activityName", "objective", "content", "expectedProduct", "implementation", "conclusion"],
      },
    },
    docxModifications: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          location: { type: Type.STRING },
          newContent: { type: Type.STRING },
          action: { type: Type.STRING },
        },
        required: ["location", "newContent", "action"],
      },
    },
  },
  required: ["summary", "methods", "games", "fullPlanHtml", "teachingProcess"],
};

export const generateLessonPlan = async (input: LessonInput, apiKey: string, model: string): Promise<LessonPlanResponse> => {
  if (!apiKey) throw new Error("API Key not found");
  const ai = new GoogleGenAI({ apiKey });
  const parts: any[] = [];
  if (input.fileBase64 && input.mimeType) {
    const base64Data = input.fileBase64.split(',')[1] || input.fileBase64;
    parts.push({ inlineData: { data: base64Data, mimeType: input.mimeType } });
  }
  if (input.docxText) {
    parts.push({ text: `NỘI DUNG GIÁO ÁN (trích từ file DOCX):\n\n${input.docxText}` });
  }
  const allCompetencies = [...input.config.teachingFocus];
  if (input.config.customCompetency && input.config.customCompetency.trim() !== '') {
    allCompetencies.push(input.config.customCompetency);
  }
  const isDocxInput = !!input.docxText;
  const prompt = buildClassInfoPrompt(input) + `
YÊU CẦU:
1. Phân tích nội dung và đề xuất cải tiến.
2. fullPlanHtml phải chứa danh sách các thẻ <div class="change-block type-add">...</div>.
3. Công thức Toán PHẢI dùng LaTeX với dấu dollar: $\\vec{AB}$, $\\frac{a}{b}$. TUYỆT ĐỐI bọc trong $...$.
4. SIMULATION: Viết trọn vẹn 1 file HTML.
5. BẮT BUỘC tạo "teachingProcess" gồm 4 hoạt động.
6. Sử dụng database phương pháp dạy học.
${isDocxInput ? '7. Tạo "docxModifications" cho DOCX.' : ''}
`;
  parts.push({ text: prompt });
  const modelsToTry = [model, ...FALLBACK_MODELS.filter(m => m !== model)];
  let lastError: any = null;
  for (const currentModel of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: { parts },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: lessonPlanSchema,
          temperature: 0.5,
        }
      });
      if (response.text) {
        try { return JSON.parse(response.text) as LessonPlanResponse; }
        catch { return JSON.parse(response.text.replace(/[\u0000-\u001F]+/g, "")) as LessonPlanResponse; }
      }
      throw new Error("AI trả về phản hồi rỗng.");
    } catch (error: any) {
      lastError = error;
    }
  }
  if (lastError?.message?.includes("429")) {
    throw new Error("429 RESOURCE_EXHAUSTED: Hệ thống đang quá tải, vui lòng thử lại sau hoặc đổi API Key.");
  }
  throw lastError || new Error("Không thể tạo giáo án.");
};

/**
 * Tạo giáo án hoàn chỉnh (Pro) bằng cách tổng hợp tất cả dữ liệu đã phân tích.
 */
export const generateFullProLessonPlan = async (
  data: LessonPlanResponse,
  docxText: string | null,
  apiKey: string,
  model: string,
  fullPlanHtml?: string | null
): Promise<string> => {
  if (!apiKey) throw new Error("API Key not found");

  const methodsSummary = data.methods.map((m, i) =>
    `${i + 1}. **${m.name}**: ${m.description}\n   Các bước chi tiết: ${m.steps.join('; ')}`
  ).join('\n');

  const gamesSummary = data.games.map((g, i) =>
    `${i + 1}. **${g.name}** (Thời gian: ${g.duration}, Loại: ${g.type})\n   Mục tiêu: ${g.objective}\n   Các bước tổ chức: ${g.steps.join('; ')}`
  ).join('\n');

  const teachingProcessSummary = data.teachingProcess?.map((act, i) =>
    `=== Hoạt động ${i + 1}: ${act.activityName} ===\nMục tiêu: ${act.objective}\nNội dung chi tiết: ${act.content}\nSản phẩm dự kiến: ${act.expectedProduct}\nCách tổ chức thực hiện: ${act.implementation}\nKết luận/nhận định: ${act.conclusion}`
  ).join('\n\n') || 'Không có';

  const simulationSummary = data.simulation
    ? `Tên: ${data.simulation.title}\nMô tả: ${data.simulation.description}\nCâu hỏi gợi ý: ${data.simulation.questions || 'Không có'}\nHướng dẫn sử dụng: ${data.simulation.guide || 'Không có'}`
    : 'Không có mô phỏng';

  const appendixSummary = fullPlanHtml
    ? `=== NỘI DUNG PHỤ LỤC (HTML) ===\n${fullPlanHtml.substring(0, 8000)}`
    : 'Không có phụ lục';

  const prompt = `
BẠN LÀ CHUYÊN GIA THIẾT KẾ GIÁO ÁN CẤP CAO. NHIỆM VỤ: HOÀN THIỆN GIÁO ÁN dạng HTML — giữ đúng định dạng gốc, chỉ cải thiện nội dung.

🔒 QUY TẮC QUAN TRỌNG NHẤT — GIỮ ĐÚNG ĐỊNH DẠNG GỐC:
- PHẢI giữ NGUYÊN 100% cấu trúc đầu mục lớn/nhỏ của giáo án gốc (I. Mục tiêu, II. Thiết bị, III. Tiến trình...)
- PHẢI giữ NGUYÊN cách trình bày: nếu gốc KHÔNG có bảng ở mục nào thì KHÔNG ĐƯỢC tạo bảng ở đó
- PHẢI giữ NGUYÊN thứ tự mục, cách đánh số (I, II, III hoặc 1, 2, 3), cách thụt đầu dòng
- PHẢI giữ NGUYÊN tiêu đề từng hoạt động (VD: "Hoạt động 1: Khởi động", "a) Mục tiêu", "b) Nội dung")
- KHÔNG ĐƯỢC tự ý tạo bảng <table> mới nếu giáo án gốc không có bảng ở vị trí đó
- KHÔNG ĐƯỢC thay đổi style heading, layout, hoặc cấu trúc mục
- CHỈ ĐƯỢC sửa/bổ sung NỘI DUNG bên trong các mục có sẵn

⚠️ YÊU CẦU NỘI DUNG:
- PHẢI tích hợp TOÀN BỘ 6 phần dữ liệu bên dưới vào giáo án
- KHÔNG được bỏ sót bất kỳ phần nào
- Giáo án phải CHI TIẾT, ĐẦY ĐỦ — không sơ sài, không tóm tắt
- Công thức toán dùng LaTeX trong $...$ (ví dụ: $\\vec{AB}$, $\\frac{a}{b}$)
- Nội dung bổ sung thêm (phương pháp, trò chơi, mô phỏng) đặt trong <div class="activity-block">, <div class="game-block">, <div class="note-block"> ở vị trí phù hợp

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1/6] GIÁO ÁN GỐC — ĐÂY LÀ MẪU ĐỊNH DẠNG BẮT BUỘC PHẢI TUÂN THEO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${docxText ? docxText.substring(0, 10000) : '(Không có file gốc — dùng cấu trúc chuẩn: I. Mục tiêu, II. Thiết bị, III. Tiến trình, IV. Phụ lục, V. Rút kinh nghiệm)'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2/6] TỔNG QUAN PHÂN TÍCH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Môn học: ${data.summary.subject}
- Chủ đề/Bài: ${data.summary.topic}
- Điểm cần cải thiện: ${data.summary.weakness}
- Giải pháp đề xuất: ${data.summary.proposal}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[3/6] TIẾN TRÌNH DẠY HỌC (${data.teachingProcess?.length || 0} hoạt động)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${teachingProcessSummary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[4/6] PHƯƠNG PHÁP DẠY HỌC (${data.methods.length} phương pháp)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${methodsSummary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[5/6] TRÒ CHƠI GIÁO DỤC (${data.games.length} trò chơi)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${gamesSummary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[6/6] MÔ PHỎNG TƯƠNG TÁC + PHỤ LỤC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${simulationSummary}

${appendixSummary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 HƯỚNG DẪN HOÀN THIỆN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. LẤY GIÁO ÁN GỐC [1/6] làm KHUNG CHÍNH — giữ nguyên mọi đầu mục, cách trình bày, cách đánh số
2. Với mỗi mục trong giáo án gốc:
   - I. Mục tiêu: Giữ nguyên cấu trúc (1. Kiến thức, 2. Năng lực, 3. Phẩm chất) — BỔ SUNG nội dung nếu thiếu
   - II. Thiết bị: Giữ nguyên — thêm mô phỏng/công nghệ nếu có
   - III. Tiến trình: Giữ nguyên từng hoạt động (Hoạt động 1, 2, 3...) với CẤU TRÚC GỐC (a) Mục tiêu, b) Nội dung, c) Sản phẩm...) — CẢI THIỆN nội dung, THÊM phương pháp/trò chơi/mô phỏng phù hợp
   - Nếu giáo án gốc KHÔNG có bảng trong hoạt động → KHÔNG TẠO BẢNG, viết dạng text như gốc
   - Nếu giáo án gốc CÓ bảng → giữ bảng, cải thiện nội dung trong bảng
3. Tích hợp PHƯƠNG PHÁP DẠY HỌC [4/6] vào các hoạt động phù hợp trong tiến trình
4. Tích hợp TRÒ CHƠI [5/6] vào hoạt động phù hợp — đặt trong <div class="game-block">
5. Tích hợp MÔ PHỎNG [6/6] vào hoạt động liên quan — đặt trong <div class="note-block">
6. Thêm PHỤ LỤC nếu có — phiếu học tập, bài tập, câu hỏi
7. Thêm RÚT KINH NGHIỆM ở cuối (nếu giáo án gốc có)

⚠️ QUAN TRỌNG:
- Trả về TRỰC TIẾP HTML (KHÔNG bọc trong \`\`\`html, KHÔNG trả JSON)
- Công thức toán PHẢI dùng $...$ (LaTeX)
- NỘI DUNG PHẢI DÀI, CHI TIẾT — tối thiểu 3000 từ
- ĐỊNH DẠNG giống hệt giáo án gốc, CHỈ CẢI THIỆN NỘI DUNG

📌 QUY TẮC HTML BẮT BUỘC:
- MỖI đoạn văn PHẢI nằm trong thẻ <p>...</p> riêng biệt
- Danh sách PHẢI dùng <ul>/<ol> với <li>, KHÔNG viết liền 1 dòng
- Các heading dùng <h2>, <h3>, <h4> đúng cấp bậc
- Sau mỗi heading PHẢI xuống dòng (thẻ <p> mới)
- Mỗi mục con (a, b, c hoặc 1, 2, 3) PHẢI là 1 đoạn <p> hoặc <li> riêng
- TUYỆT ĐỐI KHÔNG viết tất cả nội dung trong 1 thẻ <p> dài
- Mỗi hoạt động có: tên (h3), mục tiêu (p), nội dung (nhiều p/ul), sản phẩm (p), kết luận (p) — MỖI phần PHẢI tách riêng
- [HƯỚNG DẪN SỬ DỤNG AI] nếu có PHẢI đặt trong <div class="note-block"> với từng bước là 1 <p> riêng`;

  return callGemini<string>(apiKey, model, [{ text: prompt }], null,
    `Bạn là chuyên gia giáo dục cấp cao. Trả về TRỰC TIẾP mã HTML giáo án hoàn chỉnh. Công thức toán dùng LaTeX trong $...$. PHẢI tích hợp đầy đủ tất cả dữ liệu được cung cấp, không bỏ sót.`, 'ProPlan');
};