import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig)
  .then(() => {
    // axe-core: auditoría de accesibilidad solo en desarrollo (resultado en la consola). La condición
    // envuelve el import() para que el build de producción la pliegue y no emita el chunk de axe (F0-4).
    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      import('axe-core').then(({ default: axe }) => {
        axe.configure({ reporter: 'v2' });
        axe.run(document, (err, results) => {
          if (err) return;
          const violations = results.violations;
          if (violations.length) {
            console.group('%c[axe-core] Accessibility violations', 'color:#E25A4F;font-weight:bold');
            violations.forEach(v => {
              console.warn(`[${v.impact?.toUpperCase()}] ${v.id}: ${v.description}`, v.nodes);
            });
            console.groupEnd();
          } else {
            console.info('%c[axe-core] No accessibility violations found.', 'color:#6EC67A;font-weight:bold');
          }
        });
      });
    }
  })
  .catch(err => console.error(err));
