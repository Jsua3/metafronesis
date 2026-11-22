import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { appConfig } from './app.config';

@Component({ template: '' })
class Screen {}

describe('navegación de la primera ola', () => {
  it('cambia de pantalla sin iniciar transiciones de vista', async () => {
    const start = vi.fn((callback: () => void) => {
      callback();
      return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition: vi.fn() };
    });
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start });
    try {
      TestBed.configureTestingModule({ providers: [...appConfig.providers, provideRouter([{ path: 'a', component: Screen }, { path: 'b', component: Screen }])] });
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/a');
      await router.navigateByUrl('/b');
      expect(router.url).toBe('/b');
      expect(start).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition');
    }
  });
});
