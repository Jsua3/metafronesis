import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { casoCopiadoDeLugar, casoSinLugar } from '../testing/caso-api';
import { universidad } from '../testing/universidad';
import { AutoriaApiService, type CasoLeido } from './autoria-api.service';

describe('AutoriaApiService.abrirCaso', () => {
  let servicio: AutoriaApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(AutoriaApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lee el editor, el mundo de cada mapa y el lugar, y arma el borrador', () => {
    const { editor, mundos } = casoCopiadoDeLugar(universidad, ['pasillo', 'consultorio']);
    let leido: CasoLeido | undefined;
    servicio.abrirCaso(41).subscribe((l) => (leido = l));

    http.expectOne('/api/authoring/cases/41/editor').flush({ data: editor });
    for (const m of editor.maps) {
      const i = editor.maps.indexOf(m);
      http.expectOne(`/api/authoring/cases/41/world?nodeId=${m.nodeId}`).flush({ data: mundos[i] });
    }
    http.expectOne('/api/biblioteca/lugares/universidad').flush({ data: universidad });

    expect(leido?.caso.titulo).toBe('Primera escucha en Bienestar');
    expect(leido?.caso.salas.map((s) => s.id)).toEqual(['pasillo', 'consultorio']);
    expect(leido?.caso.catalogo.muebles.length).toBeGreaterThan(0);
    expect(leido?.editor).toBe(editor);
    expect(leido?.mundos).toHaveLength(2);
  });

  it('un caso sin lugar no pide la biblioteca y abre con el catálogo vacío', () => {
    const { editor, mundos } = casoSinLugar();
    let leido: CasoLeido | undefined;
    servicio.abrirCaso(7).subscribe((l) => (leido = l));
    http.expectOne('/api/authoring/cases/7/editor').flush({ data: editor });
    editor.maps.forEach((m, i) => http.expectOne(`/api/authoring/cases/7/world?nodeId=${m.nodeId}`).flush({ data: mundos[i] }));
    http.expectNone('/api/biblioteca/lugares/universidad');
    expect(leido?.caso.lugarId).toBeNull();
    expect(leido?.lugar).toBeNull();
    expect(leido?.caso.catalogo).toEqual({ muebles: [], objetos: [], herramientas: [] });
  });

  it('si la biblioteca no responde, el caso abre igual con el catálogo vacío', () => {
    const { editor, mundos } = casoCopiadoDeLugar(universidad, ['pasillo']);
    let leido: CasoLeido | undefined;
    servicio.abrirCaso(41).subscribe((l) => (leido = l));
    http.expectOne('/api/authoring/cases/41/editor').flush({ data: editor });
    http.expectOne(`/api/authoring/cases/41/world?nodeId=${editor.maps[0].nodeId}`).flush({ data: mundos[0] });
    http.expectOne('/api/biblioteca/lugares/universidad').flush({ message: 'x' }, { status: 503, statusText: 'No disponible' });
    expect(leido?.caso.lugarId).toBe('universidad');
    expect(leido?.caso.salas).toHaveLength(1);
    expect(leido?.caso.catalogo.muebles).toEqual([]);
    expect(leido?.lugar).toBeNull();
  });

  it('un caso sin mapas abre sin pedir ningún mundo', () => {
    const { editor } = casoSinLugar();
    let leido: CasoLeido | undefined;
    servicio.abrirCaso(7).subscribe((l) => (leido = l));
    http.expectOne('/api/authoring/cases/7/editor').flush({ data: { ...editor, maps: [], nodes: [], decisions: [] } });
    expect(leido?.caso.salas).toEqual([]);
  });
});
