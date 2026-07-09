import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AttachmentDto } from './dto/attachment.dto';

export const MAX_ATTACHMENTS_PER_TX = 5;
export const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
]);

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(userId: number, transactionId: number): Promise<AttachmentDto[]> {
    await this.assertOwnedTransaction(userId, transactionId);
    const rows = await this.prisma.attachment.findMany({
      where: { transactionId: BigInt(transactionId), userId: BigInt(userId) },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((a) => AttachmentDto.from(a));
  }

  async upload(
    userId: number,
    transactionId: number,
    file: {
      mimetype: string;
      originalname: string;
      size: number;
      buffer: Buffer;
    },
  ): Promise<AttachmentDto> {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      throw new BadRequestException('Unsupported file type');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('File exceeds the 5MB limit');
    }

    const tx = await this.assertOwnedTransaction(userId, transactionId);

    const count = await this.prisma.attachment.count({
      where: { transactionId: tx.id, userId: BigInt(userId) },
    });
    if (count >= MAX_ATTACHMENTS_PER_TX) {
      throw new ConflictException('Maximum 5 attachments per transaction');
    }

    const storageKey = `${randomUUID()}.${EXT_BY_MIME[file.mimetype]}`;
    const safeName = sanitizeFileName(file.originalname);

    await this.storage.save(storageKey, file.buffer);

    try {
      const row = await this.prisma.attachment.create({
        data: {
          userId: BigInt(userId),
          transactionId: tx.id,
          fileName: safeName,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storageKey,
        },
      });
      return AttachmentDto.from(row);
    } catch (err) {
      await this.storage.remove(storageKey);
      throw err;
    }
  }

  async download(
    userId: number,
    attachmentId: number,
    _disposition: 'attachment' | 'inline',
  ): Promise<{ bytes: Buffer; mimeType: string; fileName: string }> {
    void _disposition;
    const att = await this.assertOwnedAttachment(userId, attachmentId);
    const bytes = await this.storage.read(att.storageKey);
    return { bytes, mimeType: att.mimeType, fileName: att.fileName };
  }

  async remove(userId: number, attachmentId: number): Promise<void> {
    const att = await this.assertOwnedAttachment(userId, attachmentId);
    await this.storage.remove(att.storageKey);
    await this.prisma.attachment.delete({ where: { id: att.id } });
  }

  private async assertOwnedTransaction(userId: number, transactionId: number) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id: BigInt(transactionId), userId: BigInt(userId) },
    });
    if (!tx) {
      throw new NotFoundException('Transaction was not found');
    }
    return tx;
  }

  private async assertOwnedAttachment(userId: number, attachmentId: number) {
    const att = await this.prisma.attachment.findFirst({
      where: { id: BigInt(attachmentId), userId: BigInt(userId) },
    });
    if (!att) {
      throw new NotFoundException('Attachment was not found');
    }
    return att;
  }
}

function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const stripped = base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200);
  return stripped.length > 0 ? stripped : 'file';
}
