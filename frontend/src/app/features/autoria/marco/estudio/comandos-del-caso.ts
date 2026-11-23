import { inject } from '@angular/core';
import { Router } from '@angular/router';

import { ACCIONES } from '../../guia/acciones';
import { GuiaService } from '../../guia/guia.service';
import { CasoStore } from '../../estado/caso.store';
import { RutasAutoria } from '../../rutas';
import { ProgresoDelCaso } from '../progreso.service';
import type { Comando } from './atajos';
import { EstudioService, injectComandos } from './estudio.service';

/** Lo que el marco sabe hacer y la paleta ofrece (el marco pasa sus métodos). */
export interface AccionesDelMarco {
  buscarEnLaAyuda: () => void;
  preguntarALaGuia: () => void;
  verPendientes: () => void;
  probar: () => void;
}

/**
 * Los comandos del caso abierto en la paleta (Ctrl+K): ir a cada escena (con su número y sala), a cada etapa, mostrar u
 * ocultar paneles, probar, ver pendientes y, al final, «Cómo hago…» con las acciones de la guía (las mismas del buscador
 * de Ayuda), que señala el control en la pantalla.
 *
 * Patrón: Command (cada entrada lleva su `ejecutar`) armado por una Facade que lee el store, el avance y la guía.
 */
export function injectComandosDelCaso(marco: AccionesDelMarco): void {
  const store = inject(CasoStore);
  const progreso = inject(ProgresoDelCaso);
  const rutas = inject(RutasAutoria);
  const router = inject(Router);
  const guia = inject(GuiaService);
  const estudio = inject(EstudioService);
  const ir = (url: string) => void router.navigateByUrl(url);

  injectComandos((): Comando[] => {
    const caso = store.caso();
    if (!caso) return [];
    const salas = new Map(caso.salas.map((s) => [s.id, s.nombre]));
    const escenas = progreso.escenas().map((e, i): Comando => ({
      id: `escena:${e.id}`, grupo: 'Escenas', titulo: `${i + 1} · ${e.titulo}`,
      detalle: e.salaId ? salas.get(e.salaId) : 'Sin sala', palabras: 'guion escena abrir',
      ejecutar: () => ir(rutas.a('/editor/escena', e.id)),
    }));
    const etapas = progreso.avance().map((a): Comando => ({
      id: `etapa:${a.etapa}`, grupo: 'Ir a', titulo: a.nombre, palabras: 'etapa sección', ejecutar: () => ir(rutas.a(a.ruta)),
    }));
    const vista: Comando[] = [
      { id: 'ir:caminos', grupo: 'Ir a', titulo: 'Caminos (el mapa de escenas)', atajo: 'Alt+M', palabras: 'mapa flechas', ejecutar: () => ir(rutas.a('/editor')) },
      { id: 'vista:paneles', grupo: 'Vista', titulo: estudio.soloLienzo() ? 'Mostrar los paneles' : 'Solo el lienzo (ocultar los paneles)',
        atajo: '\\', ejecutar: () => estudio.alternarPaneles() },
      { id: 'vista:explorador', grupo: 'Vista', titulo: estudio.verExplorador() ? 'Ocultar el explorador' : 'Mostrar el explorador',
        ejecutar: () => estudio.alternar('explorador') },
      { id: 'vista:inspector', grupo: 'Vista', titulo: estudio.verInspector() ? 'Ocultar el inspector' : 'Mostrar el inspector',
        ejecutar: () => estudio.alternar('inspector') },
      { id: 'vista:atajos', grupo: 'Vista', titulo: 'Atajos del teclado', atajo: '?', ejecutar: () => estudio.atajosAbiertos.set(true) },
    ];
    const caso_: Comando[] = [
      { id: 'caso:probar', grupo: 'Caso', titulo: 'Probar el caso en el juego', palabras: 'ensayo jugar', ejecutar: marco.probar },
      { id: 'caso:pendientes', grupo: 'Caso', titulo: 'Ver lo que falta (pendientes)', detalle: `${progreso.porCorregir().length} por corregir`,
        palabras: 'avisos errores', ejecutar: marco.verPendientes },
      { id: 'ayuda:buscar', grupo: 'Ayuda', titulo: 'Buscar en la ayuda', palabras: 'guia', ejecutar: marco.buscarEnLaAyuda },
      { id: 'ayuda:preguntar', grupo: 'Ayuda', titulo: 'Preguntarle a la guía', palabras: 'ia asistente', ejecutar: marco.preguntarALaGuia },
    ];
    const comoHago = ACCIONES.map((a): Comando => ({
      id: `guia:${a.id}`, grupo: 'Cómo hago…', titulo: a.nombre, detalle: a.pantalla, palabras: a.palabras,
      ejecutar: () => void guia.mostrar(a.id, a.pasos ? 'recorrido' : 'foco'),
    }));
    return [...escenas, ...etapas, ...vista, ...caso_, ...comoHago];
  });
}
