// js/main.js
import { auth } from './config/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { renderizarLogin } from './auth/login.js';
import { renderizarLayout } from './layout/appShell.js';

// Função temporária de loading
function renderLoading() {
    const root = document.getElementById('app-root');
    root.innerHTML = `
        <div class="h-screen bg-slate-900 flex items-center justify-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
        </div>
    `;
}

// Observador global de Autenticação
renderLoading();

onAuthStateChanged(auth, (user) => {
    if (user) {
        // O utilizador está logado! Injeta a nova Shell da Aplicação
        renderizarLayout(user);
    } else {
        // O utilizador não está logado! Mostra a tela de Login
        renderizarLogin();
    }
});