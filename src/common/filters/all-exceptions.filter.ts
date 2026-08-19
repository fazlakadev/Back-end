import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
  errors?: Record<string, string[]>;
  attemptsLeft?: number;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const url = httpAdapter.getRequestUrl(request);
    const isOAuthCallback = /\/auth\/(google|github|facebook)\/callback/.test(url);

    if (isOAuthCallback) {
      const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3000';
      this.logger.error(
        `OAuth callback error on ${url}: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      response.redirect(`${websiteUrl}/login?error=${encodeURIComponent('oauth_failed')}`);
      return;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Partial<ErrorResponse> = {
      message: 'Internal server error',
      error: 'InternalServerError',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      this.logger.error(`[${status}] ${exception.message}`, (exception as Error).stack);
      if (typeof res === 'string') {
        body = { message: res, error: exception.name };
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        body = {
          message: (r.message as string | string[]) ?? exception.message,
          error: (r.error as string) ?? exception.name,
          errors: r.errors as Record<string, string[]>,
          attemptsLeft:
            typeof r.attemptsLeft === 'number' ? r.attemptsLeft : undefined,
        };
      }
    } else if (exception instanceof Error) {
      this.logger.error(`[OAuth?] ${exception.message}`, exception.stack);
      body.message = exception.message;
    }

    const payload: ErrorResponse = {
      statusCode: status,
      message: body.message ?? 'Internal server error',
      error: body.error ?? 'InternalServerError',
      path: httpAdapter.getRequestUrl(request),
      timestamp: new Date().toISOString(),
      ...(body.errors ? { errors: body.errors } : {}),
      ...(body.attemptsLeft !== undefined
        ? { attemptsLeft: body.attemptsLeft }
        : {}),
    };

    httpAdapter.reply(response, payload, status);
  }
}
