import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { catchError, lastValueFrom, map } from 'rxjs';
import * as crypto from 'crypto';

const SLACK_API_BASE = 'https://slack.com/api';

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  private readonly config = {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
  };

  constructor(private readonly httpService: HttpService) {}

  /**
   * Sends a message to a Slack channel.
   * @param channel - Channel ID or name (e.g. C01234567)
   * @param text    - Message body
   * @param threadTs - Optional thread timestamp to reply inside a thread
   */
  async sendMessage(
    channel: string,
    text: string,
    threadTs?: string,
  ): Promise<void> {
    const payload: Record<string, any> = { channel, text };
    if (threadTs) payload.thread_ts = threadTs;

    const response = this.httpService
      .post(`${SLACK_API_BASE}/chat.postMessage`, payload, this.config)
      .pipe(
        map((res) => {
          if (!res.data.ok) {
            this.logger.error(`Slack API error: ${res.data.error}`);
            throw new BadRequestException(`Slack API error: ${res.data.error}`);
          }
          return res.data;
        }),
        catchError((err) => {
          throw new BadRequestException(
            err?.message ?? 'Error sending Slack message',
          );
        }),
      );

    await lastValueFrom(response);
  }

  /**
   * Builds the Slack OAuth install URL using env-configured client ID and scopes.
   */
  buildInstallUrl(): string {
    const clientId = process.env.SLACK_CLIENT_ID;
    const scopes = process.env.SLACK_SCOPES ?? '';

    if (!clientId) {
      throw new BadRequestException('SLACK_CLIENT_ID not configured');
    }

    const params = new URLSearchParams({ client_id: clientId, scope: scopes });
    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  /**
   * Exchanges a Slack OAuth code for an access token.
   * https://api.slack.com/methods/oauth.v2.access
   */
  async exchangeOAuthCode(
    code: string,
    redirectUri: string,
  ): Promise<Record<string, any>> {
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'SLACK_CLIENT_ID or SLACK_CLIENT_SECRET not configured',
      );
    }

    const params = new URLSearchParams({
      code,
      redirect_uri: redirectUri,
    });

    const response = this.httpService
      .post(`${SLACK_API_BASE}/oauth.v2.access`, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
      })
      .pipe(
        map((res) => {
          if (!res.data.ok) {
            this.logger.error(`Slack OAuth error: ${res.data.error}`);
            throw new BadRequestException(
              `Slack OAuth error: ${res.data.error}`,
            );
          }
          return res.data;
        }),
        catchError((err) => {
          throw new BadRequestException(
            err?.message ?? 'Error exchanging Slack OAuth code',
          );
        }),
      );

    return lastValueFrom(response);
  }

  /**
   * Verifies a Slack request signature.
   * Prevents replay attacks (rejects timestamps older than 5 minutes).
   * https://api.slack.com/authentication/verifying-requests-from-slack
   */
  verifyRequest(
    signature: string,
    timestamp: string,
    rawBody: string,
  ): boolean {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      this.logger.error(
        'SLACK_SIGNING_SECRET not set — rejecting Slack request. ' +
          'Set SLACK_SIGNING_SECRET to enable Slack webhook verification.',
      );
      return false;
    }

    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
    if (parseInt(timestamp, 10) < fiveMinutesAgo) {
      this.logger.warn(
        'Slack request timestamp too old — possible replay attack',
      );
      return false;
    }

    const baseString = `v0:${timestamp}:${rawBody}`;
    const hmac = crypto
      .createHmac('sha256', signingSecret)
      .update(baseString)
      .digest('hex');
    const expected = `v0=${hmac}`;

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature),
      );
    } catch {
      return false;
    }
  }
}
