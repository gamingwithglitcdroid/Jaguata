import { collection, addDoc, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Notification, UserProfile } from "../types";

export const sendNotification = async (notification: Omit<Notification, 'id' | 'read' | 'createdAt'>) => {
  try {
    // 1. Save to Firestore for in-app notifications
    const brandedTitle = "Jaguata 🐾";
    const brandedBody = (notification as any).type === 'new_message' ? `¡Mensaje nuevo! ${notification.body}` : `${notification.title}: ${notification.body}`;

    await addDoc(collection(db, "notifications"), {
      ...notification,
      title: brandedTitle,
      body: brandedBody,
      read: false,
      createdAt: new Date().toISOString()
    });

    // 2. Attempt to send Push Notification if token exists
    const userRef = doc(db, "users", notification.userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data() as UserProfile;
      
      // Send FCM Push Notification
      if (userData.fcmToken) {
        try {
          await fetch("/api/send-notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: userData.fcmToken,
              title: notification.title,
              body: notification.body,
              data: {
                walkId: notification.walkId || "",
                type: notification.type
              }
            })
          });
        } catch (pushErr) {
          console.error("Error calling push notification API:", pushErr);
        }
      }
    }

    console.log("Notification sent to Firestore:", notification.title);
  } catch (err) {
    console.error("Error sending notification:", err);
  }
};
