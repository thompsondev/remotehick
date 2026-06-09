import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { catchError, lastValueFrom, map } from 'rxjs';

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

type EmailProvider = 'resend' | 'zeptomail';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly httpService: HttpService) {}

  isConfigured(): boolean {
    if (process.env.NOTIFICATION_ENABLED === 'false') return false;
    if (!process.env.EMAIL_FROM?.trim()) return false;

    const provider = this.getProvider();
    if (provider === 'resend') return !!process.env.RESEND_API_KEY?.trim();
    if (provider === 'zeptomail')
      return !!process.env.ZEPTOMAIL_API_KEY?.trim();
    return false;
  }

  async send(options: SendEmailOptions): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.debug('Email not configured — skipping send');
      return;
    }

    const recipients = Array.isArray(options.to)
      ? options.to.filter(Boolean)
      : [options.to].filter(Boolean);

    if (!recipients.length) {
      this.logger.warn('No recipients for email — skipping send');
      return;
    }

    const provider = this.getProvider();
    if (provider === 'resend') {
      await this.sendViaResend(recipients, options);
      return;
    }

    await this.sendViaZeptoMail(recipients, options);
  }

  private getProvider(): EmailProvider {
    const raw = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
    if (raw === 'zeptomail') return 'zeptomail';
    return 'resend';
  }

  private parseFromAddress(): { address: string; name?: string } {
    const from = process.env.EMAIL_FROM!.trim();
    const match = from.match(/^(.+?)\s*<([^>]+)>$/);
    if (match) {
      return { name: match[1].trim(), address: match[2].trim() };
    }
    return { address: from };
  }

  private async sendViaResend(
    recipients: string[],
    options: SendEmailOptions,
  ): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY!.trim();
    const from = process.env.EMAIL_FROM!.trim();

    const payload: Record<string, unknown> = {
      from,
      to: recipients,
      subject: options.subject,
      html: options.html,
    };
    if (options.text) payload.text = options.text;

    const response = this.httpService
      .post('https://api.resend.com/emails', payload, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      })
      .pipe(
        map((res) => res.data),
        catchError((err) => {
          const message =
            err?.response?.data?.message ??
            err?.response?.data?.error ??
            err?.message ??
            'Resend API error';
          this.logger.error(`Resend send failed: ${message}`);
          throw err;
        }),
      );

    await lastValueFrom(response);
    this.logger.log(`Email sent via Resend to ${recipients.join(', ')}`);
  }

  private async sendViaZeptoMail(
    recipients: string[],
    options: SendEmailOptions,
  ): Promise<void> {
    const apiKey = process.env.ZEPTOMAIL_API_KEY!.trim();
    const from = this.parseFromAddress();

    const payload = {
      from: {
        address: from.address,
        ...(from.name ? { name: from.name } : {}),
      },
      to: recipients.map((address) => ({
        email_address: { address },
      })),
      subject: options.subject,
      htmlbody: options.html,
      ...(options.text ? { textbody: options.text } : {}),
    };

    const response = this.httpService
      .post('https://api.zeptomail.com/v1.1/email', payload, {
        headers: {
          Authorization: apiKey.startsWith('Zoho-enczapikey')
            ? apiKey
            : `Zoho-enczapikey ${apiKey}`,
          'Content-Type': 'application/json',
        },
      })
      .pipe(
        map((res) => res.data),
        catchError((err) => {
          const message =
            err?.response?.data?.message ??
            err?.response?.data?.error?.details?.[0]?.message ??
            err?.message ??
            'ZeptoMail API error';
          this.logger.error(`ZeptoMail send failed: ${message}`);
          throw err;
        }),
      );

    await lastValueFrom(response);
    this.logger.log(`Email sent via ZeptoMail to ${recipients.join(', ')}`);
  }
}
