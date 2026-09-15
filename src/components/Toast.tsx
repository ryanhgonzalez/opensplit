import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore } from '../store/toast';
import './Toast.css';

/** Renders the app-wide toast. Mount once, inside the app shell. */
export default function ToastHost() {
  const toast = useToastStore((s) => s.current);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => dismiss(toast.id), toast.durationMs ?? 6000);
    return () => window.clearTimeout(timer);
  }, [toast, dismiss]);

  return (
    <div className="toast-host" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          >
            <span className="toast-message">{toast.message}</span>
            {toast.actionLabel && (
              <button
                className="toast-action"
                onClick={() => {
                  toast.onAction?.();
                  dismiss(toast.id);
                }}
              >
                {toast.actionLabel}
              </button>
            )}
            <button className="toast-close" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
