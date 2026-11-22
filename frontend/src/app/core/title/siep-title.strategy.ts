import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const SIEP_DEFAULT_TITLE = 'SIEP | Sistema de Entrenamiento Psicosocial';

/** Título de pestaña por página: «<Página> · SIEP». Lo anuncian los lectores de pantalla. */
@Injectable({ providedIn: 'root' })
export class SiepTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const pageTitle = this.buildTitle(snapshot);
    this.title.setTitle(pageTitle ? `${pageTitle} · SIEP` : SIEP_DEFAULT_TITLE);
  }
}
