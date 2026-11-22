import { existsSync } from 'fs';
import { join } from 'path';

import * as loginConfig from './login-assets.config';

const SRC = join(__dirname, '..', '..', '..');

describe('login-assets.config', () => {
  it('solo expone lo que usa el login', () => {
    expect(Object.keys(loginConfig).sort()).toEqual([
      'LOGIN_ASSETS',
      'LOGIN_PEDAGOGY_PILLARS',
      'LOGIN_REMEMBER_EMAIL_KEY',
    ]);
  });

  it('toda ruta de asset declarada existe en disco', () => {
    const paths = Object.values(loginConfig.LOGIN_ASSETS.images);
    for (const assetPath of paths) {
      expect(existsSync(join(SRC, assetPath))).toBe(true);
    }
  });

  it('los pilares no apuntan a íconos inexistentes', () => {
    for (const pillar of loginConfig.LOGIN_PEDAGOGY_PILLARS) {
      expect(Object.keys(pillar).sort()).toEqual(['description', 'key', 'title']);
    }
  });
});
