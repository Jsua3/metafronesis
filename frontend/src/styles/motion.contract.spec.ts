import { readFileSync } from 'fs';
import { join } from 'path';

function source(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf-8');
}

describe('movimiento: botones y páginas', () => {
  const styles = source('./styles.scss');

  it('define la curva ease-out fuerte como token (--ds-ease-out; --psy-ease-out es su alias, F1-6)', () => {
    expect(source('./tokens/_motion.scss')).toContain('out: cubic-bezier(0.23, 1, 0.32, 1),');
    expect(source('./_aliases.scss')).toContain('--psy-ease-out: var(--ds-ease-out);');
  });

  it('los botones no tienen destello en hover y responden en 160 ms', () => {
    expect(styles).not.toContain('.psy-button::before');
    expect(styles).not.toContain('.psy-button:hover::before');
    expect(styles).toContain(
      'transition: transform 160ms var(--psy-ease-out), box-shadow 150ms ease, background-color 150ms ease;',
    );
    expect(styles).toMatch(/\.psy-button:active \{\s*transform: scale\(\.97\);/);
  });

  // F9-4: `.psy-reveal` y su `psy-page-fade` eran código muerto (ningún archivo los usaba) y se retiraron; el shell
  // nuevo no anima la entrada de página. Lo que sigue valiendo: ninguna entrada de página desplaza ni desenfoca.
  it('no queda entrada de página heredada ni con desplazamiento o desenfoque', () => {
    for (const legacy of ['psy-page-rise', 'psy-page-fade', 'psy-reveal']) expect(styles).not.toContain(legacy);
    expect(styles).not.toMatch(/@keyframes [\w-]*page[\w-]*\s*\{[^}]*(translate|blur)/);
  });
});

describe('movimiento: hover sin desplazamiento en el portal', () => {
  const files: Record<string, string> = {
    shell: source('../app/shared/layout/shell.component.ts'),
    // B5a retiró `quick-actions.component.ts` (el Inicio ya no tiene accesos rápidos); el hover del Inicio lo cubre `dashboard`.
    // F7: la clase y sus estilos viven en archivos distintos; el contrato mira los dos.
    grupos: source('../app/features/grupos/grupo-list.component.ts') + source('../app/features/grupos/grupo-list.component.scss'),
  };

  it('ninguna tarjeta ni fila se mueve en hover', () => {
    expect(files['shell']).not.toContain('transform: translate(-1px, -1px);');
    expect(files['grupos']).not.toContain('.group-card:hover { transform: translateY(-1px);');
  });


  it('el botón se hunde al presionar, no al pasar el cursor', () => {
    // F7-1: el panel ya no define botones propios; sus enlaces son `ui-button`, que responde al presionar con `scale`
    // y solo cambia de color en hover (con puntero fino). Ninguna regla del panel mueve nada al pasar el cursor.
    const button = source('../app/shared/ui/button/ui-button.scss');
    expect(button).toMatch(/&:active:not\(\[aria-disabled='true'\], :disabled\) \{[^}]*scale: 0\.97;/);
    expect(button).not.toMatch(/ds-hover \{[^}]*(transform|scale|translate)/);
  });
});

describe('movimiento: umbral al juego', () => {
  const tokens = source('./tokens/_motion.scss');
  const reducido = source('./base/_motion.scss');

  it('define umbral (420 ms) y revelar (300 ms) como duraciones', () => {
    expect(tokens).toMatch(/\$durations: \([^)]*umbral: 420ms[^)]*\)/);
    expect(tokens).toMatch(/\$durations: \([^)]*revelar: 300ms[^)]*\)/);
  });

  it('ninguna duración del portal pasa de 420 ms, salvo la de la barra de vidrio (glass)', () => {
    const mapa = /\$durations: \(([^)]*)\)/.exec(tokens)?.[1] ?? '';
    for (const [, nombre, ms] of mapa.matchAll(/(\w+): (\d+)ms/g)) {
      if (nombre === 'glass') continue;
      expect(Number(ms), nombre).toBeLessThanOrEqual(420);
    }
  });

  it('con movimiento reducido las dos duraciones nuevas se anulan como el resto', () => {
    expect(reducido).toContain('--ds-dur-umbral: 0.01ms;');
    expect(reducido).toContain('--ds-dur-revelar: 0.01ms;');
  });
});
