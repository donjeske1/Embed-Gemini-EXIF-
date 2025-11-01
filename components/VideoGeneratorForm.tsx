import React, { useState } from 'react';
import { useAppContext } from '../state/AppContext';
import { VideoAspectRatio, VideoResolution } from '../types';
import LoaderIcon from './ui/LoaderIcon';
import Tooltip from './ui/Tooltip';

const resolutions: VideoResolution[] = ['720p', '1080p'];
const aspectRatios: VideoAspectRatio[] = ['16:9', '9:16'];

interface VideoGeneratorFormProps {
    onGenerate: (prompt: string, resolution: VideoResolution, aspectRatio: VideoAspectRatio) => void;
}

const VideoGeneratorForm: React.FC<VideoGeneratorFormProps> = ({ onGenerate }) => {
    const { state } = useAppContext();
    const { isLoading } = state;

    const [prompt, setPrompt] = useState('A cinematic shot of a futuristic city at sunset, with flying cars weaving through holographic advertisements.');
    const [resolution, setResolution] = useState<VideoResolution>('720p');
    const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('16:9');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onGenerate(prompt, resolution, aspectRatio);
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-semibold text-indigo-500 dark:text-indigo-400">Generate Video</h2>
                <p className="text-slate-600 dark:text-slate-400 mt-1">Use the Veo model to generate a short video from a text prompt.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="video-prompt" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Prompt
                    </label>
                    <textarea
                        id="video-prompt"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., A majestic eagle soaring over a snow-capped mountain range."
                        className="w-full h-32 p-3 bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm transition-colors duration-200"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Resolution</label>
                    <div className="grid grid-cols-2 gap-2">
                        {resolutions.map(res => (
                            <button key={res} type="button" onClick={() => setResolution(res)} className={`py-2 text-sm rounded-lg transition-colors duration-200 ${resolution === res ? 'bg-indigo-600 text-white ring-1 ring-indigo-500' : 'bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'}`}>
                                {res}
                            </button>
                        ))}
                    </div>
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Aspect Ratio</label>
                    <div className="grid grid-cols-2 gap-2">
                        {aspectRatios.map(ratio => (
                            <button key={ratio} type="button" onClick={() => setAspectRatio(ratio)} className={`py-2 text-sm font-mono rounded-lg transition-colors duration-200 ${aspectRatio === ratio ? 'bg-indigo-600 text-white ring-1 ring-indigo-500' : 'bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'}`}>
                                {ratio}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="pt-2">
                     <p className="text-xs text-center text-slate-500 dark:text-slate-400 mb-2">Note: Video generation can take several minutes to complete.</p>
                     <button type="submit" disabled={isLoading} className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200">
                        {isLoading ? <><LoaderIcon /> Generating Video...</> : 'Generate Video'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default VideoGeneratorForm;
