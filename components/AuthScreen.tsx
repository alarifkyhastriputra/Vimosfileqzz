import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase.ts';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { ref, get, set, update } from 'firebase/database';
import { useLanguage, Language } from '../LanguageContext.tsx';

interface AuthScreenProps {
  bannedMessage?: string | null;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ bannedMessage }) => {
  const { language, setLanguage, t } = useLanguage();
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'ja', label: '日本語', flag: '🇯🇵' },
    { code: 'zh', label: '中文', flag: '🇨🇳' },
  ];

  const currentLangObj = languages.find(l => l.code === language) || languages[0];

  const syncUserToDatabase = async (
    uid: string,
    userEmail: string,
    displayName: string,
    photoURL?: string | null
  ) => {
    const userRef = ref(db, `users/${uid}`);
    const snap = await get(userRef);
    const resolvedPhoto =
      photoURL ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName || uid)}&backgroundColor=000000`;

    if (!snap.exists()) {
      await set(userRef, {
        name: displayName,
        email: userEmail,
        bio: 'A wandering soul in Vimos.',
        photoURL: resolvedPhoto,
        followers: {},
        following: {},
        recentCaptures: {},
        totalLikes: 0,
        isAdmin: false,
        createdAt: Date.now(),
        lastSeen: Date.now()
      });
    } else {
      await update(userRef, {
        lastSeen: Date.now(),
        ...(displayName ? { name: displayName } : {}),
        ...(photoURL ? { photoURL } : {})
      });
    }
  };

  // Check for redirect result if redirect mode was utilized
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (userCredential) => {
        if (userCredential?.user) {
          const user = userCredential.user;
          const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Member');
          await syncUserToDatabase(user.uid, user.email || '', displayName, user.photoURL);
        }
      })
      .catch((err) => {
        if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
          console.warn('Redirect sign-in notice:', err?.message || err);
        }
      });
  }, []);

  const mapAuthError = (err: any): string => {
    const code = err?.code || '';
    switch (code) {
      case 'auth/email-already-in-use':
        return t('auth_error_email_in_use');
      case 'auth/weak-password':
        return t('auth_error_weak_pass');
      case 'auth/invalid-email':
        return t('auth_error_invalid_email');
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Email atau kata sandi salah. Periksa kembali atau buat akun baru.';
      case 'auth/user-disabled':
        return 'Akun ini telah dinonaktifkan oleh administrator.';
      case 'auth/too-many-requests':
        return 'Terlalu banyak percobaan gagal. Silakan tunggu beberapa saat lalu coba lagi.';
      case 'auth/operation-not-allowed':
        return 'Login Email & Password belum diaktifkan di Firebase Console (Authentication > Sign-in method).';
      case 'auth/network-request-failed':
        return 'Koneksi internet bermasalah. Silakan periksa jaringan Anda.';
      case 'auth/unauthorized-domain':
        return (
          'Domain aplikasi ini belum diizinkan di Firebase Console. ' +
          'Buka Firebase Console > Authentication > Settings > Authorized domains, dan tambahkan domain web ini.'
        );
      default:
        return err?.message || t('auth_error_general');
    }
  };

  const switchMode = (nextMode: 'login' | 'register' | 'reset') => {
    setAuthMode(nextMode);
    setError('');
    setSuccessMsg('');
  };

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const cleanEmail = email.trim();
    const cleanUsername = username.trim();

    if (!cleanEmail) {
      setError('Silakan masukkan alamat email Anda.');
      return;
    }

    if (authMode === 'reset') {
      setLoading(true);
      try {
        await sendPasswordResetEmail(auth, cleanEmail);
        setSuccessMsg(`Tautan reset kata sandi telah dikirim ke ${cleanEmail}. Periksa kotak masuk atau folder spam Anda.`);
      } catch (err: any) {
        setError(mapAuthError(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) {
      setError('Silakan masukkan kata sandi Anda.');
      return;
    }

    if (authMode === 'register') {
      if (!cleanUsername || cleanUsername.length < 2) {
        setError(t('auth_error_username') || 'Masukkan nama pengguna minimal 2 karakter.');
        return;
      }
      if (password.length < 6) {
        setError(t('auth_error_weak_pass'));
        return;
      }
      if (password !== confirmPassword) {
        setError('Konfirmasi kata sandi tidak cocok.');
        return;
      }
    }

    setLoading(true);
    try {
      if (authMode === 'register') {
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const user = userCredential.user;
        try {
          await updateProfile(user, { displayName: cleanUsername });
        } catch (profileErr) {
          console.warn('Could not update displayName:', profileErr);
        }
        await syncUserToDatabase(user.uid, user.email || cleanEmail, cleanUsername, user.photoURL);
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
        const user = userCredential.user;
        const userRef = ref(db, `users/${user.uid}`);
        const snap = await get(userRef);
        if (!snap.exists()) {
          const fallbackName = user.displayName || (user.email ? user.email.split('@')[0] : 'Member');
          await syncUserToDatabase(user.uid, user.email || cleanEmail, fallbackName, user.photoURL);
        } else {
          await update(userRef, { lastSeen: Date.now() });
        }
      }
    } catch (err: any) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setSuccessMsg('');
    setGoogleLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      let userCredential;
      try {
        userCredential = await signInWithPopup(auth, provider);
      } catch (popupErr: any) {
        if (popupErr?.code === 'auth/popup-closed-by-user' || popupErr?.code === 'auth/cancelled-popup-request') {
          setGoogleLoading(false);
          return;
        }

        if (popupErr?.code === 'auth/popup-blocked') {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupErr;
      }

      const user = userCredential.user;
      if (user) {
        const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Member');
        const userRef = ref(db, `users/${user.uid}`);
        const snap = await get(userRef);
        if (!snap.exists()) {
          await syncUserToDatabase(user.uid, user.email || '', displayName, user.photoURL);
        } else {
          await update(userRef, {
            lastSeen: Date.now(),
            ...(user.photoURL ? { photoURL: user.photoURL } : {})
          });
        }
      }
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        setError('');
        setGoogleLoading(false);
        return;
      }

      console.warn('Google Sign-In Notice:', err?.code, err?.message);
      setError(mapAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const isBusy = loading || googleLoading;

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen p-5 sm:p-6 bg-white max-w-xl mx-auto border-x border-gray-100">
      {/* Top Language Switcher Bar */}
      <div className="absolute top-5 right-5 z-20">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full border border-black/10 hover:border-black/30 bg-neutral-50 hover:bg-neutral-100 text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <span>{currentLangObj.flag}</span>
            <span className="uppercase text-[11px] tracking-wider">{currentLangObj.code}</span>
            <i className={`fas fa-chevron-down text-[9px] text-neutral-400 transition-transform ${showLangMenu ? 'rotate-180' : ''}`}></i>
          </button>

          {showLangMenu && (
            <>
              <div 
                className="fixed inset-0 z-30" 
                onClick={() => setShowLangMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-44 bg-white border border-neutral-200 rounded-2xl shadow-xl z-40 py-1 overflow-hidden animate-fade-in">
                <div className="px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-widest text-neutral-400 border-b border-neutral-100">
                  {t('auth_change_language')}
                </div>
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => {
                      setLanguage(lang.code);
                      setShowLangMenu(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                      language === lang.code 
                        ? 'bg-neutral-900 text-white' 
                        : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    <span className="flex items-center space-x-2">
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                    </span>
                    {language === lang.code && (
                      <i className="fas fa-check text-[10px]"></i>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="text-center mb-5 mt-8 sm:mt-0">
        <h1 className="text-5xl sm:text-6xl font-black tracking-tighter mb-1.5 text-black">VIMOS</h1>
        <p className="text-[11px] uppercase tracking-[0.35em] font-extrabold text-neutral-400">
          {authMode === 'register' ? t('auth_tagline_register') : t('auth_tagline_login')}
        </p>
      </div>

      {/* Quick Language Pills below title */}
      <div className="flex items-center justify-center space-x-1.5 mb-6 p-1 bg-neutral-100 rounded-full border border-black/5">
        {languages.map((lang) => (
          <button
            key={lang.code}
            type="button"
            onClick={() => setLanguage(lang.code)}
            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all flex items-center space-x-1 cursor-pointer ${
              language === lang.code
                ? 'bg-black text-white shadow-xs'
                : 'text-neutral-500 hover:text-black hover:bg-neutral-200/60'
            }`}
          >
            <span>{lang.flag}</span>
            <span>{lang.code.toUpperCase()}</span>
          </button>
        ))}
      </div>

      {/* Main Auth Card */}
      <div className="w-full max-w-md bg-neutral-50/70 border border-neutral-200 rounded-3xl p-6 sm:p-7 shadow-xs">
        {/* Login / Register Mode Switcher */}
        {authMode !== 'reset' ? (
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-neutral-200/70 rounded-2xl mb-5">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                authMode === 'login'
                  ? 'bg-black text-white shadow-sm'
                  : 'text-neutral-600 hover:text-black'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                authMode === 'register'
                  ? 'bg-black text-white shadow-sm'
                  : 'text-neutral-600 hover:text-black'
              }`}
            >
              Buat Akun
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-black uppercase tracking-tight text-neutral-900">
                Reset Kata Sandi
              </h2>
              <p className="text-[11px] text-neutral-500 font-medium">
                Kami akan mengirimkan tautan pemulihan ke email Anda.
              </p>
            </div>
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="text-xs font-bold text-neutral-600 hover:text-black underline cursor-pointer"
            >
              Kembali
            </button>
          </div>
        )}

        {bannedMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-500 text-xs font-bold uppercase text-center text-red-600 animate-pulse rounded-xl">
            {bannedMessage}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-xs font-bold text-center text-red-600 rounded-xl leading-relaxed">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-xs font-bold text-center text-emerald-700 rounded-xl leading-relaxed">
            {successMsg}
          </div>
        )}

        {/* Email & Password Form */}
        <form onSubmit={handleEmailAuthSubmit} className="space-y-3.5 text-left">
          {authMode === 'register' && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-1.5 ml-1">
                {t('auth_username_label')}
              </label>
              <div className="relative">
                <i className="fas fa-user absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 text-xs"></i>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('auth_username_placeholder')}
                  disabled={isBusy}
                  autoComplete="name"
                  className="w-full bg-white border border-neutral-200 focus:border-black rounded-2xl pl-10 pr-4 py-3 text-xs font-bold text-neutral-900 placeholder:text-neutral-400 focus:outline-none transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-1.5 ml-1">
              {t('auth_email_label')}
            </label>
            <div className="relative">
              <i className="fas fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 text-xs"></i>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth_email_placeholder')}
                disabled={isBusy}
                autoComplete="email"
                className="w-full bg-white border border-neutral-200 focus:border-black rounded-2xl pl-10 pr-4 py-3 text-xs font-bold text-neutral-900 placeholder:text-neutral-400 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {authMode !== 'reset' && (
            <div>
              <div className="flex items-center justify-between mb-1.5 px-1">
                <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-500">
                  {t('auth_password_label')}
                </label>
                {authMode === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-[10px] font-bold text-neutral-500 hover:text-black transition-colors cursor-pointer"
                  >
                    Lupa kata sandi?
                  </button>
                )}
              </div>
              <div className="relative">
                <i className="fas fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 text-xs"></i>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  disabled={isBusy}
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                  className="w-full bg-white border border-neutral-200 focus:border-black rounded-2xl pl-10 pr-11 py-3 text-xs font-bold text-neutral-900 placeholder:text-neutral-400 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black p-1 cursor-pointer"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                >
                  <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
                </button>
              </div>
            </div>
          )}

          {authMode === 'register' && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-1.5 ml-1">
                Konfirmasi Kata Sandi
              </label>
              <div className="relative">
                <i className="fas fa-circle-check absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 text-xs"></i>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi kata sandi Anda"
                  disabled={isBusy}
                  autoComplete="new-password"
                  className="w-full bg-white border border-neutral-200 focus:border-black rounded-2xl pl-10 pr-11 py-3 text-xs font-bold text-neutral-900 placeholder:text-neutral-400 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black p-1 cursor-pointer"
                  aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi kata sandi' : 'Lihat konfirmasi kata sandi'}
                >
                  <i className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isBusy}
            className="w-full bg-black hover:bg-neutral-800 text-white py-3.5 px-4 rounded-2xl font-black uppercase text-xs tracking-wider transition-all flex items-center justify-center space-x-2 shadow-md active:scale-98 disabled:opacity-50 cursor-pointer mt-2"
          >
            {loading ? (
              <>
                <i className="fas fa-circle-notch fa-spin text-sm"></i>
                <span>{t('auth_processing')}</span>
              </>
            ) : (
              <>
                <i className={`fas ${authMode === 'register' ? 'fa-user-plus' : authMode === 'reset' ? 'fa-paper-plane' : 'fa-right-to-bracket'} text-xs`}></i>
                <span>
                  {authMode === 'register'
                    ? t('auth_submit_register')
                    : authMode === 'reset'
                    ? 'Kirim Tautan Reset'
                    : t('auth_submit_login')}
                </span>
              </>
            )}
          </button>
        </form>

        {/* Quick Mode Switch Link */}
        {authMode !== 'reset' && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => switchMode(authMode === 'login' ? 'register' : 'login')}
              disabled={isBusy}
              className="text-xs font-bold text-neutral-600 hover:text-black transition-colors cursor-pointer"
            >
              {authMode === 'login' ? t('auth_switch_to_register') : t('auth_switch_to_login')}
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="my-5 flex items-center">
          <div className="flex-1 border-t border-neutral-200"></div>
          <span className="px-3 text-[10px] font-black uppercase tracking-widest text-neutral-400">
            atau
          </span>
          <div className="flex-1 border-t border-neutral-200"></div>
        </div>

        {/* Google Sign-In Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isBusy}
          className="w-full bg-white hover:bg-neutral-100 border border-neutral-300 text-neutral-900 py-3.5 px-4 rounded-2xl font-black uppercase text-xs tracking-wider transition-all flex items-center justify-center space-x-3 shadow-2xs active:scale-98 disabled:opacity-50 cursor-pointer"
        >
          {googleLoading ? (
            <div className="flex items-center space-x-2">
              <i className="fas fa-circle-notch fa-spin text-sm"></i>
              <span>Menghubungkan ke Google...</span>
            </div>
          ) : (
            <>
              <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.66-5.17 3.66-9.12z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.13C3.27 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.26C.46 8.18 0 9.99 0 12s.46 3.82 1.26 5.42l4.02-3.13z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.27 2.64 1.26 6.58l4.02 3.13c.95-2.83 3.6-4.96 6.72-4.96z"
                  />
                </svg>
              </div>
              <span>Lanjutkan dengan Akun Google</span>
            </>
          )}
        </button>

        <div className="mt-5 flex items-center justify-center space-x-2 text-[11px] text-neutral-400 font-semibold">
          <i className="fas fa-shield-halved text-green-600"></i>
          <span>Autentikasi Resmi & Terproteksi Firebase Auth</span>
        </div>
      </div>

      <div className="mt-6 text-center text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
        Vimos &copy; 2026 • Monochrome Social Network
      </div>
    </div>
  );
};

export default AuthScreen;
