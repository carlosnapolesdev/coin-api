export interface GoalResponseDto {
  id: number;
  name: string;
  targetAmount: number;
  currentAmount: number;
  remaining: number;
  percentComplete: number;
  targetDate: string | null;
  accountId: number | null;
  accountName: string | null;
  isAchieved: boolean;
}
