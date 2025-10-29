import React, { useState } from 'react';
import { useAppContext, HistoryItem } from '../state/AppContext';
import Tooltip from './ui/Tooltip';

interface GenerationHistoryProps {
  onSelectItem: (item: HistoryItem) => void;
}

const GenerationHistory: React.FC<GenerationHistoryProps> = ({ onSelectItem }) => {
    const { state } = useAppContext();
    const { generationHistory: history } = state;
    const [isOpen, setIsOpen] = useState(true);

    if (history.length === 0) return null;
    
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


    return (
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center text-left text-xl font-semibold text-indigo-500 dark:text-indigo-400 mb-4" aria-expanded={isOpen}>
                Generation History ({history.length})
                <svg className={`w-6 h-6 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            {isOpen && (
                <ul className="space-y-4">
                    {history.map((item) => (
                        <li key={item.id} className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-xl flex items-start gap-4">
                            <div className="relative flex-shrink-0">
                                <img src={item.images[0]} alt="History thumbnail" className="w-20 h-20 object-cover rounded-lg" />
                                {item.images.length > 1 && (
                                    <span className="absolute -top-2 -right-2 bg-indigo-600 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center ring-2 ring-white dark:ring-slate-800/50" aria-label={`${item.images.length} images`}>
                                        {item.images.length}
                                    </span>
                                )}
                            </div>
                            <div className="flex-grow overflow-hidden">
                                <p className="text-xs text-slate-600 dark:text-slate-400 font-mono whitespace-pre-wrap break-words line-clamp-3" title={item.metadata.prompt}>
                                    {item.metadata.originalPrompt && (
                                        <span className="block text-slate-500 text-[10px] italic" title={`Original: ${item.metadata.originalPrompt}`}>
                                            Grounded from: "{item.metadata.originalPrompt}"
                                        </span>
                                    )}
                                    {formatJsonDisplay(item.metadata.prompt)}
                                </p>
                                <div className="mt-3 flex items-center gap-3">
                                    <Tooltip tip="Load this generation's settings and results back into the main interface.">
                                        <button onClick={() => onSelectItem(item)} className="text-sm bg-indigo-700 hover:bg-indigo-600 text-white font-semibold py-1 px-3 rounded-md transition-colors duration-200">
                                            Use
                                        </button>
                                    </Tooltip>
                                    <Tooltip tip="Download the first image of this batch with its embedded metadata.">
                                        <a href={item.images[0]} download={`generated-image-${item.id}-0.jpg`} className="text-sm bg-slate-500 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold py-1 px-3 rounded-md transition-colors duration-200">
                                            Download
                                        </a>
                                    </Tooltip>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default GenerationHistory;
