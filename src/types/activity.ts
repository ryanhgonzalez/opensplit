interface BaseActivity {
  id: string;
  date: Date;
  actorId: string;
  groupId?: string;
}

export interface ExpenseAddedActivity extends BaseActivity {
  type: 'expense_added';
  expenseId: string;
}

export interface ExpenseUpdatedActivity extends BaseActivity {
  type: 'expense_updated';
  expenseId: string;
}

export interface ExpenseDeletedActivity extends BaseActivity {
  type: 'expense_deleted';
  expenseDescription: string;
  /** Which expense was deleted, so an undo can drop this entry again. Absent on older records. */
  expenseId?: string;
}

export interface PaymentActivity extends BaseActivity {
  type: 'payment';
  settlementId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface SettledActivity extends BaseActivity {
  type: 'settled';
  settlementId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export type Activity =
  | ExpenseAddedActivity
  | ExpenseUpdatedActivity
  | ExpenseDeletedActivity
  | PaymentActivity
  | SettledActivity;

export type ActivityType = Activity['type'];
