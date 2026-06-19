export type PaymentMethod = 'venmo' | 'cashapp' | 'zelle' | 'cash' | 'other';

export interface Settlement {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  groupId?: string;
  date: Date;
  paymentMethod?: PaymentMethod;
  note?: string;
  createdAt: Date;
}
