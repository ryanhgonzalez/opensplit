export interface User {
  id: string;
  name: string;
  initials: string;
  email?: string;
  avatarColor: string;
  createdAt: Date;
  /**
   * Other IDs this person has gone by in files from other devices.
   *
   * There is no server to hand out one identity per person, so when someone
   * joins a shared group they may already have a profile of their own with a
   * different ID. The two are reconciled by remembering the foreign ID here;
   * every later file exchange in either direction then matches the same person.
   */
  aliases?: string[];
}
