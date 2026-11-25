import { encabezadoPrincipal, enfocarPorPrograma, focoPerdido } from './foco.util';

describe('foco.util', () => {
  afterEach(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.replaceChildren();
  });

  it('focoPerdido: en <body> sí; en un control de la página no; en un control ya retirado sí', () => {
    expect(focoPerdido()).toBe(true);
    const boton = document.createElement('button');
    document.body.appendChild(boton);
    boton.focus();
    expect(focoPerdido()).toBe(false);
    boton.remove();
    expect(focoPerdido()).toBe(true);
  });

  it('encabezadoPrincipal: el primer h1 visible de <main>, antes que uno de la barra', () => {
    document.body.innerHTML = '<header><h1>Marca</h1></header><main id="main-content"><h1 id="t">Grupos</h1></main>';
    expect(encabezadoPrincipal()?.id).toBe('t');
  });

  it('encabezadoPrincipal: salta los h1 ocultos o inertes', () => {
    document.body.innerHTML = '<main><h1 hidden>Oculto</h1><div inert><h1>Inerte</h1></div><h1 id="v">Visible</h1></main>';
    expect(encabezadoPrincipal()?.id).toBe('v');
  });

  it('encabezadoPrincipal: sin h1, #main-content y luego <main>', () => {
    document.body.innerHTML = '<main id="main-content"><p>x</p></main>';
    expect(encabezadoPrincipal()?.id).toBe('main-content');
    document.body.innerHTML = '<main><p>x</p></main>';
    expect(encabezadoPrincipal()?.tagName).toBe('MAIN');
    document.body.innerHTML = '<p>nada</p>';
    expect(encabezadoPrincipal()).toBeNull();
  });

  it('enfocarPorPrograma: da tabindex -1 al que no es enfocable, respeta el que ya tiene y devuelve si lo logró', () => {
    document.body.innerHTML = '<h1 id="a">A</h1><h1 id="b" tabindex="0">B</h1>';
    const a = document.getElementById('a')!;
    const b = document.getElementById('b')!;
    expect(enfocarPorPrograma(a)).toBe(true);
    expect(a.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(a);
    expect(enfocarPorPrograma(b)).toBe(true);
    expect(b.getAttribute('tabindex')).toBe('0');
    expect(enfocarPorPrograma(null)).toBe(false);
  });
});
