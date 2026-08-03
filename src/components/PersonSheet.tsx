import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, selectCurrentUser } from '../store';
import Avatar from './Avatar';
import { formatCurrency } from '../utils';
import { calculateBalances } from '../lib/calculations';
import '../styles/sheet.css';
import './PersonSheet.css';

const AVATAR_COLORS = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#ef4444', '#8b5cf6', '#06b6d4'];

interface PersonSheetProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  groupId?: string;
}

export default function PersonSheet({ open, onClose, userId, groupId }: PersonSheetProps) {
  const currentUser = useStore(selectCurrentUser)!;
  const users = useStore(s => s.users);
  const groups = useStore(s => s.groups);
  const allExpenses = useStore(s => s.expenses);
  const allSettlements = useStore(s => s.settlements);
  const friendBalances = useStore(s => s.friendBalances);
  const updateUser = useStore(s => s.updateUser);
  const deleteUser = useStore(s => s.deleteUser);
  const removeGroupMember = useStore(s => s.removeGroupMember);

  const person = users.find(u => u.id === userId);
  const group = groupId ? groups.find(g => g.id === groupId) : undefined;
  const isSelf = userId === currentUser.id;

  const [name, setName] = useState(person?.name ?? '');
  const [avatarColor, setAvatarColor] = useState(person?.avatarColor ?? '#7c3aed');
  const [confirmAction, setConfirmAction] = useState<'remove' | 'delete' | null>(null);

  if (!person) return null;
  if (groupId && !group) return null;

  // When in a specific group context, use per-group balance.
  // Otherwise use the running overall balance tracked in the store.
  const balance = group
    ? (() => {
        const groupExpenses = allExpenses.filter(e => e.groupId === groupId);
        const groupSettlements = allSettlements.filter(s => s.groupId === groupId);
        const memberIds = group.members.map(m => m.userId);
        const balances = calculateBalances({
          expenses: groupExpenses,
          memberIds,
          settlements: groupSettlements,
        });
        return balances[userId] ?? 0;
      })()
    : (friendBalances[userId] ?? 0);

  // Groups this person shares with the current user (for global view).
  const sharedGroups = group
    ? []
    : groups.filter(g =>
        g.members.some(m => m.userId === userId) &&
        g.members.some(m => m.userId === currentUser.id),
      );

  const handleSave = () => {
    const initials = name.trim().split(/\s+/).map(p => p[0]).join('').toUpperCase().slice(0, 2);
    updateUser(userId, { name: name.trim(), avatarColor, initials });
    onClose();
  };

  const handleRemoveFromGroup = () => {
    removeGroupMember(groupId!, userId);
    onClose();
  };

  const handleDeletePerson = () => {
    deleteUser(userId);
    onClose();
  };

  const expenseCount = allExpenses.filter(
    e => e.paidBy === userId || e.split.entries.some(en => en.userId === userId)
  ).length;

  const previewUser = { ...person, name: name || person.name, avatarColor };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="sheet-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="sheet-panel ps-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="sheet-header">
              <span className="sheet-title">{isSelf ? 'Your Profile' : 'Person'}</span>
              <button className="sheet-close" onClick={onClose} aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="sheet-body">
              {/* Avatar preview */}
              <div className="ps-avatar-preview">
                <Avatar user={previewUser} size="xl" showRing={isSelf} />
                {!isSelf && Math.abs(balance) >= 0.005 && (
                  <div className={`ps-balance-chip ${balance > 0 ? 'green' : 'red'}`}>
                    {balance > 0 ? '+' : '-'}{formatCurrency(balance)}
                    {group ? ` in ${group.emoji} ${group.name}` : ' overall'}
                  </div>
                )}
                {!isSelf && Math.abs(balance) < 0.005 && (
                  <div className="ps-balance-chip settled">
                    Settled up{group ? ` in ${group.emoji} ${group.name}` : ''}
                  </div>
                )}
              </div>

              {/* Shared groups (global view only) */}
              {sharedGroups.length > 0 && (
                <div className="field-group">
                  <div className="field-label">Shared groups</div>
                  <div className="ps-groups-row">
                    {sharedGroups.map(g => (
                      <span key={g.id} className="ps-group-chip">
                        {g.emoji} {g.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Name */}
              <div className="field-group">
                <div className="field-label">Name</div>
                <input
                  className="field-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Full name"
                />
              </div>

              {/* Avatar color */}
              <div className="field-group">
                <div className="field-label">Color</div>
                <div className="ps-color-row">
                  {AVATAR_COLORS.map(c => (
                    <button
                      key={c}
                      className={`ps-color-dot ${avatarColor === c ? 'active' : ''}`}
                      style={{
                        background: c,
                        boxShadow: avatarColor === c
                          ? `0 0 0 3px rgba(255,255,255,0.15), 0 0 0 5px ${c}`
                          : 'none',
                      }}
                      onClick={() => setAvatarColor(c)}
                      aria-label={c}
                    />
                  ))}
                </div>
              </div>

              {/* Actions (non-self only) */}
              {!isSelf && (
                <div className="ps-actions">
                  {confirmAction === null && (
                    <>
                      {group && (
                        <button
                          className="ps-action-btn remove"
                          onClick={() => setConfirmAction('remove')}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                            <path d="M17 21V19C17 16.7909 15.2091 15 13 15H5C2.79086 15 1 16.7909 1 19V21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            <path d="M23 21V19C23 17.1362 21.7252 15.5701 20 15.126" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8" />
                            <path d="M17 11C18.6569 11 20 9.65685 20 8C20 6.34315 18.6569 5 17 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            <line x1="22" y1="2" x2="17" y2="7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                          Remove from {group.emoji} {group.name}
                        </button>
                      )}
                      <button
                        className="ps-action-btn delete"
                        onClick={() => setConfirmAction('delete')}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                          <path d="M3 6H5H21M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6M19 6L18.1671 19.1264C18.0723 20.6999 16.7622 22 15.1847 22H8.81535C7.23784 22 5.92769 20.6999 5.83286 19.1264L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Delete {person.name.split(' ')[0]} everywhere
                      </button>
                    </>
                  )}

                  <AnimatePresence>
                    {confirmAction === 'remove' && group && (
                      <motion.div
                        className="ps-confirm-box"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                      >
                        <p className="ps-confirm-text">
                          Remove <strong>{person.name.split(' ')[0]}</strong> from {group.emoji} {group.name}?
                          Their expenses in this group will remain.
                        </p>
                        <div className="ps-confirm-btns">
                          <button className="ps-btn-cancel" onClick={() => setConfirmAction(null)}>Cancel</button>
                          <button className="ps-btn-danger" onClick={handleRemoveFromGroup}>Remove</button>
                        </div>
                      </motion.div>
                    )}
                    {confirmAction === 'delete' && (
                      <motion.div
                        className="ps-confirm-box"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                      >
                        <p className="ps-confirm-text">
                          Permanently delete <strong>{person.name}</strong>?{' '}
                          This will also delete {expenseCount} expense{expenseCount !== 1 ? 's' : ''} involving them and cannot be undone.
                        </p>
                        <div className="ps-confirm-btns">
                          <button className="ps-btn-cancel" onClick={() => setConfirmAction(null)}>Cancel</button>
                          <button className="ps-btn-danger" onClick={handleDeletePerson}>Delete</button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            <div className="sheet-footer">
              <button className="sheet-cta" onClick={handleSave} disabled={!name.trim()}>
                Save Changes
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
