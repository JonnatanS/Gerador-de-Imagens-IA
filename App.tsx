
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { AppState, GeneratedImage, AspectRatio, ImageQuality, FileExtension, GenerationConfig, FilterType } from './types';
import { generateSingleImage, editImage, resizeImage } from './services/geminiService';
import { LoadingOverlay } from './components/LoadingOverlay';

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [status, setStatus] = useState<AppState>(AppState.IDLE);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>("None");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(100);
  const [targetResizeRatio, setTargetResizeRatio] = useState<AspectRatio | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Configurações de Geração
  const [config, setConfig] = useState<GenerationConfig>({
    aspectRatio: "1:1",
    quality: "HD",
    extension: "png"
  });

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

  const getFilterStyle = (filter: FilterType, b: number, c: number, h: number, s: number): string => {
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
    setSelectedFilter("None");
    setBrightness(100);
    setContrast(100);
    setHue(0);
    setSaturation(100);

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
        setSelectedFilter("None");
        setBrightness(100);
        setContrast(100);
        setHue(0);
        setSaturation(100);
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
    setSelectedFilter("None");
    setBrightness(100);
    setContrast(100);
    setHue(0);
    setSaturation(100);
    setTargetResizeRatio(config.aspectRatio);
    setStatus(AppState.VIEWING);
  };

  const navigateImages = (direction: 'next' | 'prev') => {
    if (!hasNavigation) return;
    let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    
    // Loop infinito
    if (newIndex >= images.length) newIndex = 0;
    if (newIndex < 0) newIndex = images.length - 1;
    
    setSelectedImage(images[newIndex]);
    setSelectedFilter("None");
    setBrightness(100);
    setContrast(100);
    setHue(0);
    setSaturation(100);
    setTargetResizeRatio(config.aspectRatio);
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
        ctx.filter = getFilterStyle(selectedFilter, brightness, contrast, hue, saturation);
        ctx.drawImage(img, 0, 0);
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

      // Atualiza o config para refletir o novo formato global desta visualização
      setConfig(prev => ({ ...prev, aspectRatio: targetResizeRatio }));
      
      if (currentIndex !== -1) {
        const newImages = [...images];
        newImages[currentIndex] = updatedImage;
        setImages(newImages);
      }
      
      setSelectedImage(updatedImage);
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
    setSelectedFilter("None");
    setBrightness(100);
    setContrast(100);
    setHue(0);
    setSaturation(100);
    setTargetResizeRatio(null);
    setIsFullScreen(false);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      {status === AppState.GENERATING && <LoadingOverlay />}
      
      {/* MODO TELA CHEIA (FULLSCREEN OVERLAY) */}
      {isFullScreen && selectedImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-2xl animate-in fade-in duration-300">
          <button 
            onClick={() => setIsFullScreen(false)}
            className="absolute top-6 right-6 z-[110] bg-slate-800/50 hover:bg-red-500 hover:text-white p-3 rounded-full transition-all text-slate-400 active:scale-90"
            title="Fechar Tela Cheia (Esc)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="relative w-full h-full flex items-center justify-center p-4 md:p-12">
            {hasNavigation && (
              <>
                <button
                  onClick={() => navigateImages('prev')}
                  className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 bg-slate-800/30 hover:bg-indigo-600 text-white p-5 rounded-full backdrop-blur-md transition-all z-[110] active:scale-90"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => navigateImages('next')}
                  className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 bg-slate-800/30 hover:bg-indigo-600 text-white p-5 rounded-full backdrop-blur-md transition-all z-[110] active:scale-90"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}

            <img 
              src={selectedImage.url} 
              alt="Immersive view" 
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg pointer-events-none transition-all duration-300"
              style={{ 
                filter: getFilterStyle(selectedFilter, brightness, contrast, hue, saturation),
                aspectRatio: config.aspectRatio.replace(':', '/')
              }}
            />
            
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/60 backdrop-blur-md px-6 py-2 rounded-full border border-slate-700/50 flex items-center gap-4 text-sm font-medium">
              <span className="text-indigo-400">Modo Imersivo</span>
              <div className="w-px h-4 bg-slate-700"></div>
              <span className="text-slate-300">{config.aspectRatio}</span>
              {hasNavigation && (
                <>
                  <div className="w-px h-4 bg-slate-700"></div>
                  <span className="text-slate-400">{currentIndex + 1} de {images.length}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
      />

      <header className="max-w-6xl mx-auto mb-10 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold mb-4 tracking-tight">
          <span className="gradient-text">ImagineAI</span> Studio
        </h1>
        <p className="text-slate-400 text-lg md:text-xl font-light">
          Gerador e editor de imagens gratuito com inteligência artificial.
        </p>
      </header>

      <main className="max-w-6xl mx-auto">
        {status === AppState.IDLE && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="glass-panel p-8 rounded-3xl shadow-2xl">
              <form onSubmit={handleGenerate} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Sua ideia criativa</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ex: Uma paisagem de Marte com rios azuis, estilo sci-fi..."
                    className="w-full h-32 bg-slate-900 border border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">O que evitar (Prompt Negativo)</label>
                  <input
                    type="text"
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="Ex: pessoas, baixa qualidade, borrão, texto..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-800">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-3">Formato (Ratio)</label>
                    <div className="flex flex-wrap gap-2">
                      {(["1:1", "4:3", "3:4", "16:9", "9:16"] as AspectRatio[]).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setConfig({...config, aspectRatio: r})}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${config.aspectRatio === r ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-3">Qualidade</label>
                    <div className="flex gap-2">
                      {(["Standard", "HD", "Ultra"] as ImageQuality[]).map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setConfig({...config, quality: q})}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${config.quality === q ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-3">Extensão</label>
                    <div className="flex gap-2">
                      {(["png", "jpg"] as FileExtension[]).map((ext) => (
                        <button
                          key={ext}
                          type="button"
                          onClick={() => setConfig({...config, extension: ext})}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${config.extension === ext ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                        >
                          .{ext.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    type="submit"
                    disabled={!prompt.trim()}
                    className="flex-[2] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                  >
                    Gerar 3 Versões {config.quality}
                  </button>
                  <button
                    type="button"
                    onClick={handleImportClick}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 border border-slate-700"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
                    </svg>
                    Importar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {status === AppState.SELECTING && (
          <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Escolha a melhor ({config.aspectRatio}):</h2>
              <button onClick={reset} className="text-slate-400 hover:text-white underline underline-offset-4">Recomeçar</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {images.map((img) => (
                <div
                  key={img.id}
                  onClick={() => handleSelect(img)}
                  className={`group relative cursor-pointer overflow-hidden rounded-2xl glass-panel hover:ring-4 hover:ring-indigo-500 transition-all duration-300`}
                  style={{ aspectRatio: config.aspectRatio.replace(':', '/') }}
                >
                  <img src={img.url} alt="IA Result" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">Selecionar</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {status === AppState.VIEWING && selectedImage && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in slide-in-from-bottom-8 duration-500">
            <div className="space-y-4">
              <div className="relative group overflow-hidden rounded-3xl shadow-2xl border border-slate-800 bg-slate-900" style={{ aspectRatio: config.aspectRatio.replace(':', '/') }}>
                <img 
                  src={selectedImage.url} 
                  alt="Final" 
                  className="w-full h-full object-contain cursor-zoom-in" 
                  onClick={() => setIsFullScreen(true)}
                  style={{ filter: getFilterStyle(selectedFilter, brightness, contrast, hue, saturation) }}
                />
                
                {/* Botão de Tela Cheia */}
                <button
                  onClick={() => setIsFullScreen(true)}
                  className="absolute bottom-4 right-4 bg-slate-900/60 hover:bg-indigo-600 text-white p-2.5 rounded-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all shadow-xl active:scale-90"
                  title="Expandir Visualização"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                </button>

                {hasNavigation && (
                  <>
                    <button
                      onClick={() => navigateImages('prev')}
                      className="absolute left-4 top-1/2 -translate-y-1/2 bg-slate-900/60 hover:bg-indigo-600 text-white p-3 rounded-full backdrop-blur-sm transition-all shadow-xl active:scale-90 group/nav"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 group-hover/nav:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => navigateImages('next')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 bg-slate-900/60 hover:bg-indigo-600 text-white p-3 rounded-full backdrop-blur-sm transition-all shadow-xl active:scale-90 group/nav"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 group-hover/nav:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </>
                )}

                <button 
                  onClick={handleDownload}
                  className="absolute top-4 right-4 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl transition-all shadow-lg active:scale-90 flex items-center gap-2 text-sm font-bold"
                >
                  Baixar .{config.extension.toUpperCase()}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
                
                {hasNavigation && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/40 backdrop-blur-sm">
                    {images.map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-2 h-2 rounded-full transition-all ${i === currentIndex ? 'bg-indigo-500 w-4' : 'bg-slate-400/50'}`} 
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-between text-xs text-slate-500 px-2 uppercase font-bold tracking-widest">
                <span>Formato Atual: {config.aspectRatio}</span>
                <span>Origem: {selectedImage.id.startsWith('imported') ? 'Importada' : `Gerada (${currentIndex + 1}/3)`}</span>
              </div>
            </div>

            <div className="flex flex-col justify-center space-y-6">
              <div className="glass-panel p-8 rounded-3xl">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  Estilo e Edição
                </h2>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Filtro Visual</label>
                    <select 
                      value={selectedFilter}
                      onChange={(e) => setSelectedFilter(e.target.value as FilterType)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="None">Original (Sem filtro)</option>
                      <option value="Grayscale">Grayscale (Preto e Branco)</option>
                      <option value="Sepia">Sepia (Envelhecido)</option>
                      <option value="Invert">Invert (Inverter Cores)</option>
                      <option value="Vintage">Vintage (Retrô)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Brilho</label>
                        <span className="text-xs text-indigo-400 font-mono">{brightness}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="200" 
                        value={brightness} 
                        onChange={(e) => setBrightness(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Contraste</label>
                        <span className="text-xs text-indigo-400 font-mono">{contrast}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="200" 
                        value={contrast} 
                        onChange={(e) => setContrast(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Matiz (Hue)</label>
                        <span className="text-xs text-indigo-400 font-mono">{hue}°</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="360" 
                        value={hue} 
                        onChange={(e) => setHue(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Saturação</label>
                        <span className="text-xs text-indigo-400 font-mono">{saturation}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="200" 
                        value={saturation} 
                        onChange={(e) => setSaturation(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-800 pt-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-3">Redimensionar com IA</label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(["1:1", "4:3", "3:4", "16:9", "9:16"] as AspectRatio[]).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setTargetResizeRatio(r)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${targetResizeRatio === r ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={handleResizeWithAI}
                      disabled={!targetResizeRatio || targetResizeRatio === config.aspectRatio}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 border border-slate-700 text-indigo-400 font-bold text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95"
                    >
                      Aplicar Novo Formato com IA
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-6 mt-6">
                  <h3 className="text-lg font-bold mb-2">Transformação Complexa (IA)</h3>
                  <p className="text-slate-400 mb-6 text-sm">
                    Use instruções como "substitua o céu por um pôr do sol" ou "adicione um lago na frente da montanha".
                  </p>
                  <form onSubmit={handleEdit} className="space-y-4">
                    <input
                      type="text"
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      placeholder="Ex: 'Troque o carro por uma moto voadora'..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                    <div className="flex gap-4">
                      <button
                        type="submit"
                        disabled={!editPrompt.trim()}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-all active:scale-95"
                      >
                        Executar Transformação
                      </button>
                      <button
                        type="button"
                        onClick={reset}
                        className="px-6 border border-slate-700 hover:bg-slate-800 text-white font-medium py-3 rounded-xl transition-all"
                      >
                        Novo
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              <div className="p-5 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl">
                <h4 className="text-sm font-bold text-indigo-300 mb-1">Dica de Cor</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Os controles de Matiz e Saturação permitem ajustes finos de vibração e tonalidade. Combine-os com Brilho e Contraste para resultados profissionais.
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-8 p-4 bg-red-900/20 border border-red-500/40 text-red-400 rounded-xl text-center">
            {error}
          </div>
        )}
      </main>

      <footer className="max-w-6xl mx-auto mt-20 py-8 border-t border-slate-800 text-center text-slate-500 text-xs font-medium uppercase tracking-widest">
        ImagineAI Studio &copy; {new Date().getFullYear()} — Powered by Gemini AI
      </footer>
    </div>
  );
};

export default App;
