// js/main.js
import { auth } from './config/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { renderizarLogin } from './auth/login.js';

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
        // O utilizador está logado!
        // Em breve, chamaremos aqui o renderizarDashboard()
        const root = document.getElementById('app-root');
        root.innerHTML = `
            <div class="h-screen bg-slate-900 flex flex-col items-center justify-center text-white animate-fade-in">
                <i class="ph-fill ph-check-circle text-6xl text-emerald-500 mb-4"></i>
                <h1 class="text-2xl font-bold">Bem-vindo, ${user.email}!</h1>
                <p class="text-slate-400 mt-2">Módulo de Dashboard será construído no próximo passo.</p>
                <button id="btn-logout" class="mt-6 px-6 py-2 bg-rose-600 rounded-xl font-bold hover:bg-rose-500 transition-colors">Sair</button>
            </div>
        `;
        
        document.getElementById('btn-logout').addEventListener('click', () => {
            auth.signOut();
        });
        
    } else {
        // O utilizador não está logado, mostrar a tela de login
        renderizarLogin();
    }
});