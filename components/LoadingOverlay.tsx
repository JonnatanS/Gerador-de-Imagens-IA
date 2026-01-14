
import React, { useState, useEffect } from 'react';

const MESSAGES: Record<string, string[]> = {
  generating: [
    "Iniciando os motores criativos...",
    "Misturando pixels e sonhos...",
    "Ajustando a iluminação cinematográfica...",
    "Quase lá! Refinando os detalhes...",
    "Dando vida à sua imaginação...",
  ],
  editing: [
    "Analisando a estrutura da imagem...",
    "Aplicando pinceladas de IA...",
    "Harmonizando cores e sombras...",
    "Sincronizando novos elementos...",
    "Finalizando sua obra de arte...",
  ]
};

interface LoadingOverlayProps {
  type?: 'generating' | 'editing';
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ type = 'generating' }) => {
  const [msgIndex, setMsgIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Ciclo de mensagens
    const msgInterval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % MESSAGES[type].length);
    }, 3000);

    // Simulação de progresso realista (assintótico a 98%)
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 98) return 98;
        // Diminui o passo conforme chega perto de 100
        const step = Math.max(0.1, (100 - prev) / 20);
        return +(prev + step).toFixed(1);
      });
    }, 150);

    return () => {
      clearInterval(msgInterval);
      clearInterval(progressInterval);
    };
  }, [type]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-500">
      <div className="relative mb-12">
        {/* Spinner central aprimorado */}
        <div className="h-32 w-32 rounded-full border-2 border-indigo-500/10 flex items-center justify-center relative">
          <div className="absolute inset-0 rounded-full border-t-4 border-indigo-500 animate-spin"></div>
          <span className="text-2xl font-black font-mono text-indigo-400 tabular-nums">
            {Math.floor(progress)}%
          </span>
        </div>
        
        {/* Glow de fundo */}
        <div className="absolute -inset-4 bg-indigo-500/10 blur-2xl rounded-full -z-10 animate-pulse"></div>
      </div>

      <div className="max-w-md w-full px-8 space-y-8 text-center">
        <div className="space-y-3">
          <h3 className="text-indigo-300 font-black uppercase tracking-[0.3em] text-sm">
            {type === 'generating' ? 'Criando Imagem' : 'Editando com IA'}
          </h3>
          <p className="text-slate-400 text-lg font-medium transition-all duration-500 h-8">
            {MESSAGES[type][msgIndex]}
          </p>
        </div>

        {/* Barra de progresso detalhada */}
        <div className="space-y-3">
          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800 shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-400 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            >
              <div className="w-full h-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%]"></div>
            </div>
          </div>
          <div className="flex justify-between text-[10px] font-black text-slate-500 tracking-widest uppercase">
            <span>Processando</span>
            <span>Estúdio ImagineAI</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};
