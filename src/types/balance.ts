export interface FriendBalance {
  userId: string;
  amount: number;
  groupId?: string;
}

export interface GroupBalance {
  groupId: string;
  yourBalance: number;
  totalSpent: number;
  memberBalances: FriendBalance[];
}

export interface OverallBalance {
  net: number;
  totalOwed: number;
  totalOwe: number;
  owedByFriend: FriendBalance[];
  oweToFriend: FriendBalance[];
}
