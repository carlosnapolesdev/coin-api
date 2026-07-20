/**
 * Dispara el digest de errores de cliente bajo demanda, sin esperar al cron de
 * las 07:00. Herramienta de verificación: no forma parte del arranque de la app
 * ni se despliega.
 *
 *   npx ts-node --project tsconfig.cli.json -r tsconfig-paths/register scripts/send-digest.ts
 *
 * Envía correo REAL a CLIENT_ERRORS_DIGEST_TO si hay errores en las últimas 24 h.
 * Con `--dry` imprime a quién iría y con qué contenido, sin enviar nada.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ClientErrorsScheduler } from '../src/client-errors/client-errors.scheduler';
import { MailService } from '../src/mail/mail.service';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const scheduler = app.get(ClientErrorsScheduler);

    if (dryRun) {
      // Se sustituye el envío por un volcado a consola. Así se revisa el HTML
      // y el destinatario sin gastar cuota de Resend ni ensuciar la bandeja.
      const mail = app.get(MailService);
      jestlessSpy(mail);
    }

    await scheduler.sendDigest();
    console.log(
      dryRun
        ? '\nDry run: no se envió nada.'
        : '\nDigest disparado. Si no ves correo, revisa el log de arriba: o no había errores en las últimas 24 h, o CLIENT_ERRORS_DIGEST_TO no está definida.',
    );
  } finally {
    await app.close();
  }
}

/** Reemplaza MailService.send por un volcado a consola (solo para --dry). */
function jestlessSpy(mail: MailService): void {
  (mail as unknown as { send: MailService['send'] }).send = (
    to: string,
    subject: string,
    html: string,
    text?: string,
  ) => {
    console.log('\n--- DIGEST (dry run) ---');
    console.log('To:      ', to);
    console.log('Subject: ', subject);
    console.log('HTML:\n' + html);
    console.log('\nTexto plano:\n' + (text ?? '(derivado del HTML)'));
    console.log('--- fin ---');
    return Promise.resolve(true);
  };
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
