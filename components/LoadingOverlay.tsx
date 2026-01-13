
import React, { useState, useEffect } from 'react';

const MESSAGES = [
  "Iniciando os motores criativos...",
  "Misturando pixels e sonhos...",
  "Ajustando a iluminação cinematográfica...",
  "Quase lá! Refinando os detalhes...",
  "Dando vida à sua imaginação...",
];

export const LoadingOverlay: React.FC = () => {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md">
      <div className="relative h-24 w-24">
        <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20"></div>
        <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"></div>
      </div>
      <p className="mt-8 text-xl font-medium text-indigo-300 animate-pulse">
        {MESSAGES[msgIndex]}
      </p>
    </div>
  );
};
