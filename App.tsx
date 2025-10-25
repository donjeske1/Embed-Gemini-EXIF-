
import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { View, ImageModel, AspectRatio } from './types';
import { generateImagesFromPrompt, enhancePrompt, describeImage, refineImage, generateGroundedPrompt, ReferenceImage, generateExamplePrompts } from './services/geminiService';

// To inform TypeScript about the global piexif object from the CDN script
declare const piexif: any;

// Using ImageDescription (270) which is more reliable for string data than UserComment (37510).
const EXIF_PROMPT_TAG = 270; // Corresponds to piexif.ImageIFD.ImageDescription
const DEFAULT_PROMPT_TEXT = "A majestic bioluminescent jellyfish floating in a dark, deep ocean, surrounded by sparkling plankton.";

type PromptMode = 'text' | 'json';

interface GenerationMetadata {
  model: ImageModel;
  prompt: string; // The final prompt used for generation
  originalPrompt?: string; // The user's initial prompt if grounding was used
  aspectRatio?: AspectRatio;
}

interface HistoryItem {
  id: string;
  images: string[]; // base64 data URLs
  timestamp: number;
  metadata: GenerationMetadata;
}

// --- Helper Functions ---

const formatJsonDisplay = (jsonString: string | null): string => {
    if (!jsonString) return '';
    try {
        const parsed = JSON.parse(jsonString);
        const pretty = JSON.stringify(parsed, null, 2);
        const trimmed = pretty.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            return trimmed.substring(1, trimmed.length - 1).trim();
        }
        return pretty;
    } catch {
        return jsonString;
    }
};

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
            // New format: JSON object with metadata
            const metadata: GenerationMetadata = JSON.parse(metadataString);
            if (metadata.model && metadata.prompt) {
                return metadata;
            }
        } catch (e) {
            // Legacy format: Just a string prompt (likely JSON array string)
            return metadataString;
        }
    }
    return null;
  } catch (e) {
    console.warn("Could not read EXIF data:", e);
    return null;
  }
};


// --- UI Components ---

const LoaderIcon: React.FC = () => (
  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const aspectRatios: AspectRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4'];

interface ImageGeneratorProps {
  isLoading: boolean;
  generatedImages: string[] | null;
  error: string | null;
  setError: (error: string | null) => void;
  onGenerate: (prompt: string, model: ImageModel, aspectRatio: AspectRatio, numberOfImages: number) => void;
  onGenerateAllSuggestions: (prompts: string[]) => void;
  prompt: string;
  onPromptChange: (newPrompt: string) => void;
  promptMode: PromptMode;
  onPromptModeChange: (mode: PromptMode) => void;
  model: ImageModel;
  onModelChange: (model: ImageModel) => void;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  referenceImages: string[];
  onReferenceImagesChange: (images: string[]) => void;
  numberOfImages: number;
  onNumberOfImagesChange: (num: number) => void;
  selectedImageIndex: number;
  onSelectedImageIndexChange: (index: number) => void;
  isRefining: boolean;
  refinementPrompt: string;
  onRefinementPromptChange: (prompt: string) => void;
  onRefine: () => void;
  useWebSearch: boolean;
  onUseWebSearchChange: (use: boolean) => void;
  examplePrompts: string[];
  isFetchingExamples: boolean;
  onRefreshExamples: () => void;
}

const ImageGenerator: React.FC<ImageGeneratorProps> = ({ 
    isLoading, generatedImages, error, setError, onGenerate, onGenerateAllSuggestions, prompt, onPromptChange,
    promptMode, onPromptModeChange, model, onModelChange,
    aspectRatio, onAspectRatioChange, referenceImages, onReferenceImagesChange,
    numberOfImages, onNumberOfImagesChange, selectedImageIndex, onSelectedImageIndexChange,
    isRefining, refinementPrompt, onRefinementPromptChange, onRefine, useWebSearch, onUseWebSearchChange,
    examplePrompts, isFetchingExamples, onRefreshExamples
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isImagen = model === 'imagen-4.0-generate-001';
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [promptSuggestions, setPromptSuggestions] = useState<string[] | null>(null);
  const [showExamples, setShowExamples] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate(prompt, model, aspectRatio, numberOfImages);
  };
  
  const handleEnhancePrompt = async () => {
    setIsEnhancing(true);
    setError(null);
    setPromptSuggestions(null);
    try {
        const currentPromptForEnhancing = promptMode === 'json' ? formatJsonDisplay(prompt) : prompt;
        const suggestions = await enhancePrompt(currentPromptForEnhancing);
        setPromptSuggestions(suggestions);
    } catch (e: any) {
        setError(e.message || "Failed to get suggestions.");
    } finally {
        setIsEnhancing(false);
    }
  };

  const displayPrompt = promptMode === 'json' ? formatJsonDisplay(prompt) : prompt;

  const handlePromptTextAreaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      if (promptMode === 'json' && !isImagen) {
          onPromptChange(`[${newValue}]`);
      } else {
          onPromptChange(newValue);
      }
  };

  const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImagePromises: Promise<string>[] = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
            newImagePromises.push(new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target?.result as string);
                reader.onerror = (error) => reject(error);
                reader.readAsDataURL(file);
            }));
        }
    }

    Promise.all(newImagePromises).then(imageDataUrls => {
        onReferenceImagesChange([...referenceImages, ...imageDataUrls]);
        // If user adds reference image while in JSON mode, switch to text mode to guide them
        // towards writing an instructional prompt for editing.
        if (!isImagen && promptMode === 'json') {
            onPromptModeChange('text');
            onPromptChange(''); // Clear prompt to encourage a new instruction
        }
    }).catch(console.error);
  };
  
  const handleRemoveImage = (indexToRemove: number) => {
      onReferenceImagesChange(referenceImages.filter((_, index) => index !== indexToRemove));
  };

  const selectedImageUrl = generatedImages ? generatedImages[selectedImageIndex] : null;

  const handleDownloadAll = () => {
    if (!generatedImages) return;
    // Using a consistent timestamp for the batch helps group downloaded files.
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    generatedImages.forEach((imgSrc, index) => {
        const link = document.createElement('a');
        link.href = imgSrc;
        link.download = `generated-image-${timestamp}-${index + 1}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-indigo-400">Generate Image</h2>
        <p className="text-slate-400 mt-1">Select a model, enter a prompt, and generate an image with embedded metadata.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Model Selection */}
        <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Model</label>
            <div className="flex rounded-lg shadow-sm">
                <button type="button" onClick={() => onModelChange('gemini-2.5-flash-image')} className={`px-4 py-2 text-sm font-medium rounded-l-lg w-full transition-colors duration-200 ${!isImagen ? 'bg-indigo-600 text-white z-10 ring-1 ring-indigo-500' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}`}>
                    Nano Banana <span className="text-xs opacity-75">(Fast, Edits)</span>
                </button>
                <button type="button" onClick={() => onModelChange('imagen-4.0-generate-001')} className={`-ml-px px-4 py-2 text-sm font-medium rounded-r-lg w-full transition-colors duration-200 ${isImagen ? 'bg-indigo-600 text-white z-10 ring-1 ring-indigo-500' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}`}>
                    Imagen <span className="text-xs opacity-75">(High Quality)</span>
                </button>
            </div>
        </div>

        {/* Prompt Mode Selection */}
        {!isImagen && (
          <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Prompt Mode</label>
              <div className="flex rounded-lg shadow-sm">
                  <button type="button" onClick={() => onPromptModeChange('text')} className={`px-4 py-2 text-sm font-medium rounded-l-lg w-full transition-colors duration-200 ${promptMode === 'text' ? 'bg-indigo-600 text-white z-10 ring-1 ring-indigo-500' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}`}>
                      Freeform Text
                  </button>
                  <button type="button" onClick={() => onPromptModeChange('json')} className={`-ml-px px-4 py-2 text-sm font-medium rounded-r-lg w-full transition-colors duration-200 ${promptMode === 'json' ? 'bg-indigo-600 text-white z-10 ring-1 ring-indigo-500' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}`}>
                      JSON
                  </button>
              </div>
          </div>
        )}

        <textarea
          value={displayPrompt}
          onChange={handlePromptTextAreaChange}
          placeholder={promptMode === 'text' || isImagen ? 'e.g., A photo of a cat programming on a laptop' : 'e.g., { "text": "A photo of a cat..." }'}
          className="w-full h-48 p-3 bg-slate-800/80 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm transition-colors duration-200"
        />

        {promptMode === 'text' && (
             <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button 
                    type="button" 
                    onClick={handleEnhancePrompt} 
                    disabled={isEnhancing || isLoading || !prompt.trim()}
                    className="w-full flex justify-center items-center gap-2 bg-violet-700 hover:bg-violet-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 text-sm"
                >
                    {isEnhancing ? <><LoaderIcon /> Enhancing...</> : '✨ Enhance Prompt'}
                </button>
                <button 
                    type="button" 
                    onClick={() => setShowExamples(!showExamples)} 
                    className="w-full flex justify-center items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 text-sm"
                >
                    💡 {showExamples ? 'Hide Examples' : 'Show Examples'}
                </button>
            </div>
        )}

        {promptSuggestions && (
            <div className="space-y-3 p-4 bg-slate-800/60 rounded-lg animate-fade-in">
                <div className="flex justify-between items-center">
                    <h4 className="font-semibold text-slate-200">AI Suggestions:</h4>
                    <button type="button" onClick={() => setPromptSuggestions(null)} className="text-xs text-slate-400 hover:text-white" aria-label="Clear suggestions">&times; Close</button>
                </div>
                <ul className="space-y-2">
                    {promptSuggestions.map((suggestion, index) => (
                        <li key={index}>
                            <button
                                type="button"
                                onClick={() => {
                                    onPromptChange(suggestion);
                                }}
                                className="w-full text-left p-3 bg-slate-700/50 hover:bg-indigo-600/50 rounded-md text-sm text-slate-300 hover:text-white transition-colors duration-200"
                            >
                                {suggestion}
                            </button>
                        </li>
                    ))}
                </ul>
                <div className="pt-2">
                    <button
                        type="button"
                        onClick={() => onGenerateAllSuggestions(promptSuggestions)}
                        disabled={isLoading || isEnhancing}
                        className="w-full flex justify-center items-center gap-2 bg-green-700 hover:bg-green-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 text-sm"
                    >
                        ⚡ Generate All ({promptSuggestions.length} Images)
                    </button>
                </div>
            </div>
        )}

        {showExamples && (
            <div className="space-y-3 p-4 bg-slate-800/60 rounded-lg animate-fade-in">
                <div className="flex justify-between items-center">
                    <h4 className="font-semibold text-slate-200">Example Prompts:</h4>
                    <button type="button" onClick={() => setShowExamples(false)} className="text-xs text-slate-400 hover:text-white" aria-label="Close examples">&times; Close</button>
                </div>
                {isFetchingExamples ? (
                    <div className="flex justify-center items-center h-32">
                        <LoaderIcon />
                        <span className="ml-2 text-slate-400">Fetching new ideas...</span>
                    </div>
                ) : (
                    <>
                        <ul className="space-y-2">
                            {examplePrompts.map((suggestion, index) => (
                                <li key={index}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onPromptChange(suggestion);
                                        }}
                                        className="w-full text-left p-3 bg-slate-700/50 hover:bg-indigo-600/50 rounded-md text-sm text-slate-300 hover:text-white transition-colors duration-200"
                                    >
                                        {suggestion}
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={onRefreshExamples}
                                disabled={isFetchingExamples || isLoading}
                                className="w-full flex justify-center items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 text-sm"
                            >
                                {isFetchingExamples ? <><LoaderIcon /> Loading...</> : '🔄 Get New Ideas'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        )}

        {/* Number of Images */}
        <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Number of Images</label>
            <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map(num => (
                    <button key={num} type="button" onClick={() => onNumberOfImagesChange(num)} className={`py-2 text-sm rounded-lg transition-colors duration-200 ${numberOfImages === num ? 'bg-indigo-600 text-white ring-1 ring-indigo-500' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}`}>
                        {num}
                    </button>
                ))}
            </div>
            {!isImagen && numberOfImages > 1 && <p className="text-xs text-slate-500 mt-2">Note: For Nano Banana, this will perform {numberOfImages} separate API calls.</p>}
        </div>

        {/* Aspect Ratio for Imagen */}
        {isImagen && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Aspect Ratio</label>
            <div className="grid grid-cols-5 gap-2">
                {aspectRatios.map(ratio => (
                    <button key={ratio} type="button" onClick={() => onAspectRatioChange(ratio)} className={`py-2 text-sm font-mono rounded-lg transition-colors duration-200 ${aspectRatio === ratio ? 'bg-indigo-600 text-white ring-1 ring-indigo-500' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}`}>
                        {ratio}
                    </button>
                ))}
            </div>
          </div>
        )}
        
        {/* Reference Images Section */}
        {!isImagen && (
          <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">Reference Images (Optional)</label>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {referenceImages.map((imgSrc, index) => (
                      <div key={index} className="relative group">
                          <img src={imgSrc} alt={`Reference ${index + 1}`} className="w-full h-24 object-cover rounded-lg" />
                          <button type="button" onClick={() => handleRemoveImage(index)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 leading-none opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Remove image">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          </button>
                      </div>
                  ))}
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full h-24 flex items-center justify-center border-2 border-dashed border-slate-700 rounded-lg hover:border-indigo-500 text-slate-400 hover:text-indigo-400 transition-colors duration-200">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                     <span className="sr-only">Add image</span>
                  </button>
              </div>
               <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png" onChange={handleAddImages} className="hidden" />
          </div>
        )}
        {isImagen && <p className="text-xs text-slate-500">Reference images are not supported by the Imagen model.</p>}

        <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded-lg my-4">
            <div className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
                <div>
                    <label htmlFor="web-search-toggle" className="font-medium text-slate-200">
                        Ground with Web Search
                    </label>
                    <p className="text-xs text-slate-400">For prompts about recent or specific topics.</p>
                </div>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={useWebSearch}
                onClick={() => onUseWebSearchChange(!useWebSearch)}
                id="web-search-toggle"
                className={`${useWebSearch ? 'bg-indigo-600' : 'bg-slate-700'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900`}
            >
                <span className={`${useWebSearch ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
            </button>
        </div>

        <button type="submit" disabled={isLoading} className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200">
          {isLoading ? <><LoaderIcon /> Generating...</> : 'Generate Image'}
        </button>
      </form>
      {error && <div className="text-red-400 bg-red-900/50 p-3 rounded-lg">{error}</div>}
      {generatedImages && generatedImages.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Generated Images:</h3>
              {generatedImages.length > 1 && (
                  <button onClick={handleDownloadAll} className="bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 text-sm flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                      Download All ({generatedImages.length})
                  </button>
              )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {generatedImages.map((imgSrc, index) => (
                  <button key={index} onClick={() => onSelectedImageIndexChange(index)} className={`rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-indigo-500 ${selectedImageIndex === index ? 'ring-2 ring-indigo-500' : 'ring-1 ring-slate-700 hover:ring-indigo-600'}`}>
                      <img src={imgSrc} alt={`Generated ${index + 1}`} className="w-full h-full object-cover aspect-square" />
                  </button>
              ))}
          </div>

          {selectedImageUrl && (
            <div className="space-y-4 pt-4">
                <h3 className="text-lg font-semibold">Preview:</h3>
                <img src={selectedImageUrl} alt="Selected generated image" className="rounded-xl shadow-lg max-w-full mx-auto" />
                <a href={selectedImageUrl} download="generated-image-with-prompt.jpg" className="block w-full text-center bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200">
                    Download Selected Image with Metadata
                </a>
            </div>
          )}

          {selectedImageUrl && !isImagen && (
              <div className="space-y-3 pt-4 border-t border-slate-800">
                  <h3 className="text-lg font-semibold text-teal-400">Conversational Refinement</h3>
                  <p className="text-sm text-slate-400">Describe a change to the selected image above.</p>
                  <textarea
                      value={refinementPrompt}
                      onChange={(e) => onRefinementPromptChange(e.target.value)}
                      placeholder="e.g., Make the jellyfish glow brighter, change the style to watercolor..."
                      className="w-full h-24 p-3 bg-slate-800/80 border border-slate-700 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-mono text-sm transition-colors duration-200"
                  />
                  <button 
                      onClick={onRefine} 
                      disabled={isLoading || isRefining || !refinementPrompt.trim()} 
                      className="w-full flex justify-center items-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200"
                  >
                      {isRefining ? <><LoaderIcon /> Refining...</> : 'Refine Image'}
                  </button>
              </div>
          )}
        </div>
      )}
    </div>
  );
};


interface PromptExtractorProps {
  onFileSelect: (file: File) => void;
  extractedMetadata: GenerationMetadata | null;
  onExtractedMetadataChange: (metadata: GenerationMetadata | null) => void;
  imagePreview: string | null;
  extractionMessage: string | null;
  isPromptValid: boolean;
  isEditing: boolean;
  onToggleEdit: () => void;
  onUsePrompt: () => void;
  isDescribing: boolean;
  onDescribeImage: () => void;
}

const PromptExtractor: React.FC<PromptExtractorProps> = ({ 
    onFileSelect, extractedMetadata, onExtractedMetadataChange, imagePreview, 
    extractionMessage, isPromptValid, isEditing, onToggleEdit, onUsePrompt,
    isDescribing, onDescribeImage
}) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };
  
  const displayPrompt = formatJsonDisplay(extractedMetadata?.prompt || null);

  const handlePromptTextAreaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!extractedMetadata) return;
      const newValue = e.target.value;
      const isNanoBanana = extractedMetadata.model === 'gemini-2.5-flash-image';
      const newPrompt = isNanoBanana ? `[${newValue}]` : newValue;
      onExtractedMetadataChange({ ...extractedMetadata, prompt: newPrompt });
  };


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-indigo-400">Extract Metadata from Image</h2>
        <p className="text-slate-400 mt-1">Upload an image (JPEG) to check for an embedded generation prompt and other metadata.</p>
      </div>
      <input
        type="file"
        accept="image/jpeg,image/png"
        onChange={handleFileChange}
        className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200 transition-colors duration-200"
      />
      {imagePreview && (
         <div className="space-y-4">
           <h3 className="text-lg font-semibold">Image Preview:</h3>
           <img src={imagePreview} alt="Uploaded preview" className="rounded-xl shadow-lg max-w-full mx-auto" />
         </div>
      )}
      {extractionMessage && (
        <div className={`p-4 rounded-lg ${isPromptValid ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300'}`}>
            <h3 className="font-bold text-lg mb-2">
              {extractedMetadata 
                ? (isPromptValid ? "Metadata Found!" : "Invalid Prompt Found") 
                : "Extraction Result"}
            </h3>
            <p>{extractionMessage}</p>
            {isPromptValid && extractedMetadata && (
                <div className="mt-2 text-xs font-mono space-y-1">
                    <p><strong>Model:</strong> {extractedMetadata.model}</p>
                    {extractedMetadata.aspectRatio && <p><strong>Aspect Ratio:</strong> {extractedMetadata.aspectRatio}</p>}
                </div>
            )}
        </div>
      )}
       {imagePreview && !extractedMetadata && (
        <div className="pt-2">
            <button
                type="button"
                onClick={onDescribeImage}
                disabled={isDescribing}
                className="w-full flex justify-center items-center gap-2 bg-teal-700 hover:bg-teal-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
            >
                {isDescribing ? <><LoaderIcon /> Describing Image...</> : '🖼️ Describe Image with AI'}
            </button>
            <p className="text-xs text-slate-500 mt-2 text-center">No metadata found. Let AI generate a prompt from the image.</p>
        </div>
       )}
      {extractedMetadata && (
        <div className="space-y-4">
            {extractedMetadata.originalPrompt && (
                 <div className="p-3 bg-slate-800/50 rounded-lg">
                    <h4 className="font-semibold text-sm text-slate-300 mb-1">Original Prompt</h4>
                    <p className="text-xs font-mono text-slate-400">{extractedMetadata.originalPrompt}</p>
                 </div>
            )}
            <h3 className="text-lg font-semibold">{extractedMetadata.originalPrompt ? 'Grounded Prompt:' : (isPromptValid ? 'Extracted Prompt:' : 'Extracted Text (Invalid JSON):')}</h3>
            {isEditing ? (
                 <textarea
                    value={displayPrompt}
                    onChange={handlePromptTextAreaChange}
                    className={`w-full h-48 p-3 bg-slate-900 border rounded-lg focus:ring-2 font-mono text-sm transition-colors duration-200 ${
                        isPromptValid ? 'border-green-500/60 focus:ring-green-500 focus:border-green-500' : 'border-red-500/60 focus:ring-red-500 focus:border-red-500'
                    }`}
                    aria-label="Editable prompt text"
                />
            ) : (
                <pre className={`bg-slate-800/80 p-4 rounded-lg text-slate-300 text-sm overflow-x-auto border ${
                    isPromptValid ? 'border-green-700/40' : 'border-red-700/40'
                }`}><code>{displayPrompt}</code></pre>
            )}
             <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 pt-2">
                <button onClick={onToggleEdit} className="flex-1 bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">
                  {isEditing ? 'Done Editing' : 'Edit Metadata'}
                </button>
                <button onClick={onUsePrompt} disabled={!isPromptValid} className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">
                  Use this Metadata
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

interface GenerationHistoryProps {
  history: HistoryItem[];
  onSelectItem: (item: HistoryItem) => void;
}

const GenerationHistory: React.FC<GenerationHistoryProps> = ({ history, onSelectItem }) => {
    const [isOpen, setIsOpen] = useState(true);
    if (history.length === 0) return null;

    return (
        <div className="mt-8 pt-6 border-t border-slate-800">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center text-left text-xl font-semibold text-indigo-400 mb-4" aria-expanded={isOpen}>
                Generation History ({history.length})
                <svg className={`w-6 h-6 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            {isOpen && (
                <ul className="space-y-4">
                    {history.map((item) => (
                        <li key={item.id} className="bg-slate-800/50 p-4 rounded-xl flex items-start gap-4">
                            <div className="relative flex-shrink-0">
                                <img src={item.images[0]} alt="History thumbnail" className="w-20 h-20 object-cover rounded-lg" />
                                {item.images.length > 1 && (
                                    <span className="absolute -top-2 -right-2 bg-indigo-600 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center ring-2 ring-slate-800/50" aria-label={`${item.images.length} images`}>
                                        {item.images.length}
                                    </span>
                                )}
                            </div>
                            <div className="flex-grow overflow-hidden">
                                <p className="text-xs text-slate-400 font-mono whitespace-pre-wrap break-words line-clamp-3" title={item.metadata.prompt}>
                                    {item.metadata.originalPrompt && (
                                        <span className="block text-slate-500 text-[10px] italic" title={`Original: ${item.metadata.originalPrompt}`}>
                                            Grounded from: "{item.metadata.originalPrompt}"
                                        </span>
                                    )}
                                    {formatJsonDisplay(item.metadata.prompt)}
                                </p>
                                <div className="mt-3 flex items-center gap-3">
                                    <button onClick={() => onSelectItem(item)} className="text-sm bg-indigo-700 hover:bg-indigo-600 text-white font-semibold py-1 px-3 rounded-md transition-colors duration-200">
                                        Use
                                    </button>
                                    <a href={item.images[0]} download={`generated-image-${item.id}-0.jpg`} className="text-sm bg-slate-600 hover:bg-slate-500 text-white font-semibold py-1 px-3 rounded-md transition-colors duration-200">
                                        Download
                                    </a>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

// --- Main App Component ---

const App: React.FC = () => {
  const [view, setView] = useState<View>('generate');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[] | null>(null);
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT_TEXT);
  const [promptMode, setPromptMode] = useState<PromptMode>('text');
  const [model, setModel] = useState<ImageModel>('gemini-2.5-flash-image');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [numberOfImages, setNumberOfImages] = useState<number>(1);
  const [generationHistory, setGenerationHistory] = useState<HistoryItem[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]); // Data URLs
  
  const [extractedMetadata, setExtractedMetadata] = useState<GenerationMetadata | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extractionMessage, setExtractionMessage] = useState<string | null>(null);
  const [isPromptValid, setIsPromptValid] = useState<boolean>(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState<boolean>(false);
  const [isDescribing, setIsDescribing] = useState<boolean>(false);

  // State for refinement
  const [isRefining, setIsRefining] = useState<boolean>(false);
  const [refinementPrompt, setRefinementPrompt] = useState<string>('');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [activeBatchHistoryIds, setActiveBatchHistoryIds] = useState<string[] | null>(null);
  
  // State for Grounded Generation
  const [useWebSearch, setUseWebSearch] = useState<boolean>(false);

  // State for dynamic examples
  const [examplePrompts, setExamplePrompts] = useState<string[]>([]);
  const [isFetchingExamples, setIsFetchingExamples] = useState<boolean>(true);


  const fetchExamplePrompts = useCallback(async () => {
      setIsFetchingExamples(true);
      try {
          const prompts = await generateExamplePrompts();
          setExamplePrompts(prompts);
      } catch (e: any) {
          console.error("Failed to fetch example prompts:", e.message);
          // Fallback to a default set if API fails, so the user is not left with nothing.
          setExamplePrompts([
              "A photorealistic image of an astronaut riding a majestic Friesian horse on Mars, red dust swirling, with a blue Earth hanging in the dark, star-filled sky.",
              "Whimsical watercolor painting of a sprawling city built from giant, ancient books. Tiny people read on the rooftops under a soft, pastel sunset.",
              "Epic fantasy landscape painting of a colossal, moss-covered dragon sleeping, coiled around a snow-capped mountain peak. Cinematic, volumetric lighting pierces through stormy clouds.",
              "Vibrant, bustling futuristic street in a cyberpunk Tokyo at night. Towering holographic ads, flying vehicles, and diverse cyborgs fill the scene with neon light."
          ]);
          setError("Could not fetch new example prompts. Displaying defaults.");
      } finally {
          setIsFetchingExamples(false);
      }
  }, []);

  useEffect(() => {
      fetchExamplePrompts();
  }, [fetchExamplePrompts]);


  // Effect to manage state consistency when switching models
  useEffect(() => {
    if (model === 'imagen-4.0-generate-001') {
      setPromptMode('text'); // Imagen only uses text prompts
      setReferenceImages([]); // Imagen doesn't support reference images
    }
  }, [model]);

  // Effect to reset selected image when a new batch is generated or cleared
  useEffect(() => {
    setSelectedImageIndex(0);
  }, [generatedImages]);

  const handleGenerate = useCallback(async (currentPrompt: string, currentModel: ImageModel, currentAspectRatio: AspectRatio, numImages: number) => {
    setIsLoading(true);
    setError(null);
    setGeneratedImages(null);
    setRefinementPrompt('');
    setActiveBatchHistoryIds(null); // Reset batch state

    try {
        let finalPromptForApi: string = currentPrompt;
        let metadataPrompt: string = currentPrompt;
        let originalPromptForMetadata: string | undefined = undefined;

        // Step 1: Grounding with Web Search (if enabled)
        if (useWebSearch) {
            setError("Grounding prompt with web search..."); // Use error state as a status indicator
            const groundedPrompt = await generateGroundedPrompt(currentPrompt);
            finalPromptForApi = groundedPrompt;
            metadataPrompt = groundedPrompt;
            originalPromptForMetadata = currentPrompt;
            setError(null);
        }

        // Step 2: Prepare prompt for Nano Banana JSON mode (if not using web search)
        const isImagen = currentModel === 'imagen-4.0-generate-001';
        if (!isImagen && !useWebSearch && promptMode === 'json') {
            try {
                const parsed = JSON.parse(currentPrompt);
                metadataPrompt = JSON.stringify(parsed, null, 2);
                // The API itself uses the raw JSON string
                finalPromptForApi = currentPrompt;
            } catch (e) {
                setError("The provided JSON is invalid. Please correct it.");
                setIsLoading(false);
                return;
            }
        }
        
        const metadataToEmbed: GenerationMetadata = {
            model: currentModel,
            prompt: metadataPrompt,
            originalPrompt: originalPromptForMetadata,
            aspectRatio: isImagen ? currentAspectRatio : undefined
        };
        
        // Step 3: Call image generation service
        const imagePartsForApi: ReferenceImage[] = referenceImages.map(dataUrl => {
            const [meta, data] = dataUrl.split(',');
            const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
            return { mimeType, data };
        });

        const base64Images = await generateImagesFromPrompt(finalPromptForApi, currentModel, {
            aspectRatio: currentAspectRatio,
            referenceImages: imagePartsForApi,
            numberOfImages: numImages,
        });

        // Step 4: Embed metadata and update state
        const imagesWithMetadata = await Promise.all(
            base64Images.map(base64Image => embedMetadataInImage(base64Image, 'image/png', metadataToEmbed))
        );
        
        const newHistoryItem: HistoryItem = {
            id: `hist-${Date.now()}`,
            images: imagesWithMetadata,
            timestamp: Date.now(),
            metadata: metadataToEmbed
        };
        setGeneratedImages(imagesWithMetadata);
        setGenerationHistory(prev => [newHistoryItem, ...prev]);
        setActiveHistoryId(newHistoryItem.id);
        setReferenceImages([]);
        setUseWebSearch(false); // Reset toggle after generation

    } catch (e: any) {
        setError(e.message || "An unknown error occurred.");
    } finally {
        setIsLoading(false);
    }
  }, [promptMode, referenceImages, useWebSearch]);

  const handleGenerateAllSuggestions = useCallback(async (suggestions: string[]) => {
    if (!suggestions || suggestions.length === 0) return;

    setIsLoading(true);
    setError(null);
    setGeneratedImages(null);
    setRefinementPrompt('');
    setActiveHistoryId(null);
    setActiveBatchHistoryIds(null);

    try {
        const generationPromises = suggestions.map(async (suggestionPrompt) => {
            const isImagen = model === 'imagen-4.0-generate-001';
            const metadataToEmbed: GenerationMetadata = {
                model: model,
                prompt: suggestionPrompt,
                aspectRatio: isImagen ? aspectRatio : undefined,
            };

            const base64Images = await generateImagesFromPrompt(suggestionPrompt, model, {
                aspectRatio: aspectRatio,
                numberOfImages: 1, // One image per suggestion
            });

            if (!base64Images || base64Images.length === 0) {
                console.error(`Generation failed for prompt: "${suggestionPrompt}"`);
                return null;
            }

            const imageWithMetadata = await embedMetadataInImage(base64Images[0], 'image/png', metadataToEmbed);
            
            const newHistoryItem: HistoryItem = {
                id: `hist-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                images: [imageWithMetadata],
                timestamp: Date.now(),
                metadata: metadataToEmbed,
            };

            return newHistoryItem;
        });

        const results = await Promise.all(generationPromises);
        const newHistoryItems = results.filter((item): item is HistoryItem => item !== null);

        if (newHistoryItems.length > 0) {
            const allGeneratedImages = newHistoryItems.flatMap(item => item.images);
            const newHistoryIds = newHistoryItems.map(item => item.id);

            setGeneratedImages(allGeneratedImages);
            setGenerationHistory(prev => [...newHistoryItems, ...prev]);
            setActiveBatchHistoryIds(newHistoryIds);
        } else {
            throw new Error("All image generations in the batch failed. Please try again.");
        }
        
        setReferenceImages([]);
        setUseWebSearch(false);

    } catch (e: any) {
        setError(e.message || "An unknown error occurred during batch generation.");
    } finally {
        setIsLoading(false);
    }
}, [model, aspectRatio]);
  
  const handleRefine = useCallback(async () => {
    if (!generatedImages || refinementPrompt.trim() === '') return;

    const historyIdToUse = activeBatchHistoryIds
        ? activeBatchHistoryIds[selectedImageIndex]
        : activeHistoryId;

    if (!historyIdToUse) {
        setError("Could not find the active session to refine. Please generate a new image.");
        return;
    }
    
    const activeHistoryItem = generationHistory.find(h => h.id === historyIdToUse);
    if (!activeHistoryItem) {
        setError("Could not find the active history item to refine. Please generate a new image.");
        return;
    }
    
    setIsRefining(true);
    setError(null);

    try {
        const sourceImageDataUrl = generatedImages[selectedImageIndex];
        const [meta, data] = sourceImageDataUrl.split(',');
        const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
        const referenceImage: ReferenceImage = { mimeType, data };

        const refinedBase64 = await refineImage(refinementPrompt, referenceImage);

        const newPromptForMetadata = `${activeHistoryItem.metadata.prompt}\n\n---\n\nRefinement: ${refinementPrompt}`;
        const newMetadata: GenerationMetadata = {
            ...activeHistoryItem.metadata,
            prompt: newPromptForMetadata,
        };

        const refinedImageWithMetadata = await embedMetadataInImage(refinedBase64, 'image/png', newMetadata);

        const newGeneratedImages = [...generatedImages];
        newGeneratedImages[selectedImageIndex] = refinedImageWithMetadata;

        const newHistory = generationHistory.map(item => 
            item.id === historyIdToUse
                ? { ...item, images: [refinedImageWithMetadata], metadata: newMetadata } 
                : item
        );

        setGeneratedImages(newGeneratedImages);
        setGenerationHistory(newHistory);
        setRefinementPrompt('');

    } catch (e: any) {
        setError(e.message || "An unknown error occurred during refinement.");
    } finally {
        setIsRefining(false);
    }
  }, [generatedImages, activeHistoryId, activeBatchHistoryIds, refinementPrompt, selectedImageIndex, generationHistory]);

  const handleSelectHistoryItem = useCallback((item: HistoryItem) => {
    const { metadata } = item;
    setModel(metadata.model);
    setAspectRatio(metadata.aspectRatio || '1:1');
    setPrompt(metadata.prompt);
    
    if (metadata.model === 'imagen-4.0-generate-001') {
      setPromptMode('text');
    } else {
      // Check if prompt is JSON-like to set mode
      try {
        JSON.parse(metadata.prompt);
        setPromptMode('json');
      } catch {
        setPromptMode('text');
      }
    }

    setGeneratedImages(item.images);
    setActiveHistoryId(item.id);
    setActiveBatchHistoryIds(null);
    setNumberOfImages(item.images.length);
    setReferenceImages([]);
    setError(null);
    setRefinementPrompt('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleToggleEditPrompt = useCallback(() => {
    if (isEditingPrompt && extractedMetadata) {
        let isValid = false;
        try {
            if (extractedMetadata.model === 'gemini-2.5-flash-image') {
                JSON.parse(extractedMetadata.prompt);
            }
            isValid = true;
        } catch (error) {
            isValid = false;
        }
        setIsPromptValid(isValid);
        setExtractionMessage(isValid ? "The edited prompt is valid." : "The edited prompt is not valid JSON.");
    }
    setIsEditingPrompt(prev => !prev);
  }, [isEditingPrompt, extractedMetadata]);
  
  const handleUseExtractedPrompt = useCallback(() => {
    if (extractedMetadata && isPromptValid) {
      setModel(extractedMetadata.model);
      setAspectRatio(extractedMetadata.aspectRatio || '1:1');
      setPrompt(extractedMetadata.prompt);
      
      if (extractedMetadata.model === 'imagen-4.0-generate-001') {
          setPromptMode('text');
      } else {
          setPromptMode('json'); // Assume extracted prompts for NB are JSON
      }
      
      setReferenceImages([]);
      setView('generate');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [extractedMetadata, isPromptValid]);

  const handleFileSelect = useCallback((file: File) => {
    setImagePreview(null);
    setExtractedMetadata(null);
    setIsPromptValid(false);
    setIsEditingPrompt(false);
    setExtractionMessage('Processing image...');

    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) { setExtractionMessage("Could not read file data."); return; }

        setImagePreview(dataUrl);
        const foundMetadata = extractMetadataFromImage(dataUrl);
        
        if (typeof foundMetadata === 'object' && foundMetadata !== null) {
            setExtractedMetadata(foundMetadata);
            setIsPromptValid(true);
            setExtractionMessage("Successfully extracted generation metadata.");
        } else if (typeof foundMetadata === 'string') {
            // Handle legacy string-only prompts
            try {
                JSON.parse(foundMetadata);
                setExtractedMetadata({ model: 'gemini-2.5-flash-image', prompt: foundMetadata });
                setIsPromptValid(true);
                setExtractionMessage("Found a legacy prompt and assumed it's for the Nano Banana model.");
            } catch {
                setExtractedMetadata({ model: 'gemini-2.5-flash-image', prompt: foundMetadata });
                setIsPromptValid(false);
                setExtractionMessage("An embedded prompt was found, but it is not valid JSON.");
            }
        } else {
            setExtractedMetadata(null);
            setIsPromptValid(false);
            setExtractionMessage("Could not find embedded metadata in this image's EXIF data.");
        }
    };
    reader.onerror = () => { setExtractionMessage("Error reading file."); }
    reader.readAsDataURL(file);
  }, []);
  
  const handleDescribeImage = useCallback(async () => {
    if (!imagePreview) {
        setExtractionMessage("No image available to describe.");
        return;
    }
    
    setIsDescribing(true);
    setExtractionMessage("Generating description with AI...");
    setError(null);

    try {
        const [meta, data] = imagePreview.split(',');
        const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
        const referenceImage: ReferenceImage = { mimeType, data };
        
        const description = await describeImage(referenceImage);

        const newMetadata: GenerationMetadata = {
            model: 'gemini-2.5-flash-image', // Default to a good general model
            prompt: description,
        };
        
        setExtractedMetadata(newMetadata);
        setIsPromptValid(true);
        setExtractionMessage("AI-generated description created! You can now edit it or use it to generate a new image.");
        setIsEditingPrompt(true);

    } catch (e: any) {
        setExtractionMessage(e.message || "Failed to generate description.");
        setIsPromptValid(false);
    } finally {
        setIsDescribing(false);
    }
  }, [imagePreview]);

  return (
    <div className="min-h-screen flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-2xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
            Gemini EXIF Data Embedder
          </h1>
          <p className="text-slate-400 mt-2">Generate AI images and manage embedded metadata prompts.</p>
        </header>

        <main className="bg-slate-900/70 rounded-xl shadow-2xl p-1 backdrop-blur-lg">
           <div className="bg-slate-900 rounded-lg p-6 sm:p-8">
            <div className="border-b border-slate-800 mb-6">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    <button onClick={() => setView('generate')} className={`${view === 'generate' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200`}>
                        Generate Image
                    </button>
                    <button onClick={() => setView('extract')} className={`${view === 'extract' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200`}>
                        Extract Metadata
                    </button>
                </nav>
            </div>

            {view === 'generate' ? (
                <>
                    <ImageGenerator 
                        isLoading={isLoading} generatedImages={generatedImages} error={error} setError={setError} onGenerate={handleGenerate}
                        onGenerateAllSuggestions={handleGenerateAllSuggestions}
                        prompt={prompt} onPromptChange={setPrompt}
                        promptMode={promptMode} onPromptModeChange={setPromptMode}
                        model={model} onModelChange={setModel}
                        aspectRatio={aspectRatio} onAspectRatioChange={setAspectRatio}
                        referenceImages={referenceImages} onReferenceImagesChange={setReferenceImages}
                        numberOfImages={numberOfImages} onNumberOfImagesChange={setNumberOfImages}
                        selectedImageIndex={selectedImageIndex} onSelectedImageIndexChange={setSelectedImageIndex}
                        isRefining={isRefining} refinementPrompt={refinementPrompt} onRefinementPromptChange={setRefinementPrompt} onRefine={handleRefine}
                        useWebSearch={useWebSearch} onUseWebSearchChange={setUseWebSearch}
                        examplePrompts={examplePrompts} isFetchingExamples={isFetchingExamples} onRefreshExamples={fetchExamplePrompts}
                    />
                    <GenerationHistory history={generationHistory} onSelectItem={handleSelectHistoryItem} />
                </>
            ) : (
                <PromptExtractor 
                    onFileSelect={handleFileSelect}
                    extractedMetadata={extractedMetadata} onExtractedMetadataChange={setExtractedMetadata}
                    imagePreview={imagePreview} extractionMessage={extractionMessage}
                    isPromptValid={isPromptValid} isEditing={isEditingPrompt}
                    onToggleEdit={handleToggleEditPrompt} onUsePrompt={handleUseExtractedPrompt}
                    isDescribing={isDescribing} onDescribeImage={handleDescribeImage}
                />
            )}
           </div>
        </main>
        <footer className="w-full max-w-2xl mx-auto mt-8 text-center text-slate-500 text-sm">
             <p>&copy; 2024 AI Image Tools. All features implemented.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
