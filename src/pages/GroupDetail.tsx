import { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, selectCurrentUser } from '../store';
import { calculateBalances, calculateSettlements } from '../lib/calculations';
import { formatCurrency, formatDate } from '../utils';
import { CATEGORY_ICONS } from '../types';
import type { Expense, PaymentMethod } from '../types';
import TopBar from '../components/TopBar';
import Avatar from '../components/Avatar';
import GlassCard from '../components/GlassCard';
import AddExpenseSheet from '../components/AddExpenseSheet';
import EditGroupSheet from '../components/EditGroupSheet';
import PersonSheet from '../components/PersonSheet';
import SettleModal from '../components/SettleModal';
import './GroupDetail.css';

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  venmo: 'Venmo',
  cashapp: 'Cash App',
  zelle: 'Zelle',
  cash: 'Cash',
  other: 'Other',
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.36, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] } },
};

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseMenuId, setExpenseMenuId] = useState<string | null>(null);
  const [showEditGroup, setShowEditGroup] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [settling, setSettling] = useState<{ from: string; to: string; amount: number } | null>(null);
  const [undoPaymentId, setUndoPaymentId] = useState<string | null>(null);

  const users = useStore(s => s.users);
  const groups = useStore(s => s.groups);
  const allExpenses = useStore(s => s.expenses);
  const allSettlements = useStore(s => s.settlements);
  const deleteExpense = useStore(s => s.deleteExpense);
  const addSettlement = useStore(s => s.addSettlement);
  const deleteSettlement = useStore(s => s.deleteSettlement);
  const currentUser = useStore(selectCurrentUser)!;

  const group = useMemo(() => groups.find(g => g.id === id), [groups, id]);
  const expenses = useMemo(
    () => allExpenses.filter(e => e.groupId === id),
    [allExpenses, id],
  );
  const groupSettlements = useMemo(
    () => allSettlements.filter(s => s.groupId === id),
    [allSettlements, id],
  );
  const sortedExpenses = useMemo(
    () => [...expenses].sort((a, b) => b.date.getTime() - a.date.getTime()),
    [expenses],
  );
  const sortedPayments = useMemo(
    () => [...groupSettlements].sort((a, b) => b.date.getTime() - a.date.getTime()),
    [groupSettlements],
  );

  const getUserById = (uid: string) => users.find(u => u.id === uid);

  const backBtn = (
    <button
      className="gd-back-btn"
      onClick={() => navigate('/groups')}
      aria-label="Back to groups"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M19 12H5M12 5L5 12L12 19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );

  // When the group is deleted from the store, navigate away instead of flashing a blank state.
  useEffect(() => {
    if (!group) navigate('/groups', { replace: true });
  }, [group, navigate]);

  if (!group) return null;

  const memberIds = group.members.map(m => m.userId);
  // Completed payments count against the expense totals, so balances and the
  // suggested transfers below both reflect what is actually still outstanding.
  const balances = calculateBalances({ expenses, memberIds, settlements: groupSettlements });
  const settlements = calculateSettlements({ expenses, memberIds, settlements: groupSettlements });
  const myBalance = balances[currentUser.id] ?? 0;
  const hasExpenses = expenses.length > 0;

  const openEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setExpenseMenuId(null);
    setShowAddExpense(true);
  };

  const handleDeleteExpense = (expenseId: string) => {
    deleteExpense(expenseId);
    setExpenseMenuId(null);
  };

  const handleSettle = (amount: number, method: PaymentMethod) => {
    if (!settling) return;
    addSettlement({
      fromUserId: settling.from,
      toUserId: settling.to,
      amount,
      currency: 'USD',
      groupId: id,
      date: new Date(),
      paymentMethod: method,
    });
  };

  const handleUndoPayment = (settlementId: string) => {
    deleteSettlement(settlementId);
    setUndoPaymentId(null);
  };

  const rightButtons = (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        className="gd-settings-btn"
        onClick={() => setShowEditGroup(true)}
        aria-label="Edit group"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M11 4H4C3.44772 4 3 4.44772 3 5V20C3 20.5523 3.44772 21 4 21H19C19.5523 21 20 20.5523 20 19V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18.5 2.5C19.3284 1.67157 20.6716 1.67157 21.5 2.5C22.3284 3.32843 22.3284 4.67157 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        className="gd-add-btn"
        onClick={() => { setEditingExpense(null); setShowAddExpense(true); }}
        aria-label="Add expense"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title={`${group.emoji} ${group.name}`}
        left={backBtn}
        right={rightButtons}
      />

      <div className="page-content">
        <motion.div className="gd-page-body" variants={containerVariants} initial="hidden" animate="show">

          {/* Group summary card */}
          <motion.div variants={itemVariants} className="px-5 pt-4 mb-5 gd-section-summary">
            <GlassCard variant="strong" padding="20px">
              <div className="gd-summary-row">
                <div>
                  <p className="text-xs text-secondary" style={{ marginBottom: 4 }}>Your balance</p>
                  <p
                    className={Math.abs(myBalance) < 0.005 ? 'text-secondary' : myBalance > 0 ? 'text-green' : 'text-red'}
                    style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1 }}
                  >
                    {Math.abs(myBalance) < 0.005 ? 'Settled up' : `${myBalance > 0 ? '+' : ''}${formatCurrency(myBalance)}`}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p className="text-xs text-secondary" style={{ marginBottom: 4 }}>Total spent</p>
                  <p style={{ fontWeight: 700, fontSize: 17 }}>{formatCurrency(group.totalSpent)}</p>
                </div>
              </div>

              {/* Member chips — tappable to open PersonSheet */}
              <div className="gd-member-strip">
                {group.members.map(m => {
                  const u = getUserById(m.userId);
                  if (!u) return null;
                  return (
                    <button
                      key={m.userId}
                      className="gd-member-chip gd-member-chip-btn"
                      onClick={() => setSelectedMemberId(m.userId)}
                    >
                      <Avatar user={u} size="sm" showRing={m.userId === currentUser.id} />
                      <span className="text-xs" style={{ color: m.userId === currentUser.id ? 'var(--accent-blue)' : 'var(--text-secondary)' }}>
                        {m.userId === currentUser.id ? 'You' : u.name.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </GlassCard>
          </motion.div>

          {/* Balances */}
          <motion.div variants={itemVariants} className="mb-5 gd-section-balances">
            <div className="section-header"><h3>Balances</h3></div>
            <div className="px-5">
              {!hasExpenses ? (
                <GlassCard padding="18px 16px">
                  <p className="text-sm text-secondary" style={{ textAlign: 'center' }}>
                    Add an expense to see balances
                  </p>
                </GlassCard>
              ) : (
                group.members.map(m => {
                  const u = getUserById(m.userId);
                  if (!u) return null;
                  const bal = balances[m.userId] ?? 0;
                  const isMe = m.userId === currentUser.id;
                  return (
                    <div key={m.userId} className="gd-balance-row glass" style={{ marginBottom: 8 }}>
                      <Avatar user={u} size="md" showRing={isMe} />
                      <span className="gd-balance-name">{isMe ? 'You' : u.name}</span>
                      <span className={
                        Math.abs(bal) < 0.005 ? 'text-secondary gd-balance-amount'
                          : bal > 0 ? 'text-green gd-balance-amount'
                          : 'text-red gd-balance-amount'
                      }>
                        {Math.abs(bal) < 0.005
                          ? 'settled up'
                          : `${bal > 0 ? '+' : ''}${formatCurrency(bal)}`}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>

          {/* Outstanding transfers */}
          {settlements.length > 0 && (
            <motion.div variants={itemVariants} className="mb-5 gd-section-settlements">
              <div className="section-header"><h3>Settle Up</h3></div>
              <div className="px-5">
                {settlements.map((s, i) => {
                  const from = getUserById(s.from);
                  const to = getUserById(s.to);
                  if (!from || !to) return null;
                  const isMyDebt = s.from === currentUser.id;
                  const isMyCredit = s.to === currentUser.id;
                  return (
                    <div key={i} className="gd-settlement-row glass" style={{ marginBottom: 8 }}>
                      <Avatar user={from} size="md" />
                      <div className="gd-settlement-info">
                        <span style={{ fontWeight: 600, fontSize: 14 }}>
                          <span style={{ color: isMyDebt ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                            {isMyDebt ? 'You' : from.name.split(' ')[0]}
                          </span>
                          <span className="text-secondary"> → </span>
                          <span style={{ color: isMyCredit ? 'var(--accent-green)' : 'var(--text-primary)' }}>
                            {isMyCredit ? 'you' : to.name.split(' ')[0]}
                          </span>
                        </span>
                      </div>
                      <span className={isMyDebt ? 'text-red' : isMyCredit ? 'text-green' : 'text-secondary'}
                        style={{ fontWeight: 700, fontSize: 15 }}>
                        {formatCurrency(s.amount)}
                      </span>
                      <Avatar user={to} size="md" />
                      <motion.button
                        className="gd-settle-btn"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setSettling({ from: s.from, to: s.to, amount: s.amount })}
                      >
                        {isMyDebt ? 'Pay' : isMyCredit ? 'Mark Paid' : 'Settle'}
                      </motion.button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Completed payments */}
          {sortedPayments.length > 0 && (
            <motion.div variants={itemVariants} className="mb-5 gd-section-payments">
              <div className="section-header">
                <h3>{sortedPayments.length} Payment{sortedPayments.length !== 1 ? 's' : ''}</h3>
              </div>
              <div className="px-5">
                {sortedPayments.map(p => {
                  const from = getUserById(p.fromUserId);
                  const to = getUserById(p.toUserId);
                  if (!from || !to) return null;
                  const confirming = undoPaymentId === p.id;
                  return (
                    <div key={p.id} className="gd-payment-row glass" style={{ marginBottom: 8 }}>
                      <div className="gd-payment-check">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <div className="gd-payment-info">
                        <span className="gd-payment-title">
                          {p.fromUserId === currentUser.id ? 'You' : from.name.split(' ')[0]}
                          {' paid '}
                          {p.toUserId === currentUser.id ? 'you' : to.name.split(' ')[0]}
                        </span>
                        <span className="text-xs text-secondary">
                          {formatDate(p.date)}
                          {p.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[p.paymentMethod]}` : ''}
                        </span>
                      </div>
                      <span className="text-green gd-payment-amount">{formatCurrency(p.amount)}</span>
                      {confirming ? (
                        <div className="gd-payment-confirm">
                          <button className="gd-payment-cancel" onClick={() => setUndoPaymentId(null)}>
                            Keep
                          </button>
                          <button className="gd-payment-undo-confirm" onClick={() => handleUndoPayment(p.id)}>
                            Undo
                          </button>
                        </div>
                      ) : (
                        <button
                          className="gd-payment-undo"
                          onClick={() => setUndoPaymentId(p.id)}
                          aria-label="Undo this payment"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M3 10H16C18.7614 10 21 12.2386 21 15C21 17.7614 18.7614 20 16 20H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M7 6L3 10L7 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Expenses */}
          <motion.div variants={itemVariants} className="mb-6 gd-section-expenses">
            <div className="section-header">
              <h3>{hasExpenses ? `${expenses.length} Expense${expenses.length !== 1 ? 's' : ''}` : 'Expenses'}</h3>
            </div>
            {!hasExpenses ? (
              <div className="px-5">
                <GlassCard padding="40px 20px">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                    <p style={{ fontSize: 36 }}>💸</p>
                    <p className="text-secondary">No expenses yet</p>
                    <button
                      className="gd-add-first-btn"
                      onClick={() => { setEditingExpense(null); setShowAddExpense(true); }}
                    >
                      Add the first expense
                    </button>
                  </div>
                </GlassCard>
              </div>
            ) : (
              <div className="px-5" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sortedExpenses.map(expense => {
                  const paidByUser = getUserById(expense.paidBy);
                  const isPaidByMe = expense.paidBy === currentUser.id;
                  const myEntry = expense.split.entries.find(e => e.userId === currentUser.id);
                  const myShare = myEntry?.amount ?? 0;
                  const icon = CATEGORY_ICONS[expense.category];
                  const menuOpen = expenseMenuId === expense.id;

                  return (
                    <GlassCard key={expense.id} padding="0" style={{ overflow: 'hidden' }}>
                      <div className="gd-expense-row" style={{ padding: '14px 16px' }}>
                        <div className="gd-expense-icon">{icon}</div>
                        <div className="gd-expense-info">
                          <span className="gd-expense-desc">{expense.description}</span>
                          <span className="text-xs text-secondary">
                            {isPaidByMe ? 'You' : paidByUser?.name} paid {formatCurrency(expense.amount)} · {formatDate(expense.date)}
                          </span>
                        </div>
                        <div className="gd-expense-balance">
                          <span className="text-xs text-tertiary" style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
                            {isPaidByMe ? 'you lent' : 'your share'}
                          </span>
                          <span className={isPaidByMe ? 'text-green' : 'text-red'} style={{ fontWeight: 600, fontSize: 14 }}>
                            {isPaidByMe
                              ? `+${formatCurrency(expense.amount - myShare)}`
                              : `-${formatCurrency(myShare)}`}
                          </span>
                        </div>
                        {/* Kebab menu button */}
                        <button
                          className={`gd-expense-menu-btn ${menuOpen ? 'active' : ''}`}
                          onClick={() => setExpenseMenuId(menuOpen ? null : expense.id)}
                          aria-label="Expense actions"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                            <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                          </svg>
                        </button>
                      </div>

                      {/* Action row */}
                      <AnimatePresence>
                        {menuOpen && (
                          <motion.div
                            className="gd-expense-actions"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                          >
                            <button
                              className="gd-action-edit"
                              onClick={() => openEditExpense(expense)}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                                <path d="M11 4H4C3.44772 4 3 4.44772 3 5V20C3 20.5523 3.44772 21 4 21H19C19.5523 21 20 20.5523 20 19V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M18.5 2.5C19.3284 1.67157 20.6716 1.67157 21.5 2.5C22.3284 3.32843 22.3284 4.67157 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              Edit
                            </button>
                            <div className="gd-action-divider" />
                            <button
                              className="gd-action-delete"
                              onClick={() => handleDeleteExpense(expense.id)}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                                <path d="M3 6H5H21M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6M19 6L18.1671 19.1264C18.0723 20.6999 16.7622 22 15.1847 22H8.81535C7.23784 22 5.92769 20.6999 5.83286 19.1264L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              Delete
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </GlassCard>
                  );
                })}
              </div>
            )}
          </motion.div>
        </motion.div>
      </div>

      {/* FAB */}
      <motion.button
        className="glass-fab fab-fixed"
        aria-label="Add expense"
        onClick={() => { setEditingExpense(null); setShowAddExpense(true); }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.4, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        whileTap={{ scale: 0.92 }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </motion.button>

      {/* Add / Edit expense sheet */}
      <AnimatePresence>
        {showAddExpense && (
          <AddExpenseSheet
            key={editingExpense?.id ?? 'new-expense'}
            open={showAddExpense}
            onClose={() => { setShowAddExpense(false); setEditingExpense(null); }}
            defaultGroupId={id}
            editExpense={editingExpense ?? undefined}
          />
        )}
      </AnimatePresence>

      {/* Edit group sheet */}
      <AnimatePresence>
        {showEditGroup && (
          <EditGroupSheet
            open={showEditGroup}
            onClose={() => setShowEditGroup(false)}
            group={group}
            onDeleted={() => navigate('/groups')}
          />
        )}
      </AnimatePresence>

      {/* Person sheet */}
      <AnimatePresence>
        {selectedMemberId && (
          <PersonSheet
            open={!!selectedMemberId}
            onClose={() => setSelectedMemberId(null)}
            userId={selectedMemberId}
            groupId={id!}
          />
        )}
      </AnimatePresence>

      {/* Mark a payment complete */}
      <AnimatePresence>
        {settling && (
          <SettleModal
            fromUserId={settling.from}
            toUserId={settling.to}
            amount={settling.amount}
            mode="settle"
            groupLabel={`${group.emoji} ${group.name}`}
            onClose={() => setSettling(null)}
            onConfirm={handleSettle}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
