# Tomas del inicio de sesión

La ventana del acceso muestra cinco tomas cortas del juego real (caso insignia SIM-VBG-002). Se regeneran con estos
scripts cuando cambie el arte, el caso o la interfaz del juego. Ninguna imagen se genera con IA: todo sale de la pantalla.

## Qué muestra cada toma y por qué

| Toma | Qué se ve | Qué comunica |
|---|---|---|
| `llegada` | De noche, la psicóloga camina por la sala de espera hasta la familia. | Es un lugar que se recorre, con personas, no un cuestionario. |
| `escucha` | Se acerca a Gloria; la cámara se cierra y ella habla, con su retrato. | Primero se escucha. Muestra el diálogo y la dirección de cámara. |
| `decision` | Cuatro opciones (una usa una herramienta); se elige y Gloria responde. | Decidir es el centro del simulador, y cada decisión tiene respuesta. |
| `cruce` | La familia camina a la puerta y la psicóloga entra a la sala de escucha. | La decisión cambia la historia: ahora hay un lugar con privacidad. |
| `supervision` | Al cierre, la revisión del profesor paso a paso. | El aprendizaje: qué se logró, explicado. |

Criterios:

- **Sin relato de la violencia.** El acceso se ve antes del aviso de contenido del caso, así que las tomas salen de la
  escena «Un lugar para hablar» y del cierre, donde nadie describe la agresión ni la muerte.
- **Sin personas reales.** La cuenta de grabación usa el avatar genérico `valentina`; no sale ningún personaje basado en
  una persona real.
- **Interfaz periférica oculta.** Barra, objetivo, plano y herramientas se ocultan: a la mitad de tamaño solo harían
  ruido. El mundo, los cuadros de diálogo, las opciones y la revisión son los del juego, sin retoques.

## Cómo se graba

`grabar.mjs` entra con una cuenta de estudiante, avanza el intento por la API hasta la escena de cada toma (con la mejor
respuesta y las herramientas recogidas) y juega el momento en el navegador. No graba en tiempo real: detiene el reloj de
la página y captura 30 cuadros por segundo sin pérdida, así que el resultado no depende del equipo. La vista es de
960 × 600 a densidad 4/3 (1280 × 800 físicos, con zoom entero del juego); la revisión del cierre usa 720 × 450.

Necesita: Node 24, ffmpeg con `libsvtav1`, `libx264` y `libwebp`, Playwright 1.45 o posterior con Chromium, y la
aplicación corriendo en local sobre una base de pruebas.

1. Preparar la cuenta (una vez por base; la contraseña la eliges tú y no se imprime):

   ```bash
   GRABAR_CLAVE='una-contraseña-larga' python manage.py shell < frontend/scripts/cinematicas-acceso/preparar_cuenta.py
   ```

2. Servir la API y el frontend (mejor en configuración de producción: `ng serve -c production`).

3. Grabar (PowerShell: define las variables con `$env:NOMBRE = '…'`):

   ```bash
   SIEP_URL=http://127.0.0.1:4200 SIEP_CLAVE='una-contraseña-larga' node frontend/scripts/cinematicas-acceso/grabar.mjs
   ```

4. Codificar a `frontend/src/assets/login/tomas/`:

   ```bash
   node frontend/scripts/cinematicas-acceso/codificar.mjs
   ```

| Variable | Para qué | Por defecto |
|---|---|---|
| `SIEP_URL` | Dirección del frontend | `http://127.0.0.1:4200` |
| `SIEP_CORREO` | Cuenta de estudiante | la de demostración `valentina.rios@…` |
| `SIEP_CLAVE` o `SIEP_CLAVE_ARCHIVO` | Contraseña, o archivo con una línea `GRABAR_CLAVE=…` | (obligatoria) |
| `TOMAS` | Solo algunas, separadas por comas | todas |
| `SALIDA` | Carpeta de los cuadros | carpeta temporal `metafronesis-tomas` |
| `DESTINO` | Carpeta de los archivos codificados | `src/assets/login/tomas` |
| `PLAYWRIGHT_DIR` | Carpeta del paquete `playwright` si no está instalado aquí | se resuelve normal |
| `CHROMIUM_PATH`, `CHROMIUM_ARGS` | Navegador y banderas (por defecto, GPU con D3D11) | el de Playwright |

Si cambian los textos de las opciones, las salas o los nombres de los botones del juego, el script se detiene y deja
`error.png` en la carpeta de salida. Cada toma está descrita al final de `grabar.mjs`.

Después de regenerar: revisa las cinco tomas completas (nada de datos personales, ningún relato de la violencia, ningún
aviso a medias) y actualiza la duración y el texto alternativo en la configuración de las tomas del acceso si cambiaron.
