import { create } from 'zustand';

interface EditorToolbarConfig {
  visible: boolean;
  statusLabel: string;
  canWrite: boolean;
  saving: boolean;
  publishing: boolean;
  onSave: () => void;
  onPublish: () => void;
  onSaveAndPublish: () => void;
}

interface EditorToolbarState {
  toolbar: EditorToolbarConfig | null;
  setToolbar: (toolbar: EditorToolbarConfig) => void;
  clearToolbar: () => void;
}

export const useEditorToolbarStore = create<EditorToolbarState>((set) => ({
  toolbar: null,
  setToolbar: (toolbar) => set({ toolbar }),
  clearToolbar: () => set({ toolbar: null })
}));
