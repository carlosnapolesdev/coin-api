import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  // MVP: log the link. Swap for a real transport (nodemailer/SES/Resend) when SMTP_* env vars exist.
  sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    this.logger.log(`Password reset for ${email}: ${resetUrl}`);
    return Promise.resolve();
  }
}
