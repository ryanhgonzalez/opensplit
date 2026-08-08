import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store';
import Avatar from './Avatar';
import './IdentityPicker.css';

interface Props {
  /**
   * 'gate' blocks the app until an identity is picked — used right after
   * importing someone else's data. 'switch' is the same picker reopened
   * later from the account menu, and can be dismissed.
   */
  variant: 'gate' | 'switch';
  onClose?: () => void;
}

export default function IdentityPicker({ variant, onClose }: Props) {
  const users = useStore((s) => s.users);
  const groups = useStore((s) => s.groups);
  const expenses = useStore((s) => s.expenses);
  const currentUserId = useStore((s) => s.currentUserId);
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const claimIdentityAsNewUser = useStore((s) => s.claimIdentityAsNewUser);

  const [selected, setSelected] = useState(currentUserId);
  const [addingSelf, setAddingSelf] = useState(false);
  const [newName, setNewName] = useState('');

  // Whoever the file was exported as — shown as a hint so the importer knows
  // which name is *not* theirs.
  const fileOwner = users.find((u) => u.id === currentUserId);

  const stats = useMemo(() => {
    const map: Record<string, { groups: number; paid: number }> = {};
    for (const u of users) {
      map[u.id] = {
        groups: groups.filter((g) => g.members.some((m) => m.userId === u.id)).length,
        paid: expenses.filter((e) => e.paidBy === u.id).length,
      };
    }
    return map;
  }, [users, groups, expenses]);

  const canConfirm = addingSelf ? newName.trim().length > 0 : Boolean(selected);

  const confirm = () => {
    if (addingSelf) {
      const trimmed = newName.trim();
      if (!trimmed) return;
      claimIdentityAsNewUser(trimmed);
    } else {
      if (!selected) return;
      setCurrentUser(selected);
    }
    onClose?.();
  };

  return (
    <div className="idp-root">
      <div className="idp-orb idp-orb-1" />
      <div className="idp-orb idp-orb-2" />

      <motion.div
        className="idp-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="idp-heading">
          <h1 className="idp-title">{variant === 'gate' ? 'Who are you?' : 'Switch person'}</h1>
          <p className="idp-subtitle">
            {variant === 'gate' ? (
              <>
                This data was exported by <strong>{fileOwner?.name ?? 'someone else'}</strong>. Pick your
                own name so balances, expenses and activity are shown from your point of view.
              </>
            ) : (
              <>Everything in the app — balances, who owes what, activity — is shown from this person’s point of view.</>
            )}
          </p>
        </div>

        <div className="idp-list">
          {users.map((u) => {
            const s = stats[u.id];
            const isFileOwner = u.id === currentUserId;
            return (
              <button
                key={u.id}
                className={`idp-person${!addingSelf && selected === u.id ? ' selected' : ''}`}
                onClick={() => {
                  setAddingSelf(false);
                  setSelected(u.id);
                }}
              >
                <Avatar user={u} size="md" />
                <div className="idp-person-text">
                  <span className="idp-person-name">
                    {u.name}
                    {variant === 'gate' && isFileOwner && <span className="idp-badge">exported this</span>}
                    {variant === 'switch' && isFileOwner && <span className="idp-badge">current</span>}
                  </span>
                  <span className="idp-person-sub">
                    {s.groups} {s.groups === 1 ? 'group' : 'groups'} · paid {s.paid}{' '}
                    {s.paid === 1 ? 'expense' : 'expenses'}
                  </span>
                </div>
                <span className="idp-radio">
                  {!addingSelf && selected === u.id && <span className="idp-radio-dot" />}
                </span>
              </button>
            );
          })}

          {/* Escape hatch: the importer may not appear in the shared data at all. */}
          <button
            className={`idp-person idp-person-new${addingSelf ? ' selected' : ''}`}
            onClick={() => setAddingSelf(true)}
          >
            <span className="idp-plus">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </span>
            <div className="idp-person-text">
              <span className="idp-person-name">I’m not on this list</span>
              <span className="idp-person-sub">Add yourself as a new person</span>
            </div>
            <span className="idp-radio">{addingSelf && <span className="idp-radio-dot" />}</span>
          </button>

          {addingSelf && (
            <input
              className="idp-input"
              type="text"
              placeholder="Your name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirm()}
              autoFocus
              maxLength={40}
            />
          )}
        </div>

        <div className="idp-actions">
          <motion.button
            className="idp-cta"
            onClick={confirm}
            disabled={!canConfirm}
            whileTap={{ scale: 0.97 }}
          >
            {variant === 'gate' ? 'Continue as this person' : 'Switch'}
          </motion.button>
          {variant === 'switch' && onClose && (
            <button className="idp-secondary" onClick={onClose}>
              Cancel
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
