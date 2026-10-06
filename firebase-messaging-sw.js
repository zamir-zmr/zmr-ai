importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA0rirztMO13FyXcKYz1aEB1ERYH-HQUbA",
  authDomain: "sweethouse-e3e49.firebaseapp.com",
  projectId: "sweethouse-e3e49",
  messagingSenderId: "579322038108",
  appId: "1:579322038108:web:166b7fdb103080f56d6399"
});

firebase.messaging(); // notification payload background me browser khud dikha deta hai

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return clients.openWindow("/");
  }));
});
