import React, { useCallback, useEffect, useState, useRef } from 'react';
import type { CreativeStrength, ImageModel, AspectRatio } from './types';
import { 
    generateImagesFromPrompt, 
    refineImage, 
    generateGroundedPromptStream,
    generateExamplePromptsStream,
    describeImageStream,
    summarizePromptForFilename,
    generateVideo,
    ReferenceImage 
} from './services/geminiService';
import { useAppContext, GenerationMetadata, HistoryItem } from './state/AppContext';
import ImageGeneratorForm from './components/ImageGeneratorForm';
import VideoGeneratorForm from './components/VideoGeneratorForm';
import ResultsViewer from './components/ResultsViewer';
import PromptExtractor from './components/PromptExtractor';
import GenerationHistory from './components/GenerationHistory';
import MetadataViewer from './components/MetadataViewer';
import Settings from './components/Settings';
import ApiKeyDialog from './components/ApiKeyDialog';
import LoaderIcon from './components/ui/LoaderIcon';

// To inform TypeScript about the global piexif object from the CDN script
declare const piexif: any;

// To inform TypeScript about the aistudio global
// FIX: To resolve the type conflict, the AIStudio interface and the augmentation of the Window interface are both placed within the `declare global` block. This ensures that AIStudio is correctly treated as a global type.
declare global {
    interface AIStudio {
        hasSelectedApiKey: () => Promise<boolean>;
        openSelectKey: () => Promise<void>;
    }
    interface Window {
        aistudio?: AIStudio;
    }
}

// Using ImageDescription (270) which is more reliable for string data than UserComment (37510).
const EXIF_PROMPT_TAG = 270; // Corresponds to piexif.ImageIFD.ImageDescription

// --- Helper Functions ---

const embedMetadataInImage = (base64Image: string, mimeType: string, metadata: GenerationMetadata): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Could not get canvas context'));
      ctx.drawImage(img, 0, 0);

      const jpegDataUrl = canvas.toDataURL('image/jpeg');

      try {
        const zeroth: any = {};
        zeroth[EXIF_PROMPT_TAG] = JSON.stringify(metadata);
        const exifObj = { "0th": zeroth, "Exif": {}, "GPS": {} };
        const exifBytes = piexif.dump(exifObj);
        
        const newJpegDataUrl = piexif.insert(exifBytes, jpegDataUrl);
        resolve(newJpegDataUrl);
      } catch (e) {
        console.error("Error embedding EXIF data:", e);
        resolve(jpegDataUrl);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for metadata embedding.'));
    img.src = `data:${mimeType};base64,${base64Image}`;
  });
};

const extractMetadataFromImage = (imageDataUrl: string): GenerationMetadata | string | null => {
  try {
    const exifObj = piexif.load(imageDataUrl);
    const metadataString = exifObj['0th']?.[EXIF_PROMPT_TAG];
    if (metadataString && typeof metadataString === 'string') {
        try {
            const metadata: GenerationMetadata = JSON.parse(metadataString);
            if (metadata.model && metadata.prompt) {
                return metadata;
            }
        } catch (e) {
            return metadataString;
        }
    }
    return null;
  } catch (e) {
    console.warn("Could not read EXIF data:", e);
    return null;
  }
};

const downloadImage = async (dataUrl: string, filename: string) => {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  } catch (error) {
    console.warn("Blob download failed, falling back to data URL.", error);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.target = '_blank'; // Important for iOS fallback
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

// --- Masking Editor Component ---
interface MaskingEditorProps {
  imageSrc: string;
  onRefineWithMask: (prompt: string, mask: ReferenceImage) => Promise<void>;
  isRefining: boolean;
}

const MaskingEditor: React.FC<MaskingEditorProps> = ({ imageSrc, onRefineWithMask, isRefining }) => {
  const { dispatch } = useAppContext();
  const [prompt, setPrompt] = useState('');
  const [brushSize, setBrushSize] = useState(40);
  
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState<{ x: number; y: number } | null>(null);

  // New state for zoom and pan
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });


  const resizeCanvases = useCallback(() => {
    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
        const container = containerRef.current;
        const imageCanvas = imageCanvasRef.current;
        const drawingCanvas = drawingCanvasRef.current;

        if (!container || !imageCanvas || !drawingCanvas) return;
        
        // Set canvas dimensions to the image's actual dimensions
        imageCanvas.width = image.width;
        imageCanvas.height = image.height;
        drawingCanvas.width = image.width;
        drawingCanvas.height = image.height;
        
        const ctx = imageCanvas.getContext('2d');
        ctx?.drawImage(image, 0, 0);

        // Calculate initial zoom and offset to fit and center the image
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const initialZoom = Math.min(1, containerWidth / image.width, containerHeight / image.height);
        
        setZoom(initialZoom);

        const centeredX = (containerWidth - image.width * initialZoom) / 2;
        const centeredY = (containerHeight - image.height * initialZoom) / 2;
        setOffset({ x: centeredX, y: centeredY });
    };
  }, [imageSrc]);

  useEffect(() => {
    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);
    return () => window.removeEventListener('resize', resizeCanvases);
  }, [resizeCanvases]);

  const getTransformedPoint = (clientX: number, clientY: number): { x: number, y: number } => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offset.x) / zoom,
      y: (clientY - rect.top - offset.y) / zoom,
    };
  };
  
  const draw = useCallback((currentPos: { x: number, y: number }) => {
    const ctx = drawingCanvasRef.current?.getContext('2d');
    if (!ctx || !lastPos) return;

    ctx.beginPath();
    ctx.moveTo(lastPos.x, lastPos.y);
    ctx.lineTo(currentPos.x, currentPos.y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = brushSize / zoom; // Scale brush size
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    setLastPos(currentPos);
  }, [lastPos, brushSize, zoom]);

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    // Pan with middle mouse button, or right-click, or Alt + left-click
    if ((e as React.MouseEvent).button === 1 || (e as React.MouseEvent).button === 2 || (e as React.MouseEvent).altKey) {
      e.preventDefault();
      setIsPanning(true);
      const { clientX, clientY } = 'touches' in e ? e.touches[0] : e;
      panStartRef.current = { x: clientX - offset.x, y: clientY - offset.y };
      return;
    }
    
    // Start drawing with left-click
    if ((e as React.MouseEvent).button === 0 || 'touches' in e) {
        e.preventDefault();
        setIsDrawing(true);
        const { clientX, clientY } = 'touches' in e ? e.touches[0] : e;
        setLastPos(getTransformedPoint(clientX, clientY));
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const { clientX, clientY } = 'touches' in e ? e.touches[0] : e;

    if (isPanning) {
      e.preventDefault();
      setOffset({
        x: clientX - panStartRef.current.x,
        y: clientY - panStartRef.current.y,
      });
      return;
    }

    if (isDrawing) {
      e.preventDefault();
      const currentPos = getTransformedPoint(clientX, clientY);
      draw(currentPos);
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    setIsPanning(false);
    setLastPos(null);
  };
  
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scaleAmount = -e.deltaY * 0.001;
    const newZoom = Math.max(0.1, Math.min(zoom * (1 + scaleAmount), 5));
    
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const imageX = (mouseX - offset.x) / zoom;
    const imageY = (mouseY - offset.y) / zoom;
    
    const newOffsetX = mouseX - imageX * newZoom;
    const newOffsetY = mouseY - imageY * newZoom;

    setZoom(newZoom);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };
  
  const handleClearMask = () => {
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    
    const drawingCanvas = drawingCanvasRef.current;
    if (!drawingCanvas) return;

    // Create the final mask image (white on black) as required by the API.
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = drawingCanvas.width;
    maskCanvas.height = drawingCanvas.height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;

    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    maskCtx.drawImage(drawingCanvas, 0, 0);

    const maskDataUrl = maskCanvas.toDataURL('image/png');
    const [, data] = maskDataUrl.split(',');
    const mask: ReferenceImage = { mimeType: 'image/png', data };
    
    await onRefineWithMask(prompt, mask);
  };

  const zoomControls = (
      <div className="absolute bottom-4 left-4 bg-black/50 text-white rounded-lg p-1 flex items-center space-x-1 text-xs backdrop-blur-sm">
          <button onClick={() => setZoom(z => Math.max(z / 1.2, 0.1))} className="p-2 rounded hover:bg-white/20" aria-label="Zoom out">-</button>
          <span className="w-12 text-center font-semibold">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(z * 1.2, 5))} className="p-2 rounded hover:bg-white/20" aria-label="Zoom in">+</button>
          <button onClick={resizeCanvases} className="p-2 rounded hover:bg-white/20" aria-label="Reset view">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 0h-4m4 0l-5-5" /></svg>
          </button>
      </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4 backdrop-blur-sm" aria-modal="true" role="dialog">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col transform transition-all animate-fade-in p-6 sm:p-8">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-2xl font-semibold text-indigo-500 dark:text-indigo-400">Refine with Mask</h2>
          <button onClick={() => dispatch({ type: 'CLOSE_MASKING_MODAL' })} className="p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <div className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
          <div 
            ref={containerRef} 
            className={`lg:col-span-2 relative flex items-center justify-center bg-slate-100 dark:bg-slate-800/50 rounded-lg overflow-hidden touch-none ${isDrawing ? 'cursor-crosshair' : ''} ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
            onWheel={handleWheel}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
            onContextMenu={(e) => e.preventDefault()}
          >
            <canvas ref={imageCanvasRef} className="absolute top-0 left-0" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: '0 0' }} />
            <canvas ref={drawingCanvasRef} className="absolute top-0 left-0" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: '0 0' }}/>
            {zoomControls}
          </div>
          
          <div className="flex flex-col space-y-4">
            <div>
              <label htmlFor="mask-prompt" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Describe your edit
              </label>
              <textarea
                id="mask-prompt"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g., Add a futuristic helmet to the person"
                className="w-full h-32 p-3 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500"
                disabled={isRefining}
              />
            </div>

            <div>
              <label htmlFor="brush-size" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Brush Size: {brushSize}px
              </label>
              <input
                id="brush-size"
                type="range"
                min="5"
                max="100"
                step="1"
                value={brushSize}
                onChange={e => setBrushSize(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                disabled={isRefining}
              />
            </div>
            
            <div className="flex-grow"></div>

            <div className="space-y-2">
              <button
                onClick={handleClearMask}
                disabled={isRefining}
                className="w-full flex justify-center items-center gap-2 bg-slate-500 hover:bg-slate-600 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Clear Mask
              </button>
              <button
                onClick={handleSubmit}
                disabled={isRefining || !prompt.trim()}
                className="w-full flex justify-center items-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                {isRefining ? <><LoaderIcon /> Refining...</> : 'Apply Refinement'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


// --- Main App Component ---

const App: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { view, mobileView, error, model, selectedImageIndex, activeHistoryId, activeBatchHistoryIds, generationHistory, refinementPrompt, generatedImages, generatedVideoUrl, isNightMode, refinementCreativeStrength, refinementStyle, isRefining } = state;
  const [hasApiKey, setHasApiKey] = useState(false);

  const checkApiKey = useCallback(async () => {
      if (window.aistudio) {
        const keyStatus = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(keyStatus);
        return keyStatus;
      }
      return false; // aistudio not available
  }, []);

  useEffect(() => {
    checkApiKey();
  }, [checkApiKey]);

  const fetchExamplePrompts = useCallback(async () => {
      dispatch({ type: 'SET_FETCHING_EXAMPLES', payload: true });
      try {
          const prompts = await generateExamplePromptsStream();
          dispatch({ type: 'SET_EXAMPLE_PROMPTS', payload: { prompts } });
      } catch (e: any) {
          console.error("Failed to fetch example prompts:", e.message);
          const fallbackPrompts = [
              "A photorealistic image of an astronaut riding a majestic Friesian horse on Mars, red dust swirling...",
              "Whimsical watercolor painting of a sprawling city built from giant, ancient books...",
              "Epic fantasy landscape painting of a colossal, moss-covered dragon sleeping...",
              "Vibrant, bustling futuristic street in a cyberpunk Tokyo at night..."
          ];
          dispatch({ type: 'SET_EXAMPLE_PROMPTS', payload: { prompts: fallbackPrompts, error: "Could not fetch new example prompts. Displaying defaults." } });
      }
  }, [dispatch]);
  
  useEffect(() => {
    if (isNightMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isNightMode]);

  useEffect(() => {
      fetchExamplePrompts();
  }, [fetchExamplePrompts]);

  useEffect(() => {
    if (model === 'imagen-4.0-generate-001') {
      dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'referenceImages', value: [] } });
    }
  }, [model, dispatch]);

  const handleGenerate = useCallback(async (currentPrompt: string, currentModel: ImageModel, currentAspectRatio: AspectRatio, numImages: number) => {
    dispatch({ type: 'START_GENERATION' });

    try {
        let finalPromptForApi: string = currentPrompt;
        let originalPromptForMetadata: string | undefined = undefined;

        if (state.useWebSearch) {
            dispatch({ type: 'SET_ERROR', payload: "Grounding prompt with web search..." });
            let groundedPrompt = '';
            const stream = generateGroundedPromptStream(currentPrompt);
            for await (const chunk of stream) {
                groundedPrompt += chunk;
            }
            finalPromptForApi = groundedPrompt;
            originalPromptForMetadata = currentPrompt;
            dispatch({ type: 'SET_ERROR', payload: null });
        }
        
        const filenameSlug = await summarizePromptForFilename(finalPromptForApi);

        const metadataToEmbed: GenerationMetadata = {
            model: currentModel,
            prompt: finalPromptForApi,
            originalPrompt: originalPromptForMetadata,
            aspectRatio: currentModel === 'imagen-4.0-generate-001' ? currentAspectRatio : undefined,
            promptMode: state.promptMode,
            filenameSlug: filenameSlug,
        };
        
        const imagePartsForApi: ReferenceImage[] = state.referenceImages.map(dataUrl => {
            const [meta, data] = dataUrl.split(',');
            const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
            return { mimeType, data };
        });

        const base64Images = await generateImagesFromPrompt(finalPromptForApi, currentModel, {
            aspectRatio: currentAspectRatio,
            referenceImages: imagePartsForApi,
            numberOfImages: numImages,
        });

        const imagesWithMetadata = await Promise.all(
            base64Images.map(base64Image => embedMetadataInImage(base64Image, 'image/png', metadataToEmbed))
        );
        
        const newHistoryItem: HistoryItem = {
            id: `hist-${Date.now()}`,
            images: imagesWithMetadata,
            timestamp: Date.now(),
            metadata: metadataToEmbed
        };
        
        dispatch({ type: 'GENERATION_SUCCESS', payload: { images: imagesWithMetadata, historyItem: newHistoryItem }});

    } catch (e: any) {
        dispatch({ type: 'SET_ERROR', payload: e.message || "An unknown error occurred." });
        dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.useWebSearch, state.referenceImages, dispatch, state.promptMode]);
  
  const handleGenerateVideo = useCallback(async (prompt: string, resolution: '720p' | '1080p', aspectRatio: '16:9' | '9:16') => {
    dispatch({ type: 'START_GENERATION' });
    
    try {
        const videoStream = generateVideo(prompt, resolution, aspectRatio);
        for await (const result of videoStream) {
            if (result.videoUrl) {
                dispatch({ type: 'VIDEO_GENERATION_SUCCESS', payload: result.videoUrl });
            } else {
                dispatch({ type: 'SET_LOADING_MESSAGE', payload: result.status });
            }
        }
    } catch (e: any) {
        if (e.message.includes("re-select your key")) {
            setHasApiKey(false);
        }
        dispatch({ type: 'SET_ERROR', payload: e.message || "An unknown video error occurred." });
        dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [dispatch]);


  const handleGenerateAllSuggestions = useCallback(async (suggestions: string[]) => {
    if (!suggestions || suggestions.length === 0) return;
    dispatch({ type: 'START_GENERATION' });

    try {
        const generationPromises = suggestions.map(async (suggestionPrompt) => {
            const isImagen = model === 'imagen-4.0-generate-001';
            const filenameSlug = await summarizePromptForFilename(suggestionPrompt);

            const metadataToEmbed: GenerationMetadata = {
                model: model,
                prompt: suggestionPrompt,
                aspectRatio: isImagen ? state.aspectRatio : undefined,
                promptMode: 'text',
                filenameSlug: filenameSlug,
            };

            const base64Images = await generateImagesFromPrompt(suggestionPrompt, model, {
                aspectRatio: state.aspectRatio,
                numberOfImages: 1,
            });

            if (!base64Images || base64Images.length === 0) return null;

            const imageWithMetadata = await embedMetadataInImage(base64Images[0], 'image/png', metadataToEmbed);
            
            return {
                id: `hist-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                images: [imageWithMetadata],
                timestamp: Date.now(),
                metadata: metadataToEmbed,
            };
        });

        const results = await Promise.all(generationPromises);
        const newHistoryItems = results.filter((item): item is HistoryItem => item !== null);

        if (newHistoryItems.length > 0) {
            const allGeneratedImages = newHistoryItems.flatMap(item => item.images);
            dispatch({ type: 'BATCH_GENERATION_SUCCESS', payload: { images: allGeneratedImages, historyItems: newHistoryItems }});
        } else {
            throw new Error("All image generations in the batch failed.");
        }

    } catch (e: any) {
        dispatch({ type: 'SET_ERROR', payload: e.message || "An unknown error occurred during batch generation." });
        dispatch({ type: 'SET_LOADING', payload: false });
    }
}, [model, state.aspectRatio, dispatch]);
  
  const handleRefine = useCallback(async () => {
    if (!generatedImages || refinementPrompt.trim() === '') return;

    const historyIdToUse = activeBatchHistoryIds ? activeBatchHistoryIds[selectedImageIndex] : activeHistoryId;
    const activeHistoryItem = generationHistory.find(h => h.id === historyIdToUse);

    if (!activeHistoryItem) {
        dispatch({ type: 'SET_ERROR', payload: "Could not find the active history item to refine." });
        return;
    }
    
    dispatch({ type: 'SET_REFINING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
        const sourceImageDataUrl = generatedImages[selectedImageIndex];
        const [meta, data] = sourceImageDataUrl.split(',');
        const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
        const referenceImage: ReferenceImage = { mimeType, data };

        const refinedBase64 = await refineImage(refinementPrompt, referenceImage, {
            creativeStrength: refinementCreativeStrength,
            style: refinementStyle,
        });

        const isFromImagen = activeHistoryItem.metadata.model === 'imagen-4.0-generate-001';
        
        const refinementNote = isFromImagen
          ? `\n\n---\n\nRefined (from Imagen) with Nano Banana: ${refinementPrompt}`
          : `\n\n---\n\nRefinement: ${refinementPrompt}`;
        
        const newPromptForMetadata = activeHistoryItem.metadata.prompt + refinementNote;
        const filenameSlug = await summarizePromptForFilename(newPromptForMetadata);
        
        const newMetadata: GenerationMetadata = {
          ...activeHistoryItem.metadata,
          prompt: newPromptForMetadata,
          filenameSlug,
          model: 'gemini-2.5-flash-image', // The refined image is always a product of Nano Banana.
        };

        const refinedImageWithMetadata = await embedMetadataInImage(refinedBase64, 'image/png', newMetadata);
        
        const updatedHistoryImages = activeBatchHistoryIds
            ? [refinedImageWithMetadata]
            : activeHistoryItem.images.map((img, index) =>
                index === selectedImageIndex ? refinedImageWithMetadata : img
              );

        const newHistoryItem = { ...activeHistoryItem, images: updatedHistoryImages, metadata: newMetadata };

        dispatch({ type: 'REFINEMENT_SUCCESS', payload: { newImage: refinedImageWithMetadata, newHistoryItem } });
    } catch (e: any) {
        dispatch({ type: 'SET_ERROR', payload: e.message || "An unknown error occurred during refinement." });
        dispatch({ type: 'SET_REFINING', payload: false });
    }
  }, [generatedImages, activeHistoryId, activeBatchHistoryIds, refinementPrompt, selectedImageIndex, generationHistory, dispatch, refinementCreativeStrength, refinementStyle]);

  const handleRefineWithMask = useCallback(async (promptFromModal: string, mask: ReferenceImage) => {
    if (!generatedImages) return;

    const historyIdToUse = activeBatchHistoryIds ? activeBatchHistoryIds[selectedImageIndex] : activeHistoryId;
    const activeHistoryItem = generationHistory.find(h => h.id === historyIdToUse);

    if (!activeHistoryItem) {
        dispatch({ type: 'SET_ERROR', payload: "Could not find the active history item to refine." });
        return;
    }
    
    dispatch({ type: 'SET_REFINING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
        const sourceImageDataUrl = generatedImages[selectedImageIndex];
        const [meta, data] = sourceImageDataUrl.split(',');
        const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
        const referenceImage: ReferenceImage = { mimeType, data };

        const refinedBase64 = await refineImage(
            promptFromModal, 
            referenceImage, 
            {}, // Creative strength/style options are not used for masked refinement
            mask
        );
        
        const isFromImagen = activeHistoryItem.metadata.model === 'imagen-4.0-generate-001';
        
        const refinementNote = isFromImagen
          ? `\n\n---\n\nRefined (from Imagen, Masked) with Nano Banana: ${promptFromModal}`
          : `\n\n---\n\nRefinement (Masked): ${promptFromModal}`;
        
        const newPromptForMetadata = activeHistoryItem.metadata.prompt + refinementNote;
        const filenameSlug = await summarizePromptForFilename(newPromptForMetadata);
        
        const newMetadata: GenerationMetadata = {
          ...activeHistoryItem.metadata,
          prompt: newPromptForMetadata,
          filenameSlug,
          model: 'gemini-2.5-flash-image', // The refined image is always a product of Nano Banana.
        };

        const refinedImageWithMetadata = await embedMetadataInImage(refinedBase64, 'image/png', newMetadata);
        
        const updatedHistoryImages = activeBatchHistoryIds
            ? [refinedImageWithMetadata]
            : activeHistoryItem.images.map((img, index) =>
                index === selectedImageIndex ? refinedImageWithMetadata : img
              );

        const newHistoryItem = { ...activeHistoryItem, images: updatedHistoryImages, metadata: newMetadata };

        dispatch({ type: 'REFINEMENT_SUCCESS', payload: { newImage: refinedImageWithMetadata, newHistoryItem } });
    } catch (e: any) {
        dispatch({ type: 'SET_ERROR', payload: e.message || "An unknown error occurred during masked refinement." });
        dispatch({ type: 'SET_REFINING', payload: false });
    }
  }, [generatedImages, activeHistoryId, activeBatchHistoryIds, selectedImageIndex, generationHistory, dispatch]);

  const handleSelectHistoryItem = useCallback((item: HistoryItem) => {
    dispatch({ type: 'SET_HISTORY_ITEM', payload: item });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [dispatch]);

  const handleUseExtractedPrompt = useCallback(() => {
    if (state.extractedMetadata && state.isPromptValid) {
      const { model, prompt, aspectRatio } = state.extractedMetadata;
      dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'model', value: model }});
      dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'aspectRatio', value: aspectRatio || '1:1' }});
      dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'prompt', value: prompt }});
      
      const isNanoBanana = model === 'gemini-2.5-flash-image';
      const isLikelyJson = (str: string) => {
          const trimmed = str.trim();
          return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
      };
      const newPromptMode = isNanoBanana && isLikelyJson(prompt) ? 'json' : 'text';
      dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'promptMode', value: newPromptMode }});
      
      dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'referenceImages', value: [] }});
      dispatch({ type: 'SET_VIEW', payload: 'generate' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [state.extractedMetadata, state.isPromptValid, dispatch]);

  const handleFileSelect = useCallback((file: File) => {
    dispatch({ type: 'START_EXTRACTION' });
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) { dispatch({ type: 'SET_ERROR', payload: "Could not read file data." }); return; }

        const foundMetadata = extractMetadataFromImage(dataUrl);
        let metadata: GenerationMetadata | null = null;
        let message = "Could not find embedded metadata in this image's EXIF data.";
        let isValid = false;

        if (typeof foundMetadata === 'object' && foundMetadata !== null) {
            metadata = foundMetadata;
            isValid = true;
            message = "Successfully extracted generation metadata.";
        } else if (typeof foundMetadata === 'string') {
            try {
                JSON.parse(foundMetadata);
                metadata = { model: 'gemini-2.5-flash-image', prompt: foundMetadata };
                isValid = true;
                message = "Found a legacy prompt and assumed it's for the Nano Banana model.";
            } catch {
                metadata = { model: 'gemini-2.5-flash-image', prompt: foundMetadata };
                isValid = false;
                message = "An embedded prompt was found, but it is not valid JSON.";
            }
        }
        dispatch({ type: 'EXTRACTION_RESULT', payload: { dataUrl, metadata, message, isValid } });
    };
    reader.onerror = () => { dispatch({ type: 'SET_ERROR', payload: "Error reading file." }); }
    reader.readAsDataURL(file);
  }, [dispatch]);
  
  const handleDescribeImage = useCallback(async () => {
    if (!state.imagePreview) return;
    dispatch({ type: 'SET_DESCRIBING', payload: true });
    
    try {
        const [meta, data] = state.imagePreview.split(',');
        const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
        const referenceImage: ReferenceImage = { mimeType, data };
        
        let description = '';
        const stream = describeImageStream(referenceImage);
        for await (const chunk of stream) {
            description += chunk;
        }
        
        const filenameSlug = await summarizePromptForFilename(description);
        const newMetadata: GenerationMetadata = { model: 'gemini-2.5-flash-image', prompt: description, promptMode: 'text', filenameSlug };
        dispatch({ type: 'DESCRIPTION_SUCCESS', payload: { metadata: newMetadata, message: "AI-generated description created!" } });
    } catch (e: any) {
        dispatch({ type: 'SET_ERROR', payload: e.message || "Failed to generate description." });
    } finally {
        dispatch({ type: 'SET_DESCRIBING', payload: false });
    }
  }, [state.imagePreview, dispatch]);
  
  const handleDownloadDescribedImage = useCallback(async () => {
    if (!state.imagePreview || !state.extractedMetadata) return;

    dispatch({ type: 'SET_EMBEDDING', payload: true });
    
    try {
        const [meta, data] = state.imagePreview.split(',');
        const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';

        const imageWithMetadata = await embedMetadataInImage(data, mimeType, state.extractedMetadata);
        
        await downloadImage(
          imageWithMetadata,
          `${state.extractedMetadata.filenameSlug || 'described-image'}.jpg`
        );
        
    } catch (e: any) {
        dispatch({ type: 'SET_ERROR', payload: e.message || "Failed to embed metadata." });
    } finally {
        dispatch({ type: 'SET_EMBEDDING', payload: false });
    }
  }, [state.imagePreview, state.extractedMetadata, dispatch]);
  
  const handleDownloadSingleImage = useCallback(async (index: number) => {
    if (!state.generatedImages) return;

    const historyId = state.activeBatchHistoryIds ? state.activeBatchHistoryIds[index] : state.activeHistoryId;
    const activeItem = state.generationHistory.find(h => h.id === historyId);
    const filename = activeItem?.metadata.filenameSlug || `generated-image-${activeItem?.id || index}`;
    const imageUrl = state.generatedImages[index];
    
    await downloadImage(imageUrl, `${filename}.jpg`);
  }, [state.generatedImages, state.activeBatchHistoryIds, state.activeHistoryId, state.generationHistory]);

  const handleApiKeySelected = () => {
      setHasApiKey(true);
      if(view === 'video') {
          dispatch({ type: 'SET_ERROR', payload: null });
      }
  }
  
  const hasResults = (generatedImages && generatedImages.length > 0) || generatedVideoUrl;
  const hasHistory = generationHistory.length > 0;

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8">
      {state.isMaskingModalOpen && generatedImages && (
        <MaskingEditor
            imageSrc={generatedImages[selectedImageIndex]}
            onRefineWithMask={handleRefineWithMask}
            isRefining={isRefining}
        />
      )}
      <ApiKeyDialog
        isOpen={view === 'video' && !hasApiKey}
        onKeySelected={handleApiKeySelected}
      />
      <div className="w-full max-w-7xl mx-auto">
        <header className="text-center mb-8 relative">
           <div className="absolute top-0 right-0">
             <Settings onCheckKey={checkApiKey} />
           </div>
          <h1 className="text-4xl lg:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
            Gemini Multimodal Studio
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">Generate AI images and videos, and manage embedded metadata prompts.</p>
        </header>

        <div className="border-b border-slate-200 dark:border-slate-800 mb-6">
            <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'generate' })} className={`${view === 'generate' ? 'border-indigo-500 text-indigo-500 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200`}>
                    Generate Image
                </button>
                 <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'video' })} className={`${view === 'video' ? 'border-indigo-500 text-indigo-500 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200`}>
                    Generate Video
                </button>
                <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'extract' })} className={`${view === 'extract' ? 'border-indigo-500 text-indigo-500 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200`}>
                    Extract Metadata
                </button>
            </nav>
        </div>

        {error && <div className="text-red-800 dark:text-red-400 bg-red-100 dark:bg-red-900/50 p-3 rounded-lg mb-4">{error}</div>}

        <main className="grid grid-cols-1 lg:grid-cols-5 lg:gap-8">
          {view === 'generate' && (
              <>
                <div className={`lg:col-span-2 lg:sticky lg:top-8 self-start ${mobileView === 'results' ? 'hidden' : 'block'} lg:block`}>
                  <div className="bg-slate-100/70 dark:bg-slate-900/70 rounded-xl shadow-2xl p-1 backdrop-blur-lg">
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-6 sm:p-8">
                      <ImageGeneratorForm 
                        onGenerate={handleGenerate}
                        onGenerateAllSuggestions={handleGenerateAllSuggestions}
                        onRefreshExamples={fetchExamplePrompts}
                      />
                    </div>
                  </div>
                </div>
                <div className={`lg:col-span-3 mt-8 lg:mt-0 ${mobileView === 'form' ? 'hidden' : 'block'} lg:block`}>
                  {hasResults && <ResultsViewer onRefine={handleRefine} onDownloadImage={handleDownloadSingleImage} />}
                  {hasHistory && <GenerationHistory onSelectItem={handleSelectHistoryItem} />}
                  {!hasResults && !hasHistory && (
                      <div className="h-full flex items-center justify-center text-center text-slate-500 bg-white/70 dark:bg-slate-900/70 rounded-xl p-8 min-h-[400px] lg:min-h-0">
                         <p>Your generated content and history will appear here.</p>
                      </div>
                  )}
                </div>
              </>
          )}

          {view === 'video' && (
              <>
                <div className={`lg:col-span-2 lg:sticky lg:top-8 self-start ${mobileView === 'results' ? 'hidden' : 'block'} lg:block`}>
                  <div className="bg-slate-100/70 dark:bg-slate-900/70 rounded-xl shadow-2xl p-1 backdrop-blur-lg">
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-6 sm:p-8">
                      <VideoGeneratorForm onGenerate={handleGenerateVideo} />
                    </div>
                  </div>
                </div>
                <div className={`lg:col-span-3 mt-8 lg:mt-0 ${mobileView === 'form' ? 'hidden' : 'block'} lg:block`}>
                  {hasResults && <ResultsViewer onRefine={() => {}} onDownloadImage={() => {}} />}
                  {!hasResults && !hasHistory && (
                      <div className="h-full flex items-center justify-center text-center text-slate-500 bg-white/70 dark:bg-slate-900/70 rounded-xl p-8 min-h-[400px] lg:min-h-0">
                         <p>Your generated content and history will appear here.</p>
                      </div>
                  )}
                </div>
              </>
          )}

          {view === 'extract' && (
            <>
              {/* --- Left Column (EXTRACT VIEW) --- */}
              <div className="lg:col-span-2 lg:sticky lg:top-8 self-start">
                 <div className="bg-slate-100/70 dark:bg-slate-900/70 rounded-xl shadow-2xl p-1 backdrop-blur-lg">
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-6 sm:p-8">
                      <PromptExtractor 
                          onFileSelect={handleFileSelect}
                          onDescribeImage={handleDescribeImage}
                      />
                    </div>
                  </div>
              </div>
              {/* --- Right Column (EXTRACT VIEW) --- */}
              <div className="lg:col-span-3 mt-8 lg:mt-0 self-start">
                  <MetadataViewer onUsePrompt={handleUseExtractedPrompt} onDownloadDescribedImage={handleDownloadDescribedImage} />
              </div>
            </>
          )}
        </main>

        <footer className="w-full mt-12 text-center text-slate-500 text-sm">
             <p>&copy; 2024 AI Image Tools. All features implemented.</p>
        </footer>
      </div>

       {/* --- Mobile View Toggles --- */}
       {(view === 'generate' || view === 'video') && (
          <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 p-2 flex gap-2 z-50">
              <button 
                onClick={() => dispatch({ type: 'SET_MOBILE_VIEW', payload: 'form' })}
                className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors ${mobileView === 'form' ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-300'}`}
              >
                  Generate
              </button>
              <button 
                onClick={() => dispatch({ type: 'SET_MOBILE_VIEW', payload: 'results' })}
                disabled={!generatedImages || generatedImages.length === 0}
                className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors relative ${mobileView === 'results' ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-300'} disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600`}
              >
                  Results
                  {generatedImages && generatedImages.length > 0 && (
                     <span className="absolute -top-1 -right-1 bg-sky-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                        {generatedImages.length}
                     </span>
                  )}
              </button>
          </div>
       )}
    </div>
  );
};

export default App;