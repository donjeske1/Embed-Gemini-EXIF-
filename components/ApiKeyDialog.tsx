import React from 'react';

interface ApiKeyDialogProps {
    isOpen: boolean;
    onKeySelected: () => void;
}

const ApiKeyDialog: React.FC<ApiKeyDialogProps> = ({ isOpen, onKeySelected }) => {
    if (!isOpen) {
        return null;
    }

    const handleSelectKey = async () => {
        if (window.aistudio) {
            await window.aistudio.openSelectKey();
            // Assume selection is successful and let the parent component handle re-checking.
            onKeySelected();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-md w-full p-6 sm:p-8 text-center space-y-4 transform transition-all animate-fade-in">
                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 dark:bg-indigo-900/50 sm:mx-0 sm:h-10 sm:w-10">
                    <svg className="h-6 w-6 text-indigo-600 dark:text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                    </svg>
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">API Key Required</h3>
                <p className="text-slate-600 dark:text-slate-400">
                    Video generation with the Veo model requires selecting an API key. This is a mandatory step.
                    Please select your API key to continue.
                </p>
                <p className="text-xs text-slate-500">
                    For information about billing, please visit{' '}
                    <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">
                        ai.google.dev/gemini-api/docs/billing
                    </a>.
                </p>
                <button
                    onClick={handleSelectKey}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200"
                >
                    Select API Key
                </button>
            </div>
        </div>
    );
};

export default ApiKeyDialog;
