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
    const walkersSnap = await db.collection("users")
      .where("role", "==", "walker")
      .where("isAvailable", "==", true)
      .where("isApproved", "==", true)
      .get();
    console.log("Walkers snap size:", walkersSnap.size);
  } catch(e) {
    console.error("Error:", e);
  }
}
run();
