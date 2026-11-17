import { AsyncLocalStorage } from 'async_hooks';

/**
 * Contexte de requête propagé à tous les services :
 * tenant_id, user_id, request_id, trace_id — utilisés par le logger
 * structuré (§2.1) et par le TenantDb pour RLS.
 */
export interface RequestContext {
  tenantId?: string;
  etablissementId?: string;
  userId?: string;
  clientId?: string;
  requestId: string;
  traceId?: string;
  ip?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}
