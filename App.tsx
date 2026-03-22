import React, { useState, useEffect } from 'react';
import InputForm from './components/InputForm';
import ResultDisplay from './components/ResultDisplay';
import ApiKeyModal from './components/ApiKeyModal';
import ProAuthModal from './components/ProAuthModal';
import {
  generateStepSummary,
  generateStepTeachingProcess,
  generateStepMethods,
  generateStepGames,
  generateStepSimulation,
  generateStepAppendix,
} from './services/geminiService';
import {
  saveSessionToStorage,
  loadSessionFromStorage,
  clearSessionFromStorage,
  exportSessionToFile,
  importSessionFromFile,
  SessionData,
} from './services/sessionService';
import { LessonInput, LessonPlanResponse, LoadingState } from './types';

/** Tên các bước */
export const STEP_NAMES = [
  'Tổng Quan',
  'Tiến Trình Dạy Học',
  'Phương Pháp',
  'Trò Chơi',
  'Mô Phỏng',
  'Phụ Lục',
];

const App: React.FC = () => {
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [partialResult, setPartialResult] = useState<Partial<LessonPlanResponse>>({});
  const [currentStep, setCurrentStep] = useState(-1); // -1 = chưa bắt đầu
  const [isStepLoading, setIsStepLoading] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [docxArrayBuffer, setDocxArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [docxText, setDocxText] = useState<string | null>(null);
  const [isProUser, setIsProUser] = useState(false);
  const [showProAuthModal, setShowProAuthModal] = useState(false);
  const [currentInput, setCurrentInput] = useState<LessonInput | null>(null);
  const [showSessionRestore, setShowSessionRestore] = useState(false);
  const [savedSession, setSavedSession] = useState<SessionData | null>(null);

  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    const storedModel = localStorage.getItem('gemini_model');
    if (storedKey) setApiKey(storedKey);
    if (storedModel) setSelectedModel(storedModel);
    if (!storedKey) setIsSettingsOpen(true);
    if (localStorage.getItem('pro_authenticated') === 'true') setIsProUser(true);
    
    // Kiểm tra phiên cũ
    const session = loadSessionFromStorage();
    if (session && session.currentStep >= 0) {
      setSavedSession(session);
      setShowSessionRestore(true);
    }
  }, []);

  const handleSaveSettings = (key: string, model: string) => {
    setApiKey(key);
    setSelectedModel(model);
    localStorage.setItem('gemini_api_key', key);
    localStorage.setItem('gemini_model', model);
  };

  /** Khôi phục phiên từ SessionData */
  const restoreSession = (session: SessionData) => {
    setCurrentStep(session.currentStep);
    setPartialResult(session.partialResult);
    setDocxText(session.docxText);
    setCurrentInput({
      config: session.input.config,
      fileName: session.input.fileName,
      mimeType: session.input.mimeType,
      docxText: session.input.docxText,
    });
    setLoadingState(LoadingState.SUCCESS);
    setShowSessionRestore(false);
  };

  /** Bước 1: Submit form → chỉ tạo Summary */
  const handleSubmit = async (data: LessonInput) => {
    if (!apiKey) { setIsSettingsOpen(true); return; }

    setLoadingState(LoadingState.LOADING);
    setErrorMessage(null);
    setStepError(null);
    setCurrentInput(data);
    if (data.docxArrayBuffer) setDocxArrayBuffer(data.docxArrayBuffer);
    else setDocxArrayBuffer(null);
    setDocxText(data.docxText || null);

    try {
      const summary = await generateStepSummary(data, apiKey, selectedModel);
      const result: Partial<LessonPlanResponse> = { summary };
      setPartialResult(result);
      setCurrentStep(0);
      setLoadingState(LoadingState.SUCCESS);
      // Auto-save
      saveSessionToStorage(0, data, data.docxText || null, result);
    } catch (error: any) {
      console.error(error);
      setLoadingState(LoadingState.ERROR);
      setErrorMessage(error.message || 'Vui lòng kiểm tra file và thử lại.');
    }
  };

  /** Tiếp tục bước tiếp theo */
  const handleContinue = async () => {
    if (!currentInput || !partialResult.summary) return;
    if (!apiKey) { setIsSettingsOpen(true); return; }

    const nextStep = currentStep + 1;
    setIsStepLoading(true);
    setStepError(null);

    try {
      let newResult = { ...partialResult };

      switch (nextStep) {
        case 1: // Tiến trình
          newResult.teachingProcess = await generateStepTeachingProcess(
            currentInput, partialResult.summary!, apiKey, selectedModel
          );
          break;
        case 2: // Phương pháp
          newResult.methods = await generateStepMethods(
            currentInput, partialResult.summary!, apiKey, selectedModel
          );
          break;
        case 3: // Trò chơi
          newResult.games = await generateStepGames(
            currentInput, partialResult.summary!, apiKey, selectedModel
          );
          break;
        case 4: // Mô phỏng
          newResult.simulation = await generateStepSimulation(
            currentInput, partialResult.summary!, apiKey, selectedModel
          );
          break;
        case 5: // Phụ lục
          const appendix = await generateStepAppendix(
            currentInput, partialResult.summary!, partialResult.methods || [], apiKey, selectedModel
          );
          newResult.fullPlanHtml = appendix.fullPlanHtml;
          newResult.docxModifications = appendix.docxModifications;
          break;
      }

      setPartialResult(newResult);
      setCurrentStep(nextStep);
      // Auto-save
      saveSessionToStorage(nextStep, currentInput, docxText, newResult);
    } catch (error: any) {
      console.error(error);
      setStepError(error.message || 'Lỗi khi tạo nội dung. Thử đổi API Key hoặc thử lại.');
    } finally {
      setIsStepLoading(false);
    }
  };

  const handleReset = () => {
    setPartialResult({});
    setCurrentStep(-1);
    setCurrentInput(null);
    setLoadingState(LoadingState.IDLE);
    setErrorMessage(null);
    setStepError(null);
    clearSessionFromStorage();
  };

  /** Lưu phiên ra file */
  const handleExportSession = () => {
    if (currentInput && currentStep >= 0) {
      exportSessionToFile(currentStep, currentInput, docxText, partialResult);
    }
  };

  /** Tải phiên từ file */
  const handleImportSession = async () => {
    const session = await importSessionFromFile();
    if (session) restoreSession(session);
  };

  // Tạo result đầy đủ cho ResultDisplay (fill defaults cho các field chưa có)
  const resultForDisplay: LessonPlanResponse = {
    summary: partialResult.summary || { subject: '', topic: '', weakness: '', proposal: '' },
    methods: partialResult.methods || [],
    games: partialResult.games || [],
    simulation: partialResult.simulation,
    fullPlanHtml: partialResult.fullPlanHtml || '',
    teachingProcess: partialResult.teachingProcess,
    docxModifications: partialResult.docxModifications,
  };

  const showResult = currentStep >= 0 && loadingState === LoadingState.SUCCESS;

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:bg-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600 dark:from-indigo-900 dark:via-blue-900 dark:to-purple-900 backdrop-blur-md border-b border-indigo-400/30 px-6 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-4">
          <button className="flex items-center justify-center p-2 rounded-full hover:bg-white/20 transition-colors" onClick={handleReset}>
            <span className="material-symbols-outlined text-white">arrow_back</span>
          </button>
          <div className="flex items-center gap-3">
            <img src="/logo-truong.jpg" alt="Logo Trường THPT Hoàng Su Phì" className="w-10 h-10 rounded-full border-2 border-white/50 shadow-md object-cover" />
            <div className="flex flex-col">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-white">TRỢ GIẢNG AI</h1>
              <p className="text-sm font-medium text-blue-100">Nâng cấp bài giảng tự động - Cao Xuân Tường, GV Sinh học</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Nút lưu/tải phiên */}
          {showResult && (
            <>
              <button
                onClick={handleExportSession}
                className="flex items-center gap-1 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors text-xs font-bold border border-blue-200"
                title="Lưu phiên làm việc"
              >
                <span className="material-symbols-outlined text-[16px]">save</span>
                <span className="hidden sm:inline">Lưu phiên</span>
              </button>
              <button
                onClick={handleImportSession}
                className="flex items-center gap-1 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors text-xs font-bold border border-blue-200"
                title="Tải phiên làm việc"
              >
                <span className="material-symbols-outlined text-[16px]">folder_open</span>
                <span className="hidden sm:inline">Tải phiên</span>
              </button>
            </>
          )}

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-sm font-bold border border-white/30"
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
            {!apiKey && <span className="text-yellow-200 hidden sm:inline">Lấy API key để sử dụng app</span>}
          </button>

          <button 
            className={`flex items-center gap-2 px-5 py-2 text-sm font-bold rounded-lg transition-colors shadow-sm ${isProUser ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-yellow-300 hover:bg-yellow-400 text-yellow-900 border border-yellow-400'}`}
            onClick={() => !isProUser && setShowProAuthModal(true)}
          >
            <span className="material-symbols-outlined text-[20px]">{isProUser ? 'verified' : 'lock'}</span>
            <span>{isProUser ? 'Pro đã kích hoạt' : 'Nâng cấp Pro'}</span>
          </button>
        </div>
      </header>

      {/* Session Restore Banner */}
      {showSessionRestore && savedSession && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-3 flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-blue-600">restore</span>
            <div>
              <p className="font-bold text-blue-900 text-sm">Phát hiện phiên làm việc trước đó</p>
              <p className="text-blue-700 text-xs">
                Bước {savedSession.currentStep + 1}/6 — {new Date(savedSession.timestamp).toLocaleString('vi-VN')}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => restoreSession(savedSession)}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors"
            >
              Khôi phục
            </button>
            <button
              onClick={() => { setShowSessionRestore(false); clearSessionFromStorage(); }}
              className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold rounded-lg transition-colors"
            >
              Bỏ qua
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-6 lg:p-8">
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 animate-fadeIn">
            <span className="material-symbols-outlined text-red-500 mt-0.5">error</span>
            <div>
              <h4 className="font-bold">Đã xảy ra lỗi</h4>
              <p className="text-sm mt-1">{errorMessage}</p>
            </div>
          </div>
        )}

        {!showResult ? (
          <InputForm onSubmit={handleSubmit} loadingState={loadingState} />
        ) : (
          <ResultDisplay
            data={resultForDisplay}
            onReset={handleReset}
            docxArrayBuffer={docxArrayBuffer}
            apiKey={apiKey}
            selectedModel={selectedModel}
            docxText={docxText}
            isProUser={isProUser}
            onRequestProAuth={() => setShowProAuthModal(true)}
            currentStep={currentStep}
            totalSteps={6}
            onContinue={handleContinue}
            isStepLoading={isStepLoading}
            stepError={stepError}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gradient-to-r from-indigo-900 via-blue-900 to-purple-900 text-slate-200 py-10 px-4 mt-auto border-t border-indigo-700/50 no-print">
        <div className="max-w-5xl mx-auto">
          {/* Thông tin tác giả */}
          <div className="flex flex-col md:flex-row items-center gap-6 mb-8 p-6 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-sm">
            <img src="/logo-truong.jpg" alt="Logo Trường THPT Hoàng Su Phì" className="w-24 h-24 rounded-xl border-2 border-white/30 shadow-xl object-cover" />
            <div className="text-center md:text-left space-y-1.5">
              <h3 className="text-xl font-bold text-white">Cao Xuân Tường</h3>
              <p className="text-blue-200 font-medium">Giáo viên Sinh học</p>
              <p className="text-blue-200">Trường THPT Hoàng Su Phì</p>
              <p className="text-slate-300 text-sm">📍 Xã Hoàng Su Phì, Tỉnh Tuyên Quang</p>
              <p className="text-slate-300 text-sm">📞 0987934113</p>
            </div>
          </div>
          {/* Phần đăng ký */}
          <div className="text-center mb-6 p-6 bg-gradient-to-r from-emerald-900/40 to-blue-900/40 rounded-2xl border border-emerald-500/20 backdrop-blur-sm">
            <p className="font-bold text-lg md:text-xl text-emerald-200 mb-3 leading-relaxed">
              ỨNG DỤNG AI HỖ TRỢ THIẾT KẾ BÀI GIẢNG
            </p>
            <p className="text-slate-300 text-sm mb-4">Powered by TRỢ GIẢNG AI</p>
          </div>
          <div className="text-center text-sm text-slate-400">
            <p>© 2025 TRỢ GIẢNG AI - Phát triển bởi Cao Xuân Tường</p>
          </div>
        </div>
      </footer>

      {/* Loading Overlay */}
      {loadingState === LoadingState.LOADING && (
        <div className="fixed inset-0 bg-white/90 dark:bg-black/80 z-[100] flex flex-col items-center justify-center backdrop-blur-sm">
          <div className="w-16 h-16 border-4 border-indigo-200 border-t-primary rounded-full animate-spin mb-4"></div>
          <h3 className="text-xl font-bold text-indigo-900 dark:text-white mb-2">Đang phân tích giáo án...</h3>
          <p className="text-indigo-600 dark:text-indigo-300 mb-1">Bước 1/6: Tạo tổng quan phân tích</p>
          <p className="text-indigo-500 text-sm animate-pulse">(Quá trình có thể mất 15-30 giây)</p>
        </div>
      )}

      {/* Settings Modal */}
      <ApiKeyModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
        initialApiKey={apiKey}
        initialModel={selectedModel}
      />

      {/* Pro Auth Modal */}
      <ProAuthModal
        isOpen={showProAuthModal}
        onClose={() => setShowProAuthModal(false)}
        onAuthenticated={(name) => {
          setIsProUser(true);
          setShowProAuthModal(false);
        }}
      />
    </div>
  );
};

export default App;
