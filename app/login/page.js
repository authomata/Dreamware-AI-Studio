'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/studio');
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('Account created! Check your email to confirm, or log in if confirmation is disabled.');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-12 h-12 bg-[#d9ff00] rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-[#d9ff00]/20">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h1 className="text-white font-black text-xl tracking-tight">DREAMWARE</h1>
          <p className="text-white/30 text-xs font-medium tracking-widest mt-0.5">AI STUDIO</p>
        </div>

        {/* Card */}
        <div className="bg-[#111111] border border-white/[0.08] rounded-xl p-8 shadow-2xl">

          {/* Mode toggle */}
          <div className="flex gap-1 bg-white/[0.04] p-1 rounded-lg mb-7">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setMessage(''); }}
              className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all duration-200 ${
                mode === 'login' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); setMessage(''); }}
              className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all duration-200 ${
                mode === 'register' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-white/30 uppercase tracking-widest">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="you@dreamware.ai"
                autoComplete="email"
                required
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/15 focus:outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-white/30 uppercase tracking-widest">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/15 focus:outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all"
              />
            </div>

            {error && (
              <p className="text-red-400 text-xs leading-relaxed bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {message && (
              <p className="text-primary text-xs leading-relaxed bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-[#d9ff00] text-black font-black text-sm rounded-lg hover:bg-[#e5ff33] active:scale-[0.98] transition-all duration-200 shadow-lg shadow-[#d9ff00]/15 disabled:opacity-50 disabled:cursor-not-allowed mt-1"
            >
              {loading ? (
                <span className="animate-spin inline-block">◌</span>
              ) : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-white/15 text-xs mt-6">
          Dreamware AI Studio · Team access only
        </p>
      </div>
    </div>
  );
}
