import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { roleLabel } from '../../shared/ui/labels';
import { UiCabeceraIlustrada } from '../../shared/ui/cabecera-ilustrada/ui-cabecera-ilustrada';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { loadingPhase } from '../../shared/ui/skeleton/loading-phase';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiTooltip } from '../../shared/ui/tooltip/ui-tooltip';
import { UiSegmento, UiSegmentado } from '../../shared/ui/segmentado/ui-segmentado';
import { CanLeave } from '../../core/navigation/can-leave.guard';
import { AvatarStore } from './avatar.store';
import { avatarSummary, chooseElenco, choosePersonalizado, toggleAccessory, withBata, withCustom } from './character-editor.util';
import {
  ACCESSORIES,
  AVATAR_LABELS,
  AccessoryId,
  AvatarPersonalizado,
  COMPLEXIONS,
  HAIRS,
  HAIR_COLORS,
  PLAYABLE_IDS,
  PlayableId,
  SKINS,
} from './kit/avatar-v2';
import { BATA_VARIANT, resolveCharacter } from './kit/character-visual.resolver';
import { KitFigureComponent } from './kit/kit-figure.component';
import { KitService } from './kit/kit.service';
import { confirmLeaveEditor } from './leave-editor';

/**
 * Editor de avatar (plan visual F5-4; VD-13). La página va en la piel portal y SOLO el escenario de la vista previa en
 * la piel juego. Cada grupo es un conjunto de radios nativos (el navegador da las flechas y el foco), los objetivos
 * miden 44 px, los cambios sin guardar se dicen y se preguntan antes de salir (`canLeave`, por `canLeaveGuard`, y el aviso del
 * navegador al cerrar la pestaña), y «Restablecer» pide confirmación.
 */
@Component({
  selector: 'app-character-editor',
  imports: [KitFigureComponent, UiBadge, UiButton, UiCard, UiCabeceraIlustrada, UiErrorState, UiSegmentado, UiSkeleton, UiTooltip],
  templateUrl: './character-editor.component.html',
  styleUrl: './character-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class CharacterEditorComponent implements CanLeave {
  readonly store = inject(AvatarStore);
  private readonly kit = inject(KitService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(UiDialog);

  readonly avatar = this.store.avatar;
  readonly dirty = this.store.dirty;
  readonly bundle = this.kit.bundle;
  readonly loadError = signal(false);
  readonly motion = signal<'idle' | 'walk'>('idle');
  /** Reposo / Caminata con el segmentado común (DISENO C5), no dos opciones sueltas (pasada final, observación del líder). */
  protected readonly movimientos: readonly UiSegmento[] = [{ valor: 'idle', etiqueta: 'Reposo' }, { valor: 'walk', etiqueta: 'Caminata' }];
  protected elegirMovimiento(valor: string): void {
    this.motion.set(valor === 'walk' ? 'walk' : 'idle');
  }
  readonly viewIndex = signal(0);
  // Solo se admiten destinos conocidos del portal, para no navegar a una URL arbitraria.
  readonly destino = computed(() => {
    const volver = this.route.snapshot.queryParamMap.get('volver');
    return volver === '/portal/simulador' || volver === '/portal/dashboard' ? volver : null;
  });
  readonly destinoEtiqueta = computed(() => this.destino() === '/portal/dashboard' ? 'inicio' : 'casos');

  girar(paso: number): void {
    this.viewIndex.update(indice => (indice + paso + this.views.length) % this.views.length);
  }
  /** Último personalizado visto, para volver a él después de probar el elenco. */
  private readonly lastCustom = signal<AvatarPersonalizado | null>(null);
  /** Esqueleto del kit pasados 150 ms (sin parpadeo si ya estaba cargado). */
  private readonly kitPhase = loadingPhase(computed(() => !this.bundle() && !this.loadError()));
  protected readonly kitLoadingVisible = computed(() => this.kitPhase() === 'skeleton');

  readonly complexions = COMPLEXIONS;
  readonly skins = SKINS;
  readonly hairs = HAIRS;
  readonly hairColors = HAIR_COLORS;
  readonly accessories = ACCESSORIES;
  readonly labels = AVATAR_LABELS;
  readonly views = [
    { id: 'down', label: 'Frente' }, { id: 'right', label: 'Derecha' },
    { id: 'up', label: 'Espalda' }, { id: 'left', label: 'Izquierda' },
  ] as const;

  readonly custom = computed(() => {
    const avatar = this.avatar();
    return avatar.mode === 'personalizado' ? avatar : null;
  });

  readonly visual = computed(() => {
    const bundle = this.bundle();
    return bundle ? resolveCharacter(bundle, { kind: 'jugador', avatar: this.avatar() }) : null;
  });

  /** Tarjetas del elenco, con o sin bata según el interruptor (cuadro 0 a ×2, spec §8.2). */
  readonly cast = computed(() => {
    const bundle = this.bundle();
    if (!bundle) return [];
    const variant = this.avatar().bata ? BATA_VARIANT : null;
    return PLAYABLE_IDS.map(id => ({
      id,
      label: bundle.recipes[id]?.displayName ?? id,
      visual: resolveCharacter(bundle, { kind: 'receta', recipeId: id, variant }),
    }));
  });

  readonly customVisual = computed(() => {
    const bundle = this.bundle();
    return bundle ? resolveCharacter(bundle, { kind: 'jugador', avatar: choosePersonalizado(this.avatar(), this.lastCustom()) }) : null;
  });

  readonly bataOptions = computed(() => {
    const bundle = this.bundle();
    return [false, true].map(bata => ({
      bata,
      label: bata ? 'Con bata' : 'Sin bata',
      visual: bundle ? resolveCharacter(bundle, { kind: 'jugador', avatar: withBata(this.avatar(), bata) }) : null,
    }));
  });

  readonly roleLabel = computed(() => roleLabel(this.auth.currentUser()?.role));

  readonly characterLabel = computed(() => {
    const avatar = this.avatar();
    return avatar.mode === 'elenco' ? this.recipeLabel(avatar.recipeId) : 'Personalizado';
  });

  readonly summary = computed(() => avatarSummary(this.avatar(), id => this.recipeLabel(id)));

  constructor() {
    this.loadKit();
  }

  loadKit(): void {
    this.loadError.set(false);
    this.kit.load().catch(() => this.loadError.set(true));
  }

  isElenco(id: string): boolean {
    const avatar = this.avatar();
    return avatar.mode === 'elenco' && avatar.recipeId === id;
  }

  selectElenco(id: PlayableId): void {
    const custom = this.custom();
    if (custom) this.lastCustom.set(custom);
    this.store.set(chooseElenco(this.avatar(), id));
  }

  selectPersonalizado(): void {
    this.store.set(choosePersonalizado(this.avatar(), this.lastCustom()));
  }

  setCustom(patch: Partial<AvatarPersonalizado>): void {
    const custom = this.custom();
    if (custom) this.store.set(withCustom(custom, patch));
  }

  toggleAccessory(id: AccessoryId): void {
    const custom = this.custom();
    if (custom) this.store.set(toggleAccessory(custom, id));
  }

  setBata(bata: boolean): void {
    this.store.set(withBata(this.avatar(), bata));
  }

  /** Color base de la rampa (piel o pelo) para la muestra. */
  swatch(rampId: string): string {
    const ramp = this.bundle()?.ramps[rampId];
    return ramp ? ramp[1] : 'transparent';
  }

  private recipeLabel(id: string): string {
    return this.bundle()?.recipes[id]?.displayName ?? id;
  }

  guardar(): void {
    this.store.save();
    this.notify.success('Personaje guardado.');
  }

  /** Vuelve al personaje por defecto tras confirmarlo; lo guardado no cambia hasta guardar. */
  async restablecer(): Promise<void> {
    const confirmed = await this.dialog.confirm({
      title: '¿Restablecer tu personaje?',
      message: 'Vuelves al personaje por defecto. Tu personaje guardado no cambia hasta que guardes.',
      confirmLabel: 'Restablecer',
      tone: 'danger',
    });
    if (confirmed) this.store.reset();
  }

  continuar(): void {
    this.store.save();
    const destino = this.destino();
    if (destino) void this.router.navigateByUrl(destino);
  }

  /** Salir por la navegación con cambios sin guardar: pregunta (la ruta lleva `canLeaveGuard`). */
  canLeave(): Promise<boolean> {
    // La sesión ya se cerró (salir de la cuenta o un 401): no hay nada que preguntar; lo no guardado se descarta.
    if (!this.auth.currentUser()) {
      this.store.revert();
      return Promise.resolve(true);
    }
    return confirmLeaveEditor(this.store, this.dialog);
  }

  /** Cerrar o recargar la pestaña con cambios sin guardar: el navegador pregunta. */
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.dirty()) return;
    event.preventDefault();
  }
}
