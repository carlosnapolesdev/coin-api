import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 100, { message: 'Full name must be at most 100 characters' })
  fullName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 10, { message: 'Language must be at most 10 characters' })
  language?: string;
}
