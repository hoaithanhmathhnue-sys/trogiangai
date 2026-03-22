import React, { useState, useEffect } from 'react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (apiKey: string, model: string) => void;
  initialApiKey?: string;
  initialModel?: string;
}

const MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)', description: 'Nhanh nhất, tiết kiệm (Khuyên dùng)' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Preview)', description: 'Cân bằng tốc độ và chất lượng' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Ổn định, thế hệ trước' },
];

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSave, initialApiKey = '', initialModel = 'gemini-3-flash-preview' }) => {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [selectedModel, setSelectedModel] = useState(initialModel);
  const [error, setError] = useState('');

  useEffect(() => {
    setApiKey(initialApiKey);
    setSelectedModel(initialModel);
  }, [initialApiKey, initialModel]);

  const handleSave = () => {
    if (!apiKey.trim()) {
      setError('Vui lòng nhập API Key');
      return;
    }
    onSave(apiKey, selectedModel);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-fadeIn">

        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-3 sm:px-5 sm:py-4 text-white shrink-0">
          <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-xl">settings_suggest</span>
            Cấu hình AI Assistant
          </h2>
          <p className="text-teal-100 mt-0.5 opacity-90 text-xs sm:text-sm">Thiết lập kết nối để sử dụng tính năng tạo giáo án</p>
        </div>

        <div className="p-4 sm:p-5 space-y-5 overflow-y-auto flex-1 min-h-0">

          {/* API Key Section */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
              Google Gemini API Key <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setError('');
                }}
                placeholder="Nhập khóa API của bạn..."
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all outline-none"
              />
              <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-slate-400 text-xl">key</span>
            </div>
            {error && <p className="text-red-500 text-xs font-medium flex items-center gap-1"><span className="material-symbols-outlined text-xs">error</span>{error}</p>}

            <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 p-3 rounded-xl text-xs flex gap-2 items-start border border-blue-100 dark:border-blue-800">
              <span className="material-symbols-outlined text-blue-600 shrink-0 text-lg">info</span>
              <div>
                <p className="font-bold mb-0.5">Chưa có API Key?</p>
                <p>Truy cập <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 font-bold underline hover:text-blue-800">Google AI Studio</a> để lấy key miễn phí.</p>
              </div>
            </div>
          </div>

          {/* Model Selection */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
              Chọn Model AI (Ưu tiên)
            </label>
            <div className="grid grid-cols-1 gap-2">
              {MODELS.map((model) => (
                <div
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3 ${selectedModel === model.id
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-teal-200'
                    }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedModel === model.id ? 'border-teal-500' : 'border-slate-300'
                    }`}>
                    {selectedModel === model.id && <div className="w-2 h-2 rounded-full bg-teal-500" />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">{model.name}</h4>
                    <p className="text-slate-500 text-xs mt-0.5">{model.description}</p>
                  </div>
                  {model.id === 'gemini-3-flash-preview' && (
                    <span className="ml-auto bg-teal-100 text-teal-700 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0">DEFAULT</span>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-4 py-3 sm:px-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-800/50 shrink-0">
          {initialApiKey && (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Đóng
            </button>
          )}
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-teal-900/20 transition-all transform hover:-translate-y-0.5 focus:ring-4 focus:ring-teal-500/20"
          >
            Lưu Cấu Hình
          </button>
        </div>

      </div>
    </div>
  );
};

export default ApiKeyModal;
