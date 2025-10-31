import React from 'react';
import { useAppContext } from '../state/AppContext';
import LoaderIcon from './ui/LoaderIcon';
import Tooltip from './ui/Tooltip';

interface ResultsViewerProps {
    onRefine: () => void;
}

const ResultsViewer: React.FC<ResultsViewerProps> = ({ onRefine }) => {
    const { state, dispatch } = useAppContext();
    const { generatedImages, selectedImageIndex, isLoading, isRefining, refinementPrompt, model, generationHistory, activeHistoryId, activeBatchHistoryIds } = state;

    const isImagen = model === 'imagen-4.0-generate-001';

    if (!generatedImages || generatedImages.length === 0) {
        return null;
    }

    const getActiveHistoryItem = (index: number) => {
        const historyId = activeBatchHistoryIds ? activeBatchHistoryIds[index] : activeHistoryId;
        return generationHistory.find(h => h.id === historyId);
    };

    const handleDownloadAll = () => {
        generatedImages.forEach((imgSrc, index) => {
            const activeItem = getActiveHistoryItem(index);
            const filename = activeItem?.metadata.filenameSlug || `generated-image-${activeItem?.id || index}`;
            const link = document.createElement('a');
            link.href = imgSrc;
            link.download = `${filename}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    };

    const selectedImageUrl = generatedImages[selectedImageIndex];
    const selectedHistoryItem = getActiveHistoryItem(selectedImageIndex);
    const selectedImageFilename = `${selectedHistoryItem?.metadata.filenameSlug || 'generated-image-with-prompt'}.jpg`;

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
                {generatedImages.map((imgSrc, index) => {
                    const activeItem = getActiveHistoryItem(index);
                    const filename = `${activeItem?.metadata.filenameSlug || `generated-image-${activeItem?.id || index}`}.jpg`;
                    return (
                        <div key={index} className="relative group">
                             <button onClick={() => dispatch({ type: 'SET_SELECTED_IMAGE_INDEX', payload: index })} className={`w-full block rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 focus:ring-indigo-500 ${selectedImageIndex === index ? 'ring-2 ring-indigo-500' : 'ring-1 ring-slate-300 dark:ring-slate-700 hover:ring-indigo-500 dark:hover:ring-indigo-600'}`}>
                                <img src={imgSrc} alt={`Generated ${index + 1}`} className="w-full h-full object-cover aspect-square" />
                            </button>
                             <Tooltip tip="Download with metadata" position="top">
                                <a
                                    href={imgSrc}
                                    download={filename}
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute bottom-2 right-2 bg-black/60 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/80 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black/50 focus:ring-white"
                                    aria-label={`Download image ${index + 1}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </a>
                            </Tooltip>
                        </div>
                    );
                })}
            </div>

            {selectedImageUrl && (
                <div className="space-y-4 pt-4">
                    <h3 className="text-lg font-semibold">Preview:</h3>
                    <img src={selectedImageUrl} alt="Selected generated image" className="rounded-xl shadow-lg max-w-full mx-auto" />
                    <a href={selectedImageUrl} download={selectedImageFilename} className="block w-full text-center bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200">
                        Download Selected Image with Metadata
                    </a>
                </div>
            )}

            {selectedImageUrl && !isImagen && (
                <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-teal-500 dark:text-teal-400">Conversational Refinement</h3>
                        <Tooltip position="right" tip="Edit the selected image by describing the changes you want to make. This feature is only available for the Nano Banana model.">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400 dark:text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                               <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                           </svg>
                        </Tooltip>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Describe a change to the selected image above.</p>
                    <textarea
                        value={refinementPrompt}
                        onChange={(e) => dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'refinementPrompt', value: e.target.value } })}
                        placeholder="e.g., Make the jellyfish glow brighter, change the style to watercolor..."
                        className="w-full h-24 p-3 bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-mono text-sm transition-colors duration-200"
                    />
                    <button
                        onClick={onRefine}
                        disabled={isLoading || isRefining || !refinementPrompt.trim()}
                        className="w-full flex justify-center items-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200"
                    >
                        {isRefining ? <><LoaderIcon /> Refining...</> : 'Refine Image'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default ResultsViewer;