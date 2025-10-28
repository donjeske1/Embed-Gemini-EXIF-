import React from 'react';
import { useAppContext } from '../state/AppContext';

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

interface MetadataItemProps {
    label: string;
    value: string;
    isCode?: boolean;
    isMono?: boolean;
}

const MetadataItem: React.FC<MetadataItemProps> = ({ label, value, isCode = false, isMono = false }) => (
    <div>
        <h4 className="font-semibold text-sm text-slate-600 dark:text-slate-400 mb-1">{label}</h4>
        {isCode ? (
            <pre className="bg-slate-200/70 dark:bg-slate-900/70 p-3 rounded-lg text-slate-800 dark:text-slate-300 text-sm font-mono whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                <code>{value}</code>
            </pre>
        ) : (
            <p className={`text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words ${isMono ? 'font-mono' : ''}`}>{value}</p>
        )}
    </div>
);

interface MetadataViewerProps {
    onUsePrompt: () => void;
}

const MetadataViewer: React.FC<MetadataViewerProps> = ({ onUsePrompt }) => {
    const { state, dispatch } = useAppContext();
    const { imagePreview, extractedMetadata, isEditingPrompt, isPromptValid } = state;
    const displayPrompt = formatJsonDisplay(extractedMetadata?.prompt || null);

    if (!imagePreview) {
        return (
            <div className="h-full flex items-center justify-center text-center text-slate-500 bg-slate-100/70 dark:bg-slate-900/70 rounded-xl p-8 sticky top-8">
                <p>Upload an image on the left to view its preview and extracted metadata here.</p>
            </div>
        );
    }

    const handlePromptTextAreaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (!extractedMetadata) return;
        const newValue = e.target.value;
        const isJsonMode = extractedMetadata.model === 'gemini-2.5-flash-image' && extractedMetadata.promptMode === 'json';
        const newPrompt = isJsonMode ? `[${newValue}]` : newValue;
        dispatch({ type: 'SET_EXTRACTED_METADATA', payload: { ...extractedMetadata, prompt: newPrompt }});
    };

    const onToggleEdit = () => {
        if (isEditingPrompt) {
            dispatch({ type: 'VALIDATE_EDITED_PROMPT' });
        }
        dispatch({ type: 'SET_IS_EDITING_PROMPT', payload: !isEditingPrompt });
    };

    return (
        <div className="space-y-6 sticky top-8">
            <div className="bg-slate-100/70 dark:bg-slate-900/70 rounded-xl shadow-2xl p-1 backdrop-blur-lg">
                <div className="bg-white dark:bg-slate-900 rounded-lg p-6 sm:p-8 space-y-6">
                    <div>
                        <h2 className="text-xl font-semibold text-indigo-500 dark:text-indigo-400 mb-4">Image Preview</h2>
                        <img src={imagePreview} alt="Uploaded for metadata extraction" className="rounded-xl shadow-lg max-w-full mx-auto" />
                    </div>

                    {extractedMetadata && (
                        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                            <h3 className="text-xl font-semibold text-indigo-500 dark:text-indigo-400">Extracted Metadata</h3>
                            <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-lg space-y-4">
                                <MetadataItem label="Model" value={extractedMetadata.model} isMono />
                                {extractedMetadata.aspectRatio && <MetadataItem label="Aspect Ratio" value={extractedMetadata.aspectRatio} isMono />}
                                {extractedMetadata.originalPrompt && <MetadataItem label="Original Prompt" value={extractedMetadata.originalPrompt} isMono />}
                            </div>

                            <div className="space-y-2">
                                <h4 className="font-semibold text-sm text-slate-600 dark:text-slate-400">{extractedMetadata.originalPrompt ? "Grounded Prompt" : "Prompt"}</h4>
                                {isEditingPrompt ? (
                                    <textarea
                                        value={displayPrompt}
                                        onChange={handlePromptTextAreaChange}
                                        className={`w-full h-48 p-3 bg-white dark:bg-slate-900 border rounded-lg focus:ring-2 font-mono text-sm transition-colors duration-200 ${
                                            isPromptValid ? 'border-green-500/60 focus:ring-green-500 focus:border-green-500' : 'border-red-500/60 focus:ring-red-500 focus:border-red-500'
                                        }`}
                                        aria-label="Editable prompt text"
                                    />
                                ) : (
                                    <pre className={`bg-slate-100/80 dark:bg-slate-800/80 p-4 rounded-lg text-slate-800 dark:text-slate-300 text-sm overflow-x-auto border max-h-60 whitespace-pre-wrap break-words ${
                                        isPromptValid ? 'border-green-200 dark:border-green-700/40' : 'border-red-200 dark:border-red-700/40'
                                    }`}><code>{displayPrompt}</code></pre>
                                )}
                            </div>
                            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 pt-2">
                                <button onClick={onToggleEdit} className="flex-1 bg-slate-500 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">
                                  {isEditingPrompt ? 'Done Editing' : 'Edit Metadata'}
                                </button>
                                <button onClick={onUsePrompt} disabled={!isPromptValid} className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">
                                  Use this Metadata
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MetadataViewer;