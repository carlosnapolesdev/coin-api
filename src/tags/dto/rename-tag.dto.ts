import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RenameTagDto {
  @IsString()
  @IsNotEmpty({ message: 'Tag name is required' })
  @MaxLength(100, { message: 'Tag name must be at most 100 characters' })
  name: string;
}
