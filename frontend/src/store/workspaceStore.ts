import { create } from 'zustand';

import { api } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import type { ProjectSummary, UserDTO, WorkspaceRole, WorkspaceSummary } from '@/types/domain';

interface WorkspaceState {
  workspaces: WorkspaceSummary[];
  projects: ProjectSummary[];
  workspaceId: number | null;
  projectId: number | null;
  projectRole: WorkspaceRole | null;
  loading: boolean;
  bootstrapped: boolean;
  bootstrap: () => Promise<void>;
  setWorkspace: (workspaceId: number) => Promise<void>;
  setProject: (projectId: number) => Promise<void>;
  refreshProjects: (workspaceId?: number) => Promise<void>;
}

const workspaceStorageKey = 'lightbi.workspaceId';
const projectStorageKey = 'lightbi.projectId';

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  projects: [],
  workspaceId: readStoredNumber(workspaceStorageKey),
  projectId: readStoredNumber(projectStorageKey),
  projectRole: null,
  loading: false,
  bootstrapped: false,
  async bootstrap() {
    set({ loading: true });
    try {
      const workspaces = await api.workspaces();
      const selectedWorkspaceId = pickValidId(workspaces, get().workspaceId) ?? workspaces[0]?.id ?? null;
      const projects = selectedWorkspaceId ? await api.projects(selectedWorkspaceId) : [];
      const selectedProjectId = pickValidId(projects, get().projectId) ?? projects[0]?.id ?? null;
      const projectRole = await resolveProjectRole(selectedProjectId);
      persistSelection(selectedWorkspaceId, selectedProjectId);
      set({ workspaces, projects, workspaceId: selectedWorkspaceId, projectId: selectedProjectId, projectRole, bootstrapped: true });
    } finally {
      set({ loading: false, bootstrapped: true });
    }
  },
  async setWorkspace(workspaceId) {
    const projects = await api.projects(workspaceId);
    const projectId = projects[0]?.id ?? null;
    const projectRole = await resolveProjectRole(projectId);
    persistSelection(workspaceId, projectId);
    set({ workspaceId, projects, projectId, projectRole });
  },
  async setProject(projectId) {
    const projectRole = await resolveProjectRole(projectId);
    localStorage.setItem(projectStorageKey, String(projectId));
    set({ projectId, projectRole });
  },
  async refreshProjects(workspaceId = get().workspaceId ?? undefined) {
    const projects = workspaceId ? await api.projects(workspaceId) : [];
    const projectId = pickValidId(projects, get().projectId) ?? projects[0]?.id ?? null;
    const projectRole = await resolveProjectRole(projectId);
    persistSelection(workspaceId ?? null, projectId);
    set({ projects, projectId, projectRole });
  }
}));

export function hasProjectWriteAccess(user: UserDTO | null, projectRole: WorkspaceRole | null): boolean {
  if (user?.role === 'admin') {
    return true;
  }
  return projectRole === 'owner' || projectRole === 'admin' || projectRole === 'editor';
}

async function resolveProjectRole(projectId: number | null): Promise<WorkspaceRole | null> {
  const user = useAuthStore.getState().user;
  if (!user || !projectId) {
    return null;
  }
  if (user.role === 'admin') {
    return null;
  }
  const members = await api.projectMembers(projectId).catch(() => []);
  return members.find((member) => member.userId === user.id)?.role ?? null;
}

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
