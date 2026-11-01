// js/auth/login.js
import { auth, db } from '../config/firebase.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    doc, 
    setDoc, 
    collection, 
    addDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export function renderizarLogin() {
    const root = document.getElementById('app-root');
    
    // O mesmo HTML do nosso teste visual, sem alterações
    root.innerHTML = `
        <div class="min-h-screen flex items-center justify-center bg-slate-900 px-4 relative overflow-hidden w-full dark">
            <div class="absolute top-[-10%] left-[-10%] w-96 h-96 bg-indigo-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-40"></div>
            <div class="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-emerald-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-40"></div>
            
            <div class="bg-slate-800 p-8 rounded-3xl shadow-2xl w-full max-w-md border border-slate-700 z-10 animate-fade-in">
                <div class="text-center mb-8">
                    <div class="w-16 h-16 bg-indigo-500/20 text-indigo-400 rounded-2xl mx-auto flex items-center justify-center text-3xl mb-4">
                        <i class="ph-fill ph-wallet"></i>
                    </div>
                    <h1 class="text-2xl font-bold text-white mb-2" id="form-title">Acesse seu Painel</h1>
                    <p class="text-slate-400 text-sm">Controle financeiro inteligente e colaborativo</p>
                </div>

                <form id="login-form" class="space-y-4">
                    <div id="error-msg" class="hidden p-3 bg-rose-500/20 border border-rose-500/50 rounded-lg text-rose-400 text-sm text-center font-bold"></div>
                    
                    <div id="name-field" class="hidden animate-fade-in">
                        <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Nome</label>
                        <input type="text" id="input-name" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" placeholder="Seu nome" />
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">E-mail</label>
                        <input type="email" id="input-email" required class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" placeholder="seu@email.com" />
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Senha</label>
                        <input type="password" id="input-password" required class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" placeholder="••••••••" />
                    </div>

                    <div id="confirm-password-field" class="hidden animate-fade-in">
                        <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Confirmar Senha</label>
                        <input type="password" id="input-confirm-password" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" placeholder="••••••••" />
                    </div>

                    <button type="submit" id="btn-submit" class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-indigo-500/30 mt-6 flex justify-center items-center">
                        Entrar no Sistema
                    </button>
                </form>

                <div class="mt-6 text-center text-sm text-slate-400">
                    <span id="toggle-text">Ainda não tem conta?</span>
                    <button id="btn-toggle-mode" type="button" class="ml-2 text-indigo-400 font-bold hover:text-indigo-300">
                        Cadastre-se grátis
                    </button>
                </div>
            </div>
        </div>
    `;

    // Lógica de UI (Alternar Login/Registo)
    let isRegister = false;
    document.getElementById('btn-toggle-mode').addEventListener('click', () => {
        isRegister = !isRegister;
        document.getElementById('form-title').innerText = isRegister ? 'Criar Nova Conta' : 'Acesse seu Painel';
        document.getElementById('btn-submit').innerText = isRegister ? 'Criar Minha Conta' : 'Entrar no Sistema';
        document.getElementById('toggle-text').innerText = isRegister ? 'Já tem uma conta?' : 'Ainda não tem conta?';
        document.getElementById('btn-toggle-mode').innerText = isRegister ? 'Fazer Login' : 'Cadastre-se grátis';
        
        const nameField = document.getElementById('name-field');
        const confirmPasswordField = document.getElementById('confirm-password-field');
        
        if(isRegister) {
            nameField.classList.remove('hidden');
            document.getElementById('input-name').required = true;
            confirmPasswordField.classList.remove('hidden');
            document.getElementById('input-confirm-password').required = true;
        } else {
            nameField.classList.add('hidden');
            document.getElementById('input-name').required = false;
            confirmPasswordField.classList.add('hidden');
            document.getElementById('input-confirm-password').required = false;
        }
    });

    // Lógica de Submissão (Firebase Real)
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('input-name').value;
        const email = document.getElementById('input-email').value;
        const password = document.getElementById('input-password').value;
        const confirmPassword = document.getElementById('input-confirm-password').value;
        
        const errorBox = document.getElementById('error-msg');
        const btnSubmit = document.getElementById('btn-submit');
        
        // Reset de erros e estado de loading
        errorBox.classList.add('hidden');
        errorBox.classList.remove('text-amber-400', 'bg-amber-500/20', 'border-amber-500/50');
        errorBox.classList.add('text-rose-400', 'bg-rose-500/20', 'border-rose-500/50');
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i>';
        
        try {
            if (isRegister) {
                // Validação de Senha no Registo
                if (password !== confirmPassword) {
                    throw new Error('As senhas não coincidem!');
                }

                // 1. Criar Utilizador no Authentication
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                
                // 2. Setup de Fábrica (Regras de Negócio)
                // 2.1 Criar Perfil
                await setDoc(doc(db, 'users', user.uid), { name, email });
                
                // 2.2 Criar Conta Padrão
                await addDoc(collection(db, 'accounts'), { 
                    userId: user.uid, name: 'Carteira', type: 'wallet', initialBalance: 0 
                });
                
                // 2.3 Criar Espaço Pessoal
                await addDoc(collection(db, 'spaces'), {
                    creatorId: user.uid, creatorEmail: email, name: 'Pessoal', 
                    isIndividual: true, color: '#3b82f6', icon: '👤', 
                    participantEmails: [email], membersData: [{email, status: 'accepted'}]
                });
                
                // 2.4 Criar Categorias Padrão
                const defaultCats = [
                    { name: 'Moradia', color: '#6366f1', icon: '🏠' },
                    { name: 'Alimentação', color: '#f59e0b', icon: '🍔' },
                    { name: 'Transporte', color: '#10b981', icon: '🚗' },
                    { name: 'Saúde', color: '#ef4444', icon: '⚕️' },
                    { name: 'Lazer', color: '#ec4899', icon: '🎉' },
                    { name: 'Outros', color: '#8b5cf6', icon: '📦' }
                ];
                for (const cat of defaultCats) {
                    await addDoc(collection(db, 'categories'), { userId: user.uid, ...cat });
                }

            } else {
                // Login Simples
                await signInWithEmailAndPassword(auth, email, password);
            }
            
            // Sucesso: O listener global de autenticação (que faremos no main.js) vai detetar o login e mudar a tela.
            
        } catch (err) {
            errorBox.classList.remove('hidden');
            // Tratamento de mensagens de erro amigáveis
            if (err.message.includes('auth/')) {
                errorBox.innerText = 'E-mail ou senha inválidos, verifique e tente novamente.';
            } else if (err.message === 'As senhas não coincidem!') {
                errorBox.innerText = err.message;
            } else {
                errorBox.innerText = 'Ocorreu um erro. Tente novamente.';
            }
            // Restaura o botão
            btnSubmit.disabled = false;
            btnSubmit.innerText = isRegister ? 'Criar Minha Conta' : 'Entrar no Sistema';
        }
    });
}