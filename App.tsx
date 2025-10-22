
import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { View, ImageModel, AspectRatio } from './types';
import { generateImageFromPrompt, ReferenceImage } from './services/geminiService';

// To inform TypeScript about the global piexif object from the CDN script
declare const piexif: any;

// Using ImageDescription (270) which is more reliable for string data than UserComment (37510).
const EXIF_PROMPT_TAG = 270; // Corresponds to piexif.ImageIFD.ImageDescription
const DEFAULT_PROMPT_TEXT = "A majestic bioluminescent jellyfish floating in a dark, deep ocean, surrounded by sparkling plankton.";

type PromptMode = 'text' | 'json';

interface GenerationMetadata {
  model: ImageModel;
  prompt: string; // The user-facing prompt string/JSON
  aspectRatio?: AspectRatio;
}

interface HistoryItem {
  id: string;
  image: string; // base64 data URL
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
  generatedImage: string | null;
  error: string | null;
  onGenerate: (prompt: string, model: ImageModel, aspectRatio: AspectRatio) => void;
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
}

const ImageGenerator: React.FC<ImageGeneratorProps> = ({ 
    isLoading, generatedImage, error, onGenerate, prompt, onPromptChange,
    promptMode, onPromptModeChange, model, onModelChange,
    aspectRatio, onAspectRatioChange, referenceImages, onReferenceImagesChange
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isImagen = model === 'imagen-4.0-generate-001';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate(prompt, model, aspectRatio);
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

        <button type="submit" disabled={isLoading} className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200">
          {isLoading ? <><LoaderIcon /> Generating...</> : 'Generate Image'}
        </button>
      </form>
      {error && <div className="text-red-400 bg-red-900/50 p-3 rounded-lg">{error}</div>}
      {generatedImage && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Generated Image:</h3>
          <img src={generatedImage} alt="Generated by AI" className="rounded-xl shadow-lg max-w-full mx-auto" />
          <a href={generatedImage} download="generated-image-with-prompt.jpg" className="block w-full text-center bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200">
            Download Image with Embedded Metadata
          </a>
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
}

const PromptExtractor: React.FC<PromptExtractorProps> = ({ 
    onFileSelect, extractedMetadata, onExtractedMetadataChange, imagePreview, 
    extractionMessage, isPromptValid, isEditing, onToggleEdit, onUsePrompt
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
      {extractedMetadata && (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold">{isPromptValid ? 'Extracted Prompt:' : 'Extracted Text (Invalid JSON):'}</h3>
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
                            <img src={item.image} alt="History thumbnail" className="w-20 h-20 object-cover rounded-lg flex-shrink-0" />
                            <div className="flex-grow overflow-hidden">
                                <p className="text-xs text-slate-400 font-mono whitespace-pre-wrap break-words line-clamp-3" title={item.metadata.prompt}>
                                    {formatJsonDisplay(item.metadata.prompt)}
                                </p>
                                <div className="mt-3 flex items-center gap-3">
                                    <button onClick={() => onSelectItem(item)} className="text-sm bg-indigo-700 hover:bg-indigo-600 text-white font-semibold py-1 px-3 rounded-md transition-colors duration-200">
                                        Use
                                    </button>
                                    <a href={item.image} download={`generated-image-${item.id}.jpg`} className="text-sm bg-slate-600 hover:bg-slate-500 text-white font-semibold py-1 px-3 rounded-md transition-colors duration-200">
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
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT_TEXT);
  const [promptMode, setPromptMode] = useState<PromptMode>('text');
  const [model, setModel] = useState<ImageModel>('gemini-2.5-flash-image');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [generationHistory, setGenerationHistory] = useState<HistoryItem[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]); // Data URLs
  
  const [extractedMetadata, setExtractedMetadata] = useState<GenerationMetadata | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extractionMessage, setExtractionMessage] = useState<string | null>(null);
  const [isPromptValid, setIsPromptValid] = useState<boolean>(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState<boolean>(false);

  // Effect to manage state consistency when switching models
  useEffect(() => {
    if (model === 'imagen-4.0-generate-001') {
      setPromptMode('text'); // Imagen only uses text prompts
      setReferenceImages([]); // Imagen doesn't support reference images
    }
  }, [model]);

  const handleGenerate = useCallback(async (currentPrompt: string, currentModel: ImageModel, currentAspectRatio: AspectRatio) => {
    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);

    let promptForApi: string;
    let metadataToEmbed: GenerationMetadata;
    const isImagen = currentModel === 'imagen-4.0-generate-001';

    if (isImagen || promptMode === 'text') {
        promptForApi = currentPrompt;
        metadataToEmbed = { model: currentModel, prompt: currentPrompt, aspectRatio: isImagen ? currentAspectRatio : undefined };
    } else { // JSON mode for Nano Banana
        try {
            const parsed = JSON.parse(currentPrompt);
            const prettyPrompt = JSON.stringify(parsed, null, 2);
            promptForApi = prettyPrompt;
            metadataToEmbed = { model: currentModel, prompt: prettyPrompt };
        } catch (e) {
            setError("The provided JSON is invalid. Please correct it.");
            setIsLoading(false);
            return;
        }
    }
    
    try {
      const imagePartsForApi: ReferenceImage[] = referenceImages.map(dataUrl => {
        const [meta, data] = dataUrl.split(',');
        const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
        return { mimeType, data };
      });

      const base64Image = await generateImageFromPrompt(promptForApi, currentModel, {
          aspectRatio: currentAspectRatio,
          referenceImages: imagePartsForApi
      });
      const imageWithMetadata = await embedMetadataInImage(base64Image, 'image/png', metadataToEmbed);
      setGeneratedImage(imageWithMetadata);

      const newHistoryItem: HistoryItem = {
          id: `hist-${Date.now()}`,
          image: imageWithMetadata,
          timestamp: Date.now(),
          metadata: metadataToEmbed
      };
      setGenerationHistory(prev => [newHistoryItem, ...prev]);
      setReferenceImages([]);

    } catch (e: any) {
      setError(e.message || "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [promptMode, referenceImages]);
  
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

    setGeneratedImage(item.image);
    setReferenceImages([]);
    setError(null);
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
                        isLoading={isLoading} generatedImage={generatedImage} error={error} onGenerate={handleGenerate}
                        prompt={prompt} onPromptChange={setPrompt}
                        promptMode={promptMode} onPromptModeChange={setPromptMode}
                        model={model} onModelChange={setModel}
                        aspectRatio={aspectRatio} onAspectRatioChange={setAspectRatio}
                        referenceImages={referenceImages} onReferenceImagesChange={setReferenceImages}
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
                />
            )}
           </div>
        </main>
      </div>
    </div>
  );
};

export default App;