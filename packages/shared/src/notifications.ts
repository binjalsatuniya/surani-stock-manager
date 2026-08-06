// Activities that can trigger a phone push notification. An admin chooses, per user, which of
// these that user receives (stored on User.preferences.notify — a map of key -> boolean).
// A user is never notified about their own action; only about actions taken by others.

export const NOTIFY_ACTIVITIES = [
  { key: 'order_placed', label: 'New order placed' },
  { key: 'order_dispatched', label: 'Order dispatched' },
  { key: 'order_delivered', label: 'Order delivered' },
  { key: 'payment', label: 'Payment recorded' },
  { key: 'inward', label: 'New Inward (stock in)' },
  { key: 'outward', label: 'New Outward (stock out)' },
  { key: 'expense', label: 'New expense added' },
] as const;

export type NotifyActivityKey = (typeof NOTIFY_ACTIVITIES)[number]['key'];

export type NotifyPrefs = Partial<Record<NotifyActivityKey, boolean>>;

/** Reads the notify-preferences bag off a user's free-form preferences JSON. */
export function readNotifyPrefs(preferences: unknown): NotifyPrefs {
  if (!preferences || typeof preferences !== 'object') return {};
  const notify = (preferences as Record<string, unknown>).notify;
  if (!notify || typeof notify !== 'object') return {};
  return notify as NotifyPrefs;
}

/** Whether a user wants to be notified about a given activity (defaults to false when unset). */
export function wantsNotification(preferences: unknown, key: NotifyActivityKey): boolean {
  return readNotifyPrefs(preferences)[key] === true;
}
