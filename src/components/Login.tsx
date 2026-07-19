import React, { useState } from 'react';
import { PackageOpen, Lock, User, LogIn } from 'lucide-react';
import { loginUser } from '../lib/auth';

export const Login = ({ onLogin }: { onLogin: () => void }) => {
  // Sign In States
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginUser(username, password);
      onLogin();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-100 overflow-hidden">
        
        {/* Brand Header */}
        <div className="bg-[#0055C4] p-8 text-center text-white">
          <div className="mx-auto bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-sm">
            <PackageOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-[#F1B122]">GUDANG C3</h1>
          <p className="text-white/80 text-sm mt-2 font-medium">Warehouse Management System</p>
        </div>

        <div className="border-b border-slate-100 bg-slate-50/50 py-4 text-center">
          <span className="text-[#0055C4] font-bold uppercase tracking-wider text-sm flex items-center justify-center gap-2">
            <LogIn className="w-4 h-4" />
            Masuk (Sign In)
          </span>
        </div>
        
        <div className="p-8">
          
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="p-3.5 bg-red-50 text-red-700 text-xs font-bold border border-red-200 rounded-lg text-center animate-shake">
                {error}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Username / Email</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <User className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <input
                    id="username"
                    type="text"
                    required
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-medium focus:ring-2 focus:ring-[#0055C4] focus:border-[#0055C4] outline-none transition-all placeholder-slate-400"
                    placeholder="Masukkan Username atau Email"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Lock className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-medium focus:ring-2 focus:ring-[#0055C4] focus:border-[#0055C4] outline-none transition-all placeholder-slate-400"
                    placeholder="Masukkan Password"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0055C4] hover:bg-blue-800 text-white font-bold py-3.5 rounded-lg transition-all shadow-md text-sm cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Memproses Masuk...' : 'Sign In to System'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400 font-medium">
              Sistem Otentikasi terenkripsi via Firebase Security & Role-Based Access Control (RBAC).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
