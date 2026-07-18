export interface NotificationResponseDto {
  id: number;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string | null;
}
