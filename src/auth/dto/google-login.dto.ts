import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GoogleLoginDto {
  @IsNotEmpty({ message: 'Google ID token is required' })
  @IsString()
  idToken: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
