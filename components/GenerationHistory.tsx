import React, { useState, useMemo } from 'react';
import { useAppContext, HistoryItem } from '../state/AppContext';
import Tooltip from './ui/Tooltip';

interface GenerationHistoryProps {
  onSelectItem: (item: HistoryItem) => void;
}

const GenerationHistory: React.FC<GenerationHistoryProps> = ({ onSelectItem }) => {
    const { state, dispatch } = useAppContext();
    const { generationHistory: history } = state;
    const [isOpen, setIsOpen] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    if (history.length === 0) return null;
    
    const handleClearHistory = () => {
        if (window.confirm('Are you sure you want to clear all generation history? This action cannot be undone.')) {
            dispatch({ type: 'CLEAR_HISTORY' });
        }
    };

    const filteredHistory = useMemo(() => {
        if (!searchQuery.trim()) {
            return history;
        }
        return history.filter(item => {
            const query = searchQuery.toLowerCase();
            const prompt = item.metadata.prompt.toLowerCase();
            const originalPrompt = item.metadata.originalPrompt?.toLowerCase() || '';
            
            const model = item.metadata.model;
            const modelName = model.includes('imagen') ? 'imagen' : 'nano banana';
            
            return prompt.includes(query) || originalPrompt.includes(query) || modelName.includes(query);
        });
    }, [history, searchQuery]);

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
                <div className="space-y-4 animate-fade-in">
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-grow">
                             <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <svg className="w-5 h-5 text-slate-400 dark:text-slate-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"></path></svg>
                            </span>
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by prompt or model (e.g., 'cat', 'imagen')..."
                                className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-colors duration-200"
                            />
                        </div>
                        <Tooltip tip="Permanently delete all history items.">
                            <button onClick={handleClearHistory} className="flex-shrink-0 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 text-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                Clear All
                            </button>
                        </Tooltip>
                    </div>

                    {filteredHistory.length > 0 ? (
                        <ul className="space-y-4">
                            {filteredHistory.map((item) => {
                                const downloadFilename = `${item.metadata.filenameSlug || `generated-image-${item.id}`}.jpg`;
                                const modelDisplayName = item.metadata.model === 'imagen-4.0-generate-001' ? 'Imagen' : 'Nano Banana';
                                const isImagen = modelDisplayName === 'Imagen';
                                return (
                                    <li key={item.id} className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-xl flex items-start gap-4">
                                        <div className="relative flex-shrink-0">
                                            <img src={item.images[0]} alt="History thumbnail" className="w-20 h-20 object-cover rounded-lg" />
                                            {item.images.length > 1 && (
                                                <span className="absolute -top-2 -right-2 bg-indigo-600 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center ring-2 ring-white dark:ring-slate-800/50" aria-label={`${item.images.length} images`}>
                                                    {item.images.length}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex-grow min-w-0">
                                            <span className={`inline-block mb-1 px-2 py-0.5 text-xs font-semibold rounded-full ${isImagen ? 'bg-sky-200 text-sky-800 dark:bg-sky-900 dark:text-sky-300' : 'bg-violet-200 text-violet-800 dark:bg-violet-900 dark:text-violet-300'}`}>
                                                {modelDisplayName}
                                            </span>
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
                                                    <a href={item.images[0]} download={downloadFilename} className="text-sm bg-slate-500 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold py-1 px-3 rounded-md transition-colors duration-200">
                                                        Download
                                                    </a>
                                                </Tooltip>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <div className="text-center py-10 text-slate-500 dark:text-slate-400">
                            <p>No history items match your search.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default GenerationHistory;