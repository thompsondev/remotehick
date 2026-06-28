import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ChatService } from './chat.service';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OpenAccessPromptLimitGuard } from '../../middleware/guards/open-access-prompt-limit.guard';
import { AdminJwtGuard } from '../../middleware/guards/admin-jwt.guard';
import { SlackService } from 'src/lib/slack/slack.service';
import { Public } from 'src/middleware/decorators/public.decorator';

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly slackService: SlackService,
  ) {}

  @Post('prompt')
  @UseGuards(AdminJwtGuard, OpenAccessPromptLimitGuard)
  @ApiOperation({ summary: 'Generate a response from the AI' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
    },
  })
  async generateResponse(@Body() body: { prompt: string }) {
    return this.chatService.generateResponse(body.prompt);
  }

  @Post('prompt/stream')
  @UseGuards(AdminJwtGuard, OpenAccessPromptLimitGuard)
  @ApiOperation({ summary: 'Stream a response from the AI (SSE)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        history: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['user', 'assistant'] },
              content: { type: 'string' },
            },
          },
        },
        attachments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              mimeType: { type: 'string' },
              data: {
                type: 'string',
                description: 'Base64-encoded file content',
              },
            },
          },
        },
      },
    },
  })
  async streamResponse(
    @Body()
    body: {
      prompt: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      attachments?: Array<{
        name: string;
        mimeType: string;
        data: string;
      }>;
    },
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const emit = (data: object) =>
      res.write(`data: ${JSON.stringify(data)}\n\n`);

    await this.chatService.handleStreamPrompt(
      body.prompt,
      emit,
      body.history,
      body.attachments,
    );

    res.end();
  }

  // WhatsApp webhook endpoints are intentionally public. Meta's platform
  // verifies authenticity via the hub.verify_token challenge (GET) and by
  // signing payloads with the app secret (POST). They cannot carry JWT auth
  // because the caller is Meta's infrastructure, not an authenticated admin.
  @Get('webhook')
  @ApiOperation({ summary: 'WhatsApp webhook verification challenge' })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.chatService.verifyWebhook(mode, token, challenge);
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle incoming WhatsApp messages' })
  async handleWebhook(@Body() body: any) {
    await this.chatService.handleIncomingMessage(body);
    return 'OK';
  }

  @Get('slack/add')
  @Public()
  @ApiOperation({ summary: 'Redirect to Slack OAuth install page' })
  addSlackApp(@Res() res: Response) {
    const url = this.slackService.buildInstallUrl();
    return res.redirect(url);
  }

  @Get('slack/events')
  @Public()
  @ApiOperation({ summary: 'Slack OAuth callback — exchanges code for token' })
  async handleSlackOAuth(
    @Query('code') code: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!code) {
      return res.status(400).send('Missing OAuth code');
    }

    const redirectUri = `${req.protocol}://${req.get('host')}${req.path}`;
    const data = await this.slackService.exchangeOAuthCode(code, redirectUri);

    this.logger.log(
      `Slack OAuth success — team: ${data.team?.name} (${data.team?.id})`,
    );

    return res
      .status(200)
      .send(
        `<html><body><h2>Slack app installed successfully!</h2><p>Team: ${data.team?.name}</p></body></html>`,
      );
  }

  // Slack Event API webhook is intentionally public. Slack cannot send a JWT
  // bearer token; instead, each request is authenticated via HMAC-SHA256
  // request-signature verification (see verifyRequest call below).
  @Post('slack/events')
  @HttpCode(200)
  @Public()
  @ApiOperation({ summary: 'Slack Event API webhook' })
  async handleSlackEvents(
    @Req() req: Request,
    @Headers('x-slack-signature') signature: string,
    @Headers('x-slack-request-timestamp') timestamp: string,
    @Body() body: any,
  ) {
    const rawBody: string | undefined = (req as any).rawBody;

    // rawBody must always be present for Slack events (populated by the
    // raw-body middleware in main.ts). If it is missing the request did not
    // go through our capture middleware, which means we cannot verify the
    // signature — reject immediately rather than silently skipping.
    if (rawBody === undefined) {
      this.logger.warn('Rejected Slack request — raw body not available for signature verification');
      throw new UnauthorizedException('Invalid Slack signature');
    }

    const isValid = this.slackService.verifyRequest(
      signature,
      timestamp,
      rawBody,
    );
    if (!isValid) {
      this.logger.warn('Rejected Slack request — invalid signature');
      throw new UnauthorizedException('Invalid Slack signature');
    }

    if (body.type === 'url_verification') {
      return this.chatService.handleSlackChallenge(body.challenge);
    }

    if (body.type === 'event_callback') {
      this.chatService
        .handleSlackEvent(body)
        .catch((err) => this.logger.error('Error handling Slack event', err));
    }

    return { ok: true };
  }
}
