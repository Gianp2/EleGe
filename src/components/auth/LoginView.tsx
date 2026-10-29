import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, ShieldCheck, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_ADMIN_EMAIL } from '../../firebase/adminConfig';

export const LoginView: React.FC = () => {
  const { login, authError, clearError } = useAuth();
  const [email, setEmail] = useState<string>(DEFAULT_ADMIN_EMAIL);
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await login(email, password);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-neutral-50 flex flex-col justify-center items-center px-4 py-3 sm:py-6 font-sans selection:bg-neutral-900 selection:text-white overflow-y-auto">
      <div className="w-full max-w-sm sm:max-w-md mx-auto my-auto flex flex-col items-center">
        {/* Cabecera y Marca */}
        <div className="flex flex-col items-center mb-3 sm:mb-4 text-center">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-neutral-900 text-white font-black text-base sm:text-lg flex items-center justify-center shadow-xs mb-2">
            LG
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-neutral-900">
            Lavadero eLeGe
          </h1>
          <p className="text-[11px] text-neutral-500 font-medium tracking-wide mt-0.5">
            Control Operativo
          </p>
        </div>

        {/* Card Principal */}
        <div className="w-full bg-white border border-neutral-200/90 rounded-2xl shadow-sm p-4 sm:p-6 space-y-3.5">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-neutral-900">Acceso Administradora</h2>
              <p className="text-[11px] text-neutral-500">Ingresá tus credenciales autorizadas</p>
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/60 rounded-full">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>Protegido</span>
            </span>
          </div>

          {/* Banner de error amigable */}
          {authError && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-start gap-2 animate-fadeIn">
              <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
              <span className="flex-1 leading-snug">{authError}</span>
              <button
                type="button"
                onClick={clearError}
                className="text-red-400 hover:text-red-700 text-xs font-bold px-1"
                title="Cerrar aviso"
              >
                ✕
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Campo Correo */}
            <div>
              <label
                htmlFor="admin-email"
                className="block text-[11px] sm:text-xs font-semibold text-neutral-700 mb-1"
              >
                Correo de Administradora
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="admin-email"
                  type="email"
                  name="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (authError) clearError();
                  }}
                  required
                  placeholder="admin@elege.com"
                  className="w-full bg-neutral-50/70 border border-neutral-300 focus:border-neutral-900 focus:bg-white text-xs sm:text-sm text-neutral-900 rounded-xl pl-9 pr-3 py-2 sm:py-2.5 outline-none transition-colors"
                />
              </div>
            </div>

            {/* Campo Contraseña */}
            <div>
              <label
                htmlFor="admin-password"
                className="block text-[11px] sm:text-xs font-semibold text-neutral-700 mb-1"
              >
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (authError) clearError();
                  }}
                  required
                  placeholder="Ingresá tu contraseña"
                  className="w-full bg-neutral-50/70 border border-neutral-300 focus:border-neutral-900 focus:bg-white text-xs sm:text-sm text-neutral-900 rounded-xl pl-9 pr-9 py-2 sm:py-2.5 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 transition-colors p-1"
                  title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Botón de Envío */}
            <button
              type="submit"
              disabled={isSubmitting || !password}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-white bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500 rounded-xl shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed active:scale-[0.99] mt-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <span>Ingresar al Sistema</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Pie sutil */}
          <div className="pt-2 text-center border-t border-neutral-100">
            <span className="text-[10px] text-neutral-400">
              Lavadero eLeGe · Acceso exclusivo
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

