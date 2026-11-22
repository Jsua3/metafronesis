import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { Grupo, GrupoService } from '../../core/api/grupo.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { GrupoListComponent } from './grupo-list.component';
import type { Mock } from 'vitest';

/**
 * Validar al enviar en el formulario de grupo (crear / editar).
 *
 * No se renderiza el template: se instancia el componente con dobles de los
 * servicios y un host DOM mínimo (sin Material) para comprobar el foco.
 */
const grupoA: Grupo = { id: 1, nombre: 'Cohorte A', codigo: 'COH-A', totalEstudiantes: 3 };

describe('grupos: validar al enviar el formulario de grupo (comportamiento)', () => {
  let component: GrupoListComponent;
  let host: HTMLElement;
  let grupos: { listar: Mock; crear: Mock; actualizar: Mock; importSpec: Mock };
  let notify: { success: Mock; error: Mock; warning: Mock; info: Mock };

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    grupos = {
      listar: vi.fn(() => of([grupoA])),
      crear: vi.fn(),
      actualizar: vi.fn(),
      importSpec: vi.fn(),
    };
    notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: GrupoService, useValue: grupos },
        { provide: NotificationService, useValue: notify },
        { provide: ElementRef, useValue: new ElementRef(host) },
      ],
    });
    component = TestBed.runInInjectionContext(() => new GrupoListComponent());
    component.grupos.set([grupoA]);
  });

  afterEach(() => {
    host.remove();
    TestBed.resetTestingModule();
  });

  describe('crear con el formulario inválido', () => {
    it('no llama al servicio, marca los controles como tocados y no avisa', () => {
      expect(component.form.invalid).toBe(true);

      component.crear();

      expect(grupos.crear).not.toHaveBeenCalled();
      expect(Object.values(component.form.controls).every(control => control.touched)).toBe(true);
      expect(notify.error).not.toHaveBeenCalled();
      expect(notify.success).not.toHaveBeenCalled();
      expect(component.saving()).toBe(false);
    });

    it('con solo el nombre escrito tampoco crea y deja el código tocado', () => {
      component.form.patchValue({ nombre: 'Cohorte C' });
      expect(component.form.controls.codigo.hasError('required')).toBe(true);

      component.crear();

      expect(grupos.crear).not.toHaveBeenCalled();
      expect(component.form.controls.codigo.touched).toBe(true);
    });

    it('solo marca el formulario del grupo, no el de estudiantes', () => {
      component.crear();

      expect(component.estudianteForm.touched).toBe(false);
    });

    it('enfoca el primer control inválido del host', () => {
      host.innerHTML = '<input id="ok" class="ng-valid"><input id="uno" class="ng-invalid"><input id="dos" class="ng-invalid">';

      component.crear();

      expect(document.activeElement).toBe(host.querySelector('#uno'));
    });

    it('mientras guarda no marca ni enfoca nada y no vuelve a llamar al servicio', () => {
      host.innerHTML = '<input id="uno" class="ng-invalid">';
      component.saving.set(true);

      component.crear();

      expect(grupos.crear).not.toHaveBeenCalled();
      expect(component.form.controls.nombre.touched).toBe(false);
      expect(document.activeElement).not.toBe(host.querySelector('#uno'));
    });
  });

  describe('actualizar con el formulario inválido', () => {
    beforeEach(() => {
      component.editarGrupo(grupoA);
      component.form.patchValue({ nombre: '' });
    });

    it('no llama al servicio, marca los controles como tocados y no avisa', () => {
      component.actualizarGrupo();

      expect(grupos.actualizar).not.toHaveBeenCalled();
      expect(Object.values(component.form.controls).every(control => control.touched)).toBe(true);
      expect(notify.error).not.toHaveBeenCalled();
      expect(component.editandoGrupo()).toBe(grupoA);
      expect(component.saving()).toBe(false);
    });

    it('enfoca el primer control inválido del host', () => {
      host.innerHTML = '<input id="uno" class="ng-invalid">';

      component.actualizarGrupo();

      expect(document.activeElement).toBe(host.querySelector('#uno'));
    });

    it('mientras guarda no marca ni enfoca nada', () => {
      host.innerHTML = '<input id="uno" class="ng-invalid">';
      component.saving.set(true);

      component.actualizarGrupo();

      expect(grupos.actualizar).not.toHaveBeenCalled();
      expect(component.form.controls.nombre.touched).toBe(false);
      expect(document.activeElement).not.toBe(host.querySelector('#uno'));
    });

    it('sin un grupo en edición no hace nada', () => {
      component.editandoGrupo.set(null);
      host.innerHTML = '<input id="uno" class="ng-invalid">';

      component.actualizarGrupo();

      expect(grupos.actualizar).not.toHaveBeenCalled();
      expect(component.form.controls.nombre.touched).toBe(false);
      expect(document.activeElement).not.toBe(host.querySelector('#uno'));
    });
  });

  describe('con el formulario válido', () => {
    it('crear llama al servicio y no mueve el foco', () => {
      host.innerHTML = '<input id="uno" class="ng-invalid">';
      component.form.setValue({ nombre: 'Cohorte C', codigo: 'COH-C' });
      grupos.crear.mockReturnValue(of({ id: 3, nombre: 'Cohorte C', codigo: 'COH-C', totalEstudiantes: 0 }));

      component.crear();

      expect(grupos.crear).toHaveBeenCalledWith('Cohorte C', 'COH-C');
      expect(document.activeElement).not.toBe(host.querySelector('#uno'));
    });

    it('actualizar llama al servicio con los valores editados', () => {
      component.editarGrupo(grupoA);
      component.form.patchValue({ nombre: 'Cohorte A2' });
      grupos.actualizar.mockReturnValue(of({ ...grupoA, nombre: 'Cohorte A2' }));

      component.actualizarGrupo();

      expect(grupos.actualizar).toHaveBeenCalledWith(1, { nombre: 'Cohorte A2', codigo: 'COH-A' });
    });
  });

  describe('reinicio del formulario', () => {
    it('cancelar la edición vacía el formulario y lo deja sin campos tocados', () => {
      component.editarGrupo(grupoA);
      component.form.markAllAsTouched();

      component.cancelarEdicion();

      expect(component.editandoGrupo()).toBeNull();
      expect(component.form.getRawValue()).toEqual({ nombre: null, codigo: null });
      expect(component.form.touched).toBe(false);
    });

    it('crear con éxito vacía el formulario y lo deja sin campos tocados', () => {
      component.form.setValue({ nombre: 'Cohorte C', codigo: 'COH-C' });
      component.form.markAllAsTouched();
      grupos.crear.mockReturnValue(of({ id: 3, nombre: 'Cohorte C', codigo: 'COH-C', totalEstudiantes: 0 }));

      component.crear();

      expect(component.form.getRawValue()).toEqual({ nombre: null, codigo: null });
      expect(component.form.touched).toBe(false);
    });

    it('editar un grupo carga sus datos sin campos tocados', () => {
      component.crear();
      expect(component.form.touched).toBe(true);

      component.editarGrupo(grupoA);

      expect(component.form.getRawValue()).toEqual({ nombre: 'Cohorte A', codigo: 'COH-A' });
      expect(component.form.touched).toBe(false);
      expect(component.editandoGrupo()).toBe(grupoA);
    });
  });
});
