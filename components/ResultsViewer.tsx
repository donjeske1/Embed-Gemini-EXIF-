import React from 'react';
import { useAppContext } from '../state/AppContext';
import LoaderIcon from './ui/LoaderIcon';

interface ResultsViewerProps {
    onRefine: () => void;
}

const ResultsViewer: React.FC<ResultsViewerProps> = ({ onRefine }) => {
    const { state, dispatch } = useAppContext();
    const { generatedImages, selectedImageIndex, isLoading, isRefining, refinementPrompt, model } = state;

    const isImagen = model === 'imagen-4.0-generate-001';

    if (!generatedImages || generatedImages.length === 0) {
        return null;
    }

    const handleDownloadAll = () => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        generatedImages.forEach((imgSrc, index) => {
            const link = document.createElement('a');
            link.href = imgSrc;
            link.download = `generated-image-${timestamp}-${index + 1}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    };

    const selectedImageUrl = generatedImages[selectedImageIndex];

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
                    <button key={index} onClick={() => dispatch({ type: 'SET_SELECTED_IMAGE_INDEX', payload: index })} className={`rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-indigo-500 ${selectedImageIndex === index ? 'ring-2 ring-indigo-500' : 'ring-1 ring-slate-700 hover:ring-indigo-600'}`}>
                        <img src={imgSrc} alt={`Generated ${index + 1}`} className="w-full h-full object-cover aspect-square" />
                    </button>
                ))}
            </div>

            {selectedImageUrl && (
                <div className="space-y-4 pt-4">
                    <h3 className="text-lg font-semibold">Preview:</h3>
                    <img src={selectedImageUrl} alt="Selected generated image" className="rounded-xl shadow-lg max-w-full mx-auto" />
                    <a href={selectedImageUrl} download="generated-image-with-prompt.jpg" className="block w-full text-center bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200">
                        Download Selected Image with Metadata
                    </a>
                </div>
            )}

            {selectedImageUrl && !isImagen && (
                <div className="space-y-3 pt-4 border-t border-slate-800">
                    <h3 className="text-lg font-semibold text-teal-400">Conversational Refinement</h3>
                    <p className="text-sm text-slate-400">Describe a change to the selected image above.</p>
                    <textarea
                        value={refinementPrompt}
                        onChange={(e) => dispatch({ type: 'SET_FORM_FIELD', payload: { field: 'refinementPrompt', value: e.target.value } })}
                        placeholder="e.g., Make the jellyfish glow brighter, change the style to watercolor..."
                        className="w-full h-24 p-3 bg-slate-800/80 border border-slate-700 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-mono text-sm transition-colors duration-200"
                    />
                    <button
                        onClick={onRefine}
                        disabled={isLoading || isRefining || !refinementPrompt.trim()}
                        className="w-full flex justify-center items-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200"
                    >
                        {isRefining ? <><LoaderIcon /> Refining...</> : 'Refine Image'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default ResultsViewer;
