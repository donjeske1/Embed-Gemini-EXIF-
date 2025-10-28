import React, { useState, useCallback, useRef } from 'react';
import type { AspectRatio, ImageModel } from '../types';
import { useAppContext } from '../state/AppContext';
import { enhancePromptStream } from '../services/geminiService';
import LoaderIcon from './ui/LoaderIcon';

const aspectRatios: AspectRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4'];

// FIX: Remove local PromptMode type as it's now managed globally.
// type PromptMode = 'text' | 'json';

interface ImageGeneratorFormProps {
    onGenerate: (prompt: string, model: ImageModel, aspectRatio: AspectRatio, numberOfImages: number) => void;
    onGenerateAllSuggestions: (prompts: string[]) => void;
    onRefreshExamples: () => void;
}

const ImageGeneratorForm: React.FC<ImageGeneratorFormProps> = ({ onGenerate, onGenerateAllSuggestions, onRefreshExamples }) => {
  const { state, dispatch } = useAppContext();
  const {
      // FIX: Get promptMode from the global state.
      isLoading, prompt, model, aspectRatio, referenceImages, numberOfImages, useWebSearch,
      examplePrompts, isFetchingExamples, promptMode
  } = state;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isImagen = model === 'imagen-4.0-generate-001';
  
  // FIX: Remove local state for promptMode as it's now in AppContext.
  // const [promptMode, setPromptMode] = useState<PromptMode>('text');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [promptSuggestions, setPromptSuggestions] = useState<string[] | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate(prompt, model, aspectRatio, numberOfImages);
  };
  
  const handleEnhancePrompt = async () => {
    setIsEnhancing(true);
    dispatch({ type: 'SET_ERROR', payload: null });
    setPromptSuggestions(null);
    try {
        const currentPromptForEnhancing = promptMode === 'json' ? formatJsonDisplay(prompt) : prompt;
        const suggestions = await enhancePromptStream(currentPromptForEnhancing);
        setPromptSuggestions(suggestions);
    } catch (e: any) {
        dispatch({ type: 'SET_ERROR', payload: e.message || "Failed to get suggestions." });
    } finally {
        setIsEnhancing(false);
    }
  };

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
  const displayPrompt = promptMode === 'json' ? formatJsonDisplay(prompt) : prompt;

  const handlePromptTextAreaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const finalValue = promptMode === 'json' && !isImagen ? `[${newValue}]` : newValue;
      dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'prompt', value: finalValue } });
  };
  
  const onPromptChange = (newPrompt: string) => {
      dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'prompt', value: newPrompt } });
  };

  const processFiles = useCallback((files: FileList) => {
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
        dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'referenceImages', value: [...referenceImages, ...imageDataUrls] } });
        if (!isImagen && promptMode === 'json') {
            // FIX: Dispatch action to update global promptMode state.
            dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'promptMode', value: 'text' } });
            onPromptChange('');
        }
    }).catch(console.error);
  }, [referenceImages, isImagen, promptMode, dispatch]);

  const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
        processFiles(e.target.files);
    }
  };
  
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          processFiles(e.dataTransfer.files);
      }
  }, [processFiles]);

  const handleRemoveImage = (indexToRemove: number) => {
      dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'referenceImages', value: referenceImages.filter((_, index) => index !== indexToRemove) } });
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-indigo-500 dark:text-indigo-400">Generate Image</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Select a model, enter a prompt, and generate an image with embedded metadata.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Model</label>
            <div className="flex rounded-lg shadow-sm">
                <button type="button" onClick={() => dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'model', value: 'gemini-2.5-flash-image' } })} className={`px-4 py-2 text-sm font-medium rounded-l-lg w-full transition-colors duration-200 ${!isImagen ? 'bg-indigo-600 text-white z-10 ring-1 ring-indigo-500' : 'bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'}`}>
                    Nano Banana <span className="text-xs opacity-75">(Fast, Edits)</span>
                </button>
                <button type="button" onClick={() => dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'model', value: 'imagen-4.0-generate-001' } })} className={`-ml-px px-4 py-2 text-sm font-medium rounded-r-lg w-full transition-colors duration-200 ${isImagen ? 'bg-indigo-600 text-white z-10 ring-1 ring-indigo-500' : 'bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'}`}>
                    Imagen <span className="text-xs opacity-75">(High Quality)</span>
                </button>
            </div>
        </div>

        {!isImagen && (
          <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Prompt Mode</label>
              <div className="flex rounded-lg shadow-sm">
                  {/* FIX: Dispatch action to update global promptMode state. */}
                  <button type="button" onClick={() => dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'promptMode', value: 'text' } })} className={`px-4 py-2 text-sm font-medium rounded-l-lg w-full transition-colors duration-200 ${promptMode === 'text' ? 'bg-indigo-600 text-white z-10 ring-1 ring-indigo-500' : 'bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'}`}>
                      Freeform Text
                  </button>
                  {/* FIX: Dispatch action to update global promptMode state. */}
                  <button type="button" onClick={() => dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'promptMode', value: 'json' } })} className={`-ml-px px-4 py-2 text-sm font-medium rounded-r-lg w-full transition-colors duration-200 ${promptMode === 'json' ? 'bg-indigo-600 text-white z-10 ring-1 ring-indigo-500' : 'bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'}`}>
                      JSON
                  </button>
              </div>
          </div>
        )}

        <textarea
          value={displayPrompt}
          onChange={handlePromptTextAreaChange}
          placeholder={promptMode === 'text' || isImagen ? 'e.g., A photo of a cat programming on a laptop' : 'e.g., { "text": "A photo of a cat..." }'}
          className="w-full h-48 p-3 bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm transition-colors duration-200"
        />

        {promptMode === 'text' && (
             <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button 
                    type="button" 
                    onClick={handleEnhancePrompt} 
                    disabled={isEnhancing || isLoading || !prompt.trim()}
                    className="w-full flex justify-center items-center gap-2 bg-violet-700 hover:bg-violet-600 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 text-sm"
                >
                    {isEnhancing ? <><LoaderIcon /> Enhancing...</> : '✨ Enhance Prompt'}
                </button>
                <button 
                    type="button" 
                    onClick={() => setShowExamples(!showExamples)} 
                    className="w-full flex justify-center items-center gap-2 bg-slate-600 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 text-sm"
                >
                    💡 {showExamples ? 'Hide Examples' : 'Show Examples'}
                </button>
            </div>
        )}

        {promptSuggestions && (
            <div className="space-y-3 p-4 bg-slate-100 dark:bg-slate-800/60 rounded-lg animate-fade-in">
                <div className="flex justify-between items-center">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">AI Suggestions:</h4>
                    <button type="button" onClick={() => setPromptSuggestions(null)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-black dark:hover:text-white" aria-label="Clear suggestions">&times; Close</button>
                </div>
                <ul className="space-y-2">
                    {promptSuggestions.map((suggestion, index) => (
                        <li key={index}>
                            <button
                                type="button"
                                onClick={() => onPromptChange(suggestion)}
                                className="w-full text-left p-3 bg-slate-200 dark:bg-slate-700/50 hover:bg-indigo-100 dark:hover:bg-indigo-600/50 rounded-md text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors duration-200"
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
                        className="w-full flex justify-center items-center gap-2 bg-green-700 hover:bg-green-600 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 text-sm"
                    >
                        ⚡ Generate All ({promptSuggestions.length} Images)
                    </button>
                </div>
            </div>
        )}

        {showExamples && (
            <div className="space-y-3 p-4 bg-slate-100 dark:bg-slate-800/60 rounded-lg animate-fade-in">
                <div className="flex justify-between items-center">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200">Example Prompts:</h4>
                    <button type="button" onClick={() => setShowExamples(false)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-black dark:hover:text-white" aria-label="Close examples">&times; Close</button>
                </div>
                {isFetchingExamples ? (
                    <div className="flex justify-center items-center h-32">
                        <LoaderIcon />
                        <span className="ml-2 text-slate-500 dark:text-slate-400">Fetching new ideas...</span>
                    </div>
                ) : (
                    <>
                        <ul className="space-y-2">
                            {examplePrompts.map((suggestion, index) => (
                                <li key={index}>
                                    <button
                                        type="button"
                                        onClick={() => onPromptChange(suggestion)}
                                        className="w-full text-left p-3 bg-slate-200 dark:bg-slate-700/50 hover:bg-indigo-100 dark:hover:bg-indigo-600/50 rounded-md text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors duration-200"
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
                                className="w-full flex justify-center items-center gap-2 bg-slate-600 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 text-sm"
                            >
                                {isFetchingExamples ? <><LoaderIcon /> Loading...</> : '🔄 Get New Ideas'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        )}

        <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Number of Images</label>
            <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map(num => (
                    <button key={num} type="button" onClick={() => dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'numberOfImages', value: num } })} className={`py-2 text-sm rounded-lg transition-colors duration-200 ${numberOfImages === num ? 'bg-indigo-600 text-white ring-1 ring-indigo-500' : 'bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'}`}>
                        {num}
                    </button>
                ))}
            </div>
            {!isImagen && numberOfImages > 1 && <p className="text-xs text-slate-500 mt-2">Note: For Nano Banana, this will perform {numberOfImages} separate API calls.</p>}
        </div>

        {isImagen && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Aspect Ratio</label>
            <div className="grid grid-cols-5 gap-2">
                {aspectRatios.map(ratio => (
                    <button key={ratio} type="button" onClick={() => dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'aspectRatio', value: ratio } })} className={`py-2 text-sm font-mono rounded-lg transition-colors duration-200 ${aspectRatio === ratio ? 'bg-indigo-600 text-white ring-1 ring-indigo-500' : 'bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'}`}>
                        {ratio}
                    </button>
                ))}
            </div>
          </div>
        )}
        
        {!isImagen && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Reference Images (Optional)</label>
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={referenceImages.length === 0 ? () => fileInputRef.current?.click() : undefined}
                className={`rounded-lg border-2 border-dashed transition-colors duration-200 ${isDraggingOver ? 'border-indigo-500 bg-slate-100/50 dark:bg-slate-800/50' : 'border-slate-300 dark:border-slate-700'} ${referenceImages.length === 0 ? 'p-4 cursor-pointer hover:border-slate-400 dark:hover:border-slate-500' : 'p-2'}`}
            >
                {referenceImages.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                        {referenceImages.map((imgSrc, index) => (
                            <div key={index} className="relative group">
                                <img src={imgSrc} alt={`Reference ${index + 1}`} className="w-full h-24 object-cover rounded-lg" />
                                <button type="button" onClick={() => handleRemoveImage(index)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 leading-none opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Remove image">
                                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                </button>
                            </div>
                        ))}
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full h-24 flex items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg hover:border-indigo-500 text-slate-400 hover:text-indigo-400 transition-colors duration-200">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                           <span className="sr-only">Add image</span>
                        </button>
                    </div>
                ) : (
                    <div className="text-center text-slate-500 dark:text-slate-400 py-6">
                        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="mt-2 font-bold">Drag & drop images here or click the '+' button</p>
                    </div>
                )}
            </div>
            <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png" onChange={handleAddImages} className="hidden" />
          </div>
        )}
        {isImagen && <p className="text-xs text-slate-500">Reference images are not supported by the Imagen model.</p>}

        <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800/50 p-3 rounded-lg my-4">
            <div className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
                <div>
                    <label htmlFor="web-search-toggle" className="font-medium text-slate-800 dark:text-slate-200">
                        Ground with Web Search
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">For prompts about recent or specific topics.</p>
                </div>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={useWebSearch}
                onClick={() => dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'useWebSearch', value: !useWebSearch } })}
                id="web-search-toggle"
                className={`${useWebSearch ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900`}
            >
                <span className={`${useWebSearch ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
            </button>
        </div>

        <button type="submit" disabled={isLoading} className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200">
          {isLoading ? <><LoaderIcon /> Generating...</> : 'Generate Image'}
        </button>
      </form>
    </div>
  );
};

export default ImageGeneratorForm;