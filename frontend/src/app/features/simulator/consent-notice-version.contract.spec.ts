import { readFileSync } from 'fs';
import { join } from 'path';

import { CONTENT_NOTICE_VERSION } from './consent-recorder';

/**
 * La versión del aviso de contenido vive en DOS sitios (S3-2b): el servidor es su dueño (`SIEP_CONTENT_NOTICE_VERSION`,
 * `psychosim/settings/base.py`) y el cliente envía la que mostró (`CONTENT_NOTICE_VERSION`). Si alguien
 * cambia una sin la otra, TODA aceptación sería un 409 `NOTICE_VERSION_STALE` y nadie podría entrar al caso: esta prueba
 * lo detecta antes. Cambiar la versión del aviso es una decisión que hace que todas las personas vuelvan a aceptar.
 */
// req: ETH-01, SIEP-RF-05
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const SERVER_SETTINGS = join(REPO_ROOT, 'psychosim', 'settings', 'base.py');

/** El valor por defecto de `SIEP_CONTENT_NOTICE_VERSION` en el servidor, o `null` si la línea ya no tiene esa forma. */
function serverDefaultNoticeVersion(source: string): string | null {
  const declaration = /^SIEP_CONTENT_NOTICE_VERSION\s*=\s*_version_de_aviso_env\(\s*"SIEP_CONTENT_NOTICE_VERSION"\s*,\s*"([^"\s]+)"\s*\)/m;
  return declaration.exec(source)?.[1] ?? null;
}

describe('versión del aviso de contenido: cliente y servidor', () => {
  it('el cliente envía exactamente la versión por defecto del servidor', () => {
    const serverDefault = serverDefaultNoticeVersion(readFileSync(SERVER_SETTINGS, 'utf-8'));

    expect(serverDefault, 'no se encontró el valor por defecto de SIEP_CONTENT_NOTICE_VERSION en settings/base.py: ¿cambió la forma de la línea?')
      .not.toBeNull();
    expect(CONTENT_NOTICE_VERSION).toBe(serverDefault);
  });

  it('es un texto corto sin espacios: cabe en `consent_records.notice_version` (40 caracteres)', () => {
    expect(CONTENT_NOTICE_VERSION).toMatch(/^[^\s\x00-\x1f\x7f]{1,40}$/);
  });

  // Control negativo de la propia lectura: si el servidor cambia el valor, o la línea cambia de forma, la prueba de
  // arriba falla; no puede pasar «en vacío».
  describe('la lectura del servidor', () => {
    const line = (version: string) => `SIEP_CONTENT_NOTICE_VERSION = _version_de_aviso_env("SIEP_CONTENT_NOTICE_VERSION", "${version}")\n`;

    it('lee el valor por defecto de la línea de verdad', () => {
      expect(serverDefaultNoticeVersion(`otra = 1\n${line('2026-10-borrador')}SIEP_CONSENT_REQUIRED = _env_flag("X")\n`)).toBe('2026-10-borrador');
    });

    it('si el servidor cambia el valor, ya no es el del cliente', () => {
      expect(serverDefaultNoticeVersion(line('2026-11-borrador'))).not.toBe(CONTENT_NOTICE_VERSION);
    });

    it('no confunde una línea comentada ni la de otra versión de aviso', () => {
      expect(serverDefaultNoticeVersion(`#: ${line('2026-10-borrador')}`)).toBeNull();
      expect(serverDefaultNoticeVersion('SIEP_DATA_TREATMENT_NOTICE_VERSION = _version_de_aviso_env("SIEP_DATA_TREATMENT_NOTICE_VERSION", "datos-1")\n'))
        .toBeNull();
    });

    it('si la línea cambia de forma, no la encuentra (y la prueba de contrato falla en vez de pasar en vacío)', () => {
      expect(serverDefaultNoticeVersion('SIEP_CONTENT_NOTICE_VERSION = os.environ.get("SIEP_CONTENT_NOTICE_VERSION", "2026-10-borrador")\n')).toBeNull();
      expect(serverDefaultNoticeVersion('')).toBeNull();
    });
  });
});
