import type { CasoBorrador } from './caso';
import { copiarEscenarioAlCaso } from './copiar';
import { clasificarPendientes, porCorregir } from './pendientes';
import { avanceDelCaso, etapaDeDireccion, siguientePaso, textoDeEtapa } from './progreso';
import { puedeEnviar } from './revision';
import { universidad } from '../testing/universidad';

/** Un caso recién creado: tres escenas vacías, una por sala, con los seis pasos profesionales del lugar. */
const casoNuevo = (): CasoBorrador => copiarEscenarioAlCaso(universidad, ['entrada', 'pasillo', 'aula'], 'Primera escucha');

/** El mismo caso con la primera escena escrita a medias: una respuesta clasificada que no lleva a ninguna parte. */
function conRespuestaSinDestino(): CasoBorrador {
  const caso = casoNuevo();
  caso.escenas[0].respuestas.push({
    id: 'r1', texto: 'Te escucho.', clase: 'RECOMMENDED', razon: '', efectos: {}, retroalimentacion: 'Bien.', destinoId: null, marcaIa: false,
  });
  return caso;
}

// req: EDITOR.md §3.6 (validar en vivo sin estorbar) y §7.3 E0, criterio 3
describe('clasificarPendientes y siguientePaso', () => {
  it('un caso recién creado no tiene nada «por corregir» y su siguiente paso es escribir la escena 1', () => {
    const caso = casoNuevo();
    const pendientes = clasificarPendientes(caso);
    expect(porCorregir(pendientes)).toEqual([]);
    // Las faltas siguen ahí (la compuerta no se relaja): todas son trabajo «por escribir».
    expect(pendientes.filter((p) => p.tipo === 'por-escribir').length).toBe(puedeEnviar(caso).faltas.length);
    expect(siguientePaso(caso)).toEqual({ texto: 'Escribe la escena 1 · Entrada del campus', ruta: `/editor/escena/${caso.escenas[0].id}` });
  });

  it('puedeEnviar devuelve exactamente lo mismo antes y después de clasificar (no cambia la compuerta)', () => {
    for (const caso of [casoNuevo(), conRespuestaSinDestino()]) {
      const antes = structuredClone(puedeEnviar(caso));
      const copia = structuredClone(caso);
      clasificarPendientes(caso);
      siguientePaso(caso);
      avanceDelCaso(caso);
      expect(puedeEnviar(caso)).toEqual(antes);
      expect(caso).toEqual(copia);
      expect(antes.ok).toBe(false);
    }
  });

  it('una respuesta sin destino es «por corregir» de la historia y lleva a su escena', () => {
    const caso = conRespuestaSinDestino();
    const corregir = porCorregir(clasificarPendientes(caso));
    expect(corregir).toHaveLength(1);
    expect(corregir[0]).toMatchObject({ etapa: 'historia', escenaId: caso.escenas[0].id });
    expect(corregir[0].mensaje).toContain('no lleva a ninguna escena');
  });

  it('la lista de verificación es de la etapa Enviar y no cuenta como aviso', () => {
    const caso: CasoBorrador = {
      ...casoNuevo(),
      lista: { items: [{ codigo: 'i1', texto: 'Revisado', obligatorio: true, cumplido: false, enBorrador: false, respaldo: null, respaldado: null }], constanciaRegistrada: false },
    };
    const lista = clasificarPendientes(caso).find((p) => p.codigo === 'CHECKLIST_INCOMPLETE')!;
    expect(lista).toMatchObject({ etapa: 'enviar', tipo: 'por-escribir' });
  });

  it('lo que sugirió la IA va primero en «Siguiente paso», con cuántas partes son', () => {
    const caso = casoNuevo();
    caso.escenas[1].lineas.push({ id: 'l1', personajeId: 'x', texto: 'Hola', expresion: 'neutral', marcaIa: true });
    caso.escenas[1].lineas.push({ id: 'l2', personajeId: 'x', texto: 'Hola', expresion: 'neutral', marcaIa: true });
    expect(siguientePaso(caso)).toMatchObject({ texto: 'Revisa lo que sugirió la IA (2)', accionId: 'aceptar-ia' });
  });

  it('un aviso de guardado va antes que todo', () => {
    expect(siguientePaso(casoNuevo(), { avisoDeGuardado: true }).texto).toBe('Revisa el aviso de guardado');
  });

  it('el avance dice el estado de cada etapa con palabras', () => {
    const caso = casoNuevo();
    const avance = avanceDelCaso(caso);
    expect(avance.map((a) => a.etapa)).toEqual(['datos', 'lugar', 'historia', 'evaluacion', 'enviar']);
    const historia = avance.find((a) => a.etapa === 'historia')!;
    expect(historia).toMatchObject({ estado: 'sin-empezar', detalle: '0 de 3 escenas escritas', pendientes: 0 });
    expect(textoDeEtapa(historia)).toBe('Historia: escenas y guion, 0 de 3 escenas escritas');
    const conFalta = avanceDelCaso(conRespuestaSinDestino()).find((a) => a.etapa === 'historia')!;
    expect(conFalta).toMatchObject({ estado: 'con-pendientes', pendientes: 1 });
    expect(textoDeEtapa(conFalta)).toBe('Historia: escenas y guion, 1 de 3 escenas escritas, 1 pendiente');
  });

  it('cada dirección del editor pertenece a una etapa', () => {
    expect(etapaDeDireccion('/portal/casos/2/editor/escena/10')).toBe('historia');
    expect(etapaDeDireccion('/portal/casos/2/editor')).toBe('historia');
    expect(etapaDeDireccion('/portal/casos/2/editor/datos')).toBe('datos');
    expect(etapaDeDireccion('/portal/casos/2/editor/sala/consultorio')).toBe('lugar');
    expect(etapaDeDireccion('/portal/casos/2/editor/finales?x=1')).toBe('evaluacion');
    expect(etapaDeDireccion('/portal/casos/2/editor/revision')).toBe('enviar');
    expect(etapaDeDireccion('/portal/casos')).toBeNull();
  });
});
