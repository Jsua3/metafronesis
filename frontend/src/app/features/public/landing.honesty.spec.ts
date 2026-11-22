import { readFileSync } from 'fs';
import { join } from 'path';

import { PUBLIC_ANCHORS } from '../../shared/layout/public-bar.component';

const html = readFileSync(join(__dirname, 'landing.component.html'), 'utf-8');
const ts = readFileSync(join(__dirname, 'landing.component.ts'), 'utf-8');

describe('portada honesta (T15.4)', () => {
  it('solo el caso de violencia basada en género se presenta como disponible', () => {
    expect(ts).not.toMatch(/intrafamiliar/i);
    expect(html).not.toMatch(/intrafamiliar/i);
    expect(html).toContain('<h2>Violencia basada en género</h2>');
    expect(ts).toMatch(/title: 'Violencia basada en género'[\s\S]*?available: true/);
  });

  it('los casos que aún no se pueden jugar se rotulan «Próximamente»', () => {
    const soon = ts.match(/tag: 'Próximamente'[\s\S]*?available: false/g) ?? [];
    expect(soon).toHaveLength(2);
    expect(ts).toMatch(/title: 'Desplazamiento forzado'[\s\S]*?tag: 'Próximamente'/);
    expect(ts).toMatch(/title: 'Conflicto comunitario'[\s\S]*?tag: 'Próximamente'/);
    // La tarjeta lo refleja también en forma (borde discontinuo), no solo en el color.
    expect(html).toContain('[class.landing-case-card--soon]="!trainingCase.available"');
  });

  it('«Ver todos los casos» ya no apunta a su propia sección', () => {
    expect(html).not.toContain('Ver todos los casos');
    const link = html.match(/<a class="landing-link"[^>]*>/);
    expect(link?.[0]).toContain('routerLink="/login"');
    expect(link?.[0]).not.toContain('href="#casos"');
  });

  it('solo quedan dos anclas a #casos, y ambas llevan a otra sección: el menú y el botón «Ver casos»', () => {
    // F3-4: el ancla del menú la pinta la barra pública desde PUBLIC_ANCHORS; en la plantilla queda «Ver casos».
    expect(html.match(/href="#casos"/g)).toHaveLength(1);
    expect(PUBLIC_ANCHORS.filter(anchor => anchor.id === 'casos')).toHaveLength(1);
  });
});
