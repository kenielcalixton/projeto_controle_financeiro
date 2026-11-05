// js/components/transactions.js
import { auth, db } from '../config/firebase.js';
import { collection, query, where, onSnapshot, doc, deleteDoc, getDoc, updateDoc, getDocs, addDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { abrirModalTransacao, abrirDetalheTransacao, excluirTransacaoUniversal, recusarTransacaoPartilhada } from './transactionModal.js';
import { abrirDetalheConta } from './accountDetails.js';

let unsubscribeTransactions = null;
let unsubscribeAccounts = null;
let currentFilter = 'all'; 
let dataReferenciaAtual = new Date(); 

window.faturasFechadasGlobais = {}; 

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
            
            <div id="modal-efetivar" class="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4 hidden animate-fade-in">
                <form id="form-efetivar" class="bg-darkcard w-full max-w-sm rounded-3xl p-6 border border-darkborder shadow-2xl flex flex-col">
                    <div class="flex justify-between items-center mb-4">
                        <h2 id="modal-efetivar-title" class="text-lg font-bold text-white">Confirmar</h2>
                        <button type="button" id="btn-close-efetivar" class="text-slate-400 hover:text-rose-500"><i class="ph ph-x text-xl"></i></button>
                    </div>
                    <p class="text-sm text-slate-400 mb-4" id="efetivar-desc">Confirme a data de efetivação.</p>
                    <input type="hidden" id="efetivar-id" />
                    <input type="hidden" id="efetivar-proj-date" />
                    <input type="hidden" id="efetivar-req-conta" />
                    
                    <div id="efetivar-box-conta" class="mb-4 hidden">
                        <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Recebido/Pago em qual conta?</label>
                        <select id="efetivar-conta" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"></select>
                    </div>

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

            <div id="modal-pagar-fatura-global" class="fixed inset-0 bg-black/90 z-[120] flex items-center justify-center p-4 hidden animate-fade-in">
                <form id="form-pagar-fatura-global" class="bg-darkcard w-full max-w-sm rounded-3xl p-6 border border-darkborder shadow-2xl flex flex-col">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-lg font-bold text-white">Efetuar Pagamento</h2>
                        <button type="button" id="btn-close-fatura-global" class="text-slate-400 hover:text-rose-500"><i class="ph ph-x text-xl"></i></button>
                    </div>
                    <p class="text-sm text-slate-400 mb-5">Valor pendente da fatura: <strong id="fatura-global-valor-texto" class="text-purple-400">R$ 0,00</strong>.</p>
                    <div class="space-y-4">
                        <input type="hidden" id="fatura-global-acc-id" />
                        <div>
                            <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Valor a Pagar (R$)</label>
                            <input type="number" id="fatura-global-valor-pago" step="0.01" required class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-2xl font-bold text-white focus:outline-none focus:border-purple-500" />
                        </div>
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
                        <button type="submit" id="btn-submit-fatura-global" class="px-4 py-2 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500 shadow-lg shadow-purple-500/30 transition-colors">Confirmar</button>
                    </div>
                </form>
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

    const modalEfetivar = document.getElementById('modal-efetivar');
    const fecharModalEfetivar = () => modalEfetivar.classList.add('hidden');
    document.getElementById('btn-close-efetivar').addEventListener('click', fecharModalEfetivar);
    document.getElementById('btn-cancel-efetivar').addEventListener('click', fecharModalEfetivar);

    document.getElementById('form-efetivar').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSave = document.getElementById('btn-save-efetivar');
        btnSave.disabled = true; btnSave.innerText = 'Processando...';
        try {
            const id = document.getElementById('efetivar-id').value;
            const dataPagamento = document.getElementById('efetivar-data').value;
            const projDate = document.getElementById('efetivar-proj-date').value;
            const reqConta = document.getElementById('efetivar-req-conta').value;
            
            const docRef = doc(db, 'transactions', id);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const txData = docSnap.data();
                let payload = { status: 'paid', paymentDate: dataPagamento };
                
                if (reqConta === 'true') {
                    const selectedAccId = document.getElementById('efetivar-conta').value;
                    const accObj = window.contasGlobaisTransactions.find(c => c.id === selectedAccId);
                    if (accObj) {
                        payload.accountId = accObj.id;
                        payload.accountName = accObj.name;
                        payload.accountType = accObj.type;
                    }
                }

                if (projDate) {
                    const overrides = txData.overrides || {};
                    const keyMes = projDate.substring(0, 7); 
                    overrides[keyMes] = { ...overrides[keyMes], ...payload };
                    await updateDoc(docRef, { overrides });
                } else {
                    let guestIsPaying = false;
                    let meuValor = 0;

                    if (txData.splitParticipants && txData.splitParticipants.length > 0) {
                        const updatedParticipants = txData.splitParticipants.map(p => {
                            if (p.email === user.email) {
                                // Se eu não for o criador, eu ESTOU A DECLARAR PAGAMENTO (e não a efetivar de vez)
                                if (p.email !== txData.creatorEmail && p.status !== 'paid' && p.status !== 'payment_declared') {
                                    guestIsPaying = true;
                                    meuValor = parseFloat(p.amount) || 0;
                                    return { ...p, status: 'payment_declared', paymentDate: dataPagamento };
                                }
                                return { ...p, ...payload };
                            }
                            return p;
                        });
                        
                        if (guestIsPaying) {
                            const newMsg = { sender: 'SYSTEM', text: `${user.email.split('@')[0]} declarou que efetuou o pagamento. Aguardando validação do criador.`, type: 'system', time: new Date().toISOString() };
                            await updateDoc(docRef, { splitParticipants: updatedParticipants, messages: arrayUnion(newMsg) });
                        } else {
                            payload.splitParticipants = updatedParticipants;
                            await updateDoc(docRef, payload);
                        }
                    } else {
                        await updateDoc(docRef, payload);
                    }
                }
            }
            fecharModalEfetivar();
        } catch (error) { console.error(error); alert("Erro ao efetivar."); } 
        finally { btnSave.disabled = false; btnSave.innerText = 'Confirmar'; }
    });

    const modalFaturaGlobal = document.getElementById('modal-pagar-fatura-global');
    const fecharFaturaGlobal = () => modalFaturaGlobal.classList.add('hidden');
    document.getElementById('btn-close-fatura-global').addEventListener('click', fecharFaturaGlobal);
    document.getElementById('btn-cancel-fatura-global').addEventListener('click', fecharFaturaGlobal);
    document.getElementById('form-pagar-fatura-global').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSubmit = document.getElementById('btn-submit-fatura-global');
        btnSubmit.disabled = true; btnSubmit.innerText = 'Processando...';

        try {
            const valorPago = parseFloat(document.getElementById('fatura-global-valor-pago').value);
            const dataPagamento = document.getElementById('fatura-global-data').value;
            const selectAcc = document.getElementById('fatura-global-conta-debito');
            const contaDebitoId = selectAcc.value;
            const nomeContaDebito = selectAcc.options[selectAcc.selectedIndex].text.replace(/^[🏦]\s*/, '');
            const accId = document.getElementById('fatura-global-acc-id').value;
            const fatura = window.faturasFechadasGlobais[accId];
            const valorPendente = Math.max(0, fatura.totalAmount - fatura.paidAmount);
            const linkedPaymentId = 'pay_' + new Date().getTime();
            
            await addDoc(collection(db, 'transactions'), {
                creatorId: user.uid, creatorEmail: user.email, type: 'expense',
                description: 'Pagamento de Fatura', amount: valorPago,
                category: 'Pagamento de Fatura', categoryIcon: '💳', categoryColor: '#a855f7',
                accountId: contaDebitoId, accountType: 'wallet', accountName: nomeContaDebito,
                launchDate: dataPagamento, status: 'paid', splitType: 'ind', recurrence: 'none',
                participantEmails: [user.email], splitParticipants: [{email: user.email, amount: valorPago, status: 'paid'}],
                linkedPaymentId: linkedPaymentId,
                createdAt: new Date().toISOString()
            });

            const isTotal = valorPago >= (valorPendente - 0.01);
            const launchDateFatura = `${dataReferenciaAtual.getFullYear()}-${String(dataReferenciaAtual.getMonth()+1).padStart(2,'0')}-${String(fatura.dueDay||10).padStart(2,'0')}`;

            await addDoc(collection(db, 'transactions'), {
                creatorId: user.uid, creatorEmail: user.email, type: 'income',
                description: isTotal ? 'Pagamento Total da Fatura' : 'Pagamento Parcial da Fatura', amount: valorPago,
                category: 'Pagamento de Fatura', categoryIcon: '💳', categoryColor: '#a855f7',
                accountId: fatura.accountId, accountType: 'credit', accountName: fatura.accountName,
                launchDate: launchDateFatura, status: 'paid', splitType: 'ind', recurrence: 'none',
                participantEmails: [user.email], splitParticipants: [{email: user.email, amount: valorPago, status: 'paid'}],
                linkedPaymentId: linkedPaymentId,
                createdAt: new Date().toISOString()
            });

            const keyMes = `${dataReferenciaAtual.getFullYear()}-${String(dataReferenciaAtual.getMonth() + 1).padStart(2, '0')}`;
            const promises = fatura.txsPendentes.map(async (tx) => {
                const docRef = doc(db, 'transactions', tx.id);
                const payload = { status: 'paid', paymentDate: dataPagamento };
                if (tx.isProjection || tx.isCreditInvoice) {
                    const overrides = tx.overrides || {};
                    overrides[keyMes] = { ...overrides[keyMes], ...payload };
                    return updateDoc(docRef, { overrides });
                } else return updateDoc(docRef, payload);
            });
            await Promise.all(promises);

            fecharFaturaGlobal();
        } catch (error) { console.error(error); alert("Erro ao pagar a fatura."); } 
        finally { btnSubmit.disabled = false; btnSubmit.innerText = 'Confirmar'; }
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
    const refAbsolute = anoRef * 12 + mesRef;
    
    let projetados = [];
    let faturasFechadas = {};
    let faturasAbertas = {};
    let ccSaldosAnteriores = {}; 

    transacoes.forEach(tx => {
        if (!tx.launchDate) return;
        const [txAnoStr, txMesStr, txDiaStr] = tx.launchDate.split('-');
        const txAno = parseInt(txAnoStr, 10);
        const txMes = parseInt(txMesStr, 10) - 1; 
        const txDia = parseInt(txDiaStr, 10);
        
        const myPart = tx.splitParticipants ? tx.splitParticipants.find(p => p.email === user.email) : null;
        const meuValorCalculado = myPart ? parseFloat(myPart.amount) : parseFloat(tx.amount) || 0;

        if (tx.accountType === 'credit') {
            const conta = window.contasGlobaisTransactions?.find(c => c.id === tx.accountId) || {};
            const closingDay = parseInt(conta.closingDay) || 31;
            const dueDay = parseInt(conta.dueDay) || 10;

            let invMes = txMes;
            let invAno = txAno;
            
            if (tx.type !== 'income' || tx.category !== 'Pagamento de Fatura') {
                invMes = txMes + (txDia >= closingDay ? 2 : 1);
                while (invMes > 11) { invMes -= 12; invAno++; }
            }

            const invAbsolute = invAno * 12 + invMes;
            const diff = invAbsolute - refAbsolute;

            if (invAbsolute < refAbsolute) {
                if (tx.type === 'expense') ccSaldosAnteriores[tx.accountId] = (ccSaldosAnteriores[tx.accountId] || 0) + meuValorCalculado;
                else ccSaldosAnteriores[tx.accountId] = (ccSaldosAnteriores[tx.accountId] || 0) - meuValorCalculado;
            }

            let belongsToCurrent = false; let belongsToNext = false; 

            if (tx.recurrence === 'none') {
                if (diff === 0) belongsToCurrent = true;
                if (diff === 1) belongsToNext = true; 
            } else if (tx.recurrence === 'fixed') {
                if (diff <= 0) belongsToCurrent = true;
                if (diff === 1) belongsToNext = true;
            }

            if (belongsToCurrent || belongsToNext) {
                const dicionarioAlvo = belongsToCurrent ? faturasFechadas : faturasAbertas;
                if (!dicionarioAlvo[tx.accountId]) {
                    dicionarioAlvo[tx.accountId] = { accountId: tx.accountId, accountName: conta.name || tx.accountName || 'Cartão', dueDay, totalAmount: 0, paidAmount: 0, txsPendentes: [] };
                }
                if (tx.type === 'expense') {
                    dicionarioAlvo[tx.accountId].totalAmount += meuValorCalculado;
                    if (tx.status !== 'paid' && tx.status !== 'accepted') dicionarioAlvo[tx.accountId].txsPendentes.push(tx);
                }
                else dicionarioAlvo[tx.accountId].paidAmount += meuValorCalculado;
            }
        } else {
            const txAbsolute = txAno * 12 + txMes;
            if (txAbsolute < refAbsolute) return;
            if (txAbsolute === refAbsolute) projetados.push({...tx, isProjection: false});
        }
    });

    Object.keys(ccSaldosAnteriores).forEach(accId => {
        if (ccSaldosAnteriores[accId] > 0.01) {
            if (!faturasFechadas[accId]) {
                const conta = window.contasGlobaisTransactions?.find(c => c.id === accId) || {};
                faturasFechadas[accId] = { accountId: accId, accountName: conta.name || 'Cartão', dueDay: conta.dueDay || 10, totalAmount: 0, paidAmount: 0, txsPendentes: [] };
            }
            faturasFechadas[accId].totalAmount += ccSaldosAnteriores[accId];
        }
    });

    window.faturasFechadasGlobais = faturasFechadas;

    Object.values(faturasFechadas).forEach(f => {
        if (f.totalAmount > 0.01) {
            projetados.push({
                isVirtualInvoice: true, isCurrentInvoice: true, id: 'fat_' + f.accountId, accountId: f.accountId, accountName: f.accountName,
                description: `Fatura ${f.accountName}`, amount: f.totalAmount, paidAmount: f.paidAmount, pendingAmount: f.totalAmount - f.paidAmount,
                type: 'expense', launchDate: `${anoRef}-${String(mesRef+1).padStart(2,'0')}-${String(f.dueDay).padStart(2,'0')}`,
                status: (f.totalAmount - f.paidAmount) <= 0.01 ? 'paid' : 'pending', category: 'Cartão de Crédito', categoryIcon: '💳', categoryColor: '#a855f7', accountType: 'credit'
            });
        }
    });
    Object.values(faturasAbertas).forEach(f => {
        if (f.totalAmount > 0.01) {
            projetados.push({
                isVirtualInvoice: true, isCurrentInvoice: false, id: 'fat_next_' + f.accountId, accountId: f.accountId, accountName: f.accountName,
                description: `Fatura em Aberto (Próx. Mês)`, amount: f.totalAmount, type: 'expense', launchDate: `${anoRef}-${String(mesRef+1).padStart(2,'0')}-31`, 
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
        const isCreator = !tx.creatorEmail || tx.creatorEmail === user.email;
        const myPart = tx.splitParticipants ? tx.splitParticipants.find(p => p.email === user.email) : null;
        const meuValorRaw = myPart ? parseFloat(myPart.amount) : parseFloat(tx.amount || 0);
        const meuValor = parseFloat(tx.isVirtualInvoice ? tx.pendingAmount : (meuValorRaw || 0)) || 0;
        
        const status = myPart ? myPart.status : (tx.status || 'pending');
        const isVencido = (!tx.isProjection && !tx.isVirtualInvoice && tx.launchDate < hojeRealStr && status !== 'paid' && status !== 'accepted' && status !== 'payment_declared');

        // REGRA DE OURO: Esconder rateios apenas se forem 'pending' originais ou 'contested'. Aceite/Rejeitado/Pagamento Declarado mostra na tabela!
        if (!tx.isVirtualInvoice && !isCreator && (status === 'pending' || status === 'contested')) {
            return false;
        }

        if (!tx.isVirtualInvoice || tx.isCurrentInvoice) {
            if (tx.type === 'income') {
                recPrevisto += meuValor;
                if (status === 'paid' || status === 'accepted' || status === 'payment_declared') recEfetivado += meuValor;
            } else {
                if (tx.isVirtualInvoice) {
                    despPrevisto += tx.pendingAmount; 
                } else {
                    despPrevisto += meuValor;
                    if (status === 'paid' || status === 'accepted' || status === 'payment_declared') despEfetivado += meuValor;
                    else if (isVencido) despVencido += meuValor;
                }
            }
        }
        if (currentFilter === 'income') return tx.type === 'income';
        if (currentFilter === 'expense') return tx.type === 'expense';
        if (currentFilter === 'pending') return (status !== 'paid' && status !== 'payment_declared');
        return true; 
    });

    transacoesFiltradas.sort((a, b) => new Date(b.launchDate) - new Date(a.launchDate));

    if (transacoesFiltradas.length === 0) {
        containerLista.innerHTML = `<div class="text-center p-8 text-slate-500 font-medium">Nenhum lançamento para este mês.</div>`;
    } else {
        transacoesFiltradas.forEach(tx => {
            const isCreator = !tx.creatorEmail || tx.creatorEmail === user.email;
            const myPart = tx.splitParticipants ? tx.splitParticipants.find(p => p.email === user.email) : null;
            const meuValorRaw = myPart ? parseFloat(myPart.amount) : parseFloat(tx.amount || 0);
            const meuValor = parseFloat(tx.isVirtualInvoice ? tx.pendingAmount : (meuValorRaw || 0)) || 0;
            const valorOriginal = parseFloat(tx.amount || 0);
            
            const isIncome = tx.type === 'income';
            let status = myPart ? myPart.status : (tx.status || 'pending');
            let isVencido = (tx.launchDate < hojeRealStr && status !== 'paid' && status !== 'accepted' && status !== 'payment_declared');
            const accIcon = tx.accountType === 'credit' ? '💳' : '🏦';
            const accColor = tx.accountType === 'credit' ? 'text-purple-400' : 'text-slate-400';
            
            const accNomeDisplay = tx.accountId ? (tx.accountName || 'Conta') : 'A Receber (Efetivar)';
            let metaHTML = `<span class="flex items-center gap-1"><i class="text-sm ${accColor}">${accIcon}</i> <span class="text-slate-400">${accNomeDisplay}</span></span>`;

            let statusBadge = ''; let cardClass = ''; let tagsDescricao = ''; let acoesHTML = '';

            if (tx.isVirtualInvoice) {
                if (tx.isCurrentInvoice) {
                    if (status === 'paid') {
                        statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400 flex items-center w-max"><i class="ph-fill ph-check-circle mr-1"></i> Fatura Paga</span>`;
                        cardClass = 'opacity-70 border-solid border-purple-500/20';
                    } else {
                        statusBadge = `<button class="btn-quick-efetivar-fatura px-3 py-1 rounded-full text-[10px] font-bold bg-purple-600 text-white hover:bg-purple-500 transition-colors border border-purple-400 shadow-md w-max flex items-center" data-acc="${tx.accountId}"><i class="ph-fill ph-file-text mr-1"></i> Pagar Fatura Total</button>`;
                        cardClass = 'bg-purple-900/10 border-dashed border-purple-500/30 hover:border-purple-500/50';
                    }
                } else {
                    statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 flex items-center w-max"><i class="ph-fill ph-lock-key mr-1"></i> Acumulando...</span>`;
                    cardClass = 'opacity-50 grayscale border-dashed';
                }
                acoesHTML = `<span class="text-[10px] text-slate-500 font-bold uppercase mr-4">Abrir Cartão p/ Detalhes</span>`;
            } else {
                if (status === 'paid') {
                    statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 flex items-center w-max"><i class="ph-fill ph-check-circle mr-1"></i> Efetivado</span>`;
                    cardClass = 'opacity-70 hover:opacity-100 border-solid';
                } else if (status === 'payment_declared') {
                    statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-400 flex items-center w-max"><i class="ph-fill ph-hourglass mr-1"></i> Em Validação</span>`;
                    cardClass = 'opacity-80 border-solid border-indigo-500/30';
                } else if (status === 'payment_rejected') {
                    // BOTÃO PARA EFETIVAR (TENTAR DE NOVO)
                    statusBadge = `<button class="btn-quick-efetivar px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 flex items-center w-max hover:bg-rose-500 hover:text-white transition-colors cursor-pointer border border-rose-500/30" data-id="${tx.id}"><i class="ph-fill ph-warning-circle mr-1"></i> Recusado (Tentar Novamente)</button>`;
                    cardClass = 'bg-rose-500/5 border-solid';
                } else if (isVencido) {
                    statusBadge = `<button class="btn-quick-efetivar px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 flex items-center w-max hover:bg-rose-500 hover:text-white transition-colors cursor-pointer border border-rose-500/30" data-id="${tx.id}"><i class="ph-fill ph-warning-circle mr-1"></i> Vencido</button>`;
                    cardClass = 'bg-rose-500/5 hover:bg-rose-500/10 border-solid';
                } else {
                    // STATUS = ACCEPTED ou PENDING NORMAL (PRONTO A PAGAR)
                    statusBadge = `<button class="btn-quick-efetivar px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-500 flex items-center w-max hover:bg-amber-500 hover:text-white transition-colors cursor-pointer border border-amber-500/30" data-id="${tx.id}"><i class="ph-fill ph-clock mr-1"></i> Pendente (Efetivar)</button>`;
                    cardClass = 'border-solid';
                }
                
                if (isCreator) {
                    acoesHTML = `
                        <button class="btn-edit text-slate-500 hover:text-indigo-400 p-2" data-id="${tx.id}"><i class="ph-fill ph-pencil-simple text-lg pointer-events-none"></i></button>
                        <button class="btn-delete-acc text-slate-500 hover:text-rose-400 p-2" data-id="${tx.id}"><i class="ph-fill ph-trash text-lg pointer-events-none"></i></button>
                    `;
                } else {
                    acoesHTML = `<button class="btn-reject-shared text-slate-500 hover:text-rose-400 p-2" data-id="${tx.id}" title="Recusar/Remover"><i class="ph-fill ph-trash text-lg pointer-events-none"></i></button>`;
                }
            }

            containerLista.innerHTML += `
                <div class="tx-row flex flex-col md:grid md:grid-cols-12 md:gap-4 md:items-center p-4 border-b border-darkborder hover:bg-slate-800/80 transition-colors group ${cardClass} cursor-pointer border border-transparent hover:border-slate-600" data-id="${tx.id}" data-isvirtual="${tx.isVirtualInvoice || false}" data-acc="${tx.accountId}">
                    <div class="flex justify-between items-start md:items-center mb-3 md:mb-0 md:col-span-2">
                        ${statusBadge}
                        <div class="flex space-x-3 md:hidden z-20">${acoesHTML}</div>
                    </div>
                    <div class="text-[11px] md:text-sm text-slate-400 md:text-slate-300 mb-2 md:mb-0 md:col-span-2 pointer-events-none">
                        <span class="md:hidden font-bold uppercase mr-1">Data:</span>${tx.launchDate.split('-').reverse().join('/')}
                    </div>
                    <div class="mb-3 md:mb-0 md:col-span-3 pointer-events-none">
                        <div class="flex flex-col sm:flex-row sm:items-center sm:gap-2 mb-1.5">
                            <p class="text-sm font-bold ${tx.isVirtualInvoice && tx.isCurrentInvoice ? 'text-purple-400' : 'text-white'} leading-tight">${tx.description}</p>
                        </div>
                        <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">${metaHTML}</div>
                    </div>
                    <div class="flex justify-between items-end md:contents pointer-events-none">
                        <div class="md:col-span-2">
                            <span class="px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center w-max border" style="background-color: ${tx.categoryColor || '#64748b'}15; color: ${tx.categoryColor || '#64748b'}; border-color: ${tx.categoryColor || '#64748b'}30;">
                                <span class="mr-1.5 text-[12px] leading-none">${tx.categoryIcon || '📌'}</span> ${tx.category || 'Outros'}
                            </span>
                        </div>
                        <div class="text-right md:col-span-2 flex flex-col items-end">
                            <p class="text-sm font-bold ${(tx.isVirtualInvoice && tx.isCurrentInvoice) ? 'text-purple-400' : (tx.isVirtualInvoice ? 'text-slate-500' : (isIncome ? 'text-emerald-500' : 'text-rose-500'))}">${isIncome?'+':'-'} R$ ${meuValor.toFixed(2)}</p>
                            ${(tx.splitParticipants && tx.splitParticipants.length > 1 && !tx.isVirtualInvoice) ? `<p class="text-[10px] text-slate-500 font-medium mt-0.5">de R$ ${valorOriginal.toFixed(2)}</p>` : ''}
                        </div>
                    </div>
                    <div class="hidden md:flex justify-end items-center space-x-3 md:col-span-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                        ${acoesHTML}
                    </div>
                </div>
            `;
        });
    }

    const newContainer = containerLista.cloneNode(true);
    containerLista.replaceWith(newContainer);
    
    newContainer.addEventListener('click', async (e) => {
        const btnEfetivarFatura = e.target.closest('.btn-quick-efetivar-fatura');
        const btnEfetivarNormal = e.target.closest('.btn-quick-efetivar');
        const btnDel = e.target.closest('.btn-delete-acc');
        const btnEdit = e.target.closest('.btn-edit');
        const btnReject = e.target.closest('.btn-reject-shared');
        const row = e.target.closest('.tx-row');

        if (btnEfetivarFatura) {
            e.stopPropagation();
            const accId = btnEfetivarFatura.dataset.acc;
            const fatura = window.faturasFechadasGlobais[accId];
            
            const qContas = query(collection(db, 'accounts'), where('userId', '==', user.uid));
            const snapContas = await getDocs(qContas);
            const selectAcc = document.getElementById('fatura-global-conta-debito');
            selectAcc.innerHTML = '';
            
            const contasValidas = snapContas.docs.map(d => ({id: d.id, ...d.data()})).filter(c => c.type !== 'credit');
            if (contasValidas.length === 0) return alert("Precisa cadastrar uma Conta Corrente ou Carteira para pagar a fatura!");
            contasValidas.forEach(c => selectAcc.innerHTML += `<option value="${c.id}">🏦 ${c.name}</option>`);

            document.getElementById('fatura-global-acc-id').value = accId;
            document.getElementById('fatura-global-valor-texto').innerText = `R$ ${fatura.pendingAmount.toFixed(2)}`;
            document.getElementById('fatura-global-valor-pago').value = fatura.pendingAmount.toFixed(2);
            document.getElementById('fatura-global-data').value = new Date().toISOString().split('T')[0];
            document.getElementById('modal-pagar-fatura-global').classList.remove('hidden');
            return;
        }

        if (btnEfetivarNormal) {
            e.stopPropagation();
            const id = btnEfetivarNormal.dataset.id;
            const txOriginal = todasTransacoes.find(t => t.id === id);
            
            document.getElementById('efetivar-id').value = id;
            document.getElementById('efetivar-proj-date').value = ''; 
            document.getElementById('efetivar-data').value = new Date().toISOString().split('T')[0];
            
            if (!txOriginal.accountId) {
                document.getElementById('efetivar-box-conta').classList.remove('hidden');
                document.getElementById('efetivar-req-conta').value = 'true';
                const selectAcc = document.getElementById('efetivar-conta');
                selectAcc.innerHTML = '';
                const contasValidas = window.contasGlobaisTransactions.filter(c => c.type !== 'credit');
                contasValidas.forEach(c => selectAcc.innerHTML += `<option value="${c.id}">🏦 ${c.name}</option>`);
            } else {
                document.getElementById('efetivar-box-conta').classList.add('hidden');
                document.getElementById('efetivar-req-conta').value = 'false';
            }

            document.getElementById('modal-efetivar-title').innerText = txOriginal.type === 'income' ? 'Confirmar Recebimento' : 'Confirmar Pagamento';
            document.getElementById('modal-efetivar').classList.remove('hidden');
            return;
        }

        if (btnDel) {
            e.stopPropagation();
            const id = btnDel.dataset.id;
            const tx = todasTransacoes.find(t => t.id === id);
            if (tx) await excluirTransacaoUniversal(tx);
            return;
        }

        if (btnReject) {
            e.stopPropagation();
            const id = btnReject.dataset.id;
            const tx = todasTransacoes.find(t => t.id === id);
            if (tx) await recusarTransacaoPartilhada(tx);
            return;
        }

        if (btnEdit) {
            e.stopPropagation();
            const id = btnEdit.dataset.id;
            const tx = todasTransacoes.find(t => t.id === id);
            if (tx) abrirModalTransacao('editar', tx);
            return;
        }

        if (row) {
            const isVirtual = row.dataset.isvirtual === 'true';
            if (isVirtual) {
                const contaObj = window.contasGlobaisTransactions.find(c => c.id === row.dataset.acc);
                if (contaObj) abrirDetalheConta(contaObj);
            } else {
                const tx = todasTransacoes.find(t => t.id === row.dataset.id);
                if (tx) abrirDetalheTransacao(tx); 
            }
        }
    });

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