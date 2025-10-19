import React, { useState, useCallback, useRef } from 'react';
import type { View } from './types';
import { generateImageFromPrompt, ReferenceImage } from './services/geminiService';

// To inform TypeScript about the global piexif object from the CDN script
declare const piexif: any;

// Using ImageDescription (270) which is more reliable for string data than UserComment (37510).
const EXIF_PROMPT_TAG = 270; // Corresponds to piexif.ImageIFD.ImageDescription
const DEFAULT_PROMPT = "A majestic bioluminescent jellyfish floating in a dark, deep ocean, surrounded by sparkling plankton.";

type PromptMode = 'text' | 'json';

interface HistoryItem {
  id: string;
  prompt: string; // Always stored as a JSON string
  image: string; // base64 data URL
  timestamp: number;
}

// --- Helper Functions ---

const formatJsonDisplay = (jsonString: string | null): string => {
    if (!jsonString) return '';
    try {
        // Ensure it's valid JSON first
        const parsed = JSON.parse(jsonString);
        // Prettify to get consistent formatting
        const pretty = JSON.stringify(parsed, null, 2);
        const trimmed = pretty.trim();
        // If it's a JSON array, strip the outer brackets for a cleaner display
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            return trimmed.substring(1, trimmed.length - 1).trim();
        }
        return pretty; // It's valid JSON but not an array (e.g., a single object)
    } catch {
        return jsonString; // Return original string if it's not valid JSON
    }
};


const embedPromptInImage = (base64Image: string, mimeType: string, prompt: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Could not get canvas context'));
      }
      ctx.drawImage(img, 0, 0);

      const jpegDataUrl = canvas.toDataURL('image/jpeg');

      try {
        const zeroth: any = {};
        const exif: any = {};
        const gps: any = {};
        
        zeroth[EXIF_PROMPT_TAG] = prompt;

        const exifObj = { "0th": zeroth, "Exif": exif, "GPS": gps };
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


const extractPromptFromImage = (imageDataUrl: string): string | null => {
  try {
    const exifObj = piexif.load(imageDataUrl);
    const prompt = exifObj['0th']?.[EXIF_PROMPT_TAG];
    if (prompt && typeof prompt === 'string') {
        return prompt;
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


interface ImageGeneratorProps {
  isLoading: boolean;
  generatedImage: string | null;
  error: string | null;
  onGenerate: (prompt: string) => void;
  prompt: string;
  onPromptChange: (newPrompt: string) => void;
  promptMode: PromptMode;
  onPromptModeChange: (mode: PromptMode) => void;
  referenceImages: string[];
  onReferenceImagesChange: (images: string[]) => void;
}

const ImageGenerator: React.FC<ImageGeneratorProps> = ({ 
    isLoading, 
    generatedImage, 
    error, 
    onGenerate, 
    prompt, 
    onPromptChange,
    promptMode,
    onPromptModeChange,
    referenceImages,
    onReferenceImagesChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate(prompt);
  };
  
  const displayPrompt = promptMode === 'json' ? formatJsonDisplay(prompt) : prompt;

  const handlePromptTextAreaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      if (promptMode === 'json') {
          // Re-wrap the edited content in brackets to maintain a valid JSON array structure
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
            const reader = new FileReader();
            newImagePromises.push(new Promise((resolve, reject) => {
                reader.onload = (event) => resolve(event.target?.result as string);
                reader.onerror = (error) => reject(error);
                reader.readAsDataURL(file);
            }));
        }
    }

    Promise.all(newImagePromises).then(imageDataUrls => {
        onReferenceImagesChange([...referenceImages, ...imageDataUrls]);
    }).catch(console.error);
  };
  
  const handleRemoveImage = (indexToRemove: number) => {
      onReferenceImagesChange(referenceImages.filter((_, index) => index !== indexToRemove));
  };


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-sky-400">Generate Image with Embedded Prompt</h2>
        <p className="text-slate-400 mt-1">Enter a prompt and optionally add reference images to guide the generation.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Prompt Mode</label>
            <div className="flex rounded-md shadow-sm">
                <button
                    type="button"
                    onClick={() => onPromptModeChange('text')}
                    className={`px-4 py-2 text-sm font-medium rounded-l-md w-full transition-colors ${promptMode === 'text' ? 'bg-sky-600 text-white z-10 ring-1 ring-sky-500' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                >
                    Freeform Text
                </button>
                <button
                    type="button"
                    onClick={() => onPromptModeChange('json')}
                    className={`-ml-px px-4 py-2 text-sm font-medium rounded-r-md w-full transition-colors ${promptMode === 'json' ? 'bg-sky-600 text-white z-10 ring-1 ring-sky-500' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                >
                    JSON
                </button>
            </div>
        </div>
        <textarea
          value={displayPrompt}
          onChange={handlePromptTextAreaChange}
          placeholder={
            promptMode === 'text'
            ? 'e.g., A photo of a cat programming on a laptop'
            : 'e.g., { "text": "A photo of a cat..." }'
          }
          className="w-full h-48 p-3 bg-slate-800 border border-slate-600 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500 font-mono text-sm"
        />
        
        {/* Reference Images Section */}
        <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Reference Images (Optional)</label>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {referenceImages.map((imgSrc, index) => (
                    <div key={index} className="relative group">
                        <img src={imgSrc} alt={`Reference ${index + 1}`} className="w-full h-24 object-cover rounded-md" />
                        <button 
                            type="button"
                            onClick={() => handleRemoveImage(index)}
                            className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Remove image"
                        >
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-24 flex items-center justify-center border-2 border-dashed border-slate-600 rounded-md hover:border-sky-500 text-slate-400 hover:text-sky-400 transition-colors"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                   <span className="sr-only">Add image</span>
                </button>
            </div>
             <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png"
                onChange={handleAddImages}
                className="hidden"
            />
        </div>

        <button type="submit" disabled={isLoading} className="w-full flex justify-center items-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-500 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-md transition-colors">
          {isLoading ? <><LoaderIcon /> Generating...</> : 'Generate Image'}
        </button>
      </form>
      {error && <div className="text-red-400 bg-red-900/50 p-3 rounded-md">{error}</div>}
      {generatedImage && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Generated Image:</h3>
          <img src={generatedImage} alt="Generated by AI" className="rounded-lg shadow-lg max-w-full mx-auto" />
          <a href={generatedImage} download="generated-image-with-prompt.jpg" className="block w-full text-center bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-md transition-colors">
            Download Image with Embedded Prompt
          </a>
        </div>
      )}
    </div>
  );
};


interface PromptExtractorProps {
  onFileSelect: (file: File) => void;
  extractedPrompt: string | null;
  onPromptChange: (newPrompt: string) => void;
  imagePreview: string | null;
  extractionMessage: string | null;
  isPromptValid: boolean;
  isEditing: boolean;
  onToggleEdit: () => void;
  onUsePrompt: () => void;
}

const PromptExtractor: React.FC<PromptExtractorProps> = ({ 
    onFileSelect, 
    extractedPrompt, 
    onPromptChange,
    imagePreview, 
    extractionMessage, 
    isPromptValid,
    isEditing,
    onToggleEdit,
    onUsePrompt
}) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };
  
  const displayPrompt = formatJsonDisplay(extractedPrompt);

  const handlePromptTextAreaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      // Extracted/edited prompts are always stored as a full JSON array string
      onPromptChange(`[${e.target.value}]`);
  };


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-sky-400">Extract Prompt from Image</h2>
        <p className="text-slate-400 mt-1">Upload an image (JPEG) to check for an embedded generation prompt in its metadata.</p>
      </div>
      <input
        type="file"
        accept="image/jpeg,image/png"
        onChange={handleFileChange}
        className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sky-100 file:text-sky-700 hover:file:bg-sky-200"
      />
      {imagePreview && (
         <div className="space-y-4">
           <h3 className="text-lg font-semibold">Image Preview:</h3>
           <img src={imagePreview} alt="Uploaded preview" className="rounded-lg shadow-lg max-w-full mx-auto" />
         </div>
      )}
      {extractionMessage && (
        <div className={`p-4 rounded-md ${isPromptValid ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300'}`}>
            <h3 className="font-bold text-lg mb-2">
              {extractedPrompt 
                ? (isPromptValid ? "Prompt Found!" : "Invalid Prompt Found") 
                : "Extraction Result"}
            </h3>
            <p>{extractionMessage}</p>
        </div>
      )}
      {extractedPrompt && (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold">{isPromptValid ? 'Extracted Prompt:' : 'Extracted Text (Invalid JSON):'}</h3>
            {isEditing ? (
                 <textarea
                    value={displayPrompt}
                    onChange={handlePromptTextAreaChange}
                    className={`w-full h-48 p-3 bg-slate-900 border rounded-md focus:ring-2 font-mono text-sm transition-colors ${
                        isPromptValid 
                        ? 'border-green-500/60 focus:ring-green-500 focus:border-green-500' 
                        : 'border-red-500/60 focus:ring-red-500 focus:border-red-500'
                    }`}
                    aria-label="Editable prompt text"
                />
            ) : (
                <pre className={`bg-slate-800 p-4 rounded-md text-slate-300 text-sm overflow-x-auto border transition-colors ${
                    isPromptValid
                    ? 'border-green-700/40'
                    : 'border-red-700/40'
                }`}><code>{displayPrompt}</code></pre>
            )}
             <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 pt-2">
                <button 
                  onClick={onToggleEdit}
                  className="flex-1 bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-md transition-colors"
                >
                  {isEditing ? 'Done Editing' : 'Edit Prompt'}
                </button>
                <button 
                  onClick={onUsePrompt}
                  disabled={!isPromptValid}
                  className="flex-1 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-500 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-md transition-colors"
                >
                  Use this Prompt
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

    if (history.length === 0) {
        return null;
    }

    return (
        <div className="mt-8 pt-6 border-t border-slate-700">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex justify-between items-center text-left text-xl font-semibold text-sky-400 mb-4"
                aria-expanded={isOpen}
            >
                Generation History ({history.length})
                <svg className={`w-6 h-6 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            {isOpen && (
                <ul className="space-y-4">
                    {history.map((item) => (
                        <li key={item.id} className="bg-slate-800 p-4 rounded-lg flex items-start gap-4">
                            <img src={item.image} alt="History thumbnail" className="w-20 h-20 object-cover rounded-md flex-shrink-0" />
                            <div className="flex-grow overflow-hidden">
                                <p 
                                    className="text-xs text-slate-400 font-mono whitespace-pre-wrap break-words line-clamp-3"
                                    title={item.prompt}
                                >
                                    {formatJsonDisplay(item.prompt)}
                                </p>
                                <div className="mt-3 flex items-center gap-3">
                                    <button 
                                        onClick={() => onSelectItem(item)}
                                        className="text-sm bg-sky-700 hover:bg-sky-600 text-white font-semibold py-1 px-3 rounded-md transition-colors"
                                    >
                                        Use
                                    </button>
                                    <a 
                                        href={item.image}
                                        download={`generated-image-${item.id}.jpg`}
                                        className="text-sm bg-slate-600 hover:bg-slate-500 text-white font-semibold py-1 px-3 rounded-md transition-colors"
                                    >
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
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [promptMode, setPromptMode] = useState<PromptMode>('text');
  const [generationHistory, setGenerationHistory] = useState<HistoryItem[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]); // Data URLs
  
  const [extractedPrompt, setExtractedPrompt] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extractionMessage, setExtractionMessage] = useState<string | null>(null);
  const [isPromptValid, setIsPromptValid] = useState<boolean>(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState<boolean>(false);

  const handleGenerate = useCallback(async (currentPrompt: string) => {
    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);

    let promptToEmbed: string;
    let isRequestValid = true;

    if (promptMode === 'text') {
        const promptObject = [{ text: currentPrompt }];
        promptToEmbed = JSON.stringify(promptObject, null, 2);
    } else { // JSON mode
        try {
            const parsed = JSON.parse(currentPrompt);
            promptToEmbed = JSON.stringify(parsed, null, 2); // Prettify for embedding
        } catch (e) {
            setError("The provided JSON is invalid. Please correct it.");
            setIsLoading(false);
            isRequestValid = false;
            promptToEmbed = ''; // Prevent proceeding
        }
    }

    if (!isRequestValid) {
        return;
    }

    // Prepare reference images for the API call by stripping data URL prefixes
    const imagePartsForApi: ReferenceImage[] = referenceImages.map(dataUrl => {
        const [meta, data] = dataUrl.split(',');
        const mimeType = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
        return { mimeType, data };
    });

    try {
      const base64Image = await generateImageFromPrompt(promptToEmbed, imagePartsForApi);
      const imageWithMetadata = await embedPromptInImage(base64Image, 'image/png', promptToEmbed);
      setGeneratedImage(imageWithMetadata);

      const newHistoryItem: HistoryItem = {
          id: `hist-${Date.now()}`,
          prompt: promptToEmbed,
          image: imageWithMetadata,
          timestamp: Date.now()
      };
      setGenerationHistory(prev => [newHistoryItem, ...prev]);
      setReferenceImages([]); // Clear reference images after successful generation

    } catch (e: any) {
      setError(e.message || "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [promptMode, referenceImages]);
  
  const handleSelectHistoryItem = useCallback((item: HistoryItem) => {
    try {
        const parsed = JSON.parse(item.prompt);
        const prettyPrompt = JSON.stringify(parsed, null, 2);
        setPrompt(prettyPrompt);
    } catch {
        setPrompt(item.prompt);
    }
    setPromptMode('json'); // History prompts are always JSON
    setGeneratedImage(item.image);
    setReferenceImages([]); // Clear any selected reference images
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleToggleEditPrompt = useCallback(() => {
    if (isEditingPrompt && extractedPrompt) {
        try {
            JSON.parse(extractedPrompt);
            setIsPromptValid(true);
            setExtractionMessage("The edited prompt is valid JSON. You can now use it for generation.");
        } catch (error) {
            setIsPromptValid(false);
            setExtractionMessage("The edited prompt is not valid JSON. Please fix it before using it.");
        }
    }
    setIsEditingPrompt(prev => !prev);
  }, [isEditingPrompt, extractedPrompt]);
  
  const handleUseExtractedPrompt = useCallback(() => {
    if (extractedPrompt && isPromptValid) {
      try {
        const parsed = JSON.parse(extractedPrompt);
        const prettyPrompt = JSON.stringify(parsed, null, 2);
        setPrompt(prettyPrompt);
      } catch (e) {
        setPrompt(extractedPrompt);
      }
      setPromptMode('json'); // Extracted prompts are always JSON
      setReferenceImages([]); // Clear any selected reference images
      setView('generate');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [extractedPrompt, isPromptValid]);

  const handleFileSelect = useCallback((file: File) => {
    setImagePreview(null);
    setExtractedPrompt(null);
    setIsPromptValid(false);
    setIsEditingPrompt(false);
    setExtractionMessage('Processing image...');

    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) {
            setExtractionMessage("Could not read file data.");
            return;
        }

        setImagePreview(dataUrl);
        const foundPrompt = extractPromptFromImage(dataUrl);

        if (foundPrompt) {
            try {
                const parsed = JSON.parse(foundPrompt);
                const prettyPrompt = JSON.stringify(parsed, null, 2);
                setExtractedPrompt(prettyPrompt);
                setIsPromptValid(true);
                setExtractionMessage("Successfully extracted a valid JSON prompt. You can edit it or use it to generate a new image.");
            } catch (error) {
                setExtractedPrompt(foundPrompt);
                setIsPromptValid(false);
                setExtractionMessage("An embedded prompt was found, but it is not valid JSON.");
            }
        } else {
            setExtractedPrompt(null);
            setIsPromptValid(false);
            setExtractionMessage("Could not find an embedded prompt in this image's EXIF data.");
        }
    };
    reader.onerror = () => {
        setExtractionMessage("Error reading file.");
        setExtractedPrompt(null);
        setImagePreview(null);
        setIsPromptValid(false);
    }
    reader.readAsDataURL(file);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-2xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-300">
            Gemini Image Prompter
          </h1>
          <p className="text-slate-400 mt-2">Generate AI images and manage embedded metadata prompts.</p>
        </header>

        <main className="bg-slate-800/50 rounded-lg shadow-2xl p-1 backdrop-blur-sm">
           <div className="bg-slate-800 rounded-md p-6 sm:p-8">
            <div className="border-b border-slate-700 mb-6">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    <button
                        onClick={() => setView('generate')}
                        className={`${view === 'generate' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-500'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                    >
                        Generate Image
                    </button>
                    <button
                        onClick={() => setView('extract')}
                        className={`${view === 'extract' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-500'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                    >
                        Extract Prompt
                    </button>
                </nav>
            </div>

            {view === 'generate' ? (
                <>
                    <ImageGenerator 
                        isLoading={isLoading} 
                        generatedImage={generatedImage} 
                        error={error} 
                        onGenerate={handleGenerate}
                        prompt={prompt}
                        onPromptChange={setPrompt}
                        promptMode={promptMode}
                        onPromptModeChange={setPromptMode}
                        referenceImages={referenceImages}
                        onReferenceImagesChange={setReferenceImages}
                    />
                    <GenerationHistory 
                        history={generationHistory}
                        onSelectItem={handleSelectHistoryItem}
                    />
                </>
            ) : (
                <PromptExtractor 
                    onFileSelect={handleFileSelect}
                    extractedPrompt={extractedPrompt}
                    onPromptChange={setExtractedPrompt}
                    imagePreview={imagePreview}
                    extractionMessage={extractionMessage}
                    isPromptValid={isPromptValid}
                    isEditing={isEditingPrompt}
                    onToggleEdit={handleToggleEditPrompt}
                    onUsePrompt={handleUseExtractedPrompt}
                />
            )}
           </div>
        </main>
      </div>
    </div>
  );
};

export default App;