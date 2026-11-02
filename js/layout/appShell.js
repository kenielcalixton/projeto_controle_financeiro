// js/layout/appShell.js
import { auth } from '../config/firebase.js';
import { renderizarDashboard } from '../components/dashboard.js';
import { renderizarLancamentos } from '../components/transactions.js';
import { renderizarEspacos, limparListenerEspacos } from '../components/spaces.js';
import { renderizarContas, limparListenerContas } from '../components/accounts.js';
import { renderizarInbox, limparListenerInbox } from '../components/inbox.js'; // NOVO IMPORT
import { abrirModalTransacao } from '../components/transactionModal.js';

export function renderizarLayout(user) {
    const root = document.getElementById('app-root');
    
    // Injeção do Esqueleto (Shell) da aplicação
    root.innerHTML = `
        <div class="flex h-screen bg-slate-900 text-slate-200 overflow-hidden w-full relative">
            
            <div id="mobile-backdrop" class="md:hidden fixed inset-0 bg-black/60 z-[90] hidden animate-fade-in"></div>

            <aside id="sidebar" class="fixed inset-y-0 left-0 z-[100] bg-slate-800 border-r border-slate-700 flex flex-col transition-all duration-300 transform -translate-x-full md:translate-x-0 w-64 md:w-20 overflow-hidden group">
                <div class="p-5 flex items-center border-b border-slate-700 h-20 shrink-0 relative">
                    <div class="w-10 h-10 min-w-[40px] rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-lg">
                        <i class="ph-fill ph-wallet"></i>
                    </div>
                    <span class="sidebar-text font-bold text-xl tracking-tight text-white ml-3 whitespace-nowrap transition-opacity duration-300 md:opacity-0">Finanças</span>
                    <button id="btn-pin" class="hidden md:block absolute right-4 top-7 text-slate-400 hover:text-white transition-all duration-300 opacity-0 pointer-events-none">
                        <i class="ph ph-push-pin text-lg"></i>
                    </button>
                </div>
                
                <nav class="flex-1 py-6 space-y-2 px-3 overflow-x-hidden">
                    <button id="btn-nav-dashboard" class="nav-btn w-full flex items-center p-3 rounded-xl transition-all font-bold text-sm bg-indigo-500/20 text-indigo-400 overflow-hidden">
                        <i class="ph ph-squares-four text-xl min-w-[24px]"></i>
                        <span class="sidebar-text ml-3 whitespace-nowrap transition-opacity duration-300 md:opacity-0">Resumo Geral</span>
                    </button>
                    <button id="btn-nav-accounts" class="nav-btn w-full flex items-center p-3 rounded-xl transition-all font-bold text-sm text-slate-400 hover:bg-slate-700 overflow-hidden">
                        <i class="ph ph-bank text-xl min-w-[24px]"></i>
                        <span class="sidebar-text ml-3 whitespace-nowrap transition-opacity duration-300 md:opacity-0">Contas & Cartões</span>
                    </button>
                    <button id="btn-nav-transactions" class="nav-btn w-full flex items-center p-3 rounded-xl transition-all font-bold text-sm text-slate-400 hover:bg-slate-700 overflow-hidden">
                        <i class="ph ph-list-dashes text-xl min-w-[24px]"></i>
                        <span class="sidebar-text ml-3 whitespace-nowrap transition-opacity duration-300 md:opacity-0">Lançamentos</span>
                    </button>
                    <!-- NOVO BOTÃO DA INBOX -->
                    <button id="btn-nav-inbox" class="nav-btn w-full flex items-center p-3 rounded-xl transition-all font-bold text-sm text-slate-400 hover:bg-slate-700 overflow-hidden">
                        <i class="ph ph-tray text-xl min-w-[24px]"></i>
                        <span class="sidebar-text ml-3 whitespace-nowrap transition-opacity duration-300 md:opacity-0">Pendências</span>
                    </button>
                    <button id="btn-nav-spaces" class="nav-btn w-full flex items-center p-3 rounded-xl transition-all font-bold text-sm text-slate-400 hover:bg-slate-700 overflow-hidden">
                        <i class="ph ph-users text-xl min-w-[24px]"></i>
                        <span class="sidebar-text ml-3 whitespace-nowrap transition-opacity duration-300 md:opacity-0">Espaços & Rateios</span>
                    </button>
                </nav>
                
                <div class="p-3 border-t border-slate-700 shrink-0">
                    <button id="btn-logout" class="w-full flex items-center p-3 rounded-xl text-slate-400 hover:bg-slate-700 hover:text-rose-400 font-bold text-sm transition-colors overflow-hidden">
                        <i class="ph ph-sign-out text-xl min-w-[24px]"></i>
                        <span class="sidebar-text ml-3 whitespace-nowrap transition-opacity duration-300 md:opacity-0">Sair</span>
                    </button>
                </div>
            </aside>

            <div id="main-wrapper" class="flex-1 flex flex-col h-screen overflow-hidden relative transition-all duration-300 ml-0 md:ml-20">
                <header class="h-20 flex-shrink-0 bg-slate-800 border-b border-slate-700 px-4 md:px-8 flex items-center justify-between z-10">
                    <h1 class="text-xl font-bold text-white flex items-center">
                        <button id="btn-mobile-menu" class="md:hidden mr-4 text-slate-400 hover:text-white">
                            <i class="ph ph-list text-2xl"></i>
                        </button>
                        Olá, ${user.email.split('@')[0]} 👋
                    </h1>
                    
                    <div class="flex items-center bg-slate-900 rounded-full p-1 border border-slate-700 shadow-inner">
                        <button class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"><i class="ph ph-caret-left"></i></button>
                        <span class="px-4 text-sm font-bold text-slate-200 min-w-[120px] text-center">HOJE</span>
                        <button class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"><i class="ph ph-caret-right"></i></button>
                    </div>
                </header>

                <main id="main-content" class="flex-1 overflow-y-auto p-4 md:p-8 relative pb-24">
                    <!-- O conteúdo das abas será injetado aqui -->
                </main>

                <button id="btn-add-tx" class="absolute bottom-8 right-8 w-16 h-16 bg-indigo-600 text-white rounded-2xl shadow-xl shadow-indigo-500/40 flex items-center justify-center hover:-translate-y-1 hover:bg-indigo-500 transition-all z-40">
                    <i class="ph ph-plus text-3xl"></i>
                </button>
            </div>
        </div>
    `;

    // --- Lógica de Estado do Layout ---
    let isPinned = false;
    let isHovered = false;
    let isMobileOpen = false;

    const sidebar = document.getElementById('sidebar');
    const mainWrapper = document.getElementById('main-wrapper');
    const backdrop = document.getElementById('mobile-backdrop');
    const texts = document.querySelectorAll('.sidebar-text');
    const btnPin = document.getElementById('btn-pin');
    const btnMobile = document.getElementById('btn-mobile-menu');

    function updateUI() {
        if (isMobileOpen) {
            sidebar.classList.remove('-translate-x-full');
            backdrop.classList.remove('hidden');
        } else {
            sidebar.classList.add('-translate-x-full');
            backdrop.classList.add('hidden');
        }

        if (isPinned || isHovered) {
            sidebar.classList.remove('md:w-20');
            sidebar.classList.add('md:w-64');
            texts.forEach(t => { t.classList.remove('md:opacity-0'); t.classList.add('md:opacity-100'); });
            btnPin.classList.remove('opacity-0', 'pointer-events-none');
        } else {
            sidebar.classList.add('md:w-20');
            sidebar.classList.remove('md:w-64');
            texts.forEach(t => { t.classList.remove('md:opacity-100'); t.classList.add('md:opacity-0'); });
            btnPin.classList.add('opacity-0', 'pointer-events-none');
        }

        if (isPinned) {
            mainWrapper.classList.remove('md:ml-20');
            mainWrapper.classList.add('md:ml-64');
            btnPin.innerHTML = '<i class="ph ph-push-pin-slash text-lg"></i>';
            btnPin.classList.add('text-indigo-400');
        } else {
            mainWrapper.classList.add('md:ml-20');
            mainWrapper.classList.remove('md:ml-64');
            btnPin.innerHTML = '<i class="ph ph-push-pin text-lg"></i>';
            btnPin.classList.remove('text-indigo-400');
        }
    }

    // Eventos do Layout
    sidebar.addEventListener('mouseenter', () => { if (window.innerWidth >= 768) { isHovered = true; updateUI(); } });
    sidebar.addEventListener('mouseleave', () => { if (window.innerWidth >= 768) { isHovered = false; updateUI(); } });
    btnPin.addEventListener('click', () => { isPinned = !isPinned; updateUI(); });
    btnMobile.addEventListener('click', () => { isMobileOpen = true; updateUI(); });
    backdrop.addEventListener('click', () => { isMobileOpen = false; updateUI(); });

    // Evento de Sair (Logout integrado com Firebase)
    document.getElementById('btn-logout').addEventListener('click', () => {
        auth.signOut();
    });

// --- Sistema de Navegação (Roteamento simples) ---
    const btnDashboard = document.getElementById('btn-nav-dashboard');
    const btnContas = document.getElementById('btn-nav-accounts');
    const btnLancamentos = document.getElementById('btn-nav-transactions');
    const btnInbox = document.getElementById('btn-nav-inbox'); // NOVO
    const btnEspacos = document.getElementById('btn-nav-spaces');
    const mainContent = document.getElementById('main-content');

    function setAtivo(btnAtivo) {
        [btnDashboard, btnContas, btnLancamentos, btnInbox, btnEspacos].forEach(b => {
            b.className = "nav-btn w-full flex items-center p-3 rounded-xl transition-all font-bold text-sm text-slate-400 hover:bg-slate-700 overflow-hidden";
        });
        btnAtivo.className = "nav-btn w-full flex items-center p-3 rounded-xl transition-all font-bold text-sm bg-indigo-500/20 text-indigo-400 overflow-hidden";
    }

    function limparAbaAnterior() {
        if (mainContent.dataset.unsubscribe) {
            try { eval(mainContent.dataset.unsubscribe)(); } catch(e){}
            mainContent.dataset.unsubscribe = '';
        }
        if (mainContent.dataset.unsubscribeEspacos) { limparListenerEspacos(); mainContent.dataset.unsubscribeEspacos = ''; }
        if (mainContent.dataset.unsubscribeContas) { limparListenerContas(); mainContent.dataset.unsubscribeContas = ''; }
        if (mainContent.dataset.unsubscribeInbox) { limparListenerInbox(); mainContent.dataset.unsubscribeInbox = ''; } // NOVO
    }

    btnDashboard.addEventListener('click', () => { setAtivo(btnDashboard); limparAbaAnterior(); renderizarDashboard(); if(window.innerWidth < 768) { isMobileOpen = false; updateUI(); } });
    btnContas.addEventListener('click', () => { setAtivo(btnContas); limparAbaAnterior(); renderizarContas(); if(window.innerWidth < 768) { isMobileOpen = false; updateUI(); } });
    btnLancamentos.addEventListener('click', () => { setAtivo(btnLancamentos); limparAbaAnterior(); renderizarLancamentos(); if(window.innerWidth < 768) { isMobileOpen = false; updateUI(); } });
    
    // NOVO EVENTO INBOX
    btnInbox.addEventListener('click', () => { setAtivo(btnInbox); limparAbaAnterior(); renderizarInbox(); if(window.innerWidth < 768) { isMobileOpen = false; updateUI(); } });
    
    btnEspacos.addEventListener('click', () => { setAtivo(btnEspacos); limparAbaAnterior(); renderizarEspacos(); if(window.innerWidth < 768) { isMobileOpen = false; updateUI(); } });

    document.getElementById('btn-add-tx').addEventListener('click', () => { abrirModalTransacao(); });

    // --- O QUE FALTAVA AQUI PARA BAIXO ---
    // Inicializa a UI e injeta a aba do Dashboard ao entrar
    updateUI();
    renderizarDashboard();
}