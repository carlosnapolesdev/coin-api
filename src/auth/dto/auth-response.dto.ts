export interface UserProfileDto {
  id: number;
  fullName: string;
  email: string;
  username: string | null;
  language: string;
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
