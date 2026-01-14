
import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { AppState, GeneratedImage, AspectRatio, ImageQuality, FileExtension, GenerationConfig, FilterType } from './types';
import { generateSingleImage, editImage, resizeImage, applyStyleByDescription } from './services/geminiService';
import { LoadingOverlay } from './components/LoadingOverlay';

// Selection rectangle type (values in percentages 0-100)
interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Filter Card Component for visual feedback
const FilterCard: React.FC<{
  filter: FilterType;
  isSelected: boolean;
  onClick: () => void;
  previewUrl: string;
  getFilterString: (f: FilterType) => string;
}> = ({ filter, isSelected, onClick, previewUrl, getFilterString }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 flex flex-col items-center gap-2 transition-all p-1.5 rounded-2xl border-2 relative group ${
        isSelected 
          ? 'border-indigo-500 bg-indigo-500/10 scale-105 shadow-lg shadow-indigo-500/20' 
          : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
      }`}
    >
      <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-700 relative">
        <img 
          src={previewUrl} 
          alt={filter} 
          className="w-full h-full object-cover transition-all duration-500"
          style={{ filter: getFilterString(filter) }}
        />
        {isSelected && (
          <div className="absolute inset-0 bg-indigo-500/10 animate-pulse pointer-events-none"></div>
        )}
      </div>
      <span className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`}>
        {filter === 'None' ? 'Original' : filter}
      </span>
      {isSelected && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full border-2 border-slate-950 shadow-glow"></div>
      )}
    </button>
  );
};

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
  const [styleDescription, setStyleDescription] = useState('');
  const [imageCaption, setImageCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Estados de Edição Visual
  const [selectedFilter, setSelectedFilter] = useState<FilterType>("None");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(100);
  
  // Feedback Visual states
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [isStyleApplying, setIsStyleApplying] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  
  // Estados de Zoom e Navegação
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialPanOnDrag, setInitialPanOnDrag] = useState({ x: 0, y: 0 });

  // Configurações de Sensibilidade
  const [zoomSensitivity, setZoomSensitivity] = useState(1.0);
  const [panSensitivity, setPanSensitivity] = useState(1.0);

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
    extension: "png",
    isRealistic: false
  });

  // Verificar se há alterações visuais ou metadados pendentes para mostrar o botão de salvar
  const hasPendingEdits = useMemo(() => {
    const visualChanges = selectedFilter !== "None" || 
           brightness !== 100 || 
           contrast !== 100 || 
           hue !== 0 || 
           saturation !== 100;
    
    const captionChanged = selectedImage?.caption !== imageCaption;
    
    return visualChanges || captionChanged || selection !== null;
  }, [selectedFilter, brightness, contrast, hue, saturation, selectedImage, imageCaption, selection]);

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

  // Resetar zoom, seleção e carregar metadados quando mudar de imagem
  useEffect(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setSelection(null);
    setIsSelectionMode(false);
    setIsAdjusting(false);
    setShowOriginal(false);
    setImageCaption(selectedImage?.caption || '');
  }, [selectedImage]);

  const getFilterString = (filter: FilterType, b: number = 100, c: number = 100, h: number = 0, s: number = 100): string => {
    let baseFilter = "none";
    switch (filter) {
      case "Grayscale": baseFilter = "grayscale(100%)"; break;
      case "Sepia": baseFilter = "sepia(100%)"; break;
      case "Invert": baseFilter = "invert(100%)"; break;
      case "Vintage": baseFilter = "sepia(50%) contrast(120%) brightness(90%) hue-rotate(-30deg)"; break;
      case "Cyberpunk": baseFilter = "hue-rotate(280deg) saturate(150%) contrast(120%) brightness(110%)"; break;
      case "Solarize": baseFilter = "invert(100%) hue-rotate(180deg)"; break;
      case "NightVision": baseFilter = "sepia(100%) hue-rotate(60deg) saturate(300%) brightness(80%)"; break;
      case "Dramatic": baseFilter = "contrast(150%) saturate(50%)"; break;
      case "Dreamy": baseFilter = "brightness(120%) contrast(80%) blur(1px)"; break;
      case "Polaroid": baseFilter = "sepia(30%) contrast(110%) brightness(105%) saturate(120%)"; break;
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
        generateSingleImage(prompt, negativePrompt, i, config.aspectRatio, config.quality, config.isRealistic)
      );
      const results = await Promise.all(generationPromises);
      
      const newImages: GeneratedImage[] = results.map((res, i) => ({
        id: `img-${Date.now()}-${i}`,
        url: res.url,
        base64: res.base64,
        prompt: prompt,
        caption: ''
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
          prompt: 'Imagem importada',
          caption: ''
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
    
    setStatus(AppState.EDITING);
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
          url: newUrl,
          caption: imageCaption
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
    setStatus(AppState.EDITING);

    try {
      const result = await editImage(selectedImage.base64, editPrompt, config.aspectRatio, selectedFilter);
      const updatedImage: GeneratedImage = {
        id: `edit-${Date.now()}`,
        url: result.url,
        base64: result.base64,
        prompt: `${selectedImage.prompt} + ${editPrompt}`,
        caption: imageCaption
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

  const handleApplyStyle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!styleDescription.trim()) return;

    setError(null);
    setIsStyleApplying(true);
    setIsAdjusting(true);

    try {
      const params = await applyStyleByDescription(styleDescription);
      
      setSelectedFilter(params.filter);
      setBrightness(params.brightness);
      setContrast(params.contrast);
      setHue(params.hue);
      setSaturation(params.saturation);
      
      setStyleDescription('');
    } catch (err) {
      setError("Não foi possível processar o estilo descrito. Tente algo como 'filme clássico'.");
    } finally {
      setIsStyleApplying(false);
      setTimeout(() => setIsAdjusting(false), 2000);
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
    setImageCaption('');
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleZoom = useCallback((direction: 'in' | 'out', customStep?: number) => {
    setZoomScale(prev => {
      const defaultStep = 0.2;
      const step = customStep ?? (defaultStep * zoomSensitivity);
      const next = direction === 'in' ? prev + step : prev - step;
      return Math.min(Math.max(next, 0.5), 10);
    });
  }, [zoomSensitivity]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey || isFullScreen) {
      e.preventDefault();
      const delta = -e.deltaY * 0.005 * zoomSensitivity;
      setZoomScale(prev => Math.min(Math.max(prev + delta, 0.5), 10));
    }
  }, [zoomSensitivity, isFullScreen]);

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
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialPanOnDrag({ x: panOffset.x, y: panOffset.y });
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
      const deltaX = (e.clientX - dragStart.x) * panSensitivity;
      const deltaY = (e.clientY - dragStart.y) * panSensitivity;
      
      setPanOffset({
        x: initialPanOnDrag.x + deltaX,
        y: initialPanOnDrag.y + deltaY
      });
    }
  };

  const handleMouseUp = () => {
    if (isDrawingSelection) {
      setIsDrawingSelection(false);
      if (selection && (selection.width < 1 || selection.height < 1)) {
        setSelection(null);
      } else if (selection) {
        setIsSelectionMode(false);
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
    if (!isSelectionMode) {
      resetZoom();
      setSelection(null);
    }
  };

  const clearSelection = () => {
    setSelection(null);
    setIsSelectionMode(false);
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-100 p-4 md:p-8 selection:bg-indigo-500/30">
      {status === AppState.GENERATING && <LoadingOverlay type="generating" />}
      {status === AppState.EDITING && <LoadingOverlay type="editing" />}
      
      <style>{`
        @keyframes scanline {
          0% { transform: translateY(-100%); opacity: 0; }
          10% { opacity: 0.5; }
          90% { opacity: 0.5; }
          100% { transform: translateY(200%); opacity: 0; }
        }
        .scanline-effect {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, transparent, rgba(99, 102, 241, 0.3), transparent);
          height: 15%;
          width: 100%;
          pointer-events: none;
          z-index: 30;
          animation: scanline 2s linear infinite;
        }
        .adjusting-glow {
          box-shadow: 0 0 40px rgba(99, 102, 241, 0.4);
        }
      `}</style>

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
              className={`relative shadow-[0_0_100px_rgba(0,0,0,0.8)] rounded-lg overflow-hidden transition-all duration-300 ${isAdjusting ? 'adjusting-glow scale-[1.01]' : ''}`}
              style={{ 
                aspectRatio: config.aspectRatio.replace(':', '/'),
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`
              }}
            >
              <img src={selectedImage.url} alt="Base" className="max-w-full max-h-full object-contain pointer-events-none" />
              <img 
                src={selectedImage.url} 
                alt="Local" 
                className={`absolute inset-0 max-w-full max-h-full object-contain pointer-events-none transition-opacity duration-200 ${showOriginal ? 'opacity-0' : 'opacity-100'}`}
                style={{ 
                  filter: getFilterString(selectedFilter, brightness, contrast, hue, saturation),
                  clipPath: selection ? `inset(${selection.y}% ${100 - (selection.x + selection.width)}% ${100 - (selection.y + selection.height)}% ${selection.x}%)` : 'none'
                }}
              />
              {isAdjusting && <div className="scanline-effect"></div>}
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
                  <div className="flex justify-between items-center mb-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-[0.2em]">Sua Visão Criativa</label>
                    <button 
                      type="button"
                      onClick={() => setConfig({...config, isRealistic: !config.isRealistic})}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${config.isRealistic ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-900/60 border-slate-700 text-slate-500'}`}
                    >
                      <span className="text-[10px] font-black tracking-widest uppercase">Modo Realista</span>
                      <div className={`w-3 h-3 rounded-full ${config.isRealistic ? 'bg-indigo-400' : 'bg-slate-700'}`}></div>
                    </button>
                  </div>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Descreva sua imagem..."
                    className="w-full h-40 bg-slate-900/60 border border-slate-700/50 rounded-3xl p-6 text-white text-lg placeholder:text-slate-600 focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all resize-none shadow-inner"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Formato de Saída</label>
                    <div className="flex flex-wrap gap-4">
                      {(["1:1", "4:3", "3:4", "16:9", "9:16"] as AspectRatio[]).map((r) => (
                        <RatioButton key={r} ratio={r} isSelected={config.aspectRatio === r} onClick={() => setConfig({...config, aspectRatio: r})} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-5 pt-6">
                  <button type="submit" disabled={!prompt.trim()} className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-lg py-5 rounded-[1.5rem] transition-all shadow-xl active:scale-[0.98]">CRIAR OBRAS DE ARTE</button>
                  <button type="button" onClick={handleImportClick} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-5 rounded-[1.5rem] transition-all border border-slate-700">Importar</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {status === AppState.SELECTING && (
          <div className="space-y-12 animate-fade-in text-center">
            <h2 className="text-3xl font-black text-white">Escolha sua Favorita</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {images.map((img) => (
                <div key={img.id} onClick={() => handleSelect(img)} className="group relative cursor-pointer overflow-hidden rounded-[2rem] glass-panel hover:ring-4 hover:ring-indigo-500/50 transition-all duration-500" style={{ aspectRatio: config.aspectRatio.replace(':', '/') }}>
                  <img src={img.url} alt="IA Variant" className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent flex flex-col justify-end p-8 opacity-0 group-hover:opacity-100 transition-all"><button className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-2xl">EDITAR ESTA</button></div>
                </div>
              ))}
            </div>
            <button onClick={reset} className="bg-slate-800 px-8 py-3 rounded-full font-bold">Novo Projeto</button>
          </div>
        )}

        {status === AppState.VIEWING && selectedImage && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 animate-fade-in">
            <div className="space-y-6">
              <div 
                ref={imageContainerRef}
                className={`relative group overflow-hidden rounded-[2.5rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)] border flex items-center justify-center select-none transition-all duration-500 ${isAdjusting || isSelectionMode ? 'ring-4 ring-indigo-500/40 border-indigo-500/50 adjusting-glow' : 'border-slate-800 bg-slate-950'}`} 
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
                <img ref={displayImageRef} src={selectedImage.url} alt="Base" className="w-full h-full object-contain pointer-events-none" style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})` }} />
                <img 
                  src={selectedImage.url} alt="Filtered" 
                  className={`absolute inset-0 w-full h-full object-contain pointer-events-none transition-all duration-500 ${showOriginal ? 'opacity-0' : 'opacity-100'}`}
                  style={{ 
                    filter: getFilterString(selectedFilter, brightness, contrast, hue, saturation),
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                    clipPath: selection ? `inset(${selection.y}% ${100 - (selection.x + selection.width)}% ${100 - (selection.y + selection.height)}% ${selection.x}%)` : 'none'
                  }}
                />
                {isAdjusting && <div className="scanline-effect"></div>}
                {selection && <div className="absolute border-2 border-dashed border-indigo-400 bg-indigo-500/10 z-20 pointer-events-none" style={{ left: `${selection.x}%`, top: `${selection.y}%`, width: `${selection.width}%`, height: `${selection.height}%` }} />}
                
                {/* TOOLTIP DE ZOOM */}
                {zoomScale > 1 && (
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[40] pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="bg-slate-900/80 backdrop-blur-xl border border-indigo-500/30 px-5 py-2 rounded-full flex items-center gap-4 shadow-2xl">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
                        <span className="text-xs font-black text-white tracking-widest tabular-nums">{Math.round(zoomScale * 100)}%</span>
                      </div>
                      <div className="w-px h-3 bg-slate-700"></div>
                      <div className="flex gap-4 text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                        <span className="flex items-center gap-1"><kbd className="bg-slate-800 px-1 rounded text-slate-300">ARRASTAR</kbd> MOVER</span>
                        <span className="flex items-center gap-1"><kbd className="bg-slate-800 px-1 rounded text-slate-300">CTRL + SCROLL</kbd> ZOOM</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* CONTROLES DE ZOOM DEDICADOS */}
                <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleZoom('in'); }}
                    className="bg-slate-900/90 hover:bg-indigo-600 text-white p-3 rounded-xl backdrop-blur-xl shadow-2xl transition-all hover:scale-110 active:scale-90 border border-slate-700/50"
                    title="Aproximar"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleZoom('out'); }}
                    className="bg-slate-900/90 hover:bg-indigo-600 text-white p-3 rounded-xl backdrop-blur-xl shadow-2xl transition-all hover:scale-110 active:scale-90 border border-slate-700/50"
                    title="Afastar"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" />
                    </svg>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); resetZoom(); }}
                    className="bg-slate-900/90 hover:bg-red-600 text-white p-3 rounded-xl backdrop-blur-xl shadow-2xl transition-all hover:scale-110 active:scale-90 border border-slate-700/50"
                    title="Resetar Zoom"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>

                <div className="absolute top-6 right-6 flex gap-3 z-50">
                  <button onMouseDown={() => setShowOriginal(true)} onMouseUp={() => setShowOriginal(false)} className={`bg-slate-900/80 px-5 py-3 rounded-2xl font-black text-[10px] tracking-widest transition-all ${hasPendingEdits ? 'opacity-100' : 'opacity-0'}`}>COMPARAÇÃO</button>
                  <button onClick={handleDownload} className="bg-indigo-600 px-6 py-3 rounded-2xl font-black text-sm transition-all shadow-2xl">BAIXAR</button>
                </div>
              </div>

              {/* CAMPO DE LEGENDA */}
              <div className="glass-panel p-6 rounded-[2rem] border border-slate-800/50 shadow-xl space-y-3">
                <label className="block text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] px-2">
                  Legenda da Obra
                </label>
                <textarea
                  value={imageCaption}
                  onChange={(e) => setImageCaption(e.target.value)}
                  placeholder="Descreva esta criação ou adicione notas sobre o processo..."
                  className="w-full bg-slate-900/40 border border-slate-800 rounded-2xl p-4 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/50 outline-none transition-all resize-none h-24 font-mono"
                />
                <div className="flex justify-between items-center px-2">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Metadados Persistentes</span>
                  {selectedImage.caption !== imageCaption && (
                    <span className="text-[10px] text-amber-500 uppercase font-black animate-pulse">Alteração não salva</span>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center px-4">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{selection ? 'Ajuste Local' : 'Ajuste Global'}</span>
                <span className="text-xs font-bold text-slate-600 tracking-widest uppercase">Escala: {Math.round(zoomScale * 100)}%</span>
              </div>
            </div>

            <div className="flex flex-col gap-10">
              <div className="glass-panel p-10 rounded-[2.5rem] shadow-2xl space-y-10">
                <div className="flex justify-between items-center border-b border-slate-800/50 pb-8">
                  <h2 className="text-2xl font-black text-white">Laboratório de Cor</h2>
                  <div className="flex gap-3">
                    {selection ? (
                      <button onClick={clearSelection} className="bg-red-500/10 text-red-400 px-5 py-3 rounded-2xl font-bold text-sm transition-all border border-red-500/30">LIMPAR ÁREA</button>
                    ) : (
                      <button onClick={toggleSelectionMode} className={`px-5 py-3 rounded-2xl font-bold text-sm transition-all border ${isSelectionMode ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800/50 border-slate-700 text-slate-400'}`}>{isSelectionMode ? 'CANCELAR' : 'AJUSTE LOCAL'}</button>
                    )}
                    {hasPendingEdits && (
                      <button onClick={handleSaveEdits} className="bg-white text-slate-950 px-6 py-3 rounded-2xl font-black text-sm shadow-xl">SALVAR FIXO</button>
                    )}
                  </div>
                </div>

                <div className="space-y-10">
                  <div className="space-y-4">
                    <label className="block text-xs font-bold text-indigo-400 uppercase tracking-widest">Estilo Mágico (Descreva o look)</label>
                    <form onSubmit={handleApplyStyle} className="flex gap-3">
                      <input type="text" value={styleDescription} onChange={(e) => setStyleDescription(e.target.value)} placeholder="Ex: 'Cores de outono'..." className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-2xl px-5 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all" />
                      <button type="submit" disabled={isStyleApplying || !styleDescription.trim()} className="bg-indigo-600 text-white font-black px-6 py-3 rounded-2xl text-xs uppercase tracking-widest">{isStyleApplying ? '...' : 'APLICAR'}</button>
                    </form>
                  </div>

                  {!isSelectionMode || selection ? (
                    <>
                      <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
                        {(["None", "Grayscale", "Sepia", "Invert", "Vintage", "Cyberpunk", "Solarize", "NightVision", "Dramatic", "Dreamy", "Polaroid"] as FilterType[]).map((f) => (
                          <FilterCard key={f} filter={f} isSelected={selectedFilter === f} onClick={() => { setSelectedFilter(f); }} previewUrl={selectedImage.url} getFilterString={getFilterString} />
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                        {[
                          { label: 'Brilho', val: brightness, set: setBrightness, min: 0, max: 200, unit: '%', def: 100 },
                          { label: 'Contraste', val: contrast, set: setContrast, min: 0, max: 200, unit: '%', def: 100 },
                          { label: 'Matiz', val: hue, set: setHue, min: 0, max: 360, unit: '°', def: 0 },
                          { label: 'Saturação', val: saturation, set: setSaturation, min: 0, max: 200, unit: '%', def: 100 }
                        ].map(s => (
                          <div key={s.label}>
                            <div className="flex justify-between mb-2">
                              <span className="text-[10px] font-bold uppercase text-slate-500">{s.label}</span>
                              <span className="text-[10px] font-mono font-bold text-indigo-300">{s.val}{s.unit}</span>
                            </div>
                            <input type="range" min={s.min} max={s.max} value={s.val} onMouseDown={() => setIsAdjusting(true)} onMouseUp={() => setIsAdjusting(false)} onChange={e => { s.set(parseInt(e.target.value)); }} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="p-12 border-2 border-dashed border-indigo-500/30 rounded-[2rem] bg-indigo-500/5 text-center animate-pulse">
                      <p className="text-indigo-300 font-bold uppercase tracking-widest text-sm">Seletor de Área Ativo</p>
                      <p className="text-slate-500 text-xs">Desenhe sobre a imagem à esquerda.</p>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-800/50 pt-10">
                  <h3 className="text-xl font-black text-white mb-6">Inpainting & IA</h3>
                  <form onSubmit={handleEdit} className="space-y-6">
                    <input type="text" value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} placeholder="Instrução para a IA... ex: 'Adicione um chapéu'" className="w-full bg-slate-950 border border-slate-700 rounded-2xl p-5 text-white outline-none focus:border-purple-500 transition-all" />
                    <div className="flex gap-4">
                      <button type="submit" disabled={!editPrompt.trim()} className="flex-1 bg-white text-slate-950 font-black py-4 rounded-2xl shadow-xl active:scale-95 transition-all">EXECUTAR IA</button>
                      <button type="button" onClick={reset} className="px-8 border border-slate-700 text-white font-bold rounded-2xl">LIMPAR</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && <div className="mt-12 p-6 bg-red-500/10 border border-red-500/30 text-red-400 rounded-3xl text-center font-bold animate-pulse">{error}</div>}
      </main>

      <footer className="max-w-6xl mx-auto py-12 border-t border-slate-900 text-center space-y-4">
        <p className="text-slate-600 text-xs font-black uppercase tracking-[0.5em]">ImagineAI Studio &copy; {new Date().getFullYear()}</p>
        <p className="text-slate-700 text-[10px] font-bold">POWERED BY GEMINI 2.5 FLASH ENGINE</p>
      </footer>
    </div>
  );
};

export default App;
