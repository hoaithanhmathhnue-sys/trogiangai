import React, { useState } from 'react';
import { validateProUser } from '../data/users';

interface ProAuthModalProps {
   isOpen: boolean;
   onClose: () => void;
   onAuthenticated: (name: string) => void;
}

const ProAuthModal: React.FC<ProAuthModalProps> = ({ isOpen, onClose, onAuthenticated }) => {
   const [username, setUsername] = useState('');
   const [password, setPassword] = useState('');
   const [error, setError] = useState('');
   const [isLoading, setIsLoading] = useState(false);

   if (!isOpen) return null;

   const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setIsLoading(true);

      // Giả lập delay nhỏ cho UX
      await new Promise(resolve => setTimeout(resolve, 500));

      const user = validateProUser(username, password);
      if (user) {
         localStorage.setItem('pro_authenticated', 'true');
         localStorage.setItem('pro_user_name', user.name);
         onAuthenticated(user.name);
         setUsername('');
         setPassword('');
      } else {
         setError('Tài khoản hoặc mật khẩu không chính xác.');
      }
      setIsLoading(false);
   };

   return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
         <div 
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-fadeIn"
            onClick={e => e.stopPropagation()}
         >
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 text-white">
               <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                     <span className="text-2xl">👑</span>
                  </div>
                  <div>
                     <h2 className="text-xl font-bold">Nâng cấp Pro</h2>
                     <p className="text-amber-100 text-sm">Mở khóa tính năng tải về</p>
                  </div>
               </div>
            </div>

            {/* Body */}
            <div className="p-6">
               <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5">
                  <div className="flex items-start gap-2">
                     <span className="material-symbols-outlined text-amber-600 text-lg mt-0.5">info</span>
                     <div>
                        <p className="text-amber-800 font-semibold text-sm">Nâng cấp Pro để sử dụng tính năng tải về</p>
                        <p className="text-amber-600 text-xs mt-1">Nhập tài khoản Pro để mở khóa toàn bộ tính năng tải file và xuất giáo án.</p>
                     </div>
                  </div>
               </div>

               <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                     <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tài khoản (Email)</label>
                     <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">person</span>
                        <input
                           type="text"
                           value={username}
                           onChange={e => { setUsername(e.target.value); setError(''); }}
                           placeholder="Nhập email tài khoản"
                           className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm transition-all"
                           autoFocus
                        />
                     </div>
                  </div>
                  <div>
                     <label className="block text-sm font-semibold text-gray-700 mb-1.5">Mật khẩu</label>
                     <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">lock</span>
                        <input
                           type="password"
                           value={password}
                           onChange={e => { setPassword(e.target.value); setError(''); }}
                           placeholder="Nhập mật khẩu"
                           className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm transition-all"
                        />
                     </div>
                  </div>

                  {error && (
                     <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                        <span className="material-symbols-outlined text-sm">error</span>
                        {error}
                     </div>
                  )}

                  <button
                     type="submit"
                     disabled={isLoading || !username || !password}
                     className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                     {isLoading ? (
                        <>
                           <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                           Đang xác thực...
                        </>
                     ) : (
                        <>
                           <span className="material-symbols-outlined text-lg">vpn_key</span>
                           Đăng nhập Pro
                        </>
                     )}
                  </button>
               </form>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-6 py-3 bg-gray-50">
               <button
                  onClick={onClose}
                  className="w-full text-center text-sm text-gray-500 hover:text-gray-700 py-1 transition-colors"
               >
                  Đóng
               </button>
            </div>
         </div>
      </div>
   );
};

export default ProAuthModal;
