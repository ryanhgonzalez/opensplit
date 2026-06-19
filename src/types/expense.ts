export type ExpenseCategory =
  | 'food'
  | 'groceries'
  | 'transport'
  | 'travel'
  | 'accommodation'
  | 'shopping'
  | 'entertainment'
  | 'utilities'
  | 'rent'
  | 'healthcare'
  | 'gifts'
  | 'education'
  | 'subscriptions'
  | 'personal-care'
  | 'other';

export const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  food:          '🍽️',
  groceries:     '🛒',
  transport:     '🚗',
  travel:        '✈️',
  accommodation: '🏨',
  shopping:      '🛍️',
  entertainment: '🎬',
  utilities:     '⚡',
  rent:          '🏠',
  healthcare:    '🏥',
  gifts:         '🎁',
  education:     '📚',
  subscriptions: '📱',
  'personal-care': '💆',
  other:         '📦',
};

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food:          'Food & Drink',
  groceries:     'Groceries',
  transport:     'Transport',
  travel:        'Travel',
  accommodation: 'Accommodation',
  shopping:      'Shopping',
  entertainment: 'Entertainment',
  utilities:     'Utilities',
  rent:          'Rent',
  healthcare:    'Healthcare',
  gifts:         'Gifts',
  education:     'Education',
  subscriptions: 'Subscriptions',
  'personal-care': 'Personal Care',
  other:         'Other',
};

export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares';

export interface SplitEntry {
  userId: string;
  amount: number;
}

export interface ExpenseSplit {
  type: SplitType;
  entries: SplitEntry[];
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  currency: string;
  paidBy: string;
  groupId?: string;
  date: Date;
  split: ExpenseSplit;
  category: ExpenseCategory;
  notes?: string;
  receiptUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}
