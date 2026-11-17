import { randomUUID } from 'crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { requestContext, RequestContext } from './als';
import { JsonLogger } from './json.logger';

/**
 * Résout le contexte de requête : request_id, trace_id (OTel W3C),
 * tenant_id (header X-Tenant-Id ou slug public), user_id (JWT — rempli
 * par le guard JWT plus tard ; ici on propage ce qui est présent).
 * Ne valide PAS le JWT : c'est le rôle du guard.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly logger: JsonLogger) {}

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = (req.headers['x-request-id'] as string) || `req_${randomUUID()}`;
    const traceparent = req.headers['traceparent'] as string | undefined;
    const traceId = traceparent?.split('-')[1];

    const ctx: RequestContext = {
      requestId,
      traceId,
      ip: req.ip,
      tenantId: (req.headers['x-tenant-id'] as string) || undefined,
      userId: (req.headers['x-user-id'] as string) || undefined,
    };

    res.setHeader('x-request-id', requestId);
    requestContext.run(ctx, () => {
      const start = Date.now();
      res.on('finish', () => {
        this.logger.log(`${req.method} ${req.route?.path ?? req.path} ${res.statusCode}`, 'http.request', {
          method: req.method,
          route: req.route?.path ?? req.path,
          status: res.statusCode,
          duration_ms: Date.now() - start,
        });
      });
      next();
    });
  }
}
