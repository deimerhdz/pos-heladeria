// Spec 077 (research.md §5): envuelve el Service Worker que genera
// @angular/service-worker para agregarle un listener 'push' propio, con
// deduplicación por foco. Se registra ESTE archivo (no `ngsw-worker.js`
// directamente) como el Service Worker de la app — `importScripts` delega en
// `ngsw-worker.js` todo el cacheo/actualización de Angular sin tocarlo.
importScripts('./ngsw-worker.js');

// El backend (app/core/notifications/channels/browser_push.py) manda un
// payload propio, SIN la clave `notification` que `ngsw-worker.js` usaría
// para mostrar el aviso por su cuenta (handlePush) — así el auto-show de
// Angular nunca dispara y la decisión de mostrarlo queda solo en este
// listener, que sí puede comprobar el foco de las pestañas.
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Alguna pestaña de la app está enfocada: ya vio el aviso
        // visual+sonoro en vivo (NotificationCenterService) — mostrar
        // también el push del sistema sería un aviso duplicado.
        const enfocada = clients.some((c) => c.focused);
        if (enfocada) return undefined;

        return self.registration.showNotification('Skeilo POS', {
          body: payload.summary || 'Tienes una notificación nueva',
          tag: payload.notification_id,
          data: payload,
        });
      }),
  );
});
