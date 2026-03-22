import React, { useState, useRef } from 'react';
import { LessonInput, LessonConfig, ClassSize, TimeConstraint, LoadingState, SchoolLevel } from '../types';

const HIGHER_ED_LEVELS: SchoolLevel[] = ['vocational', 'college', 'university'];
const HISTORY_STORAGE_KEY = 'kh_bg_input_history';

/** Lưu lịch sử nhập liệu vào localStorage */
const saveInputHistory = (field: string, value: string) => {
  if (!value.trim()) return;
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    const history: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    if (!history[field]) history[field] = [];
    if (!history[field].includes(value)) {
      history[field] = [value, ...history[field]].slice(0, 15);
    }
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {}
};

/** Lấy lịch sử nhập liệu từ localStorage */
const getInputHistory = (field: string): string[] => {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    const history: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    return history[field] || [];
  } catch { return []; }
};
import { extractDocxText, readFileAsArrayBuffer } from '../services/docxService';

interface InputFormProps {
    onSubmit: (data: LessonInput) => void;
    loadingState: LoadingState;
}

const GRADE_OPTIONS: Record<string, string[]> = {
    primary: ['1', '2', '3', '4', '5'],
    secondary: ['6', '7', '8', '9'],
    high: ['10', '11', '12']
};

const SUBJECT_OPTIONS = [
    "Toán", "Tin học", "Vật lí", "Hóa học", "Sinh học", "Ngữ văn", "Lịch sử", "Địa lí",
    "Tiếng Anh", "Giáo dục thể chất", "Giáo dục quốc phòng", "Âm nhạc",
    "Thể dục", "Công nghệ", "Giáo dục địa phương", "Giáo dục Kinh tế và Pháp luật", "Hoạt động trải nghiệm, hướng nghiệp"
];

const COMPETENCY_OPTIONS = [
    { id: 'problem-solving', label: 'Giải quyết vấn đề' },
    { id: 'digital', label: 'Năng lực số' },
    { id: 'collaboration', label: 'Hợp tác' },
    { id: 'teamwork', label: 'Làm việc nhóm' },
    { id: 'autonomy', label: 'Tự chủ và tự học' }
];

const InputForm: React.FC<InputFormProps> = ({ onSubmit, loadingState }) => {
    const [file, setFile] = useState<File | null>(null);
    const [fileBase64, setFileBase64] = useState<string | null>(null);
    const [docxText, setDocxText] = useState<string | null>(null);
    const [docxArrayBuffer, setDocxArrayBuffer] = useState<ArrayBuffer | null>(null);
    const [isProcessingDocx, setIsProcessingDocx] = useState(false);
    const [errors, setErrors] = useState<{ subject?: string, file?: string }>({});

    const [config, setConfig] = useState<LessonConfig>({
        schoolLevel: 'secondary',
        grade: '6',
        subject: '',
        classSize: 'medium',
        resources: {
            projector: true,
            internet: true,
            materials: false
        },
        customResource: '',
        timeConstraint: '45',
        teachingFocus: ['problem-solving'],
        customCompetency: '',
        techApps: '',
        integration: ''
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) processFile(e.target.files[0]);
    };

    const processFile = async (selectedFile: File) => {
        setFile(selectedFile);
        setErrors(prev => ({ ...prev, file: undefined }));
        setDocxText(null);
        setDocxArrayBuffer(null);
        setFileBase64(null);

        const isDocx = selectedFile.name.toLowerCase().endsWith('.docx') || 
                       selectedFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

        if (isDocx) {
            // Xử lý file DOCX
            setIsProcessingDocx(true);
            try {
                const [text, arrayBuffer] = await Promise.all([
                    extractDocxText(selectedFile),
                    readFileAsArrayBuffer(selectedFile)
                ]);
                setDocxText(text);
                setDocxArrayBuffer(arrayBuffer);
                console.log('DOCX text extracted:', text.substring(0, 200) + '...');
            } catch (err) {
                console.error('Error processing DOCX:', err);
                setErrors(prev => ({ ...prev, file: 'Lỗi đọc file DOCX. Vui lòng thử lại.' }));
            } finally {
                setIsProcessingDocx(false);
            }
        } else {
            // Xử lý file PDF/ảnh (như cũ)
            const reader = new FileReader();
            reader.onload = (e) => setFileBase64(e.target?.result as string);
            reader.readAsDataURL(selectedFile);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
    };

    const toggleResource = (key: keyof typeof config.resources) => {
        setConfig(prev => ({
            ...prev,
            resources: { ...prev.resources, [key]: !prev.resources[key] }
        }));
    };

    const toggleCompetency = (label: string) => {
        setConfig(prev => {
            const current = prev.teachingFocus;
            if (current.includes(label)) {
                return { ...prev, teachingFocus: current.filter(c => c !== label) };
            } else {
                return { ...prev, teachingFocus: [...current, label] };
            }
        });
    };

    const handleSchoolLevelChange = (level: SchoolLevel) => {
        const availableGrades = GRADE_OPTIONS[level];
        setConfig(prev => ({
            ...prev,
            schoolLevel: level,
            grade: availableGrades ? availableGrades[0] : '',
            subject: HIGHER_ED_LEVELS.includes(level) ? '' : prev.subject,
            timeConstraint: HIGHER_ED_LEVELS.includes(level) ? '' as TimeConstraint : prev.timeConstraint || '45',
            classSize: HIGHER_ED_LEVELS.includes(level) ? '' as ClassSize : prev.classSize || 'medium'
        }));
    };

    const handleSubmit = () => {
        const newErrors: { subject?: string, file?: string } = {};
        let hasError = false;

        if (!file) {
            newErrors.file = "Vui lòng tải lên giáo án";
            hasError = true;
        } else if (isProcessingDocx) {
            newErrors.file = "Đang xử lý file DOCX...";
            hasError = true;
        } else if (!fileBase64 && !docxText) {
            newErrors.file = "Đang xử lý file...";
            hasError = true;
        }

        if (!config.subject.trim()) {
            newErrors.subject = "Vui lòng chọn môn học";
            hasError = true;
        }

        if (hasError) {
            setErrors(newErrors);
            return;
        }

        setErrors({});
        onSubmit({
            fileBase64: fileBase64 || undefined,
            mimeType: file?.type,
            fileName: file?.name,
            docxText: docxText || undefined,
            docxArrayBuffer: docxArrayBuffer || undefined,
            config
        });
    };

    const currentGrades = GRADE_OPTIONS[config.schoolLevel];

    // Helper styles for level buttons
    const getLevelBtnClass = (level: SchoolLevel) => {
        const isActive = config.schoolLevel === level;
        const activeClass = "bg-primary text-white border-primary shadow-sm";
        const inactiveClass = "bg-teal-50 dark:bg-teal-900 text-teal-900 dark:text-teal-100 border-transparent hover:border-teal-200 dark:hover:border-teal-500 hover:bg-teal-100";
        return `group flex items-center gap-2 px-4 py-2 rounded-full transition-all cursor-pointer ${isActive ? activeClass : inactiveClass}`;
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Upload */}
            <div className="lg:col-span-4 flex flex-col gap-6">
                <section className={`bg-card-light dark:bg-card-dark rounded-xl shadow-sm border ${errors.file ? 'border-red-400' : 'border-[#ccfbf1] dark:border-teal-900'} overflow-hidden flex flex-col h-full max-h-[500px]`}>
                    <div className="p-5 border-b border-[#ccfbf1] dark:border-teal-900">
                        <h2 className="text-lg font-bold text-teal-900 dark:text-teal-50">Tài liệu Nguồn</h2>
                        <p className="text-sm text-teal-600 dark:text-teal-200 mt-1">Tải lên giáo án (DOCX hoặc PDF) của bạn.</p>
                    </div>
                    <div className="flex-1 p-5 flex flex-col justify-center">
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            onDrop={handleDrop}
                            onDragOver={(e) => e.preventDefault()}
                            className="flex flex-col items-center justify-center gap-6 rounded-xl border-2 border-dashed border-teal-200 dark:border-teal-600 bg-teal-50/50 dark:bg-teal-900/30 px-6 py-10 hover:bg-teal-100/50 dark:hover:bg-teal-900/50 transition-colors cursor-pointer group"
                        >
                            {file ? (
                                <div className="flex flex-col items-center">
                                    <div className="w-16 h-16 rounded-full bg-teal-100 dark:bg-teal-700 flex items-center justify-center mb-2">
                                        <span className="material-symbols-outlined text-primary dark:text-teal-100 text-3xl">description</span>
                                    </div>
                                    <p className="text-teal-900 dark:text-white text-lg font-bold text-center break-all">{file.name}</p>
                                    <p className="text-teal-600 dark:text-teal-300 text-sm mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                                    {isProcessingDocx && <p className="text-amber-500 text-sm mt-1 animate-pulse">Đang đọc file DOCX...</p>}
                                    {docxText && <p className="text-emerald-500 text-sm mt-1">✓ Đã trích xuất nội dung DOCX</p>}
                                </div>
                            ) : (
                                <>
                                    <div className="w-16 h-16 rounded-full bg-teal-100 dark:bg-teal-700 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <span className="material-symbols-outlined text-primary dark:text-teal-100 text-3xl">cloud_upload</span>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-teal-900 dark:text-white text-lg font-bold">Nhấn hoặc kéo tệp vào đây</p>
                                        <p className="text-teal-600 dark:text-teal-300 text-sm mt-1">DOCX, PDF, Ảnh lên đến 10MB</p>
                                        {errors.file && <p className="text-red-500 text-sm mt-2 font-medium">{errors.file}</p>}
                                    </div>
                                </>
                            )}
                            <button className="bg-white dark:bg-teal-800 border border-teal-200 dark:border-teal-600 text-teal-900 dark:text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:shadow-md transition-shadow hover:bg-teal-50">
                                {file ? 'Đổi Tệp Khác' : 'Duyệt Tệp'}
                            </button>
                            <input type="file" ref={fileInputRef} hidden accept=".docx,.pdf,.png,.jpg,.jpeg" onChange={handleFileChange} />
                        </div>
                    </div>
                </section>

                <div className="bg-primary/10 border border-primary/20 rounded-xl p-5 flex gap-4 items-start shadow-sm">
                    <span className="material-symbols-outlined text-primary filled">lightbulb</span>
                    <div>
                        <h3 className="text-sm font-bold text-teal-900 dark:text-white">Mẹo chuyên nghiệp</h3>
                        <p className="text-sm text-teal-700 dark:text-teal-100 mt-1 leading-relaxed">
                            Điền đầy đủ các yêu cầu về tài nguyên giúp AI đề xuất các hoạt động trò chơi và phương pháp phù hợp nhất với điều kiện thực tế của lớp.
                        </p>
                    </div>
                </div>
            </div>

            {/* Right Column: Settings */}
            <div className="lg:col-span-8 flex flex-col gap-6">
                <section className="bg-card-light dark:bg-card-dark rounded-xl shadow-sm border border-[#ccfbf1] dark:border-teal-900 p-6">
                    <div className="mb-6">
                        <h2 className="text-xl font-bold tracking-tight text-teal-900 dark:text-white">Bối cảnh Lớp học</h2>
                        <div className="h-1 w-10 bg-primary mt-2 rounded-full"></div>
                    </div>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-teal-900 dark:text-white mb-3">Cấp độ Giáo dục</label>
                            <div className="flex flex-wrap gap-3">
                                <button className={getLevelBtnClass('primary')} onClick={() => handleSchoolLevelChange('primary')}>
                                    {config.schoolLevel === 'primary' && <span className="material-symbols-outlined text-[18px]">school</span>}
                                    <span className="text-sm font-medium">Tiểu học</span>
                                </button>
                                <button className={getLevelBtnClass('secondary')} onClick={() => handleSchoolLevelChange('secondary')}>
                                    {config.schoolLevel === 'secondary' && <span className="material-symbols-outlined text-[18px]">school</span>}
                                    <span className="text-sm font-medium">THCS</span>
                                </button>
                                <button className={getLevelBtnClass('high')} onClick={() => handleSchoolLevelChange('high')}>
                                    {config.schoolLevel === 'high' && <span className="material-symbols-outlined text-[18px]">school</span>}
                                    <span className="text-sm font-medium">THPT</span>
                                </button>
                                <button className={getLevelBtnClass('vocational')} onClick={() => handleSchoolLevelChange('vocational')}>
                                    {config.schoolLevel === 'vocational' && <span className="material-symbols-outlined text-[18px]">apartment</span>}
                                    <span className="text-sm font-medium">Trung cấp</span>
                                </button>
                                <button className={getLevelBtnClass('college')} onClick={() => handleSchoolLevelChange('college')}>
                                    {config.schoolLevel === 'college' && <span className="material-symbols-outlined text-[18px]">domain</span>}
                                    <span className="text-sm font-medium">Cao đẳng</span>
                                </button>
                                <button className={getLevelBtnClass('university')} onClick={() => handleSchoolLevelChange('university')}>
                                    {config.schoolLevel === 'university' && <span className="material-symbols-outlined text-[18px]">account_balance</span>}
                                    <span className="text-sm font-medium">Đại học</span>
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Grade */}
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-teal-900 dark:text-teal-100">Lớp / Khóa</label>
                                <div className="relative">
                                    {HIGHER_ED_LEVELS.includes(config.schoolLevel) ? (
                                    <>
                                        <input
                                            type="text"
                                            list="grade-history"
                                            className="w-full h-12 rounded-lg bg-teal-50 dark:bg-teal-900/50 border-none px-4 text-teal-900 dark:text-white focus:ring-2 focus:ring-primary/50"
                                            placeholder="VD: K48, Năm 2, Lớp CNTT01..."
                                            value={config.grade}
                                            onChange={(e) => setConfig({ ...config, grade: e.target.value })}
                                            onBlur={(e) => saveInputHistory('grade_higher', e.target.value)}
                                        />
                                        <datalist id="grade-history">
                                            {getInputHistory('grade_higher').map((v, i) => <option key={i} value={v} />)}
                                        </datalist>
                                    </>
                                    ) : (
                                    <>
                                        <select
                                            className="w-full h-12 rounded-lg bg-teal-50 dark:bg-teal-900/50 border-none px-4 text-teal-900 dark:text-white focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
                                            value={config.grade}
                                            onChange={(e) => setConfig({ ...config, grade: e.target.value })}
                                        >
                                            {currentGrades?.map(g => <option key={g} value={g}>{`Lớp ${g}`}</option>)}
                                        </select>
                                        <span className="material-symbols-outlined absolute right-4 top-3 text-teal-400 pointer-events-none">expand_more</span>
                                    </>
                                    )}
                                </div>
                            </div>

                            {/* Subject */}
                            <div className="space-y-2">
                                <label className={`text-sm font-bold ${errors.subject ? 'text-red-500' : 'text-teal-900 dark:text-teal-100'}`}>Bộ môn / Môn học {errors.subject && '*'}</label>
                                <div className="relative">
                                    {HIGHER_ED_LEVELS.includes(config.schoolLevel) ? (
                                    <>
                                        <input
                                            type="text"
                                            list="subject-history"
                                            className={`w-full h-12 rounded-lg bg-teal-50 dark:bg-teal-900/50 border-none px-4 text-teal-900 dark:text-white focus:ring-2 ${errors.subject ? 'ring-2 ring-red-400' : 'focus:ring-primary/50'}`}
                                            placeholder="VD: Giải tích 1, Lập trình C++, Kinh tế vi mô..."
                                            value={config.subject}
                                            onChange={(e) => {
                                                setConfig({ ...config, subject: e.target.value });
                                                if (e.target.value) setErrors(prev => ({ ...prev, subject: undefined }));
                                            }}
                                            onBlur={(e) => saveInputHistory('subject_higher', e.target.value)}
                                        />
                                        <datalist id="subject-history">
                                            {getInputHistory('subject_higher').map((v, i) => <option key={i} value={v} />)}
                                        </datalist>
                                    </>
                                    ) : (
                                    <>
                                        <select
                                            className={`w-full h-12 rounded-lg bg-teal-50 dark:bg-teal-900/50 border-none px-4 text-teal-900 dark:text-white focus:ring-2 appearance-none cursor-pointer ${errors.subject ? 'ring-2 ring-red-400' : 'focus:ring-primary/50'}`}
                                            value={config.subject}
                                            onChange={(e) => {
                                                setConfig({ ...config, subject: e.target.value });
                                                if (e.target.value) setErrors(prev => ({ ...prev, subject: undefined }));
                                            }}
                                        >
                                            <option value="" disabled hidden>Chọn môn học</option>
                                            {SUBJECT_OPTIONS.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                                        </select>
                                        <span className="material-symbols-outlined absolute right-4 top-3 text-teal-400 pointer-events-none">expand_more</span>
                                    </>
                                    )}
                                </div>
                            </div>

                            {/* Time */}
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-teal-900 dark:text-teal-100">Thời lượng</label>
                                <div className="relative">
                                    {HIGHER_ED_LEVELS.includes(config.schoolLevel) ? (
                                    <>
                                        <input
                                            type="text"
                                            list="time-history"
                                            className="w-full h-12 rounded-lg bg-teal-50 dark:bg-teal-900/50 border-none px-4 text-teal-900 dark:text-white focus:ring-2 focus:ring-primary/50"
                                            placeholder="VD: 50 phút, 90 phút, 3 tiết..."
                                            value={config.timeConstraint}
                                            onChange={(e) => setConfig({ ...config, timeConstraint: e.target.value as TimeConstraint })}
                                            onBlur={(e) => saveInputHistory('time_higher', e.target.value)}
                                        />
                                        <datalist id="time-history">
                                            {getInputHistory('time_higher').map((v, i) => <option key={i} value={v} />)}
                                        </datalist>
                                    </>
                                    ) : (
                                    <>
                                        <select
                                            className="w-full h-12 rounded-lg bg-teal-50 dark:bg-teal-900/50 border-none px-4 text-teal-900 dark:text-white focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
                                            value={config.timeConstraint}
                                            onChange={(e) => setConfig({ ...config, timeConstraint: e.target.value as TimeConstraint })}
                                        >
                                            <option value="45">45 Phút (1 tiết)</option>
                                            <option value="90">90 Phút (2 tiết)</option>
                                            <option value="135">135 Phút (3 tiết)</option>
                                            <option value="180">180 Phút (4 tiết)</option>
                                            <option value="225">225 Phút (5 tiết)</option>
                                            <option value="270">270 Phút (6 tiết)</option>
                                        </select>
                                        <span className="material-symbols-outlined absolute right-4 top-3 text-teal-400 pointer-events-none">expand_more</span>
                                    </>
                                    )}
                                </div>
                            </div>

                            {/* Size */}
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-teal-900 dark:text-teal-100">Quy mô lớp</label>
                                <div className="relative">
                                    {HIGHER_ED_LEVELS.includes(config.schoolLevel) ? (
                                    <>
                                        <input
                                            type="text"
                                            list="size-history"
                                            className="w-full h-12 rounded-lg bg-teal-50 dark:bg-teal-900/50 border-none px-4 text-teal-900 dark:text-white focus:ring-2 focus:ring-primary/50"
                                            placeholder="VD: 40 SV, 80 SV, Lớp ghép..."
                                            value={config.classSize}
                                            onChange={(e) => setConfig({ ...config, classSize: e.target.value as ClassSize })}
                                            onBlur={(e) => saveInputHistory('size_higher', e.target.value)}
                                        />
                                        <datalist id="size-history">
                                            {getInputHistory('size_higher').map((v, i) => <option key={i} value={v} />)}
                                        </datalist>
                                    </>
                                    ) : (
                                    <>
                                        <select
                                            className="w-full h-12 rounded-lg bg-teal-50 dark:bg-teal-900/50 border-none px-4 text-teal-900 dark:text-white focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
                                            value={config.classSize}
                                            onChange={(e) => setConfig({ ...config, classSize: e.target.value as ClassSize })}
                                        >
                                            <option value="small">Nhỏ (&lt; 25 HS)</option>
                                            <option value="medium">Trung bình (25-35 HS)</option>
                                            <option value="large">Lớn (&gt; 35 HS)</option>
                                        </select>
                                        <span className="material-symbols-outlined absolute right-4 top-3 text-teal-400 pointer-events-none">expand_more</span>
                                    </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="bg-card-light dark:bg-card-dark rounded-xl shadow-sm border border-[#ccfbf1] dark:border-teal-900 p-6">
                    <div className="mb-6 flex justify-between items-end">
                        <div>
                            <h2 className="text-xl font-bold tracking-tight text-teal-900 dark:text-white">Tài nguyên Yêu cầu</h2>
                            <p className="text-sm text-teal-600 dark:text-teal-300 mt-1">Chọn tất cả thiết bị có sẵn.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
                        {/* Projector */}
                        <label className="cursor-pointer relative group">
                            <input type="checkbox" className="peer sr-only" checked={config.resources.projector} onChange={() => toggleResource('projector')} />
                            <div className="flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-teal-50 dark:border-teal-700 bg-white dark:bg-teal-800 peer-checked:border-primary peer-checked:bg-primary/10 transition-all hover:bg-teal-50 dark:hover:bg-teal-700">
                                <div className="w-10 h-10 rounded-full bg-teal-50 dark:bg-teal-900 flex items-center justify-center text-teal-400 dark:text-teal-300 peer-checked:bg-primary peer-checked:text-white transition-colors">
                                    <span className="material-symbols-outlined">videocam</span>
                                </div>
                                <span className="text-sm font-bold text-center text-teal-900 dark:text-white">Máy chiếu</span>
                            </div>
                            <div className="absolute top-3 right-3 opacity-0 peer-checked:opacity-100 transition-opacity">
                                <span className="material-symbols-outlined text-primary text-sm filled">check_circle</span>
                            </div>
                        </label>

                        {/* WiFi */}
                        <label className="cursor-pointer relative group">
                            <input type="checkbox" className="peer sr-only" checked={config.resources.internet} onChange={() => toggleResource('internet')} />
                            <div className="flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-teal-50 dark:border-teal-700 bg-white dark:bg-teal-800 peer-checked:border-primary peer-checked:bg-primary/10 transition-all hover:bg-teal-50 dark:hover:bg-teal-700">
                                <div className="w-10 h-10 rounded-full bg-teal-50 dark:bg-teal-900 flex items-center justify-center text-teal-400 dark:text-teal-300 peer-checked:bg-primary peer-checked:text-white transition-colors">
                                    <span className="material-symbols-outlined">wifi</span>
                                </div>
                                <span className="text-sm font-bold text-center text-teal-900 dark:text-white">Internet</span>
                            </div>
                            <div className="absolute top-3 right-3 opacity-0 peer-checked:opacity-100 transition-opacity">
                                <span className="material-symbols-outlined text-primary text-sm filled">check_circle</span>
                            </div>
                        </label>

                        {/* Materials */}
                        <label className="cursor-pointer relative group">
                            <input type="checkbox" className="peer sr-only" checked={config.resources.materials} onChange={() => toggleResource('materials')} />
                            <div className="flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-teal-50 dark:border-teal-700 bg-white dark:bg-teal-800 peer-checked:border-primary peer-checked:bg-primary/10 transition-all hover:bg-teal-50 dark:hover:bg-teal-700">
                                <div className="w-10 h-10 rounded-full bg-teal-50 dark:bg-teal-900 flex items-center justify-center text-teal-400 dark:text-teal-300 peer-checked:bg-primary peer-checked:text-white transition-colors">
                                    <span className="material-symbols-outlined">print</span>
                                </div>
                                <span className="text-sm font-bold text-center text-teal-900 dark:text-white">Đồ dùng học tập</span>
                            </div>
                            <div className="absolute top-3 right-3 opacity-0 peer-checked:opacity-100 transition-opacity">
                                <span className="material-symbols-outlined text-primary text-sm filled">check_circle</span>
                            </div>
                        </label>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-teal-900 dark:text-teal-100">Học liệu / Thiết bị khác</label>
                        <div className="relative">
                            <textarea
                                className="w-full h-24 rounded-lg bg-teal-50 dark:bg-teal-900/50 border-none px-4 py-3 text-teal-900 dark:text-white placeholder-teal-400 dark:placeholder-teal-500 focus:ring-2 focus:ring-primary/50 transition-all resize-none"
                                placeholder="Nhập danh sách học liệu bổ sung..."
                                value={config.customResource}
                                onChange={(e) => setConfig({ ...config, customResource: e.target.value })}
                            ></textarea>
                        </div>
                    </div>
                </section>

                <section className="bg-card-light dark:bg-card-dark rounded-xl shadow-sm border border-[#ccfbf1] dark:border-teal-900 p-6">
                    <div className="mb-6">
                        <h2 className="text-xl font-bold tracking-tight text-teal-900 dark:text-white">Mục tiêu phát triển năng lực</h2>
                        <div className="h-1 w-10 bg-primary mt-2 rounded-full"></div>
                    </div>

                    <div className="flex flex-wrap gap-3 mb-5">
                        {COMPETENCY_OPTIONS.map((option) => {
                            const isSelected = config.teachingFocus.includes(option.label);
                            return (
                                <button
                                    key={option.id}
                                    onClick={() => toggleCompetency(option.label)}
                                    className={`px-4 py-2 rounded-full text-sm font-bold transition-all border ${isSelected
                                            ? 'bg-primary text-white border-primary shadow-sm'
                                            : 'bg-white dark:bg-teal-900/30 text-teal-700 dark:text-teal-200 border-teal-100 dark:border-teal-700 hover:border-primary/50'
                                        }`}
                                >
                                    {option.label}
                                </button>
                            )
                        })}
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-teal-900 dark:text-teal-100">Năng lực khác (nếu có)</label>
                        <div className="relative">
                            <input
                                type="text"
                                className="w-full h-12 rounded-lg bg-teal-50 dark:bg-teal-900/50 border-none px-4 text-teal-900 dark:text-white focus:ring-2 focus:ring-primary/50 placeholder-teal-400 dark:placeholder-teal-500"
                                placeholder="Ví dụ: Tư duy phản biện, Sáng tạo..."
                                value={config.customCompetency}
                                onChange={(e) => setConfig({ ...config, customCompetency: e.target.value })}
                            />
                        </div>
                    </div>
                </section>

                <section className="bg-card-light dark:bg-card-dark rounded-xl shadow-sm border border-[#ccfbf1] dark:border-teal-900 p-6">
                    <div className="mb-6">
                        <h2 className="text-xl font-bold tracking-tight text-teal-900 dark:text-white">Công nghệ & Ứng dụng</h2>
                        <div className="h-1 w-10 bg-primary mt-2 rounded-full"></div>
                    </div>

                    <div className="space-y-4">
                        <label className="block text-sm font-bold text-teal-900 dark:text-white">
                            Có muốn áp dụng công nghệ (Kahoot, Mentimeter, Padlet...) không?
                        </label>
                        <div className="relative">
                            <div className="absolute top-3 left-4 text-teal-500">
                                <span className="material-symbols-outlined">smartphone</span>
                            </div>
                            <input
                                type="text"
                                className="w-full h-12 rounded-lg bg-teal-50 dark:bg-teal-900/50 border-none pl-12 pr-4 text-teal-900 dark:text-white focus:ring-2 focus:ring-primary/50 placeholder-teal-400 dark:placeholder-teal-500"
                                placeholder="Nhập tên ứng dụng muốn dùng (VD: Kahoot, Azota, Padlet...)"
                                value={config.techApps}
                                onChange={(e) => setConfig({ ...config, techApps: e.target.value })}
                            />
                        </div>
                        <p className="text-xs text-teal-600 dark:text-teal-400">
                            *Để trống nếu không yêu cầu cụ thể.
                        </p>

                        {/* Toggle: Ứng dụng AI vào giảng dạy */}
                        <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 border border-purple-200 dark:border-purple-700 rounded-xl">
                            <label className="flex items-center justify-between cursor-pointer">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-purple-500 text-2xl">smart_toy</span>
                                    <div>
                                        <span className="block font-bold text-purple-900 dark:text-purple-100">
                                            Ứng dụng AI vào giảng dạy
                                        </span>
                                        <span className="text-xs text-purple-600 dark:text-purple-300">
                                            AI sẽ đề xuất phương pháp, trò chơi ứng dụng AI kèm hướng dẫn chi tiết (web, prompt, từng bước)
                                        </span>
                                    </div>
                                </div>
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={config.useAI || false}
                                        onChange={(e) => setConfig({ ...config, useAI: e.target.checked })}
                                    />
                                    <div className="w-11 h-6 bg-gray-300 peer-checked:bg-purple-500 rounded-full transition-colors"></div>
                                    <div className="absolute left-[2px] top-[2px] w-5 h-5 bg-white rounded-full shadow-md transition-transform peer-checked:translate-x-5"></div>
                                </div>
                            </label>
                        </div>
                    </div>
                </section>

                <section className="bg-card-light dark:bg-card-dark rounded-xl shadow-sm border border-[#ccfbf1] dark:border-teal-900 p-6">
                    <div className="mb-6">
                        <h2 className="text-xl font-bold tracking-tight text-teal-900 dark:text-white">Tích hợp Liên môn</h2>
                        <div className="h-1 w-10 bg-primary mt-2 rounded-full"></div>
                    </div>

                    <div className="space-y-4">
                        <label className="block text-sm font-bold text-teal-900 dark:text-white">
                            Môn học và nội dung cần tích hợp
                        </label>
                        <div className="relative">
                            <textarea
                                className="w-full h-20 rounded-lg bg-teal-50 dark:bg-teal-900/50 border-none px-4 py-3 text-teal-900 dark:text-white focus:ring-2 focus:ring-primary/50 placeholder-teal-400 dark:placeholder-teal-500 resize-none"
                                placeholder="VD: Lịch sử (Bối cảnh xã hội...), Ngữ văn (Phân tích nhân vật...)"
                                value={config.integration}
                                onChange={(e) => setConfig({ ...config, integration: e.target.value })}
                            />
                        </div>
                    </div>
                </section>

                <section className="bg-card-light dark:bg-card-dark rounded-xl shadow-sm border border-[#ccfbf1] dark:border-teal-900 p-6">
                    <div className="mb-6">
                        <h2 className="text-xl font-bold tracking-tight text-teal-900 dark:text-white">Mô phỏng Trực quan</h2>
                        <div className="h-1 w-10 bg-primary mt-2 rounded-full"></div>
                    </div>

                    <div className="space-y-4">
                        <label className="block text-sm font-bold text-teal-900 dark:text-white">
                            Ý tưởng mô phỏng (Tùy chọn)
                        </label>
                        <div className="relative">
                            <div className="absolute top-3 left-4 text-teal-500">
                                <span className="material-symbols-outlined">science</span>
                            </div>
                            <input
                                type="text"
                                className="w-full h-12 rounded-lg bg-teal-50 dark:bg-teal-900/50 border-none pl-12 pr-4 text-teal-900 dark:text-white focus:ring-2 focus:ring-primary/50 placeholder-teal-400 dark:placeholder-teal-500"
                                placeholder="Mô tả mô phỏng bạn muốn tạo (VD: Mô phỏng chuyển động ném xiên...)"
                                value={config.simulationTopic || ''}
                                onChange={(e) => setConfig({ ...config, simulationTopic: e.target.value })}
                            />
                        </div>
                        <p className="text-xs text-teal-600 dark:text-teal-400">
                            *AI sẽ tạo mã nguồn (HTML/JS) để chạy mô phỏng này.
                        </p>
                    </div>
                </section>

                <button
                    className="w-full py-4 bg-primary hover:bg-primary-hover text-white text-lg font-bold rounded-xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-3"
                    onClick={handleSubmit}
                    disabled={loadingState === LoadingState.LOADING}
                >
                    {loadingState === LoadingState.LOADING ? (
                        <span className="material-symbols-outlined animate-spin">progress_activity</span>
                    ) : (
                        <span className="material-symbols-outlined filled">bolt</span>
                    )}
                    {loadingState === LoadingState.LOADING ? 'Đang Phân Tích...' : 'Xuất bản Bài Giảng Nâng Cấp'}
                </button>
            </div>
        </div>
    );
};

export default InputForm;
