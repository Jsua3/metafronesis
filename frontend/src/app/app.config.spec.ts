import { readFileSync } from 'fs';
import { join } from 'path';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { MAT_CARD_CONFIG } from '@angular/material/card';
import { TestBed } from '@angular/core/testing';
import { NEVER, of } from 'rxjs';

import { appConfig, initializeAuthSession } from './app.config';
import { AuthService } from './core/auth/auth.service';
import { User } from './core/models/user.model';

const source = readFileSync(join(__dirname, 'app.config.ts'), 'utf-8');

describe('app.config: arranque', () => {
  it('registra el inicializador de sesión con un plazo de 1,5 s', () => {
    expect(source).not.toContain('APP_INITIALIZER');
    expect(source).toContain('const AUTH_SYNC_BUDGET_MS = 1500;');
    expect(source).toContain('provideAppInitializer(initializeAuthSession)');
  });

  it('usa FetchBackend por defecto (sin withXhr, ANG-9) y escuchas globales de errores (ANG-8)', () => {
    expect(source).not.toContain('withXhr');
    expect(source).toContain('provideBrowserGlobalErrorListeners()');
    expect(source).toContain('SiepErrorHandler');
  });

  it('no registra el motor de @angular/animations (ANG-2: Material anima con CSS)', () => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, { provide: AuthService, useValue: { syncCurrentUser: () => of(null) } }],
    });
    expect(TestBed.inject(ANIMATION_MODULE_TYPE, null)).toBeNull();
  });

  it('los iconos usan Material Symbols por la regla de `.mat-icon`, sin font-family !important (F1-3)', () => {
    const estilos = readFileSync(join(__dirname, '..', 'styles', 'styles.scss'), 'utf-8');
    expect(estilos).toMatch(/\.mat-icon,\s*\.material-symbols-rounded \{\s*font-family: 'Material Symbols Rounded';/);
    expect(estilos).not.toMatch(/font-family: 'Material Symbols Rounded' !important/);
  });

  it('el arranque no toca @angular/material/icon: <mat-icon> y su registro (~19 kB) quedan fuera del paquete inicial', () => {
    expect(source).not.toContain("from '@angular/material/icon'");
  });

  it('las tarjetas de Material son «outlined»: borde fino por token en vez de border-width 0 (F1-4)', () => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, { provide: AuthService, useValue: { syncCurrentUser: () => of(null) } }],
    });
    expect(TestBed.inject(MAT_CARD_CONFIG, null)?.appearance).toBe('outlined');
  });

  describe('initializeAuthSession', () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }));
    afterEach(() => vi.useRealTimers());

    function iniciar(syncCurrentUser: () => unknown) {
      TestBed.configureTestingModule({
        providers: [{ provide: AuthService, useValue: { syncCurrentUser } }],
      });
      let resuelta = false;
      const promesa = TestBed.runInInjectionContext(() => initializeAuthSession());
      promesa.then(() => { resuelta = true; });
      return { promesa, estaResuelta: () => resuelta };
    }

    it('deja de esperar a /me a los 1500 ms y resuelve con undefined', async () => {
      const { promesa, estaResuelta } = iniciar(() => NEVER);

      vi.advanceTimersByTime(1499);
      await Promise.resolve();
      expect(estaResuelta()).toBe(false);

      vi.advanceTimersByTime(1);
      await expect(promesa).resolves.toBeUndefined();
      expect(estaResuelta()).toBe(true);
    });

    it('resuelve con el usuario sin esperar el plazo si /me responde a tiempo', async () => {
      const usuario = { id: 1, email: 'ana@siep.test' } as unknown as User;
      const { promesa } = iniciar(() => of(usuario));

      await expect(promesa).resolves.toBe(usuario);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
