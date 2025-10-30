import React, { useState, useRef, useCallback } from 'react';
import { useAppContext } from '../state/AppContext';
import LoaderIcon from './ui/LoaderIcon';
import Tooltip from './ui/Tooltip';

interface PromptExtractorProps {
  onFileSelect: (file: File) => void;
  onDescribeImage: () => void;
}

const PromptExtractor: React.FC<PromptExtractorProps> = ({ onFileSelect, onDescribeImage }) => {
  const { state, dispatch } = useAppContext();
  const { 
    extractedMetadata, imagePreview, extractionMessage, isPromptValid, isDescribing
  } = state;

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File | null) => {
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png'];
    if (allowedTypes.includes(file.type)) {
      dispatch({ type: 'SET_ERROR', payload: null }); // Clear previous validation error
      onFileSelect(file);
    } else {
      dispatch({ type: 'SET_ERROR', payload: 'Invalid file type. Please upload a JPEG or PNG image.' });
    }
  }, [onFileSelect, dispatch]);

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-indigo-500 dark:text-indigo-400">Extract Metadata from Image</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Upload an image (JPEG/PNG) to check for an embedded generation prompt and other metadata.</p>
      </div>

      <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer p-4 rounded-lg border-2 border-dashed transition-colors duration-200 ${isDraggingOver ? 'border-indigo-500 bg-slate-200/50 dark:bg-slate-800/50' : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'}`}
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
            <div className="text-center text-slate-500 dark:text-slate-400 py-10">
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="mt-2 font-semibold">Drag & drop an image here</p>
                <p className="text-sm text-slate-500">or click to select a file</p>
            </div>
        )}
      </div>

      {extractionMessage && (
        <div className={`p-4 rounded-lg ${isPromptValid ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300' : 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300'}`}>
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
            <Tooltip tip="If no metadata is found, use AI to analyze the image and generate a descriptive prompt for you.">
                <button
                    type="button"
                    onClick={onDescribeImage}
                    disabled={isDescribing}
                    className="w-full flex justify-center items-center gap-2 bg-teal-700 hover:bg-teal-600 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                >
                    {isDescribing ? <><LoaderIcon /> Describing Image...</> : '🖼️ Describe Image with AI'}
                </button>
            </Tooltip>
            <p className="text-xs text-slate-500 mt-2 text-center">No metadata found. Let AI generate a prompt from the image.</p>
        </div>
       )}
    </div>
  );
};

export default PromptExtractor;