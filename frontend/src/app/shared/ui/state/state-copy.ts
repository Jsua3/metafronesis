/**
 * Catálogo de textos de los estados de datos (plan visual §2.5 y §2.10, F2-5): propuesta neutral en español con
 * tildes y tuteo. Cada pantalla puede pasar su propio texto (más concreto: «Aún no tienes grupos»); estos son los
 * de reserva. Nada de este catálogo toca contenido clínico: lo que lo roce lo fija Psicología.
 */
export type UiEmptyKind = 'first-use' | 'no-results' | 'restricted';
export type UiErrorKind = 'network' | 'server' | 'forbidden' | 'not-found';

/** Ilustración de pixel art del juego (VD-8): tamaño nativo y escala ENTERA a la que se pinta. */
export interface StateArt {
  src: string;
  width: number;
  height: number;
  scale: number;
}

export interface EmptyStateCopy {
  title: string;
  description: string;
  actionLabel?: string;
  art: StateArt;
}

export interface ErrorStateCopy {
  title: string;
  message: string;
  icon: string;
  /** Reintentar solo donde puede cambiar algo (red, servidor); no ante un permiso o algo que no existe. */
  retry: boolean;
}

export const EMPTY_STATE_COPY: Readonly<Record<UiEmptyKind, EmptyStateCopy>> = {
  'first-use': {
    title: 'Todavía no hay nada aquí',
    description: 'Cuando crees el primer elemento, aparecerá en esta lista.',
    art: { src: '/assets/game/furniture/desk.png', width: 122, height: 58, scale: 2 },
  },
  'no-results': {
    title: 'No hay resultados',
    description: 'Ningún elemento coincide con la búsqueda o con los filtros.',
    actionLabel: 'Limpiar filtros',
    art: { src: '/assets/game/furniture/file_cabinet.png', width: 68, height: 51, scale: 2 },
  },
  restricted: {
    title: 'Esta sección no está disponible para ti',
    description: 'Si crees que deberías verla, pídele acceso a tu docente o a la administración.',
    art: { src: '/assets/game/doors/door_consultorio.png', width: 39, height: 74, scale: 2 },
  },
};

/**
 * Quién acompaña cada estado vacío del portal (DISENO §2.7): un personaje del kit a ×3 en `ui-empty-state [figura]`.
 * Una sola tabla para que cada rol vea siempre a la misma persona: el estudiante, a Camila en bata; la docente, a la
 * docente de la universidad; la administración, a la funcionaria de recepción; la bandeja de revisión, al supervisor
 * clínico. Son rutas bajo `assets/characters/kit/`.
 */
export const FIGURAS_VACIO = {
  estudiante: 'camila/bata',
  docente: 'docente-universidad',
  admin: 'funcionaria-recepcion',
  revision: 'supervisor-clinico',
} as const;

export type UiFiguraVacio = keyof typeof FIGURAS_VACIO;

export const ERROR_STATE_COPY: Readonly<Record<UiErrorKind, ErrorStateCopy>> = {
  network: {
    title: 'Sin conexión',
    message: 'No pudimos conectarnos. Revisa tu conexión a internet e inténtalo de nuevo.',
    icon: 'wifi_off',
    retry: true,
  },
  server: {
    title: 'No se pudo cargar',
    message: 'Algo falló de nuestro lado. Inténtalo de nuevo en un momento.',
    icon: 'error',
    retry: true,
  },
  forbidden: {
    title: 'Sin permiso',
    message: 'Tu cuenta no tiene permiso para ver esto. Si crees que es un error, escribe a la administración.',
    icon: 'lock',
    retry: false,
  },
  'not-found': {
    title: 'No lo encontramos',
    message: 'Puede que se haya borrado o que el enlace esté mal.',
    icon: 'search_off',
    retry: false,
  },
};

export const STATE_ACTION_COPY = {
  retry: 'Reintentar',
  technicalDetail: 'Detalle técnico',
} as const;
