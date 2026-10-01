import { create } from 'zustand';

export type ModalName = 'auth' | 'checkout' | 'manage' | 'map' | 'settings' | 'report' | 'resale';

export interface ModalState {
  name: ModalName;
  /** Lote relacionado (compra, gestão, denúncia). */
  lotId?: string;
  /** Pedido em andamento (checkout). */
  orderId?: string;
  /** Modal para abrir depois do login. */
  then?: ModalState;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'ok' | 'error';
}

export interface UiState {
  modal: ModalState | null;
  toasts: Toast[];
  open: (m: ModalState) => void;
  close: () => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const useUi = create<UiState>((set) => ({
  modal: null,
  toasts: [],
  open: (modal) => set({ modal }),
  close: () => set({ modal: null }),
  toast: (text, kind = 'info') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
