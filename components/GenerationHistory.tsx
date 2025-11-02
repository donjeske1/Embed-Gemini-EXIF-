import React, { useState, useMemo } from 'react';
import { useAppContext, HistoryItem } from '../state/AppContext';
import Tooltip from './ui/Tooltip';

interface GenerationHistoryProps {
  onSelectItem: (item: HistoryItem) => void;
}

const FavoriteStar: React.FC<{ isFavorite: boolean }> = ({ isFavorite }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={isFavorite ? 0 : 1.5}>
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
);

const groupHistoryByDate = (history: HistoryItem[]) => {
    const groups: { [key: string]: HistoryItem[] } = {
        'Today': [],
        'Yesterday': [],
        'Previous 7 Days': [],
        'Older': []
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(new Date().setDate(today.getDate() - 1));
    yesterday.setHours(0,0,0,0);
    const sevenDaysAgo = new Date(new Date().setDate(today.getDate() - 7));
    sevenDaysAgo.setHours(0,0,0,0);

    history.forEach(item => {
        const itemDate = new Date(item.timestamp);

        if (itemDate >= today) {
            groups['Today'].push(item);
        } else if (itemDate >= yesterday) {
            groups['Yesterday'].push(item);
        } else if (itemDate >= sevenDaysAgo) {
            groups['Previous 7 Days'].push(item);
        } else {
            groups['Older'].push(item);
        }
    });

    return groups;
};


const GenerationHistory: React.FC<GenerationHistoryProps> = ({ onSelectItem }) => {
    const { state, dispatch } = useAppContext();
    const { generationHistory: history } = state;
    
    const [isOpen, setIsOpen] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
    const [showFavorites, setShowFavorites] = useState(false);

    if (history.length === 0) return null;
    
    const handleClearHistory = () => {
        if (window.confirm('Are you sure you want to clear all generation history? This action cannot be undone.')) {
            dispatch({ type: 'CLEAR_HISTORY' });
        }
    };
    
    const handleDragStart = (e: React.DragEvent, imageSrc: string) => {
        e.dataTransfer.setData('text/plain', imageSrc);
        e.dataTransfer.effectAllowed = 'copy';
    };

    const filteredHistory = useMemo(() => {
        return history.filter(item => {
            if (showFavorites && !item.isFavorite) {
                return false;
            }
            if (!searchQuery.trim()) {
                return true;
            }
            const query = searchQuery.toLowerCase();
            const prompt = item.metadata.prompt.toLowerCase();
            const originalPrompt = item.metadata.originalPrompt?.toLowerCase() || '';
            const modelName = item.metadata.model.includes('imagen') ? 'imagen' : 'nano banana';
            return prompt.includes(query) || originalPrompt.includes(query) || modelName.includes(query);
        });
    }, [history, searchQuery, showFavorites]);

    const groupedAndFilteredHistory = useMemo(() => {
        return groupHistoryByDate(filteredHistory);
    }, [filteredHistory]);

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
    
    const renderItem = (item: HistoryItem) => {
        const downloadFilename = `${item.metadata.filenameSlug || `generated-image-${item.id}`}.jpg`;
        const modelDisplayName = item.metadata.model === 'imagen-4.0-generate-001' ? 'Imagen' : 'Nano Banana';
        const isImagen = modelDisplayName === 'Imagen';

        if (viewMode === 'grid') {
            return (
                <li key={item.id} className="relative group aspect-square">
                    <img 
                        src={item.images[0]} 
                        alt="History thumbnail" 
                        className="w-full h-full object-cover rounded-xl cursor-pointer transition-transform duration-300 group-hover:scale-105" 
                        onClick={() => onSelectItem(item)}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.images[0])}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none">
                        <div className="absolute bottom-0 left-0 p-2 text-white w-full">
                            <p className="text-xs font-mono whitespace-pre-wrap break-words line-clamp-2" title={item.metadata.prompt}>
                                {item.metadata.prompt.split('---')[0].trim()}
                            </p>
                        </div>
                    </div>
                     {item.images.length > 1 && (
                        <span className="absolute top-2 right-2 bg-indigo-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center ring-2 ring-white dark:ring-slate-800" aria-label={`${item.images.length} images`}>
                            {item.images.length}
                        </span>
                    )}
                    <Tooltip tip={item.isFavorite ? "Remove from Favorites" : "Add to Favorites"} position="top">
                        <button onClick={() => dispatch({type: 'TOGGLE_FAVORITE', payload: item.id})} className={`absolute top-2 left-2 p-1.5 rounded-full transition-colors text-yellow-400 bg-black/40 hover:bg-black/60`}>
                            <FavoriteStar isFavorite={item.isFavorite ?? false} />
                        </button>
                    </Tooltip>
                </li>
            )
        }
        
        // List View
        return (
            <li key={item.id} className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-xl flex items-start gap-4">
                <div 
                    className="relative flex-shrink-0 group cursor-pointer"
                    onClick={() => onSelectItem(item)}
                >
                    <img 
                        src={item.images[0]} 
                        alt="History thumbnail" 
                        className="w-20 h-20 object-cover rounded-lg" 
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.images[0])}
                    />
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
                <Tooltip tip={item.isFavorite ? "Remove from Favorites" : "Add to Favorites"}>
                    <button onClick={() => dispatch({type: 'TOGGLE_FAVORITE', payload: item.id})} className={`p-2 rounded-full transition-colors text-yellow-500 hover:bg-slate-200 dark:hover:bg-slate-700`}>
                        <FavoriteStar isFavorite={item.isFavorite ?? false} />
                    </button>
                </Tooltip>
            </li>
        );
    };

    return (
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center text-left text-xl font-semibold text-indigo-500 dark:text-indigo-400 mb-4" aria-expanded={isOpen}>
                Generation History ({history.length})
                <svg className={`w-6 h-6 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            {isOpen && (
                <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="relative">
                             <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <svg className="w-5 h-5 text-slate-400 dark:text-slate-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"></path></svg>
                            </span>
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by prompt or model..."
                                className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-colors duration-200"
                            />
                        </div>
                        <div className="flex gap-2 items-center justify-between md:justify-end">
                            <div className="flex rounded-lg shadow-sm bg-slate-100 dark:bg-slate-800/80 p-1">
                                <Tooltip tip="Grid View"><button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 text-indigo-600' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg></button></Tooltip>
                                <Tooltip tip="List View"><button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-indigo-600' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg></button></Tooltip>
                            </div>
                            <Tooltip tip={showFavorites ? "Show All" : "Show Favorites"}><button onClick={() => setShowFavorites(!showFavorites)} className={`p-2 rounded-lg shadow-sm transition-colors ${showFavorites ? 'bg-yellow-400 text-yellow-900' : 'bg-slate-100 dark:bg-slate-800/80 text-slate-500'}`}><FavoriteStar isFavorite={showFavorites} /></button></Tooltip>
                            <Tooltip tip="Permanently delete all history items."><button onClick={handleClearHistory} className="p-2 rounded-lg shadow-sm bg-red-600 hover:bg-red-700 text-white"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg></button></Tooltip>
                        </div>
                    </div>
                    
                    {Object.entries(groupedAndFilteredHistory).map(([groupName, items]) => {
                        // FIX: Add type guard to ensure `items` is an array before accessing its properties.
                        if (!Array.isArray(items) || items.length === 0) return null;
                        return (
                            <div key={groupName} className="pt-4">
                                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3 border-b border-slate-200 dark:border-slate-700 pb-2">{groupName}</h3>
                                <ul className={viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" : "space-y-4"}>
                                    {items.map(renderItem)}
                                </ul>
                            </div>
                        )
                    })}
                    
                    {filteredHistory.length === 0 && (
                        <div className="text-center py-10 text-slate-500 dark:text-slate-400">
                            <p>No history items match your filters.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default GenerationHistory;