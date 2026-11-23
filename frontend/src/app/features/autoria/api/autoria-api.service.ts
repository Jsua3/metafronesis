import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, firstValueFrom, forkJoin, map, of, switchMap } from 'rxjs';

import { AuthoringApi } from '../../../core/api/authoring.api';
import type { CaseEditorView, WorldDefinition } from '../../../core/models/simulation.model';
import { MANIFIESTO_DE_PIEZAS_URL, esManifiestoDePiezas, type ManifiestoDePiezas } from '../../simulator/sala/catalogo';
import type { CasoBorrador } from '../modelo/caso';
import { casoDesdeApi } from '../modelo/desde-api';
import type { Escenario } from '../modelo/escenario';

/** Un caso leído por completo: el borrador del editor y lo que lo originó (para guardar sin perder nada). */
export interface CasoLeido {
  caso: CasoBorrador;
  editor: CaseEditorView;
  /** El mundo de cada mapa, en el orden de `editor.maps`. */
  mundos: WorldDefinition[];
  /** El lugar de la biblioteca del caso; `null` si el caso no tiene lugar o la biblioteca no respondió. */
  lugar: Escenario | null;
}

/**
 * La puerta del editor de casos a la API de autoría. Es la única pieza de la feature que inyecta `AuthoringApi`
 * (la frontera está fijada en `api-boundaries.contract.spec.ts`): el store y las pantallas piden aquí lo que necesitan.
 *
 * Aporta lo que `AuthoringApi` no hace solo: leer un caso entero. El editor del caso no trae los objetos de las salas,
 * su fondo ni los diálogos; eso está en el mundo de cada mapa, y el lugar de la biblioteca da el catálogo de piezas.
 * Para todo lo demás (mutaciones con la revisión vigente) se usa `api` tal cual.
 */
@Injectable({ providedIn: 'root' })
export class AutoriaApiService {
  /** Las mutaciones, la validación y el asistente: llamadas directas con su revisión. */
  readonly api = inject(AuthoringApi);
  private readonly http = inject(HttpClient);
  private manifiestoPendiente: Promise<ManifiestoDePiezas> | null = null;

  /** Comparte la petición en curso y conserva el resultado; un fallo permite volver a intentarlo. */
  manifiestoDePiezas(): Promise<ManifiestoDePiezas> {
    return this.manifiestoPendiente ??= firstValueFrom(this.http.get<unknown>(MANIFIESTO_DE_PIEZAS_URL)).then((datos) => {
      if (!esManifiestoDePiezas(datos)) throw new Error('Manifiesto de piezas inválido');
      return datos;
    }).catch((error: unknown) => {
      this.manifiestoPendiente = null;
      throw error;
    });
  }

  /** Los lugares de la biblioteca. */
  lugares() {
    return this.api.libraryPlaces();
  }

  /** Un lugar completo, con el arte ya en su dirección pública. */
  lugar(id: string): Observable<Escenario> {
    return this.api.libraryPlace(id);
  }

  /**
   * Lee el caso `caseVersionId` y lo vuelve borrador: el editor, el mundo de cada mapa y, si el caso viene de un lugar,
   * ese lugar. Si la biblioteca no responde, el caso abre igual con el catálogo vacío (las salas siguen editables).
   */
  abrirCaso(caseVersionId: number): Observable<CasoLeido> {
    return this.api.caseEditor(caseVersionId).pipe(
      switchMap((editor) => {
        const mundos$ = editor.maps.length
          ? forkJoin(editor.maps.map((m) => this.api.worldEditor(caseVersionId, m.nodeId)))
          : of([] as WorldDefinition[]);
        return mundos$.pipe(map((mundos) => ({ editor, mundos })));
      }),
      switchMap(({ editor, mundos }) => {
        const lugarId = mundos.map((m) => m.map.ambient?.['lugarId']).find((id): id is string => typeof id === 'string' && id !== '');
        const lugar$ = lugarId ? this.lugar(lugarId).pipe(catchError(() => of(null))) : of(null);
        return lugar$.pipe(map((lugar) => ({ caso: casoDesdeApi(editor, mundos, lugar), editor, mundos, lugar })));
      }),
    );
  }
}
