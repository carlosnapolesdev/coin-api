import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CurrenciesService } from './currencies.service';
import { AddUserCurrencyDto } from './dto/add-user-currency.dto';
import { UpdateUserCurrencyDto } from './dto/update-user-currency.dto';

const mockDecimal = (value: number) => ({
  toNumber: () => value,
  toString: () => value.toString(),
});

const USD = {
  id: BigInt(1),
  code: 'USD',
  name: 'US Dollar',
  symbol: '$',
  createdAt: new Date(),
};
const EUR = {
  id: BigInt(2),
  code: 'EUR',
  name: 'Euro',
  symbol: '€',
  createdAt: new Date(),
};

const makeUserCurrency = (
  currencyId: bigint,
  opts: {
    isBase?: boolean;
    isActive?: boolean;
    exchangeRate?: number;
    currency?: typeof USD;
  } = {},
) => ({
  currencyId,
  userId: BigInt(1),
  exchangeRate: mockDecimal(opts.exchangeRate ?? 1),
  isBase: opts.isBase ?? false,
  isActive: opts.isActive ?? true,
  createdAt: new Date(),
  updatedAt: new Date(),
  currency: opts.currency ?? USD,
});

describe('CurrenciesService', () => {
  let service: CurrenciesService;

  const mockTx = {
    userCurrency: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockPrisma = {
    user: { findUnique: jest.fn() },
    currency: { findMany: jest.fn(), findUnique: jest.fn() },
    userCurrency: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
        fn(mockTx),
      ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrenciesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CurrenciesService>(CurrenciesService);
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ id: BigInt(1) });
  });

  // ─── addUserCurrency ──────────────────────────────────────────────────────

  describe('addUserCurrency', () => {
    const dto: AddUserCurrencyDto = { currencyId: 1, base: false };

    it('makes the first currency the base regardless of the base flag', async () => {
      mockPrisma.currency.findUnique.mockResolvedValue(USD);
      mockTx.userCurrency.findMany.mockResolvedValue([]);
      const created = makeUserCurrency(BigInt(1), {
        isBase: true,
        currency: USD,
      });
      mockTx.userCurrency.create.mockResolvedValue(created);

      const result = await service.addUserCurrency(1, dto);

      expect(mockTx.userCurrency.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isBase: true }),
        }),
      );
      expect(result.base).toBe(true);
    });

    it('throws ConflictException if currency is already active', async () => {
      mockPrisma.currency.findUnique.mockResolvedValue(USD);
      mockTx.userCurrency.findMany.mockResolvedValue([
        makeUserCurrency(BigInt(1), { isActive: true }),
      ]);

      await expect(service.addUserCurrency(1, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('clears the existing base and sets the new currency as base when base=true', async () => {
      const existingUsd = makeUserCurrency(BigInt(1), {
        isBase: true,
        isActive: true,
        currency: USD,
      });
      mockPrisma.currency.findUnique.mockResolvedValue(EUR);
      mockTx.userCurrency.findMany.mockResolvedValue([existingUsd]);
      const created = makeUserCurrency(BigInt(2), {
        isBase: true,
        currency: EUR,
      });
      mockTx.userCurrency.create.mockResolvedValue(created);

      await service.addUserCurrency(1, { currencyId: 2, base: true });

      expect(mockTx.userCurrency.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isBase: true, isActive: true }),
          data: expect.objectContaining({ isBase: false }),
        }),
      );
      expect(mockTx.userCurrency.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isBase: true }),
        }),
      );
    });

    it('reactivates an existing inactive currency', async () => {
      const inactive = makeUserCurrency(BigInt(1), {
        isActive: false,
        isBase: false,
        currency: USD,
      });
      mockPrisma.currency.findUnique.mockResolvedValue(USD);
      mockTx.userCurrency.findMany.mockResolvedValue([inactive]);
      const reactivated = makeUserCurrency(BigInt(1), {
        isActive: true,
        isBase: true,
        currency: USD,
      });
      mockTx.userCurrency.update.mockResolvedValue(reactivated);

      await service.addUserCurrency(1, dto);

      expect(mockTx.userCurrency.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: true }),
        }),
      );
      expect(mockTx.userCurrency.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if currency does not exist', async () => {
      mockPrisma.currency.findUnique.mockResolvedValue(null);

      await expect(service.addUserCurrency(1, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── updateUserCurrency ───────────────────────────────────────────────────

  describe('updateUserCurrency', () => {
    it('throws NotFoundException if user currency is not found', async () => {
      mockTx.userCurrency.findMany.mockResolvedValue([]);

      await expect(service.updateUserCurrency(1, 1, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequestException when trying to unset base on the active base', async () => {
      const uc = makeUserCurrency(BigInt(1), {
        isBase: true,
        isActive: true,
        currency: USD,
      });
      mockTx.userCurrency.findMany.mockResolvedValue([uc]);

      const dto: UpdateUserCurrencyDto = { base: false };
      await expect(
        service.updateUserCurrency(1, 1, dto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when deactivating the active base', async () => {
      const uc = makeUserCurrency(BigInt(1), {
        isBase: true,
        isActive: true,
        currency: USD,
      });
      mockTx.userCurrency.findMany.mockResolvedValue([uc]);

      const dto: UpdateUserCurrencyDto = { active: false };
      await expect(
        service.updateUserCurrency(1, 1, dto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('promotes currency to base and clears the previous base', async () => {
      const usd = makeUserCurrency(BigInt(1), {
        isBase: true,
        isActive: true,
        currency: USD,
      });
      const eur = makeUserCurrency(BigInt(2), {
        isBase: false,
        isActive: true,
        currency: EUR,
      });
      mockTx.userCurrency.findMany.mockResolvedValue([usd, eur]);
      const updatedEur = makeUserCurrency(BigInt(2), {
        isBase: true,
        isActive: true,
        currency: EUR,
      });
      mockTx.userCurrency.update.mockResolvedValue(updatedEur);

      await service.updateUserCurrency(1, 2, { base: true });

      expect(mockTx.userCurrency.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isBase: true, isActive: true }),
          data: expect.objectContaining({ isBase: false }),
        }),
      );
      expect(mockTx.userCurrency.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isBase: true }),
        }),
      );
    });

    it('auto-promotes to base when activating if no other active base exists', async () => {
      const usd = makeUserCurrency(BigInt(1), {
        isBase: false,
        isActive: false,
        currency: USD,
      });
      mockTx.userCurrency.findMany.mockResolvedValue([usd]);
      const activated = makeUserCurrency(BigInt(1), {
        isBase: true,
        isActive: true,
        currency: USD,
      });
      mockTx.userCurrency.update.mockResolvedValue(activated);

      await service.updateUserCurrency(1, 1, { active: true });

      expect(mockTx.userCurrency.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isBase: true, isActive: true }),
        }),
      );
    });

    it('does NOT auto-promote when activating if another active base exists', async () => {
      const usd = makeUserCurrency(BigInt(1), {
        isBase: true,
        isActive: true,
        currency: USD,
      });
      const eur = makeUserCurrency(BigInt(2), {
        isBase: false,
        isActive: false,
        currency: EUR,
      });
      mockTx.userCurrency.findMany.mockResolvedValue([usd, eur]);
      const activated = makeUserCurrency(BigInt(2), {
        isBase: false,
        isActive: true,
        currency: EUR,
      });
      mockTx.userCurrency.update.mockResolvedValue(activated);

      await service.updateUserCurrency(1, 2, { active: true });

      // isBase should NOT be set to true in the update call
      const updateCall = mockTx.userCurrency.update.mock.calls[0][0] as {
        data: { isBase?: boolean };
      };
      expect(updateCall.data.isBase).toBeUndefined();
    });
  });

  // ─── deleteUserCurrency ───────────────────────────────────────────────────

  describe('deleteUserCurrency', () => {
    it('throws NotFoundException if user currency is not found', async () => {
      mockTx.userCurrency.findMany.mockResolvedValue([]);

      await expect(service.deleteUserCurrency(1, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequestException when deleting the active base currency', async () => {
      const uc = makeUserCurrency(BigInt(1), {
        isBase: true,
        isActive: true,
        currency: USD,
      });
      mockTx.userCurrency.findMany.mockResolvedValue([uc]);

      await expect(service.deleteUserCurrency(1, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('soft-deletes an inactive currency (sets isActive=false, isBase=false)', async () => {
      const uc = makeUserCurrency(BigInt(1), {
        isBase: false,
        isActive: false,
        currency: USD,
      });
      mockTx.userCurrency.findMany.mockResolvedValue([uc]);
      mockTx.userCurrency.update.mockResolvedValue({
        ...uc,
        isActive: false,
        isBase: false,
      });

      await service.deleteUserCurrency(1, 1);

      expect(mockTx.userCurrency.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false, isBase: false }),
        }),
      );
    });

    it('soft-deletes an active non-base currency', async () => {
      const uc = makeUserCurrency(BigInt(1), {
        isBase: false,
        isActive: true,
        currency: USD,
      });
      mockTx.userCurrency.findMany.mockResolvedValue([uc]);
      mockTx.userCurrency.update.mockResolvedValue({
        ...uc,
        isActive: false,
        isBase: false,
      });

      await service.deleteUserCurrency(1, 1);

      expect(mockTx.userCurrency.update).toHaveBeenCalled();
    });
  });

  // ─── validateSelectionSet (via replaceUserCurrencies) ────────────────────

  describe('replaceUserCurrencies validation', () => {
    beforeEach(() => {
      mockPrisma.currency.findMany.mockResolvedValue([USD, EUR]);
    });

    it('throws BadRequestException for duplicate currency ids', async () => {
      await expect(
        service.replaceUserCurrencies(1, {
          currencies: [
            { currencyId: 1, base: true },
            { currencyId: 1, base: false },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when no base is selected', async () => {
      await expect(
        service.replaceUserCurrencies(1, {
          currencies: [
            { currencyId: 1, base: false },
            { currencyId: 2, base: false },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when more than one base is selected', async () => {
      await expect(
        service.replaceUserCurrencies(1, {
          currencies: [
            { currencyId: 1, base: true },
            { currencyId: 2, base: true },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
