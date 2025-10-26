import React from 'react';
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
