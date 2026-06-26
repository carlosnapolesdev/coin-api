import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './dto';
import type { AccountResponseDto } from './dto';

@Controller('users/me/accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  listAccounts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<AccountResponseDto[]> {
    return this.accountsService.getUserAccounts(
      user.id,
      includeInactive === 'true',
    );
  }

  @Get(':accountId')
  getAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', ParseIntPipe) accountId: number,
  ): Promise<AccountResponseDto> {
    return this.accountsService.getAccount(user.id, accountId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAccountDto,
  ): Promise<AccountResponseDto> {
    return this.accountsService.createAccount(user.id, dto);
  }

  @Patch(':accountId')
  updateAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', ParseIntPipe) accountId: number,
    @Body() dto: UpdateAccountDto,
  ): Promise<AccountResponseDto> {
    return this.accountsService.updateAccount(user.id, accountId, dto);
  }

  @Delete(':accountId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', ParseIntPipe) accountId: number,
  ): Promise<void> {
    return this.accountsService.deleteAccount(user.id, accountId);
  }
}
