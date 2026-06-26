import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrencyResponseDto } from './dto/currency-response.dto';
import type { UserCurrencyResponseDto } from './dto/user-currency-response.dto';
import { AddUserCurrencyDto } from './dto/add-user-currency.dto';
import { ReplaceUserCurrenciesDto } from './dto/replace-user-currencies.dto';
import { UpdateUserCurrencyDto } from './dto/update-user-currency.dto';

type UserCurrencyWithCurrency = Prisma.UserCurrencyGetPayload<{
  include: { currency: true };
}>;

@Injectable()
export class CurrenciesService {
  constructor(private readonly prisma: PrismaService) {}

  async getAvailableCurrencies(): Promise<CurrencyResponseDto[]> {
    const currencies = await this.prisma.currency.findMany({
      orderBy: { code: 'asc' },
    });
    return currencies.map((c) => this.toCurrencyResponse(c));
  }

  async getUserCurrencies(
    userId: number,
    includeInactive: boolean,
  ): Promise<UserCurrencyResponseDto[]> {
    await this.ensureUserExists(userId);
    const userCurrencies = await this.prisma.userCurrency.findMany({
      where: {
        userId: BigInt(userId),
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: { currency: true },
      orderBy: [{ isBase: 'desc' }, { currency: { code: 'asc' } }],
    });
    return userCurrencies.map((uc) => this.toUserCurrencyResponse(uc));
  }

  async addUserCurrency(
    userId: number,
    dto: AddUserCurrencyDto,
  ): Promise<UserCurrencyResponseDto> {
    const userBigInt = BigInt(userId);
    const currencyBigInt = BigInt(dto.currencyId);

    await this.ensureUserExists(userId);

    const currency = await this.prisma.currency.findUnique({
      where: { id: currencyBigInt },
    });
    if (!currency) {
      throw new NotFoundException('Currency was not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const existingCurrencies = await tx.userCurrency.findMany({
        where: { userId: userBigInt },
        include: { currency: true },
      });

      const existingCurrency = existingCurrencies.find(
        (uc) => uc.currencyId === currencyBigInt,
      );

      if (existingCurrency?.isActive) {
        throw new ConflictException(
          'That currency is already active for the user',
        );
      }

      const hasActiveCurrencies = existingCurrencies.some((uc) => uc.isActive);
      const makeBase = dto.base === true || !hasActiveCurrencies;
      const normalizedExchangeRate = dto.exchangeRate ?? 1;

      if (makeBase) {
        await tx.userCurrency.updateMany({
          where: { userId: userBigInt, isActive: true, isBase: true },
          data: { isBase: false, updatedAt: now },
        });
      }

      if (existingCurrency) {
        const updated = await tx.userCurrency.update({
          where: {
            currencyId_userId: {
              currencyId: currencyBigInt,
              userId: userBigInt,
            },
          },
          data: {
            isActive: true,
            isBase: makeBase,
            exchangeRate: normalizedExchangeRate,
            updatedAt: now,
          },
          include: { currency: true },
        });
        return this.toUserCurrencyResponse(updated);
      }

      const created = await tx.userCurrency.create({
        data: {
          currencyId: currencyBigInt,
          userId: userBigInt,
          exchangeRate: normalizedExchangeRate,
          isBase: makeBase,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        include: { currency: true },
      });
      return this.toUserCurrencyResponse(created);
    });
  }

  async replaceUserCurrencies(
    userId: number,
    dto: ReplaceUserCurrenciesDto,
  ): Promise<UserCurrencyResponseDto[]> {
    const userBigInt = BigInt(userId);

    await this.ensureUserExists(userId);
    this.validateSelectionSet(dto.currencies);

    const currencyIds = dto.currencies.map((s) => BigInt(s.currencyId));
    const currencies = await this.prisma.currency.findMany({
      where: { id: { in: currencyIds } },
    });

    if (currencies.length !== currencyIds.length) {
      const foundIds = new Set(currencies.map((c) => c.id.toString()));
      const missingIds = currencyIds
        .filter((id) => !foundIds.has(id.toString()))
        .map(Number);
      throw new NotFoundException(
        `Currencies were not found for ids: ${missingIds.join(', ')}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const existingCurrencies = await tx.userCurrency.findMany({
        where: { userId: userBigInt },
        include: { currency: true },
      });

      const selectedIds = new Set(
        dto.currencies.map((s) => s.currencyId.toString()),
      );
      const existingByCurrencyId = new Map(
        existingCurrencies.map((uc) => [uc.currencyId.toString(), uc]),
      );

      const toDeactivate = existingCurrencies.filter(
        (uc) => !selectedIds.has(uc.currencyId.toString()),
      );
      if (toDeactivate.length > 0) {
        await tx.userCurrency.updateMany({
          where: {
            userId: userBigInt,
            currencyId: { in: toDeactivate.map((uc) => uc.currencyId) },
          },
          data: { isActive: false, isBase: false, updatedAt: now },
        });
      }

      for (const selection of dto.currencies) {
        const currencyBigInt = BigInt(selection.currencyId);
        const existing = existingByCurrencyId.get(
          selection.currencyId.toString(),
        );
        const normalizedExchangeRate = selection.exchangeRate ?? 1;

        if (existing) {
          await tx.userCurrency.update({
            where: {
              currencyId_userId: {
                currencyId: currencyBigInt,
                userId: userBigInt,
              },
            },
            data: {
              isActive: true,
              isBase: selection.base,
              exchangeRate: normalizedExchangeRate,
              updatedAt: now,
            },
          });
        } else {
          await tx.userCurrency.create({
            data: {
              currencyId: currencyBigInt,
              userId: userBigInt,
              exchangeRate: normalizedExchangeRate,
              isBase: selection.base,
              isActive: true,
              createdAt: now,
              updatedAt: now,
            },
          });
        }
      }
    });

    return this.getUserCurrencies(userId, false);
  }

  async updateUserCurrency(
    userId: number,
    currencyId: number,
    dto: UpdateUserCurrencyDto,
  ): Promise<UserCurrencyResponseDto> {
    const userBigInt = BigInt(userId);
    const currencyBigInt = BigInt(currencyId);

    await this.ensureUserExists(userId);

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const existingCurrencies = await tx.userCurrency.findMany({
        where: { userId: userBigInt },
        include: { currency: true },
      });

      const userCurrency = existingCurrencies.find(
        (uc) => uc.currencyId === currencyBigInt,
      );

      if (!userCurrency) {
        throw new NotFoundException('User currency was not found');
      }

      const data: Prisma.UserCurrencyUpdateInput = { updatedAt: now };

      // Track effective state as we apply changes (mirrors Spring Boot's in-memory mutation pattern)
      let effectiveIsBase = userCurrency.isBase ?? false;
      let effectiveIsActive = userCurrency.isActive ?? false;

      if (dto.exchangeRate !== undefined) {
        data.exchangeRate = dto.exchangeRate;
      }

      if (dto.base === true) {
        effectiveIsBase = true;
        effectiveIsActive = true;
        data.isBase = true;
        data.isActive = true;
        await tx.userCurrency.updateMany({
          where: { userId: userBigInt, isActive: true, isBase: true },
          data: { isBase: false, updatedAt: now },
        });
      } else if (dto.base === false && effectiveIsBase && effectiveIsActive) {
        throw new BadRequestException(
          'An active base currency is required for the user',
        );
      }

      if (dto.active !== undefined) {
        if (!dto.active && effectiveIsActive && effectiveIsBase) {
          throw new BadRequestException(
            'You must assign another base currency before deactivating the current one',
          );
        }
        effectiveIsActive = dto.active;
        data.isActive = dto.active;
        if (!dto.active) {
          effectiveIsBase = false;
          data.isBase = false;
        }
      }

      // Auto-promote: if activating and no other active base exists
      if (
        dto.active === true &&
        !effectiveIsBase &&
        !existingCurrencies.some(
          (uc) => uc.currencyId !== currencyBigInt && uc.isActive && uc.isBase,
        )
      ) {
        data.isBase = true;
      }

      const updated = await tx.userCurrency.update({
        where: {
          currencyId_userId: { currencyId: currencyBigInt, userId: userBigInt },
        },
        data,
        include: { currency: true },
      });

      return this.toUserCurrencyResponse(updated);
    });
  }

  async deleteUserCurrency(userId: number, currencyId: number): Promise<void> {
    const userBigInt = BigInt(userId);
    const currencyBigInt = BigInt(currencyId);

    await this.ensureUserExists(userId);

    await this.prisma.$transaction(async (tx) => {
      const existingCurrencies = await tx.userCurrency.findMany({
        where: { userId: userBigInt },
        include: { currency: true },
      });

      const userCurrency = existingCurrencies.find(
        (uc) => uc.currencyId === currencyBigInt,
      );

      if (!userCurrency) {
        throw new NotFoundException('User currency was not found');
      }

      if (userCurrency.isActive && userCurrency.isBase) {
        throw new BadRequestException(
          'You must assign another base currency before removing the current one',
        );
      }

      await tx.userCurrency.update({
        where: {
          currencyId_userId: { currencyId: currencyBigInt, userId: userBigInt },
        },
        data: { isActive: false, isBase: false, updatedAt: new Date() },
      });
    });
  }

  private async ensureUserExists(userId: number): Promise<void> {
    const exists = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('User was not found');
    }
  }

  private validateSelectionSet(selections: AddUserCurrencyDto[]): void {
    const uniqueIds = new Set<number>();
    let baseCount = 0;

    for (const selection of selections) {
      if (uniqueIds.has(selection.currencyId)) {
        throw new BadRequestException(
          'Currencies cannot contain duplicate ids',
        );
      }
      uniqueIds.add(selection.currencyId);
      if (selection.base === true) {
        baseCount++;
      }
    }

    if (baseCount !== 1) {
      throw new BadRequestException(
        'Exactly one base currency must be selected',
      );
    }
  }

  private toCurrencyResponse(currency: {
    id: bigint;
    code: string;
    name: string;
    symbol: string | null;
  }): CurrencyResponseDto {
    return {
      id: Number(currency.id),
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol,
    };
  }

  private toUserCurrencyResponse(
    uc: UserCurrencyWithCurrency,
  ): UserCurrencyResponseDto {
    return {
      currencyId: Number(uc.currencyId),
      code: uc.currency.code,
      name: uc.currency.name,
      symbol: uc.currency.symbol,
      exchangeRate: uc.exchangeRate?.toNumber() ?? 1,
      base: uc.isBase ?? false,
      active: uc.isActive ?? false,
    };
  }
}
