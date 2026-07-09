import { Attachment } from '@prisma/client';

export class AttachmentDto {
  id!: number;
  fileName!: string;
  mimeType!: string;
  sizeBytes!: number;
  createdAt!: string;

  static from(a: Attachment): AttachmentDto {
    return {
      id: Number(a.id),
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      createdAt: (a.createdAt ?? new Date()).toISOString(),
    };
  }
}
