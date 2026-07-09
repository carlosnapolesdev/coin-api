import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AttachmentsService } from './attachments.service';
import type { AttachmentDto } from './dto/attachment.dto';

@Controller('users/me')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get('transactions/:transactionId/attachments')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId', ParseIntPipe) transactionId: number,
  ): Promise<AttachmentDto[]> {
    return this.attachments.list(user.id, transactionId);
  }

  @Post('transactions/:transactionId/attachments')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId', ParseIntPipe) transactionId: number,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<AttachmentDto> {
    if (!file) throw new BadRequestException('Missing file field');
    return this.attachments.upload(user.id, transactionId, file);
  }

  @Get('attachments/:id/download')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('disposition') disposition: 'attachment' | 'inline' = 'attachment',
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, mimeType, fileName } = await this.attachments.download(
      user.id,
      id,
      disposition,
    );
    const encoded = encodeURIComponent(fileName);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader(
      'Content-Disposition',
      `${disposition === 'inline' ? 'inline' : 'attachment'}; filename*=UTF-8''${encoded}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).end(bytes);
  }

  @Delete('attachments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.attachments.remove(user.id, id);
  }
}
