import { create } from 'zustand';

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** How long the toast stays up. Defaults to 6 s, long enough to reach an Undo. */
  durationMs?: number;
}

export interface ActiveToast extends ToastOptions {
  id: number;
}

interface ToastStore {
  current: ActiveToast | null;
  show: (toast: ToastOptions) => number;
  dismiss: (id?: number) => void;
}

let seq = 0;

/**
 * One toast at a time, app-wide. Showing a new one replaces the old one, so an
 * Undo that was never tapped simply drops away — the deletion has already
 * happened and needs no follow-up.
 */
export const useToastStore = create<ToastStore>()((set, get) => ({
  current: null,
  show: (toast) => {
    const id = ++seq;
    set({ current: { ...toast, id } });
    return id;
  },
  dismiss: (id) => {
    if (id === undefined || get().current?.id === id) set({ current: null });
  },
}));

export const showToast = (toast: ToastOptions) => useToastStore.getState().show(toast);
