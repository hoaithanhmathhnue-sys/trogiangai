import { LessonInput, LessonPlanResponse } from '../types';

/** Dữ liệu phiên làm việc */
export interface SessionData {
  version: number;
  timestamp: string;
  currentStep: number;
  input: Omit<LessonInput, 'docxArrayBuffer' | 'fileBase64'>;
  docxText: string | null;
  partialResult: Partial<LessonPlanResponse>;
}

const SESSION_KEY = 'khbg_pro_session';
const SESSION_VERSION = 1;

/** Lưu phiên vào localStorage */
export const saveSessionToStorage = (
  currentStep: number,
  input: LessonInput,
  docxText: string | null,
  partialResult: Partial<LessonPlanResponse>
): void => {
  const session: SessionData = {
    version: SESSION_VERSION,
    timestamp: new Date().toISOString(),
    currentStep,
    input: {
      config: input.config,
      fileName: input.fileName,
      mimeType: input.mimeType,
      docxText: input.docxText,
    },
    docxText,
    partialResult: {
      ...partialResult,
      // Không lưu code mô phỏng quá lớn vào localStorage
      simulation: partialResult.simulation ? {
        title: partialResult.simulation.title,
        description: partialResult.simulation.description,
        code: partialResult.simulation.code.substring(0, 50000), // Giới hạn
      } : undefined,
    },
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('Không thể lưu phiên vào localStorage:', e);
  }
};

/** Đọc phiên từ localStorage */
export const loadSessionFromStorage = (): SessionData | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as SessionData;
    if (session.version !== SESSION_VERSION) return null;
    return session;
  } catch {
    return null;
  }
};

/** Xóa phiên khỏi localStorage */
export const clearSessionFromStorage = (): void => {
  localStorage.removeItem(SESSION_KEY);
};

/** Xuất phiên ra file JSON */
export const exportSessionToFile = (
  currentStep: number,
  input: LessonInput,
  docxText: string | null,
  partialResult: Partial<LessonPlanResponse>
): void => {
  const session: SessionData = {
    version: SESSION_VERSION,
    timestamp: new Date().toISOString(),
    currentStep,
    input: {
      config: input.config,
      fileName: input.fileName,
      mimeType: input.mimeType,
      docxText: input.docxText,
    },
    docxText,
    partialResult,
  };
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Phien_KHBG_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** Import phiên từ file JSON */
export const importSessionFromFile = (): Promise<SessionData | null> => {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) { resolve(null); return; }
      try {
        const text = await file.text();
        const session = JSON.parse(text) as SessionData;
        if (session.version !== SESSION_VERSION) {
          alert('File phiên không hợp lệ hoặc version không khớp.');
          resolve(null);
          return;
        }
        resolve(session);
      } catch {
        alert('Không thể đọc file phiên. Vui lòng kiểm tra lại.');
        resolve(null);
      }
    };
    input.click();
  });
};
