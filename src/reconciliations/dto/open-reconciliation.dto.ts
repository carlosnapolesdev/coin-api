import { IsDateString, IsNumber } from 'class-validator';

export class OpenReconciliationDto {
  @IsDateString({}, { message: 'Statement date must be a valid date' })
  statementDate: string;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message:
        'Statement balance must be a number with at most 2 decimal places',
    },
  )
  statementBalance: number;
}
