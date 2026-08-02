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
    // Let's create a doc
    await db.collection("test").doc("abc").set({ hello: "world" });
    console.log("Set ok");
    await db.collection("test").doc("abc").update({ hello: "world2" });
    console.log("Update ok");
  } catch(e) {
    console.error("Error:", e);
  }
}
run();
