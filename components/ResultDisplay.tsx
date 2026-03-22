import React, { useState, useEffect, useRef } from 'react';
import { LessonPlanResponse, Simulation } from '../types';
import { modifyDocxWithRedText, DocxModification } from '../services/docxService';
import { generateFullProLessonPlan } from '../services/geminiService';
import { generatePptx } from '../services/pptxService';
import { STEP_NAMES } from '../App';

interface ResultDisplayProps {
   data: LessonPlanResponse;
   onReset: () => void;
   docxArrayBuffer?: ArrayBuffer | null;
   apiKey?: string;
   selectedModel?: string;
   docxText?: string | null;

   // Step-by-step props
   currentStep: number;
   totalSteps: number;
   onContinue: () => void;
   isStepLoading: boolean;
   stepError: string | null;
   onOpenSettings?: () => void;
}

declare global {
   interface Window {
      katex: any;
      renderMathInElement: (element: HTMLElement | null, options: any) => void;
   }
}

type TabType = 'summary' | 'teaching-process' | 'methods' | 'games' | 'simulation' | 'lesson-plan' | 'pro-plan';

const TAB_STEP_MAP: Record<TabType, number> = {
   'summary': 0,
   'teaching-process': 1,
   'methods': 2,
   'games': 3,
   'simulation': 4,
   'lesson-plan': 5,
   'pro-plan': 5, // Khả dụng cùng với lesson-plan khi tất cả bước hoàn thành
};

// ====================================================
// SimulationView — trolytaomophong-style component
// ====================================================
type SimSubTab = 'preview' | 'questions' | 'guide' | 'code';

const SimulationView: React.FC<{
   simulation: Simulation;

}> = ({ simulation }) => {
   const [simTab, setSimTab] = useState<SimSubTab>('preview');
   const [copied, setCopied] = useState(false);
   const simContainerRef = useRef<HTMLDivElement>(null);

   // Render MathJax/KaTeX cho LaTeX trong description, questions, guide
   useEffect(() => {
      if (simContainerRef.current && window.renderMathInElement) {
         setTimeout(() => {
            try {
               if (simContainerRef.current) {
                  window.renderMathInElement(simContainerRef.current, {
                     delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false },
                        { left: '\\(', right: '\\)', display: false },
                        { left: '\\[', right: '\\]', display: true }
                     ],
                     throwOnError: false,
                     strict: false,
                     trust: true
                  });
               }
            } catch (e) {
               console.warn("KaTeX render warning (SimulationView):", e);
            }
         }, 150);
      }
   }, [simTab, simulation]);

   const handleDownloadHtml = () => {
      const blob = new Blob([simulation.code], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mo-phong-${(simulation.title || 'simulation').toLowerCase().replace(/\s+/g, '-')}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
   };

   const handleCopyCode = () => {
      navigator.clipboard.writeText(simulation.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
   };

   const simTabBtnClass = (tab: SimSubTab) =>
      `flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm w-full text-left ${
         simTab === tab
            ? 'bg-primary text-white shadow-md'
            : 'text-slate-600 hover:bg-slate-50'
      }`;

   return (
      <div ref={simContainerRef} className="flex flex-col gap-6">
         {/* Success Banner */}
         <div className="bg-gradient-to-r from-primary to-[#0F766E] rounded-2xl p-5 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
               <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">✨</span>
                  <h2 className="font-bold text-xl tracking-tight">{simulation.title || 'Mô phỏng tùy chỉnh đã hoàn tất!'}</h2>
               </div>
               <p className="text-teal-50/80 text-sm">{simulation.description}</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
               <button
                  onClick={handleDownloadHtml}
                  className="bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-white/20 transition-all uppercase tracking-wide"
               >
                  <span className="material-symbols-outlined text-sm">download</span>
                  Tải HTML
               </button>
               <button
                  onClick={handleCopyCode}
                  className="bg-white text-primary px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-teal-50 transition-all uppercase tracking-wide shadow-lg"
               >
                  <span className="material-symbols-outlined text-sm">{copied ? 'check' : 'content_copy'}</span>
                  {copied ? 'Đã copy' : 'Copy Code'}
               </button>
            </div>
         </div>

         {/* Main Content — Grid Layout */}
         <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Preview / Content Area */}
            <div className="lg:col-span-8">
               <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-4 border-white relative">
                  {simTab === 'preview' ? (
                     <div className="w-full h-[500px] relative">
                        <iframe
                           title="Mô phỏng tương tác"
                           srcDoc={simulation.code}
                           className="w-full h-full border-0 bg-white"
                           sandbox="allow-scripts allow-same-origin allow-modals"
                        />
                        <div className="absolute bottom-4 left-4">
                           <div className="bg-slate-900/80 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 border border-white/10 shadow-lg">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                              INTERACTIVE READY
                           </div>
                        </div>
                     </div>
                  ) : simTab === 'code' ? (
                     <div className="h-[500px] bg-[#1e1e1e] overflow-auto p-4">
                        <pre className="text-[#d4d4d4] font-mono text-xs whitespace-pre-wrap">{simulation.code}</pre>
                     </div>
                  ) : (
                     <div className="h-[500px] bg-white overflow-auto p-8">
                        <div className="prose prose-teal max-w-none">
                           <div className="whitespace-pre-wrap font-medium text-slate-700 leading-relaxed">
                              {simTab === 'questions' ? simulation.questions : simulation.guide}
                           </div>
                        </div>
                     </div>
                  )}
               </div>
            </div>

            {/* Right: Controls & Info */}
            <div className="lg:col-span-4 flex flex-col gap-4">
               {/* Navigation Tabs */}
               <div className="bg-white rounded-2xl p-4 shadow-sm border border-teal-50 flex flex-col gap-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-2">Nội dung</h3>
                  <button onClick={() => setSimTab('preview')} className={simTabBtnClass('preview')}>
                     <span className="material-symbols-outlined text-lg">play_circle</span> Mô phỏng
                  </button>
                  <button onClick={() => setSimTab('questions')} className={simTabBtnClass('questions')}>
                     <span className="material-symbols-outlined text-lg">quiz</span> Câu hỏi thực hành
                  </button>
                  <button onClick={() => setSimTab('guide')} className={simTabBtnClass('guide')}>
                     <span className="material-symbols-outlined text-lg">description</span> Hướng dẫn GV
                  </button>
                  <button onClick={() => setSimTab('code')} className={simTabBtnClass('code')}>
                     <span className="material-symbols-outlined text-lg">code</span> Source Code
                  </button>
               </div>

               {/* AI Analysis Box */}
               <div className="bg-white rounded-2xl p-6 shadow-sm border border-teal-50 flex-1">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                     <span className="bg-teal-50 text-primary p-1.5 rounded-lg">
                        <span className="material-symbols-outlined text-sm">rocket_launch</span>
                     </span>
                     AI Analysis
                  </h3>
                  <div className="text-xs text-slate-600 space-y-3 leading-relaxed">
                     <p>Mô phỏng được tạo tự động dựa trên các tham số khoa học tiêu chuẩn.</p>
                     <div className="p-3 bg-teal-50 rounded-xl border-l-4 border-primary text-[#0F766E] italic font-medium">
                        "Học sinh tương tác trực tiếp với các biến số để quan sát sự thay đổi của hệ thống trong thời gian thực."
                     </div>
                     <ul className="space-y-2 mt-4">
                        <li className="flex items-center gap-2">
                           <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                           <span><strong className="text-slate-700">Responsive:</strong> Mobile/Tablet</span>
                        </li>
                        <li className="flex items-center gap-2">
                           <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                           <span><strong className="text-slate-700">Offline:</strong> Chạy không cần mạng</span>
                        </li>
                        <li className="flex items-center gap-2">
                           <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                           <span><strong className="text-slate-700">Tương thích:</strong> Chrome/Firefox/Edge</span>
                        </li>
                     </ul>
                  </div>
               </div>
            </div>
         </div>
      </div>
   );
};

const ResultDisplay: React.FC<ResultDisplayProps> = ({
   data, onReset, docxArrayBuffer, apiKey, selectedModel, docxText,
   currentStep, totalSteps, onContinue,
   isStepLoading, stepError, onOpenSettings
}) => {
   const [activeTab, setActiveTab] = useState<TabType>('summary');
   const lessonPlanRef = useRef<HTMLDivElement>(null);
   const proLessonPlanRef = useRef<HTMLDivElement>(null);
   const teachingProcessRef = useRef<HTMLDivElement>(null);
   const methodsRef = useRef<HTMLDivElement>(null);
   const gamesRef = useRef<HTMLDivElement>(null);
   const summaryRef = useRef<HTMLDivElement>(null);
   const [isExporting, setIsExporting] = useState(false);
   const [proLessonPlanHtml, setProLessonPlanHtml] = useState<string | null>(null);
   const [isGeneratingProPlan, setIsGeneratingProPlan] = useState(false);
   const [proGenError, setProGenError] = useState<string | null>(null);
   const [isGeneratingPptx, setIsGeneratingPptx] = useState(false);

   const renderKaTeX = (ref: React.RefObject<HTMLDivElement | null>) => {
      if (ref.current && window.renderMathInElement) {
         setTimeout(() => {
            try {
               if (ref.current) {
                  window.renderMathInElement(ref.current, {
                     delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false },
                        { left: '\\(', right: '\\)', display: false },
                        { left: '\\[', right: '\\]', display: true }
                     ],
                     throwOnError: false,
                     strict: false,
                     trust: true
                  });
               }
            } catch (e) {
               console.warn("KaTeX render warning:", e);
            }
         }, 100);
      }
   };

   /** Normalize LaTeX: auto-wrap bare \commands in $...$ delimiters */
   const fixLatexContent = (text: string | undefined): string => {
      if (!text) return '';
      let s = text;
      // Fix double-backslash from JSON escape: \\vec → \vec
      s = s.replace(/\\\\(vec|frac|sqrt|int|sum|prod|lim|alpha|beta|gamma|delta|theta|pi|omega|infty|cdot|times|div|pm|mp|leq|geq|neq|approx|equiv|subset|supset|cup|cap|in|notin|forall|exists|nabla|partial|leftarrow|rightarrow|Leftarrow|Rightarrow|leftrightarrow|Leftrightarrow|overline|underline|hat|bar|tilde|dot|text|mathrm|mathbf|begin|end)/g, '\\$1');
      // Auto-wrap bare LaTeX commands not inside $...$
      // Pattern: \command{...} or \command not preceded by $ or inside $...$
      s = s.replace(/(?<!\$)(\\(?:vec|frac|sqrt|overline|underline|hat|bar|tilde|dot|text|mathrm|mathbf)\{[^}]*\}(?:\{[^}]*\})?)/g, '\$$1\$');
      s = s.replace(/(?<!\$)(\\(?:vec|frac|sqrt|overline|underline|hat|bar|tilde|dot|text|mathrm|mathbf)\([^)]*\))/g, '\$$1\$');
      // Fix double-dollar wrapping: $$...$$ inside single-line
      s = s.replace(/\$\$([^$]+)\$\$/g, (_, m) => `\$${m}\$`);
      return s;
   };

   useEffect(() => {
      if (activeTab === 'summary') renderKaTeX(summaryRef);
      if (activeTab === 'lesson-plan') renderKaTeX(lessonPlanRef);
      if (activeTab === 'pro-plan') renderKaTeX(proLessonPlanRef);
      if (activeTab === 'teaching-process') renderKaTeX(teachingProcessRef);
      if (activeTab === 'methods') renderKaTeX(methodsRef);
      if (activeTab === 'games') renderKaTeX(gamesRef);
   }, [activeTab, data, proLessonPlanHtml]);

   // Auto-switch tab khi step mới hoàn thành
   useEffect(() => {
      const stepToTab: TabType[] = ['summary', 'teaching-process', 'methods', 'games', 'simulation', 'lesson-plan'];
      if (currentStep >= 0 && currentStep < stepToTab.length) {
         setActiveTab(stepToTab[currentStep]);
      }
   }, [currentStep]);

   const copyToClipboard = async (text: string) => {
      try {
         await navigator.clipboard.writeText(text);
         alert('Đã sao chép!');
      } catch { alert('Không thể sao chép.'); }
   };

   /** Xuất file DOCX bôi đỏ từ file gốc */
   const downloadModifiedDocx = async () => {
      if (!docxArrayBuffer) {
         alert('Chức năng này yêu cầu upload file DOCX gốc. Vui lòng tải Phụ Lục (.doc) thay thế.');
         return;
      }
      if (!data.docxModifications || data.docxModifications.length === 0) {
         alert('Không tìm thấy nội dung đề xuất bổ sung. AI chưa tạo docxModifications.');
         return;
      }
      setIsExporting(true);
      try {
         const modifications: DocxModification[] = data.docxModifications.map(m => ({
            location: m.location,
            newContent: m.newContent,
            action: m.action as 'insert_after' | 'replace' | 'insert_before'
         }));
         const blob = await modifyDocxWithRedText(docxArrayBuffer, modifications);
         const url = URL.createObjectURL(blob);
         const link = document.createElement('a');
         link.href = url;
         link.download = `NangCap_${(data.summary.topic || 'GiaoAn').replace(/\s+/g, '_')}.docx`;
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
         URL.revokeObjectURL(url);
      } catch (err) {
         console.error('Error exporting DOCX:', err);
         alert('Lỗi xuất file DOCX. Đang chuyển sang xuất .doc HTML...');
         downloadDocx();
      } finally {
         setIsExporting(false);
      }
   };

   const downloadDocx = () => {
      const header = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><style>
      body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.5; margin: 2cm; }
      h2 { color: #0d9488; border-bottom: 2px solid #ccfbf1; padding-bottom: 6px; }
      h3 { color: #115e59; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0; }
      th { background: #0d9488; color: white; padding: 8px; border: 1px solid #ddd; }
      td { padding: 8px; border: 1px solid #ddd; vertical-align: top; }
      .change-block { margin: 10px 0; padding: 12px; border-radius: 6px; }
      .type-add { background: #f0fff4; border-left: 4px solid #22c55e; }
      .type-modify { background: #fefce8; border-left: 4px solid #eab308; }
      </style></head><body>`;
      const footer = '</body></html>';
      const blob = new Blob(['\ufeff', header + data.fullPlanHtml + footer], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Cai_Tien_${(data.summary.topic || 'GiaoAn').replace(/\s+/g, '_')}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
   };

   /** Tạo PPTX */
   const handleGeneratePptx = async () => {
      setIsGeneratingPptx(true);
      try {
         await generatePptx(data);
      } catch (err) {
         console.error('Error generating PPTX:', err);
         alert('Lỗi khi tạo file PPTX. Vui lòng thử lại.');
      } finally {
         setIsGeneratingPptx(false);
      }
   };

   const isTabAvailable = (tab: TabType): boolean => {
      return TAB_STEP_MAP[tab] <= currentStep;
   };

   const getTabClass = (tab: TabType) => {
      const isActive = activeTab === tab;
      const available = isTabAvailable(tab);
      if (!available) return 'px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap bg-gray-100 text-gray-400 cursor-not-allowed';
      return `px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${isActive ? 'bg-primary text-white shadow-sm' : 'bg-teal-50 text-teal-900 hover:bg-teal-100'}`;
   };

   // Icons cho hoạt động dạy học
   const activityIcons: Record<string, string> = {
      'khởi động': '🚀', 'hình thành': '📖', 'luyện tập': '✍️', 'vận dụng': '🎯',
   };
   const getActivityIcon = (name: string) => {
      const lower = name.toLowerCase();
      for (const [key, icon] of Object.entries(activityIcons)) {
         if (lower.includes(key)) return icon;
      }
      return '📋';
   };
   const getActivityColor = (index: number) => {
      const colors = [
         { bg: 'bg-amber-50', border: 'border-amber-200', accent: 'border-l-amber-500', text: 'text-amber-900', badge: 'bg-amber-100 text-amber-700' },
         { bg: 'bg-blue-50', border: 'border-blue-200', accent: 'border-l-blue-500', text: 'text-blue-900', badge: 'bg-blue-100 text-blue-700' },
         { bg: 'bg-emerald-50', border: 'border-emerald-200', accent: 'border-l-emerald-500', text: 'text-emerald-900', badge: 'bg-emerald-100 text-emerald-700' },
         { bg: 'bg-purple-50', border: 'border-purple-200', accent: 'border-l-purple-500', text: 'text-purple-900', badge: 'bg-purple-100 text-purple-700' },
      ];
      return colors[index % colors.length];
   };

   /** Component nút TIẾP TỤC */
   const ContinueButton = () => {
      if (currentStep >= totalSteps - 1) return null; // Đã hoàn thành tất cả
      // Chỉ hiện nút khi đang ở tab hiện tại
      const stepToTab: TabType[] = ['summary', 'teaching-process', 'methods', 'games', 'simulation', 'lesson-plan'];
      if (activeTab !== stepToTab[currentStep]) return null;

      const nextStepName = STEP_NAMES[currentStep + 1] || 'Bước tiếp';

      return (
         <div className="mt-8 pt-6 border-t border-gray-200">
            {/* Progress bar */}
            <div className="mb-4">
               <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Tiến trình</span>
                  <span>{currentStep + 1}/{totalSteps} bước hoàn thành</span>
               </div>
               <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                     className="bg-gradient-to-r from-teal-500 to-cyan-500 h-2 rounded-full transition-all duration-500"
                     style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
                  />
               </div>
            </div>

            {/* Error message */}
            {stepError && (
               <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 animate-fadeIn">
                  <span className="material-symbols-outlined text-red-500 mt-0.5">error</span>
                  <div className="flex-1">
                     <h4 className="font-bold text-sm">Lỗi khi tạo nội dung</h4>
                     <p className="text-sm mt-1">{stepError}</p>
                     <div className="flex gap-2 mt-3">
                        <button
                           onClick={onOpenSettings}
                           className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                        >
                           🔑 Đổi API Key
                        </button>
                        <button
                           onClick={onContinue}
                           className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                           🔄 Thử lại
                        </button>
                     </div>
                  </div>
               </div>
            )}

            {/* Button Continue */}
             {!stepError && (
                <button
                   onClick={onContinue}
                   disabled={isStepLoading}
                  className="w-full py-4 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-bold rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 hover:shadow-xl flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 text-lg"
               >
                  {isStepLoading ? (
                     <>
                        <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                        <span>Đang tạo {nextStepName}...</span>
                     </>
                  ) : (
                     <>
                        <span className="material-symbols-outlined text-xl">play_arrow</span>
                        <span>TIẾP TỤC — Tạo {nextStepName}</span>
                     </>
                  )}
               </button>
            )}
            {isStepLoading && (
               <p className="text-center text-teal-500 text-sm mt-2 animate-pulse">
                  Bước {currentStep + 2}/{totalSteps} — quá trình có thể mất 15-30 giây...
               </p>
            )}
         </div>
      );
   };

   /** Completed all steps banner + PPTX button */
   const AllStepsCompleted = () => {
      if (currentStep < totalSteps - 1) return null;
      return (
         <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-5 mb-4 flex items-center gap-4">
               <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center text-2xl shadow-md">✓</div>
               <div className="flex-1">
                  <p className="font-bold text-emerald-900">Hoàn thành 6/6 bước!</p>
                  <p className="text-sm text-emerald-700">Chuyển sang tab <strong>🏆 Hoàn thiện giáo án pro</strong> để tổng hợp giáo án hoàn chỉnh và tạo slide thuyết trình.</p>
               </div>
            </div>
         </div>
      );
   };

   return (
      <div className="flex flex-col gap-6">
         {/* Tabs */}
         <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button className={getTabClass('summary')} onClick={() => isTabAvailable('summary') && setActiveTab('summary')}>📊 Tổng Quan</button>
            <button className={getTabClass('teaching-process')} onClick={() => isTabAvailable('teaching-process') && setActiveTab('teaching-process')}>📋 Tiến Trình</button>
            <button className={getTabClass('methods')} onClick={() => isTabAvailable('methods') && setActiveTab('methods')}>🎨 Phương Pháp</button>
            <button className={getTabClass('games')} onClick={() => isTabAvailable('games') && setActiveTab('games')}>🎮 Trò Chơi</button>
            <button className={getTabClass('simulation')} onClick={() => isTabAvailable('simulation') && setActiveTab('simulation')}>🔬 Mô Phỏng</button>
            <button className={getTabClass('lesson-plan')} onClick={() => isTabAvailable('lesson-plan') && setActiveTab('lesson-plan')}>✨ Phụ Lục</button>
            <button
               className={`${getTabClass('pro-plan')} ${isTabAvailable('pro-plan') ? (activeTab === 'pro-plan' ? '' : 'bg-gradient-to-r from-amber-50 to-orange-50 text-amber-800 border border-amber-300') : ''}`}
               onClick={() => isTabAvailable('pro-plan') && setActiveTab('pro-plan')}
            >🏆 Hoàn thiện giáo án pro</button>
         </div>

         <div className="min-h-[400px]">
            {/* Summary Tab */}
            {activeTab === 'summary' && (
               <div ref={summaryRef} className="animate-fadeIn">
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                        <div className="flex gap-3 items-start">
                           <span className="material-symbols-outlined text-blue-500 text-2xl">menu_book</span>
                           <div>
                              <h4 className="font-bold text-blue-900">Chủ đề bài học</h4>
                               <p className="text-blue-800 mt-1 font-medium">{fixLatexContent(data.summary.topic)}</p>
                               <p className="text-blue-600 text-sm mt-1">{fixLatexContent(data.summary.subject)}</p>
                           </div>
                        </div>
                     </div>
                      <div className="md:col-span-2 bg-red-50 border border-red-200 rounded-xl p-6">
                        <div className="flex gap-3 items-start">
                           <span className="material-symbols-outlined text-red-500 text-2xl">warning</span>
                           <div className="min-w-0 flex-1">
                              <h4 className="font-bold text-red-900">Điểm cần cải thiện</h4>
                               <div className="text-red-800 mt-2 text-sm leading-relaxed max-h-[400px] overflow-y-auto space-y-2">
                                  {fixLatexContent(data.summary.weakness).split(/(?=\d+\.)/).filter(s => s.trim()).map((item, idx) => (
                                     <p key={idx} className="pl-1">{item.trim()}</p>
                                  ))}
                               </div>
                           </div>
                        </div>
                     </div>
                      <div className="md:col-span-3 bg-emerald-50 border border-emerald-200 rounded-xl p-6">
                        <div className="flex gap-3 items-start">
                           <span className="material-symbols-outlined text-emerald-500 text-2xl">lightbulb</span>
                           <div className="min-w-0 flex-1">
                              <h4 className="font-bold text-emerald-900">Giải pháp đề xuất</h4>
                              <div className="text-emerald-800 mt-1 text-sm leading-relaxed whitespace-pre-line break-words max-h-[400px] overflow-y-auto">
                                 {fixLatexContent(data.summary.proposal)}
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* DOCX Modifications */}
                  {data.docxModifications && data.docxModifications.length > 0 && (
                     <div className="mt-6">
                        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-xl p-5 shadow-sm">
                           <div className="flex items-center gap-3 mb-3">
                              <span className="material-symbols-outlined text-red-500 text-xl">edit_document</span>
                              <h4 className="font-bold text-red-900">Nội dung đề xuất bổ sung vào giáo án</h4>
                           </div>
                           <p className="text-sm text-red-700 mb-3">
                              AI đã đề xuất <strong>{data.docxModifications.length} thay đổi</strong> cho giáo án của bạn.
                              Nhấn nút bên dưới để tải file DOCX với nội dung mới <span className="text-red-600 font-bold">bôi đỏ</span>.
                           </p>
                           <button
                              className="mt-3 flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-sm transition-colors"
                              onClick={downloadModifiedDocx}
                              disabled={isExporting}
                           >
                              {isExporting ? (
                                 <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                              ) : (
                                 <span className="material-symbols-outlined text-sm">download</span>
                              )}
                              {isExporting ? 'Đang tạo file...' : 'Tải DOCX Nâng Cấp (chữ đỏ)'}
                           </button>
                        </div>
                     </div>
                  )}

                  <ContinueButton />
               </div>
            )}

            {/* Teaching Process Tab */}
            {activeTab === 'teaching-process' && (
               <div ref={teachingProcessRef} className="flex flex-col gap-6 animate-fadeIn">
                  {data.teachingProcess && data.teachingProcess.length > 0 ? (
                     <>
                        <div className="bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-lg p-4 flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm">📋</div>
                           <div>
                              <p className="font-bold text-teal-900">Tiến Trình Dạy Học Đề Xuất</p>
                              <p className="text-sm text-teal-700">Gồm {data.teachingProcess.length} hoạt động, thiết kế theo cấu trúc giáo án chuẩn.</p>
                           </div>
                        </div>

                        {data.teachingProcess.map((activity, idx) => {
                           const color = getActivityColor(idx);
                           const icon = getActivityIcon(activity.activityName);
                           return (
                              <div className={`${color.bg} border ${color.border} rounded-xl shadow-sm border-l-4 ${color.accent} overflow-hidden`} key={idx}>
                                 <div className="p-5 pb-3">
                                    <div className="flex items-center gap-3 mb-3">
                                       <span className="text-2xl">{icon}</span>
                                       <div>
                                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color.badge}`}>Hoạt động {idx + 1}</span>
                                          <h4 className={`text-lg font-bold ${color.text} mt-1`}>{activity.activityName}</h4>
                                       </div>
                                    </div>
                                 </div>
                                 <div className="px-5 pb-5 space-y-4">
                                    {[
                                       { icon: 'flag', label: 'Mục tiêu', value: activity.objective },
                                       { icon: 'article', label: 'Nội dung', value: activity.content },
                                       { icon: 'inventory_2', label: 'Sản phẩm đạt được', value: activity.expectedProduct },
                                       { icon: 'timeline', label: 'Tiến trình tổ chức thực hiện', value: activity.implementation },
                                       { icon: 'task_alt', label: 'Kết luận, nhận định', value: activity.conclusion },
                                    ].map((item, i) => (
                                       <div className="bg-white/70 rounded-lg p-4" key={i}>
                                          <div className="flex items-center gap-2 mb-2">
                                             <span className="material-symbols-outlined text-sm text-gray-500">{item.icon}</span>
                                             <strong className="text-gray-700 text-sm">{item.label}</strong>
                                          </div>
                                          <div className="text-gray-700 text-sm leading-relaxed space-y-1.5">
                                              {fixLatexContent(item.value)
                                                .split(/(?=\d+[\.\)])(?!\d{2,})/)
                                                .flatMap(chunk => chunk.split(/(?=\[HƯỚNG DẪN|\[GAME|\[TRÒ CHƠI|\[MỤC TIÊU|\[BƯỚC|\[KẾT LUẬN|\[SẢN PHẨM|Web\/App|Prompt mẫu|Các bước:|Mẹo sử dụng)/))
                                                .filter(s => s.trim())
                                                .map((part, pIdx) => {
                                                  const trimmed = part.trim();
                                                  const isHeading = /^\[.*\]/.test(trimmed);
                                                  const isStep = /^\d+[\.\)]/.test(trimmed);
                                                  const isSubItem = /^(Web\/App|Prompt mẫu|Các bước:|Mẹo sử dụng|Công cụ)/.test(trimmed);
                                                  if (isHeading) return <p key={pIdx} className="font-bold text-purple-700 mt-2 mb-1">{trimmed}</p>;
                                                  if (isSubItem) return <p key={pIdx} className="pl-4 text-indigo-700 border-l-2 border-indigo-200 ml-2">{trimmed}</p>;
                                                  if (isStep) return <p key={pIdx} className="pl-2">{trimmed}</p>;
                                                  return <p key={pIdx}>{trimmed}</p>;
                                                })
                                              }
                                           </div>
                                       </div>
                                    ))}
                                 </div>
                              </div>
                           );
                        })}
                     </>
                  ) : (
                     <div className="text-center py-10 text-gray-400">
                        <span className="material-symbols-outlined text-5xl mb-2 opacity-50">assignment</span>
                        <p>Tiến trình dạy học chưa được tạo.</p>
                     </div>
                  )}
                  <ContinueButton />
               </div>
            )}

            {/* Methods Tab */}
            {activeTab === 'methods' && (
               <div ref={methodsRef} className="flex flex-col gap-6 animate-fadeIn">
                  {data.methods.map((method, idx) => (
                     <div className="bg-white border border-teal-100 rounded-xl p-6 shadow-sm border-l-4 border-l-primary" key={idx}>
                        <h4 className="text-xl font-bold text-primary mb-2 flex items-center gap-2">
                           <span className="material-symbols-outlined">layers</span> {method.name}
                        </h4>
                        <p className="text-gray-600 mb-4">{fixLatexContent(method.description)}</p>
                        <div className="bg-teal-50 p-4 rounded-lg">
                           <strong className="text-teal-900 block mb-2">Các bước thực hiện:</strong>
                           <ul className="list-disc list-inside space-y-1 text-teal-800">
                              {method.steps.map((step, sIdx) => <li key={sIdx}>{fixLatexContent(step)}</li>)}
                           </ul>
                        </div>
                     </div>
                  ))}
                  <ContinueButton />
               </div>
            )}

            {/* Games Tab */}
            {activeTab === 'games' && (
               <div ref={gamesRef} className="animate-fadeIn">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     {data.games.map((game, idx) => (
                        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm" key={idx}>
                           <div className="flex justify-between items-center mb-4">
                              <h4 className="text-lg font-bold text-gray-800">{game.name}</h4>
                              <span className="bg-gray-100 px-2 py-1 rounded text-xs font-bold text-gray-600">
                                 {game.duration}
                              </span>
                           </div>
                           <p className="text-sm text-gray-600 mb-4">🎯 <strong>Mục tiêu:</strong> {fixLatexContent(game.objective)}</p>
                           <div className="bg-gray-50 p-4 rounded-lg">
                              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                                 {game.steps.map((step, sIdx) => <li key={sIdx}>{fixLatexContent(step)}</li>)}
                              </ol>
                           </div>
                        </div>
                     ))}
                  </div>
                  <ContinueButton />
               </div>
            )}

            {/* Simulation Tab — trolytaomophong style */}
            {activeTab === 'simulation' && (
               <div className="animate-fadeIn">
                  {data.simulation ? (
                     <SimulationView
                        simulation={data.simulation}

                     />
                  ) : (
                     <div className="text-center py-10 text-gray-400">
                        <span className="material-symbols-outlined text-5xl mb-2 opacity-50">model_training</span>
                        <p>Mô phỏng chưa được tạo.</p>
                     </div>
                  )}
                  <ContinueButton />
               </div>
            )}

            {/* Lesson Plan / Phụ Lục Tab */}
            {activeTab === 'lesson-plan' && (
               <div className="animate-fadeIn">
                  <div ref={lessonPlanRef} className="lesson-plan-container">
                     <style>{`
                        .change-block { margin: 16px 0; padding: 16px; border-radius: 8px; }
                        .type-add { background: #f0fdf4; border-left: 4px solid #22c55e; }
                        .type-modify { background: #fefce8; border-left: 4px solid #eab308; }
                        .change-block h4.location { font-weight: bold; color: #1f2937; font-size: 0.95em; margin-bottom: 4px; }
                        .change-block .instruction { color: #4b5563; font-size: 0.9em; margin-bottom: 8px; font-style: italic; }
                        .change-block .content { font-size: 0.95em; line-height: 1.7; color: #111827; }
                     `}</style>
                     {data.fullPlanHtml ? (
                        <div dangerouslySetInnerHTML={{ __html: data.fullPlanHtml }} />
                     ) : (
                        <div className="text-center py-10 text-gray-400">
                           <span className="material-symbols-outlined text-5xl mb-2 opacity-50">description</span>
                           <p>Phụ lục chưa được tạo.</p>
                        </div>
                     )}
                  </div>

                  {data.fullPlanHtml && (
                     <div className="flex flex-wrap justify-center gap-4 mt-8 pt-6 border-t border-gray-200">
                        {docxArrayBuffer && data.docxModifications && data.docxModifications.length > 0 && (
                           <button
                              className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-sm transition-colors"
                              onClick={downloadModifiedDocx}
                              disabled={isExporting}
                           >
                              {isExporting ? (
                                 <span className="material-symbols-outlined animate-spin">progress_activity</span>
                              ) : (
                                 <span className="material-symbols-outlined">description</span>
                              )}
                              {isExporting ? 'Đang tạo...' : 'Tải DOCX Nâng Cấp (chữ đỏ)'}
                           </button>
                        )}
                        <button className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-hover text-white font-bold rounded-lg shadow-sm transition-colors" onClick={downloadDocx}>
                           <span className="material-symbols-outlined">download</span> Tải Phụ Lục (.doc - Có LaTeX)
                        </button>
                     </div>
                  )}
                  <AllStepsCompleted />
               </div>
            )}

            {/* Pro Lesson Plan Tab */}
            {activeTab === 'pro-plan' && (
               <div className="animate-fadeIn">
                  {!proLessonPlanHtml ? (
                     <div className="text-center py-12">
                        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-8 max-w-2xl mx-auto shadow-sm">
                           <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-5 shadow-lg">
                              <span className="text-4xl">🏆</span>
                           </div>
                           <h3 className="text-2xl font-bold text-amber-900 mb-3">Hoàn thiện giáo án pro</h3>
                           <p className="text-amber-700 mb-2 leading-relaxed">
                              AI sẽ tổng hợp <strong>tất cả dữ liệu</strong> để tạo <strong>1 giáo án hoàn chỉnh</strong>, sẵn sàng sử dụng.
                           </p>

                           {proGenError && (
                              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                                 <span className="material-symbols-outlined text-sm align-middle mr-1">error</span>
                                 {proGenError}
                              </div>
                           )}

                           <button
                              className="px-8 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl shadow-lg transition-all flex items-center gap-3 mx-auto disabled:opacity-60 disabled:cursor-not-allowed"
                              onClick={async () => {
                                 if (!apiKey) { setProGenError('Vui lòng cài đặt API Key trước.'); return; }
                                 setIsGeneratingProPlan(true);
                                 setProGenError(null);
                                 try {
                                    const html = await generateFullProLessonPlan(data, docxText || null, apiKey!, selectedModel || 'gemini-3-flash-preview', data.fullPlanHtml || null);
                                    setProLessonPlanHtml(html);
                                 } catch (err: any) {
                                    setProGenError(err.message || 'Đã xảy ra lỗi.');
                                 } finally {
                                    setIsGeneratingProPlan(false);
                                 }
                              }}
                              disabled={isGeneratingProPlan}
                           >
                              {isGeneratingProPlan ? (
                                 <><span className="material-symbols-outlined animate-spin text-xl">progress_activity</span><span>Đang tạo...</span></>
                              ) : (
                                 <><span className="material-symbols-outlined text-xl">auto_awesome</span><span>Tạo Giáo Án Hoàn Chỉnh</span></>
                              )}
                           </button>
                        </div>
                     </div>
                  ) : (
                     <div>
                        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-4 mb-6 flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-sm">✓</div>
                           <div className="flex-1">
                              <p className="font-bold text-emerald-900">Giáo án hoàn chỉnh đã sẵn sàng!</p>
                              <p className="text-sm text-emerald-700">Bạn có thể xem trực tiếp hoặc tải về dưới dạng file .docx</p>
                           </div>
                           <button className="text-sm text-amber-600 hover:text-amber-700 font-bold underline" onClick={() => { setProLessonPlanHtml(null); setProGenError(null); }}>
                              Tạo lại
                           </button>
                        </div>

                        <div ref={proLessonPlanRef} className="pro-lesson-plan-container bg-white border border-gray-200 rounded-xl shadow-sm p-6 md:p-8 prose prose-teal max-w-none">
                           <style>{`
                              .pro-lesson-plan-container { font-family: 'Times New Roman', serif; line-height: 1.6; }
                              .pro-lesson-plan-container h2 { color: #0d9488; border-bottom: 2px solid #ccfbf1; padding-bottom: 8px; margin-top: 24px; }
                              .pro-lesson-plan-container h3 { color: #115e59; margin-top: 16px; }
                              .pro-lesson-plan-container table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
                              .pro-lesson-plan-container th { background: #0d9488; color: white; padding: 10px 12px; border: 1px solid #0f766e; }
                              .pro-lesson-plan-container td { padding: 8px 12px; border: 1px solid #d1d5db; }
                              .pro-lesson-plan-container tr:nth-child(even) { background: #f0fdfa; }
                              .pro-lesson-plan-container .activity-block { background: #f0fdfa; border-left: 4px solid #0d9488; padding: 16px; margin: 12px 0; border-radius: 8px; }
                              .pro-lesson-plan-container .game-block { background: #fef9c3; border-left: 4px solid #ca8a04; padding: 16px; margin: 12px 0; border-radius: 8px; }
                              .pro-lesson-plan-container .note-block { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px; margin: 8px 0; border-radius: 6px; }
                               .pro-lesson-plan-container p { margin-bottom: 8px; text-indent: 0; }
                               .pro-lesson-plan-container ul, .pro-lesson-plan-container ol { padding-left: 24px; margin: 8px 0; }
                               .pro-lesson-plan-container li { margin-bottom: 4px; }
                               .pro-lesson-plan-container h4 { color: #134e4a; margin-top: 12px; margin-bottom: 6px; font-weight: bold; }
                               .pro-lesson-plan-container .activity-block p, .pro-lesson-plan-container .game-block p, .pro-lesson-plan-container .note-block p { margin-bottom: 6px; }
                               .pro-lesson-plan-container br + br { display: none; }
                           `}</style>
                           <div dangerouslySetInnerHTML={{ __html: (() => {
                                  let html = proLessonPlanHtml;
                                  // Post-process: tách text dài thành paragraphs
                                  // Thêm <br> sau mỗi dấu chấm + space nếu không nằm trong thẻ
                                  html = html.replace(/([.!?])\s+(\d+\.|[A-Z]|[IVXLC]+\.|[a-z]\)|\*|\+|-\s)/g, '$1</p><p>$2');
                                  // Wrap bare text nodes sau heading
                                  html = html.replace(/(<\/h[234]>)\s*([^<])/g, '$1<p>$2');
                                  return html;
                               })() }} />
                        </div>

                        <div className="flex flex-wrap justify-center gap-4 mt-8 pt-6 border-t border-gray-200">
                           <button
                              className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-hover text-white font-bold rounded-lg shadow-sm transition-colors"
                              onClick={() => {
                                 const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><style>body{font-family:'Times New Roman',serif;font-size:13pt;line-height:1.6;margin:2cm;}h2{color:#0d9488;border-bottom:2px solid #ccfbf1;padding-bottom:6px;}table{width:100%;border-collapse:collapse;margin:10px 0;}th{background:#0d9488;color:white;padding:8px;border:1px solid #ddd;}td{padding:8px;border:1px solid #ddd;}.activity-block{background:#f0fdfa;border-left:4px solid #0d9488;padding:14px;margin:10px 0;}.game-block{background:#fef9c3;border-left:4px solid #ca8a04;padding:14px;margin:10px 0;}.note-block{background:#eff6ff;border-left:4px solid #3b82f6;padding:12px;margin:8px 0;}p{margin-bottom:6pt;}ul,ol{padding-left:24pt;margin:6pt 0;}li{margin-bottom:4pt;}h3{margin-top:12pt;color:#115e59;}h4{margin-top:10pt;color:#134e4a;}</style></head><body>`;
                                 const footer = '</body></html>';
                                 const blob = new Blob(['\ufeff', header + proLessonPlanHtml + footer], { type: 'application/msword' });
                                 const url = URL.createObjectURL(blob);
                                 const link = document.createElement('a');
                                 link.href = url;
                                 link.download = `GiaoAn_HoanChinh_${(data.summary.topic || 'Pro').replace(/\s+/g, '_')}.doc`;
                                 document.body.appendChild(link);
                                 link.click();
                                 document.body.removeChild(link);
                                 URL.revokeObjectURL(url);
                              }}
                           >
                              <span className="material-symbols-outlined">download</span>
                              Tải kế hoạch bài dạy hoàn chỉnh (.docx)
                           </button>
                           <button
                              onClick={handleGeneratePptx}
                              disabled={isGeneratingPptx}
                              className="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg shadow-sm transition-colors disabled:opacity-60"
                           >
                              {isGeneratingPptx ? (
                                 <span className="material-symbols-outlined animate-spin">progress_activity</span>
                              ) : (
                                 <span className="material-symbols-outlined">slideshow</span>
                              )}
                              {isGeneratingPptx ? 'Đang tạo PPTX...' : '📊 Tạo Slide Thuyết Trình (PPTX)'}
                           </button>
                           <button
                              className="flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg shadow-sm transition-colors border border-slate-300"
                              onClick={() => {
                                 if (proLessonPlanRef.current) {
                                    const text = proLessonPlanRef.current.innerText;
                                    navigator.clipboard.writeText(text).then(() => alert('Đã sao chép!')).catch(console.error);
                                 }
                              }}
                           >
                              <span className="material-symbols-outlined">content_copy</span>
                              Sao chép nội dung
                           </button>
                        </div>
                     </div>
                  )}
               </div>
            )}
         </div>
      </div>
   );
};

export default ResultDisplay;