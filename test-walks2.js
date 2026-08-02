import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));
const dbId = config.firestoreDatabaseId;

const db = getFirestore(dbId);

async function run() {
  try {
    const walks = await db.collection("walks").get();
    let badCount = 0;
    walks.forEach(doc => {
      const data = doc.data();
      if (!data.pickupLocation || !data.pickupLocation.address) {
        console.log("Bad walk:", doc.id, data.pickupLocation);
        badCount++;
      }
    });
    console.log("Total bad walks:", badCount);
  } catch(e) {
    console.error("Error:", e);
  }
}
run();
