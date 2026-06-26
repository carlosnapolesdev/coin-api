import { AccountTemplate } from '../../common/enums/account-template.enum';
import { AccountType } from '../../common/enums/account-type.enum';

export interface AccountResponseDto {
  id: number;
  name: string;
  institution: string | null;
  type: AccountType;
  accountNumber: string | null;
  currencyId: number | null;
  currencyCode: string | null;
  currencySymbol: string | null;
  groupName: string | null;
  startBalance: number;
  notes: string | null;
  icon: string | null;
  closed: boolean;
  active: boolean;
  defaultTemplate: AccountTemplate;
  excludeFromAccountSummary: boolean;
  outlineIntoSummary: boolean;
  excludeFromBudget: boolean;
  excludeFromAnyReports: boolean;
  overdraftAt: number;
  maximumBalance: number;
  checkbook1: number;
  checkbook2: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}
