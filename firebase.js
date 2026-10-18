// TradeLab Firebase configuration

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  RecaptchaVerifier,
  linkWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


const firebaseConfig = {
  apiKey: "AIzaSyCKwZtQyLBysU6_mVemIuSGbLWnNpUFjIU",
  authDomain: "tradelab-1a595.firebaseapp.com",
  projectId: "tradelab-1a595",
  storageBucket: "tradelab-1a595.firebasestorage.app",
  messagingSenderId: "713059686796",
  appId: "1:713059686796:web:5ee413228ecc8b93f01ea9"
};


const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);


export {
  auth,
  db,

  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,

  RecaptchaVerifier,
  linkWithPhoneNumber,

  doc,
  setDoc,
  getDoc,
  serverTimestamp
};