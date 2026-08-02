import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";

dotenv.config();

// ESM compatibility for __dirname
let _dirname = "";
try {
  const __filename = fileURLToPath(import.meta.url);
  _dirname = path.dirname(__filename);
} catch (e) {
  _dirname = process.cwd();
}

// Initialize Firebase Admin
if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    console.log("Firebase Admin initialized successfully");
  } catch (error) {
    console.error("Error initializing Firebase Admin:", error);
  }
}

// Try to get database ID from config if not in env
let configDbId = "";
try {
  const configPath = path.join(_dirname, "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    configDbId = config.firestoreDatabaseId || "";
  }
} catch (err) {
  console.warn("Could not read firebase-applet-config.json for databaseId", err);
}

const getDb = () => {
  const dbId = process.env.FIRESTORE_DATABASE_ID || configDbId;
  return dbId ? getFirestore(dbId) : getFirestore();
};

// Initialize Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Centralized Walk Status Update and Notification
  app.post("/api/update-walk-status", async (req, res) => {
    const { walkId, status, walkerId, walkerName, cost, duration, reportData, petNames } = req.body;

    console.log(`[API] Solicitud de actualización de paseo: walkId=${walkId}, status=${status}, walkerId=${walkerId}`);

    if (!walkId || !status) {
      return res.status(400).json({ error: "El ID del paseo y el estado son obligatorios" });
    }

    if (!admin.apps.length) {
      console.error("[API] Firebase Admin no inicializado");
      return res.status(503).json({ error: "Servicio de Firebase no disponible" });
    }

    try {
      const db = getDb();
      const walkRef = db.collection("walks").doc(walkId);
      const walkDoc = await walkRef.get();

      if (!walkDoc.exists) {
        console.error(`[API] Paseo no encontrado: ${walkId}`);
        return res.status(404).json({ error: "Paseo no encontrado" });
      }

      const walkData = walkDoc.data();
      const currentStatus = walkData?.status;
      const ownerId = walkData?.ownerId;
      const targetWalkerId = walkerId || walkData?.walkerId;

      // Security Check: If a walker is trying to claim a walk (move to pending_owner)
      if (status === 'pending_owner') {
        if (currentStatus !== 'requested') {
          if (walkData?.walkerId === walkerId) {
            console.log(`[API] Paseador ${walkerId} re-aceptando paseo ${walkId} que ya está en ${currentStatus}`);
            return res.json({ success: true, message: "Ya habías solicitado este paseo." });
          }
          console.warn(`[API] Conflicto: Paseador ${walkerId} intentó aceptar paseo ${walkId} pero el estado es ${currentStatus}`);
          return res.status(409).json({ error: "Este paseo ya ha sido tomado o no está disponible." });
        }
      }

      // Update Firestore
      const updateData: any = { status };
      if (walkerId) updateData.walkerId = walkerId;
      if (status === 'accepted') updateData.acceptedAt = new Date().toISOString();
      if (status === 'walker_arrived') updateData.walkerArrivedAt = new Date().toISOString();
      if (status === 'in_progress') {
        updateData.startTime = new Date().toISOString();
      }
      if (status === 'completed') {
        updateData.endTime = new Date().toISOString();
        if (cost !== undefined) updateData.cost = cost;
        if (duration !== undefined) updateData.duration = duration;
        
        if (reportData) {
          updateData.report = reportData;
          try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
            const prompt = `Con estos datos del paseo de ${petNames || 'la mascota'}, redacta un reporte amigable de 2 oraciones para el dueño:
Hizo sus necesidades: ${reportData.peed || reportData.pooped ? 'Sí' : 'No'}
Tomó agua: ${reportData.drankWater ? 'Sí' : 'No'}
Comportamiento: ${reportData.behavior}
Notas: ${reportData.notes || 'Ninguna'}`;
            
            const response = await ai.models.generateContent({
              model: "gemini-2.0-flash",
              contents: prompt,
            });
            updateData.report.aiSummary = response.text;
          } catch (aiErr) {
            console.error("Gemini AI Summary error:", aiErr);
          }
        }
      }

      try {
        await walkRef.update(updateData);
        console.log(`[API] Paseo ${walkId} actualizado a ${status}`);
      } catch (updateError: any) {
        console.error(`[API] Error actualizando Firestore para ${walkId}:`, updateError);
        return res.status(500).json({ 
          error: `Error de base de datos: ${updateError.message}`, 
          details: updateError.message,
          code: updateError.code
        });
      }

      // Robust Helper to send push
      const sendPushNotification = async (userId: string, title: string, body: string, type: string) => {
        try {
          if (!userId) return;
          const db = getDb();
          const userDoc = await db.collection("users").doc(userId).get();
          const userData = userDoc.data();
          const fcmToken = userData?.fcmToken;
          
          // Also save in-app notification
          await db.collection("notifications").add({
            userId,
            title,
            body,
            type,
            walkId,
            createdAt: new Date().toISOString(),
            read: false
          });

          if (fcmToken) {
            const brandedTitle = "Jaguata 🐾";
            const brandedBody = type === 'new_message' ? `Mensaje: ${body}` : `${title}: ${body}`;

            const message: admin.messaging.Message = {
              token: fcmToken,
              notification: { 
                title: brandedTitle, 
                body: brandedBody 
              },
              data: { 
                type, 
                walkId: walkId || "",
                title: brandedTitle,
                body: brandedBody,
                click_action: "open_walk"
              },
              android: {
                priority: "high",
                ttl: 3600 * 1000, // 1 hour
                notification: {
                  channelId: "walk_requests_channel",
                  icon: "https://cdn-icons-png.flaticon.com/512/1077/1077114.png",
                  color: "#f97316",
                  clickAction: "open_walk",
                  sticky: false,
                  visibility: "public",
                  priority: "max",
                  defaultSound: true,
                  defaultVibrateTimings: true
                },
              },
              apns: {
                payload: {
                  aps: {
                    contentAvailable: true,
                    mutableContent: true,
                    badge: 1,
                    sound: "default",
                    category: "WALK_ALERT"
                  },
                },
              },
              webpush: {
                headers: {
                  Urgency: "high",
                  TTL: "86400"
                },
                notification: {
                  title: brandedTitle,
                  body: brandedBody,
                  icon: "https://cdn-icons-png.flaticon.com/512/1077/1077114.png",
                  badge: "https://cdn-icons-png.flaticon.com/512/1077/1077114.png",
                  tag: "jaguata-notification",
                  renotify: true,
                  requireInteraction: true,
                  vibrate: [500, 110, 500, 110, 500],
                  silent: false,
                  timestamp: Date.now(),
                  actions: [
                    {
                      action: "open",
                      title: "Ver Paseo",
                    },
                  ],
                },
                fcmOptions: {
                  link: walkId ? `/walk/${walkId}${type === 'new_message' ? '?chat=true' : ''}` : "/",
                }
              }
            };
            await admin.messaging().send(message);
            console.log(`Push notification sent successfully to ${userId}`);
          }
        } catch (err) {
          console.error(`Error enviando notificación a ${userId}:`, err);
        }
      };

      // Notification Logic based on status
      try {
        const ownerId = walkData?.ownerId;
        const targetWalkerId = walkerId || walkData?.walkerId;

        if (status === 'pending_owner') {
          const walkerRating = walkData?.walkerRating ? ` (${walkData.walkerRating}★)` : "";
          sendPushNotification(ownerId, "Paseador Interesado", `👋 ${walkerName || "Un paseador"}${walkerRating} quiere realizar el paseo.`, 'walker_request');
        } else if (status === 'accepted') {
          sendPushNotification(targetWalkerId, "Solicitud Aceptada", `✨ El dueño ha confirmado tu servicio. ¡Ya puedes ir por la mascota!`, 'walk_accepted');
        } else if (status === 'walker_arrived') {
          sendPushNotification(ownerId, "Paseador llegó", `📍 ${walkerName || "El paseador"} está en tu puerta.`, 'walker_arrived');
        } else if (status === 'in_progress') {
          const agreedCost = cost !== undefined ? new Intl.NumberFormat('es-PY', { 
            style: 'currency', 
            currency: 'PYG',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
          }).format(cost) : "";
          
          sendPushNotification(ownerId, "Paseo en marcha", `🏃‍♂️ El paseo ha comenzado. Costo pactado: ${agreedCost}`, 'walk_started');
          if (targetWalkerId) {
            sendPushNotification(targetWalkerId, "Paseo iniciado", `🚀 Paseo en curso. Ganancia fija: ${agreedCost}`, 'walk_started');
          }
        } else if (status === 'completed') {
          const agreedCost = cost !== undefined ? new Intl.NumberFormat('es-PY', { 
            style: 'currency', 
            currency: 'PYG',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
          }).format(cost) : "";
          
          const summary = `Servicio de ${walkData?.durationOption || duration || 0} min completado • ${agreedCost}`;
          
          sendPushNotification(ownerId, "Paseo Finalizado", `✨ Tu mascota ya está de vuelta. ${summary}`, 'walk_completed');
          if (targetWalkerId) {
            sendPushNotification(targetWalkerId, "Paseo Completado", `💰 Has ganado ${agreedCost} por el paseo.`, 'walk_completed');
          }
        }
      } catch (notifyError) {
        console.error("Error en lógica de notificaciones (no crítico):", notifyError);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error en update-walk-status:", error);
      res.status(500).json({ error: "No se pudo actualizar el paseo", details: error.message });
    }
  });

  // FCM Notification route
  app.post("/api/send-notification", async (req, res) => {
    const { token, title, body, data } = req.body;

    if (!token || !title || !body) {
      return res.status(400).json({ error: "Missing required fields: token, title, body" });
    }

    if (!admin.apps.length) {
      return res.status(503).json({ error: "Firebase Admin not initialized" });
    }

    try {
      // Branding: Use "Jaguata" as title for the push, put original context in body if it's a message
      const brandedTitle = "Jaguata 🐾";
      const brandedBody = data?.type === 'new_message' ? `Mensaje: ${body}` : `${title}: ${body}`;

      const message: admin.messaging.Message = {
        token,
        notification: {
          title: brandedTitle,
          body: brandedBody,
        },
        data: {
          ...(data || {}),
          title: brandedTitle,
          body: brandedBody,
          click_action: "open_detail"
        },
        android: {
          priority: "high",
          notification: {
            channelId: "walk_requests_channel",
            clickAction: "open_detail",
            icon: "https://cdn-icons-png.flaticon.com/512/1077/1077114.png",
            color: "#f97316",
            priority: "max",
            defaultSound: true,
            defaultVibrateTimings: true,
            visibility: "public"
          },
        },
        apns: {
          payload: {
            aps: {
              contentAvailable: true,
              mutableContent: true,
              badge: 1,
              sound: "default",
            },
          },
        },
        webpush: {
          headers: {
            Urgency: "high",
            TTL: "86400"
          },
          notification: {
            title: brandedTitle,
            body: brandedBody,
            icon: "https://cdn-icons-png.flaticon.com/512/1077/1077114.png",
            badge: "https://cdn-icons-png.flaticon.com/512/1077/1077114.png",
            tag: "jaguata-notification",
            renotify: true,
            requireInteraction: true,
            vibrate: [500, 110, 500, 110, 500],
            silent: false,
            timestamp: Date.now(),
            actions: [
              {
                action: "open",
                title: "Ver Detalle",
              },
            ],
          },
          fcmOptions: {
            link: data?.walkId ? `/walk/${data.walkId}${data.type === 'new_message' ? '?chat=true' : ''}` : "/",
          },
        },
      };

      const response = await admin.messaging().send(message);

      console.log("Mensaje enviado con éxito:", response);
      res.json({ success: true, messageId: response });
    } catch (error) {
      console.error("Error enviando mensaje:", error);
      res.status(500).json({ error: "No se pudo enviar la notificación" });
    }
  });

  // Admin Suspend User
  app.post("/api/admin/suspend-user", async (req, res) => {
    const { uid, reason, durationDays, unsuspend } = req.body;
    if (!uid) return res.status(400).json({ error: "Falta UID del usuario" });

    if (!admin.apps.length) {
      return res.status(503).json({ error: "Firebase Admin no inicializado" });
    }

    try {
      const db = getDb();
      const userRef = db.collection("users").doc(uid);
      
      if (unsuspend) {
        await userRef.update({
          isSuspended: false,
          suspensionReason: admin.firestore.FieldValue.delete(),
          suspendedUntil: admin.firestore.FieldValue.delete()
        });
        await admin.auth().updateUser(uid, { disabled: false });
        
        // Update specialized collections
        await db.collection("walkers").doc(uid).update({ 
          isSuspended: false,
          suspensionReason: admin.firestore.FieldValue.delete(),
          suspendedUntil: admin.firestore.FieldValue.delete()
        }).catch(() => {});
        await db.collection("owners").doc(uid).update({ 
          isSuspended: false,
          suspensionReason: admin.firestore.FieldValue.delete(),
          suspendedUntil: admin.firestore.FieldValue.delete()
        }).catch(() => {});
        
        return res.json({ success: true, message: "Usuario habilitado" });
      }

      const suspendedUntil = durationDays === 9999 
        ? null 
        : new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

      await userRef.update({
        isSuspended: true,
        suspensionReason: reason,
        suspendedUntil: suspendedUntil || "Indefinida"
      });

      // Disable in Firebase Auth
      await admin.auth().updateUser(uid, { disabled: true });
      
      // Update specialized collections
      const specializedUpdate = { 
        isSuspended: true,
        suspensionReason: reason,
        suspendedUntil: suspendedUntil || "Indefinida"
      };
      await db.collection("walkers").doc(uid).update(specializedUpdate).catch(() => {});
      await db.collection("owners").doc(uid).update(specializedUpdate).catch(() => {});

      res.json({ success: true, message: "Usuario suspendido" });
    } catch (error: any) {
      console.error("Error de Suspensión:", error);
      res.status(500).json({ error: "No se pudo procesar la suspensión", details: error.message });
    }
  });

  // Admin/User Delete User
  app.post(["/api/admin/delete-user", "/api/user/delete-account"], async (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: "Falta UID" });

    if (!admin.apps.length) {
      return res.status(503).json({ error: "Firebase Admin no inicializado" });
    }

    try {
      // Delete from Auth
      await admin.auth().deleteUser(uid);
      console.log(`[API] Usuario ${uid} eliminado de Firebase Auth`);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error de Eliminación:", error);
      res.status(500).json({ error: "No se pudo eliminar el usuario", details: error.message });
    }
  });

  // CRON Job for Scheduled Walks
  if (admin.apps.length > 0) {
    setInterval(async () => {
      try {
        const db = getDb();
        const now = new Date().toISOString();
        
        const scheduledSnapshot = await db.collection("scheduled_walks")
          .where("scheduledFor", "<=", now)
          .where("status", "==", "requested")
          .get();

        for (const doc of scheduledSnapshot.docs) {
          const walkData = doc.data();
          
          // Move to active walks
          await db.collection("walks").doc(doc.id).set({
            ...walkData,
            status: "requested",
            createdAt: now, // reset creation time to now for active requests
          });
          
          // Update status in scheduled_walks to prevent processing again
          await doc.ref.update({ status: "processed" });

          // Send push notifications to all active walkers
          const walkersSnap = await db.collection("users")
            .where("role", "==", "walker")
            .where("isAvailable", "==", true)
            .where("isApproved", "==", true)
            .get();

          for (const walker of walkersSnap.docs) {
            const fcmToken = walker.data().fcmToken;
            if (fcmToken) {
              const message: admin.messaging.Message = {
                token: fcmToken,
                notification: {
                  title: "¡Paseo Programado Ahora!",
                  body: "Un paseo que fue programado acaba de activarse en tu zona."
                },
                data: {
                  walkId: doc.id,
                  type: "NEW_WALK_REQUEST",
                  click_action: "open_walk"
                },
                android: {
                  priority: "high",
                  notification: {
                    channelId: "walk_requests_channel", // Updated channel ID from prompt
                    priority: "max",
                    defaultSound: true,
                    defaultVibrateTimings: true,
                    visibility: "public"
                  }
                }
              };
              await admin.messaging().send(message).catch(e => console.error(e));
            }
          }
        }
      } catch (error) {
        console.error("Error processing scheduled walks:", error);
      }
    }, 60000); // Check every minute
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve from dist
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
