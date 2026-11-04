// js/components/transactions.js
import { auth, db } from '../config/firebase.js';
import { collection, query, where, onSnapshot, doc, deleteDoc, getDoc, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { abrirModalTransacao } from './transactionModal.js';

let unsubscribeTransactions = null;
let unsubscribeAccounts = null;
let currentFilter = 'all'; 
let dataReferenciaAtual = new Date(); 

window.faturasFechadasGlobais = {}; // Memória para o modal de pagamento

function atualizarLabelMes() {
    const label = document.getElementById('label-month');
    if (label) label.innerText = dataReferenciaAtual.toLocaleString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '').toUpperCase();
}

export function renderizarLancamentos() {
    const main = document.getElementById('main-content');
    const user = auth.currentUser;
    if (!user) return;

    main.innerHTML = `
        <div class="max-w-7xl mx-auto w-full flex flex-col h-full animate-fade-in relative">
            <div class="flex justify-between items-center mb-4 shrink-0">
                <h2 class="text-2xl font-bold text-white">Extrato e Previsões</h2>
                <div class="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 shadow-sm">
                    <button id="btn-prev-month" class="px-3 py-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700"><i class="ph ph-caret-left text-lg"></i></button>
                    <div id="label-month" class="px-4 py-1.5 text-sm font-bold text-indigo-400 min-w-[110px] text-center uppercase tracking-wider">A CARREGAR...</div>
                    <button id="btn-next-month" class="px-3 py-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700"><i class="ph ph-caret-right text-lg"></i></button>
                </div>
            </div>

            <div class="flex gap-2 mb-4 overflow-x-auto pb-2 shrink-0 scrollbar-hide" id="filter-bar">
                <button class="filter-btn px-4 py-1.5 rounded-full text-xs font-bold border bg-indigo-600 text-white border-indigo-500 shadow-md" data-filter="all">Todos</button>
                <button class="filter-btn px-4 py-1.5 rounded-full text-xs font-bold border bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700" data-filter="income">Receitas</button>
                <button class="filter-btn px-4 py-1.5 rounded-full text-xs font-bold border bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700" data-filter="expense">Despesas</button>
            </div>

            <div class="bg-darkcard border border-darkborder rounded-3xl flex-1 overflow-hidden shadow-sm flex flex-col min-h-[300px]">
                <div class="hidden md:grid grid-cols-12 gap-4 p-4 border-b border-darkborder bg-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider sticky top-0 z-10">
                    <div class="col-span-2">Situação</div><div class="col-span-2">Data</div><div class="col-span-3">Descrição & Origem</div>
                    <div class="col-span-2">Categoria</div><div class="col-span-2 text-right">A Sua Parte</div><div class="col-span-1 text-right">Ações</div>
                </div>
                <div id="lista-lancamentos" class="overflow-y-auto flex-1 divide-y divide-darkborder bg-darkcard">
                    <div class="text-center p-8 text-slate-500"><i class="ph ph-spinner animate-spin text-2xl mb-2"></i><br>A carregar extrato...</div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 shrink-0 pb-4" id="cards-totais"></div>
            
            <!-- MODAL DE EFETIVAÇÃO NORMAL -->
            <div id="modal-efetivar" class="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4 hidden animate-fade-in">
                <form id="form-efetivar" class="bg-darkcard w-full max-w-sm rounded-3xl p-6 border border-darkborder shadow-2xl flex flex-col">
                    <div class="flex justify-between items-center mb-4">
                        <h2 id="modal-efetivar-title" class="text-lg font-bold text-white">Confirmar</h2>
                        <button type="button" id="btn-close-efetivar" class="text-slate-400 hover:text-rose-500"><i class="ph ph-x text-xl"></i></button>
                    </div>
                    <p class="text-sm text-slate-400 mb-4" id="efetivar-desc">Confirme a data de efetivação.</p>
                    <input type="hidden" id="efetivar-id" />
                    <input type="hidden" id="efetivar-proj-date" />
                    <div>
                        <label id="efetivar-label-data" class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Data</label>
                        <input type="date" id="efetivar-data" required class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div class="flex justify-end space-x-3 mt-6 pt-4 border-t border-slate-700">
                        <button type="button" id="btn-cancel-efetivar" class="px-4 py-2 text-slate-400 font-bold hover:bg-slate-800 rounded-xl">Cancelar</button>
                        <button type="submit" id="btn-save-efetivar" class="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 transition-colors">Confirmar</button>
                    </div>
                </form>
            </div>

            <!-- MODAL GLOBAL DE PAGAMENTO DE FATURA -->
            <div id="modal-pagar-fatura-global" class="fixed inset-0 bg-black/90 z-[120] flex items-center justify-center p-4 hidden animate-fade-in">
                <form id="form-pagar-fatura-global" class="bg-darkcard w-full max-w-sm rounded-3xl p-6 border border-darkborder shadow-2xl flex flex-col">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-lg font-bold text-white">Pagar Fatura Total</h2>
                        <button type="button" id="btn-close-fatura-global" class="text-slate-400 hover:text-rose-500"><i class="ph ph-x text-xl"></i></button>
                    </div>
                    <p class="text-sm text-slate-400 mb-5">Serão liquidados <strong id="fatura-global-qtd" class="text-white">X</strong> lançamentos no valor total de <strong id="fatura-global-valor" class="text-purple-400">R$ 0,00</strong>.</p>
                    <div class="space-y-4">
                        <input type="hidden" id="fatura-global-acc-id" />
                        <div>
                            <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Pagar com qual conta?</label>
                            <select id="fatura-global-conta-debito" required class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"></select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Data do Pagamento</label>
                            <input type="date" id="fatura-global-data" required class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500" />
                        </div>
                    </div>
                    <div class="flex justify-end space-x-3 mt-6 pt-4 border-t border-slate-700">
                        <button type="button" id="btn-cancel-fatura-global" class="px-4 py-2 text-slate-400 font-bold hover:bg-slate-800 rounded-xl">Cancelar</button>
                        <button type="submit" id="btn-submit-fatura-global" class="px-4 py-2 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500 shadow-lg shadow-purple-500/30 transition-colors">Confirmar Pagamento</button>
                    </div>
                </form>
            </div>

            <!-- MODAL RECORRENCIA MANTIDO -->
            <div id="modal-recorrencia" class="fixed inset-0 bg-black/90 z-[120] flex items-center justify-center p-4 hidden animate-fade-in">
                <div class="bg-darkcard w-full max-w-sm rounded-3xl p-6 border border-darkborder shadow-2xl flex flex-col text-center">
                    <div class="w-16 h-16 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 border border-indigo-500/20"><i class="ph-fill ph-arrows-clockwise"></i></div>
                    <h2 class="text-lg font-bold text-white mb-2">Lançamento Recorrente</h2>
                    <p class="text-sm text-slate-400 mb-6">Como deseja aplicar esta alteração?</p>
                    <div class="space-y-3">
                        <button id="btn-rec-single" class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl border border-slate-700 transition-colors flex flex-col items-center">
                            <span>Somente este</span><span class="text-[10px] text-slate-400 font-normal mt-0.5">As outras datas não serão afetadas.</span>
                        </button>
                        <button id="btn-rec-forward" class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl border border-slate-700 transition-colors flex flex-col items-center">
                            <span>Este e os seguintes</span><span class="text-[10px] text-slate-400 font-normal mt-0.5">Os anteriores mantêm-se iguais.</span>
                        </button>
                        <button id="btn-rec-all" class="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition-colors flex flex-col items-center">
                            <span>Todos</span><span class="text-[10px] text-indigo-200 font-normal mt-0.5">Altera todo o histórico.</span>
                        </button>
                    </div>
                    <button id="btn-cancel-rec" class="mt-6 text-sm text-slate-500 hover:text-slate-300 font-bold">Cancelar</button>
                </div>
            </div>
        </div>
    `;

    atualizarLabelMes();
    document.getElementById('btn-prev-month').addEventListener('click', () => { dataReferenciaAtual.setMonth(dataReferenciaAtual.getMonth() - 1); atualizarLabelMes(); if (window.lastTransactionsSnapshot) processarDadosTabela(window.lastTransactionsSnapshot); });
    document.getElementById('btn-next-month').addEventListener('click', () => { dataReferenciaAtual.setMonth(dataReferenciaAtual.getMonth() + 1); atualizarLabelMes(); if (window.lastTransactionsSnapshot) processarDadosTabela(window.lastTransactionsSnapshot); });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.className = "filter-btn px-4 py-1.5 rounded-full text-xs font-bold border bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700");
            e.target.className = "filter-btn px-4 py-1.5 rounded-full text-xs font-bold border bg-indigo-600 text-white border-indigo-500 shadow-md";
            currentFilter = e.target.dataset.filter;
            if (window.lastTransactionsSnapshot) processarDadosTabela(window.lastTransactionsSnapshot);
        });
    });

    // Eventos Modal Efetivar Normal
    const modalEfetivar = document.getElementById('modal-efetivar');
    const fecharModalEfetivar = () => modalEfetivar.classList.add('hidden');
    document.getElementById('btn-close-efetivar').addEventListener('click', fecharModalEfetivar);
    document.getElementById('btn-cancel-efetivar').addEventListener('click', fecharModalEfetivar);

    document.getElementById('form-efetivar').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSave = document.getElementById('btn-save-efetivar');
        const originalText = btnSave.innerText;
        btnSave.disabled = true;
        btnSave.innerText = 'A processar...';
        try {
            const id = document.getElementById('efetivar-id').value;
            const dataPagamento = document.getElementById('efetivar-data').value;
            const projDate = document.getElementById('efetivar-proj-date').value;
            const docRef = doc(db, 'transactions', id);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const txData = docSnap.data();
                if (projDate) {
                    const overrides = txData.overrides || {};
                    const keyMes = projDate.substring(0, 7); 
                    overrides[keyMes] = { ...overrides[keyMes], status: 'paid', paymentDate: dataPagamento };
                    await updateDoc(docRef, { overrides });
                } else {
                    const myEmail = auth.currentUser.email;
                    let payload = { status: 'paid', paymentDate: dataPagamento };
                    if (txData.splitParticipants && txData.splitParticipants.length > 0) {
                        const updatedParticipants = txData.splitParticipants.map(p => {
                            if (p.email === myEmail) return { ...p, status: 'paid', paymentDate: dataPagamento };
                            return p;
                        });
                        payload.splitParticipants = updatedParticipants;
                    }
                    await updateDoc(docRef, payload);
                }
            }
            fecharModalEfetivar();
        } catch (error) {
            console.error(error); alert("Erro ao efetivar lançamento.");
        } finally {
            btnSave.disabled = false; btnSave.innerText = originalText;
        }
    });

    // Eventos Modal Fatura Global
    const modalFaturaGlobal = document.getElementById('modal-pagar-fatura-global');
    const fecharFaturaGlobal = () => modalFaturaGlobal.classList.add('hidden');
    document.getElementById('btn-close-fatura-global').addEventListener('click', fecharFaturaGlobal);
    document.getElementById('btn-cancel-fatura-global').addEventListener('click', fecharFaturaGlobal);

    document.getElementById('form-pagar-fatura-global').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSubmit = document.getElementById('btn-submit-fatura-global');
        btnSubmit.disabled = true;
        btnSubmit.innerText = 'A processar...';

        try {
            const dataPagamento = document.getElementById('fatura-global-data').value;
            const contaDebitoId = document.getElementById('fatura-global-conta-debito').value;
            const accId = document.getElementById('fatura-global-acc-id').value;
            const fatura = window.faturasFechadasGlobais[accId];
            
            const keyMes = `${dataReferenciaAtual.getFullYear()}-${String(dataReferenciaAtual.getMonth() + 1).padStart(2, '0')}`;
            
            const promises = fatura.txsPendentes.map(async (tx) => {
                const docRef = doc(db, 'transactions', tx.id);
                let payload = { status: 'paid', paymentDate: dataPagamento, paidFromAccountId: contaDebitoId };
                
                if (tx.splitParticipants && tx.splitParticipants.length > 0) {
                    const updatedParticipants = tx.splitParticipants.map(p => {
                        if (p.email === user.email) return { ...p, status: 'paid', paymentDate: dataPagamento };
                        return p;
                    });
                    payload.splitParticipants = updatedParticipants;
                }

                if (tx.isProjection || tx.isCreditInvoice) {
                    const overrides = tx.overrides || {};
                    overrides[keyMes] = { ...overrides[keyMes], ...payload };
                    return updateDoc(docRef, { overrides });
                } else return updateDoc(docRef, payload);
            });

            await Promise.all(promises);
            fecharFaturaGlobal();
        } catch (error) {
            console.error(error); alert("Erro ao efetivar a fatura.");
        } finally {
            btnSubmit.disabled = false; btnSubmit.innerText = 'Confirmar Pagamento';
        }
    });

    const qAcc = query(collection(db, 'accounts'), where('userId', '==', user.uid));
    unsubscribeAccounts = onSnapshot(qAcc, (snapshot) => {
        window.contasGlobaisTransactions = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
        if (window.lastTransactionsSnapshot) processarDadosTabela(window.lastTransactionsSnapshot);
    });

    const q = query(collection(db, 'transactions'), where('participantEmails', 'array-contains', user.email));
    unsubscribeTransactions = onSnapshot(q, (snapshot) => {
        const transacoes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        window.lastTransactionsSnapshot = transacoes; 
        processarDadosTabela(transacoes);
    });
    main.dataset.unsubscribe = "true";
}

export function limparListenerLancamentos() {
    if (unsubscribeTransactions) { unsubscribeTransactions(); unsubscribeTransactions = null; }
    if (unsubscribeAccounts) { unsubscribeAccounts(); unsubscribeAccounts = null; }
}

function projetarLancamentosDoMes(transacoes, dataRef, user) {
    const anoRef = dataRef.getFullYear();
    const mesRef = dataRef.getMonth();
    const keyMesAtual = `${anoRef}-${String(mesRef + 1).padStart(2, '0')}`;
    let projetados = [];
    
    let faturasFechadas = {};
    let faturasAbertas = {};

    transacoes.forEach(tx => {
        if (!tx.launchDate) return;
        if (tx.endDate && keyMesAtual > tx.endDate.substring(0, 7)) return;

        const [txAnoStr, txMesStr, txDiaStr] = tx.launchDate.split('-');
        const txAno = parseInt(txAnoStr, 10);
        const txMes = parseInt(txMesStr, 10) - 1; 
        const txDia = parseInt(txDiaStr, 10);

        if (tx.accountType === 'credit') {
            const conta = window.contasGlobaisTransactions?.find(c => c.id === tx.accountId) || {};
            const closingDay = parseInt(conta.closingDay) || 31;
            const dueDay = parseInt(conta.dueDay) || 10;

            // Define a que Fatura base pertence a compra
            let invMes = txMes + (txDia >= closingDay ? 2 : 1);
            let invAno = txAno;
            while (invMes > 11) { invMes -= 12; invAno++; }
            
            const diff = (anoRef - invAno) * 12 + (mesRef - invMes);

            let belongsToCurrent = false;
            let belongsToNext = false;
            let parcelaFinal = tx.currentInstallment;

            if (tx.recurrence === 'none') {
                if (diff === 0) belongsToCurrent = true;
                if (diff === -1) belongsToNext = true; // Cai no mês que vem, avisa o utilizador!
            } else if (tx.recurrence === 'fixed') {
                if (diff >= 0) belongsToCurrent = true;
                if (diff === -1) belongsToNext = true;
            } else if (tx.recurrence === 'installments') {
                const totalInst = parseInt(tx.installmentsTotal, 10) || 1;
                const startInst = parseInt(tx.currentInstallment, 10) || 1;
                if (diff >= 0 && (startInst + diff) <= totalInst) {
                    belongsToCurrent = true; parcelaFinal = startInst + diff;
                }
                if (diff === -1 && (startInst <= totalInst)) {
                    belongsToNext = true; // O utilizador criou hoje e vai ser cobrado mês que vem
                }
            }

            if (belongsToCurrent || belongsToNext) {
                let txFinal = { ...tx, isProjection: true, isCreditInvoice: true, launchDate: `${anoRef}-${String(mesRef + 1).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`, currentInstallment: parcelaFinal };
                if (txFinal.splitParticipants) txFinal.splitParticipants = txFinal.splitParticipants.map(p => ({...p, status: 'pending'}));
                txFinal.status = 'pending';

                if (tx.overrides && tx.overrides[keyMesAtual]) {
                    if (tx.overrides[keyMesAtual].deleted) return; 
                    txFinal = { ...txFinal, ...tx.overrides[keyMesAtual] }; 
                }

                // Agrupa na Fatura Fechada (Pode Pagar) ou na Fatura Aberta (Apenas Visualização)
                const dicionarioAlvo = belongsToCurrent ? faturasFechadas : faturasAbertas;
                
                if (!dicionarioAlvo[txFinal.accountId]) {
                    dicionarioAlvo[txFinal.accountId] = {
                        accountId: txFinal.accountId, accountName: conta.name || tx.accountName || 'Cartão',
                        dueDay, totalAmount: 0, paidAmount: 0, txsPendentes: [], txsPagas: []
                    };
                }

                const myPart = txFinal.splitParticipants ? txFinal.splitParticipants.find(p => p.email === user.email) : null;
                const meuValor = myPart ? myPart.amount : txFinal.amount;
                const myStatus = myPart ? myPart.status : (txFinal.status || 'pending');

                if (txFinal.type === 'expense') dicionarioAlvo[txFinal.accountId].totalAmount += meuValor;
                else dicionarioAlvo[txFinal.accountId].totalAmount -= meuValor;

                if (myStatus === 'paid' || myStatus === 'accepted') {
                    if (txFinal.type === 'expense') dicionarioAlvo[txFinal.accountId].paidAmount += meuValor;
                    else dicionarioAlvo[txFinal.accountId].paidAmount -= meuValor;
                    dicionarioAlvo[txFinal.accountId].txsPagas.push(txFinal);
                } else dicionarioAlvo[txFinal.accountId].txsPendentes.push(txFinal);
            }
        } else {
            // Conta Normal
            const mesesDiff = (anoRef - txAno) * 12 + (mesRef - txMes);
            if (mesesDiff < 0) return;

            let isProjection = false; let launchDateFinal = tx.launchDate; let parcelaFinal = tx.currentInstallment;
            if (mesesDiff === 0) isProjection = false;
            else if (mesesDiff > 0) {
                if (tx.recurrence === 'fixed') { isProjection = true; launchDateFinal = `${keyMesAtual}-${txDiaStr}`; }
                else if (tx.recurrence === 'installments') {
                    const totalInst = parseInt(tx.installmentsTotal, 10) || 1;
                    const startInst = parseInt(tx.currentInstallment, 10) || 1;
                    if ((startInst + mesesDiff) <= totalInst) { isProjection = true; launchDateFinal = `${keyMesAtual}-${txDiaStr}`; parcelaFinal = startInst + mesesDiff; }
                    else return; 
                } else return; 
            }

            let txFinal = { ...tx, isProjection, launchDate: launchDateFinal, currentInstallment: parcelaFinal };
            if (isProjection) {
                txFinal.status = 'pending';
                if (txFinal.splitParticipants) txFinal.splitParticipants = txFinal.splitParticipants.map(p => ({...p, status: 'pending'}));
            }
            if (tx.overrides && tx.overrides[keyMesAtual]) {
                if (tx.overrides[keyMesAtual].deleted) return; 
                txFinal = { ...txFinal, ...tx.overrides[keyMesAtual] }; 
            }
            projetados.push(txFinal);
        }
    });

    window.faturasFechadasGlobais = faturasFechadas;

    // Gerar Linha da Fatura Deste Mês
    Object.values(faturasFechadas).forEach(f => {
        if (f.totalAmount > 0) {
            projetados.push({
                isVirtualInvoice: true, isCurrentInvoice: true, id: 'fat_' + f.accountId, accountId: f.accountId, accountName: f.accountName,
                description: `Fatura Cartão ${f.accountName}`, amount: f.totalAmount, paidAmount: f.paidAmount, pendingAmount: f.totalAmount - f.paidAmount,
                txsPendentes: f.txsPendentes, txsPagas: f.txsPagas, type: 'expense', launchDate: `${anoRef}-${String(mesRef+1).padStart(2,'0')}-${String(f.dueDay).padStart(2,'0')}`,
                status: (f.totalAmount - f.paidAmount) <= 0 ? 'paid' : 'pending', category: 'Cartão de Crédito', categoryIcon: '💳', categoryColor: '#a855f7', accountType: 'credit'
            });
        }
    });

    // Gerar Linha Fantasma da Fatura do Próximo Mês (O que evita o pânico do utilizador!)
    Object.values(faturasAbertas).forEach(f => {
        if (f.totalAmount > 0) {
            projetados.push({
                isVirtualInvoice: true, isCurrentInvoice: false, id: 'fat_next_' + f.accountId, accountId: f.accountId, accountName: f.accountName,
                description: `Fatura em Aberto (Próx. Mês)`, amount: f.totalAmount, type: 'expense', launchDate: `${anoRef}-${String(mesRef+1).padStart(2,'0')}-31`, // Ultimo dia do mes para ficar no fim da lista
                status: 'pending', category: 'Cartão de Crédito', categoryIcon: '💳', categoryColor: '#64748b', accountType: 'credit'
            });
        }
    });

    return projetados;
}

function processarDadosTabela(todasTransacoes) {
    const user = auth.currentUser;
    const containerLista = document.getElementById('lista-lancamentos');
    const cardsTotais = document.getElementById('cards-totais');
    containerLista.innerHTML = '';

    const transacoesDoMes = projetarLancamentosDoMes(todasTransacoes, dataReferenciaAtual, user);

    let recEfetivado = 0, recPrevisto = 0, despEfetivado = 0, despPrevisto = 0, despVencido = 0;
    const hojeRealStr = new Date().toISOString().split('T')[0];

    let transacoesFiltradas = transacoesDoMes.filter(tx => {
        const myPart = tx.splitParticipants ? tx.splitParticipants.find(p => p.email === user.email) : null;
        const meuValor = myPart ? myPart.amount : tx.amount;
        const status = myPart ? myPart.status : (tx.status || 'pending');
        const isVencido = (!tx.isProjection && !tx.isVirtualInvoice && tx.launchDate < hojeRealStr && status !== 'paid' && status !== 'accepted');

        // Ignora a linha fantasma (Fatura em Aberto) da contabilidade do mês atual
        if (!tx.isVirtualInvoice || tx.isCurrentInvoice) {
            if (tx.type === 'income') {
                recPrevisto += meuValor;
                if (status === 'paid' || status === 'accepted') recEfetivado += meuValor;
            } else {
                despPrevisto += meuValor;
                if (status === 'paid' || status === 'accepted') despEfetivado += meuValor;
                else if (isVencido) despVencido += meuValor;
            }
        }

        if (currentFilter === 'income') return tx.type === 'income';
        if (currentFilter === 'expense') return tx.type === 'expense';
        if (currentFilter === 'pending') return (status !== 'paid' && status !== 'accepted');
        return true; 
    });

    transacoesFiltradas.sort((a, b) => new Date(b.launchDate) - new Date(a.launchDate));

    if (transacoesFiltradas.length === 0) {
        containerLista.innerHTML = `<div class="text-center p-8 text-slate-500 font-medium">Nenhum lançamento para este mês.</div>`;
    } else {
        transacoesFiltradas.forEach(tx => {
            const meuValor = tx.amount;
            const isIncome = tx.type === 'income';
            let status = tx.status || 'pending';
            let isVencido = (tx.launchDate < hojeRealStr && status !== 'paid' && status !== 'accepted');
            
            const accIcon = tx.accountType === 'credit' ? '💳' : '🏦';
            const accColor = tx.accountType === 'credit' ? 'text-purple-400' : 'text-slate-400';
            let metaHTML = `<span class="flex items-center gap-1"><i class="text-sm ${accColor}">${accIcon}</i> <span class="text-slate-400">${tx.accountName || 'Conta'}</span></span>`;

            let statusBadge = ''; let cardClass = ''; let tagsDescricao = ''; let acoesHTML = '';

            // RENDERIZAÇÃO DA FATURA CONSOLIDADA
            if (tx.isVirtualInvoice) {
                if (tx.isCurrentInvoice) {
                    if (status === 'paid') {
                        statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400 flex items-center w-max"><i class="ph-fill ph-check-circle mr-1"></i> Fatura Paga</span>`;
                        cardClass = 'opacity-70 border-solid border-purple-500/20';
                    } else {
                        statusBadge = `<button class="btn-quick-efetivar-fatura px-3 py-1 rounded-full text-[10px] font-bold bg-purple-600 text-white hover:bg-purple-500 transition-colors border border-purple-400 shadow-md w-max flex items-center" data-acc="${tx.accountId}"><i class="ph-fill ph-file-text mr-1"></i> Pagar Fatura Total</button>`;
                        cardClass = 'bg-purple-900/10 border-dashed border-purple-500/30 hover:border-purple-500/50';
                    }
                    tagsDescricao = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-400 uppercase border border-purple-500/20 mt-1 sm:mt-0">${tx.txsPendentes.length + tx.txsPagas.length} Compras</span>`;
                } else {
                    // FATURA EM ABERTO (GHOST ROW PARA O UTILIZADOR NÃO ENTRAR EM PÂNICO)
                    statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 flex items-center w-max"><i class="ph-fill ph-lock-key mr-1"></i> Acumulando...</span>`;
                    cardClass = 'opacity-50 grayscale border-dashed';
                }
                acoesHTML = `<span class="text-[10px] text-slate-500 font-bold uppercase mr-4">Abrir Cartão p/ Detalhes</span>`;
            } else {
                // Conta Bancária Normal
                if (status === 'paid' || status === 'accepted') {
                    statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 flex items-center w-max"><i class="ph-fill ph-check-circle mr-1"></i> Efetivado</span>`;
                    cardClass = 'opacity-70 hover:opacity-100 border-solid';
                } else if (tx.isProjection) {
                    statusBadge = `<button class="btn-quick-efetivar px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 flex items-center w-max border border-indigo-500/20 hover:bg-indigo-500 hover:text-white transition-colors cursor-pointer" data-id="${tx.id}" data-projdate="${tx.launchDate}"><i class="ph-fill ph-calendar-blank mr-1"></i> Projetado (Efetivar)</button>`;
                    cardClass = 'opacity-80 border-dashed border-darkborder hover:border-indigo-500/30';
                } else if (isVencido) {
                    statusBadge = `<button class="btn-quick-efetivar px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 flex items-center w-max hover:bg-rose-500 hover:text-white transition-colors cursor-pointer border border-rose-500/30" data-id="${tx.id}"><i class="ph-fill ph-warning-circle mr-1"></i> Vencido (Efetivar)</button>`;
                    cardClass = 'bg-rose-500/5 hover:bg-rose-500/10 border-solid';
                } else {
                    statusBadge = `<button class="btn-quick-efetivar px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-500 flex items-center w-max hover:bg-amber-500 hover:text-white transition-colors cursor-pointer border border-amber-500/30" data-id="${tx.id}"><i class="ph-fill ph-clock mr-1"></i> Pendente (Efetivar)</button>`;
                    cardClass = 'border-solid';
                }

                if (tx.splitParticipants && tx.splitParticipants.length > 1) tagsDescricao += `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-400 uppercase border border-indigo-500/20 mt-1 sm:mt-0">Rateio</span> `;
                if (tx.installmentsTotal > 1) tagsDescricao += `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-700 text-slate-300 uppercase border border-slate-600 mt-1 sm:mt-0">${tx.currentInstallment}/${tx.installmentsTotal}</span>`;
                if (tx.recurrence === 'fixed') tagsDescricao += `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-700 text-slate-300 uppercase border border-slate-600 mt-1 sm:mt-0"><i class="ph ph-arrows-clockwise"></i> Fixo</span>`;

                acoesHTML = `
                    <button class="btn-edit text-slate-500 hover:text-indigo-400" data-id="${tx.id}" data-isproj="${tx.isProjection}" data-projdate="${tx.launchDate}"><i class="ph ph-pencil-simple text-lg pointer-events-none"></i></button>
                    <button class="btn-delete text-slate-500 hover:text-rose-400" data-id="${tx.id}" data-isproj="${tx.isProjection}" data-projdate="${tx.launchDate}"><i class="ph ph-trash text-lg pointer-events-none"></i></button>
                `;
            }

            containerLista.innerHTML += `
                <div class="flex flex-col md:grid md:grid-cols-12 md:gap-4 md:items-center p-4 border-b border-darkborder hover:bg-slate-800/50 transition-colors group ${cardClass}">
                    <div class="flex justify-between items-start md:items-center mb-3 md:mb-0 md:col-span-2">
                        ${statusBadge}
                        <div class="flex space-x-3 md:hidden">${acoesHTML}</div>
                    </div>
                    <div class="text-[11px] md:text-sm text-slate-400 md:text-slate-300 mb-2 md:mb-0 md:col-span-2">
                        <span class="md:hidden font-bold uppercase mr-1">Data:</span>${tx.launchDate.split('-').reverse().join('/')}
                    </div>
                    <div class="mb-3 md:mb-0 md:col-span-3">
                        <div class="flex flex-col sm:flex-row sm:items-center sm:gap-2 mb-1.5">
                            <p class="text-sm font-bold ${tx.isVirtualInvoice && tx.isCurrentInvoice ? 'text-purple-400' : 'text-white'} leading-tight">${tx.description}</p>
                            <div class="flex gap-1">${tagsDescricao}</div>
                        </div>
                        <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">${metaHTML}</div>
                    </div>
                    <div class="flex justify-between items-end md:contents">
                        <div class="md:col-span-2">
                            <span class="px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center w-max border" style="background-color: ${tx.categoryColor || '#64748b'}15; color: ${tx.categoryColor || '#64748b'}; border-color: ${tx.categoryColor || '#64748b'}30;">
                                <span class="mr-1.5 text-[12px] leading-none">${tx.categoryIcon || '📌'}</span> ${tx.category || 'Outros'}
                            </span>
                        </div>
                        <div class="text-right md:col-span-2">
                            <p class="text-sm font-bold ${(tx.isVirtualInvoice && tx.isCurrentInvoice) ? 'text-purple-400' : (tx.isVirtualInvoice ? 'text-slate-500' : (isIncome ? 'text-emerald-500' : 'text-rose-500'))}">${isIncome?'+':'-'} R$ ${meuValor.toFixed(2)}</p>
                        </div>
                    </div>
                    <div class="hidden md:flex justify-end items-center space-x-3 md:col-span-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        ${acoesHTML}
                    </div>
                </div>
            `;
        });
    }

    // EVENTOS DE CLIQUE DOS BOTÕES (INCLUINDO A FATURA GLOBAL CORRIGIDA)
    
    document.querySelectorAll('.btn-quick-efetivar').forEach(btn => btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const projdate = e.currentTarget.dataset.projdate || ''; 
        const txOriginal = todasTransacoes.find(t => t.id === id);
        
        document.getElementById('efetivar-id').value = id;
        document.getElementById('efetivar-proj-date').value = projdate; 
        document.getElementById('efetivar-data').value = projdate ? projdate : hojeRealStr; 
        
        document.getElementById('modal-efetivar-title').innerText = txOriginal.type === 'income' ? 'Confirmar Recebimento' : 'Confirmar Pagamento';
        document.getElementById('modal-efetivar').classList.remove('hidden');
    }));

    // NOVO: Evento para abrir o Modal de Pagamento da Fatura Global 
    document.querySelectorAll('.btn-quick-efetivar-fatura').forEach(btn => btn.addEventListener('click', async (e) => {
        const accId = e.currentTarget.dataset.acc;
        const fatura = window.faturasFechadasGlobais[accId];
        
        const qContas = query(collection(db, 'accounts'), where('userId', '==', user.uid), where('type', '!=', 'credit'));
        const snapContas = await getDocs(qContas);
        const selectAcc = document.getElementById('fatura-global-conta-debito');
        selectAcc.innerHTML = '';
        
        if (snapContas.empty) return alert("Precisa cadastrar uma Conta Corrente ou Carteira para pagar a fatura!");
        
        snapContas.forEach(docSnap => {
            selectAcc.innerHTML += `<option value="${docSnap.id}">🏦 ${docSnap.data().name}</option>`;
        });

        document.getElementById('fatura-global-acc-id').value = accId;
        document.getElementById('fatura-global-qtd').innerText = fatura.txsPendentes.length;
        document.getElementById('fatura-global-valor').innerText = `R$ ${fatura.pendingAmount.toFixed(2)}`;
        document.getElementById('fatura-global-data').valueAsDate = new Date();
        
        document.getElementById('modal-pagar-fatura-global').classList.remove('hidden');
    }));

    document.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', (e) => {
        const btnData = e.currentTarget.dataset;
        const tx = todasTransacoes.find(t => t.id === btnData.id);
        if (!tx) return;
        if ((tx.recurrence === 'fixed' || tx.recurrence === 'installments') && btnData.isproj === 'true') {
            abrirModalEscolhaRecorrencia('editar', tx, btnData.projdate);
        } else abrirModalTransacao('editar', tx);
    }));

    document.querySelectorAll('.btn-delete').forEach(btn => btn.addEventListener('click', (e) => {
        const btnData = e.currentTarget.dataset;
        const tx = todasTransacoes.find(t => t.id === btnData.id);
        if (!tx) return;
        if ((tx.recurrence === 'fixed' || tx.recurrence === 'installments') && btnData.isproj === 'true') {
            abrirModalEscolhaRecorrencia('apagar', tx, btnData.projdate);
        } else if (confirm('Tem a certeza que deseja excluir?')) deleteDoc(doc(db, 'transactions', tx.id));
    }));

    // Renderiza Totais
    const saldoAtual = recEfetivado - despEfetivado;
    const saldoProjetado = recPrevisto - despPrevisto;
    cardsTotais.innerHTML = `
        <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex flex-col justify-between shadow-sm">
            <div class="flex justify-between items-start mb-3"><p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Receitas</p><div class="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-lg"><i class="ph-fill ph-trend-up"></i></div></div>
            <div><p class="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Efetivado (Atual)</p><p class="text-2xl font-bold text-emerald-500 mb-2">R$ ${recEfetivado.toFixed(2)}</p>
                <div class="flex justify-between items-center text-xs font-medium border-t border-slate-700/50 pt-2.5 mt-1"><span class="text-slate-400">Total Previsto</span><span class="text-emerald-400/70 font-bold">R$ ${recPrevisto.toFixed(2)}</span></div>
            </div>
        </div>
        <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex flex-col justify-between shadow-sm">
            <div class="flex justify-between items-start mb-3"><p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Despesas</p><div class="w-8 h-8 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center text-lg"><i class="ph-fill ph-trend-down"></i></div></div>
            <div><p class="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Efetivado (Pago)</p><p class="text-2xl font-bold text-white mb-2">- R$ ${despEfetivado.toFixed(2)}</p>
                <div class="flex justify-between items-center text-[11px] font-medium border-t border-slate-700/50 pt-2.5 mt-1">
                    ${despVencido > 0 ? `<span class="text-slate-400 flex items-center"><i class="ph-fill ph-warning-circle text-rose-500 mr-1"></i> Vencido: <strong class="text-rose-400 ml-1"> R$ ${despVencido.toFixed(2)}</strong></span>` : `<span class="text-slate-400">Em dia</span>`}
                    <span class="text-slate-400">Previsto: <strong class="text-slate-200">R$ ${despPrevisto.toFixed(2)}</strong></span>
                </div>
            </div>
        </div>
        <div class="bg-indigo-600/10 border border-indigo-500/30 p-5 rounded-2xl flex flex-col justify-between shadow-sm">
            <div class="flex justify-between items-start mb-3"><p class="text-xs font-bold text-indigo-300 uppercase tracking-wider">Saldo Líquido</p><div class="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-lg"><i class="ph-fill ph-wallet"></i></div></div>
            <div><p class="text-[10px] text-indigo-300/70 font-bold uppercase mb-0.5">Atual (Real)</p><p class="text-2xl font-bold text-indigo-400 mb-2">R$ ${saldoAtual.toFixed(2)}</p>
                <div class="flex justify-between items-center text-xs font-medium border-t border-indigo-500/20 pt-2.5 mt-1"><span class="text-indigo-300/70">Projetado</span><span class="text-indigo-300 font-bold">R$ ${saldoProjetado.toFixed(2)}</span></div>
            </div>
        </div>
    `;
}

// LÓGICA DO MODAL DE ESCOLHA DE RECORRÊNCIA MANTIDA
export function limparListenerLancamentosGlobal() {} 
function abrirModalEscolhaRecorrencia(acao, txOriginal, projDate = null) {
    const modal = document.getElementById('modal-recorrencia'); modal.classList.remove('hidden');
    const btnSingle = document.getElementById('btn-rec-single'); const btnForward = document.getElementById('btn-rec-forward'); const btnAll = document.getElementById('btn-rec-all');
    const novoBtnSingle = btnSingle.cloneNode(true); btnSingle.replaceWith(novoBtnSingle);
    const novoBtnForward = btnForward.cloneNode(true); btnForward.replaceWith(novoBtnForward);
    const novoBtnAll = btnAll.cloneNode(true); btnAll.replaceWith(novoBtnAll);
    document.getElementById('btn-cancel-rec').onclick = () => modal.classList.add('hidden');

    const keyMes = projDate ? projDate.substring(0, 7) : txOriginal.launchDate.substring(0, 7);

    novoBtnSingle.addEventListener('click', async () => {
        modal.classList.add('hidden');
        if (acao === 'apagar') {
            const overrides = txOriginal.overrides || {}; overrides[keyMes] = { deleted: true };
            await updateDoc(doc(db, 'transactions', txOriginal.id), { overrides });
        } else abrirModalTransacao('editar', { ...txOriginal, launchDate: projDate || txOriginal.launchDate, isOverrideMode: true, overrideKey: keyMes });
    });
    novoBtnForward.addEventListener('click', async () => {
        modal.classList.add('hidden');
        const dataAnterior = new Date(`${keyMes}-01T12:00:00`); dataAnterior.setMonth(dataAnterior.getMonth() - 1);
        const endKey = `${dataAnterior.getFullYear()}-${String(dataAnterior.getMonth() + 1).padStart(2, '0')}`;
        if (acao === 'apagar') await updateDoc(doc(db, 'transactions', txOriginal.id), { endDate: endKey });
        else { await updateDoc(doc(db, 'transactions', txOriginal.id), { endDate: endKey }); abrirModalTransacao('criar', { ...txOriginal, id: null, launchDate: projDate || txOriginal.launchDate }); }
    });
    novoBtnAll.addEventListener('click', async () => {
        modal.classList.add('hidden');
        if (acao === 'apagar') await deleteDoc(doc(db, 'transactions', txOriginal.id));
        else abrirModalTransacao('editar', txOriginal); 
    });
}