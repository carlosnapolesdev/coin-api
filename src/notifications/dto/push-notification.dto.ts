export type NotificationType =
  'BUDGET_EXCEEDED' | 'LOW_BALANCE' | 'UPCOMING_PAYMENT';

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'BUDGET_EXCEEDED',
  'LOW_BALANCE',
  'UPCOMING_PAYMENT',
] as const;

export interface PushNotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  dedupeKey: string;
}
