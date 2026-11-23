import { GESTOS } from '../../../core/models/simulation.model';
import { MAX_FRASE, NOMBRE_GESTO, problemaDeLaFrase } from './frase';

describe('problemaDeLaFrase', () => {
  it('una frase buena no tiene problema', () => {
    expect(problemaDeLaFrase('Gracias por contármelo')).toBeNull();
    expect(problemaDeLaFrase('a'.repeat(MAX_FRASE))).toBeNull();
    expect(problemaDeLaFrase('Tiene menos de 18 años: edad < 18')).toBeNull(); // un «<» que no abre nada es texto
  });

  it('dice por qué una línea doble o larga no se guarda', () => {
    expect(problemaDeLaFrase('Primera\nSegunda')).toContain('una sola línea');
    expect(problemaDeLaFrase('Primera\rSegunda')).toContain('una sola línea');
    expect(problemaDeLaFrase('a'.repeat(401))).toContain('400 caracteres');
  });

  it.each([
    'Mira https://ejemplo.co', 'Mira http://ejemplo.co', 'Mira ftp://ejemplo.co', 'Mira www.ejemplo.co', 'Mira WWW.ejemplo.co',
    'javascript:alert(1)', 'vbscript: x', 'data:text/html,x', 'mailto:a@b.co', 'Mira app://abrir', 'Mira file:///c',
  ])('«%s» lleva un enlace', (texto) => {
    expect(problemaDeLaFrase(texto)).toContain('enlaces');
  });

  it.each(['Hola <b>tú</b>', 'Hola </p>', 'x <script>', 'x <!-- y', 'x <?xml'])('«%s» lleva HTML', (texto) => {
    expect(problemaDeLaFrase(texto)).toContain('HTML');
  });

  it('rechaza los caracteres de control', () => {
    expect(problemaDeLaFrase('Hola\u0007')).toContain('caracteres que no se admiten');
  });

  it('cada gesto del vocabulario cerrado tiene su nombre en español', () => {
    expect(Object.keys(NOMBRE_GESTO).sort()).toEqual([...GESTOS].sort());
    expect(NOMBRE_GESTO['baja-la-mirada']).toBe('Baja la mirada');
  });
});
