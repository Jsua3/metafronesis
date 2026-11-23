/**
 * El arte de pixel de la interfaz de diálogo (marcos, tramas, letras A a D, cursor, cola y pulso) como variables CSS.
 * Los PNG los genera `tools/escenarios/dialogo_arte.py` en `assets/game/dialogo/` con la luz de cada momento del día:
 * de noche el canto de los marcos toma el cálido de las lámparas y de día el del sol. Módulo puro: sin Angular.
 */
export type MomentoDelDia = 'noche' | 'dia';

export const LETRAS = ['A', 'B', 'C', 'D'] as const;

const RUTA = 'assets/game/dialogo/';
const MARCOS = ['placa', 'rotulo', 'ficha', 'ficha-sobre', 'ficha-foco', 'ficha-pulsada', 'ficha-elegida', 'burbuja',
  'tecla', 'tecla-encendida', 'tecla-hundida',
  'placa-sobre', 'placa-foco', 'placa-pulsada', 'placa-apagada', 'salida', 'salida-sobre', 'salida-foco', 'salida-pulsada'] as const;
const TRAMAS = ['placa', 'ficha', 'ficha-sobre', 'ficha-pulsada', 'ficha-elegida', 'burbuja',
  'placa-sobre', 'placa-pulsada', 'salida', 'salida-sobre', 'salida-pulsada'] as const;
/** El color de la fuente de luz, el mismo que usa `dialogo_arte.LUZ`. */
const LUZ: Readonly<Record<MomentoDelDia, string>> = { noche: '#ffcd82', dia: '#fff3cd' };

/** La letra de la opción en la posición `i`: A a D; más allá (no lo permite el documento), su número. */
export function letraDe(i: number): string {
  return LETRAS[i] ?? String(i + 1);
}

const url = (nombre: string) => `url(${RUTA}${nombre}.png)`;

/** Variables CSS con el arte del momento del día, para enlazar en el elemento raíz del panel. */
export function variablesDeArte(momento: MomentoDelDia): Record<string, string> {
  const vars: Record<string, string> = { '--luz': LUZ[momento] };
  for (const m of MARCOS) vars[`--marco-${m}`] = url(`marco-${m}-${momento}`);
  for (const t of TRAMAS) vars[`--trama-${t}`] = url(`trama-${t}-${momento}`);
  vars['--cursor'] = url(`cursor-${momento}`);
  // Los iconos de las placas de la cabecera: la bombilla de «Ver pista» (encendida con la luz del momento) y la puerta
  // de «Salida segura».
  vars['--icono-bombilla'] = url(`icono-bombilla-${momento}`);
  vars['--icono-bombilla-apagada'] = url('icono-bombilla-apagada');
  vars['--icono-salida'] = url('icono-salida');
  vars['--seguir'] = url(`seguir-${momento}`);
  vars['--cola'] = url('cola');
  vars['--sombra'] = url('sombra');
  for (const l of LETRAS) {
    vars[`--letra-${l}-clara`] = url(`letra-${l}-clara`);
    vars[`--letra-${l}-oscura`] = url(`letra-${l}-oscura`);
  }
  for (const p of ['CALM', 'TENSE', 'CRISIS']) vars[`--pulso-${p}`] = url(`pulso-${p}`);
  return vars;
}
