# Catálogo de lugares

El catálogo recibido en `4-D-Bonilla-completo.zip` se encuentra en `biblioteca/escenarios/`: índice, casa, comisaría y universidad con sus JSON e imágenes (196 archivos del zip, copiados sin modificaciones).

`BIBLIOTECA_DIR` usa por defecto `BASE_DIR / "biblioteca"`; puede apuntar a otro directorio que contenga `escenarios/indice.json`. Las URLs públicas de imágenes comienzan con `/assets/biblioteca/escenarios/`; servir esos recursos al navegador sigue siendo responsabilidad de la integración del frontend.

Las pruebas de biblioteca incluyen casos temporales de seguridad y una prueba de integración con los tres lugares reales, que comprueba que las rutas de imágenes de la respuesta corresponden a archivos existentes.
