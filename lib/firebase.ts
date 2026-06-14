import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
    apiKey: "AIzaSyB9o2Lsv_JOeKvPC8r6sE7pAPfIVsY2LLI",
    authDomain: "league-world-cup.firebaseapp.com",
    databaseURL: "https://league-world-cup-default-rtdb.firebaseio.com",
    projectId: "league-world-cup",
    storageBucket: "league-world-cup.firebasestorage.app",
    messagingSenderId: "600734867441",
    appId: "1:600734867441:web:60b7d14493f0c934f86e50"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getDatabase(app);