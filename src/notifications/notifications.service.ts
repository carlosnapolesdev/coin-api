import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationResponseDto, PushNotificationInput } from './dto';

type NotificationRow = Prisma.NotificationGetPayload<object>;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: number,
    onlyUnread = false,
  ): Promise<NotificationResponseDto[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        userId: BigInt(userId),
        ...(onlyUnread ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async markRead(userId: number, id: number): Promise<NotificationResponseDto> {
    const existing = await this.prisma.notification.findFirst({
      where: { id: BigInt(id), userId: BigInt(userId) },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Notification was not found');
    }
    await this.prisma.notification.update({
      where: { id: existing.id },
      data: { isRead: true },
    });
    const updated = await this.prisma.notification.findFirst({
      where: { id: existing.id },
    });
    return this.toResponse(updated!);
  }

  async markAllRead(userId: number): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId: BigInt(userId), isRead: false },
      data: { isRead: true },
    });
    return count;
  }

  async countUnread(userId: number): Promise<number> {
    return this.prisma.notification.count({
      where: { userId: BigInt(userId), isRead: false },
    });
  }

  async pushOnce(
    userId: number,
    input: PushNotificationInput,
  ): Promise<NotificationResponseDto> {
    const existing = await this.prisma.notification.findFirst({
      where: { userId: BigInt(userId), dedupeKey: input.dedupeKey },
    });
    if (existing) {
      return this.toResponse(existing);
    }
    const created = await this.prisma.notification.create({
      data: {
        userId: BigInt(userId),
        type: input.type,
        title: input.title,
        body: input.body,
        dedupeKey: input.dedupeKey,
        isRead: false,
      },
    });
    return this.toResponse(created);
  }

  private toResponse(row: NotificationRow): NotificationResponseDto {
    return {
      id: Number(row.id),
      type: row.type,
      title: row.title,
      body: row.body,
      isRead: row.isRead ?? false,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    };
  }
}
