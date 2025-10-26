import React, { useCallback, useEffect } from 'react';
import type { ImageModel, AspectRatio } from './types';
import { 
    generateImagesFromPrompt, 
    refineImage, 
    generateGroundedPromptStream,
    generateExamplePromptsStream,
    describeImageStream,
    ReferenceImage 
} from './services/geminiService';
import { useAppContext, GenerationMetadata, HistoryItem } from './state/AppContext';
import ImageGeneratorForm from './components/ImageGeneratorForm';
import ResultsViewer from './components/ResultsViewer';
import PromptExtractor from './components/PromptExtractor';
import GenerationHistory from './components/GenerationHistory';

// To inform TypeScript about the global piexif object from the CDN script
declare const piexif: any;

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


// --- Main App Component ---

const App: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { view, mobileView, error, model, selectedImageIndex, activeHistoryId, activeBatchHistoryIds, generationHistory, refinementPrompt, generatedImages } = state;

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
        
        const metadataToEmbed: GenerationMetadata = {
            model: currentModel,
            prompt: finalPromptForApi,
            originalPrompt: originalPromptForMetadata,
            aspectRatio: currentModel === 'imagen-4.0-generate-001' ? currentAspectRatio : undefined,
            promptMode: state.promptMode,
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

  const handleGenerateAllSuggestions = useCallback(async (suggestions: string[]) => {
    if (!suggestions || suggestions.length === 0) return;
    dispatch({ type: 'START_GENERATION' });

    try {
        const generationPromises = suggestions.map(async (suggestionPrompt) => {
            const isImagen = model === 'imagen-4.0-generate-001';
            const metadataToEmbed: GenerationMetadata = {
                model: model,
                prompt: suggestionPrompt,
                aspectRatio: isImagen ? state.aspectRatio : undefined,
                promptMode: 'text',
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

        const refinedBase64 = await refineImage(refinementPrompt, referenceImage);

        const newPromptForMetadata = `${activeHistoryItem.metadata.prompt}\n\n---\n\nRefinement: ${refinementPrompt}`;
        const newMetadata: GenerationMetadata = { ...activeHistoryItem.metadata, prompt: newPromptForMetadata };

        const refinedImageWithMetadata = await embedMetadataInImage(refinedBase64, 'image/png', newMetadata);
        
        const newHistoryItem = { ...activeHistoryItem, images: [refinedImageWithMetadata], metadata: newMetadata };

        dispatch({ type: 'REFINEMENT_SUCCESS', payload: { newImage: refinedImageWithMetadata, newHistoryItem } });
    } catch (e: any) {
        dispatch({ type: 'SET_ERROR', payload: e.message || "An unknown error occurred during refinement." });
        dispatch({ type: 'SET_REFINING', payload: false });
    }
  }, [generatedImages, activeHistoryId, activeBatchHistoryIds, refinementPrompt, selectedImageIndex, generationHistory, dispatch]);

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

        const newMetadata: GenerationMetadata = { model: 'gemini-2.5-flash-image', prompt: description, promptMode: 'text' };
        dispatch({ type: 'DESCRIPTION_SUCCESS', payload: { metadata: newMetadata, message: "AI-generated description created!" } });
    } catch (e: any) {
        dispatch({ type: 'SET_ERROR', payload: e.message || "Failed to generate description." });
    } finally {
        dispatch({ type: 'SET_DESCRIBING', payload: false });
    }
  }, [state.imagePreview, dispatch]);
  
  const hasResults = generatedImages && generatedImages.length > 0;
  const hasHistory = generationHistory.length > 0;

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8">
      <div className="w-full max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl lg:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
            Gemini EXIF Data Embedder
          </h1>
          <p className="text-slate-400 mt-2">Generate AI images and manage embedded metadata prompts.</p>
        </header>

        <div className="border-b border-slate-800 mb-6">
            <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'generate' })} className={`${view === 'generate' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200`}>
                    Generate Image
                </button>
                <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'extract' })} className={`${view === 'extract' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200`}>
                    Extract Metadata
                </button>
            </nav>
        </div>

        {error && <div className="text-red-400 bg-red-900/50 p-3 rounded-lg mb-4">{error}</div>}

        <main className="grid grid-cols-1 lg:grid-cols-5 lg:gap-8">
          {view === 'generate' ? (
            <>
              {/* --- Left Column (GENERATE VIEW) --- */}
              <div className={`lg:col-span-2 lg:sticky lg:top-8 self-start ${mobileView === 'results' ? 'hidden' : 'block'} lg:block`}>
                <div className="bg-slate-900/70 rounded-xl shadow-2xl p-1 backdrop-blur-lg">
                  <div className="bg-slate-900 rounded-lg p-6 sm:p-8">
                    <ImageGeneratorForm 
                      onGenerate={handleGenerate}
                      onGenerateAllSuggestions={handleGenerateAllSuggestions}
                      onRefreshExamples={fetchExamplePrompts}
                    />
                  </div>
                </div>
              </div>
              {/* --- Right Column (GENERATE VIEW) --- */}
              <div className={`lg:col-span-3 mt-8 lg:mt-0 ${mobileView === 'form' ? 'hidden' : 'block'} lg:block`}>
                {hasResults && <ResultsViewer onRefine={handleRefine} />}
                {hasHistory && <GenerationHistory onSelectItem={handleSelectHistoryItem} />}
                {!hasResults && !hasHistory && (
                    <div className="h-full flex items-center justify-center text-center text-slate-500 bg-slate-900/70 rounded-xl p-8 min-h-[400px] lg:min-h-0">
                       <p>Your generated images and history will appear here.</p>
                    </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* --- Left Column (EXTRACT VIEW) --- */}
              <div className="lg:col-span-2 lg:sticky lg:top-8 self-start">
                 <div className="bg-slate-900/70 rounded-xl shadow-2xl p-1 backdrop-blur-lg">
                    <div className="bg-slate-900 rounded-lg p-6 sm:p-8">
                      <PromptExtractor 
                          onFileSelect={handleFileSelect}
                          onUsePrompt={handleUseExtractedPrompt}
                          onDescribeImage={handleDescribeImage}
                      />
                    </div>
                  </div>
              </div>
              {/* --- Right Column (EXTRACT VIEW) --- */}
              <div className="hidden lg:block lg:col-span-3 mt-8 lg:mt-0">
                  <div className="h-full flex items-center justify-center text-center text-slate-500 bg-slate-900/70 rounded-xl p-8">
                     <p>Upload an image on the left to view its preview and extracted metadata here.</p>
                  </div>
              </div>
            </>
          )}
        </main>

        <footer className="w-full mt-12 text-center text-slate-500 text-sm">
             <p>&copy; 2024 AI Image Tools. All features implemented.</p>
        </footer>
      </div>

       {/* --- Mobile View Toggles --- */}
       {view === 'generate' && (
          <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-900/80 backdrop-blur-lg border-t border-slate-800 p-2 flex gap-2 z-50">
              <button 
                onClick={() => dispatch({ type: 'SET_MOBILE_VIEW', payload: 'form' })}
                className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors ${mobileView === 'form' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                  Generate
              </button>
              <button 
                onClick={() => dispatch({ type: 'SET_MOBILE_VIEW', payload: 'results' })}
                disabled={!generatedImages || generatedImages.length === 0}
                className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors relative ${mobileView === 'results' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'} disabled:bg-slate-800 disabled:text-slate-600`}
              >
                  Results
                  {generatedImages && generatedImages.length > 0 && (
                     <span className="absolute -top-1 -right-1 bg-sky-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center ring-2 ring-slate-900">
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