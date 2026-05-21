import { create } from 'zustand';

import { api } from '@/api/client';
import type { ProjectSummary, WorkspaceSummary } from '@/types/domain';

interface WorkspaceState {
  workspaces: WorkspaceSummary[];
  projects: ProjectSummary[];
  workspaceId: number | null;
  projectId: number | null;
  loading: boolean;
  bootstrap: () => Promise<void>;
  setWorkspace: (workspaceId: number) => Promise<void>;
  setProject: (projectId: number) => void;
  refreshProjects: (workspaceId?: number) => Promise<void>;
}

const workspaceStorageKey = 'lightbi.workspaceId';
const projectStorageKey = 'lightbi.projectId';

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  projects: [],
  workspaceId: readStoredNumber(workspaceStorageKey),
  projectId: readStoredNumber(projectStorageKey),
  loading: false,
  async bootstrap() {
    set({ loading: true });
    try {
      const workspaces = await api.workspaces();
      const selectedWorkspaceId = pickValidId(workspaces, get().workspaceId) ?? workspaces[0]?.id ?? null;
      const projects = selectedWorkspaceId ? await api.projects(selectedWorkspaceId) : [];
      const selectedProjectId = pickValidId(projects, get().projectId) ?? projects[0]?.id ?? null;
      persistSelection(selectedWorkspaceId, selectedProjectId);
      set({ workspaces, projects, workspaceId: selectedWorkspaceId, projectId: selectedProjectId });
    } finally {
      set({ loading: false });
    }
  },
  async setWorkspace(workspaceId) {
    const projects = await api.projects(workspaceId);
    const projectId = projects[0]?.id ?? null;
    persistSelection(workspaceId, projectId);
    set({ workspaceId, projects, projectId });
  },
  setProject(projectId) {
    localStorage.setItem(projectStorageKey, String(projectId));
    set({ projectId });
  },
  async refreshProjects(workspaceId = get().workspaceId ?? undefined) {
    const projects = workspaceId ? await api.projects(workspaceId) : [];
    const projectId = pickValidId(projects, get().projectId) ?? projects[0]?.id ?? null;
    persistSelection(workspaceId ?? null, projectId);
    set({ projects, projectId });
  }
}));

function readStoredNumber(key: string): number | null {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function pickValidId<T extends { id: number }>(items: T[], selectedId: number | null): number | null {
  if (!selectedId) {
    return null;
  }
  return items.some((item) => item.id === selectedId) ? selectedId : null;
}

function persistSelection(workspaceId: number | null, projectId: number | null): void {
  if (workspaceId) {
    localStorage.setItem(workspaceStorageKey, String(workspaceId));
  } else {
    localStorage.removeItem(workspaceStorageKey);
  }
  if (projectId) {
    localStorage.setItem(projectStorageKey, String(projectId));
  } else {
    localStorage.removeItem(projectStorageKey);
  }
}
