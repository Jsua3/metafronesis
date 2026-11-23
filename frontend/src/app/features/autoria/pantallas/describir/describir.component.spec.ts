import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom, throwError } from 'rxjs';

import { AuthoringApi } from '../../../../core/api/authoring.api';
import { casoCopiadoDeLugar } from '../../testing/caso-api';
import { rutasDePrueba } from '../../testing/rutas';
import { ServidorFalso } from '../../testing/servidor-falso';
import { universidad } from '../../testing/universidad';
import { DescribirComponent } from './describir.component';

const DESCRIPCION = 'Una estudiante llega a Bienestar y dice que ya no puede más con lo que pasa en casa.';

async function montar() {
  TestBed.resetTestingModule();
  const servidor = new ServidorFalso(casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo']), universidad);
  await TestBed.configureTestingModule({
    imports: [DescribirComponent],
    providers: [provideRouter(rutasDePrueba), { provide: AuthoringApi, useValue: servidor.autoria }],
  }).compileComponents();
  const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const api = TestBed.inject(AuthoringApi);
  const crear = async () => {
    const fixture = TestBed.createComponent(DescribirComponent);
    fixture.componentRef.setInput('lugarId', 'universidad');
    const raiz = fixture.nativeElement as HTMLElement;
    const hasta = async (condicion: () => boolean) => {
      for (let i = 0; i < 100 && !condicion(); i++) {
        await new Promise((r) => setTimeout(r, 0));
        fixture.detectChanges();
      }
      expect(condicion()).toBe(true);
    };
    fixture.detectChanges();
    await hasta(() => !raiz.textContent!.includes('Revisando si puedes generar'));
    return { fixture, raiz, hasta };
  };
  return { servidor, g: servidor.generaciones, api, navegar, crear };
}

const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().includes(texto));

function escribir(raiz: HTMLElement, texto: string): HTMLTextAreaElement {
  const campo = raiz.querySelector<HTMLTextAreaElement>('textarea')!;
  campo.value = texto;
  campo.dispatchEvent(new Event('input'));
  return campo;
}

const respuesta = (estado: number, cuerpo: Record<string, unknown>) =>
  throwError(() => new HttpErrorResponse({ status: estado, error: { success: false, ...cuerpo } }));

describe('DescribirComponent', () => {
  it('muestra el campo, el contador, lo que queda hoy y el aviso de la revisión', async () => {
    const { crear } = await montar();
    const { raiz } = await crear();

    expect(raiz.querySelector('label[for="descripcion"]')!.textContent).toContain('Describe la situación y lo que debe aprender el estudiante');
    expect(raiz.textContent).toContain('Entre 40 y 2000 caracteres.');
    expect(raiz.querySelector('#descripcion-cuenta')!.textContent).toContain('0 de 2000');
    expect(raiz.textContent).toContain('Te quedan 5 casos generados hoy.');
    expect(raiz.textContent).toContain('La IA escribe un borrador. Nada se publica sin tu revisión y la de Psicología.');
    expect(boton(raiz, 'Generar el caso con IA')).toBeTruthy();
  });

  it('el contador sigue lo que se escribe', async () => {
    const { crear } = await montar();
    const { fixture, raiz } = await crear();
    escribir(raiz, 'Hola, mundo');
    fixture.detectChanges();
    expect(raiz.querySelector('#descripcion-cuenta')!.textContent).toContain('11 de 2000');
  });

  it('menos de 40 caracteres no deja generar y dice por qué', async () => {
    const { g, navegar, crear } = await montar();
    const { fixture, raiz } = await crear();
    const generar = boton(raiz, 'Generar el caso con IA')!;

    expect(generar.getAttribute('aria-disabled')).toBe('true');
    expect(generar.getAttribute('aria-describedby')).toBe('descripcion-falta');
    expect(raiz.querySelector('#descripcion-falta')!.textContent).toContain('Escribe al menos 40 caracteres.');
    escribir(raiz, 'Muy corto.');
    fixture.detectChanges();
    generar.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(g.llamadas.some((l) => l.metodo === 'startGeneration')).toBe(false);
    expect(navegar).not.toHaveBeenCalled();

    escribir(raiz, DESCRIPCION);
    fixture.detectChanges();
    expect(generar.getAttribute('aria-disabled')).toBe('false');
    expect(raiz.querySelector('#descripcion-falta')).toBeNull();
  });

  it('generar navega a /portal/casos/nuevo/generando/<id>', async () => {
    const { g, navegar, crear } = await montar();
    const { fixture, raiz, hasta } = await crear();
    escribir(raiz, DESCRIPCION);
    fixture.detectChanges();
    boton(raiz, 'Generar el caso con IA')!.click();
    await hasta(() => navegar.mock.calls.length > 0);

    const empezo = g.llamadas.find((l) => l.metodo === 'startGeneration')!;
    expect(empezo.args[0]).toEqual({ lugarId: 'universidad', descripcion: DESCRIPCION });
    expect(navegar).toHaveBeenCalledWith('/portal/casos/nuevo/generando/generacion-1');
  });

  it('con una generación en curso ofrece Retomar y Cancelar en vez del formulario', async () => {
    const { g, api, navegar, crear } = await montar();
    const id = (await firstValueFrom(api.startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }))).id;
    const { fixture, raiz, hasta } = await crear();

    expect(raiz.querySelector('textarea')).toBeNull();
    expect(raiz.textContent).toContain('Tienes un caso a medio generar en');
    boton(raiz, 'Retomar')!.click();
    expect(navegar).toHaveBeenCalledWith(`/portal/casos/nuevo/generando/${id}`);

    boton(raiz, 'Cancelar y empezar otro')!.click();
    await hasta(() => !!raiz.querySelector('textarea'));
    expect(g.llamadas.some((l) => l.metodo === 'cancelGeneration')).toBe(true);
    expect(raiz.textContent).not.toContain('Tienes un caso a medio generar');
    fixture.detectChanges();
    // El botón pulsado desaparece con el aviso: el foco va al cuadro de la descripción, no al cuerpo de la página.
    await hasta(() => document.activeElement === raiz.querySelector('textarea'));
    expect(document.activeElement).toBe(raiz.querySelector('textarea'));
  });

  it('si cancelar falla lo dice y deja las dos opciones', async () => {
    const { api, crear } = await montar();
    await firstValueFrom(api.startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
    const { raiz, hasta } = await crear();
    vi.spyOn(api, 'cancelGeneration').mockReturnValue(respuesta(500, { code: 'SERVER' }));

    boton(raiz, 'Cancelar y empezar otro')!.click();
    await hasta(() => !!raiz.querySelector('[role="alert"]'));
    expect(raiz.querySelector('[role="alert"]')!.textContent).toContain('No pudimos cancelar el caso. Vuelve a intentarlo.');
    expect(boton(raiz, 'Retomar')).toBeTruthy();
    expect(boton(raiz, 'Cancelar y empezar otro')).toBeTruthy();
  });

  it('apagada: dice su motivo y no muestra el formulario', async () => {
    const { g, crear } = await montar();
    g.habilitada = false;
    const { raiz } = await crear();

    expect(raiz.textContent).toContain('La generación con IA no está disponible por ahora. Puedes elegir las salas a mano.');
    expect(raiz.querySelector('textarea')).toBeNull();
  });

  it('si no se puede saber el estado, lo dice y deja volver a intentarlo', async () => {
    const { api, crear } = await montar();
    vi.spyOn(api, 'generationStatus').mockReturnValueOnce(respuesta(500, { code: 'SERVER' }));
    const { raiz, hasta } = await crear();

    expect(raiz.querySelector('[role="alert"]')!.textContent).toContain('No pudimos saber si puedes generar un caso.');
    boton(raiz, 'Volver a intentarlo')!.click();
    await hasta(() => !!raiz.querySelector('textarea'));
  });

  describe('los errores al empezar', () => {
    it('400 con campo: el mensaje queda en el campo y se va al escribir', async () => {
      const { api, navegar, crear } = await montar();
      const { fixture, raiz, hasta } = await crear();
      vi.spyOn(api, 'startGeneration').mockReturnValue(respuesta(400, { code: 'VALIDATION_ERROR', message: 'Cuéntanos un poco más.', field: 'descripcion' }));
      escribir(raiz, DESCRIPCION);
      fixture.detectChanges();
      boton(raiz, 'Generar el caso con IA')!.click();
      await hasta(() => !!raiz.querySelector('#descripcion-error'));

      expect(raiz.querySelector('#descripcion-error')!.textContent).toContain('Cuéntanos un poco más.');
      const campo = raiz.querySelector('textarea')!;
      expect(campo.getAttribute('aria-invalid')).toBe('true');
      expect(campo.getAttribute('aria-describedby')).toContain('descripcion-error');
      expect(navegar).not.toHaveBeenCalled();

      escribir(raiz, `${DESCRIPCION} Y más.`);
      fixture.detectChanges();
      expect(raiz.querySelector('#descripcion-error')).toBeNull();
    });

    it('GENERATION_IN_PROGRESS ofrece retomar con su generationId', async () => {
      const { api, navegar, crear } = await montar();
      const { fixture, raiz, hasta } = await crear();
      vi.spyOn(api, 'startGeneration').mockReturnValue(
        respuesta(409, { code: 'GENERATION_IN_PROGRESS', message: 'Ya tienes un caso generándose.', generationId: 'otra-pestana' }));
      escribir(raiz, DESCRIPCION);
      fixture.detectChanges();
      boton(raiz, 'Generar el caso con IA')!.click();
      await hasta(() => !!boton(raiz, 'Retomar'));

      expect(raiz.textContent).toContain('Tienes un caso a medio generar');
      boton(raiz, 'Retomar')!.click();
      expect(navegar).toHaveBeenCalledWith('/portal/casos/nuevo/generando/otra-pestana');
    });

    it('AI_LIMIT_EXCEEDED trae su mensaje fijo y no deja volver a pedir', async () => {
      const { api, crear } = await montar();
      const { fixture, raiz, hasta } = await crear();
      const empezar = vi.spyOn(api, 'startGeneration').mockReturnValue(
        respuesta(429, { code: 'AI_LIMIT_EXCEEDED', message: 'Llegaste al límite de casos generados por hoy.' }));
      escribir(raiz, DESCRIPCION);
      fixture.detectChanges();
      boton(raiz, 'Generar el caso con IA')!.click();
      await hasta(() => !!raiz.querySelector('[role="alert"]'));

      expect(raiz.querySelector('[role="alert"]')!.textContent).toContain('Llegaste al límite de casos generados por hoy.');
      const generar = boton(raiz, 'Generar el caso con IA')!;
      expect(generar.getAttribute('aria-disabled')).toBe('true');
      expect(generar.getAttribute('aria-describedby')).toBe('descripcion-general');
      generar.click();
      await new Promise((r) => setTimeout(r, 0));
      expect(empezar).toHaveBeenCalledTimes(1);
    });

    it('404 (apagada): la opción queda apagada con su motivo', async () => {
      const { g, crear } = await montar();
      const { fixture, raiz, hasta } = await crear();
      escribir(raiz, DESCRIPCION);
      fixture.detectChanges();
      g.habilitada = false; // se apagó mientras escribía
      boton(raiz, 'Generar el caso con IA')!.click();
      await hasta(() => raiz.textContent!.includes('La generación con IA no está disponible.'));

      // el mensaje es el que trae el servidor, con la salida: elegir las salas a mano
      expect(raiz.textContent).toContain('La generación con IA no está disponible. Puedes elegir las salas a mano.');
      expect(raiz.querySelector('textarea')).toBeNull();
    });

    it('cualquier otro error lo dice y deja volver a intentarlo', async () => {
      const { api, crear } = await montar();
      const { fixture, raiz, hasta } = await crear();
      const empezar = vi.spyOn(api, 'startGeneration').mockReturnValue(respuesta(500, { code: 'SERVER' }));
      escribir(raiz, DESCRIPCION);
      fixture.detectChanges();
      boton(raiz, 'Generar el caso con IA')!.click();
      await hasta(() => !!raiz.querySelector('[role="alert"]'));

      expect(raiz.querySelector('[role="alert"]')!.textContent).toContain('No pudimos hablar con la IA.');
      boton(raiz, 'Generar el caso con IA')!.click();
      await hasta(() => empezar.mock.calls.length === 2);
    });
  });

  describe('el contrato final de C1', () => {
    const DATOS = 'Una estudiante escribió a camila.rojas@correo.com porque ya no puede más con lo que pasa en casa.';

    it('el aviso de no escribir datos reales va antes del cuadro de texto y está enlazado con aria-describedby', async () => {
      const { crear } = await montar();
      const { raiz } = await crear();

      const aviso = raiz.querySelector('#descripcion-datos')!;
      expect(aviso.textContent).toContain('No escribas datos reales de personas: ni nombres, ni correos, ni teléfonos, ni números de documento.');
      const campo = raiz.querySelector('textarea')!;
      expect(aviso.compareDocumentPosition(campo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(campo.getAttribute('aria-describedby')!.split(' ')).toContain('descripcion-datos');
    });

    it('datos personales: el motivo del servidor queda junto al campo, con aria-invalid y el foco en el campo', async () => {
      const { navegar, crear } = await montar();
      const { fixture, raiz, hasta } = await crear();
      escribir(raiz, DATOS);
      fixture.detectChanges();
      boton(raiz, 'Generar el caso con IA')!.click();
      await hasta(() => !!raiz.querySelector('#descripcion-error'));

      expect(raiz.querySelector('#descripcion-error')!.textContent).toContain(
        'La descripción parece traer datos reales de una persona (correo, teléfono o número de documento). Cuéntala sin datos que identifiquen a nadie.');
      const campo = raiz.querySelector('textarea')!;
      expect(campo.getAttribute('aria-invalid')).toBe('true');
      expect(campo.getAttribute('aria-describedby')!.split(' ')).toEqual(expect.arrayContaining(['descripcion-datos', 'descripcion-error']));
      await hasta(() => document.activeElement === campo);
      expect(raiz.querySelector('.aviso-error')).toBeNull(); // no es un aviso general
      expect(navegar).not.toHaveBeenCalled();
    });

    it('texto plano: el mensaje del servidor queda junto a la descripción', async () => {
      const { crear } = await montar();
      const { fixture, raiz, hasta } = await crear();
      escribir(raiz, `${DESCRIPCION} <b>x</b>`);
      fixture.detectChanges();
      boton(raiz, 'Generar el caso con IA')!.click();
      await hasta(() => !!raiz.querySelector('#descripcion-error'));
      expect(raiz.querySelector('#descripcion-error')!.textContent).toContain('La descripción debe ser texto plano, sin etiquetas, enlaces ni caracteres especiales.');
    });

    it('lugar sin elegir: el mensaje del servidor va junto a su campo (el lugar), no en un aviso general', async () => {
      const { api, crear } = await montar();
      const { fixture, raiz, hasta } = await crear();
      vi.spyOn(api, 'startGeneration').mockReturnValue(
        respuesta(400, { code: 'VALIDATION_ERROR', message: 'Elige el lugar donde pasa el caso.', field: 'lugarId' }));
      escribir(raiz, DESCRIPCION);
      fixture.detectChanges();
      boton(raiz, 'Generar el caso con IA')!.click();
      await hasta(() => !!raiz.querySelector('#lugar-error'));

      const lugar = raiz.querySelector('#lugar-error')!;
      expect(lugar.textContent).toContain('Elige el lugar donde pasa el caso.');
      expect(lugar.getAttribute('role')).toBe('alert');
      expect(raiz.querySelector('#descripcion-error')).toBeNull();
      expect(raiz.querySelector('.aviso-error')).toBeNull();
    });

    it('el tope global del día muestra el texto del servidor y no deja volver a pedir', async () => {
      const { api, crear } = await montar();
      const { fixture, raiz, hasta } = await crear();
      const empezar = vi.spyOn(api, 'startGeneration').mockReturnValue(respuesta(429, {
        code: 'AI_LIMIT_EXCEEDED', scope: 'daily',
        message: 'La plataforma llegó al límite de casos generados por hoy. Vuelve a intentarlo mañana.',
      }));
      escribir(raiz, DESCRIPCION);
      fixture.detectChanges();
      boton(raiz, 'Generar el caso con IA')!.click();
      await hasta(() => !!raiz.querySelector('[role="alert"]'));

      expect(raiz.querySelector('[role="alert"]')!.textContent).toContain('La plataforma llegó al límite de casos generados por hoy. Vuelve a intentarlo mañana.');
      boton(raiz, 'Generar el caso con IA')!.click();
      await new Promise((r) => setTimeout(r, 0));
      expect(empezar).toHaveBeenCalledTimes(1);
    });

    it('sin rúbrica por defecto (enabled: false) la opción queda apagada con su motivo', async () => {
      const { g, crear } = await montar();
      g.habilitada = false; // el servidor dice enabled: false también sin rúbrica o con un proveedor que no genera por etapas
      const { raiz } = await crear();
      expect(raiz.textContent).toContain('La generación con IA no está disponible por ahora. Puedes elegir las salas a mano.');
      expect(raiz.querySelector('textarea')).toBeNull();
      expect(boton(raiz, 'Generar el caso con IA')).toBeUndefined();
    });
  });
});
