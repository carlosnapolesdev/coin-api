import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
  const mockMail = { send: jest.fn() };
  const mockAuth = { issueToken: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMail },
        { provide: AuthService, useValue: mockAuth },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
    mockMail.send.mockResolvedValue(true);
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

    it('uses defaults for malformed onboarding field types', async () => {
      mockPrisma.user.update.mockResolvedValue({
        id: 1n,
        fullName: 'User Name',
        email: 'user@test.com',
        username: 'user1',
        language: 'en',
        onboardingState: {
          coachSeen: ['dashboard', 1],
          checklistDismissed: 'true',
          celebrationShown: 1,
          reportsVisited: {},
          tourVersion: '2',
        },
      });

      const result = await service.updateProfile(1, {});

      expect(result.onboardingState).toEqual({
        coachSeen: [],
        checklistDismissed: false,
        celebrationShown: false,
        reportsVisited: false,
        tourVersion: 0,
      });
    });

    it.each([-1, 1.5])(
      'uses the default for invalid tourVersion %s',
      async (tourVersion) => {
        mockPrisma.user.update.mockResolvedValue({
          id: 1n,
          fullName: 'User Name',
          email: 'user@test.com',
          username: 'user1',
          language: 'en',
          onboardingState: { tourVersion },
        });

        const result = await service.updateProfile(1, {});

        expect(result.onboardingState.tourVersion).toBe(0);
      },
    );
  });

  describe('updateOnboarding', () => {
    const sqlOf = (call: unknown[]) =>
      (call[0] as string[]).join('?').replace(/\s+/g, ' ');

    it('merges server-side in a single statement instead of read-modify-write', async () => {
      // Regresión: el merge en Node (findUnique + update) reescribía el objeto
      // entero desde una lectura obsoleta, así que dos PATCH parciales
      // concurrentes se pisaban y el segundo revertía el campo del primero.
      mockPrisma.$queryRaw.mockResolvedValue([
        { onboarding_state: { reportsVisited: true } },
      ]);

      await service.updateOnboarding(1, { reportsVisited: true });

      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);

      const call = mockPrisma.$queryRaw.mock.calls[0] as unknown[];
      expect(sqlOf(call)).toContain(
        "SET onboarding_state = ?::jsonb || COALESCE(onboarding_state, '{}'::jsonb) || ?::jsonb",
      );
      // Sólo viaja el parcial: el estado previo nunca sale de la base.
      expect(JSON.parse(call[2] as string)).toEqual({ reportsVisited: true });
      expect(call[3]).toBe(1n);
    });

    it('passes defaults that lose against both stored state and the patch', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ onboarding_state: {} }]);

      await service.updateOnboarding(1, { checklistDismissed: true });

      const call = mockPrisma.$queryRaw.mock.calls[0] as unknown[];
      expect(JSON.parse(call[1] as string)).toEqual({
        coachSeen: [],
        checklistDismissed: false,
        celebrationShown: false,
        reportsVisited: false,
        tourVersion: 0,
      });
      // Los defaults van primero para que `||` los sobrescriba, no al revés.
      expect(sqlOf(call)).toMatch(
        /SET onboarding_state = \?::jsonb \|\| COALESCE/,
      );
    });

    it('normalizes the row returned by the update', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { onboarding_state: { reportsVisited: true, tourVersion: 'nope' } },
      ]);

      const result = await service.updateOnboarding(1, {
        reportsVisited: true,
      });

      expect(result).toEqual({
        coachSeen: [],
        checklistDismissed: false,
        celebrationShown: false,
        reportsVisited: true,
        tourVersion: 0,
      });
    });

    it('throws NotFoundException when no row matched', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(
        service.updateOnboarding(999, { reportsVisited: true }),
      ).rejects.toThrow(NotFoundException);
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

    it('rejects change with a bad request when current password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: await bcrypt.hash('right', 10),
      });

      await expect(
        service.changePassword(1, {
          currentPassword: 'wrong',
          newPassword: 'NewPass1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('notifies the account owner by email after a successful change', async () => {
      // Si alguien secuestra la cuenta y cambia la contraseña, el dueño no se
      // entera hasta que intenta entrar. El aviso llega a su bandeja, que el
      // atacante no controla.
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: await bcrypt.hash('right', 10),
        email: 'user@test.com',
      });

      await service.changePassword(1, {
        currentPassword: 'right',
        newPassword: 'NewPass1',
      });

      expect(mockMail.send).toHaveBeenCalledTimes(1);
      const [to, subject, html] = mockMail.send.mock.calls[0] as string[];
      expect(to).toBe('user@test.com');
      expect(subject).toContain('contraseña');
      // No debe llevar enlaces de acción: un correo de aviso que pide pulsar
      // algo es indistinguible de un phishing.
      expect(html).not.toContain('<a href');
    });

    it('does not notify when the current password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: await bcrypt.hash('right', 10),
        email: 'user@test.com',
      });

      await expect(
        service.changePassword(1, {
          currentPassword: 'wrong',
          newPassword: 'NewPass1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockMail.send).not.toHaveBeenCalled();
    });

    it('still changes the password when the notification fails', async () => {
      // El aviso es best-effort: que no salga el correo no puede impedir que el
      // usuario cambie su contraseña.
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: await bcrypt.hash('right', 10),
        email: 'user@test.com',
      });
      mockMail.send.mockResolvedValue(false);

      await expect(
        service.changePassword(1, {
          currentPassword: 'right',
          newPassword: 'NewPass1',
        }),
      ).resolves.toBeUndefined();
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
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

    it('records the cutoff and returns a freshly issued token', async () => {
      const hash = await bcrypt.hash('oldpass1', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: hash,
        email: 'user@test.com',
      });
      mockPrisma.user.update.mockResolvedValue({ id: BigInt(4) });
      mockAuth.issueToken.mockReturnValue({
        token: 'fresh',
        tokenType: 'Bearer',
        expiresAt: new Date(),
      });

      const result = await service.changePassword(4, {
        currentPassword: 'oldpass1',
        newPassword: 'newpass1',
      });

      const update = mockPrisma.user.update.mock.calls[0][0];
      expect(update.data.credentialsChangedAt).toBeInstanceOf(Date);
      expect(update.data.credentialsChangedAt.getMilliseconds()).toBe(0);
      expect(result.token).toBe('fresh');
    });
  });
});
