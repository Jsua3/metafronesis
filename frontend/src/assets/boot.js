/*
 * Comportamiento de la pantalla de arranque de Metafrónesis (plan 03, S2-4: archivo externo para que la CSP no necesite
 * 'unsafe-inline'). Se carga SIN defer justo después de <app-root>: así el tema guardado se aplica antes del primer
 * cuadro y no hay parpadeo de claro a oscuro.
 */
(function () {
  'use strict';

  var reloj = typeof performance !== 'undefined' ? performance : Date;
  var inicio = reloj.now();

  // Tema: el que la persona eligió (la misma clave que TemaService). Va en el div de arranque, no en html ni en body
  // (REGLA-010). Con «Automático» (o sin valor) manda prefers-color-scheme en boot.css. Dentro de try/catch: el
  // almacenamiento puede estar bloqueado (ventana privada, cookies cerradas).
  var arranque = document.querySelector('.siep-boot');
  if (arranque) {
    try {
      var tema = localStorage.getItem('metafronesis.tema');
      if (tema === 'oscuro' || tema === 'claro') arranque.classList.add('siep-boot--' + tema);
    } catch (e) {
      /* sin almacenamiento: queda la preferencia del sistema */
    }
  }

  // «Recargar»: reintenta el arranque (antes onclick="location.reload()").
  var reload = document.querySelector('.siep-boot .siep-boot__reload');
  if (reload) {
    reload.addEventListener('click', function () {
      location.reload();
    });
  }

  // Si a los 12 s Angular todavía no reemplazó la pantalla de arranque, ofrecer recargar.
  var lento = setTimeout(function () {
    var slow = document.querySelector('.siep-boot .siep-boot__slow');
    if (slow) slow.hidden = false;
  }, 12000);

  // Salida suave: Angular borra el contenido de <app-root> de golpe al arrancar. Cuando eso pasa, una copia decorativa
  // (sin role ni foco) se pone encima un instante, completa la barra y se funde sobre la app. Si la carga fue tan
  // rápida que el contenido aún no se veía (aparece a los 200 ms), solo se funde el fondo. La copia se borra al
  // terminar su animación, con un tope por si la animación no corre (movimiento reducido, pestaña en segundo plano).
  var raiz = document.querySelector('app-root');
  if (!arranque || !raiz || typeof MutationObserver !== 'function') return;
  var vigia = new MutationObserver(function () {
    if (raiz.contains(arranque)) return;
    vigia.disconnect();
    clearTimeout(lento);
    var velo = arranque.cloneNode(true);
    velo.removeAttribute('role');
    velo.setAttribute('aria-hidden', 'true');
    var slowCopia = velo.querySelector('.siep-boot__slow');
    if (slowCopia) slowCopia.parentNode.removeChild(slowCopia);
    velo.classList.add('siep-boot--saliendo');
    if (reloj.now() - inicio < 260) velo.classList.add('siep-boot--rapido');
    var quitar = function () {
      if (velo.parentNode) velo.parentNode.removeChild(velo);
    };
    velo.addEventListener('animationend', function (ev) {
      if (ev.target === velo) quitar();
    });
    setTimeout(quitar, 700);
    raiz.parentNode.insertBefore(velo, raiz.nextSibling);
  });
  vigia.observe(raiz, { childList: true });
})();
