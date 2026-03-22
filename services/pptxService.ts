import PptxGenJS from 'pptxgenjs';
import { LessonPlanResponse } from '../types';

/** Tạo slide thuyết trình PPTX chuyên nghiệp từ dữ liệu giáo án */
export const generatePptx = async (data: LessonPlanResponse): Promise<void> => {
  const pptx = new PptxGenJS();

  // Cấu hình chung
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 inches
  pptx.author = 'Kế Hoạch Bài Giảng Pro';
  pptx.subject = data.summary.topic;
  pptx.title = `Bài giảng: ${data.summary.topic}`;

  // Màu sắc chủ đề
  const COLORS = {
    primary: '0D9488',
    primaryDark: '0F766E',
    accent: 'F59E0B',
    white: 'FFFFFF',
    dark: '1E293B',
    gray: '64748B',
    lightBg: 'F0FDFA',
    warmBg: 'FEF9C3',
  };

  // ==========================================
  // SLIDE 1: TRANG BÌA
  // ==========================================
  const slide1 = pptx.addSlide();
  slide1.background = { fill: COLORS.primary };

  // Đường trang trí
  slide1.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: 0.08,
    fill: { color: COLORS.accent },
  });
  slide1.addShape(pptx.ShapeType.rect, {
    x: 0, y: 7.42, w: '100%', h: 0.08,
    fill: { color: COLORS.accent },
  });

  slide1.addText(data.summary.subject.toUpperCase(), {
    x: 1, y: 1.5, w: 11.33, h: 0.7,
    fontSize: 18, color: COLORS.accent, fontFace: 'Arial',
    bold: true, align: 'center',
  });

  slide1.addText(data.summary.topic, {
    x: 1, y: 2.5, w: 11.33, h: 1.5,
    fontSize: 36, color: COLORS.white, fontFace: 'Arial',
    bold: true, align: 'center', valign: 'middle',
  });

  slide1.addShape(pptx.ShapeType.rect, {
    x: 5.5, y: 4.2, w: 2.33, h: 0.04,
    fill: { color: COLORS.accent },
  });

  slide1.addText('Kế Hoạch Bài Giảng Pro', {
    x: 1, y: 5.0, w: 11.33, h: 0.5,
    fontSize: 14, color: 'B2DFDB', fontFace: 'Arial',
    italic: true, align: 'center',
  });

  // ==========================================
  // SLIDE 2: TỔNG QUAN
  // ==========================================
  const slide2 = pptx.addSlide();
  addSlideHeader(slide2, '📋 TỔNG QUAN PHÂN TÍCH', COLORS);

  slide2.addText([
    { text: '🎯 Điểm cần cải thiện:\n', options: { fontSize: 14, bold: true, color: COLORS.dark } },
    { text: data.summary.weakness + '\n\n', options: { fontSize: 12, color: COLORS.gray } },
    { text: '💡 Giải pháp đề xuất:\n', options: { fontSize: 14, bold: true, color: COLORS.primary } },
    { text: data.summary.proposal, options: { fontSize: 12, color: COLORS.gray } },
  ], {
    x: 0.8, y: 1.6, w: 11.73, h: 5.0,
    valign: 'top',
    paraSpaceAfter: 6,
  });

  // ==========================================
  // SLIDE 3-N: TIẾN TRÌNH DẠY HỌC
  // ==========================================
  if (data.teachingProcess && data.teachingProcess.length > 0) {
    // Slide overview
    const overviewSlide = pptx.addSlide();
    addSlideHeader(overviewSlide, '📚 TIẾN TRÌNH DẠY HỌC', COLORS);

    const activityIcons = ['🚀', '📖', '✍️', '🌟'];
    data.teachingProcess.forEach((act, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      overviewSlide.addText([
        { text: `${activityIcons[idx] || '📌'} ${act.activityName}\n`, options: { fontSize: 14, bold: true, color: COLORS.primaryDark } },
        { text: act.objective, options: { fontSize: 10, color: COLORS.gray } },
      ], {
        x: 0.8 + col * 6.0, y: 1.8 + row * 2.5, w: 5.5, h: 2.0,
        fill: { color: COLORS.lightBg },
        shape: pptx.ShapeType.roundRect,
        rectRadius: 0.15,
        valign: 'top',
        margin: [12, 12, 12, 12],
      });
    });

    // Slide chi tiết cho mỗi hoạt động
    data.teachingProcess.forEach((act, idx) => {
      const actSlide = pptx.addSlide();
      addSlideHeader(actSlide, `${activityIcons[idx] || '📌'} ${act.activityName}`, COLORS);

      const rows: PptxGenJS.TableRow[] = [
        [
          { text: 'Hạng mục', options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11 } },
          { text: 'Nội dung', options: { fill: { color: COLORS.primary }, color: COLORS.white, bold: true, fontSize: 11 } },
        ],
        [
          { text: '🎯 Mục tiêu', options: { bold: true, fontSize: 10 } },
          { text: stripLatex(act.objective), options: { fontSize: 10 } },
        ],
        [
          { text: '📝 Nội dung', options: { bold: true, fontSize: 10 } },
          { text: stripLatex(act.content), options: { fontSize: 10 } },
        ],
        [
          { text: '📦 Sản phẩm', options: { bold: true, fontSize: 10 } },
          { text: stripLatex(act.expectedProduct), options: { fontSize: 10 } },
        ],
        [
          { text: '⚙️ Tổ chức', options: { bold: true, fontSize: 10 } },
          { text: stripLatex(act.implementation), options: { fontSize: 9 } },
        ],
        [
          { text: '✅ Kết luận', options: { bold: true, fontSize: 10 } },
          { text: stripLatex(act.conclusion), options: { fontSize: 10 } },
        ],
      ];

      actSlide.addTable(rows, {
        x: 0.5, y: 1.5, w: 12.33,
        colW: [2.2, 10.13],
        border: { type: 'solid', pt: 0.5, color: 'CCCCCC' },
        rowH: [0.4, 0.6, 0.8, 0.6, 1.0, 0.6],
        margin: [4, 6, 4, 6],
        autoPage: false,
      });
    });
  }

  // ==========================================
  // SLIDE: PHƯƠNG PHÁP DẠY HỌC
  // ==========================================
  if (data.methods && data.methods.length > 0) {
    const methodSlide = pptx.addSlide();
    addSlideHeader(methodSlide, '🧠 PHƯƠNG PHÁP DẠY HỌC', COLORS);

    data.methods.forEach((method, idx) => {
      const yPos = 1.6 + idx * 1.8;
      if (yPos > 6.5) return; // Tránh tràn slide

      methodSlide.addText([
        { text: `${idx + 1}. ${method.name}\n`, options: { fontSize: 14, bold: true, color: COLORS.primaryDark } },
        { text: method.description + '\n', options: { fontSize: 11, color: COLORS.gray } },
        { text: '→ ' + method.steps.slice(0, 3).join(' → '), options: { fontSize: 10, color: COLORS.primary, italic: true } },
      ], {
        x: 0.8, y: yPos, w: 11.73, h: 1.5,
        valign: 'top',
        paraSpaceAfter: 4,
      });
    });
  }

  // ==========================================
  // SLIDE: TRÒ CHƠI GIÁO DỤC
  // ==========================================
  if (data.games && data.games.length > 0) {
    const gameSlide = pptx.addSlide();
    addSlideHeader(gameSlide, '🎮 TRÒ CHƠI GIÁO DỤC', COLORS);

    data.games.forEach((game, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      gameSlide.addText([
        { text: `🎯 ${game.name}\n`, options: { fontSize: 13, bold: true, color: COLORS.dark } },
        { text: `⏱ ${game.duration}\n`, options: { fontSize: 10, color: COLORS.accent, bold: true } },
        { text: game.objective, options: { fontSize: 10, color: COLORS.gray } },
      ], {
        x: 0.8 + col * 6.0, y: 1.8 + row * 2.8, w: 5.5, h: 2.3,
        fill: { color: COLORS.warmBg },
        shape: pptx.ShapeType.roundRect,
        rectRadius: 0.15,
        valign: 'top',
        margin: [12, 12, 12, 12],
      });
    });
  }

  // ==========================================
  // SLIDE CUỐI: CẢM ƠN
  // ==========================================
  const lastSlide = pptx.addSlide();
  lastSlide.background = { fill: COLORS.primary };

  lastSlide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: 0.08,
    fill: { color: COLORS.accent },
  });

  lastSlide.addText('CẢM ƠN QUÝ THẦY CÔ\nĐÃ LẮNG NGHE!', {
    x: 1, y: 2.0, w: 11.33, h: 2.5,
    fontSize: 36, color: COLORS.white, fontFace: 'Arial',
    bold: true, align: 'center', valign: 'middle',
  });

  lastSlide.addText('Được tạo bởi Kế Hoạch Bài Giảng Pro', {
    x: 1, y: 5.5, w: 11.33, h: 0.5,
    fontSize: 12, color: 'B2DFDB', fontFace: 'Arial',
    italic: true, align: 'center',
  });

  // Xuất file bằng blob (browser-compatible, không dùng writeFile vì nó gọi Node.js fs)
  const fileName = `BaiGiang_${(data.summary.topic || 'Slide').replace(/\s+/g, '_')}.pptx`;
  const blob = await pptx.write({ outputType: 'blob' }) as Blob;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** Thêm header chung cho mỗi slide */
function addSlideHeader(slide: PptxGenJS.Slide, title: string, colors: Record<string, string>) {
  // Thanh header
  slide.addShape('rect' as any, {
    x: 0, y: 0, w: '100%', h: 1.2,
    fill: { color: colors.primary },
  });
  slide.addText(title, {
    x: 0.8, y: 0.15, w: 11.73, h: 0.9,
    fontSize: 22, color: colors.white, fontFace: 'Arial',
    bold: true, valign: 'middle',
  });
  // Accent bar
  slide.addShape('rect' as any, {
    x: 0, y: 1.2, w: '100%', h: 0.04,
    fill: { color: colors.accent },
  });
}

/** Loại bỏ ký tự LaTeX cho PPTX (PPTX không render LaTeX) */
function stripLatex(text: string): string {
  if (!text) return '';
  return text
    .replace(/\$\$(.*?)\$\$/g, '$1')
    .replace(/\$(.*?)\$/g, '$1')
    .replace(/\\\\frac\{(.*?)\}\{(.*?)\}/g, '($1/$2)')
    .replace(/\\\\sqrt\{(.*?)\}/g, '√($1)')
    .replace(/\\\\overrightarrow\{(.*?)\}/g, '$1→')
    .replace(/\\\\vec\{(.*?)\}/g, '$1→')
    .replace(/\\\\alpha/g, 'α').replace(/\\\\beta/g, 'β').replace(/\\\\gamma/g, 'γ')
    .replace(/\\\\Delta/g, 'Δ').replace(/\\\\theta/g, 'θ').replace(/\\\\pi/g, 'π')
    .replace(/\\\\pm/g, '±').replace(/\\\\times/g, '×').replace(/\\\\div/g, '÷')
    .replace(/\\\\leq/g, '≤').replace(/\\\\geq/g, '≥').replace(/\\\\neq/g, '≠')
    .replace(/\\\\cdot/g, '·').replace(/\\\\infty/g, '∞')
    .replace(/\\\\/g, '');
}
