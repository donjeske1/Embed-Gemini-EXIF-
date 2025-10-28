import React, { useState, useRef, useCallback } from 'react';
import { useAppContext, GenerationMetadata } from '../state/AppContext';
import LoaderIcon from './ui/LoaderIcon';

interface PromptExtractorProps {
  onFileSelect: (file: File) => void;
  onUsePrompt: () => void;
  onDescribeImage: () => void;
}

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

const PromptExtractor: React.FC<PromptExtractorProps> = ({ onFileSelect, onUsePrompt, onDescribeImage }) => {
  const { state, dispatch } = useAppContext();
  const { 
    extractedMetadata, imagePreview, extractionMessage, isPromptValid, isEditingPrompt, isDescribing
  } = state;

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File | null) => {
    if (file && file.type.match('image.*')) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
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
          processFile(e.dataTransfer.files[0]);
          e.dataTransfer.clearData();
      }
  }, [processFile]);

  const displayPrompt = formatJsonDisplay(extractedMetadata?.prompt || null);

  const handlePromptTextAreaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!extractedMetadata) return;
      const newValue = e.target.value;
      const isNanoBanana = extractedMetadata.model === 'gemini-2.5-flash-image';
      const newPrompt = isNanoBanana ? `[${newValue}]` : newValue;
      dispatch({ type: 'SET_EXTRACTED_METADATA', payload: { ...extractedMetadata, prompt: newPrompt }});
  };

  const onToggleEdit = () => {
    if (isEditingPrompt) {
        dispatch({ type: 'VALIDATE_EDITED_PROMPT' });
    }
    dispatch({ type: 'SET_IS_EDITING_PROMPT', payload: !isEditingPrompt });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-indigo-400">Extract Metadata from Image</h2>
        <p className="text-slate-400 mt-1">Upload an image (JPEG/PNG) to check for an embedded generation prompt and other metadata.</p>
      </div>

      <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer p-4 rounded-lg border-2 border-dashed transition-colors duration-200 ${isDraggingOver ? 'border-indigo-500 bg-slate-800/50' : 'border-slate-700 hover:border-slate-500'}`}
          aria-label="Image upload area"
      >
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" onChange={handleFileChange} className="hidden" />
        
        {imagePreview ? (
            <div className="relative group">
                <img src={imagePreview} alt="Uploaded preview" className="rounded-lg shadow-lg max-w-full mx-auto max-h-64 object-contain" />
                <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <p className="text-white font-semibold text-center px-2">Click or drop a new image to replace</p>
                </div>
            </div>
        ) : (
            <div className="text-center text-slate-400 py-10">
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="mt-2 font-semibold">Drag & drop an image here</p>
                <p className="text-sm text-slate-500">or click to select a file</p>
            </div>
        )}
      </div>

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
            {isEditingPrompt ? (
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
                  {isEditingPrompt ? 'Done Editing' : 'Edit Metadata'}
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

export default PromptExtractor;