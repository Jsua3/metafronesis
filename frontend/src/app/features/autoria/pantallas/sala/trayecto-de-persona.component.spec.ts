import { TestBed } from '@angular/core/testing';
import { TrayectoDePersonaComponent } from './trayecto-de-persona.component';

describe('TrayectoDePersonaComponent', () => {
  it('agrega, quita y reordena puntos sin alterar la ruta recibida', async () => {
    await TestBed.configureTestingModule({ imports: [TrayectoDePersonaComponent] }).compileComponents();
    const fixture = TestBed.createComponent(TrayectoDePersonaComponent);
    const ruta = { tipo: 'ruta' as const, modo: 'circuito' as const, puntos: [{ x: 10, y: 20 }, { x: 30, y: 40 }] };
    fixture.componentRef.setInput('ruta', ruta);
    const emitidos: typeof ruta[] = [];
    fixture.componentInstance.cambio.subscribe(m => emitidos.push(m as typeof ruta));
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-agregar]')!.click();
    expect(emitidos[0].puntos).toHaveLength(3);
    expect(ruta.puntos).toHaveLength(2);
    fixture.componentRef.setInput('ruta', emitidos[0]); fixture.detectChanges();
    const tercero = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('li button:first-child')[2];
    tercero.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.componentRef.setInput('ruta', emitidos[1]); fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-subir="2"]')!.click();
    expect(emitidos[2].puntos).toEqual([ruta.puntos[0], { x: 38, y: 40 }, ruta.puntos[1]]);
    fixture.componentRef.setInput('ruta', emitidos[2]); fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-quitar="1"]')!.click();
    expect(emitidos[3].puntos).toEqual(ruta.puntos);
  });
});
