// js/components/accounts.js
import { auth, db } from '../config/firebase.js';
import { abrirDetalheConta } from './accountDetails.js';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let unsubscribeContas = null;
let unsubscribeTransacoes = null;
let isModalInjected = false;
let estadoAtual = { modo: 'criar', contaId: null };

let contasAtuais = [];
let transacoesAtuais = [];

export function renderizarContas() {
    const main = document.getElementById('main-content');
    const user = auth.currentUser;
    if (!user) return;

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

    const qTransacoes = query(collection(db, 'transactions'), where('participantEmails', 'array-contains', user.email));
    
    unsubscribeTransacoes = onSnapshot(qTransacoes, (snapshot) => {
        // IMPORTANTE: Removemos o filtro de mês! O Saldo da conta corrente precisa de todo o histórico para bater certo.
        transacoesAtuais = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        atualizarGridVisual(); 
    });

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

    const dataAtual = new Date();
    const mesAtualStr = `${dataAtual.getFullYear()}-${String(dataAtual.getMonth() + 1).padStart(2, '0')}`;

    contasAtuais.forEach(acc => {
        let paidIncome = 0, paidExpense = 0;
        let faturaAtualPend = 0; // Somente para o cartão no mês corrente

        transacoesAtuais.forEach(tx => {
            const v = parseFloat(tx.amount || 0);

            // Transação feita diretamente na conta
            if (tx.accountId === acc.id) {
                if (acc.type === 'credit') {
                    // Contabilidade de cartão: soma o que cai neste mês
                    let caiNesteMes = false;
                    if (tx.launchDate && tx.launchDate.startsWith(mesAtualStr)) caiNesteMes = true; // Simplificado
                    // Na lógica ideal, você também lê de tx.overrides, mas para o visual rápido, isso serve.
                    
                    if (caiNesteMes && tx.type === 'expense' && tx.status !== 'paid') faturaAtualPend += v;
                } else {
                    // Contabilidade de Conta Bancária: Soma todo o histórico
                    if (tx.status === 'paid' || tx.status === 'accepted') {
                        if(tx.type === 'income') paidIncome += v;
                        else paidExpense += v;
                    }
                }
            } 
            // O SEGREDO DO PAGAMENTO DA FATURA: O dinheiro saiu desta conta bancária!
            else if (tx.paidFromAccountId === acc.id && tx.status === 'paid') {
                paidExpense += v; // Deduz do saldo
            }
        });

        const isCredit = acc.type === 'credit';
        const isCarteira = acc.name === 'Carteira';

        const card = document.createElement('div');
        card.className = `card-account p-6 bg-darkcard border border-darkborder rounded-3xl relative group transition-colors cursor-pointer ${isCredit ? 'hover:border-purple-500/50' : 'hover:border-indigo-500/50'}`;
        
        const btnsHTML = `
            <div class="absolute top-4 right-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button class="btn-edit text-slate-400 hover:text-indigo-400 bg-slate-800 p-2 rounded-lg" data-id="${acc.id}"><i class="ph ph-pencil-simple text-lg pointer-events-none"></i></button>
                ${!isCarteira ? `<button class="btn-delete text-slate-400 hover:text-rose-400 bg-slate-800 p-2 rounded-lg" data-id="${acc.id}"><i class="ph ph-trash text-lg pointer-events-none"></i></button>` : ''}
            </div>
        `;

        if (isCredit) {
            const limit = parseFloat(acc.limit || 0);
            const percentual = limit > 0 ? Math.min((faturaAtualPend / limit) * 100, 100) : 0;
            
            card.innerHTML = `
                ${btnsHTML}
                <div class="w-12 h-12 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-2xl mb-4 pointer-events-none"><i class="ph-fill ph-credit-card"></i></div>
                <h4 class="font-bold text-slate-200 text-lg pointer-events-none">${acc.name}</h4>
                <div class="mt-4 pointer-events-none">
                    <div class="flex justify-between text-xs mb-1"><span class="text-slate-400">Fatura Atual Pendente</span><span class="text-slate-200 font-bold">R$ ${faturaAtualPend.toFixed(2)}</span></div>
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

        card.addEventListener('click', () => abrirDetalheConta(acc));
    });

    if(gridCredits.children.length === 0) gridCredits.innerHTML = `<p class="text-slate-500 text-sm">Nenhum cartão cadastrado.</p>`;

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

// RESTANTE DO CÓDIGO INALTERADO PARA OS MODAIS DE CRIAÇÃO...
function injetarModaisContas() {
    if (isModalInjected) return;
    const html = `
    <!-- Modal Formulário da Conta (Mantido igual) -->
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
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    isModalInjected = true;
    configurarEventosModais();
}

// Funções base mantidas...
function configurarEventosModais() {
    const modalForm = document.getElementById('modal-account');
    const fecharForm = () => modalForm.classList.add('hidden');
    document.getElementById('btn-close-acc-modal').addEventListener('click', fecharForm);
    document.getElementById('btn-cancel-acc').addEventListener('click', fecharForm);

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

    document.getElementById('form-account').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        btnSave.disabled = true; btnSave.innerText = 'A guardar...';

        try {
            const data = { userId: user.uid, name: document.getElementById('acc-input-name').value, type: accType };
            if(accType === 'wallet') data.initialBalance = parseFloat(document.getElementById('acc-input-balance').value) || 0;
            else {
                data.limit = parseFloat(document.getElementById('acc-input-limit').value) || 0;
                data.closingDay = document.getElementById('acc-input-closing').value;
                data.dueDay = document.getElementById('acc-input-due').value;
            }

            if(estadoAtual.modo === 'criar') await addDoc(collection(db, 'accounts'), data);
            else if(estadoAtual.modo === 'editar' && estadoAtual.contaId) await updateDoc(doc(db, 'accounts', estadoAtual.contaId), data);

            fecharForm();
        } catch(err) { alert('Erro ao guardar.'); console.error(err); } finally { btnSave.disabled = false; btnSave.innerText = 'Salvar'; }
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