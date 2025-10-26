import React, { createContext, useReducer, Dispatch, useContext, ReactNode } from 'react';
import type { ImageModel, AspectRatio, View } from '../types';

// --- STATE SHAPE ---

// FIX: Define PromptMode to be used in the global state.
export type PromptMode = 'text' | 'json';

export interface GenerationMetadata {
  model: ImageModel;
  prompt: string;
  originalPrompt?: string;
  aspectRatio?: AspectRatio;
  // FIX: Add promptMode to metadata to persist it.
  promptMode?: PromptMode;
}

export interface HistoryItem {
  id: string;
  images: string[]; // base64 data URLs
  timestamp: number;
  metadata: GenerationMetadata;
}

export interface AppState {
  view: View;
  isLoading: boolean;
  isRefining: boolean;
  isDescribing: boolean;
  isFetchingExamples: boolean;
  error: string | null;

  // Generation Form State
  prompt: string;
  model: ImageModel;
  // FIX: Add promptMode to the global application state.
  promptMode: PromptMode;
  aspectRatio: AspectRatio;
  numberOfImages: number;
  referenceImages: string[]; // data URLs
  useWebSearch: boolean;
  examplePrompts: string[];
  
  // Results State
  generatedImages: string[] | null;
  selectedImageIndex: number;
  refinementPrompt: string;
  
  // History State
  generationHistory: HistoryItem[];
  activeHistoryId: string | null;
  activeBatchHistoryIds: string[] | null;

  // Extractor State
  extractedMetadata: GenerationMetadata | null;
  imagePreview: string | null;
  extractionMessage: string | null;
  isPromptValid: boolean;
  isEditingPrompt: boolean;
}

export const initialState: AppState = {
  view: 'generate',
  isLoading: false,
  isRefining: false,
  isDescribing: false,
  isFetchingExamples: true,
  error: null,
  prompt: "A majestic bioluminescent jellyfish floating in a dark, deep ocean, surrounded by sparkling plankton.",
  model: 'gemini-2.5-flash-image',
  // FIX: Initialize promptMode in the initial state.
  promptMode: 'text',
  aspectRatio: '1:1',
  numberOfImages: 1,
  referenceImages: [],
  useWebSearch: false,
  examplePrompts: [],
  generatedImages: null,
  selectedImageIndex: 0,
  refinementPrompt: '',
  generationHistory: [],
  activeHistoryId: null,
  activeBatchHistoryIds: null,
  extractedMetadata: null,
  imagePreview: null,
  extractionMessage: null,
  isPromptValid: false,
  isEditingPrompt: false,
};

// --- ACTIONS ---

export type Action =
  | { type: 'SET_VIEW'; payload: View }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_REFINING'; payload: boolean }
  | { type: 'SET_DESCRIBING'; payload: boolean }
  | { type: 'SET_FETCHING_EXAMPLES'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_FORM_FIELD'; payload: { field: keyof AppState; value: any } }
  | { type: 'START_GENERATION' }
  | { type: 'GENERATION_SUCCESS'; payload: { images: string[]; historyItem: HistoryItem } }
  | { type: 'BATCH_GENERATION_SUCCESS'; payload: { images: string[]; historyItems: HistoryItem[] } }
  | { type: 'REFINEMENT_SUCCESS'; payload: { newImage: string; newHistoryItem: HistoryItem } }
  | { type: 'SET_SELECTED_IMAGE_INDEX'; payload: number }
  | { type: 'SET_HISTORY_ITEM'; payload: HistoryItem }
  | { type: 'START_EXTRACTION' }
  | { type: 'EXTRACTION_RESULT'; payload: { dataUrl: string; metadata: GenerationMetadata | null; message: string; isValid: boolean } }
  | { type: 'DESCRIPTION_SUCCESS'; payload: { metadata: GenerationMetadata; message: string } }
  | { type: 'SET_EXTRACTED_METADATA'; payload: GenerationMetadata | null }
  | { type: 'SET_IS_EDITING_PROMPT'; payload: boolean }
  | { type: 'VALIDATE_EDITED_PROMPT' }
  | { type: 'SET_EXAMPLE_PROMPTS'; payload: { prompts: string[]; error?: string } };


// --- REDUCER ---

const appReducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, view: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_REFINING':
        return { ...state, isRefining: action.payload };
    case 'SET_DESCRIBING':
        return { ...state, isDescribing: action.payload };
    case 'SET_FETCHING_EXAMPLES':
        return { ...state, isFetchingExamples: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_FORM_FIELD':
      return { ...state, [action.payload.field]: action.payload.value };
    case 'START_GENERATION':
        return { ...state, isLoading: true, error: null, generatedImages: null, refinementPrompt: '', activeBatchHistoryIds: null };
    case 'GENERATION_SUCCESS':
        return {
            ...state,
            isLoading: false,
            generatedImages: action.payload.images,
            generationHistory: [action.payload.historyItem, ...state.generationHistory],
            activeHistoryId: action.payload.historyItem.id,
            referenceImages: [],
            useWebSearch: false,
            selectedImageIndex: 0,
        };
    case 'BATCH_GENERATION_SUCCESS':
        return {
            ...state,
            isLoading: false,
            generatedImages: action.payload.images,
            generationHistory: [...action.payload.historyItems, ...state.generationHistory],
            activeBatchHistoryIds: action.payload.historyItems.map(item => item.id),
            activeHistoryId: null,
            referenceImages: [],
            useWebSearch: false,
            selectedImageIndex: 0,
        };
    case 'REFINEMENT_SUCCESS': {
        const { newImage, newHistoryItem } = action.payload;
        const historyIdToUpdate = state.activeBatchHistoryIds
            ? state.activeBatchHistoryIds[state.selectedImageIndex]
            : state.activeHistoryId;
            
        return {
            ...state,
            isRefining: false,
            generatedImages: state.generatedImages ? state.generatedImages.map((img, index) => index === state.selectedImageIndex ? newImage : img) : [newImage],
            generationHistory: state.generationHistory.map(item => item.id === historyIdToUpdate ? { ...newHistoryItem, id: historyIdToUpdate } : item),
            refinementPrompt: '',
        };
    }
    case 'SET_SELECTED_IMAGE_INDEX':
        return { ...state, selectedImageIndex: action.payload };
    case 'SET_HISTORY_ITEM': {
        const { metadata, images } = action.payload;
        return {
            ...state,
            model: metadata.model,
            aspectRatio: metadata.aspectRatio || '1:1',
            prompt: metadata.prompt,
            // FIX: Correctly set promptMode from metadata, with a safe fallback to 'text'.
            promptMode: metadata.promptMode || 'text',
            generatedImages: images,
            activeHistoryId: action.payload.id,
            activeBatchHistoryIds: null,
            numberOfImages: images.length,
            referenceImages: [],
            error: null,
            refinementPrompt: '',
        };
    }
    case 'START_EXTRACTION':
        return { ...state, imagePreview: null, extractedMetadata: null, isPromptValid: false, isEditingPrompt: false, extractionMessage: 'Processing image...' };
    case 'EXTRACTION_RESULT':
        return { ...state, imagePreview: action.payload.dataUrl, extractedMetadata: action.payload.metadata, extractionMessage: action.payload.message, isPromptValid: action.payload.isValid };
    case 'DESCRIPTION_SUCCESS':
        return { ...state, extractedMetadata: action.payload.metadata, isPromptValid: true, extractionMessage: action.payload.message, isEditingPrompt: true };
    case 'SET_EXTRACTED_METADATA':
        return { ...state, extractedMetadata: action.payload };
    case 'SET_IS_EDITING_PROMPT':
        return { ...state, isEditingPrompt: action.payload };
    case 'VALIDATE_EDITED_PROMPT': {
        if (!state.extractedMetadata) return state;
        let isValid = false;
        try {
            if (state.extractedMetadata.model === 'gemini-2.5-flash-image') {
                JSON.parse(state.extractedMetadata.prompt);
            }
            isValid = true;
        } catch { isValid = false; }
        return { ...state, isPromptValid: isValid, extractionMessage: isValid ? "The edited prompt is valid." : "The edited prompt is not valid JSON." };
    }
    case 'SET_EXAMPLE_PROMPTS': {
        const { prompts, error } = action.payload;
        return {
            ...state,
            examplePrompts: prompts,
            isFetchingExamples: false,
            error: error ? (state.error ? `${state.error}\n${error}` : error) : state.error,
        };
    }
    default:
      return state;
  }
};


// --- CONTEXT & PROVIDER ---

interface AppContextType {
  state: AppState;
  dispatch: Dispatch<Action>;
}

export const AppContext = createContext<AppContextType>({
  state: initialState,
  dispatch: () => null,
});

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);