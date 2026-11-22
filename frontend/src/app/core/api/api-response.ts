/** Sobre común: el servidor omite los campos sin valor. */
export interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

/** Respuesta de un endpoint que siempre devuelve datos. */
export interface ApiDataResponse<T> extends ApiResponse<T> {
  data: T;
}
