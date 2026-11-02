// js/components/accounts.js
import { auth, db } from '../config/firebase.js';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let unsubscribeContas = null;
let unsubscribeTransacoes = null;
let isModalInjected = false;
let estadoAtual = { modo: 'criar', contaId: null };

// Guardar dados em memória para uso no Extrato
let contasAtuais = [];
let transacoesAtuais = [];

export function renderizarContas() {
    const main = document.getElementById('main-content');
    const user = auth.currentUser;
    if (!user) return;

    // 1. Injeção do Esqueleto Base da Tela
    main.innerHTML = `
        <div class="space-y-10 animate-fade-in max-w-6xl mx-auto h-full pb-20">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-2xl font-bold">Contas e Cartões</h2>
                <button id="btn-new-account" class="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/30 hover:bg-indigo-500 transition-colors">
                    + Nova Conta
                </button>
            </div>
            
            <div>
                <div class="flex items-center mb-4">
                    <i class="ph-fill ph-bank text-indigo-400 text-2xl mr-2"></i>
                    <h3 class="text-lg font-bold text-slate-300">Contas Bancárias</h3>
                </div>
                <div id="grid-wallets" class="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div class="col-span-3 text-slate-500 text-sm"><i class="ph ph-spinner animate-spin mr-2"></i>A carregar contas...</div>
                </div>
            </div>

            <div>
                <div class="flex items-center mb-4">
                    <i class="ph-fill ph-credit-card text-purple-400 text-2xl mr-2"></i>
                    <h3 class="text-lg font-bold text-slate-300">Cartões de Crédito</h3>
                </div>
                <div id="grid-credits" class="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div class="col-span-3 text-slate-500 text-sm"><i class="ph ph-spinner animate-spin mr-2"></i>A carregar cartões...</div>
                </div>
            </div>
        </div>
    `;

    injetarModaisContas();

    document.getElementById('btn-new-account').addEventListener('click', () => abrirModalConta('criar'));

    // 2. Conexão Firebase: Transações (para calcular faturas e saldos)
    const dataAtual = new Date();
    const qTransacoes = query(collection(db, 'transactions'), where('participantEmails', 'array-contains', user.email));
    
    unsubscribeTransacoes = onSnapshot(qTransacoes, (snapshot) => {
        transacoesAtuais = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(tx => {
            const dataRef = tx.dueDate || tx.launchDate;
            if (!dataRef) return false;
            const dataTx = new Date(dataRef + 'T12:00:00');
            return dataTx.getMonth() === dataAtual.getMonth() && dataTx.getFullYear() === dataAtual.getFullYear();
        }).sort((a, b) => new Date(b.launchDate) - new Date(a.launchDate)); // Mais recentes primeiro
        
        atualizarGridVisual(); // Atualiza a tela se as transações mudarem
    });

    // 3. Conexão Firebase: Contas
    const qContas = query(collection(db, 'accounts'), where('userId', '==', user.uid));
    unsubscribeContas = onSnapshot(qContas, (snapshot) => {
        contasAtuais = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        atualizarGridVisual();
    });

    main.dataset.unsubscribeContas = "true";
}

function atualizarGridVisual() {
    const gridWallets = document.getElementById('grid-wallets');
    const gridCredits = document.getElementById('grid-credits');
    if(!gridWallets || !gridCredits) return;

    gridWallets.innerHTML = '';
    gridCredits.innerHTML = '';

    contasAtuais.forEach(acc => {
        // Calcular valores baseados nas transações
        const txsDaConta = transacoesAtuais.filter(t => t.accountId === acc.id);
        
        let totalIncome = 0, totalExpense = 0, paidIncome = 0, paidExpense = 0;
        txsDaConta.forEach(tx => {
            const v = parseFloat(tx.amount || 0);
            if(tx.type === 'income') { totalIncome += v; if(tx.status === 'paid') paidIncome += v; }
            else { totalExpense += v; if(tx.status === 'paid') paidExpense += v; }
        });

        const isCredit = acc.type === 'credit';
        const isCarteira = acc.name === 'Carteira';

        const card = document.createElement('div');
        card.className = `card-account p-6 bg-darkcard border border-darkborder rounded-3xl relative group transition-colors cursor-pointer ${isCredit ? 'hover:border-purple-500/50' : 'hover:border-indigo-500/50'}`;
        
        // Botões de Ação
        const btnsHTML = `
            <div class="absolute top-4 right-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button class="btn-edit text-slate-400 hover:text-indigo-400 bg-slate-800 p-2 rounded-lg" data-id="${acc.id}"><i class="ph ph-pencil-simple text-lg pointer-events-none"></i></button>
                ${!isCarteira ? `<button class="btn-delete text-slate-400 hover:text-rose-400 bg-slate-800 p-2 rounded-lg" data-id="${acc.id}"><i class="ph ph-trash text-lg pointer-events-none"></i></button>` : ''}
            </div>
        `;

        if (isCredit) {
            const limit = parseFloat(acc.limit || 0);
            const faturaAtual = totalExpense; // No cartão, despesas somam na fatura
            const percentual = limit > 0 ? Math.min((faturaAtual / limit) * 100, 100) : 0;
            
            card.innerHTML = `
                ${btnsHTML}
                <div class="w-12 h-12 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-2xl mb-4 pointer-events-none"><i class="ph-fill ph-credit-card"></i></div>
                <h4 class="font-bold text-slate-200 text-lg pointer-events-none">${acc.name}</h4>
                <div class="mt-4 pointer-events-none">
                    <div class="flex justify-between text-xs mb-1"><span class="text-slate-400">Fatura Atual</span><span class="text-slate-200 font-bold">R$ ${faturaAtual.toFixed(2)}</span></div>
                    <div class="w-full bg-slate-800 rounded-full h-2 mb-1"><div class="bg-purple-500 h-2 rounded-full" style="width: ${percentual}%"></div></div>
                    <div class="flex justify-between text-[10px] text-slate-500"><span>Vence dia ${acc.dueDay || '--'}</span><span>Limite: R$ ${limit.toFixed(2)}</span></div>
                </div>
            `;
            gridCredits.appendChild(card);
        } else {
            const saldoInicial = parseFloat(acc.initialBalance || 0);
            const saldoAtual = saldoInicial + paidIncome - paidExpense;
            
            card.innerHTML = `
                ${btnsHTML}
                <div class="w-12 h-12 rounded-full bg-indigo-500/20 text-indigo-500 flex items-center justify-center text-2xl mb-4 pointer-events-none"><i class="ph-fill ph-${isCarteira ? 'wallet' : 'bank'}"></i></div>
                <h4 class="font-bold text-slate-200 text-lg pointer-events-none">${acc.name}</h4>
                <p class="text-xs text-slate-400 mb-1 pointer-events-none">Saldo Atual</p>
                <p class="text-2xl font-bold ${saldoAtual >= 0 ? 'text-emerald-500' : 'text-rose-500'} pointer-events-none">R$ ${saldoAtual.toFixed(2)}</p>
            `;
            gridWallets.appendChild(card);
        }

        // Lógica do Clique
        card.addEventListener('click', () => abrirModalExtrato(acc, txsDaConta, totalIncome, paidIncome, totalExpense, paidExpense));
    });

    if(gridCredits.children.length === 0) gridCredits.innerHTML = `<p class="text-slate-500 text-sm">Nenhum cartão cadastrado.</p>`;

    // Eventos dos botões flutuantes (Bloqueiam abrir o extrato)
    document.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const acc = contasAtuais.find(x => x.id === e.target.dataset.id);
        if(acc) abrirModalConta('editar', acc);
    }));

    document.querySelectorAll('.btn-delete').forEach(b => b.addEventListener('click', async (e) => {
        e.stopPropagation();
        if(confirm('Atenção: Excluir a conta não exclui as transações automaticamente. Deseja continuar?')) {
            await deleteDoc(doc(db, 'accounts', e.target.dataset.id));
        }
    }));
}

export function limparListenerContas() {
    if (unsubscribeContas) { unsubscribeContas(); unsubscribeContas = null; }
    if (unsubscribeTransacoes) { unsubscribeTransacoes(); unsubscribeTransacoes = null; }
}

// ==========================================
// MODAIS (FORMULÁRIO E EXTRATO)
// ==========================================

function injetarModaisContas() {
    if (isModalInjected) return;
    
    const html = `
    <!-- Modal Formulário -->
    <div id="modal-account" class="fixed inset-0 bg-black/80 z-[105] flex items-center justify-center p-4 hidden animate-fade-in">
        <form id="form-account" class="bg-darkcard w-full max-w-md rounded-3xl p-6 border border-darkborder shadow-2xl flex flex-col">
            <div class="flex justify-between items-center mb-6">
                <h2 id="acc-modal-title" class="text-xl font-bold text-white">Nova Conta</h2>
                <button type="button" id="btn-close-acc-modal" class="text-slate-400 hover:text-rose-500"><i class="ph ph-x text-2xl"></i></button>
            </div>

            <div class="space-y-5">
                <div class="flex bg-slate-900 p-1 rounded-xl border border-slate-700">
                    <button type="button" id="btn-type-wallet" class="flex-1 py-2 text-sm font-bold rounded-lg bg-slate-700 text-indigo-400 shadow transition-all">🏦 Conta Bancária</button>
                    <button type="button" id="btn-type-credit" class="flex-1 py-2 text-sm font-bold rounded-lg text-slate-500 hover:bg-slate-800 transition-all">💳 Cartão de Crédito</button>
                </div>
                
                <div>
                    <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Nome</label>
                    <input type="text" id="acc-input-name" required class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none" />
                </div>
                
                <div id="box-wallet" class="animate-fade-in">
                    <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Saldo Inicial (R$)</label>
                    <input type="number" id="acc-input-balance" step="0.01" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500" />
                </div>

                <div id="box-credit" class="hidden animate-fade-in space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Limite Total (R$)</label>
                        <input type="number" id="acc-input-limit" step="0.01" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-purple-500" />
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Dia de Fecho</label>
                            <input type="number" id="acc-input-closing" min="1" max="31" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-purple-500" />
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Vencimento</label>
                            <input type="number" id="acc-input-due" min="1" max="31" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-purple-500" />
                        </div>
                    </div>
                </div>
            </div>

            <div class="flex justify-end space-x-3 mt-8 pt-4 border-t border-slate-700">
                <button type="button" id="btn-cancel-acc" class="px-5 py-2.5 text-slate-400 font-bold hover:bg-slate-800 rounded-xl transition-colors">Cancelar</button>
                <button type="submit" id="btn-save-acc" class="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 shadow-lg transition-colors">Salvar</button>
            </div>
        </form>
    </div>

    <!-- Modal Extrato -->
    <div id="modal-extract" class="fixed inset-0 bg-slate-900 z-[105] hidden flex-col md:flex-row animate-fade-in">
        <div class="w-full md:w-1/3 bg-darkcard p-8 flex flex-col border-r border-darkborder overflow-y-auto">
            <div>
                <button id="btn-close-extract" class="w-10 h-10 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:bg-slate-700 hover:text-white mb-8"><i class="ph ph-arrow-left text-xl"></i></button>
                <div id="ext-icon-box" class="w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-4"><i id="ext-icon"></i></div>
                <h2 id="ext-title" class="text-3xl font-bold text-white mb-2"></h2>
                <p id="ext-subtitle" class="text-slate-400 text-sm"></p>
                <p id="ext-total" class="text-4xl font-bold mt-2"></p>
            </div>
            <div id="ext-metrics" class="mt-8 bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50 space-y-4"></div>
        </div>
        <div class="w-full md:w-2/3 p-8 overflow-y-auto bg-slate-900 relative">
            <h3 class="text-xl font-bold text-white mb-6">Timeline de Lançamentos</h3>
            <div id="ext-timeline" class="space-y-4"></div>
        </div>
    </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', html);
    isModalInjected = true;
    configurarEventosModais();
}

function configurarEventosModais() {
    const modalForm = document.getElementById('modal-account');
    const fecharForm = () => modalForm.classList.add('hidden');
    document.getElementById('btn-close-acc-modal').addEventListener('click', fecharForm);
    document.getElementById('btn-cancel-acc').addEventListener('click', fecharForm);
    document.getElementById('btn-close-extract').addEventListener('click', () => document.getElementById('modal-extract').classList.add('hidden'));

    let accType = 'wallet';
    const btnW = document.getElementById('btn-type-wallet');
    const btnC = document.getElementById('btn-type-credit');
    const boxW = document.getElementById('box-wallet');
    const boxC = document.getElementById('box-credit');
    const btnSave = document.getElementById('btn-save-acc');

    window.setAccountType = function(type) {
        accType = type;
        if(type === 'wallet') {
            btnW.className = 'flex-1 py-2 text-sm font-bold rounded-lg bg-slate-700 text-indigo-400 shadow transition-all';
            btnC.className = 'flex-1 py-2 text-sm font-bold rounded-lg text-slate-500 hover:bg-slate-800 transition-all';
            boxW.classList.remove('hidden'); boxC.classList.add('hidden');
            btnSave.className = 'px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 shadow-lg transition-colors';
            document.getElementById('acc-input-limit').required = false;
        } else {
            btnC.className = 'flex-1 py-2 text-sm font-bold rounded-lg bg-slate-700 text-purple-400 shadow transition-all';
            btnW.className = 'flex-1 py-2 text-sm font-bold rounded-lg text-slate-500 hover:bg-slate-800 transition-all';
            boxC.classList.remove('hidden'); boxW.classList.add('hidden');
            btnSave.className = 'px-5 py-2.5 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500 shadow-lg transition-colors';
            document.getElementById('acc-input-limit').required = true;
        }
    }

    btnW.addEventListener('click', () => window.setAccountType('wallet'));
    btnC.addEventListener('click', () => window.setAccountType('credit'));

    // Gravação no Firebase
    document.getElementById('form-account').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        btnSave.disabled = true; btnSave.innerText = 'A guardar...';

        try {
            const data = {
                userId: user.uid,
                name: document.getElementById('acc-input-name').value,
                type: accType
            };
            if(accType === 'wallet') {
                data.initialBalance = parseFloat(document.getElementById('acc-input-balance').value) || 0;
            } else {
                data.limit = parseFloat(document.getElementById('acc-input-limit').value) || 0;
                data.closingDay = document.getElementById('acc-input-closing').value;
                data.dueDay = document.getElementById('acc-input-due').value;
            }

            if(estadoAtual.modo === 'criar') await addDoc(collection(db, 'accounts'), data);
            else if(estadoAtual.modo === 'editar' && estadoAtual.contaId) await updateDoc(doc(db, 'accounts', estadoAtual.contaId), data);

            fecharForm();
        } catch(err) {
            alert('Erro ao guardar.');
            console.error(err);
        } finally {
            btnSave.disabled = false; btnSave.innerText = 'Salvar';
        }
    });
}

function abrirModalConta(modo, dados = null) {
    estadoAtual = { modo, contaId: dados ? dados.id : null };
    document.getElementById('form-account').reset();
    
    document.getElementById('acc-modal-title').innerText = modo === 'criar' ? 'Nova Conta' : 'Editar Conta';
    
    if(modo === 'criar') {
        window.setAccountType('wallet');
        document.getElementById('btn-type-wallet').disabled = false;
        document.getElementById('btn-type-credit').disabled = false;
    } else {
        window.setAccountType(dados.type);
        // Não permitir mudar o tipo de conta na edição
        document.getElementById('btn-type-wallet').disabled = true;
        document.getElementById('btn-type-credit').disabled = true;
        
        document.getElementById('acc-input-name').value = dados.name;
        if(dados.type === 'wallet') document.getElementById('acc-input-balance').value = dados.initialBalance;
        else {
            document.getElementById('acc-input-limit').value = dados.limit;
            document.getElementById('acc-input-closing').value = dados.closingDay;
            document.getElementById('acc-input-due').value = dados.dueDay;
        }
    }
    
    document.getElementById('modal-account').classList.remove('hidden');
}

function abrirModalExtrato(acc, txs, totalInc, paidInc, totalExp, paidExp) {
    const isCredit = acc.type === 'credit';
    const isCarteira = acc.name === 'Carteira';
    
    const exIconBox = document.getElementById('ext-icon-box');
    const exIcon = document.getElementById('ext-icon');
    const exTitle = document.getElementById('ext-title');
    const exSubtitle = document.getElementById('ext-subtitle');
    const exTotal = document.getElementById('ext-total');
    const exMetrics = document.getElementById('ext-metrics');
    const exTimeline = document.getElementById('ext-timeline');

    exTitle.innerText = acc.name;
    exTimeline.innerHTML = '';

    if (isCredit) {
        exIconBox.className = 'w-16 h-16 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-3xl mb-4';
        exIcon.className = 'ph-fill ph-credit-card';
        exSubtitle.innerText = 'Fatura Prevista do Mês';
        exTotal.innerText = `R$ ${totalExp.toFixed(2)}`;
        exTotal.className = 'text-4xl font-bold mt-2 text-purple-500';
        
        exMetrics.innerHTML = `
            <div class="flex justify-between items-center text-sm"><span class="text-slate-400">Total Lançado</span><span class="font-bold text-slate-200">R$ ${totalExp.toFixed(2)}</span></div>
            <div class="flex justify-between items-center text-sm"><span class="text-slate-400">Fatura Paga (Efetivado)</span><span class="font-bold text-emerald-400">R$ ${paidExp.toFixed(2)}</span></div>
            <div class="pt-3 border-t border-slate-700 flex justify-between items-center text-sm"><span class="text-slate-300 font-bold">Total Aberto</span><span class="font-bold text-rose-400">R$ ${(totalExp - paidExp).toFixed(2)}</span></div>
        `;
    } else {
        const sInicial = parseFloat(acc.initialBalance || 0);
        const sAtual = sInicial + paidInc - paidExp;
        const sProjetado = sInicial + totalInc - totalExp;

        exIconBox.className = 'w-16 h-16 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-3xl mb-4';
        exIcon.className = isCarteira ? 'ph-fill ph-wallet' : 'ph-fill ph-bank';
        exSubtitle.innerText = 'Saldo Final Projetado';
        exTotal.innerText = `R$ ${sProjetado.toFixed(2)}`;
        exTotal.className = `text-4xl font-bold mt-2 ${sProjetado >= 0 ? 'text-indigo-400' : 'text-rose-400'}`;

        exMetrics.innerHTML = `
            <div class="space-y-3">
                <div>
                    <div class="flex justify-between items-center text-sm mb-1"><span class="text-slate-400">Total Receitas</span><span class="font-bold text-emerald-500">+ R$ ${totalInc.toFixed(2)}</span></div>
                    <div class="flex justify-between items-center text-[10px] text-slate-500"><span>Efetivadas: <strong class="text-emerald-400">R$ ${paidInc.toFixed(2)}</strong></span><span>Pendentes: R$ ${(totalInc - paidInc).toFixed(2)}</span></div>
                </div>
                <div class="pt-2 border-t border-slate-700">
                    <div class="flex justify-between items-center text-sm mb-1"><span class="text-slate-400">Total Despesas</span><span class="font-bold text-rose-500">- R$ ${totalExp.toFixed(2)}</span></div>
                    <div class="flex justify-between items-center text-[10px] text-slate-500"><span>Efetivadas: <strong class="text-rose-400">R$ ${paidExp.toFixed(2)}</strong></span><span>Pendentes: R$ ${(totalExp - paidExp).toFixed(2)}</span></div>
                </div>
            </div>
            <div class="mt-4 pt-4 border-t border-slate-700 space-y-2">
                <div class="flex justify-between items-center text-sm"><span class="text-slate-400">Saldo Atual (Efetivado)</span><span class="font-bold text-emerald-400">R$ ${sAtual.toFixed(2)}</span></div>
            </div>
        `;
    }

    if(txs.length === 0) {
        exTimeline.innerHTML = '<p class="text-slate-500 text-sm">Sem movimentações na conta neste mês.</p>';
    } else {
        txs.forEach(tx => {
            const isIncome = tx.type === 'income';
            const isPago = tx.status === 'paid';
            const dataEx = (tx.launchDate || '').split('-').reverse().join('/');
            
            exTimeline.innerHTML += `
                <div class="flex justify-between items-center p-4 bg-darkcard border border-darkborder rounded-xl hover:border-slate-600 transition-colors">
                    <div class="flex items-center">
                        <div class="w-10 h-10 rounded-full flex items-center justify-center mr-4 ${isIncome ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}">
                            <i class="ph-bold ${isIncome ? 'ph-arrow-down-left' : 'ph-arrow-up-right'}"></i>
                        </div>
                        <div>
                            <p class="font-bold text-slate-200">${tx.description}</p>
                            <p class="text-xs text-slate-400">Data: ${dataEx}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="font-bold ${isIncome ? 'text-emerald-500' : 'text-rose-500'}">${isIncome ? '+' : '-'} R$ ${parseFloat(tx.amount||0).toFixed(2)}</p>
                        <span class="text-[10px] uppercase font-bold ${isPago ? 'text-emerald-400' : 'text-amber-400'}">${isPago ? 'Efetivado' : 'Pendente'}</span>
                    </div>
                </div>
            `;
        });
    }

    const modal = document.getElementById('modal-extract');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}