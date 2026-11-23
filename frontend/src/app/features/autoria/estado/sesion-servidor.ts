import { Observable, firstValueFrom } from 'rxjs';

import type { AuthoringApi } from '../../../core/api/authoring.api';
import type {
  BriefUpdateRequest, CaseEditorView, ChecklistUpdateRequest, CharacterUpsertRequest, DecisionOptionUpsertRequest, DialogueUpsertRequest, EndingRule, HintEditorState, HintUpsertRequest, MapEditorState,
  MapUpsertRequest, Milestone, NodeUpsertRequest, RiskLevel, WorldDefinition, WorldDialogueTree, WorldDialoguesSaveRequest, WorldRoomSaveRequest,
} from '../../../core/models/simulation.model';
import type { CasoLeido } from '../api/autoria-api.service';
import type { Escenario } from '../modelo/escenario';

/** El id del servidor que dice un id del borrador: el propio número (lo que se leyó) o el que se anotó al crearlo. */
function comoNumero(id: string): number | undefined {
  return /^\d+$/.test(id) ? Number(id) : undefined;
}

/**
 * Lo que el editor sabe del caso en el servidor: la última vista, el mundo de cada mapa, el lugar de la biblioteca y la
 * revisión vigente. Cada escritura manda esa revisión y adopta la que devuelve la respuesta, así que quien llama no la
 * lleva a mano (y dos escrituras seguidas nunca chocan solas).
 *
 * Los ids del borrador son los del servidor (como texto) para lo que se leyó, y un id propio (`escena-ab12…`) para lo
 * que se creó en esta visita: `nodos` y `decisiones` guardan a qué fila del servidor corresponde cada uno.
 */
export class SesionServidor {
  revision: number;
  vista: CaseEditorView;
  readonly mundos: Map<number, WorldDefinition>;
  readonly lugar: Escenario | null;
  private readonly nodos = new Map<string, number>();
  private readonly decisiones = new Map<string, number>();

  constructor(readonly api: AuthoringApi, readonly caseVersionId: number, lectura: CasoLeido) {
    this.vista = lectura.editor;
    this.revision = lectura.editor.revision;
    this.lugar = lectura.lugar;
    this.mundos = new Map(lectura.mundos.map((m) => [m.nodeId, m]));
  }

  // ─── Qué fila del servidor es cada cosa del borrador ──────────────────────────

  nodoDe(escenaId: string): number | undefined {
    const id = this.nodos.get(escenaId) ?? comoNumero(escenaId);
    return id !== undefined && this.vista.nodes.some((n) => n.id === id) ? id : undefined;
  }

  /** El id del borrador de la escena que es el nodo: el que se le dio al crearla en esta visita o, si no, el número del servidor. */
  idLocalDeNodo(nodoId: number): string {
    for (const [local, id] of this.nodos) if (id === nodoId) return local;
    return String(nodoId);
  }

  /** El id del borrador de la respuesta que es la opción: el que se le dio al crearla en esta visita o, si no, el número del servidor. */
  idLocalDeDecision(decisionId: number): string {
    for (const [local, id] of this.decisiones) if (id === decisionId) return local;
    return String(decisionId);
  }

  anotarNodo(escenaId: string, nodoId: number): void {
    this.nodos.set(escenaId, nodoId);
  }

  /** La escena del borrador que es el nodo `nodoId`. */
  escenaDeNodo(nodoId: number, escenas: ReadonlyArray<{ id: string }>): string | undefined {
    return escenas.find((e) => this.nodoDe(e.id) === nodoId)?.id;
  }

  decisionDe(respuestaId: string): number | undefined {
    const id = this.decisiones.get(respuestaId) ?? comoNumero(respuestaId);
    return id !== undefined && this.vista.decisions.some((d) => d.id === id) ? id : undefined;
  }

  anotarDecision(respuestaId: string, decisionId: number): void {
    this.decisiones.set(respuestaId, decisionId);
  }

  respuestaDeDecision(decisionId: number, respuestas: ReadonlyArray<{ id: string }>): string | undefined {
    return respuestas.find((r) => this.decisionDe(r.id) === decisionId)?.id;
  }

  mapaDeNodo(nodoId: number): MapEditorState | undefined {
    return this.vista.maps.find((m) => m.nodeId === nodoId);
  }

  // ─── Escrituras: mandan la revisión vigente y adoptan la que devuelven ────────

  private async escribir(llamada: (revision: number) => Observable<CaseEditorView>): Promise<CaseEditorView> {
    const vista = await firstValueFrom(llamada(this.revision));
    this.vista = vista;
    this.revision = vista.revision;
    return vista;
  }

  crearNodo(cuerpo: NodeUpsertRequest) {
    return this.escribir((r) => this.api.createNode(this.caseVersionId, cuerpo, r));
  }

  actualizarNodo(nodoId: number, cuerpo: NodeUpsertRequest) {
    return this.escribir((r) => this.api.updateNode(this.caseVersionId, nodoId, cuerpo, r));
  }

  borrarNodo(nodoId: number) {
    return this.escribir((r) => this.api.deleteNode(this.caseVersionId, nodoId, r));
  }

  aceptarNodo(nodoId: number) {
    return this.escribir((r) => this.api.acceptAiNode(this.caseVersionId, nodoId, r));
  }

  crearMapa(cuerpo: MapUpsertRequest) {
    return this.escribir((r) => this.api.createMap(this.caseVersionId, cuerpo, r));
  }

  crearDecision(cuerpo: DecisionOptionUpsertRequest) {
    return this.escribir((r) => this.api.createDecision(this.caseVersionId, cuerpo, r));
  }

  actualizarDecision(decisionId: number, cuerpo: DecisionOptionUpsertRequest) {
    return this.escribir((r) => this.api.updateDecision(this.caseVersionId, decisionId, cuerpo, r));
  }

  borrarDecision(decisionId: number) {
    return this.escribir((r) => this.api.deleteDecision(this.caseVersionId, decisionId, r));
  }

  aceptarObjeto(objetoId: number) {
    return this.escribir((r) => this.api.acceptAiObject(this.caseVersionId, objetoId, r));
  }

  aceptarDecision(decisionId: number) {
    return this.escribir((r) => this.api.acceptAiDecision(this.caseVersionId, decisionId, r));
  }

  crearPista(mapaId: number, cuerpo: HintUpsertRequest) {
    return this.escribir((r) => this.api.createHint(this.caseVersionId, mapaId, cuerpo, r));
  }

  actualizarPista(pistaId: number, cuerpo: HintUpsertRequest) {
    return this.escribir((r) => this.api.updateHint(this.caseVersionId, pistaId, cuerpo, r));
  }

  borrarPista(pistaId: number) {
    return this.escribir((r) => this.api.deleteHint(this.caseVersionId, pistaId, r));
  }

  /** Las pistas que el servidor tiene en un mapa, por su orden. */
  pistasDeMapa(mapaId: number): HintEditorState[] {
    return (this.vista.hints ?? []).filter((h) => h.mapId === mapaId).sort((a, b) => a.order - b.order);
  }

  crearDialogo(mapaId: number, cuerpo: DialogueUpsertRequest) {
    return this.escribir((r) => this.api.createDialogue(this.caseVersionId, mapaId, cuerpo, r));
  }

  actualizarDialogo(arbolId: number, cuerpo: DialogueUpsertRequest) {
    return this.escribir((r) => this.api.updateDialogue(this.caseVersionId, arbolId, cuerpo, r));
  }

  crearPersonaje(cuerpo: CharacterUpsertRequest) {
    return this.escribir((r) => this.api.createCharacter(this.caseVersionId, cuerpo, r));
  }

  guardarHitos(hitos: Milestone[]) {
    return this.escribir((r) => this.api.updateMilestones(this.caseVersionId, hitos, r));
  }

  guardarRiesgo(nivel: RiskLevel | null) {
    return this.escribir((r) => this.api.updateRisk(this.caseVersionId, nivel, r));
  }

  guardarFicha(ficha: BriefUpdateRequest) {
    return this.escribir((r) => this.api.updateBrief(this.caseVersionId, ficha, r));
  }

  guardarLista(lista: ChecklistUpdateRequest) {
    return this.escribir((r) => this.api.updateChecklist(this.caseVersionId, lista, r));
  }

  guardarFinales(finales: EndingRule[]) {
    return this.escribir((r) => this.api.updateEndings(this.caseVersionId, finales, r));
  }

  // ─── El mundo de un mapa ──────────────────────────────────────────────────────

  /** El mundo de un mapa, el que se leyó o, si no se tiene, el que el servidor da ahora. */
  async mundoDe(nodoId: number): Promise<WorldDefinition> {
    const guardado = this.mundos.get(nodoId);
    if (guardado) return guardado;
    return this.releerMundo(nodoId);
  }

  async releerMundo(nodoId: number): Promise<WorldDefinition> {
    const mundo = await firstValueFrom(this.api.worldEditor(this.caseVersionId, nodoId));
    this.mundos.set(nodoId, mundo);
    return mundo;
  }

  /**
   * Vuelve a leer del servidor el caso y el mundo de cada mapa. Lo usa el store tras un cambio de varias llamadas que falló a
   * medias: las llamadas que sí entraron no siempre dejan su resultado en la sesión (por ejemplo, un diálogo cambiado), así que
   * lo que el editor sabe se pone al día de una vez.
   */
  async releerTodo(): Promise<void> {
    const vista = await firstValueFrom(this.api.caseEditor(this.caseVersionId));
    const mundos = await Promise.all(vista.maps.map((m) => firstValueFrom(this.api.worldEditor(this.caseVersionId, m.nodeId))));
    this.vista = vista;
    this.revision = vista.revision;
    this.mundos.clear();
    for (const m of mundos) this.mundos.set(m.nodeId, m);
  }

  /** Guarda la sala de un mapa con la revisión vigente (viaja en el cuerpo) y adopta la que devuelve. */
  async guardarMundo(nodoId: number, solicitud: Omit<WorldRoomSaveRequest, 'revision'>): Promise<WorldDefinition> {
    const mundo = await firstValueFrom(this.api.saveWorld(this.caseVersionId, { ...solicitud, revision: this.revision }, nodoId));
    this.mundos.set(nodoId, mundo);
    this.revision = mundo.revision;
    return mundo;
  }

  /**
   * Guarda solo los diálogos de un mapa (el servidor deja sin tocar las listas que no vienen: objetos y zonas quedan como
   * están) con la revisión vigente. La lista reemplaza a la de la sala: cada diálogo que se quiere conservar va en ella.
   */
  async guardarDialogos(nodoId: number, dialogues: WorldDialogueTree[]): Promise<WorldDefinition> {
    const cuerpo: WorldDialoguesSaveRequest = { revision: this.revision, dialogues };
    const mundo = await firstValueFrom(this.api.saveWorld(this.caseVersionId, cuerpo, nodoId));
    this.mundos.set(nodoId, mundo);
    this.revision = mundo.revision;
    return mundo;
  }
}
