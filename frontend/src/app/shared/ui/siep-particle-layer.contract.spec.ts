import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'siep-particle-layer.component.ts'), 'utf-8');

describe('capa de partículas: trabajo por cuadro', () => {
  it('anima fuera de la zona de Angular', () => {
    expect(source).toMatch(/this\.zone\.runOutsideAngular\(\(\) => \{\s*this\.frameId = requestAnimationFrame/);
  });

  it('no fuerza layout en cada cuadro: el tamaño se lee solo al redimensionar', () => {
    expect(source).not.toMatch(/nativeElement\.clientWidth/);
    expect(source).not.toMatch(/nativeElement\.clientHeight/);
  });

  it('se pausa cuando sale de la pantalla', () => {
    expect(source).toContain('new IntersectionObserver(');
  });

  it('avanza por tiempo con el helper puro', () => {
    expect(source).toContain('stepParticles(this.particles, scale');
  });
});
