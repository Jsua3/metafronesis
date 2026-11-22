import { defineConfig } from 'vitest/config';

/**
 * Zona horaria de las pruebas: la de los usuarios (Bogotá), la misma en cualquier equipo. Las fechas con hora se pintan
 * en la zona del navegador (`toLocaleString`): «2026-10-05T23:59:00-05:00» es el 5 de octubre en Bogotá y el 6 en UTC,
 * la zona del CI. Se fija AQUÍ, en el proceso principal y antes de crear los hilos: dentro de una prueba no sirve,
 * porque en un hilo de trabajo (`vmThreads`) `process.env` es una copia y asignarle `TZ` no cambia la zona del motor.
 * La prueba «las pruebas corren en la zona de Bogotá» (case-review.util.spec.ts) falla con un mensaje claro si esto se pierde.
 */
process.env['TZ'] = 'America/Bogota';

/**
 * Configuración que `@angular/build:unit-test` funde con la suya (`runnerConfig: true` en angular.json).
 * TOO-1: `vmThreads` reutiliza los hilos y la carga de módulos entre archivos y aísla cada archivo en su
 * propio contexto de VM (con su propio jsdom); no usar `isolate: false`. Con `threads` la suite pasaba ~2/3
 * del tiempo levantando un entorno nuevo por archivo (57,7 s → ~21 s).
 */
export default defineConfig({
  test: {
    pool: 'vmThreads',
  },
});
