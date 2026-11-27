import { reducedMotionQuery } from '../../core/a11y/reduced-motion';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AfterViewInit, CSP_NONCE, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, Injector, NgZone,
  afterNextRender, computed, effect, inject, signal, untracked, viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { map, merge, startWith } from 'rxjs';

import { EXPIRED_SESSION_REASON } from '../../core/auth/auth.guard';
import { AuthService } from '../../core/auth/auth.service';
import { CuentasRecordadasService } from '../../core/auth/cuentas-recordadas.service';
import { safeReturnUrl } from '../../core/auth/return-url';
import { throttledMessage } from '../../core/auth/throttled';
import { APP_BRAND } from '../../core/config/brand.config';
import { TemaService } from '../../core/tema/tema.service';
import { PublicBarComponent } from '../../shared/layout/public-bar.component';
import { UiButton } from '../../shared/ui/button/ui-button';
import { DoodlesComponent } from '../../shared/ui/doodles/doodles.component';
import { UiCheck } from '../../shared/ui/field/ui-check';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { UiScopeNotice } from '../../shared/ui/scope-notice/ui-scope-notice';
import type { DemoCredentials } from './login-demo.dev';
import { LOGIN_PEDAGOGY_PILLARS, LOGIN_REMEMBER_EMAIL_KEY } from './login-assets.config';
import { AccesoTomasComponent } from './acceso-tomas.component';
import { LOGIN_TOMAS } from './login-tomas.config';
import { findLoginRole, LOGIN_ROLES, LoginRole } from './login-role.config';

// Google Identity Services (cargado dinámicamente desde accounts.google.com/gsi/client)
declare const google: any;

const CAPS_LOCK_MESSAGE = 'Bloq Mayús está activado.';

/** Campos de cada formulario en el orden de la pantalla: al enviar con errores, el foco va al primero inválido. */
const SIGN_IN_FIELDS = [['email', 'login-email'], ['password', 'login-password']] as const;
const FORGOT_FIELDS = [['email', 'olvido-email']] as const;
const REQUEST_FIELDS = [['nombre', 'registro-nombre'], ['apellido', 'registro-apellido'], ['email', 'registro-email']] as const;

/**
 * Acceso (plan visual F4-2; rediseño Metafrónesis 2026-11-20): un formulario a la vista (entrar o solicitar acceso)
 * en una tarjeta con el acabado de las pantallas públicas (_publico.scss), en modo claro u oscuro según el tema
 * (TemaService; la piel va en el contenedor de la página, REGLA-010). Etiqueta visible en cada campo (ui-field, H-29)
 * y borde de control (H-28); un campo dice su error al salir de él solo si ya se escribió algo, y al enviar se muestran
 * todos y el foco va al primero; el botón dice que trabaja (ui-button [loading]) y no envía dos veces; al alternar
 * formularios el foco va al encabezado del nuevo (nunca a body).
 *
 * Al lado, la ventana de tomas reales del simulador (`app-acceso-tomas`), que se puede pausar (WCAG 2.2.2) y se detiene
 * mientras se usa el formulario. Con un ratón fino y sin «movimiento reducido», el puntero enciende una luz suave en el
 * fondo y en el filo de la tarjeta, y los tres píxeles de la marca se encienden a medida que el formulario se completa.
 * Bloq Mayús se avisa en el campo de la contraseña.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatIconModule, PublicBarComponent, UiButton, UiCheck, UiControl, UiField, UiScopeNotice,
    DoodlesComponent, AccesoTomasComponent,
  ],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './login.component.scss',
  host: { '[style.--acceso-teclado.px]': 'altoTeclado()' },
})
export class LoginComponent implements AfterViewInit {
  protected readonly altoTeclado = signal(0);
  readonly brand = APP_BRAND;
  readonly roles = LOGIN_ROLES;
  readonly pedagogyPillars = LOGIN_PEDAGOGY_PILLARS;
  readonly tomaActual = signal(LOGIN_TOMAS[0]);
  /** La ventana espera mientras se utiliza un formulario. */
  readonly formularioActivo = signal(false);

  /** Tema de las pantallas públicas: claro (piel portal) u oscuro (piel juego), en el contenedor de la página. */
  protected readonly tema = inject(TemaService);

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly cuentasRecordadas = inject(CuentasRecordadasService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pageRef = inject<ElementRef<HTMLElement>>(ElementRef);
  /** El nonce de la CSP de esta página (S2-4): Angular lo lee de ngCspNonce; sin política, nulo. */
  private readonly cspNonce = inject(CSP_NONCE, { optional: true });
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;

  /** La guardia mandó aquí porque la sesión venció (plan visual F3-6, H-34): se dice en la pantalla. */
  readonly sessionExpired = this.query.get('motivo') === EXPIRED_SESSION_REASON;

  /** Adónde volver al entrar: solo rutas internas (return-url.ts); si no, el panel. */
  private readonly destination = safeReturnUrl(this.query.get('returnUrl')) ?? '/portal/dashboard';

  /**
   * «Usar demo»: credenciales de la semilla, solo en desarrollo (RNF-01, VD-22). Se cargan con import() dentro de
   * ngDevMode, que el build de producción pliega: el módulo no llega al dist (check-dist-dev-only lo comprueba).
   */
  readonly demo = signal<Readonly<Record<LoginRole, DemoCredentials>> | null>(null);

  readonly selectedRole = signal<LoginRole>('ESTUDIANTE');
  readonly activeRole = computed(() => findLoginRole(this.selectedRole()));
  readonly showRegister = signal(false);
  readonly loading = signal(false);
  readonly demoLoading = signal(false);
  readonly error = signal('');

  // ── Google Identity Services ──────────────────────────────────────────────
  readonly googleBtn = viewChild<ElementRef<HTMLDivElement>>('googleBtn');
  readonly googleEnabled = signal(false);
  readonly googleLoading = signal(false);
  /** Google estaba configurado pero no cargó: se dice, no desaparece en silencio. */
  readonly googleUnavailable = signal(false);
  private googleInitialized = false;

  /**
   * Se intentó enviar el formulario: desde ahí cada campo vacío dice qué falta. Antes, un campo solo lo dice si ya se
   * escribió algo en él y se salió (validar al salir, nunca antes de escribir: guía de psicología de interfaces §5).
   */
  readonly signInTried = signal(false);
  readonly requestTried = signal(false);

  /**
   * Región de estado SIEMPRE presente (revisión de F4, I-4 y M-5): una región viva que nace con su texto no se
   * anuncia; esta existe desde el principio y solo cambia su texto («Ingresando…», «Enviando solicitud…», resultado).
   */
  readonly announcement = signal('');

  /** «¿Olvidaste tu contraseña?»: el tercer formulario de la tarjeta (también se abre con `?olvido=1`). */
  readonly showForgot = signal(this.query.get('olvido') === '1');
  readonly forgotTried = signal(false);
  readonly forgotLoading = signal(false);
  readonly forgotNotice = signal('');
  readonly forgotError = signal('');

  readonly registerNotice = signal('');
  readonly registerLoading = signal(false);
  readonly registerError = signal('');

  /** Encabezado del formulario visible: recibe el foco al alternar. */
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  /** El correo que una visita anterior pidió recordar (vacío si nadie lo pidió). */
  readonly correoRecordado = this.loadRememberedEmail();

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    // Parte desmarcado: en un aula con equipos compartidos, guardar el correo en el navegador lo decide quien lo usa, no un
    // valor por defecto. Si ya había uno guardado (lo pidió esa persona), la casilla sigue marcada.
    remember: [this.correoRecordado !== ''],
  });

  readonly forgotForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  readonly registerForm = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    apellido: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    // Campo trampa (S1-3): lo ve un formulario, no una persona. Debe viajar vacío.
    website: [''],
  });

  /**
   * Cuánto lleva escrito el formulario de entrada (solo para el acabado): un correo con forma de correo y una
   * contraseña con algo. No valida ni bloquea nada; lo usan los tres píxeles de la marca y el brillo del botón.
   */
  private readonly progress = toSignal(
    merge(this.form.valueChanges, this.form.statusChanges).pipe(
      startWith(null),
      map(() => ({ email: this.form.controls.email.valid, password: this.form.controls.password.value.length > 0 })),
    ),
    { requireSync: true },
  );
  readonly emailReady = computed(() => this.progress().email);
  readonly passwordReady = computed(() => this.progress().password);
  readonly ready = computed(() => this.emailReady() && this.passwordReady());

  /** Bloq Mayús activo mientras se escribe la contraseña: se dice en el campo, antes de que falle el ingreso. */
  readonly capsLock = signal(false);

  /** Ya se alternó entre «entrar» y «solicitar acceso»: solo entonces el formulario nuevo entra con su fundido. */
  readonly switched = signal(false);

  constructor() {
    afterNextRender(() => this.trackPointer());
    afterNextRender(() => {
      const ventana = window.visualViewport;
      if (!ventana) return;
      const actualizar = () => {
        const campo = document.activeElement;
        const activo = window.innerWidth < 1024 && campo instanceof HTMLInputElement && !!campo.closest('.acceso__campos');
        this.altoTeclado.set(activo && ventana.scale === 1 ? Math.max(0, window.innerHeight - ventana.height - ventana.offsetTop) : 0);
        if (activo) requestAnimationFrame(() => this.despejarCampo(campo));
      };
      ventana.addEventListener('resize', actualizar);
      this.destroyRef.onDestroy(() => ventana.removeEventListener('resize', actualizar));
    });

    // SIEP-281: «Cambiar de cuenta» deja el correo elegido en memoria (nunca en la URL); se toma una sola vez y la
    // persona solo escribe la contraseña.
    const correoElegido = this.cuentasRecordadas.consumirCorreoPorEntrar();
    if (correoElegido) {
      this.form.controls.email.setValue(correoElegido);
      afterNextRender(() => this.pageRef.nativeElement.querySelector<HTMLInputElement>('#login-password')?.focus(), { injector: this.injector });
    }

    // El build de producción pliega ngDevMode a false y descarta la rama: el import() y su chunk no existen.
    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      this.auth.demoConfig().subscribe({
        next: config => {
          if (!config.enabled) return;
          void import('./login-demo.dev').then(module => {
            if (!this.destroyRef.destroyed) this.demo.set(module.LOGIN_DEMO_CREDENTIALS);
          }).catch(() => { /* Sin credenciales disponibles, no se ofrece la demostración. */ });
        },
        error: () => { /* Sin confirmación del servidor, no se ofrece la demostración. */ },
      });
    }
    // Al cambiar de modo, el botón de Google se pinta otra vez con el tema que toca (claro u oscuro).
    effect(() => {
      this.tema.piel();
      untracked(() => { if (this.googleEnabled()) this.renderGoogleButton(); });
    });
  }

  /**
   * Mensaje de error de un campo: tras salir de él con algo escrito, o tras intentar enviar. Mientras el campo siga
   * en error se revalida al escribir, así que el mensaje se va en cuanto queda bien (y lo escrito se conserva).
   */
  fieldError(control: AbstractControl, messages: { required: string; email?: string }, tried = false): string | null {
    if (!control.touched || control.valid) return null;
    if (!control.dirty && !tried) return null;
    if (control.hasError('required')) return messages.required;
    if (control.hasError('email') && messages.email) return messages.email;
    return null;
  }

  @HostListener('focusin', ['$event'])
  alEntrarFoco(event: FocusEvent): void {
    this.formularioActivo.set((event.target as Element | null)?.closest('form') != null);
  }

  @HostListener('focusin', ['$event'])
  protected cuidarCampo(event: FocusEvent): void {
    if (window.innerWidth >= 1024 || !(event.target instanceof HTMLInputElement) || !event.target.closest('.acceso__campos')) return;
    const campo = event.target;
    requestAnimationFrame(() => this.despejarCampo(campo));
  }

  private despejarCampo(campo: HTMLInputElement): void {
    if (document.activeElement !== campo) return;
    const boton = campo.closest('form')?.querySelector<HTMLElement>('.acceso__submit');
    if (!boton) return;
    const exceso = campo.getBoundingClientRect().bottom + 8 - boton.getBoundingClientRect().top;
    if (exceso > 0) window.scrollBy({ top: exceso, behavior: 'instant' });
  }

  @HostListener('focusout', ['$event'])
  alSalirFoco(event: FocusEvent): void {
    // Pasar de un campo a otro del formulario no reanuda las tomas entre medias.
    if ((event.relatedTarget as Element | null)?.closest?.('form')) return;
    this.formularioActivo.set(false);
  }

  /** El rol que pide la solicitud de acceso (el inicio de sesión no lo pide: el rol lo trae la cuenta). */
  selectRole(role: LoginRole): void {
    this.selectedRole.set(role);
    this.registerError.set('');
  }

  /** Bloq Mayús, leído de la tecla (keydown/keyup) y olvidado al salir del campo. */
  onPasswordKey(event: KeyboardEvent): void {
    const on = event.getModifierState?.('CapsLock') ?? false;
    if (on === this.capsLock()) return;
    this.capsLock.set(on);
    this.announceCapsLock(on);
  }

  clearCapsLock(): void {
    if (!this.capsLock()) return;
    this.capsLock.set(false);
    this.announceCapsLock(false);
  }

  private announceCapsLock(on: boolean): void {
    // La región de estado es una sola: el aviso no pisa «Ingresando…» ni un resultado, y se retira si sigue siendo suyo.
    if (on && !this.announcement()) this.announcement.set(CAPS_LOCK_MESSAGE);
    else if (!on && this.announcement() === CAPS_LOCK_MESSAGE) this.announcement.set('');
  }

  openSignIn(): void {
    this.switched.set(true);
    this.capsLock.set(false);
    this.showRegister.set(false);
    this.showForgot.set(false);
    this.forgotNotice.set('');
    this.forgotError.set('');
    this.registerNotice.set('');
    this.registerError.set('');
    this.announcement.set('');
    this.focusHeading();
    // El formulario de entrada se recrea: el botón de Google se pinta de nuevo en su contenedor nuevo (I-2).
    if (this.googleEnabled()) afterNextRender(() => this.renderGoogleButton(), { injector: this.injector });
  }

  /** «¿Olvidaste tu contraseña?»: pide el correo y manda el enlace para restablecerla. */
  openForgot(): void {
    this.switched.set(true);
    this.capsLock.set(false);
    this.forgotForm.controls.email.setValue(this.form.controls.email.value.trim() || this.forgotForm.controls.email.value);
    this.showForgot.set(true);
    this.showRegister.set(false);
    this.error.set('');
    this.forgotNotice.set('');
    this.forgotError.set('');
    this.announcement.set('');
    this.focusHeading();
  }

  onForgotSubmit(): void {
    if (this.forgotLoading()) return;
    this.forgotTried.set(true);
    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      this.focusFirstInvalid(this.forgotForm.controls, FORGOT_FIELDS);
      return;
    }
    this.forgotLoading.set(true);
    this.forgotNotice.set('');
    this.forgotError.set('');
    this.announcement.set('Enviando el enlace…');
    this.auth.requestPasswordReset(this.forgotForm.controls.email.value.trim().toLowerCase()).subscribe({
      next: response => {
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        const notice = response.message
          ?? 'Si el correo tiene una cuenta activa, te enviamos un enlace para restablecer la contraseña. Revisa también la carpeta de spam.';
        this.forgotNotice.set(notice);
        this.announcement.set(notice);
        this.forgotLoading.set(false);
        this.forgotTried.set(false);
      },
      error: (error: unknown) => {
        this.forgotError.set(this.forgotErrorMessage(error));
        this.announcement.set('');
        this.forgotLoading.set(false);
        this.focusError();
      },
    });
  }

  openSignUp(): void {
    this.switched.set(true);
    this.capsLock.set(false);
    this.showRegister.set(true);
    this.showForgot.set(false);
    this.error.set('');
    this.registerNotice.set('');
    this.registerError.set('');
    this.announcement.set('');
    this.selectedRole.set('ESTUDIANTE');
    this.focusHeading();
  }

  /** «Usar demo» (solo desarrollo): llena el correo y la contraseña de la cuenta demo de ese rol. */
  fillDemoCredentials(role: LoginRole): void {
    const credentials = this.demo()?.[role];
    if (!credentials || this.loading()) return;
    this.demoLoading.set(true);
    this.authenticate(credentials.email, credentials.password, 'Entrando como estudiante de demostración…');
  }

  useRememberedEmail(): void {
    this.form.controls.email.setValue(this.correoRecordado);
    this.pageRef.nativeElement.querySelector<HTMLInputElement>('#login-email')?.focus();
  }

  @HostListener('keydown', ['$event'])
  submitFromField(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement) || event.isComposing || event.repeat) return;
    const form = event.target.form;
    if (!form) return;
    event.preventDefault();
    form.requestSubmit();
  }

  ngAfterViewInit(): void {
    // Pide el client id público; si está configurado, monta el botón de Google.
    this.auth.googleConfig().subscribe({
      next: cfg => {
        if (cfg.enabled && cfg.clientId) this.setupGoogle(cfg.clientId);
      },
      error: () => { /* Google opcional y sin configurar: no se ofrece */ },
    });
  }

  onSubmit(): void {
    if (this.loading()) return;
    this.signInTried.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid(this.form.controls, SIGN_IN_FIELDS);
      return;
    }

    const { email, password, remember } = this.form.getRawValue();
    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (remember) localStorage.setItem(LOGIN_REMEMBER_EMAIL_KEY, normalizedEmail);
      else localStorage.removeItem(LOGIN_REMEMBER_EMAIL_KEY);
    } catch { /* almacenamiento bloqueado: se entra igual */ }

    this.authenticate(normalizedEmail, password, 'Ingresando…');
  }

  private authenticate(email: string, password: string, announcement: string): void {
    this.loading.set(true);
    this.error.set('');
    this.announcement.set(announcement);
    this.auth.login(email, password).subscribe({
      next: () => this.router.navigateByUrl(this.destination),
      error: (error: unknown) => {
        this.error.set(this.loginErrorMessage(error));
        this.announcement.set('');
        this.loading.set(false);
        if (this.demoLoading()) {
          this.demoLoading.set(false);
          this.demo.set(null);
          this.focusHeading();
        } else {
          this.focusError();
        }
      },
    });
  }

  onRegisterSubmit(): void {
    if (this.registerLoading()) return;
    this.requestTried.set(true);
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      this.focusFirstInvalid(this.registerForm.controls, REQUEST_FIELDS);
      return;
    }

    const { nombre, apellido, email, website } = this.registerForm.getRawValue();
    this.registerLoading.set(true);
    this.registerNotice.set('');
    this.registerError.set('');
    this.announcement.set('Enviando solicitud…');
    this.auth.requestAccess({
      nombre: nombre.trim(), apellido: apellido.trim(), email: email.trim().toLowerCase(), rol: this.selectedRole(), website,
    }).subscribe({
      next: response => {
        const notice = response.message ?? 'Solicitud enviada. El equipo académico revisará tu acceso y te contactará por correo.';
        this.registerNotice.set(notice);
        this.announcement.set(notice);
        this.registerLoading.set(false);
        this.requestTried.set(false);
        this.registerForm.reset({ nombre: '', apellido: '', email: '', website: '' });
      },
      error: (error: unknown) => {
        this.registerError.set(this.registerErrorMessage(error));
        this.announcement.set('');
        this.registerLoading.set(false);
        this.focusError();
      },
    });
  }

  /**
   * La luz del puntero (solo con ratón y sin «movimiento reducido»). El filtro se aplica a CADA evento y no al
   * engancharse: un `pointermove` táctil o de lápiz se ignora (`pointerType`), y la preferencia de movimiento se lee viva
   * (`MediaQueryList.matches`), así que cambiarla con la página abierta surte efecto sin recargar. Escribe variables CSS
   * con `style.setProperty` (no toca Angular ni atributos `style`, así que la CSP de estilos no se ve
   * afectada): `--mx/--my/--luz` en la página (la luz del fondo), `--gx/--gy` en la tarjeta (el filo que sigue al
   * cursor). Un cuadro de animación por lote de eventos.
   */
  private trackPointer(): void {
    if (typeof matchMedia !== 'function' || typeof requestAnimationFrame !== 'function') return;
    const motion = reducedMotionQuery()!;
    const page = this.pageRef.nativeElement.querySelector<HTMLElement>('.acceso');
    if (!page) return;
    let last: PointerEvent | null = null;
    let frame = 0;

    const paint = () => {
      frame = 0;
      if (!last) return;
      const { clientX: x, clientY: y } = last;
      page.style.setProperty('--mx', `${Math.round(x)}px`);
      page.style.setProperty('--my', `${Math.round(y)}px`);
      page.style.setProperty('--luz', '1');
      const card = page.querySelector<HTMLElement>('.acceso__card');
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--gx', `${Math.round(x - r.left)}px`);
        card.style.setProperty('--gy', `${Math.round(y - r.top)}px`);
      }
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || motion.matches) return;
      last = event;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      last = null;
      page.style.setProperty('--luz', '0');
    };

    this.zone.runOutsideAngular(() => {
      page.addEventListener('pointermove', onMove, { passive: true });
      page.addEventListener('pointerleave', onLeave);
    });
    this.destroyRef.onDestroy(() => {
      page.removeEventListener('pointermove', onMove);
      page.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    });
  }

  /** Tras pintar el formulario nuevo, el foco va a su encabezado (no cae a body con el que desaparece). */
  private focusHeading(): void {
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  /**
   * Un envío que falla lleva el foco al aviso de error (UA-E16): la alerta nace en el DOM con el foco aún en el botón, y
   * quien usa lector de pantalla no la oía; con el foco en ella se lee el motivo en palabras y desde ahí Tab sigue al
   * botón para reintentar (el aviso va justo antes). Después de pintar, para que el aviso ya exista.
   */
  private focusError(): void {
    afterNextRender(() => this.pageRef.nativeElement.querySelector<HTMLElement>('.acceso__error[role="alert"]')?.focus(), { injector: this.injector });
  }

  /**
   * Foco al primer campo inválido DESPUÉS de pintar (revisión de F4, I-3): así el campo ya lleva aria-invalid y su
   * mensaje en aria-describedby cuando el lector anuncia el foco.
   */
  private focusFirstInvalid(controls: Record<string, AbstractControl>, fields: ReadonlyArray<readonly [string, string]>): void {
    const first = fields.find(([name]) => controls[name]?.invalid);
    if (!first) return;
    afterNextRender(() => document.getElementById(first[1])?.focus(), { injector: this.injector });
  }

  private setupGoogle(clientId: string): void {
    this.loadGoogleScript()
      .then(() => {
        if (typeof google === 'undefined' || !google.accounts?.id) {
          this.googleUnavailable.set(true);
          this.announcement.set('El acceso con Google no está disponible ahora.');
          return;
        }
        if (!this.googleInitialized) {
          google.accounts.id.initialize({
            client_id: clientId,
            callback: (response: { credential: string }) => this.onGoogleCredential(response),
          });
          this.googleInitialized = true;
        }
        this.googleEnabled.set(true);
        afterNextRender(() => this.renderGoogleButton(), { injector: this.injector });
      })
      .catch(() => {
        this.googleEnabled.set(false);
        this.googleUnavailable.set(true);
        this.announcement.set('El acceso con Google no está disponible ahora.');
      });
  }

  /**
   * Pinta el botón de Google en su contenedor ACTUAL: el formulario de entrada se recrea al alternar, así que se
   * llama al cargar Google, cada vez que se vuelve a «Iniciar sesión» (revisión de F4, I-2) y al cambiar de modo. Toma
   * el ancho de su contenedor (Google admite de 200 a 400 px): en un teléfono no se sale de la tarjeta.
   */
  private renderGoogleButton(): void {
    const host = this.googleBtn()?.nativeElement;
    if (!host || typeof google === 'undefined' || !google.accounts?.id) return;
    host.innerHTML = '';
    const width = Math.round(Math.min(400, Math.max(200, host.clientWidth || 320)));
    google.accounts.id.renderButton(host, {
      theme: this.tema.piel() === 'game' ? 'filled_black' : 'outline', size: 'large', type: 'standard',
      text: 'continue_with', shape: 'pill', logo_alignment: 'left', width,
    });
  }

  private loadGoogleScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof google !== 'undefined' && google.accounts?.id) {
        resolve();
        return;
      }
      const existing = document.getElementById('google-gsi-script') as HTMLScriptElement | null;
      // Un script que ya falló en otra visita no vuelve a emitir eventos: se retira y se pide otra vez (M-4).
      if (existing?.dataset['fallo'] === 'true') existing.remove();
      else if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject());
        return;
      }
      const script = document.createElement('script');
      script.id = 'google-gsi-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      // Google Identity Services inyecta una hoja <style> en la página y le copia el nonce de SU script
      // (document.currentScript.nonce): sin él, la CSP en vigor (style-src con nonce) bloquea esa hoja (S2-4, sonda --google).
      if (this.cspNonce) script.nonce = this.cspNonce;
      script.onload = () => resolve();
      script.onerror = () => {
        script.dataset['fallo'] = 'true';
        reject();
      };
      document.head.appendChild(script);
    });
  }

  private onGoogleCredential(response: { credential: string }): void {
    if (!response?.credential || this.googleLoading()) return;
    this.googleLoading.set(true);
    this.error.set('');
    this.announcement.set('Conectando con Google…');
    this.auth.loginWithGoogle(response.credential).subscribe({
      next: () => this.router.navigateByUrl(this.destination),
      error: (error: unknown) => {
        this.error.set(this.googleErrorMessage(error));
        this.googleLoading.set(false);
        this.focusError();
      },
    });
  }

  private googleErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'No pudimos conectar con Google. Inténtalo de nuevo en un momento.';
    if (error.status === 429) return throttledMessage(error);
    if (error.status === 401 || error.status === 403) {
      return 'No pudimos entrar con esa cuenta de Google. Usa tu correo y contraseña, o solicita acceso.';
    }
    return error.error?.message || 'No pudimos iniciar sesión con Google. Inténtalo de nuevo en un momento.';
  }

  private forgotErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'No pudimos enviar el enlace. Inténtalo de nuevo en unos minutos.';
    if (error.status === 429) return throttledMessage(error);
    return error.error?.message || 'No pudimos enviar el enlace. Inténtalo de nuevo en unos minutos.';
  }

  private registerErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'No pudimos enviar la solicitud. Inténtalo de nuevo en unos minutos.';
    if (error.status === 429) return throttledMessage(error);
    return error.error?.message || 'No pudimos enviar la solicitud. Inténtalo de nuevo en unos minutos.';
  }

  private loadRememberedEmail(): string {
    try {
      return localStorage.getItem(LOGIN_REMEMBER_EMAIL_KEY) ?? '';
    } catch {
      return '';
    }
  }

  /**
   * Mensajes del acceso (guía de psicología de interfaces §5): el sistema asume la responsabilidad, no se dice
   * «inválido» ni «incorrecto», cada mensaje trae una salida y el mismo texto vale para un correo que no existe y para
   * una contraseña que no coincide (no revela qué cuentas hay).
   */
  private loginErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    if (error.status === 429) return throttledMessage(error);
    if (error.status === 401) {
      return 'No encontramos esa combinación de correo y contraseña. Revísala o usa «¿Olvidaste tu contraseña?».';
    }
    if (error.status === 403) return 'Tu cuenta no está activa o no tiene permiso para entrar. Escribe a la secretaría del programa.';
    if (error.status === 0) return 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    return 'No pudimos iniciar sesión. Inténtalo de nuevo en un momento.';
  }
}
