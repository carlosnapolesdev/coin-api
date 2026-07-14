export interface OnboardingState {
  coachSeen: string[];
  checklistDismissed: boolean;
  celebrationShown: boolean;
  reportsVisited: boolean;
  tourVersion: number;
}

export interface UserProfileDto {
  id: number;
  fullName: string;
  email: string;
  username: string | null;
  language: string;
  onboardingState: OnboardingState;
}

export interface RegisterResponseDto {
  id: number;
  fullName: string;
  email: string;
  username: string | null;
  language: string;
  createdAt: Date | null;
}

export interface AuthResponseDto {
  token: string;
  tokenType: string;
  expiresAt: Date;
  user: UserProfileDto;
}
