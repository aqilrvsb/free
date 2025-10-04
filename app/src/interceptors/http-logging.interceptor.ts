import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const requestIdHeader = request.headers['x-request-id'];
    const requestId =
      typeof requestIdHeader === 'string'
        ? requestIdHeader
        : Array.isArray(requestIdHeader)
        ? requestIdHeader[0]
        : randomUUID();

    (request as any).id = requestId;
    response.setHeader('x-request-id', requestId);

    const controller = context.getClass().name;
    const handler = context.getHandler().name;
    const contextLabel = `${controller}.${handler}`;

    const { method } = request;
    const url = request.originalUrl || request.url;
    const userAgent = request.get('user-agent') || '';
    const ip =
      (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      request.ip ||
      request.socket.remoteAddress ||
      '-';

    const startAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        const elapsed = Date.now() - startAt;
        const statusCode = response.statusCode;
        const contentLength = response.getHeader('content-length');

        this.logger.log(
          `[${requestId}] ${method} ${url} ${statusCode} ${elapsed}ms` +
            (contentLength ? ` - ${contentLength}b` : '') +
            ` - UA:"${userAgent}" IP:${ip}`,
          contextLabel,
        );
      }),
      catchError((error) => {
        const elapsed = Date.now() - startAt;
        const statusCode =
          (typeof error?.status === 'number' && error.status) || response.statusCode || 500;
        const message =
          typeof error?.message === 'string'
            ? error.message
            : error?.message?.message || 'Unexpected error';

        this.logger.error(
          `[${requestId}] ${method} ${url} ${statusCode} ${elapsed}ms - Error: ${message}`,
          error?.stack,
          contextLabel,
        );
        throw error;
      }),
    );
  }
}
