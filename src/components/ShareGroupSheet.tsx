import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, selectFriendBalances } from '../store';
import { buildGroupExport, shareExport, downloadExport } from '../lib/dataExport';
import { buildJoinLink } from '../lib/joinLink';
import type { Group } from '../types';
import ExportImportSheet from './ExportImportSheet';
import './ExportImportSheet.css';
import './ShareGroupSheet.css';

// ─── Animation variants ───────────────────────────────────────────────────────

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit:   { opacity: 0, transition: { duration: 0.18 } },
};

const panelVariants = {
  hidden:  { y: '100%', opacity: 0.6 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring' as const, damping: 32, stiffness: 320 } },
  exit:    { y: '100%', opacity: 0, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] as [number, number, number, number] } },
};

interface ShareGroupSheetProps {
  open: boolean;
  onClose: () => void;
  group: Group;
}

type QrState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; dataUrl: string; trimmed: boolean }
  | { kind: 'too-big' }
  | { kind: 'failed' };

/**
 * Invites people to a group and pulls their contributions back in.
 *
 * There is no server, so a group travels as a file: whoever opens it in
 * OpenSplit joins the group with the same record IDs, logs expenses, and
 * shares the file back. Because the IDs match, the owner's import merges the
 * changes instead of creating a second copy of everything.
 *
 * Small groups can also travel as a QR code: the whole export is compressed
 * into a link to this app, which the other phone's camera opens directly.
 */
export default function ShareGroupSheet({ open, onClose, group }: ShareGroupSheetProps) {
  const users           = useStore((s) => s.users);
  const groups          = useStore((s) => s.groups);
  const expenses        = useStore((s) => s.expenses);
  const settlements     = useStore((s) => s.settlements);
  const activities      = useStore((s) => s.activities);
  const tombstones      = useStore((s) => s.tombstones);
  const currentUserId   = useStore((s) => s.currentUserId);
  const friendBalances  = useStore(selectFriendBalances);
  const markGroupShared = useStore((s) => s.markGroupShared);
  const sharedAt        = useStore((s) => s.groupSharedAt[group.id]);

  const [status, setStatus] = useState<'idle' | 'shared' | 'downloaded' | 'failed'>('idle');
  const [showImport, setShowImport] = useState(false);
  const [qr, setQr] = useState<QrState>({ kind: 'idle' });

  const groupExpenses    = expenses.filter((e) => e.groupId === group.id);
  const groupSettlements = settlements.filter((s) => s.groupId === group.id);
  const hasUnshared = !!sharedAt && group.lastActivity.getTime() > sharedAt.getTime();

  const buildFile = () =>
    buildGroupExport(
      { currentUserId, users, groups, expenses, settlements, activities, friendBalances, tombstones },
      group.id,
    );

  // The share sheet has to open from the tap itself; building the file is
  // synchronous so the user gesture is still live when `navigator.share` runs.
  async function handleShare() {
    const data = buildFile();
    if (!data) return;
    try {
      const result = await shareExport(data);
      if (result !== 'cancelled') {
        setStatus(result);
        markGroupShared(group.id);
      }
    } catch {
      setStatus('failed');
    }
  }

  function handleDownload() {
    const data = buildFile();
    if (!data) return;
    downloadExport(data);
    markGroupShared(group.id);
    setStatus('downloaded');
  }

  async function handleShowQr() {
    const data = buildFile();
    if (!data) return;
    setQr({ kind: 'loading' });
    const link = buildJoinLink(data, window.location.origin);
    if (!link) {
      setQr({ kind: 'too-big' });
      return;
    }
    try {
      const QRCode = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(link.url, { errorCorrectionLevel: 'L', margin: 1, width: 640 });
      setQr({ kind: 'ready', dataUrl, trimmed: link.trimmed });
      markGroupShared(group.id);
    } catch {
      setQr({ kind: 'failed' });
    }
  }

  function close() {
    setQr({ kind: 'idle' });
    setStatus('idle');
    onClose();
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            className="eis-overlay"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          >
            <motion.div className="eis-panel" variants={panelVariants} initial="hidden" animate="visible" exit="exit">
              <div className="sheet-handle" />

              <div className="sheet-header">
                <span className="sheet-title">Share &amp; invite</span>
                <button className="sheet-close" onClick={close} aria-label="Close">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="sheet-body">
                <div className="eis-section">
                  <div className="sgs-group">
                    <span className="sgs-group-emoji" style={{ background: `${group.color}22`, borderColor: `${group.color}44` }}>
                      {group.emoji}
                    </span>
                    <div>
                      <p className="sgs-group-name">{group.name}</p>
                      <p className="eis-hint" style={{ margin: 0 }}>
                        {group.members.length} members · {groupExpenses.length} expenses · {groupSettlements.length} payments
                      </p>
                    </div>
                  </div>

                  {hasUnshared && (
                    <div className="eis-banner eis-banner-warning">
                      <span>Changes since you last shared this group. Share again so the others get them.</span>
                    </div>
                  )}

                  {qr.kind === 'ready' ? (
                    <div className="sgs-qr">
                      <img className="sgs-qr-img" src={qr.dataUrl} alt={`QR code that opens ${group.name} in OpenSplit`} />
                      <p className="sgs-qr-text">
                        Point the other phone&apos;s camera at this. It opens OpenSplit with the group ready to join.
                        {qr.trimmed && ' The activity feed was left out to fit.'}
                      </p>
                      <p className="sgs-note">
                        Works with the built-in camera on iPhone and Android. If OpenSplit is installed on that phone the link opens offline.
                      </p>
                      <button className="eis-text-btn" onClick={() => setQr({ kind: 'idle' })}>Hide QR code</button>
                    </div>
                  ) : (
                    <>
                      <p className="eis-section-desc">
                        OpenSplit has no server, so a group travels as a file. Anyone who opens this file in
                        OpenSplit joins <strong>{group.name}</strong> and can add expenses and payments. When
                        they share the group back, their changes merge into yours.
                      </p>

                      <ol className="sgs-steps">
                        <li>
                          <span className="sgs-step-num">1</span>
                          <span>Send the group file — AirDrop, Messages, WhatsApp, email, anything that carries a file — or show a QR code for people in the room.</span>
                        </li>
                        <li>
                          <span className="sgs-step-num">2</span>
                          <span>They open it in OpenSplit (from the welcome screen, or <em>Data &amp; Backups → Import → Join</em>) and pick which person they are.</span>
                        </li>
                        <li>
                          <span className="sgs-step-num">3</span>
                          <span>After logging expenses they tap <em>Share</em> in the group and send the file back. Import it here to merge their changes.</span>
                        </li>
                      </ol>

                      <p className="sgs-note">
                        Edits are merged and the newest version of an expense wins. Deletions travel too.
                      </p>
                    </>
                  )}

                  {qr.kind === 'too-big' && (
                    <div className="eis-banner eis-banner-warning">
                      <span>This group is too large for a QR code. Share the file instead.</span>
                    </div>
                  )}
                  {qr.kind === 'failed' && (
                    <div className="eis-banner eis-banner-error"><span>Couldn&apos;t build the QR code. Share the file instead.</span></div>
                  )}
                  {status === 'shared' && (
                    <div className="eis-banner eis-banner-success"><span>Shared — the file is on its way.</span></div>
                  )}
                  {status === 'downloaded' && (
                    <div className="eis-banner eis-banner-success"><span>File saved — send it to the people in this group.</span></div>
                  )}
                  {status === 'failed' && (
                    <div className="eis-banner eis-banner-error"><span>Couldn&apos;t share. Try saving the file instead.</span></div>
                  )}
                </div>
              </div>

              <div className="sheet-footer sgs-footer">
                <div className="sgs-primary-row">
                  <button className="sheet-cta" onClick={handleShare}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ marginRight: 7, verticalAlign: 'middle' }}>
                      <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Share file
                  </button>
                  <button
                    className="sgs-qr-btn"
                    onClick={handleShowQr}
                    disabled={qr.kind === 'loading'}
                    aria-label="Show QR code"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
                      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
                      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
                      <path d="M14 14h3v3h-3zM19 14h2M14 19h2M19 19h2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    {qr.kind === 'loading' ? '…' : 'QR'}
                  </button>
                </div>
                <div className="sgs-secondary">
                  <button className="eis-text-btn" onClick={handleDownload}>Save file instead</button>
                  <span className="sgs-dot" aria-hidden>·</span>
                  <button className="eis-text-btn" onClick={() => setShowImport(true)}>Import a file sent back</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showImport && (
          <ExportImportSheet
            open={showImport}
            onClose={() => setShowImport(false)}
            defaultTab="import"
            defaultGroupId={group.id}
          />
        )}
      </AnimatePresence>
    </>
  );
}
