import React, { createContext, useReducer, Dispatch, useContext, ReactNode, useEffect } from 'react';
import type { CreativeStrength, ImageModel, AspectRatio, View } from '../types';

// --- STATE SHAPE ---

export type PromptMode = 'text' | 'json';
export type MobileView = 'form' | 'results';

export interface GenerationMetadata {
  model: ImageModel;
  prompt: string;
  originalPrompt?: string;
  aspectRatio?: AspectRatio;
  promptMode?: PromptMode;
  filenameSlug?: string;
}

export interface HistoryItem {
  id: string;
  images: string[]; // base64 data URLs
  timestamp: number;
  metadata: GenerationMetadata;
}

export interface AppState {
  view: View;
  mobileView: MobileView;
  isLoading: boolean;
  loadingMessage: string | null;
  isNightMode: boolean;
  isRefining: boolean;
  isDescribing: boolean;
  isFetchingExamples: boolean;
  error: string | null;

  // Generation Form State
  prompt: string;
  model: ImageModel;
  promptMode: PromptMode;
  aspectRatio: AspectRatio;
  numberOfImages: number;
  referenceImages: string[]; // data URLs
  useWebSearch: boolean;
  examplePrompts: string[];
  
  // Results State
  generatedImages: string[] | null;
  generatedVideoUrl: string | null;
  selectedImageIndex: number;
  refinementPrompt: string;
  refinementCreativeStrength: CreativeStrength;
  refinementStyle: string;
  
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
  mobileView: 'form',
  isLoading: false,
  loadingMessage: null,
  isNightMode: true,
  isRefining: false,
  isDescribing: false,
  isFetchingExamples: true,
  error: null,
  prompt: "A majestic bioluminescent jellyfish floating in a dark, deep ocean, surrounded by sparkling plankton.",
  model: 'gemini-2.5-flash-image',
  promptMode: 'text',
  aspectRatio: '1:1',
  numberOfImages: 1,
  referenceImages: [],
  useWebSearch: false,
  examplePrompts: [],
  generatedImages: null,
  generatedVideoUrl: null,
  selectedImageIndex: 0,
  refinementPrompt: '',
  refinementCreativeStrength: 'MEDIUM',
  refinementStyle: '',
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
  | { type: 'SET_MOBILE_VIEW'; payload: MobileView }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_LOADING_MESSAGE', payload: string | null }
  | { type: 'SET_REFINING'; payload: boolean }
  | { type: 'SET_DESCRIBING'; payload: boolean }
  | { type: 'SET_FETCHING_EXAMPLES'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_FORM_FIELD'; payload: { field: keyof AppState; value: any } }
  | { type: 'START_GENERATION' }
  | { type: 'GENERATION_SUCCESS'; payload: { images: string[]; historyItem: HistoryItem } }
  | { type: 'BATCH_GENERATION_SUCCESS'; payload: { images: string[]; historyItems: HistoryItem[] } }
  | { type: 'VIDEO_GENERATION_SUCCESS', payload: string }
  | { type: 'REFINEMENT_SUCCESS'; payload: { newImage: string; newHistoryItem: HistoryItem } }
  | { type: 'SET_SELECTED_IMAGE_INDEX'; payload: number }
  | { type: 'SET_HISTORY_ITEM'; payload: HistoryItem }
  | { type: 'START_EXTRACTION' }
  | { type: 'EXTRACTION_RESULT'; payload: { dataUrl: string; metadata: GenerationMetadata | null; message: string; isValid: boolean } }
  | { type: 'DESCRIPTION_SUCCESS'; payload: { metadata: GenerationMetadata; message: string } }
  | { type: 'SET_EXTRACTED_METADATA'; payload: GenerationMetadata | null }
  | { type: 'SET_IS_EDITING_PROMPT'; payload: boolean }
  | { type: 'VALIDATE_EDITED_PROMPT' }
  | { type: 'TOGGLE_NIGHT_MODE' }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'SET_EXAMPLE_PROMPTS'; payload: { prompts: string[]; error?: string } };


// --- REDUCER ---

const appReducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, view: action.payload, mobileView: 'form', error: null, generatedImages: null, generatedVideoUrl: null };
    case 'SET_MOBILE_VIEW':
      return { ...state, mobileView: action.payload };
    case 'TOGGLE_NIGHT_MODE':
      return { ...state, isNightMode: !state.isNightMode };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_LOADING_MESSAGE':
        return { ...state, loadingMessage: action.payload };
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
        return { ...state, isLoading: true, error: null, generatedImages: null, generatedVideoUrl: null, refinementPrompt: '', activeBatchHistoryIds: null, loadingMessage: null };
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
            mobileView: 'results',
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
            mobileView: 'results',
        };
     case 'VIDEO_GENERATION_SUCCESS':
        return {
            ...state,
            isLoading: false,
            generatedVideoUrl: action.payload,
            loadingMessage: null,
            mobileView: 'results',
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
            refinementStyle: '',
            refinementCreativeStrength: 'MEDIUM',
        };
    }
    case 'SET_SELECTED_IMAGE_INDEX':
        return { ...state, selectedImageIndex: action.payload };
    case 'SET_HISTORY_ITEM': {
        const { metadata, images } = action.payload;
        return {
            ...state,
            view: 'generate',
            model: metadata.model,
            aspectRatio: metadata.aspectRatio || '1:1',
            prompt: metadata.prompt,
            promptMode: metadata.promptMode || 'text',
            generatedImages: images,
            generatedVideoUrl: null,
            activeHistoryId: action.payload.id,
            activeBatchHistoryIds: null,
            numberOfImages: images.length,
            referenceImages: [],
            error: null,
            refinementPrompt: '',
            mobileView: 'results',
        };
    }
    case 'START_EXTRACTION':
        return { ...state, imagePreview: null, extractedMetadata: null, isPromptValid: false, isEditingPrompt: false, extractionMessage: 'Processing image...' };
    case 'EXTRACTION_RESULT':
        return { ...state, imagePreview: action.payload.dataUrl, extractedMetadata: action.payload.metadata, extractionMessage: action.payload.message, isPromptValid: action.payload.isValid };
    case 'DESCRIPTION_SUCCESS':
        return { ...state, extractedMetadata: action.payload.metadata, isPromptValid: true, extractionMessage: action.payload.message, isEditingPrompt: false };
    case 'SET_EXTRACTED_METADATA':
        return { ...state, extractedMetadata: action.payload };
    case 'SET_IS_EDITING_PROMPT':
        return { ...state, isEditingPrompt: action.payload };
    case 'CLEAR_HISTORY':
        return {
            ...state,
            generationHistory: [],
            generatedImages: null,
            activeHistoryId: null,
            activeBatchHistoryIds: null,
            selectedImageIndex: 0,
        };
    case 'VALIDATE_EDITED_PROMPT': {
        if (!state.extractedMetadata) return state;
        let isValid = false;
        let message = '';
        const { model, prompt, promptMode } = state.extractedMetadata;

        if (model === 'gemini-2.5-flash-image' && promptMode === 'json') {
            try {
                JSON.parse(prompt);
                isValid = true;
                message = "The edited JSON prompt is valid.";
            } catch (e) {
                isValid = false;
                message = "The edited prompt is not valid JSON.";
            }
        } else {
            // For all text prompts
            isValid = prompt.trim().length > 0;
            message = isValid ? "The edited prompt is valid." : "Prompt cannot be empty.";
        }
        
        return { ...state, isPromptValid: isValid, extractionMessage: message };
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

// --- LOCAL STORAGE UTILS ---
const LOCALSTORAGE_KEY = 'gemini-exif-app-state';

// Define the shape of the state we want to persist
type PersistedState = Pick<
  AppState,
  | 'isNightMode'
  | 'prompt'
  | 'model'
  | 'promptMode'
  | 'aspectRatio'
  | 'numberOfImages'
  | 'useWebSearch'
  | 'generationHistory'
>;

const saveStateToLocalStorage = (state: AppState) => {
  try {
    const stateToPersist: PersistedState = {
        isNightMode: state.isNightMode,
        prompt: state.prompt,
        model: state.model,
        promptMode: state.promptMode,
        aspectRatio: state.aspectRatio,
        numberOfImages: state.numberOfImages,
        useWebSearch: state.useWebSearch,
        generationHistory: state.generationHistory,
    };
    const serializedState = JSON.stringify(stateToPersist);
    localStorage.setItem(LOCALSTORAGE_KEY, serializedState);
  } catch (error) {
    console.warn('Could not save state to localStorage', error);
  }
};

const loadStateFromLocalStorage = (): Partial<AppState> | undefined => {
  try {
    const serializedState = localStorage.getItem(LOCALSTORAGE_KEY);
    if (serializedState === null) {
      return undefined;
    }
    // Don't persist results across reloads
    const parsed = JSON.parse(serializedState);
    delete parsed.generatedImages;
    delete parsed.generatedVideoUrl;
    delete parsed.activeHistoryId;
    delete parsed.activeBatchHistoryIds;
    delete parsed.selectedImageIndex;
    delete parsed.refinementPrompt;
    return parsed;
  } catch (error) {
    console.warn('Could not load state from localStorage', error);
    return undefined;
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
  const persistedState = loadStateFromLocalStorage();
  const [state, dispatch] = useReducer(appReducer, { ...initialState, ...persistedState });

  useEffect(() => {
    saveStateToLocalStorage(state);
  }, [state]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
