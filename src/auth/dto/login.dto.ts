import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsNotEmpty({ message: 'Identifier is required' })
  @IsString()
  identifier: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  password: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
