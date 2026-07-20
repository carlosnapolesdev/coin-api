import { IsEmail, IsNotEmpty, Length } from 'class-validator';

export class ResendVerificationDto {
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Email must have a valid format' })
  @Length(1, 150, { message: 'Email must be at most 150 characters' })
  email: string;
}
