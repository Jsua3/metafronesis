import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { InvitationsApi } from './invitations.api';

/**
 * Cliente de C5 (E2-10): `GET /api/me/invitations` y `POST /api/me/invitations/{groupId}/accept|decline|leave`. El
 * servidor solo acepta cuerpos JSON que sean un OBJETO (`[]`, `"x"` o vacío → 400): las órdenes mandan `{}`.
 */
// req: SIEP-RF-04, D-14
describe('InvitationsApi', () => {
  let api: InvitationsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(InvitationsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista las invitaciones propias', async () => {
    const list = firstValueFrom(api.list());
    const request = http.expectOne('/api/me/invitations');
    expect(request.request.method).toBe('GET');
    request.flush({ success: true, message: null, data: [{ id: 4, groupId: 4, groupName: 'G', teacherName: 'T', invitedAt: null, status: 'INVITED' }] });
    expect((await list)[0].groupId).toBe(4);
  });

  it.each([
    ['accept', (groupId: number) => api.accept(groupId)],
    ['decline', (groupId: number) => api.decline(groupId)],
    ['leave', (groupId: number) => api.leave(groupId)],
  ] as const)('%s responde por el grupo con POST y un cuerpo objeto', async (action, call) => {
    const done = firstValueFrom(call(4));
    const request = http.expectOne(`/api/me/invitations/4/${action}`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ success: true, message: 'ok', data: { id: 4, groupId: 4, groupName: 'G', teacherName: 'T', invitedAt: null, status: 'ACTIVE' } });
    expect((await done).status).toBe('ACTIVE');
  });

});
