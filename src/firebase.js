// Import Firebase functions
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";


// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyA7xZPSj5-y07zjLyq8uQtBKIjmwNlS8ao",
  authDomain: "pms-ferry.firebaseapp.com",
  projectId: "pms-ferry",
  storageBucket: "pms-ferry.appspot.com", // <-- ayusin ito, dapat .appspot.com
  messagingSenderId: "555369524834",
  appId: "1:555369524834:web:2328b40a9691aea8a6eb3b",
  measurementId: "G-V31WMQF5P3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const accountCreationApp = initializeApp(firebaseConfig, "accountCreation");
    
// Export Auth instance
export const auth = getAuth(app);
export const accountCreationAuth = getAuth(accountCreationApp);
export const db = getFirestore(app);
export const storage = getStorage(app);
