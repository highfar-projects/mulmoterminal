// Web config for the shared `mulmoserver` Firebase project, used by the remote-host
// command channel from BOTH sides: the server's session controller seeds its app with
// it, and the browser's does the same.
//
// The values are NOT secrets — they identify the project to the client SDK, and access
// is gated by Firestore security rules. Safe to commit. Firestore must be in Native mode.
export const firebaseConfig = {
  apiKey: "AIzaSyC5IrhcCtfVQ4nZeI89Owa7da_D-It0b9s",
  authDomain: "mulmoserver.firebaseapp.com",
  projectId: "mulmoserver",
  storageBucket: "mulmoserver.firebasestorage.app",
  messagingSenderId: "830257137330",
  appId: "1:830257137330:web:5cb8db01ae61b5d161abab",
  measurementId: "G-Y75JGK1G4T",
} as const;

// Where that project is SERVED — the origin of every address this app hands a person: a shared
// app's public page, its staff and participant pages, the mobile companion. It lives beside the
// config because it is the same deployment's identity, and in `common/` because both sides print
// it: the UI shows it as a QR code, and `manageSharedApp` writes it into the sentence an author
// copies into an invitation. A URL missing its origin is one an author cannot paste anywhere.
export const MULMOSERVER_ORIGIN = "https://mulmoserver.web.app";
