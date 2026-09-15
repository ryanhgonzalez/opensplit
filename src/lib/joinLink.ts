import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
import type { AppExport } from './dataExport';

// ─────────────────────────────────────────────────────────────────────────────
// Join links: a whole group export folded into a URL fragment.
//
// Scanning a QR code with the phone's own camera opens a URL — no in-app
// scanner, no camera permission, works on iOS and Android alike. So the QR
// code is a link to this app with the group compressed into the `#join=`
// fragment. Fragments never reach a server, and the service worker serves the
// app shell offline, so an installed copy can open one with no connection.
//
// A QR code holds at most 2,953 bytes, which is why the payload is deflated
// and base64url-encoded, and why large groups fall back to sharing the file.
// ─────────────────────────────────────────────────────────────────────────────

export const JOIN_PARAM = 'join';

/** Room left for the payload once the origin and `#join=` are in the URL. */
export const MAX_JOIN_PAYLOAD_CHARS = 2600;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function encodeJoinPayload(json: string): string {
  return toBase64Url(deflateSync(strToU8(json), { level: 9 }));
}

export function decodeJoinPayload(encoded: string): string {
  return strFromU8(inflateSync(fromBase64Url(encoded)));
}

export interface JoinLinkResult {
  url: string;
  /** True when the activity feed had to be left out to fit. */
  trimmed: boolean;
}

/**
 * Builds the link for a group export, or returns null when even a trimmed
 * export is too large for a QR code. The feed history is the first thing to
 * go: it is nice to have, while the expenses and members are the point.
 */
export function buildJoinLink(data: AppExport, origin: string): JoinLinkResult | null {
  const attempt = (payload: AppExport, trimmed: boolean): JoinLinkResult | null => {
    const encoded = encodeJoinPayload(JSON.stringify(payload));
    if (encoded.length > MAX_JOIN_PAYLOAD_CHARS) return null;
    return { url: `${origin}/#${JOIN_PARAM}=${encoded}`, trimmed };
  };

  return (
    attempt(data, false) ??
    attempt(
      {
        ...data,
        meta: { ...data.meta, activityCount: 0 },
        data: { ...data.data, activities: [], friendBalances: {} },
      },
      true,
    )
  );
}

/** The export JSON carried by a `#join=` fragment, or null when there is none or it is unreadable. */
export function readJoinLink(hash: string): string | null {
  const match = hash.match(new RegExp(`(?:^#|[#&])${JOIN_PARAM}=([A-Za-z0-9_-]+)`));
  if (!match) return null;
  try {
    return decodeJoinPayload(match[1]);
  } catch {
    return null;
  }
}
