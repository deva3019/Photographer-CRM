// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyBwJtWzFhuU2Omrcqomr9QmdPJ51n0qOjY",
  authDomain: "photography-studio-management.firebaseapp.com",
  projectId: "photography-studio-management",
  storageBucket: "photography-studio-management.firebasestorage.app",
  messagingSenderId: "846275108123",
  appId: "1:846275108123:web:f631e9e9e57dcfe49cc7be",
  measurementId: "G-CJ4523308Q"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Analytics can fail in some environments (e.g. blocked trackers) — guard it
isSupported().then((ok) => { if (ok) getAnalytics(app); });