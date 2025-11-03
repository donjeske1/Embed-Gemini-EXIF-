import React from 'react';
import { useAppContext } from '../state/AppContext';
import LoaderIcon from './ui/LoaderIcon';
import Tooltip from './ui/Tooltip';

interface ResultsViewerProps {
    onRefine: () => void;
    onUndo: () => void;
    onDownloadImage: (index: number) => void;
}

const ResultsViewer: React.FC<ResultsViewerProps> = ({ onRefine, onUndo, onDownloadImage }) => {
    const { state, dispatch } = useAppContext();
    const { generatedImages, generatedVideoUrl, selectedImageIndex, isLoading, loadingMessage, isRefining, refinementPrompt, model, refinementCreativeStrength, refinementStyle, activeHistoryId, activeBatchHistoryIds, generationHistory, undoState } = state;

    const historyIdToUse = activeBatchHistoryIds ? activeBatchHistoryIds[selectedImageIndex] : activeHistoryId;
    const activeHistoryItem = generationHistory.find(h => h.id === historyIdToUse);

    const isImagen = activeHistoryItem?.metadata.model === 'imagen-4.0-generate-001';

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-100/70 dark:bg-slate-900/70 rounded-xl min-h-[400px]">
                <LoaderIcon />
                <p className="mt-4 text-lg font-semibold text-slate-700 dark:text-slate-300">Generation in progress...</p>
                {loadingMessage && <p className="mt-2 text-slate-500 dark:text-slate-400">{loadingMessage}</p>}
            </div>
        );
    }
    
    if (!generatedImages && !generatedVideoUrl) {
        return null;
    }

    if (generatedVideoUrl) {
        return (
            <div className="space-y-4">
                 <h3 className="text-lg font-semibold">Generated Video:</h3>
                 <div className="bg-black rounded-xl overflow-hidden shadow-2xl">
                    <video src={generatedVideoUrl} controls autoPlay muted loop className="w-full max-h-[60vh]"/>
                 </div>
                 <a 
                    href={generatedVideoUrl} 
                    download="generated-video.mp4" 
                    className="block w-full text-center bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200"
                >
                    Download Video
                </a>
            </div>
        )
    }

    if (!generatedImages || generatedImages.length === 0) {
        return null;
    }

    const handleDownloadAll = () => {
        generatedImages.forEach((_, index) => {
            onDownloadImage(index);
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Generated Images:</h3>
                {generatedImages.length > 1 && (
                    <button onClick={handleDownloadAll} className="bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 text-sm flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        Download All ({generatedImages.length})
                    </button>
                )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {generatedImages.map((imgSrc, index) => (
                    <div key={index} className="relative group">
                         <button onClick={() => dispatch({ type: 'SET_SELECTED_IMAGE_INDEX', payload: index })} className={`w-full block rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 focus:ring-indigo-500 ${selectedImageIndex === index ? 'ring-2 ring-indigo-500' : 'ring-1 ring-slate-300 dark:ring-slate-700 hover:ring-indigo-500 dark:hover:ring-indigo-600'}`}>
                            <img src={imgSrc} alt={`Generated ${index + 1}`} className="w-full h-full object-cover aspect-square" />
                        </button>
                         <Tooltip tip="Download with metadata" position="top">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDownloadImage(index);
                                }}
                                className="absolute bottom-2 right-2 bg-black/60 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/80 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black/50 focus:ring-white"
                                aria-label={`Download image ${index + 1}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </Tooltip>
                    </div>
                ))}
            </div>

            {generatedImages[selectedImageIndex] && (
                <div className="space-y-4 pt-4">
                    <h3 className="text-lg font-semibold">Preview:</h3>
                    <img src={generatedImages[selectedImageIndex]} alt="Selected generated image" className="rounded-xl shadow-lg max-w-full mx-auto" />
                    <button onClick={() => onDownloadImage(selectedImageIndex)} className="block w-full text-center bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200">
                        Download Selected Image with Metadata
                    </button>
                </div>
            )}

            {generatedImages[selectedImageIndex] && (
                <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-teal-500 dark:text-teal-400">Conversational Refinement</h3>
                            <Tooltip position="right" tip="Edit the selected image by describing the changes you want to make. This uses the Nano Banana model.">
                                <span className="inline-flex items-center text-slate-400 dark:text-slate-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                    </svg>
                                </span>
                            </Tooltip>
                        </div>
                        {isImagen && (
                            <div className="p-3 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded-lg text-sm">
                                <p><strong>Note:</strong> Refining an Imagen result will use the <strong>Nano Banana</strong> model. The original high-quality image will be used as the reference.</p>
                            </div>
                        )}
                        <p className="text-sm text-slate-600 dark:text-slate-400">Describe a change to the selected image above.</p>
                        <textarea
                            value={refinementPrompt}
                            onChange={(e) => dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'refinementPrompt', value: e.target.value } })}
                            placeholder="e.g., Make the jellyfish glow brighter, change the style to watercolor..."
                            className="w-full h-24 p-3 bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-mono text-sm transition-colors duration-200"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Creative Strength
                                    <Tooltip position="top" tip="Controls how much the model adheres to the original image vs. the prompt. LOW sticks closer to the original image.">
                                        <span className="inline-flex items-center ml-1 text-slate-400 dark:text-slate-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                            </svg>
                                        </span>
                                    </Tooltip>
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['LOW', 'MEDIUM', 'HIGH'] as const).map(strength => (
                                        <button 
                                            key={strength} 
                                            type="button" 
                                            onClick={() => dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'refinementCreativeStrength', value: strength } })} 
                                            className={`py-2 text-xs rounded-lg transition-colors duration-200 ${refinementCreativeStrength === strength ? 'bg-teal-600 text-white ring-1 ring-teal-500' : 'bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'}`}
                                        >
                                            {strength}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label htmlFor="refinement-style" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Style Reference
                                </label>
                                <input
                                    id="refinement-style"
                                    type="text"
                                    value={refinementStyle}
                                    onChange={(e) => dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'refinementStyle', value: e.target.value } })}
                                    placeholder="e.g., photorealistic"
                                    className="w-full p-2 bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm transition-colors duration-200"
                                />
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <button
                                onClick={onRefine}
                                disabled={isLoading || isRefining || !refinementPrompt.trim()}
                                className="w-full flex justify-center items-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200 flex-grow"
                            >
                                {isRefining ? <><LoaderIcon /> Refining...</> : 'Apply Refinement'}
                            </button>
                            {undoState && undoState.selectedImageIndex === selectedImageIndex && (
                                <Tooltip tip="Revert the last refinement applied to this image." className="flex-shrink-0">
                                    <button
                                        onClick={onUndo}
                                        disabled={isLoading || isRefining}
                                        className="w-full sm:w-auto flex justify-center items-center gap-2 bg-slate-500 hover:bg-slate-600 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                                        aria-label="Undo last refinement"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
                                        Undo
                                    </button>
                                </Tooltip>
                            )}
                        </div>
                    </div>
                    <div className="relative flex py-2 items-center">
                        <div className="flex-grow border-t border-slate-300 dark:border-slate-700"></div>
                        <span className="flex-shrink mx-4 text-slate-400 dark:text-slate-500 text-sm">OR</span>
                        <div className="flex-grow border-t border-slate-300 dark:border-slate-700"></div>
                    </div>
                    <Tooltip tip="For precise edits, draw a mask over the area you want to change." className="w-full">
                        <button
                            onClick={() => dispatch({ type: 'OPEN_MASKING_MODAL' })}
                            disabled={isLoading || isRefining}
                            className="w-full flex justify-center items-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200"
                        >
                            🖌️ Refine with Mask
                        </button>
                    </Tooltip>
                </div>
            )}
        </div>
    );
};

export default ResultsViewer;