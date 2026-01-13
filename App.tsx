
import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { AppState, GeneratedImage, AspectRatio, ImageQuality, FileExtension, GenerationConfig, FilterType } from './types';
import { generateSingleImage, editImage, resizeImage } from './services/geminiService';
import { LoadingOverlay } from './components/LoadingOverlay';

// Selection rectangle type (values in percentages 0-100)
interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Componente auxiliar para os botões de Formato (Ratio) com miniaturas interativas
const RatioButton: React.FC<{ 
  ratio: AspectRatio; 
  isSelected: boolean; 
  onClick: () => void;
  label?: string;
}> = ({ ratio, isSelected, onClick, label }) => {
  const getIconStyle = (r: AspectRatio) => {
    switch (r) {
      case "1:1": return "w-6 h-6";
      case "4:3": return "w-8 h-6";
      case "3:4": return "w-6 h-8";
      case "16:9": return "w-9 h-5";
      case "9:16": return "w-5 h-9";
      default: return "w-6 h-6";
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-between p-3 rounded-2xl border-2 transition-all h-24 min-w-[76px] group ${
        isSelected 
          ? 'border-indigo-500 bg-indigo-500/10 text-white shadow-lg shadow-indigo-500/20 scale-105' 
          : 'border-slate-800 bg-slate-900/40 text-slate-500 hover:border-slate-700 hover:text-slate-300'
      }`}
    >
      <div className="flex items-center justify-center flex-1 w-full">
        <div className={`${getIconStyle(ratio)} border-2 rounded-sm transition-colors ${
          isSelected ? 'border-indigo-400 bg-indigo-500/20' : 'border-slate-700 group-hover:border-slate-600'
        }`} />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-tighter mt-1">{label || ratio}</span>
    </button>
  );
};

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [status, setStatus] = useState<AppState>(AppState.IDLE);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Estados de Edição Visual
  const [selectedFilter, setSelectedFilter] = useState<FilterType>("None");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(100);
  
  // Estados de Zoom e Navegação
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Estados de Seleção Local
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [isDrawingSelection, setIsDrawingSelection] = useState(false);
  const [selectionStart, setSelectionStart] = useState({ x: 0, y: 0 });
  
  const [targetResizeRatio, setTargetResizeRatio] = useState<AspectRatio | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const displayImageRef = useRef<HTMLImageElement>(null);

  // Configurações de Geração
  const [config, setConfig] = useState<GenerationConfig>({
    aspectRatio: "1:1",
    quality: "HD",
    extension: "png"
  });

  // Verificar se há alterações visuais pendentes para mostrar o botão de salvar
  const hasPendingEdits = useMemo(() => {
    return selectedFilter !== "None" || 
           brightness !== 100 || 
           contrast !== 100 || 
           hue !== 0 || 
           saturation !== 100;
  }, [selectedFilter, brightness, contrast, hue, saturation]);

  // Identificar índice da imagem atual para navegação
  const currentIndex = useMemo(() => {
    if (!selectedImage) return -1;
    return images.findIndex(img => img.id === selectedImage.id);
  }, [selectedImage, images]);

  const hasNavigation = images.length > 1 && currentIndex !== -1;

  // Fechar tela cheia com ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

  // Resetar zoom e seleção quando mudar de imagem
  useEffect(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setSelection(null);
    setIsSelectionMode(false);
  }, [selectedImage]);

  const getFilterString = (filter: FilterType, b: number, c: number, h: number, s: number): string => {
    let baseFilter = "none";
    switch (filter) {
      case "Grayscale": baseFilter = "grayscale(100%)"; break;
      case "Sepia": baseFilter = "sepia(100%)"; break;
      case "Invert": baseFilter = "invert(100%)"; break;
      case "Vintage": baseFilter = "sepia(50%) contrast(120%) brightness(90%) hue-rotate(-30deg)"; break;
      default: baseFilter = "none";
    }

    const brightnessFilter = `brightness(${b}%)`;
    const contrastFilter = `contrast(${c}%)`;
    const hueFilter = `hue-rotate(${h}deg)`;
    const saturateFilter = `saturate(${s}%)`;

    return `${baseFilter === "none" ? "" : baseFilter + " "}${brightnessFilter} ${contrastFilter} ${hueFilter} ${saturateFilter}`;
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;

    setError(null);
    setStatus(AppState.GENERATING);
    setImages([]);
    setSelectedImage(null);
    resetEditSliders();

    try {
      const generationPromises = [0, 1, 2].map((i) => 
        generateSingleImage(prompt, negativePrompt, i, config.aspectRatio, config.quality)
      );
      const results = await Promise.all(generationPromises);
      
      const newImages: GeneratedImage[] = results.map((res, i) => ({
        id: `img-${Date.now()}-${i}`,
        url: res.url,
        base64: res.base64,
        prompt: prompt
      }));

      setImages(newImages);
      setStatus(AppState.SELECTING);
    } catch (err) {
      setError("Ocorreu um erro ao gerar as imagens. Tente novamente.");
      setStatus(AppState.IDLE);
      console.error(err);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        const base64Data = result.split(',')[1];
        const importedImg: GeneratedImage = {
          id: `imported-${Date.now()}`,
          url: result,
          base64: base64Data,
          prompt: 'Imagem importada'
        };
        setSelectedImage(importedImg);
        setImages([]); // Limpa as geradas ao importar
        resetEditSliders();
        setStatus(AppState.VIEWING);
      }
    };
    reader.onerror = () => {
      setError("Não foi possível ler o arquivo. Tente outra imagem.");
    };
    reader.readAsDataURL(file);
  };

  const handleSelect = (img: GeneratedImage) => {
    setSelectedImage(img);
    resetEditSliders();
    setTargetResizeRatio(config.aspectRatio);
    setStatus(AppState.VIEWING);
  };

  const resetEditSliders = () => {
    setSelectedFilter("None");
    setBrightness(100);
    setContrast(100);
    setHue(0);
    setSaturation(100);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setSelection(null);
  };

  const navigateImages = (direction: 'next' | 'prev') => {
    if (!hasNavigation) return;
    let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    
    // Loop infinito
    if (newIndex >= images.length) newIndex = 0;
    if (newIndex < 0) newIndex = images.length - 1;
    
    setSelectedImage(images[newIndex]);
    resetEditSliders();
    setTargetResizeRatio(config.aspectRatio);
  };

  const handleSaveEdits = () => {
    if (!selectedImage) return;
    
    setStatus(AppState.GENERATING);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);

        if (selection) {
          ctx.save();
          const filter = getFilterString(selectedFilter, brightness, contrast, hue, saturation);
          ctx.filter = filter;
          
          const sx = (selection.x * img.width) / 100;
          const sy = (selection.y * img.height) / 100;
          const sw = (selection.width * img.width) / 100;
          const sh = (selection.height * img.height) / 100;
          
          ctx.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
          ctx.restore();
        } else {
          ctx.filter = getFilterString(selectedFilter, brightness, contrast, hue, saturation);
          ctx.drawImage(img, 0, 0);
        }

        const newBase64 = canvas.toDataURL('image/png').split(',')[1];
        const newUrl = canvas.toDataURL('image/png');
        
        const updatedImage: GeneratedImage = {
          ...selectedImage,
          base64: newBase64,
          url: newUrl
        };

        if (currentIndex !== -1) {
          const newImages = [...images];
          newImages[currentIndex] = updatedImage;
          setImages(newImages);
        }

        setSelectedImage(updatedImage);
        resetEditSliders();
        setStatus(AppState.VIEWING);
      }
    };
    img.src = selectedImage.url;
  };

  const handleDiscardEdits = () => {
    resetEditSliders();
  };

  const handleDownload = () => {
    if (!selectedImage) return;
    
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        if (selection) {
          ctx.save();
          ctx.filter = getFilterString(selectedFilter, brightness, contrast, hue, saturation);
          const sx = (selection.x * img.width) / 100;
          const sy = (selection.y * img.height) / 100;
          const sw = (selection.width * img.width) / 100;
          const sh = (selection.height * img.height) / 100;
          ctx.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
          ctx.restore();
        } else {
          ctx.filter = getFilterString(selectedFilter, brightness, contrast, hue, saturation);
          ctx.drawImage(img, 0, 0);
        }
        
        const dataUrl = canvas.toDataURL(`image/${config.extension === 'jpg' ? 'jpeg' : 'png'}`);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `imagine-ai-${Date.now()}.${config.extension}`;
        link.click();
      }
    };
    img.src = selectedImage.url;
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedImage || !editPrompt.trim()) return;

    setError(null);
    setStatus(AppState.GENERATING);

    try {
      const result = await editImage(selectedImage.base64, editPrompt, config.aspectRatio, selectedFilter);
      const updatedImage: GeneratedImage = {
        id: `edit-${Date.now()}`,
        url: result.url,
        base64: result.base64,
        prompt: `${selectedImage.prompt} + ${editPrompt}`
      };
      
      if (currentIndex !== -1) {
        const newImages = [...images];
        newImages[currentIndex] = updatedImage;
        setImages(newImages);
      }
      
      setSelectedImage(updatedImage);
      setEditPrompt('');
      resetEditSliders();
      setStatus(AppState.VIEWING);
    } catch (err) {
      setError("Erro ao editar a imagem. Tente uma instrução diferente.");
      setStatus(AppState.VIEWING);
      console.error(err);
    }
  };

  const handleResizeWithAI = async () => {
    if (!selectedImage || !targetResizeRatio) return;
    if (targetResizeRatio === config.aspectRatio) return;

    setError(null);
    setStatus(AppState.GENERATING);

    try {
      const result = await resizeImage(selectedImage.base64, targetResizeRatio);
      const updatedImage: GeneratedImage = {
        id: `resize-${Date.now()}`,
        url: result.url,
        base64: result.base64,
        prompt: `${selectedImage.prompt} (Redimensionado para ${targetResizeRatio})`
      };

      setConfig(prev => ({ ...prev, aspectRatio: targetResizeRatio }));
      
      if (currentIndex !== -1) {
        const newImages = [...images];
        newImages[currentIndex] = updatedImage;
        setImages(newImages);
      }
      
      setSelectedImage(updatedImage);
      resetEditSliders();
      setStatus(AppState.VIEWING);
    } catch (err) {
      setError("Erro ao redimensionar com IA. Tente outro formato.");
      setStatus(AppState.VIEWING);
      console.error(err);
    }
  };

  const reset = () => {
    setStatus(AppState.IDLE);
    setPrompt('');
    setNegativePrompt('');
    setImages([]);
    setSelectedImage(null);
    resetEditSliders();
    setTargetResizeRatio(null);
    setIsFullScreen(false);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleZoom = useCallback((direction: 'in' | 'out') => {
    setZoomScale(prev => {
      const step = 0.2;
      const next = direction === 'in' ? prev + step : prev - step;
      return Math.min(Math.max(next, 0.5), 5);
    });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 'in' : 'out';
      handleZoom(direction);
    }
  }, [handleZoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isSelectionMode) {
      const rect = displayImageRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      
      setIsDrawingSelection(true);
      setSelectionStart({ x, y });
      setSelection({ x, y, width: 0, height: 0 });
    } else if (zoomScale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDrawingSelection && isSelectionMode) {
      const rect = displayImageRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const currentX = ((e.clientX - rect.left) / rect.width) * 100;
      const currentY = ((e.clientY - rect.top) / rect.height) * 100;
      
      const x = Math.min(currentX, selectionStart.x);
      const y = Math.min(currentY, selectionStart.y);
      const width = Math.abs(currentX - selectionStart.x);
      const height = Math.abs(currentY - selectionStart.y);
      
      setSelection({ x, y, width, height });
    } else if (isDragging && zoomScale > 1) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    if (isDrawingSelection) {
      setIsDrawingSelection(false);
      if (selection && (selection.width < 1 || selection.height < 1)) {
        setSelection(null);
      }
    }
    setIsDragging(false);
  };

  const resetZoom = () => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) {
      setSelection(null);
    } else {
      resetZoom();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 selection:bg-indigo-500/30">
      {status === AppState.GENERATING && <LoadingOverlay />}
      
      {isFullScreen && selectedImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-2xl animate-in fade-in duration-300 overflow-hidden"
          onWheel={handleWheel}
        >
          <button 
            onClick={() => setIsFullScreen(false)}
            className="absolute top-6 right-6 z-[110] bg-slate-800/80 hover:bg-red-600 hover:text-white p-3 rounded-full transition-all text-slate-300 active:scale-90 shadow-2xl"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="absolute top-6 left-6 z-[110] flex flex-col gap-3">
            <button onClick={() => handleZoom('in')} className="bg-slate-800/80 hover:bg-indigo-600 p-3 rounded-2xl text-white shadow-2xl transition-all hover:scale-105 active:scale-95">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button onClick={() => handleZoom('out')} className="bg-slate-800/80 hover:bg-indigo-600 p-3 rounded-2xl text-white shadow-2xl transition-all hover:scale-105 active:scale-95">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <button onClick={resetZoom} className="bg-slate-800/80 hover:bg-indigo-600 p-3 rounded-2xl text-white shadow-2xl transition-all hover:scale-105 active:scale-95">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          <div 
            className={`relative w-full h-full flex items-center justify-center p-4 md:p-12 ${zoomScale > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {hasNavigation && zoomScale === 1 && (
              <>
                <button
                  onClick={() => navigateImages('prev')}
                  className="absolute left-4 md:left-10 top-1/2 -translate-y-1/2 bg-slate-800/50 hover:bg-indigo-600 text-white p-6 rounded-full backdrop-blur-xl transition-all z-[110] active:scale-90 shadow-2xl"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => navigateImages('next')}
                  className="absolute right-4 md:right-10 top-1/2 -translate-y-1/2 bg-slate-800/50 hover:bg-indigo-600 text-white p-6 rounded-full backdrop-blur-xl transition-all z-[110] active:scale-90 shadow-2xl"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}

            <div 
              className="relative shadow-[0_0_100px_rgba(0,0,0,0.8)] rounded-lg overflow-hidden transition-transform duration-200"
              style={{ 
                aspectRatio: config.aspectRatio.replace(':', '/'),
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`
              }}
            >
              <img src={selectedImage.url} alt="Base" className="max-w-full max-h-full object-contain pointer-events-none" />
              <img 
                src={selectedImage.url} 
                alt="Local" 
                className="absolute inset-0 max-w-full max-h-full object-contain pointer-events-none"
                style={{ 
                  filter: getFilterString(selectedFilter, brightness, contrast, hue, saturation),
                  clipPath: selection ? `inset(${selection.y}% ${100 - (selection.x + selection.width)}% ${100 - (selection.y + selection.height)}% ${selection.x}%)` : 'none'
                }}
              />
            </div>
            
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-2xl px-8 py-3 rounded-full border border-slate-700/50 flex items-center gap-6 text-sm font-bold shadow-2xl">
              <span className="text-indigo-400 tracking-wider">MODO IMERSIVO</span>
              <div className="w-px h-5 bg-slate-700"></div>
              <span className="text-slate-300">{Math.round(zoomScale * 100)}%</span>
              <div className="w-px h-5 bg-slate-700"></div>
              <span className="text-slate-300">{config.aspectRatio}</span>
              {hasNavigation && (
                <>
                  <div className="w-px h-5 bg-slate-700"></div>
                  <span className="text-slate-400 font-medium">{currentIndex + 1} / {images.length}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />

      <header className="max-w-6xl mx-auto mb-16 text-center animate-fade-in">
        <h1 className="text-5xl md:text-7xl font-extrabold mb-6 tracking-tight">
          <span className="gradient-text">ImagineAI</span> Studio
        </h1>
        <p className="text-slate-400 text-lg md:text-2xl font-light max-w-2xl mx-auto leading-relaxed">
          O estúdio criativo movido a IA que transforma suas ideias em imagens extraordinárias.
        </p>
      </header>

      <main className="max-w-6xl mx-auto pb-20">
        {status === AppState.IDLE && (
          <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
            <div className="glass-panel p-10 rounded-[2.5rem] shadow-2xl">
              <form onSubmit={handleGenerate} className="space-y-8">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Sua Visão Criativa</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Descreva sua imagem... ex: 'Um castelo flutuante em um céu de néon'"
                    className="w-full h-40 bg-slate-900/60 border border-slate-700/50 rounded-3xl p-6 text-white text-lg placeholder:text-slate-600 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none shadow-inner"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Formato de Saída</label>
                    <div className="flex flex-wrap gap-4">
                      {(["1:1", "4:3", "3:4", "16:9", "9:16"] as AspectRatio[]).map((r) => (
                        <RatioButton
                          key={r}
                          ratio={r}
                          isSelected={config.aspectRatio === r}
                          onClick={() => setConfig({...config, aspectRatio: r})}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Refinamento</label>
                    <div className="grid grid-cols-3 gap-3 bg-slate-900/60 p-2 rounded-2xl border border-slate-800">
                      {(["Standard", "HD", "Ultra"] as ImageQuality[]).map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setConfig({...config, quality: q})}
                          className={`py-3 rounded-xl text-xs font-bold transition-all ${config.quality === q ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Formato do Arquivo</label>
                    <div className="grid grid-cols-2 gap-3 bg-slate-900/60 p-2 rounded-2xl border border-slate-800">
                      {(["png", "jpg"] as FileExtension[]).map((ext) => (
                        <button
                          key={ext}
                          type="button"
                          onClick={() => setConfig({...config, extension: ext})}
                          className={`py-3 rounded-xl text-xs font-bold transition-all ${config.extension === ext ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
                        >
                          .{ext.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-5 pt-6">
                  <button
                    type="submit"
                    disabled={!prompt.trim()}
                    className="flex-[2] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-extrabold text-lg py-5 rounded-[1.5rem] transition-all shadow-[0_10px_30px_rgba(79,70,229,0.3)] hover:shadow-[0_15px_40px_rgba(79,70,229,0.4)] active:scale-[0.98] glow-button"
                  >
                    CRIAR OBRAS DE ARTE
                  </button>
                  <button
                    type="button"
                    onClick={handleImportClick}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-5 rounded-[1.5rem] transition-all border border-slate-700 active:scale-[0.98]"
                  >
                    Importar Imagem
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {status === AppState.SELECTING && (
          <div className="space-y-12 animate-fade-in">
            <div className="flex justify-between items-end border-b border-slate-800 pb-8">
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-white">Escolha sua Favorita</h2>
                <p className="text-slate-400">Geramos 3 interpretações únicas da sua ideia.</p>
              </div>
              <button onClick={reset} className="bg-slate-800/80 hover:bg-slate-700 px-6 py-3 rounded-2xl font-bold text-sm transition-all border border-slate-700">Novo Projeto</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {images.map((img) => (
                <div
                  key={img.id}
                  onClick={() => handleSelect(img)}
                  className="group relative cursor-pointer overflow-hidden rounded-[2rem] glass-panel hover:ring-4 hover:ring-indigo-500/50 transition-all duration-500"
                  style={{ aspectRatio: config.aspectRatio.replace(':', '/') }}
                >
                  <img src={img.url} alt="IA Variant" className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-end p-8">
                    <button className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-2xl translate-y-4 group-hover:translate-y-0 transition-all">EDITAR ESTA</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {status === AppState.VIEWING && selectedImage && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 animate-fade-in">
            <div className="space-y-6">
              <div 
                ref={imageContainerRef}
                className="relative group overflow-hidden rounded-[2.5rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)] border border-slate-800 bg-slate-950 flex items-center justify-center" 
                style={{ 
                  aspectRatio: config.aspectRatio.replace(':', '/'), 
                  cursor: isSelectionMode ? 'crosshair' : (zoomScale > 1 ? 'grab' : 'zoom-in') 
                }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img 
                  ref={displayImageRef}
                  src={selectedImage.url} 
                  alt="Base" 
                  className="w-full h-full object-contain transition-transform duration-200 pointer-events-none" 
                  style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})` }}
                />

                {hasPendingEdits && (
                  <img 
                    src={selectedImage.url} 
                    alt="Filtered" 
                    className="absolute inset-0 w-full h-full object-contain transition-transform duration-200 pointer-events-none"
                    style={{ 
                      filter: getFilterString(selectedFilter, brightness, contrast, hue, saturation),
                      transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                      clipPath: selection ? `inset(${selection.y}% ${100 - (selection.x + selection.width)}% ${100 - (selection.y + selection.height)}% ${selection.x}%)` : 'none'
                    }}
                  />
                )}

                {selection && isSelectionMode && (
                  <div 
                    className="absolute border-2 border-dashed border-indigo-400 bg-indigo-500/10 z-20 pointer-events-none"
                    style={{ left: `${selection.x}%`, top: `${selection.y}%`, width: `${selection.width}%`, height: `${selection.height}%` }}
                  />
                )}
                
                {isSelectionMode && (
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-5 py-2 rounded-full text-xs font-black z-30 shadow-2xl animate-pulse tracking-widest uppercase">
                    Ferramenta de Seleção Ativa
                  </div>
                )}

                <div className="absolute top-6 left-6 flex flex-col gap-3 z-10 opacity-0 group-hover:opacity-100 transition-all duration-300">
                   <button onClick={() => handleZoom('in')} className="bg-slate-900/90 hover:bg-indigo-600 text-white p-3 rounded-2xl backdrop-blur-xl shadow-2xl transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg></button>
                   <button onClick={() => handleZoom('out')} className="bg-slate-900/90 hover:bg-indigo-600 text-white p-3 rounded-2xl backdrop-blur-xl shadow-2xl transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg></button>
                </div>

                <button onClick={() => setIsFullScreen(true)} className="absolute bottom-6 right-6 bg-slate-900/80 hover:bg-indigo-600 text-white p-4 rounded-2xl backdrop-blur-xl opacity-0 group-hover:opacity-100 transition-all shadow-2xl"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg></button>

                {hasNavigation && zoomScale === 1 && !isSelectionMode && (
                  <>
                    <button onClick={() => navigateImages('prev')} className="absolute left-6 top-1/2 -translate-y-1/2 bg-slate-900/80 hover:bg-indigo-600 text-white p-4 rounded-full shadow-2xl opacity-0 group-hover:opacity-100 transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg></button>
                    <button onClick={() => navigateImages('next')} className="absolute right-6 top-1/2 -translate-y-1/2 bg-slate-900/80 hover:bg-indigo-600 text-white p-4 rounded-full shadow-2xl opacity-0 group-hover:opacity-100 transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg></button>
                  </>
                )}

                <button 
                  onClick={handleDownload}
                  className="absolute top-6 right-6 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-2xl font-black text-sm transition-all shadow-2xl active:scale-95 flex items-center gap-2"
                >
                  BAIXAR
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                </button>
              </div>
              
              <div className="flex justify-between items-center px-4">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{selection ? 'Ajuste Local' : 'Ajuste Global'}</span>
                </div>
                <span className="text-xs font-bold text-slate-600 tracking-widest">ZOOM: {Math.round(zoomScale * 100)}%</span>
              </div>
            </div>

            <div className="flex flex-col gap-10">
              <div className="glass-panel p-10 rounded-[2.5rem] shadow-2xl space-y-10">
                <div className="flex justify-between items-center border-b border-slate-800/50 pb-8">
                  <h2 className="text-2xl font-black text-white flex items-center gap-4">
                    <span className="bg-indigo-500/20 p-2.5 rounded-2xl"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg></span>
                    Laboratório de Cor
                  </h2>
                  <div className="flex gap-3">
                    <button onClick={toggleSelectionMode} className={`px-5 py-3 rounded-2xl font-bold text-sm transition-all border ${isSelectionMode ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white'}`}>
                      {isSelectionMode ? 'CONCLUIR' : 'MARCAR ÁREA'}
                    </button>
                    {(hasPendingEdits || selection) && (
                      <button onClick={handleSaveEdits} className="bg-white text-slate-950 px-6 py-3 rounded-2xl font-black text-sm hover:bg-indigo-50 transition-all shadow-xl">APLICAR</button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Filtro Artístico</label>
                    <select 
                      value={selectedFilter}
                      onChange={(e) => setSelectedFilter(e.target.value as FilterType)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white font-bold outline-none cursor-pointer focus:ring-4 focus:ring-indigo-500/10 transition-all"
                    >
                      <option value="None">Padrão</option>
                      <option value="Grayscale">Preto & Branco</option>
                      <option value="Sepia">Sépia Clássico</option>
                      <option value="Invert">Inverter Negativo</option>
                      <option value="Vintage">Vintage Film</option>
                    </select>
                  </div>

                  <div className="space-y-6">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Ajustes Finos</label>
                    <div className="space-y-6">
                       {[
                         { label: 'Brilho', val: brightness, set: setBrightness, min: 0, max: 200, unit: '%' },
                         { label: 'Contraste', val: contrast, set: setContrast, min: 0, max: 200, unit: '%' },
                         { label: 'Matiz', val: hue, set: setHue, min: 0, max: 360, unit: '°' },
                         { label: 'Saturação', val: saturation, set: setSaturation, min: 0, max: 200, unit: '%' }
                       ].map(s => (
                         <div key={s.label}>
                           <div className="flex justify-between mb-2">
                             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{s.label}</span>
                             <span className="text-[10px] font-mono font-bold text-indigo-400">{s.val}{s.unit}</span>
                           </div>
                           <input type="range" min={s.min} max={s.max} value={s.val} onChange={e => s.set(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                         </div>
                       ))}
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-800/50 pt-10">
                  <h3 className="text-xl font-black text-white mb-6 flex items-center gap-4">
                    <span className="bg-purple-500/20 p-2.5 rounded-2xl"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11l-7-7-7 7M5 19l7-7 7 7" /></svg></span>
                    Inpainting & IA
                  </h3>
                  <form onSubmit={handleEdit} className="space-y-6">
                    <input
                      type="text"
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      placeholder="Instrução para a IA... ex: 'Adicione óculos escuros'"
                      className="w-full bg-slate-950 border border-slate-700 rounded-2xl p-5 text-white placeholder:text-slate-600 focus:ring-4 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
                    />
                    <div className="flex gap-4">
                      <button type="submit" disabled={!editPrompt.trim()} className="flex-1 bg-white text-slate-950 font-black py-4 rounded-2xl hover:bg-slate-100 transition-all shadow-xl active:scale-95">REGENERAR ÁREA</button>
                      <button type="button" onClick={reset} className="px-8 border border-slate-700 hover:bg-slate-900 text-white font-bold rounded-2xl transition-all">LIMPAR</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-12 p-6 bg-red-500/10 border border-red-500/30 text-red-400 rounded-3xl text-center font-bold animate-pulse shadow-2xl">
            {error}
          </div>
        )}
      </main>

      <footer className="max-w-6xl mx-auto py-12 border-t border-slate-900 text-center space-y-4">
        <p className="text-slate-600 text-xs font-black uppercase tracking-[0.5em]">ImagineAI Studio &copy; {new Date().getFullYear()}</p>
        <p className="text-slate-700 text-[10px] font-bold">POWERED BY GEMINI 2.5 FLASH ENGINE</p>
      </footer>
    </div>
  );
};

export default App;
