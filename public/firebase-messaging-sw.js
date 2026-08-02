importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyASAi19xrjwuQ_vnmSOu19VJSMMctIf7gc",
  authDomain: "gen-lang-client-0328450012.firebaseapp.com",
  projectId: "gen-lang-client-0328450012",
  storageBucket: "gen-lang-client-0328450012.firebasestorage.app",
  messagingSenderId: "123906937185",
  appId: "1:123906937185:web:e6256ad5bab842f3aab520"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // Extract data from notification OR data payload
  const title = payload.notification?.title || payload.data?.title || "Jaguata 🐾";
  const body = payload.notification?.body || payload.data?.body || "Tienes una nueva actualización en tu paseo.";
  const icon = payload.notification?.icon || payload.data?.icon || 'https://cdn-icons-png.flaticon.com/512/1077/1077114.png';
  
  const notificationOptions = {
    body: body,
    icon: icon,
    badge: 'https://cdn-icons-png.flaticon.com/512/1077/1077114.png',
    data: payload.data,
    tag: payload.notification?.tag || payload.data?.tag || 'jaguata-notification',
    renotify: true,
    requireInteraction: true, // Keep notification until user interacts
    vibrate: [500, 110, 500, 110, 500],
    actions: [
      { action: 'open', title: 'Ver Detalles' }
    ],
    timestamp: Date.now()
  };

  return self.registration.showNotification(title, notificationOptions);
});

// Fallback direct push listener
self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      console.log('[firebase-messaging-sw.js] Push event data:', data);
      // If the message is already handled by onBackgroundMessage, this might be redundant but safe
    } catch (e) {
      console.warn('[firebase-messaging-sw.js] Push event received but data is not JSON');
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const walkId = event.notification.data?.walkId;
  const urlToOpen = walkId ? `/walk/${walkId}` : '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there is already a window open with this app
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          // If we found a window, focus it and navigate
          if ('focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // If no window is open, open a new one
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});
