import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import type { NotificationResponseDto } from './dto';

const makeRow = (
  overrides: Partial<{
    id: bigint;
    type: string;
    title: string;
    body: string;
    isRead: boolean | null;
    dedupeKey: string;
    createdAt: Date | null;
  }> = {},
) => ({
  id: overrides.id ?? BigInt(1),
  userId: BigInt(7),
  type: overrides.type ?? 'BUDGET_EXCEEDED',
  title: overrides.title ?? 'Budget exceeded',
  body: overrides.body ?? 'You exceeded Food by 20%',
  dedupeKey: overrides.dedupeKey ?? 'budget-9-202607',
  isRead: overrides.isRead ?? false,
  createdAt: overrides.createdAt ?? new Date('2026-07-15T08:00:00Z'),
});

const toResponse = (
  row: ReturnType<typeof makeRow>,
): NotificationResponseDto => ({
  id: Number(row.id),
  type: row.type,
  title: row.title,
  body: row.body,
  isRead: row.isRead ?? false,
  createdAt: row.createdAt ? row.createdAt.toISOString() : null,
});

describe('NotificationsService', () => {
  let service: NotificationsService;

  const mockPrisma = {
    notification: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  describe('pushOnce', () => {
    const input = {
      type: 'BUDGET_EXCEEDED' as const,
      title: 'Budget exceeded',
      body: 'Food is 120% used',
      dedupeKey: 'budget-9-202607',
    };

    it('creates a new notification when the dedupeKey does not yet exist', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue(makeRow());

      const result = await service.pushOnce(7, input);

      expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({
        where: { userId: BigInt(7), dedupeKey: input.dedupeKey },
      });
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: BigInt(7),
          type: input.type,
          title: input.title,
          body: input.body,
          dedupeKey: input.dedupeKey,
          isRead: false,
        },
      });
      expect(result).toEqual(expect.objectContaining({ type: input.type }));
    });

    it('does not create a duplicate when the same dedupeKey already exists (same day)', async () => {
      const existing = makeRow();
      mockPrisma.notification.findFirst.mockResolvedValue(existing);

      const result = await service.pushOnce(7, input);

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(result).toEqual(toResponse(existing));
    });

    it('creates again when the prior entry is from a previous day (key already encodes the day)', async () => {
      const yesterday = makeRow({
        dedupeKey: 'budget-9-20260714',
        createdAt: new Date('2026-07-14T08:00:00Z'),
      });
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue(makeRow());

      await service.pushOnce(7, {
        ...input,
        dedupeKey: 'budget-9-20260715',
      });

      expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({
        where: { userId: BigInt(7), dedupeKey: 'budget-9-20260715' },
      });
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ dedupeKey: 'budget-9-20260715' }),
      });
      expect(yesterday.dedupeKey).toBe('budget-9-20260714');
    });
  });

  describe('list', () => {
    it('returns all notifications for the user, newest first', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        makeRow({ id: BigInt(2), createdAt: new Date('2026-07-15T10:00:00Z') }),
        makeRow({ id: BigInt(1), createdAt: new Date('2026-07-15T08:00:00Z') }),
      ]);

      const result = await service.list(7);

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: BigInt(7) },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(2);
    });

    it('filters to only unread notifications when onlyUnread=true', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        makeRow({ isRead: false }),
      ]);

      await service.list(7, true);

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: BigInt(7), isRead: false },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns an empty list when the user has no notifications', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      const result = await service.list(7);

      expect(result).toEqual([]);
    });
  });

  describe('markRead', () => {
    it('marks a single notification as read after verifying ownership', async () => {
      mockPrisma.notification.findFirst
        .mockResolvedValueOnce({ id: BigInt(11) })
        .mockResolvedValueOnce(makeRow({ id: BigInt(11), isRead: true }));
      mockPrisma.notification.update.mockResolvedValue({});

      const result = await service.markRead(7, 11);

      expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: BigInt(11), userId: BigInt(7) },
        select: { id: true },
      });
      expect(mockPrisma.notification.update).toHaveBeenCalledWith({
        where: { id: BigInt(11) },
        data: { isRead: true },
      });
      expect(result.isRead).toBe(true);
    });

    it('throws NotFoundException when the notification does not belong to the user', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markRead(7, 999)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.notification.update).not.toHaveBeenCalled();
    });
  });

  describe('markAllRead', () => {
    it('marks every unread notification for the user as read and returns the count', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 4 });

      const count = await service.markAllRead(7);

      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: BigInt(7), isRead: false },
        data: { isRead: true },
      });
      expect(count).toBe(4);
    });

    it('returns 0 when there is nothing to mark', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const count = await service.markAllRead(7);

      expect(count).toBe(0);
    });
  });

  describe('countUnread', () => {
    it('counts notifications where isRead is false for the user', async () => {
      mockPrisma.notification.count.mockResolvedValue(3);

      const result = await service.countUnread(7);

      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: { userId: BigInt(7), isRead: false },
      });
      expect(result).toBe(3);
    });
  });
});
