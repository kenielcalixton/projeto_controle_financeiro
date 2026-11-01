// js/config/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDEWTa9C1qR37YxUioL6dXaJ7KlFPgvCbc",
    authDomain: "meu-painel-financeiro-ap-7bd64.firebaseapp.com",
    databaseURL: "https://meu-painel-financeiro-ap-7bd64-default-rtdb.firebaseio.com",
    projectId: "meu-painel-financeiro-ap-7bd64",
    storageBucket: "meu-painel-financeiro-ap-7bd64.firebasestorage.app",
    messagingSenderId: "557887881327",
    appId: "1:557887881327:web:afb7aaaec979cf1ef44d9a"
};

// Inicializa o app e exporta as conexões para o resto do projeto
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);