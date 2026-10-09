import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store';
import {
  SHOW_INSTALL_GUIDE_EVENT,
  canPromptInstall,
  detectPlatform,
  dismissInstallGuide,
  isInstallGuideDismissed,
  promptInstall,
  shouldOfferInstall,
  subscribeInstallPrompt,
  type InstallPlatform,
} from '../lib/pwa';
import './InstallGuide.css';

// ─── Inline glyphs that mirror what the browser shows ────────────────────────

const ShareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);

const AddSquareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

const MenuDotsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
);

const MoreIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);

const Key = ({ children }: { children: ReactNode }) => <span className="ig-key">{children}</span>;

function steps(platform: InstallPlatform): ReactNode[] {
  switch (platform) {
    case 'ios-safari':
      return [
        <>Tap the Share button <Key><ShareIcon /></Key> in Safari’s toolbar. On newer iOS it’s inside the <Key><MoreIcon /></Key> menu.</>,
        <>Scroll down and tap <Key><AddSquareIcon /> Add to Home Screen</Key>.</>,
        <>Tap <strong>Add</strong>, then open OpenSplitwise from your home screen.</>,
      ];
    case 'ios-other':
      return [
        <>Tap the Share button <Key><ShareIcon /></Key>. In Chrome it sits at the right of the address bar.</>,
        <>Tap <Key><AddSquareIcon /> Add to Home Screen</Key>. If it’s missing, open this page in Safari and try again.</>,
        <>Tap <strong>Add</strong>, then open OpenSplitwise from your home screen.</>,
      ];
    case 'android':
      return [
        <>Tap the menu <Key><MenuDotsIcon /></Key> at the top right of the browser.</>,
        <>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</>,
        <>Confirm, then open OpenSplitwise from your home screen.</>,
      ];
    default:
      return [];
  }
}

/**
 * Full-screen guide shown to phone visitors who are using the app in a browser
 * tab. "Continue in browser" hides it for good on this device; the account
 * menu's "Install app" item brings it back.
 */
export default function InstallGuide() {
  const hasOnboarded = useStore((s) => s.hasOnboarded);
  const [open, setOpen] = useState(() => shouldOfferInstall() && !isInstallGuideDismissed());
  const [canPrompt, setCanPrompt] = useState(canPromptInstall);
  const platform = detectPlatform();

  useEffect(() => subscribeInstallPrompt(() => setCanPrompt(canPromptInstall())), []);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(SHOW_INSTALL_GUIDE_EVENT, show);
    return () => window.removeEventListener(SHOW_INSTALL_GUIDE_EVENT, show);
  }, []);

  const close = () => {
    dismissInstallGuide();
    setOpen(false);
  };

  const install = async () => {
    const installed = await promptInstall();
    if (installed) close();
  };

  const list = steps(platform);
  // On iPhone the home-screen app has its own storage, separate from Safari's.
  const warnSeparateData = hasOnboarded && (platform === 'ios-safari' || platform === 'ios-other');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="ig-root"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ig-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="ig-card">
            <img className="ig-icon" src="/icon-192.png" alt="" width={64} height={64} />

            <div className="ig-heading">
              <span className="cap">Web app</span>
              <h1 id="ig-title" className="ig-title">Install OpenSplitwise</h1>
              <p className="ig-lede">
                OpenSplitwise is a web app. Add it to your home screen and it opens full-screen like any
                other app, with no app store needed.
              </p>
            </div>

            {platform === 'android' && canPrompt ? (
              <button className="btn btn-primary ig-cta" onClick={install}>
                Install app
              </button>
            ) : (
              <ol className="ig-steps">
                {list.map((step, i) => (
                  <li key={i} className="ig-step">
                    <span className="num ig-step-num">{String(i + 1).padStart(2, '0')}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            )}

            {warnSeparateData && (
              <p className="ig-warning">
                <strong>Your data won’t move over by itself.</strong> On iPhone the home-screen app keeps its
                own storage. Export a backup first from <strong>Account › Data &amp; Backups</strong>, then
                import it in the installed app.
              </p>
            )}

            <button className="ig-continue" onClick={close}>
              Continue in browser
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
