import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect, it, vi } from 'vitest';
import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import type { WorldComment } from '../../core/models/simulation.model';
import { KitService } from '../character/kit/kit.service';
import { fakeKitService } from '../character/kit/testing/kit-testing';
import { CommentBubbleComponent } from './comment-bubble.component';
import { DRAFT_COPY } from './draft-copy';

const COMENTARIO: WorldComment = { id: '7-0', objectKey: 'abuela', line: '¿Usted es la psicóloga?', emotion: 'cautelosa', gesture: null };

interface Entradas {
  comment: WorldComment | null;
  speaker: { nombre: string; visual: null } | null;
  anchor: { x: number; y: number } | null;
}

function montar(opts: { reduceMotion?: boolean } = {}) {
  const announcer = { announce: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: LiveRegionAnnouncer, useValue: announcer },
      { provide: KitService, useValue: fakeKitService() },
    ],
  });
  const fixture = TestBed.createComponent(CommentBubbleComponent);
  fixture.componentRef.setInput('reduceMotion', opts.reduceMotion ?? false);
  const el = fixture.nativeElement as HTMLElement;
  const poner = (entradas: Entradas) => {
    fixture.componentRef.setInput('comment', entradas.comment);
    fixture.componentRef.setInput('speaker', entradas.speaker);
    fixture.componentRef.setInput('anchor', entradas.anchor);
    fixture.detectChanges();
  };
  return { fixture, el, announcer, poner };
}

it('muestra la línea con data-comment y se anuncia una sola vez', () => {
  const { el, announcer, poner } = montar();
  poner({ comment: COMENTARIO, speaker: { nombre: 'Abuela', visual: null }, anchor: { x: 120, y: 80 } });
  poner({ comment: COMENTARIO, speaker: { nombre: 'Abuela', visual: null }, anchor: { x: 130, y: 80 } });
  expect(el.querySelector('[data-comment]')!.getAttribute('data-comment')).toBe('7-0');
  expect(el.textContent).toContain('¿Usted es la psicóloga?');
  expect(announcer.announce).toHaveBeenCalledTimes(1);
  expect(announcer.announce).toHaveBeenCalledWith('Abuela: ¿Usted es la psicóloga?', 'polite');
});

it('el mismo comentario llegando como un objeto nuevo (mismo id) no se anuncia de nuevo', () => {
  const { announcer, poner } = montar();
  poner({ comment: COMENTARIO, speaker: { nombre: 'Abuela', visual: null }, anchor: { x: 120, y: 80 } });
  poner({ comment: { ...COMENTARIO }, speaker: { nombre: 'Abuela', visual: null }, anchor: { x: 120, y: 80 } });
  expect(announcer.announce).toHaveBeenCalledTimes(1);
});

it('un comentario distinto se anuncia de nuevo', () => {
  const { announcer, poner } = montar();
  poner({ comment: COMENTARIO, speaker: { nombre: 'Abuela', visual: null }, anchor: null });
  poner({ comment: { ...COMENTARIO, id: '7-1', line: 'Pase, por favor.' }, speaker: { nombre: 'Abuela', visual: null }, anchor: null });
  expect(announcer.announce).toHaveBeenCalledTimes(2);
  expect(announcer.announce).toHaveBeenLastCalledWith('Abuela: Pase, por favor.', 'polite');
});

it('se coloca sobre el ancla y, sin ancla, abajo al centro', () => {
  const { el, poner } = montar();
  poner({ comment: COMENTARIO, speaker: { nombre: 'Abuela', visual: null }, anchor: { x: 120, y: 80 } });
  const burbuja = el.querySelector('.bubble') as HTMLElement;
  expect(burbuja.style.left).toBe('120px');
  expect(burbuja.style.top).toBe('80px');
  expect(burbuja.classList).not.toContain('bubble--floor');
  poner({ comment: COMENTARIO, speaker: { nombre: 'Abuela', visual: null }, anchor: null });
  expect((el.querySelector('.bubble') as HTMLElement).classList).toContain('bubble--floor');
});

it('su región se llama «Comentario de {nombre}»', () => {
  const { el, poner } = montar();
  poner({ comment: COMENTARIO, speaker: { nombre: 'Abuela', visual: null }, anchor: null });
  expect(el.querySelector('[data-comment]')!.getAttribute('aria-label'))
    .toBe(DRAFT_COPY.commentBubbleLabel.text.replace('{nombre}', 'Abuela'));
});

it('no toma el foco ni es un diálogo modal', () => {
  const { el, poner } = montar();
  const antes = document.activeElement;
  poner({ comment: COMENTARIO, speaker: { nombre: 'Abuela', visual: null }, anchor: null });
  expect(document.activeElement).toBe(antes);
  expect(el.querySelector('[aria-modal="true"]')).toBeNull();
  expect(el.querySelector('button, [tabindex]')).toBeNull();
});

it('con movimiento reducido no anima la entrada', () => {
  const { el, poner } = montar({ reduceMotion: true });
  poner({ comment: COMENTARIO, speaker: { nombre: 'Abuela', visual: null }, anchor: null });
  expect(el.querySelector('.bubble')!.classList).not.toContain('bubble--enter');
});

it('con movimiento normal la entrada sí se anima', () => {
  const { el, poner } = montar();
  poner({ comment: COMENTARIO, speaker: { nombre: 'Abuela', visual: null }, anchor: null });
  expect(el.querySelector('.bubble')!.classList).toContain('bubble--enter');
});

it('sin comentario no pinta nada', () => {
  const { el } = montar();
  expect(el.querySelector('[data-comment]')).toBeNull();
});
