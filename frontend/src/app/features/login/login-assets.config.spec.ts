import * as loginConfig from './login-assets.config';

describe('login-assets.config', () => {
  it('solo expone lo que usa el login', () => {
    expect(Object.keys(loginConfig).sort()).toEqual([
      'LOGIN_PEDAGOGY_PILLARS',
      'LOGIN_REMEMBER_EMAIL_KEY',
    ]);
  });

  it('los pilares no apuntan a íconos inexistentes', () => {
    for (const pillar of loginConfig.LOGIN_PEDAGOGY_PILLARS) {
      expect(Object.keys(pillar).sort()).toEqual(['description', 'key', 'title']);
    }
  });
});
