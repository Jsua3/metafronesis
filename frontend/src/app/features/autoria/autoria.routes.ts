import type { Routes } from '@angular/router';

import { canLeaveGuard } from '../../core/navigation/can-leave.guard';
import { AutoriaShellComponent } from './autoria-shell.component';
import { AvanceComponent } from './pantallas/avance/avance.component';
import { DatosComponent } from './pantallas/datos/datos.component';
import { EditorComponent } from './pantallas/editor/editor.component';
import { EvaluacionComponent } from './pantallas/evaluacion/evaluacion.component';
import { FinalesComponent } from './pantallas/finales/finales.component';
import { GuionComponent } from './pantallas/guion/guion.component';
import { LugarComponent } from './pantallas/lugar/lugar.component';
import { PlanoCasoComponent } from './pantallas/plano/plano.component';
import { RevisionComponent } from './pantallas/revision/revision.component';
import { RubricaDelCasoComponent } from './pantallas/rubrica/rubrica-del-caso.component';
import { SalaComponent } from './pantallas/sala/sala.component';
import { SalasComponent } from './pantallas/salas/salas.component';

/** Las pantallas del editor de un caso (cuelgan de `portal/casos/:caseVersionId/editor`). */
export const pantallasDelEditor: Routes = [
  { path: '', component: EditorComponent, title: 'El caso · Editor de casos' },
  { path: 'sala/:salaId', component: SalaComponent, title: 'Sala · Editor de casos' },
  { path: 'escena/:escenaId', component: GuionComponent, title: 'Guion · Editor de casos' },
  // Datos guarda solo, pero un campo con error o un tema sin agregar viven solo en la pantalla: se pregunta antes de irse.
  { path: 'datos', component: DatosComponent, title: 'Datos del caso · Editor de casos', canDeactivate: [canLeaveGuard] },
  // E5: la etapa Evaluación tiene tres pestañas, cada una con su dirección (EDITOR.md §3.5).
  { path: 'evaluacion', component: EvaluacionComponent, title: 'Pasos profesionales · Editor de casos' },
  { path: 'rubrica', component: RubricaDelCasoComponent, title: 'Rúbrica del caso · Editor de casos' },
  { path: 'finales', component: FinalesComponent, title: 'Finales · Editor de casos' },
  { path: 'revision', component: RevisionComponent, title: 'Enviar a revisión · Editor de casos' },
  { path: 'plano', component: PlanoCasoComponent, title: 'Plano del caso · Editor de casos' },
  { path: '**', redirectTo: '' },
];

/** Las pantallas de crear un caso (cuelgan de `portal/casos/nuevo`). */
export const pantallasNuevoCaso: Routes = [
  { path: '', component: LugarComponent, title: 'Elegir un lugar · Editor de casos' },
  { path: 'salas', component: SalasComponent, title: 'Elegir salas · Editor de casos' },
  { path: 'generando/:generacionId', component: AvanceComponent, title: 'Armando tu caso · Editor de casos' },
  { path: '**', redirectTo: '' },
];

/**
 * El editor de un caso: se monta en `portal/casos/:caseVersionId/editor` (`app.routes.ts`). El marco abre el caso que
 * dice la dirección y pone las pantallas dentro. Salir del editor con algo sin guardar pregunta antes (`canLeave` del marco).
 */
export const rutasEditorCaso: Routes = [{ path: '', component: AutoriaShellComponent, canDeactivate: [canLeaveGuard], children: pantallasDelEditor }];

/** Crear un caso: elegir el lugar y las salas. Se monta en `portal/casos/nuevo` (`app.routes.ts`). */
export const rutasNuevoCaso: Routes = [{ path: '', component: AutoriaShellComponent, children: pantallasNuevoCaso }];
