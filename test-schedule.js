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
    const now = new Date().toISOString();
    await db.collection("scheduled_walks").add({
      scheduledFor: now,
      status: "requested",
      test: true
    });
    console.log("Added scheduled walk.");
  } catch(e) {
    console.error("Error:", e);
  }
}
run();
