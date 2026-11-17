import { Injectable, LoggerService, LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRequestContext } from './als';

/**
 * Logger JSON structuré (docs/02 §2.1).
 * Champs obligatoires : timestamp, level, service, event, tenant_id,
 * request_id/trace_id. Masquage PII et secrets (§2.2).
 */
const SENSITIVE_KEYS = /pass(word)?|token|secret|otp|cvv|card|authorization|cookie|jwt|refresh|pin|cle|key/i;
const PII_KEYS = /phone|telephone|email|nom|prenom|name/i;

function maskPII(value: string): string {
  if (value.includes('@')) {
    const [u, d] = value.split('@');
    return `${u.slice(0, 1)}•••@${d}`;
  }
  return `${value.slice(0, 4)}•••••${value.slice(-2)}`;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.length > 200) return `${value.slice(0, 200)}…[truncated]`;
    return value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.test(k)) {
      out[k] = '[REDACTED]';
    } else if (PII_KEYS.test(k) && typeof v === 'string') {
      out[k] = maskPII(v);
    } else {
      out[k] = sanitize(v, depth + 1);
    }
  }
  return out;
}

@Injectable()
export class JsonLogger implements LoggerService {
  private levels: LogLevel[] = ['log', 'error', 'warn', 'debug', 'verbose'];

  constructor(private readonly config: ConfigService) {
    const lvl = this.config.get<string>('LOG_LEVEL', 'info');
    this.levels = this.mapLevel(lvl);
  }

  private mapLevel(lvl: string): LogLevel[] {
    switch (lvl) {
      case 'fatal': return ['error'];
      case 'error': return ['error', 'warn'];
      case 'warn': return ['error', 'warn', 'log'];
      case 'debug': return ['error', 'warn', 'log', 'debug', 'verbose'];
      default: return ['error', 'warn', 'log']; // info
    }
  }

  private write(level: string, message: unknown, context?: string, extra?: Record<string, unknown>) {
    if (!this.levels.includes(level === 'log' ? 'log' : (level as LogLevel))) return;
    const ctx = getRequestContext();
    const entry = {
      timestamp: new Date().toISOString(),
      level: level === 'log' ? 'info' : level,
      service: 'svc-api',
      event: typeof message === 'string' ? message : (context ?? 'app.log'),
      tenant_id: ctx?.tenantId ?? null,
      etablissement_id: ctx?.etablissementId ?? null,
      user_id: ctx?.userId ?? null,
      client_id: ctx?.clientId ?? null,
      request_id: ctx?.requestId ?? null,
      trace_id: ctx?.traceId ?? null,
      ip: ctx?.ip ?? null,
      message: typeof message === 'string' ? message : JSON.stringify(sanitize(message)),
      context: sanitize({ ...(extra ?? {}), ...(typeof message === 'object' ? { data: message } : {}) }),
      env: this.config.get<string>('NODE_ENV', 'development'),
      version: process.env.npm_package_version ?? '0.0.0',
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  }

  log(message: unknown, context?: string, extra?: Record<string, unknown>) {
    this.write('log', message, context, extra);
  }
  error(message: unknown, trace?: string, context?: string) {
    this.write('error', message, context, trace ? { stack: trace } : undefined);
  }
  warn(message: unknown, context?: string, extra?: Record<string, unknown>) {
    this.write('warn', message, context, extra);
  }
  debug(message: unknown, context?: string, extra?: Record<string, unknown>) {
    this.write('debug', message, context, extra);
  }
  verbose(message: unknown, context?: string, extra?: Record<string, unknown>) {
    this.write('verbose', message, context, extra);
  }
  fatal(message: unknown, context?: string, extra?: Record<string, unknown>) {
    this.write('error', message, context, extra);
  }
}
