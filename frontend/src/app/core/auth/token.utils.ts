import { User } from '../models/user.model';

export interface JwtPayload {
  sub?: string;
  userId?: number;
  role?: User['role'];
  exp?: number;
}

export function decodeJwtPayload(token: string | null): JwtPayload | null {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, '=');
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string | null, nowMs = Date.now()): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp || typeof payload.exp !== 'number') {
    return true;
  }
  return payload.exp * 1000 <= nowMs;
}

export function isJwtMalformed(token: string | null): boolean {
  return !!token && !decodeJwtPayload(token);
}
