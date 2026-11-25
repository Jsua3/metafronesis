import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

import { APP_BRAND } from '../config/brand.config';

export const SIEP_DEFAULT_TITLE = `${APP_BRAND.shortName} | ${APP_BRAND.fullName}`;

/** Título de pestaña por página: «<Página> · SIEP». Lo anuncian los lectores de pantalla. */
@Injectable({ providedIn: 'root' })
export class SiepTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const pageTitle = this.buildTitle(snapshot);
    this.title.setTitle(pageTitle ? `${pageTitle} · ${APP_BRAND.shortName}` : SIEP_DEFAULT_TITLE);
  }
}
