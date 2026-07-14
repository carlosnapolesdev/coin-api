import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('updateProfile', () => {
    it('updates only the provided fields and returns the profile', async () => {
      mockPrisma.user.update.mockResolvedValue({
        id: 1n,
        fullName: 'New Name',
        email: 'user@test.com',
        username: 'user1',
        language: 'es',
        onboardingState: null,
      });

      const result = await service.updateProfile(1, {
        fullName: 'New Name',
        language: 'es',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: expect.objectContaining({
          fullName: 'New Name',
          language: 'es',
        }),
      });
      expect(result).toEqual({
        id: 1,
        fullName: 'New Name',
        email: 'user@test.com',
        username: 'user1',
        language: 'es',
        onboardingState: {
          coachSeen: [],
          checklistDismissed: false,
          celebrationShown: false,
          reportsVisited: false,
          tourVersion: 0,
        },
      });
    });
  });

  describe('changePassword', () => {
    it('throws NotFoundException when the user has no password hash', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.changePassword(1, {
          currentPassword: 'whatever',
          newPassword: 'NewPass1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects change when current password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: await bcrypt.hash('right', 10),
      });

      await expect(
        service.changePassword(1, {
          currentPassword: 'wrong',
          newPassword: 'NewPass1',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('hashes and stores the new password when current password is correct', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: await bcrypt.hash('right', 10),
      });

      await service.changePassword(1, {
        currentPassword: 'right',
        newPassword: 'NewPass1',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
      const data = mockPrisma.user.update.mock.calls[0][0].data as {
        passwordHash: string;
      };
      expect(data.passwordHash).not.toEqual('NewPass1');
      expect(await bcrypt.compare('NewPass1', data.passwordHash)).toBe(true);
    });
  });
});
