import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  AttachmentsService,
  MAX_ATTACHMENTS_PER_TX,
  MAX_BYTES,
} from './attachments.service';

const makeAttachment = (
  overrides: Partial<{
    id: bigint;
    userId: bigint;
    transactionId: bigint;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    createdAt: Date;
  }> = {},
) => ({
  id: BigInt(10),
  userId: BigInt(1),
  transactionId: BigInt(20),
  fileName: 'receipt.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  storageKey: 'key-1.pdf',
  createdAt: new Date('2026-07-09T10:00:00Z'),
  ...overrides,
});

const makeFile = (mime: string, bytes: Buffer): Express.Multer.File => ({
  fieldname: 'file',
  originalname: 'receipt.pdf',
  encoding: '7bit',
  mimetype: mime,
  size: bytes.length,
  buffer: bytes,
  destination: '',
  filename: '',
  path: '',
  stream: Readable.from(bytes),
});

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  const mockPrisma = {
    transaction: { findFirst: jest.fn() },
    attachment: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  };
  const mockStorage = {
    save: jest.fn(),
    read: jest.fn(),
    remove: jest.fn(),
    exists: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();
    service = module.get(AttachmentsService);
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('returns DTOs ordered by createdAt asc, scoped to user', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue({ id: BigInt(20) });
      mockPrisma.attachment.findMany.mockResolvedValue([
        makeAttachment({ id: BigInt(1) }),
        makeAttachment({ id: BigInt(2), fileName: 'b.pdf' }),
      ]);
      const res = await service.list(1, 20);
      expect(mockPrisma.attachment.findMany).toHaveBeenCalledWith({
        where: { transactionId: BigInt(20), userId: BigInt(1) },
        orderBy: { createdAt: 'asc' },
      });
      expect(res).toHaveLength(2);
      expect(res[0].fileName).toBe('receipt.pdf');
    });

    it('404 when transaction does not belong to user', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);
      await expect(service.list(1, 20)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('upload', () => {
    it('rejects unsupported mime with BadRequestException', async () => {
      await expect(
        service.upload(1, 20, makeFile('text/plain', Buffer.from('x'))),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects file > 5MB with BadRequestException', async () => {
      const big = Buffer.alloc(MAX_BYTES + 1);
      await expect(
        service.upload(1, 20, makeFile('application/pdf', big)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects when transaction is not the user's", async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);
      await expect(
        service.upload(1, 20, makeFile('application/pdf', Buffer.from('x'))),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns ConflictException TOO_MANY_ATTACHMENTS when at limit', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue({ id: BigInt(20) });
      mockPrisma.attachment.count.mockResolvedValue(MAX_ATTACHMENTS_PER_TX);
      await expect(
        service.upload(1, 20, makeFile('application/pdf', Buffer.from('x'))),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('happy path: generates storageKey, saves to storage, creates row, returns DTO', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue({ id: BigInt(20) });
      mockPrisma.attachment.count.mockResolvedValue(0);
      mockPrisma.attachment.create.mockImplementation(({ data }: any) =>
        makeAttachment({
          id: BigInt(99),
          storageKey: data.storageKey,
          fileName: data.fileName,
          sizeBytes: data.sizeBytes,
          mimeType: data.mimeType,
        }),
      );
      const res = await service.upload(
        1,
        20,
        makeFile('application/pdf', Buffer.from('pdf-bytes')),
      );
      expect(mockStorage.save).toHaveBeenCalledTimes(1);
      const [saveKey, saveBuf] = mockStorage.save.mock.calls[0];
      expect(saveKey).toMatch(/^[0-9a-f-]{8,}\.pdf$/i);
      expect(saveBuf.equals(Buffer.from('pdf-bytes'))).toBe(true);
      expect(res.id).toBe(99);
      expect(res.mimeType).toBe('application/pdf');
    });

    it('rolls back storage if DB create throws', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue({ id: BigInt(20) });
      mockPrisma.attachment.count.mockResolvedValue(0);
      mockPrisma.attachment.create.mockRejectedValue(new Error('db down'));
      await expect(
        service.upload(1, 20, makeFile('image/png', Buffer.from('png'))),
      ).rejects.toThrow('db down');
      expect(mockStorage.remove).toHaveBeenCalledTimes(1);
    });
  });

  describe('download', () => {
    it('404 when attachment does not belong to user', async () => {
      mockPrisma.attachment.findFirst.mockResolvedValue(null);
      await expect(service.download(1, 99, 'inline')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('reads bytes via storage and returns mime + fileName', async () => {
      mockPrisma.attachment.findFirst.mockResolvedValue(makeAttachment());
      mockStorage.read.mockResolvedValue(Buffer.from('bytes'));
      const out = await service.download(1, 10, 'attachment');
      expect(mockStorage.read).toHaveBeenCalledWith('key-1.pdf');
      expect(out.bytes.toString()).toBe('bytes');
      expect(out.mimeType).toBe('application/pdf');
      expect(out.fileName).toBe('receipt.pdf');
    });
  });

  describe('remove', () => {
    it('404 when attachment does not belong to user', async () => {
      mockPrisma.attachment.findFirst.mockResolvedValue(null);
      await expect(service.remove(1, 99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('removes from storage and DB', async () => {
      mockPrisma.attachment.findFirst.mockResolvedValue(makeAttachment());
      mockPrisma.attachment.delete.mockResolvedValue(undefined);
      await service.remove(1, 10);
      expect(mockStorage.remove).toHaveBeenCalledWith('key-1.pdf');
      expect(mockPrisma.attachment.delete).toHaveBeenCalledWith({
        where: { id: BigInt(10) },
      });
    });
  });
});
