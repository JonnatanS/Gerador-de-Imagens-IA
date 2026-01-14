
import React, { useState, useEffect, useMemo } from 'react';

interface LoadingOverlayProps {
  type?: 'generating' | 'editing';
}

interface Step {
  label: string;
  minProgress: number;
}

const GENERATION_STEPS: Step[] = [
  { label: "Validando instruções do prompt", minProgress: 0 },
  { label: "Enviando para o núcleo Gemini 2.5", minProgress: 15 },
  { label: "Semeando variações latentes", minProgress: 35 },
  { label: "Renderizando estrutura e texturas", minProgress: 60 },
  { label: "Aplicando filtros de alta definição", minProgress: 85 },
];

const EDITING_STEPS: Step[] = [
  { label: "Decodificando imagem base", minProgress: 0 },
  { label: "Mapeando área de inpainting", minProgress: 15 },
  { label: "Calculando pesos de interferência", minProgress: 40 },
  { label: "Sintetizando novos elementos", minProgress: 65 },
  { label: "Suavizando transições de borda", minProgress: 88 },
];

const TECH_LOGS = [
  "GPU_CLUSTER_ID: 0x44F2",
  "SAMPLING: EULER_A",
  "LATENT_DIM: 1024x1024",
  "DENOISING_STRENGTH: 0.75",
  "VRAM_LOAD: 84.2%",
  "NEURAL_PATH_ACTIVE: TRUE",
  "IMAGE_BUFFER: ALLOCATED",
  "SYNC_STATE: OK",
];

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ type = 'generating' }) => {
  const [progress, setProgress] = useState(0);
  const [logIndex, setLogIndex] = useState(0);

  const steps = type === 'generating' ? GENERATION_STEPS : EDITING_STEPS;

  useEffect(() => {
    // Progresso assintótico realista
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 99) return 99;
        const remaining = 100 - prev;
        const increment = Math.random() * (remaining / 15);
        return +(prev + increment).toFixed(1);
      });
    }, 400);

    // Logs técnicos rápidos
    const logInterval = setInterval(() => {
      setLogIndex((prev) => (prev + 1) % TECH_LOGS.length);
    }, 1200);

    return () => {
      clearInterval(progressInterval);
      clearInterval(logInterval);
    };
  }, []);

  const currentStepIndex = useMemo(() => {
    let index = 0;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (progress >= steps[i].minProgress) {
        index = i;
        break;
      }
    }
    return index;
  }, [progress, steps]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-2xl animate-in fade-in duration-500 overflow-hidden">
      {/* Elementos decorativos de fundo */}
      <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="grid grid-cols-12 h-full w-full opacity-10">
          {Array.from({ length: 144 }).map((_, i) => (
            <div key={i} className="border-[0.5px] border-slate-700 w-full h-full"></div>
          ))}
        </div>
      </div>

      <div className="relative max-w-xl w-full px-6 space-y-10 z-10">
        {/* Cabeçalho de Status */}
        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
              <h2 className="text-white font-black uppercase tracking-[0.3em] text-sm">
                SISTEMA DE IA ATIVO
              </h2>
            </div>
            <p className="text-slate-400 font-mono text-xs uppercase tracking-widest">
              TASK_ID: {type.toUpperCase()}_{Math.floor(progress * 1000)}
            </p>
          </div>
          <div className="text-right">
            <span className="text-4xl font-black font-mono text-white tabular-nums">
              {Math.floor(progress)}<span className="text-indigo-500 text-xl">%</span>
            </span>
          </div>
        </div>

        {/* Barra de Progresso Principal */}
        <div className="relative h-4 w-full bg-slate-900/50 rounded-full overflow-hidden border border-slate-800 shadow-2xl">
          <div 
            className="h-full bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-400 transition-all duration-700 ease-out relative"
            style={{ width: `${progress}%` }}
          >
            {/* Efeito de brilho na ponta */}
            <div className="absolute right-0 top-0 bottom-0 w-12 bg-white/30 blur-md"></div>
          </div>
        </div>

        {/* Tracker de Etapas */}
        <div className="grid grid-cols-1 gap-3">
          {steps.map((step, idx) => {
            const isCompleted = progress > steps[idx + 1]?.minProgress || (idx === steps.length - 1 && progress > 90);
            const isActive = idx === currentStepIndex && !isCompleted;
            
            return (
              <div 
                key={step.label} 
                className={`flex items-center gap-4 transition-all duration-500 ${isCompleted ? 'opacity-40' : isActive ? 'opacity-100 scale-105' : 'opacity-20'}`}
              >
                <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${isCompleted ? 'bg-indigo-500 border-indigo-500' : isActive ? 'border-indigo-400 animate-pulse' : 'border-slate-700'}`}>
                  {isCompleted && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {isActive && <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></div>}
                </div>
                <span className={`text-xs font-bold uppercase tracking-widest ${isActive ? 'text-indigo-300' : 'text-slate-400'}`}>
                  {step.label}
                </span>
                {isActive && (
                  <span className="ml-auto font-mono text-[10px] text-indigo-500/50 animate-pulse">
                    PROCESSING...
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Console Técnico Inferior */}
        <div className="bg-black/40 border border-slate-800 rounded-xl p-4 font-mono text-[10px] text-slate-500 space-y-1">
          <div className="flex justify-between border-b border-slate-800 pb-2 mb-2">
            <span className="text-slate-600 font-black">LOG_CONSOLE</span>
            <span className="text-indigo-500/50 uppercase">ImagineAI_Engine_v2.5</span>
          </div>
          <div className="h-4 overflow-hidden">
            <p className="animate-in slide-in-from-bottom-2 duration-300">
              > {TECH_LOGS[logIndex]}
            </p>
          </div>
          <p className="opacity-50">READY_FOR_BUFFER_STREAM...</p>
        </div>
      </div>

      <div className="absolute bottom-10 text-[10px] text-slate-700 font-bold uppercase tracking-[0.5em] animate-pulse">
        Não feche o navegador durante o processamento
      </div>
    </div>
  );
};
