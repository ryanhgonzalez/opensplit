import { motion } from 'framer-motion';
import { Expense, CATEGORY_ICONS } from '../types';
import { useStore, selectCurrentUser } from '../store';
import { formatCurrency, formatDate, getShareForUser } from '../utils';
import Avatar from './Avatar';
import './ExpenseItem.css';

interface ExpenseItemProps {
  expense: Expense;
  showGroup?: boolean;
}

export default function ExpenseItem({ expense }: ExpenseItemProps) {
  const currentUser = useStore(selectCurrentUser)!;
  const users = useStore((s) => s.users);
  const paidByUser = users.find((u) => u.id === expense.paidBy);
  const isPaidByMe = expense.paidBy === currentUser.id;
  const icon = CATEGORY_ICONS[expense.category];
  const myShare = getShareForUser(expense, currentUser.id);

  return (
    <motion.div
      className="expense-item"
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.12 }}
    >
      <div className="expense-category-icon">{icon}</div>
      <div className="expense-info">
        <span className="expense-description">{expense.description}</span>
        <span className="expense-meta">
          {isPaidByMe ? 'You' : paidByUser?.name} paid {formatCurrency(expense.amount)} · {formatDate(expense.date)}
        </span>
      </div>
      <div className="expense-balance">
        {isPaidByMe ? (
          <>
            <span className="expense-balance-label">you lent</span>
            <span className="expense-balance-amount text-green">
              +{formatCurrency(expense.amount - myShare)}
            </span>
          </>
        ) : (
          <>
            <span className="expense-balance-label">your share</span>
            <span className="expense-balance-amount text-red">
              -{formatCurrency(myShare)}
            </span>
          </>
        )}
      </div>
      {paidByUser && (
        <div style={{ marginLeft: 4 }}>
          <Avatar user={paidByUser} size="sm" />
        </div>
      )}
    </motion.div>
  );
}
