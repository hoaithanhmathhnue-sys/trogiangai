export type ClassSize = 'small' | 'medium' | 'large';
export type TimeConstraint = '45' | '90' | '135' | '180' | '225' | '270';
export type SchoolLevel = 'primary' | 'secondary' | 'high' | 'vocational' | 'college' | 'university';

export interface LessonConfig {
  schoolLevel: SchoolLevel;
  grade: string;
  subject: string;
  classSize: ClassSize;
  resources: {
    projector: boolean;
    internet: boolean;
    materials: boolean;
  };
  customResource: string;
  timeConstraint: TimeConstraint;
  teachingFocus: string[];
  customCompetency: string;
  techApps: string;
  integration: string;
  simulationTopic?: string;
  /** Co muon ung dung AI vao giang day khong */
  useAI?: boolean;
}

export interface LessonInput {
  fileBase64?: string;
  mimeType?: string;
  fileName?: string;
  /** Text trích xuất từ file DOCX */
  docxText?: string;
  /** ArrayBuffer gốc của file DOCX để tạo output */
  docxArrayBuffer?: ArrayBuffer;
  config: LessonConfig;
}

export interface TeachingMethod {
  name: string;
  description: string;
  steps: string[];
}

export interface Game {
  name: string;
  duration: string;
  type: string;
  objective: string;
  steps: string[];
}

export interface Simulation {
  title: string;
  description: string;
  code: string;
  /** Câu hỏi thực hành cho học sinh */
  questions?: string;
  /** Hướng dẫn sử dụng cho giáo viên */
  guide?: string;
}

export interface AnalysisSummary {
  subject: string;
  topic: string;
  weakness: string;
  proposal: string;
}

/** Hoạt động trong tiến trình dạy học */
export interface TeachingActivity {
  /** Tên hoạt động (VD: "Khởi động", "Hình thành kiến thức") */
  activityName: string;
  /** Mục tiêu của hoạt động */
  objective: string;
  /** Nội dung chi tiết */
  content: string;
  /** Sản phẩm đạt được */
  expectedProduct: string;
  /** Tiến trình tổ chức thực hiện */
  implementation: string;
  /** Kết luận, nhận định */
  conclusion: string;
}

/** Modification AI đề xuất cho file DOCX */
export interface DocxModificationItem {
  /** Vị trí trong tài liệu gốc (text gần đúng) */
  location: string;
  /** Nội dung mới cần chèn */
  newContent: string;
  /** Loại thao tác */
  action: 'insert_after' | 'replace' | 'insert_before';
}

export interface LessonPlanResponse {
  summary: AnalysisSummary;
  methods: TeachingMethod[];
  games: Game[];
  simulation?: Simulation;
  fullPlanHtml: string;
  /** Tiến trình dạy học đề xuất */
  teachingProcess?: TeachingActivity[];
  /** Các modification để áp dụng vào file DOCX gốc */
  docxModifications?: DocxModificationItem[];
}

export enum LoadingState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}