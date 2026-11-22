import { decodeJwtPayload, isJwtExpired, isJwtMalformed } from './token.utils';

describe('token utils', () => {
  it('decodes a valid JWT payload', () => {
    const jwt = token({ sub: 'admin@test.local', userId: 7, role: 'ADMIN' });

    expect(decodeJwtPayload(jwt)).toEqual(expect.objectContaining({
      sub: 'admin@test.local',
      userId: 7,
      role: 'ADMIN'
    }));
  });

  it('detects expired tokens', () => {
    const now = 1_700_000_000_000;
    expect(isJwtExpired(token({ exp: 1_699_999_999 }), now)).toBe(true);
    expect(isJwtExpired(token({ exp: 1_700_000_100 }), now)).toBe(false);
  });

  it('treats malformed tokens as invalid and expired', () => {
    expect(isJwtMalformed('not-a-jwt')).toBe(true);
    expect(isJwtExpired('not-a-jwt')).toBe(true);
  });
});

function token(payload: Record<string, unknown>): string {
  const body = {
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: 'user@test.local',
    userId: 1,
    role: 'ADMIN',
    ...payload
  };
  return `header.${base64Url(JSON.stringify(body))}.signature`;
}

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
