# Catálogo de lugares

El catálogo recibido en `4-D-Bonilla-completo.zip` se encuentra en `biblioteca/escenarios/`: índice, casa, comisaría y universidad con sus JSON e imágenes (196 archivos del zip, copiados sin modificaciones).

`BIBLIOTECA_DIR` usa por defecto `BASE_DIR / "biblioteca"`; puede apuntar a otro directorio que contenga `escenarios/indice.json`. Las URLs públicas de imágenes comienzan con `/assets/biblioteca/escenarios/`; servir esos recursos al navegador sigue siendo responsabilidad de la integración del frontend.

Las pruebas de biblioteca incluyen casos temporales de seguridad y una prueba de integración con los tres lugares reales, que comprueba que las rutas de imágenes de la respuesta corresponden a archivos existentes.

## Salas por piezas (esquema 3)

Casa, comisaría y universidad tienen dos plantillas: `escenario.json` (imagen fija, esquema 2) y `escenario-piezas.json` (esquema 3: cada sala trae su `estructura` con pisos, muros, ventanas, lámparas, muebles y momento del día). El hospital solo existe por piezas y vive en `escenario.json`. Un caso creado con `porPiezas: true` (y toda generación con IA) copia la plantilla por piezas; sin la opción, o en un lugar sin plantilla por piezas, se copia de imagen fija.

El servidor lee `biblioteca/piezas/manifiesto.json` (catálogo de piezas); es una copia, idéntica en contenido, de `frontend/src/assets/biblioteca/piezas/manifiesto.json`, y una prueba falla si dejan de coincidir. La imagen de producción la copia a `/app/biblioteca/piezas/`; el arte de las piezas lo sirve el frontend bajo `/assets/biblioteca/piezas/`.
