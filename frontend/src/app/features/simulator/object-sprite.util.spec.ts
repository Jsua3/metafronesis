import {
  BibliotecaManifest,
  artLoadsFor,
  isBibliotecaManifest,
  manifestKeyOf,
  objectSheetSpecs,
  objectSpriteSpecs,
  resolveObjectTextureKey,
  resolveToolTextureKey,
  spriteFor,
} from './object-sprite.util';

describe('object-sprite.util', () => {
  it('resolveToolTextureKey mapea el toolCode (TOOL) a su clave de textura', () => {
    expect(resolveToolTextureKey('PAP')).toBe('object-tool_pap');
    expect(resolveToolTextureKey('RISK_METER')).toBe('object-tool_risk_meter');
  });

  it('resolveObjectTextureKey mapea el shortCode (OBJECT) a su clave de textura', () => {
    expect(resolveObjectTextureKey('EXP')).toBe('object-object_expediente');
    expect(resolveObjectTextureKey('LEY')).toBe('object-object_marco_normativo');
    expect(resolveObjectTextureKey('RES')).toBe('object-object_acceso_restringido');
    expect(resolveObjectTextureKey('FIN')).toBe('object-object_cierre');
  });

  it('devuelve null para código desconocido o nulo (→ fallback)', () => {
    expect(resolveToolTextureKey('NOPE')).toBeNull();
    expect(resolveObjectTextureKey('XXX')).toBeNull();
    expect(resolveObjectTextureKey(null)).toBeNull();
    expect(resolveToolTextureKey(undefined)).toBeNull();
  });

  it('objectSpriteSpecs lista los 10 sprites (5 herramientas + 5 escenario)', () => {
    const specs = objectSpriteSpecs();
    expect(specs).toHaveLength(10);
    expect(specs).toContainEqual({ textureKey: 'object-tool_pap', assetPath: '/assets/game/objects/tool_pap.png' });
    expect(specs).toContainEqual({ textureKey: 'object-object_expediente', assetPath: '/assets/game/objects/object_expediente.png' });
  });
});

/** Manifiesto mínimo: una hoja de la biblioteca, una de un sprite fijo y un reposo sin hoja. */
const MANIFEST: BibliotecaManifest = {
  esquema: 1,
  sprites: {
    'modelos/arte/ventana.png': { ancho: 32, alto: 32, origen: 'modelo' },
    'modelos/arte/ventana-cerca.png': { ancho: 32, alto: 32, cuadros: 3, fps: 6, origen: 'modelo' },
    'modelos/arte/camara-seguridad-cerca.png': { ancho: 24, alto: 20, cuadros: 2, fps: 4, origen: 'modelo' },
    'modelos/existentes/arte/tool_pap-cerca.png': { ancho: 28, alto: 21, cuadros: 3, fps: 6, origen: 'existente' },
    'modelos/existentes/arte/object_expediente-cerca.png': { ancho: 28, alto: 22, cuadros: 3, fps: 6, origen: 'existente' },
  },
};

const objeto = (type: string, extra: Record<string, unknown> = {}) => ({ type, toolCode: null, shortCode: '', ...extra });

describe('spriteFor: un objeto con hoja en el manifiesto se carga como spritesheet con sus cuadros y fps', () => {
  it('un objeto copiado de la biblioteca: reposo de metadata.arte y hoja con las medidas del manifiesto', () => {
    const sprite = spriteFor(objeto('PROP', {
      metadata: {
        arte: '/assets/biblioteca/modelos/arte/ventana.png',
        animacionCerca: { hoja: '/assets/biblioteca/modelos/arte/ventana-cerca.png', cuadros: 99, fps: 6 },
      },
    }), MANIFEST);
    expect(sprite).toEqual({
      textureKey: 'biblioteca-modelos/arte/ventana.png',
      assetPath: '/assets/biblioteca/modelos/arte/ventana.png',
      sheet: {
        textureKey: 'biblioteca-modelos/arte/ventana-cerca.png',
        assetPath: '/assets/biblioteca/modelos/arte/ventana-cerca.png',
        frames: 3, fps: 6, frameWidth: 32, frameHeight: 32,
      },
    });
  });

  it('los cuadros y las medidas salen del manifiesto, no de lo que diga el caso', () => {
    const sprite = spriteFor(objeto('OBJECT', {
      metadata: {
        arte: '/assets/biblioteca/modelos/arte/ventana.png',
        animacionCerca: { hoja: '/assets/biblioteca/modelos/arte/ventana-cerca.png', cuadros: 40, ancho: 999, alto: 999 },
      },
    }), MANIFEST);
    expect(sprite?.sheet).toMatchObject({ frames: 3, frameWidth: 32, frameHeight: 32 });
  });

  it('fps: el del caso; si no, el del manifiesto; si no, 6', () => {
    const arte = '/assets/biblioteca/modelos/arte/camara-seguridad.png';
    const hoja = '/assets/biblioteca/modelos/arte/camara-seguridad-cerca.png';
    expect(spriteFor(objeto('PROP', { metadata: { arte, animacionCerca: { hoja, fps: 10 } } }), MANIFEST)?.sheet?.fps).toBe(10);
    expect(spriteFor(objeto('PROP', { metadata: { arte, animacionCerca: { hoja } } }), MANIFEST)?.sheet?.fps).toBe(4);
    const sinFps: BibliotecaManifest = {
      esquema: 1, sprites: { 'modelos/arte/camara-seguridad-cerca.png': { ancho: 24, alto: 20, cuadros: 2, origen: 'modelo' } },
    };
    expect(spriteFor(objeto('PROP', { metadata: { arte, animacionCerca: { hoja } } }), sinFps)?.sheet?.fps).toBe(6);
  });

  it('un sprite fijo por toolCode o shortCode trae su hoja «existente» del manifiesto', () => {
    expect(spriteFor(objeto('TOOL', { toolCode: 'PAP' }), MANIFEST)).toEqual({
      textureKey: 'object-tool_pap',
      assetPath: '/assets/game/objects/tool_pap.png',
      sheet: {
        textureKey: 'object-tool_pap-cerca',
        assetPath: '/assets/biblioteca/modelos/existentes/arte/tool_pap-cerca.png',
        frames: 3, fps: 6, frameWidth: 28, frameHeight: 21,
      },
    });
    expect(spriteFor(objeto('OBJECT', { shortCode: 'EXP' }), MANIFEST)?.sheet?.frameHeight).toBe(22);
  });

  it('metadata.arte gana sobre el sprite fijo del mismo objeto', () => {
    const sprite = spriteFor(objeto('TOOL', {
      toolCode: 'PAP', metadata: { arte: '/assets/biblioteca/modelos/arte/ventana.png' },
    }), MANIFEST);
    expect(sprite?.textureKey).toBe('biblioteca-modelos/arte/ventana.png');
  });
});

describe('spriteFor: hoja ausente cae al reposo', () => {
  it('con la hoja fuera del manifiesto, queda el reposo y no hay hoja', () => {
    const sprite = spriteFor(objeto('OBJECT', {
      metadata: {
        arte: '/assets/biblioteca/modelos/arte/ventana.png',
        animacionCerca: { hoja: '/assets/biblioteca/modelos/arte/no-existe-cerca.png', cuadros: 3, fps: 6 },
      },
    }), MANIFEST);
    expect(sprite).toEqual({ textureKey: 'biblioteca-modelos/arte/ventana.png', assetPath: '/assets/biblioteca/modelos/arte/ventana.png' });
  });

  it('una hoja del manifiesto sin cuadros (o con uno solo) no anima', () => {
    const arte = '/assets/biblioteca/modelos/arte/ventana.png';
    const hoja = '/assets/biblioteca/modelos/arte/ventana-cerca.png';
    const sinCuadros: BibliotecaManifest = { esquema: 1, sprites: { 'modelos/arte/ventana-cerca.png': { ancho: 32, alto: 32, origen: 'modelo' } } };
    const unCuadro: BibliotecaManifest = { esquema: 1, sprites: { 'modelos/arte/ventana-cerca.png': { ancho: 32, alto: 32, cuadros: 1, origen: 'modelo' } } };
    expect(spriteFor(objeto('PROP', { metadata: { arte, animacionCerca: { hoja } } }), sinCuadros)?.sheet).toBeUndefined();
    expect(spriteFor(objeto('PROP', { metadata: { arte, animacionCerca: { hoja } } }), unCuadro)?.sheet).toBeUndefined();
  });

  it('sin manifiesto (no cargó) todo queda en su reposo, también los sprites fijos', () => {
    expect(spriteFor(objeto('TOOL', { toolCode: 'PAP' }), null)).toEqual({
      textureKey: 'object-tool_pap', assetPath: '/assets/game/objects/tool_pap.png',
    });
    expect(spriteFor(objeto('PROP', {
      metadata: { arte: '/assets/biblioteca/modelos/arte/ventana.png', animacionCerca: { hoja: '/assets/biblioteca/modelos/arte/ventana-cerca.png' } },
    }), null)?.sheet).toBeUndefined();
  });

  it('un objeto sin arte ni sprite fijo (y las personas y puertas) no tiene sprite: cae a su marcador', () => {
    expect(spriteFor(objeto('OBJECT', { shortCode: 'XXX' }), MANIFEST)).toBeNull();
    expect(spriteFor(objeto('PROP'), MANIFEST)).toBeNull();
    expect(spriteFor(objeto('PERSON', { metadata: { arte: '/assets/biblioteca/modelos/arte/ventana.png' } }), MANIFEST)).toBeNull();
    expect(spriteFor(objeto('EXIT', { metadata: { arte: '/assets/biblioteca/modelos/arte/ventana.png' } }), MANIFEST)).toBeNull();
  });

  it('solo se aceptan PNG de la biblioteca: otra ruta, otro tipo o un «..» no se cargan', () => {
    for (const arte of [
      'https://otro.sitio/ventana.png', '/assets/game/objects/tool_pap.png', '/assets/biblioteca/modelos/../../secreto.png',
      '/assets/biblioteca/modelos/arte/ventana.svg', '/assets/biblioteca/', 42, null,
    ]) {
      expect(spriteFor(objeto('PROP', { metadata: { arte } }), MANIFEST)).toBeNull();
    }
    expect(manifestKeyOf('/assets/biblioteca/modelos/arte/ventana.png')).toBe('modelos/arte/ventana.png');
  });
});

describe('manifiesto y precarga', () => {
  it('isBibliotecaManifest solo acepta el esquema 1 con sprites', () => {
    expect(isBibliotecaManifest(MANIFEST)).toBe(true);
    expect(isBibliotecaManifest({ esquema: 2, sprites: {} })).toBe(false);
    expect(isBibliotecaManifest({ esquema: 1 })).toBe(false);
    expect(isBibliotecaManifest({ esquema: 1, sprites: [] })).toBe(false);
    expect(isBibliotecaManifest(null)).toBe(false);
  });

  it('objectSheetSpecs lista solo las hojas de los sprites fijos que el manifiesto respalda', () => {
    expect(objectSheetSpecs(MANIFEST).map(s => s.textureKey)).toEqual(['object-tool_pap-cerca', 'object-object_expediente-cerca']);
    expect(objectSheetSpecs(null)).toEqual([]);
  });

  it('artLoadsFor pide cada archivo una sola vez: reposo como imagen y hoja como spritesheet', () => {
    const ventana = { arte: '/assets/biblioteca/modelos/arte/ventana.png', animacionCerca: { hoja: '/assets/biblioteca/modelos/arte/ventana-cerca.png' } };
    const loads = artLoadsFor([objeto('PROP', { metadata: ventana }), objeto('PROP', { metadata: ventana }), objeto('PERSON')], MANIFEST);
    expect(loads).toEqual([
      { kind: 'image', textureKey: 'biblioteca-modelos/arte/ventana.png', assetPath: '/assets/biblioteca/modelos/arte/ventana.png' },
      {
        kind: 'sheet', textureKey: 'biblioteca-modelos/arte/ventana-cerca.png',
        assetPath: '/assets/biblioteca/modelos/arte/ventana-cerca.png', frameWidth: 32, frameHeight: 32,
      },
    ]);
  });
});
