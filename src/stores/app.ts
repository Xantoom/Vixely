import { create } from 'zustand';

interface AppState {
	activeModule: 'video' | 'image' | 'gif' | null;
	setActiveModule: (module: AppState['activeModule']) => void;
}

export const useAppStore = create<AppState>((set) => ({
	activeModule: null,
	setActiveModule: (module) => set({ activeModule: module }),
}));
