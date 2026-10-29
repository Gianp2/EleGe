import React from 'react';
import { Loader2 } from 'lucide-react';

export const AuthLoadingScreen: React.FC = () => {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-white text-neutral-900 font-sans select-none">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-neutral-900 text-white flex items-center justify-center font-black text-lg tracking-tight shadow-sm animate-pulse">
          LG
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-neutral-900">
            Lavadero eLeGe
          </div>
          <div className="text-xs text-neutral-400 font-mono tracking-wider uppercase mt-0.5">
            Verificando sesión...
          </div>
        </div>
        <Loader2 className="w-5 h-5 text-neutral-500 animate-spin mt-2" />
      </div>
    </div>
  );
};
