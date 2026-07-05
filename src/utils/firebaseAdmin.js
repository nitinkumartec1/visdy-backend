import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

/* -------------------------------------------------------
   Firebase Admin SDK Initialization
   Used to verify Firebase ID tokens sent from the frontend.
   Credentials are loaded from environment variables.
------------------------------------------------------- */

const firebaseApp = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // The private key comes as a single-line string with literal \n characters
    // in the env var. We need to convert them back to actual newlines.
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});

export const firebaseAuth = getAuth(firebaseApp);

