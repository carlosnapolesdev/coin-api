import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class ReportClientErrorDto {
  @IsString()
  @Length(1, 100)
  context: string;

  @IsString()
  @Length(1, 200)
  errorName: string;

  // Mínimo 0: un `new Error()` sin mensaje es legítimo y rechazarlo perdería
  // el reporte en silencio, porque el cliente traga el fallo del envío.
  @IsString()
  @Length(0, 1000)
  message: string;

  @IsOptional()
  @IsString()
  @Length(0, 8000)
  stack?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  url?: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  userAgent?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  appVersion?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  occurrences?: number;
}
