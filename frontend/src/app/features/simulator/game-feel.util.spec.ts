import {
  CRISIS_VIGNETTE_ALPHA,
  TENSE_VIGNETTE_ALPHA,
  HIGH_INTENSITY_DARKEN,
  crisisVignetteState,
  roomEntryFlash,
  vignetteFrame,
} from './game-feel.util';

/** Luminancia relativa WCAG de un color sRGB 0-255. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

describe('game-feel.util', () => {
  describe('crisisVignetteState', () => {
    it('serena no se ve, con cualquier intensidad', () => {
      expect(crisisVignetteState('CALM', 'LOW', false)).toEqual({ alpha: 0, pulse: null });
      expect(crisisVignetteState('CALM', 'MEDIUM', false)).toEqual({ alpha: 0, pulse: null });
    });

    it('tensa se ve fija, sin pulso', () => {
      expect(crisisVignetteState('TENSE', 'MEDIUM', false)).toEqual({ alpha: TENSE_VIGNETTE_ALPHA, pulse: null });
      expect(crisisVignetteState('TENSE', 'MEDIUM', true).pulse).toBeNull();
    });

    it('en crisis pulsa', () => {
      expect(crisisVignetteState('CRISIS', 'MEDIUM', false))
        .toEqual({ alpha: CRISIS_VIGNETTE_ALPHA, pulse: { from: 0.55, to: 0.85, durationMs: 800 } });
    });

    it('con movimiento reducido (o el mundo en pausa) la crisis se ve fija en el mínimo del pulso, sin escalón', () => {
      const pulso = crisisVignetteState('CRISIS', 'MEDIUM', false).pulse!;
      expect(crisisVignetteState('CRISIS', 'MEDIUM', true)).toEqual({ alpha: pulso.from, pulse: null });
    });

    it('la intensidad alta oscurece un poco la viñeta (más opaca, mismo pulso) y la baja no cambia nada', () => {
      const media = crisisVignetteState('CRISIS', 'MEDIUM', false);
      const alta = crisisVignetteState('CRISIS', 'HIGH', false);
      expect(alta.alpha).toBeGreaterThan(media.alpha);
      expect(alta.alpha).toBeLessThanOrEqual(media.alpha * HIGH_INTENSITY_DARKEN + 0.01);
      expect(alta.pulse?.durationMs).toBe(media.pulse?.durationMs);
      expect(crisisVignetteState('CRISIS', 'LOW', false)).toEqual(media);
      expect(crisisVignetteState('TENSE', 'HIGH', false).alpha).toBeGreaterThan(crisisVignetteState('TENSE', 'LOW', false).alpha);
      expect(crisisVignetteState('CALM', 'HIGH', false).alpha).toBe(0);
    });

    it('la opacidad no baja al subir la activación (serena, tensa, en crisis)', () => {
      for (const reduced of [false, true]) {
        const alphas = (['CALM', 'TENSE', 'CRISIS'] as const).map(a => crisisVignetteState(a, 'MEDIUM', reduced).alpha);
        expect(alphas).toEqual([...alphas].sort((x, y) => x - y));
      }
    });

    it('un valor desconocido no dibuja ni lanza', () => {
      expect(crisisVignetteState(undefined as never, undefined as never, false).alpha).toBe(0);
      expect(crisisVignetteState('X' as never, 'Y' as never, false).pulse).toBeNull();
    });
  });

  describe('roomEntryFlash', () => {
    it('destella al pasar a otra sala', () => {
      expect(roomEntryFlash('hospital-urgencias', 'hospital-sala-escucha', false))
        .toEqual({ durationMs: 120, rgb: [214, 222, 236], peakAlpha: 0.2 });
    });

    it('no alcanza el umbral de destello general de WCAG 2.3.1 (salto de luminancia relativa < 0,10)', () => {
      const flash = roomEntryFlash('a', 'b', false)!;
      const mezcla = (base: [number, number, number]): [number, number, number] =>
        base.map((c, i) => c + flash.peakAlpha * (flash.rgb[i] - c)) as [number, number, number];
      // Escena casi negra, la sala de urgencias medida en pantalla y una sala clara: el peor salto de las tres.
      const escenas: Array<[number, number, number]> = [[5, 8, 12], [45, 62, 75], [150, 160, 170]];
      for (const base of escenas) {
        expect(relativeLuminance(mezcla(base)) - relativeLuminance(base)).toBeLessThan(0.1);
      }
    });

    it('es un solo destello breve: dura menos de medio segundo y su pico es suave', () => {
      const flash = roomEntryFlash('a', 'b', false)!;
      expect(flash.durationMs).toBeLessThanOrEqual(150);
      expect(flash.peakAlpha).toBeGreaterThan(0);
      expect(flash.peakAlpha).toBeLessThanOrEqual(0.25);
    });

    it('no destella en la primera escena, al repintar la misma sala ni con movimiento reducido', () => {
      expect(roomEntryFlash(null, 'hospital-urgencias', false)).toBeNull();
      expect(roomEntryFlash('hospital-urgencias', 'hospital-urgencias', false)).toBeNull();
      expect(roomEntryFlash('hospital-urgencias', 'comisaria-recepcion', true)).toBeNull();
    });
  });

  describe('vignetteFrame', () => {
    it('con zoom 1 el marco es la cámara entera', () => {
      expect(vignetteFrame(960, 540, 1)).toEqual({ x: 0, y: 0, width: 960, height: 540 });
    });

    it('con zoom 2 el marco es la mitad central, que es lo que la cámara muestra', () => {
      expect(vignetteFrame(960, 540, 2)).toEqual({ x: 240, y: 135, width: 480, height: 270 });
    });

    it('un zoom inválido se trata como 1', () => {
      const entera = { x: 0, y: 0, width: 960, height: 540 };
      expect(vignetteFrame(960, 540, 0)).toEqual(entera);
      expect(vignetteFrame(960, 540, Number.NaN)).toEqual(entera);
      expect(vignetteFrame(960, 540, -2)).toEqual(entera);
    });
  });
});
