/**
 * Progressive-web-app helpers: is the app installed, what kind of phone is
 * this, and Chrome's one-shot install prompt.
 *
 * Imported from main.tsx so the `beforeinstallprompt` listener is attached
 * before React renders — Chrome fires the event once, early, and a listener
 * added later would miss it.
 */

export type InstallPlatform =
  /** iPhone / iPad in Safari: Share → Add to Home Screen. */
  | 'ios-safari'
  /** iPhone / iPad in Chrome, Firefox, Edge…: same share sheet, button sits elsewhere. */
  | 'ios-other'
  /** Android: Chrome can show a native install dialog; otherwise the ⋮ menu. */
  | 'android'
  /** Desktop or something we can't give steps for. */
  | 'other';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep Chrome's mini-infobar from appearing; we show our own screen.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

/** Running from the home screen (or as an installed desktop app), not a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

export function detectPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIOS) {
    const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
    return otherBrowser ? 'ios-other' : 'ios-safari';
  }
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/** A phone or tablet in a browser tab: the only case where the install guide is useful. */
export function shouldOfferInstall(): boolean {
  return !isStandalone() && detectPlatform() !== 'other';
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

/** Shows Chrome's install dialog. Resolves true if the person installed. */
export async function promptInstall(): Promise<boolean> {
  const prompt = deferredPrompt;
  if (!prompt) return false;
  deferredPrompt = null;
  notify();
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome === 'accepted';
}

export function subscribeInstallPrompt(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ─── Remembering "Continue in browser" ───────────────────────────────────────

const DISMISS_KEY = 'opensplitwise-install-guide-dismissed';

export function isInstallGuideDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissInstallGuide(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Private mode or blocked storage: it will simply show again next visit.
  }
}

/** The account menu's "Install app" item reopens the guide through this event. */
export const SHOW_INSTALL_GUIDE_EVENT = 'opensplitwise:show-install-guide';

export function showInstallGuide(): void {
  window.dispatchEvent(new Event(SHOW_INSTALL_GUIDE_EVENT));
}
