import { create } from 'zustand';

export interface SessionUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  /** Login com Google (e-mail já verificado pelo provedor). */
  google: boolean;
  admin: boolean;
}

export interface AuthState {
  ready: boolean;
  user: SessionUser | null;
  set: (partial: Partial<AuthState>) => void;
}

export const useAuth = create<AuthState>((set) => ({
  ready: false,
  user: null,
  set: (partial) => set(partial),
}));
