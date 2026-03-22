/**
 * DOCX Service - Đọc và thao tác file DOCX bằng JSZip
 * DOCX = ZIP chứa XML files. Ta đọc word/document.xml để lấy nội dung text.
 */
import JSZip from 'jszip';

/**
 * Trích xuất nội dung text từ file DOCX
 * Đọc word/document.xml và parse XML để lấy text
 */
export const extractDocxText = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  const documentXml = zip.file('word/document.xml');
  if (!documentXml) {
    throw new Error('File DOCX không hợp lệ: không tìm thấy word/document.xml');
  }
  
  const xmlContent = await documentXml.async('string');
  
  // Parse XML để trích xuất text
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');
  
  // Namespace for Word XML
  const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  
  /** Trích xuất text từ 1 paragraph <w:p> */
  const extractParaText = (para: Element): string => {
    const runs = para.getElementsByTagNameNS(W_NS, 'r');
    let text = '';
    for (let j = 0; j < runs.length; j++) {
      const textNodes = runs[j].getElementsByTagNameNS(W_NS, 't');
      for (let k = 0; k < textNodes.length; k++) {
        text += textNodes[k].textContent || '';
      }
    }
    return text.trim();
  };

  /** Trích xuất bảng <w:tbl> — giữ format dòng/cột */
  const extractTableText = (table: Element): string[] => {
    const lines: string[] = [];
    const rows = table.getElementsByTagNameNS(W_NS, 'tr');
    for (let r = 0; r < rows.length; r++) {
      const cells = rows[r].getElementsByTagNameNS(W_NS, 'tc');
      const cellTexts: string[] = [];
      for (let c = 0; c < cells.length; c++) {
        const cellParas = cells[c].getElementsByTagNameNS(W_NS, 'p');
        const parts: string[] = [];
        for (let p = 0; p < cellParas.length; p++) {
          const t = extractParaText(cellParas[p]);
          if (t) parts.push(t);
        }
        cellTexts.push(parts.join(' '));
      }
      if (cellTexts.some(t => t)) {
        lines.push('| ' + cellTexts.join(' | ') + ' |');
      }
    }
    return lines;
  };

  // ===== QUAN TRỌNG: Duyệt theo THỨ TỰ document body children =====
  // Thay vì lấy tất cả <w:p> rồi tất cả <w:tbl> (mất thứ tự),
  // ta duyệt từng child node của <w:body> theo thứ tự xuất hiện.
  const body = xmlDoc.getElementsByTagNameNS(W_NS, 'body')[0];
  const textParts: string[] = [];

  if (body) {
    const children = body.childNodes;
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (node.nodeType !== 1) continue; // Chỉ xử lý Element nodes
      const el = node as Element;
      const localName = el.localName;

      if (localName === 'p') {
        // Paragraph
        const text = extractParaText(el);
        if (text) textParts.push(text);
      } else if (localName === 'tbl') {
        // Table — chèn đúng vị trí trong document
        const tableLines = extractTableText(el);
        textParts.push(...tableLines);
      }
      // Bỏ qua các element khác (sdt, bookmarks, etc.)
    }
  }

  return textParts.join('\n');
};

/**
 * Đọc file thành ArrayBuffer để lưu trữ và thao tác sau
 */
export const readFileAsArrayBuffer = async (file: File): Promise<ArrayBuffer> => {
  return file.arrayBuffer();
};

export interface DocxModification {
  /** Vị trí/ngữ cảnh trong tài liệu để AI xác định chỗ chèn */
  location: string;
  /** Nội dung thêm mới (sẽ được bôi đỏ) */
  newContent: string;
  /** Loại thao tác: 'insert_after' - chèn sau vị trí, 'replace' - thay thế */
  action: 'insert_after' | 'replace' | 'insert_before';
}

/**
 * Chèn nội dung mới vào file DOCX gốc với chữ đỏ
 * Kỹ thuật: Thao tác trực tiếp XML trong word/document.xml
 */
export const modifyDocxWithRedText = async (
  originalArrayBuffer: ArrayBuffer,
  modifications: DocxModification[]
): Promise<Blob> => {
  const zip = await JSZip.loadAsync(originalArrayBuffer);
  
  const documentXml = zip.file('word/document.xml');
  if (!documentXml) {
    throw new Error('File DOCX không hợp lệ');
  }
  
  let xmlContent = await documentXml.async('string');
  
  // Namespace
  const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');
  
  // Tìm tất cả paragraphs
  const allParagraphs = xmlDoc.getElementsByTagNameNS(W_NS, 'p');
  
  for (const mod of modifications) {
    // Tìm paragraph chứa text gần nhất với location
    let targetPara: Element | null = null;
    let bestMatch = 0;
    
    for (let i = 0; i < allParagraphs.length; i++) {
      const para = allParagraphs[i];
      const paraText = getParaText(para, W_NS);
      
      if (paraText && mod.location) {
        // Tìm paragraph có text khớp nhiều nhất
        const normalizedParaText = paraText.toLowerCase().trim();
        const normalizedLocation = mod.location.toLowerCase().trim();
        
        if (normalizedParaText.includes(normalizedLocation) || normalizedLocation.includes(normalizedParaText)) {
          const matchScore = Math.min(normalizedParaText.length, normalizedLocation.length);
          if (matchScore > bestMatch) {
            bestMatch = matchScore;
            targetPara = para;
          }
        }
      }
    }
    
    if (targetPara) {
      // Tạo paragraph mới với chữ đỏ
      const newParas = createRedTextParagraphs(xmlDoc, W_NS, mod.newContent);
      
      const parent = targetPara.parentNode;
      if (parent) {
        if (mod.action === 'insert_after') {
          const nextSibling = targetPara.nextSibling;
          for (const newPara of newParas) {
            parent.insertBefore(newPara, nextSibling);
          }
        } else if (mod.action === 'insert_before') {
          for (const newPara of newParas) {
            parent.insertBefore(newPara, targetPara);
          }
        }
      }
    } else {
      // Nếu không tìm thấy vị trí, chèn vào cuối document body
      const body = xmlDoc.getElementsByTagNameNS(W_NS, 'body')[0];
      if (body) {
        const newParas = createRedTextParagraphs(xmlDoc, W_NS, mod.newContent);
        // Chèn trước sectPr (section properties) nếu có
        const sectPr = body.getElementsByTagNameNS(W_NS, 'sectPr')[0];
        for (const newPara of newParas) {
          if (sectPr) {
            body.insertBefore(newPara, sectPr);
          } else {
            body.appendChild(newPara);
          }
        }
      }
    }
  }
  
  // Serialize XML trở lại
  const serializer = new XMLSerializer();
  const modifiedXml = serializer.serializeToString(xmlDoc);
  
  // Ghi lại vào ZIP
  zip.file('word/document.xml', modifiedXml);
  
  // Tạo blob DOCX mới
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
  
  return blob;
};

/**
 * Lấy text từ paragraph
 */
function getParaText(para: Element, ns: string): string {
  const runs = para.getElementsByTagNameNS(ns, 'r');
  let text = '';
  for (let j = 0; j < runs.length; j++) {
    const textNodes = runs[j].getElementsByTagNameNS(ns, 't');
    for (let k = 0; k < textNodes.length; k++) {
      text += textNodes[k].textContent || '';
    }
  }
  return text;
}

/**
 * Loại bỏ HTML tags và chuyển thành text thuần
 */
function stripHtmlTags(html: string): string {
  // Thay <br>, <br/> thành \n
  let s = html.replace(/<br\s*\/?>/gi, '\n');
  // Thay </p>, </div>, </li> thành \n
  s = s.replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n');
  // Thay <li> thành "• "
  s = s.replace(/<li[^>]*>/gi, '• ');
  // Loại bỏ mọi HTML tag còn lại
  s = s.replace(/<[^>]+>/g, '');
  // Decode HTML entities
  s = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  // Collapse nhiều \n liên tiếp
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/**
 * Chuyển đổi LaTeX commands thành ký tự Unicode cho DOCX (DOCX không render LaTeX)
 */
function latexToUnicode(text: string): string {
  let s = text;
  // Bỏ delimiters $...$ và $$...$$
  s = s.replace(/\$\$(.*?)\$\$/g, '$1');
  s = s.replace(/\$(.*?)\$/g, '$1');
  // Bỏ \(...\) và \[...\]
  s = s.replace(/\\\((.*?)\\\)/g, '$1');
  s = s.replace(/\\\[(.*?)\\\]/g, '$1');
  // Fractions: \frac{a}{b} → (a/b)
  s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1/$2)');
  // Square root: \sqrt{x} → √(x)
  s = s.replace(/\\sqrt\{([^}]*)\}/g, '√($1)');
  // Vectors: \vec{AB} → AB⃗, \overrightarrow{AB} → AB⃗
  s = s.replace(/\\overrightarrow\{([^}]*)\}/g, '$1\u20D7');
  s = s.replace(/\\vec\{([^}]*)\}/g, '$1\u20D7');
  // Overline: \overline{AB} → AB̅
  s = s.replace(/\\overline\{([^}]*)\}/g, '$1\u0305');
  // Greek letters
  const greekMap: Record<string, string> = {
    'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'epsilon': 'ε',
    'zeta': 'ζ', 'eta': 'η', 'theta': 'θ', 'iota': 'ι', 'kappa': 'κ',
    'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ', 'pi': 'π',
    'rho': 'ρ', 'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ', 'phi': 'φ',
    'chi': 'χ', 'psi': 'ψ', 'omega': 'ω',
    'Alpha': 'Α', 'Beta': 'Β', 'Gamma': 'Γ', 'Delta': 'Δ', 'Epsilon': 'Ε',
    'Theta': 'Θ', 'Lambda': 'Λ', 'Pi': 'Π', 'Sigma': 'Σ', 'Phi': 'Φ',
    'Psi': 'Ψ', 'Omega': 'Ω',
  };
  for (const [cmd, char] of Object.entries(greekMap)) {
    s = s.replace(new RegExp(`\\\\${cmd}(?![a-zA-Z])`, 'g'), char);
  }
  // Math operators and symbols
  s = s.replace(/\\pm/g, '±').replace(/\\mp/g, '∓');
  s = s.replace(/\\times/g, '×').replace(/\\div/g, '÷').replace(/\\cdot/g, '·');
  s = s.replace(/\\leq/g, '≤').replace(/\\geq/g, '≥').replace(/\\neq/g, '≠');
  s = s.replace(/\\approx/g, '≈').replace(/\\equiv/g, '≡');
  s = s.replace(/\\infty/g, '∞').replace(/\\sum/g, '∑').replace(/\\prod/g, '∏');
  s = s.replace(/\\int/g, '∫').replace(/\\partial/g, '∂').replace(/\\nabla/g, '∇');
  s = s.replace(/\\subset/g, '⊂').replace(/\\supset/g, '⊃');
  s = s.replace(/\\cup/g, '∪').replace(/\\cap/g, '∩');
  s = s.replace(/\\in/g, '∈').replace(/\\notin/g, '∉');
  s = s.replace(/\\forall/g, '∀').replace(/\\exists/g, '∃');
  s = s.replace(/\\rightarrow/g, '→').replace(/\\leftarrow/g, '←');
  s = s.replace(/\\Rightarrow/g, '⇒').replace(/\\Leftarrow/g, '⇐');
  s = s.replace(/\\leftrightarrow/g, '↔').replace(/\\Leftrightarrow/g, '⇔');
  // Cleanup remaining backslashes from unknown commands
  s = s.replace(/\\(text|mathrm|mathbf|textbf|textit)\{([^}]*)\}/g, '$2');
  s = s.replace(/\\{/g, '{').replace(/\\}/g, '}');
  s = s.replace(/\\\\/g, '');
  return s;
}

/**
 * Tạo các paragraph XML với chữ đỏ
 */
function createRedTextParagraphs(xmlDoc: Document, ns: string, content: string): Element[] {
  // Step 1: Strip HTML tags
  let cleanContent = stripHtmlTags(content);
  // Step 2: Convert LaTeX to Unicode
  cleanContent = latexToUnicode(cleanContent);
  
  const lines = cleanContent.split('\n').filter(l => l.trim());
  const paragraphs: Element[] = [];
  
  for (const line of lines) {
    // Tạo <w:p>
    const p = xmlDoc.createElementNS(ns, 'w:p');
    
    // Tạo <w:r> (run)
    const r = xmlDoc.createElementNS(ns, 'w:r');
    
    // Tạo <w:rPr> (run properties) với màu đỏ
    const rPr = xmlDoc.createElementNS(ns, 'w:rPr');
    
    // Màu đỏ
    const color = xmlDoc.createElementNS(ns, 'w:color');
    color.setAttribute('w:val', 'FF0000');
    rPr.appendChild(color);
    
    // Bold cho tiêu đề
    const trimmedLine = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
    if (line.startsWith('###') || line.startsWith('**') || line.toUpperCase() === line) {
      const bold = xmlDoc.createElementNS(ns, 'w:b');
      rPr.appendChild(bold);
    }
    
    // Font size (mặc định 12pt = 24 half-points)
    const sz = xmlDoc.createElementNS(ns, 'w:sz');
    sz.setAttribute('w:val', '24');
    rPr.appendChild(sz);
    
    r.appendChild(rPr);
    
    // Tạo <w:t> (text)
    const t = xmlDoc.createElementNS(ns, 'w:t');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = trimmedLine;
    r.appendChild(t);
    
    p.appendChild(r);
    paragraphs.push(p);
  }
  
  return paragraphs;
}
