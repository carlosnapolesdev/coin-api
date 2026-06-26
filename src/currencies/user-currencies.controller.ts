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
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CurrenciesService } from './currencies.service';
import { AddUserCurrencyDto } from './dto/add-user-currency.dto';
import { ReplaceUserCurrenciesDto } from './dto/replace-user-currencies.dto';
import { UpdateUserCurrencyDto } from './dto/update-user-currency.dto';
import type { UserCurrencyResponseDto } from './dto/user-currency-response.dto';

@Controller('users/me/currencies')
export class UserCurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @Get()
  listUserCurrencies(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<UserCurrencyResponseDto[]> {
    return this.currenciesService.getUserCurrencies(
      user.id,
      includeInactive === 'true',
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  addUserCurrency(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddUserCurrencyDto,
  ): Promise<UserCurrencyResponseDto> {
    return this.currenciesService.addUserCurrency(user.id, dto);
  }

  @Put()
  replaceUserCurrencies(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReplaceUserCurrenciesDto,
  ): Promise<UserCurrencyResponseDto[]> {
    return this.currenciesService.replaceUserCurrencies(user.id, dto);
  }

  @Patch(':currencyId')
  updateUserCurrency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('currencyId', ParseIntPipe) currencyId: number,
    @Body() dto: UpdateUserCurrencyDto,
  ): Promise<UserCurrencyResponseDto> {
    return this.currenciesService.updateUserCurrency(user.id, currencyId, dto);
  }

  @Delete(':currencyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUserCurrency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('currencyId', ParseIntPipe) currencyId: number,
  ): Promise<void> {
    return this.currenciesService.deleteUserCurrency(user.id, currencyId);
  }
}
