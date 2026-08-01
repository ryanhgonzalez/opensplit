import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, selectCurrentUser } from '../store';
import { buildSplit, round } from '../lib/calculations';
import { CATEGORY_ICONS, CATEGORY_LABELS } from '../types';
import type { Expense, ExpenseCategory, SplitType } from '../types';
import Avatar from './Avatar';
import '../styles/sheet.css';
import './AddExpenseSheet.css';

const CATEGORIES = Object.keys(CATEGORY_ICONS) as ExpenseCategory[];
const SPLIT_TYPES: { value: SplitType; label: string }[] = [
  { value: 'equal',   label: 'Equal' },
  { value: 'exact',   label: 'Exact' },
  { value: 'percentage', label: 'Percent' },
];

interface Participant {
  userId: string;
  checked: boolean;
  value: string; // dollar amount or percentage, depending on splitType
}

interface AddExpenseSheetProps {
  open: boolean;
  onClose: () => void;
  defaultGroupId?: string;
  editExpense?: Expense;
}

export default function AddExpenseSheet({ open, onClose, defaultGroupId, editExpense }: AddExpenseSheetProps) {
  const isEditing = !!editExpense;
  const currentUser = useStore(selectCurrentUser)!;
  const users = useStore(s => s.users);
  const groups = useStore(s => s.groups);
  const addExpense = useStore(s => s.addExpense);
  const updateExpense = useStore(s => s.updateExpense);

  const initSplitType = (e?: Expense): SplitType =>
    e?.split.type === 'percentage' ? 'exact' : (e?.split.type ?? 'equal');

  const [description, setDescription] = useState(editExpense?.description ?? '');
  const [amountStr, setAmountStr] = useState(editExpense ? String(editExpense.amount) : '');
  const [category, setCategory] = useState<ExpenseCategory>(editExpense?.category ?? 'food');
  const [groupId, setGroupId] = useState(editExpense?.groupId ?? defaultGroupId ?? '');
  const [paidBy, setPaidBy] = useState(editExpense?.paidBy ?? currentUser.id);
  const [splitType, setSplitType] = useState<SplitType>(initSplitType(editExpense));
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Receipt scanning (client-side OCR — fills a draft the user reviews before saving)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  const selectedGroup = useMemo(() => groups.find(g => g.id === groupId), [groups, groupId]);
  const getUserById = (id: string) => users.find(u => u.id === id);

  // Rebuild participants when selected group changes (or when editing a different expense).
  useEffect(() => {
    if (!selectedGroup) { setParticipants([]); return; }

    if (editExpense && editExpense.groupId === selectedGroup.id) {
      const eSplitType = initSplitType(editExpense);
      setSplitType(eSplitType);
      setParticipants(
        selectedGroup.members.map(m => {
          const entry = editExpense.split.entries.find(e => e.userId === m.userId);
          return {
            userId: m.userId,
            checked: !!entry,
            value: entry && eSplitType !== 'equal' ? String(entry.amount) : '',
          };
        })
      );
    } else {
      setParticipants(
        selectedGroup.members.map(m => ({ userId: m.userId, checked: true, value: '' }))
      );
      if (!selectedGroup.members.some(m => m.userId === paidBy)) {
        setPaidBy(currentUser.id);
      }
    }
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsedAmount = parseFloat(amountStr) || 0;
  const checkedParticipants = participants.filter(p => p.checked);
  const checkedCount = checkedParticipants.length;

  // Computed split preview for equal mode
  const equalShare = checkedCount > 0 ? round(parsedAmount / checkedCount) : 0;

  // Running total for exact / percentage modes
  const enteredTotal = useMemo(() => {
    if (splitType === 'exact') {
      return checkedParticipants.reduce((s, p) => s + (parseFloat(p.value) || 0), 0);
    }
    if (splitType === 'percentage') {
      return checkedParticipants.reduce((s, p) => s + (parseFloat(p.value) || 0), 0);
    }
    return parsedAmount;
  }, [participants, splitType, parsedAmount]);

  const remainder = splitType === 'exact'
    ? round(parsedAmount - enteredTotal)
    : splitType === 'percentage'
    ? round(100 - enteredTotal)
    : 0;

  const splitValid = useMemo(() => {
    if (checkedCount === 0) return false;
    if (splitType === 'equal') return parsedAmount > 0;
    if (splitType === 'exact') return Math.abs(remainder) < 0.01 && parsedAmount > 0;
    if (splitType === 'percentage') return Math.abs(remainder) < 0.01;
    return false;
  }, [splitType, remainder, parsedAmount, checkedCount]);

  const canSubmit = description.trim().length > 0 && parsedAmount > 0 && groupId && splitValid;

  const toggleParticipant = (userId: string) => {
    setParticipants(prev =>
      prev.map(p => p.userId === userId ? { ...p, checked: !p.checked } : p)
    );
  };

  const setParticipantValue = (userId: string, value: string) => {
    setParticipants(prev =>
      prev.map(p => p.userId === userId ? { ...p, value } : p)
    );
  };

  const handleSplitTypeChange = (type: SplitType) => {
    setSplitType(type);
    setParticipants(prev => prev.map(p => ({ ...p, value: '' })));
  };

  const handleReceiptSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;

    setScanning(true);
    setScanError(null);
    setScanProgress(0);
    setScanned(false);
    try {
      const { scanReceipt } = await import('../lib/receiptScanner');
      const result = await scanReceipt(file, setScanProgress);

      let filledAny = false;
      if (result.amount && result.amount > 0) { setAmountStr(String(result.amount)); filledAny = true; }
      if (result.description) { setDescription(result.description); filledAny = true; }
      if (result.category) { setCategory(result.category); filledAny = true; }

      if (!filledAny) {
        setScanError("Couldn't read that receipt. Try a clearer, well-lit photo — or enter the details manually.");
      } else {
        setScanned(true);
        if (!result.amount) setScanError("Couldn't find the total — please enter the amount manually.");
      }
    } catch {
      setScanError('Something went wrong scanning the receipt. Please enter the details manually.');
    } finally {
      setScanning(false);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;

    const activeParticipants = participants
      .filter(p => p.checked)
      .map(p => ({
        userId: p.userId,
        value: splitType !== 'equal' ? (parseFloat(p.value) || 0) : undefined,
      }));

    const split = buildSplit(parsedAmount, splitType, activeParticipants);

    if (isEditing && editExpense) {
      updateExpense(editExpense.id, {
        description: description.trim(),
        amount: parsedAmount,
        paidBy,
        groupId: groupId || undefined,
        split,
        category,
      });
    } else {
      addExpense({
        description: description.trim(),
        amount: parsedAmount,
        currency: 'USD',
        paidBy,
        groupId: groupId || undefined,
        date: new Date(),
        split,
        category,
      });
    }

    handleClose();
  };

  const handleClose = () => {
    setDescription(editExpense?.description ?? '');
    setAmountStr(editExpense ? String(editExpense.amount) : '');
    setCategory(editExpense?.category ?? 'food');
    setGroupId(editExpense?.groupId ?? defaultGroupId ?? '');
    setPaidBy(editExpense?.paidBy ?? currentUser.id);
    setSplitType(initSplitType(editExpense));
    setParticipants([]);
    setScanning(false);
    setScanProgress(0);
    setScanError(null);
    setScanned(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="sheet-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className="sheet-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="sheet-header">
              <span className="sheet-title">{isEditing ? 'Edit Expense' : 'Add Expense'}</span>
              <button className="sheet-close" onClick={handleClose} aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="sheet-body">
              {/* Receipt scan (client-side OCR) — pre-fills an editable draft */}
              {!isEditing && (
                <div className="aes-scan">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={handleReceiptSelected}
                  />
                  <button
                    type="button"
                    className="aes-scan-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={scanning}
                  >
                    {scanning ? (
                      <>
                        <span className="aes-scan-spinner" aria-hidden />
                        Reading receipt… {Math.round(scanProgress * 100)}%
                      </>
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="2" />
                        </svg>
                        Scan receipt
                      </>
                    )}
                  </button>
                  {scanError && <div className="aes-scan-msg error">{scanError}</div>}
                  {scanned && !scanError && (
                    <div className="aes-scan-msg ok">Filled from receipt — double-check the details below.</div>
                  )}
                </div>
              )}

              {/* Amount — hero input */}
              <div className="aes-amount-hero">
                <span className="aes-currency-symbol">$</span>
                <input
                  className="aes-amount-input"
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  value={amountStr}
                  onChange={e => setAmountStr(e.target.value)}
                />
              </div>

              {/* Description */}
              <div className="field-group">
                <div className="field-label">What was it for?</div>
                <input
                  className="field-input"
                  placeholder="Dinner, gas, groceries…"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              {/* Category */}
              <div className="field-group">
                <div className="field-label">Category</div>
                <div className="aes-category-row">
                  {CATEGORIES.map(c => (
                    <button
                      key={c}
                      className={`aes-category-btn ${category === c ? 'active' : ''}`}
                      onClick={() => setCategory(c)}
                    >
                      <span>{CATEGORY_ICONS[c]}</span>
                      <span className="aes-category-label">{CATEGORY_LABELS[c]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Group (only shown when no default) */}
              {!defaultGroupId && (
                <div className="field-group">
                  <div className="field-label">Group</div>
                  <div className="aes-group-picker">
                    {groups.length === 0 ? (
                      <p className="text-secondary text-sm">No groups yet — create one first</p>
                    ) : (
                      groups.map(g => (
                        <button
                          key={g.id}
                          className={`aes-group-option ${groupId === g.id ? 'active' : ''}`}
                          style={groupId === g.id ? { borderColor: `${g.color}55`, background: `${g.color}18` } : {}}
                          onClick={() => setGroupId(g.id)}
                        >
                          <span style={{ fontSize: 18 }}>{g.emoji}</span>
                          <span className="aes-group-name">{g.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Paid by */}
              {selectedGroup && (
                <div className="field-group">
                  <div className="field-label">Paid by</div>
                  <div className="aes-paid-by-row">
                    {selectedGroup.members.map(m => {
                      const u = getUserById(m.userId);
                      if (!u) return null;
                      return (
                        <button
                          key={m.userId}
                          className={`aes-payer-btn ${paidBy === m.userId ? 'active' : ''}`}
                          onClick={() => setPaidBy(m.userId)}
                        >
                          <Avatar user={u} size="sm" showRing={paidBy === m.userId} />
                          <span className="aes-payer-name">
                            {m.userId === currentUser.id ? 'You' : u.name.split(' ')[0]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Split section */}
              {selectedGroup && (
                <div className="field-group">
                  <div className="aes-split-header">
                    <div className="field-label" style={{ margin: 0 }}>Split</div>
                    <div className="aes-split-tabs">
                      {SPLIT_TYPES.map(st => (
                        <button
                          key={st.value}
                          className={`aes-split-tab ${splitType === st.value ? 'active' : ''}`}
                          onClick={() => handleSplitTypeChange(st.value)}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="aes-participants">
                    {participants.map(p => {
                      const u = getUserById(p.userId);
                      if (!u) return null;
                      const isMe = p.userId === currentUser.id;
                      const sharePreview = splitType === 'equal' && parsedAmount > 0 && p.checked
                        ? formatSharePreview(equalShare)
                        : null;

                      return (
                        <div
                          key={p.userId}
                          className={`aes-participant ${p.checked ? 'checked' : 'unchecked'}`}
                        >
                          <button className="aes-participant-check" onClick={() => toggleParticipant(p.userId)}>
                            <div className={`cgs-checkbox ${p.checked ? 'checked' : ''}`} style={{ width: 20, height: 20 }}>
                              {p.checked && (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                          </button>
                          <Avatar user={u} size="sm" />
                          <span className="aes-participant-name">
                            {isMe ? 'You' : u.name.split(' ')[0]}
                          </span>

                          {splitType === 'equal' && (
                            <span className="aes-equal-share text-secondary text-sm">
                              {sharePreview ?? '—'}
                            </span>
                          )}

                          {(splitType === 'exact' || splitType === 'percentage') && p.checked && (
                            <div className="aes-value-input-wrap">
                              <span className="aes-value-prefix">
                                {splitType === 'exact' ? '$' : ''}
                              </span>
                              <input
                                className="aes-value-input"
                                type="number"
                                inputMode="decimal"
                                placeholder="0"
                                min="0"
                                value={p.value}
                                onChange={e => setParticipantValue(p.userId, e.target.value)}
                              />
                              {splitType === 'percentage' && (
                                <span className="aes-value-suffix">%</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Remainder indicator */}
                  {splitType !== 'equal' && parsedAmount > 0 && (
                    <div className={`aes-remainder ${Math.abs(remainder) < 0.01 ? 'ok' : 'warn'}`}>
                      {Math.abs(remainder) < 0.01 ? (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                            <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Splits add up ✓
                        </>
                      ) : (
                        <>
                          {splitType === 'exact'
                            ? `${remainder > 0 ? '$' + remainder.toFixed(2) + ' remaining' : '$' + Math.abs(remainder).toFixed(2) + ' over'}`
                            : `${remainder > 0 ? remainder.toFixed(1) + '% remaining' : Math.abs(remainder).toFixed(1) + '% over'}`
                          }
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="sheet-footer">
              <button className="sheet-cta" onClick={handleSubmit} disabled={!canSubmit}>
                {isEditing ? 'Save Changes' : 'Add Expense'}{parsedAmount > 0 ? ` · $${parsedAmount.toFixed(2)}` : ''}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function formatSharePreview(amount: number): string {
  return `$${amount.toFixed(2)} each`;
}
