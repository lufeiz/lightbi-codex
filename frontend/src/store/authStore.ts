import { create } from 'zustand';

import { api, getApiAccessToken, refreshAccessToken, setApiAccessToken } from '@/api/client';
import type { LoginPayload, RegisterPayload, UserDTO } from '@/types/domain';

interface AuthState {
  accessToken: string | null;
  user: UserDTO | null;
  bootstrapped: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: getApiAccessToken(),
  user: null,
  bootstrapped: false,
  async login(payload) {
    const data = await api.login(payload);
    setApiAccessToken(data.accessToken);
    set({ accessToken: data.accessToken, user: data.user, bootstrapped: true });
  },
  async register(payload) {
    const data = await api.register(payload);
    setApiAccessToken(data.accessToken);
    set({ accessToken: data.accessToken, user: data.user, bootstrapped: true });
  },
  async logout() {
    try {
      await api.logout();
    } finally {
      setApiAccessToken(null);
      set({ accessToken: null, user: null, bootstrapped: true });
    }
  },
  async bootstrap() {
    const hasToken = getApiAccessToken() || (await refreshAccessToken());
    if (!hasToken) {
      set({ accessToken: null, user: null, bootstrapped: true });
      return;
    }
    try {
      const user = await api.me();
      set({ user, accessToken: getApiAccessToken(), bootstrapped: true });
    } catch {
      setApiAccessToken(null);
      set({ accessToken: null, user: null, bootstrapped: true });
    }
  }
}));
