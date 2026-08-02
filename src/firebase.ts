import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getStorage } from "firebase/storage";
import { toast } from "sonner";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

// Initialize Storage safely
let storageInstance: any = null;
try {
  storageInstance = getStorage(app, firebaseConfig.storageBucket);
} catch (error) {
  console.error("Firebase Storage could not be initialized. Make sure it is enabled in your Firebase Console.", error);
}
export const storage = storageInstance;

export const messaging = typeof window !== "undefined" ? getMessaging(app) : null;

export const requestForToken = async (force: boolean = false) => {
  if (!messaging) {
    console.error("Messaging is not supported in this environment (likely not HTTPS or service workers not supported).");
    return null;
  }
  
  try {
    if (typeof window !== "undefined" && "Notification" in window) {
      const currentPermission = Notification.permission;
      console.log("Current Notification Permission:", currentPermission);

      if (currentPermission === "denied") {
        toast.error("Permiso de notificaciones bloqueado. Por favor, haz clic en el candado 🔒 junto a la URL y selecciona 'Permitir'.");
        return null;
      }
      
      if (force && currentPermission !== "granted") {
        console.log("Requesting notification permission...");
        const permission = await Notification.requestPermission();
        console.log("Permission result:", permission);
        if (permission !== "granted") {
          toast.error("No se otorgaron permisos para notificaciones.");
          return null;
        }
      } else if (currentPermission !== "granted") {
        console.log("Notification permission not granted. Use force=true to ask.");
        return null; 
      }
    } else {
      toast.error("Este navegador no soporta notificaciones push.");
      return null;
    }

    const vapidKey = import.meta.env.VITE_VAPID_KEY;
    if (!vapidKey) {
      console.error("VITE_VAPID_KEY is missing from environment variables.");
      toast.error("Falta la VAPID Key. Configúrala en Settings -> Secrets como GOOGLE_MAPS_PLATFORM_KEY (espera, no, VITE_VAPID_KEY).");
      return null;
    }

    console.log("Starting service worker registration check...");
    let registration;
    if ('serviceWorker' in navigator) {
      try {
        registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/'
        });
        console.log('Service Worker registered successfully:', registration.scope);
      } catch (swError) {
        console.error("Service Worker registration failed:", swError);
        toast.error("Error al registrar el Service Worker de notificaciones.");
        return null;
      }
    } else {
      console.error("Service Workers not supported in this browser.");
      return null;
    }

    console.log("Getting FCM token with VAPID key...");
    const currentToken = await getToken(messaging, {
      vapidKey: vapidKey,
      serviceWorkerRegistration: registration
    });

    if (currentToken) {
      console.log("FCM Token obtained successfully:", currentToken);
      return currentToken;
    } else {
      console.log("No registration token available. Check your Firebase console settings.");
      toast.error("No se pudo obtener el token de registro. Revisa la consola.");
      return null;
    }
  } catch (err: any) {
    console.error("An error occurred while retrieving token:", err);
    if (err?.message?.includes('vapidKey')) {
      toast.error("Error con la VAPID Key. Asegúrate de que sea la correcta.");
    } else {
      toast.error("Error al activar notificaciones: " + (err?.message || "Desconocido"));
    }
    return null;
  }
};

// Play notification sound
export const playNotificationSound = () => {
  // Use a slightly more "loud" ping
  const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3");
  audio.volume = 1.0;
  audio.play().catch(err => console.error("Could not play notification sound:", err));
  
  // Play again after 400ms for more presence
  setTimeout(() => {
    const audio2 = new Audio("https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3");
    audio2.volume = 1.0;
    audio2.play().catch(err => {});
  }, 400);

  // Aggressive vibration for mobile devices
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate([500, 110, 500, 110, 500]);
  }
};

export const onMessageListener = (callback: (payload: any) => void) => {
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    console.log("Message received. ", payload);
    playNotificationSound();
    callback(payload);
  });
};

// Validate Connection to Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
    // Skip logging for other errors, as this is simply a connection test.
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
