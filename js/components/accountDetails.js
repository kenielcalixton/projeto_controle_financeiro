// js/components/accountDetails.js
import { auth, db } from '../config/firebase.js';
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { abrirModalTransacao, abrirDetalheTransacao, excluirTransacaoUniversal, recusarTransacaoPartilhada } from './transactionModal.js';

let unsubscribeAccountTx = null;
let dataReferenciaFatura = new Date();
let totalPendenteGlobal = 0;
let contaAtual = null;

function atualizarLabelMesFatura() {
    const label = document.getElementById('label-month-fatura');
    if (label) label.innerText = dataReferenciaFatura.toLocaleString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '').toUpperCase();
}

export function fecharDetalheConta() {
    const drawer = document.getElementById('drawer-conta');
    if (drawer) {
        document.getElementById('drawer-panel').classList.add('translate-x-full');
        document.getElementById('drawer-backdrop').classList.add('opacity-0');
        setTimeout(() => drawer.remove(), 300);
    }
    if (unsubscribeAccountTx) unsubscribeAccountTx();
}

export function abrirDetalheConta(conta) {
    contaAtual = conta;
    const user = auth.currentUser;
    if (!user) return;
    if (unsubscribeAccountTx) unsubscribeAccountTx();

    const isCredit = conta.type === 'credit';
    const accIcon = isCredit ? '💳' : '🏦';
    const accColor = isCredit ? 'text-purple-400' : 'text-slate-400';
    const bgAccColor = isCredit ? 'bg-purple-500/10' : 'bg-slate-500/10';

    const oldDrawer = document.getElementById('drawer-conta');
    if (oldDrawer) oldDrawer.remove();

    const drawerHTML = `
        <div id="drawer-conta" class="fixed inset-0 z-[105] flex justify-end">
            <div id="drawer-backdrop" class="absolute inset-0 bg-black/60 transition-opacity duration-300 opacity-0 cursor-pointer"></div>
            
            <div id="drawer-panel" class="w-full md:w-[550px] bg-slate-900 border-l border-slate-700 h-full shadow-2xl relative flex flex-col transform translate-x-full transition-transform duration-300">
                <div class="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800 shrink-0">
                    <div class="flex items-center gap-4">
                        <div class="${bgAccColor} ${accColor} w-10 h-10 flex items-center justify-center rounded-xl border border-current/20 text-xl shadow-inner">${accIcon}</div>
                        <div>
                            <h2 class="text-xl font-bold text-white leading-tight">${conta.name}</h2>
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                                ${isCredit ? `Fecha dia ${conta.closingDay || '--'} • Vence dia ${conta.dueDay || '--'}` : 'Conta Corrente'}
                            </p>
                        </div>
                    </div>
                    <button id="btn-close-drawer" class="text-slate-400 hover:text-rose-500 bg-slate-700 w-8 h-8 rounded-full flex items-center justify-center transition-colors"><i class="ph ph-x text-lg"></i></button>
                </div>

                <div class="p-4 bg-slate-800/50 border-b border-slate-700 flex justify-center shrink-0">
                    <div class="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-700 shadow-sm">
                        <button id="btn-prev-fatura" class="px-3 py-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700"><i class="ph ph-caret-left text-lg"></i></button>
                        <div id="label-month-fatura" class="px-4 py-1.5 text-sm font-bold ${accColor} min-w-[110px] text-center uppercase tracking-wider">...</div>
                        <button id="btn-next-fatura" class="px-3 py-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700"><i class="ph ph-caret-right text-lg"></i></button>
                    </div>
                </div>

                <div class="p-5 shrink-0 flex flex-col gap-4" id="account-summary-cards"></div>

                <div class="flex-1 overflow-y-auto p-3 bg-darkcard">
                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2 border-b border-slate-700 pb-2">${isCredit ? 'Detalhes da Fatura' : 'Movimentações do Mês'}</h3>
                    <div id="lista-tx-conta" class="space-y-2">
                        <div class="text-center p-8 text-slate-500"><i class="ph ph-spinner animate-spin text-2xl mb-2"></i><br>A carregar lançamentos...</div>
                    </div>
                </div>
            </div>

            <div id="modal-pagar-fatura-interno" class="absolute inset-0 bg-black/90 z-[140] flex items-center justify-center p-4 hidden animate-fade-in">
                <form id="form-pagar-fatura-interno" class="bg-darkcard w-full max-w-sm rounded-3xl p-6 border border-darkborder shadow-2xl flex flex-col">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-lg font-bold text-white">Efetuar Pagamento</h2>
                        <button type="button" id="btn-close-fatura-interno" class="text-slate-400 hover:text-rose-500"><i class="ph ph-x text-xl"></i></button>
                    </div>
                    
                    <p class="text-sm text-slate-400 mb-5">Valor pendente da fatura: <strong id="fatura-interno-valor-texto" class="text-purple-400">R$ 0,00</strong>.</p>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Valor a Pagar (R$)</label>
                            <input type="number" id="fatura-interno-valor-pago" step="0.01" required class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-2xl font-bold text-white focus:outline-none focus:border-purple-500" />
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">De qual conta saiu o dinheiro?</label>
                            <select id="fatura-interno-conta" required class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"></select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Data do Pagamento</label>
                            <input type="date" id="fatura-interno-data" required class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500" />
                        </div>
                    </div>
                    
                    <div class="flex justify-end space-x-3 mt-6 pt-4 border-t border-slate-700">
                        <button type="button" id="btn-cancel-fatura-interno" class="px-4 py-2 text-slate-400 font-bold hover:bg-slate-800 rounded-xl">Cancelar</button>
                        <button type="submit" id="btn-submit-fatura-interno" class="px-4 py-2 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500 shadow-lg shadow-purple-500/30 transition-colors">Confirmar</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', drawerHTML);
    const drawer = document.getElementById('drawer-conta');
    
    setTimeout(() => {
        document.getElementById('drawer-backdrop').classList.remove('opacity-0');
        document.getElementById('drawer-panel').classList.remove('translate-x-full');
    }, 10);

    atualizarLabelMesFatura();

    document.getElementById('drawer-backdrop').addEventListener('click', fecharDetalheConta);
    document.getElementById('btn-close-drawer').addEventListener('click', fecharDetalheConta);
    document.getElementById('btn-prev-fatura').addEventListener('click', () => { dataReferenciaFatura.setMonth(dataReferenciaFatura.getMonth() - 1); atualizarLabelMesFatura(); seederFatura(conta, user); });
    document.getElementById('btn-next-fatura').addEventListener('click', () => { dataReferenciaFatura.setMonth(dataReferenciaFatura.getMonth() + 1); atualizarLabelMesFatura(); seederFatura(conta, user); });

    const modalFatura = document.getElementById('modal-pagar-fatura-interno');
    const closeFatura = () => modalFatura.classList.add('hidden');
    document.getElementById('btn-close-fatura-interno').addEventListener('click', closeFatura);
    document.getElementById('btn-cancel-fatura-interno').addEventListener('click', closeFatura);

    document.getElementById('form-pagar-fatura-interno').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSubmit = document.getElementById('btn-submit-fatura-interno');
        btnSubmit.disabled = true; btnSubmit.innerText = 'Processando...';

        try {
            const valorPago = parseFloat(document.getElementById('fatura-interno-valor-pago').value);
            const dataPagamento = document.getElementById('fatura-interno-data').value;
            const contaDebitoId = document.getElementById('fatura-interno-conta').value;
            const selectAcc = document.getElementById('fatura-interno-conta');
            const nomeContaDebito = selectAcc.options[selectAcc.selectedIndex].text.replace(/^[🏦]\s*/, '');
            
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

            const isTotal = valorPago >= (totalPendenteGlobal - 0.01);
            const dueDay = conta.dueDay || 10;
            const launchDateFatura = `${dataReferenciaFatura.getFullYear()}-${String(dataReferenciaFatura.getMonth()+1).padStart(2,'0')}-${String(dueDay).padStart(2,'0')}`;

            await addDoc(collection(db, 'transactions'), {
                creatorId: user.uid, creatorEmail: user.email, type: 'income',
                description: isTotal ? 'Pagamento Total da Fatura' : 'Pagamento Parcial da Fatura', amount: valorPago,
                category: 'Pagamento de Fatura', categoryIcon: '💳', categoryColor: '#a855f7',
                accountId: conta.id, accountType: 'credit', accountName: conta.name,
                launchDate: launchDateFatura, status: 'paid', splitType: 'ind', recurrence: 'none',
                participantEmails: [user.email], splitParticipants: [{email: user.email, amount: valorPago, status: 'paid'}],
                linkedPaymentId: linkedPaymentId,
                createdAt: new Date().toISOString()
            });

            if (window.txsPendentesDaFaturaAberta) {
                const keyMes = `${dataReferenciaFatura.getFullYear()}-${String(dataReferenciaFatura.getMonth() + 1).padStart(2, '0')}`;
                const promises = window.txsPendentesDaFaturaAberta.map(async (tx) => {
                    const docRef = doc(db, 'transactions', tx.id);
                    const payload = { status: 'paid', paymentDate: dataPagamento };
                    
                    if (tx.isProjection || tx.isCreditInvoice) {
                        const overrides = tx.overrides || {};
                        overrides[keyMes] = { ...overrides[keyMes], ...payload };
                        return updateDoc(docRef, { overrides });
                    } else {
                        return updateDoc(docRef, payload);
                    }
                });
                await Promise.all(promises);
            }

            closeFatura();
        } catch (error) {
            console.error(error); alert("Erro ao efetivar a fatura.");
        } finally {
            btnSubmit.disabled = false; btnSubmit.innerText = 'Confirmar';
        }
    });

    seederFatura(conta, user);
}

function seederFatura(conta, user) {
    if (unsubscribeAccountTx) unsubscribeAccountTx();
    const q = query(collection(db, 'transactions'), where('accountId', '==', conta.id));
    unsubscribeAccountTx = onSnapshot(q, (snapshot) => {
        const transacoes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        processarDadosConta(transacoes, conta, user);
    });
}

function processarDadosConta(todasTransacoes, conta, user) {
    const isCredit = conta.type === 'credit';
    const anoRef = dataReferenciaFatura.getFullYear();
    const mesRef = dataReferenciaFatura.getMonth();
    const keyMesAtual = `${anoRef}-${String(mesRef + 1).padStart(2, '0')}`;
    const refAbsolute = anoRef * 12 + mesRef;
    
    let transacoesDoMes = [];
    let saldoAnterior = 0; 

    todasTransacoes.forEach(tx => {
        if (!tx.launchDate) return;
        
        const isCreator = !tx.creatorEmail || tx.creatorEmail === user.email;
        const myPart = tx.splitParticipants ? tx.splitParticipants.find(p => p.email === user.email) : null;
        const myStatus = myPart ? myPart.status : (tx.status || 'pending');

        if (!isCreator && (myStatus === 'pending' || myStatus === 'contested')) return;

        const [txAnoStr, txMesStr, txDiaStr] = tx.launchDate.split('-');
        const txAno = parseInt(txAnoStr, 10);
        const txMes = parseInt(txMesStr, 10) - 1; 
        const txDia = parseInt(txDiaStr, 10);

        let isProjection = false;
        let launchDateFinal = tx.launchDate;

        if (isCredit) {
            const closingDay = parseInt(conta.closingDay) || 31;
            
            let invMes = txMes;
            let invAno = txAno;
            
            if (tx.type !== 'income' || tx.category !== 'Pagamento de Fatura') {
                invMes = txMes + (txDia >= closingDay ? 2 : 1);
                while (invMes > 11) { invMes -= 12; invAno++; }
            }
            
            const invAbsolute = invAno * 12 + invMes;
            const meuValor = myPart ? parseFloat(myPart.amount) : parseFloat(tx.amount || 0);

            if (invAbsolute < refAbsolute) {
                if (tx.type === 'expense') saldoAnterior += meuValor;
                else saldoAnterior -= meuValor;
            } 
            else if (invAbsolute === refAbsolute) {
                transacoesDoMes.push({...tx, isProjection: true});
            }
        } else {
            const txAbsolute = txAno * 12 + txMes;
            const diff = refAbsolute - txAbsolute;
            
            let belongsToView = false;
            let currentInstallment = tx.currentInstallment;

            if (diff === 0) {
                belongsToView = true;
            } else if (diff > 0 && diff <= 12) {
                if (tx.recurrence === 'fixed') {
                    belongsToView = true; isProjection = true; launchDateFinal = `${keyMesAtual}-${String(txDia).padStart(2,'0')}`;
                } else if (tx.recurrence === 'installments') {
                    const startInst = parseInt(tx.currentInstallment) || 1;
                    const totalInst = parseInt(tx.installmentsTotal) || 1;
                    if ((startInst + diff) <= totalInst) {
                        belongsToView = true; isProjection = true; 
                        launchDateFinal = `${keyMesAtual}-${String(txDia).padStart(2,'0')}`; 
                        currentInstallment = startInst + diff;
                    }
                }
            }

            if (belongsToView) {
                let txFinal = {...tx, isProjection, launchDate: launchDateFinal, currentInstallment};
                if (isProjection) txFinal.status = 'pending';
                if (tx.overrides && tx.overrides[keyMesAtual]) {
                    if (tx.overrides[keyMesAtual].deleted) return;
                    txFinal = { ...txFinal, ...tx.overrides[keyMesAtual] };
                }
                transacoesDoMes.push(txFinal);
            }
        }
    });

    if (isCredit && saldoAnterior > 0.01) {
        transacoesDoMes.push({
            id: 'saldo_anterior', description: 'Saldo Pendente do Mês Anterior', type: 'expense',
            amount: saldoAnterior, launchDate: `${keyMesAtual}-01`, status: 'pending',
            category: 'Rotativo', categoryIcon: '🔄', categoryColor: '#f59e0b', accountType: 'credit'
        });
    }

    transacoesDoMes.sort((a, b) => new Date(b.launchDate) - new Date(a.launchDate));

    const container = document.getElementById('lista-tx-conta');
    const summaryCards = document.getElementById('account-summary-cards');
    
    let totalFatura = 0, totalPagoNaFatura = 0; 
    let txsParaPagar = [];

    let htmlLista = '';

    if (transacoesDoMes.length === 0) {
        htmlLista = `<div class="text-center p-8 text-slate-500 font-medium"><i class="ph ph-receipt text-3xl mb-2 opacity-30"></i><br>Nenhuma movimentação.</div>`;
    } else {
        transacoesDoMes.forEach(tx => {
            const isCreator = !tx.creatorEmail || tx.creatorEmail === user.email;
            const myPart = tx.splitParticipants ? tx.splitParticipants.find(p => p.email === user.email) : null;
            let meuValor = myPart ? parseFloat(myPart.amount) : parseFloat(tx.amount || 0);
            if (tx.id === 'saldo_anterior') meuValor = parseFloat(tx.amount || 0);
            const valorOriginal = parseFloat(tx.amount || 0);
            const statusStr = myPart ? myPart.status : tx.status;
            
            if (tx.type === 'expense') {
                totalFatura += meuValor;
                if(statusStr !== 'paid' && statusStr !== 'accepted' && statusStr !== 'payment_declared' && tx.id !== 'saldo_anterior') txsParaPagar.push(tx);
            }
            else if (tx.type === 'income') totalPagoNaFatura += meuValor;

            let statusHtml = '';
            if (statusStr === 'paid') {
                statusHtml = `<span class="text-emerald-400 font-bold text-[10px]"><i class="ph-fill ph-check-circle"></i> Efetivado</span>`;
            } else if (statusStr === 'payment_declared') {
                statusHtml = `<span class="text-indigo-400 font-bold text-[10px]"><i class="ph-fill ph-hourglass"></i> Em Validação</span>`;
            } else {
                statusHtml = `<span class="text-amber-500 font-bold text-[10px]"><i class="ph-fill ph-clock"></i> Pendente</span>`;
            }
            
            let recTypeHtml = '';
            if (tx.recurrence === 'fixed') {
                recTypeHtml = `<span class="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-1 py-0.5 rounded ml-2 border border-indigo-500/20"><i class="ph-bold ph-arrows-clockwise"></i></span>`;
            } else if (tx.recurrence === 'installments') {
                recTypeHtml = `<span class="text-[10px] font-bold text-slate-300 bg-slate-700 px-1 py-0.5 rounded ml-2 border border-slate-600">${tx.currentInstallment}/${tx.installmentsTotal}</span>`;
            }

            const catIcon = tx.categoryIcon || '📌';
            const catColor = tx.categoryColor || '#64748b';
            const isSaldoAnt = tx.id === 'saldo_anterior';

            let acoesHTML = '';
            if (!isSaldoAnt) {
                if (isCreator) {
                    acoesHTML = `
                        <button class="btn-edit text-slate-500 hover:text-indigo-400 p-2" data-id="${tx.id}"><i class="ph ph-pencil-simple text-lg pointer-events-none"></i></button>
                        <button class="btn-delete-acc text-slate-500 hover:text-rose-400 p-2" data-id="${tx.id}"><i class="ph ph-trash text-lg pointer-events-none"></i></button>
                    `;
                } else {
                    acoesHTML = `<button class="btn-reject-shared text-slate-500 hover:text-rose-400 p-2" data-id="${tx.id}" title="Recusar/Remover"><i class="ph ph-trash text-lg pointer-events-none"></i></button>`;
                }
            }

            htmlLista += `
                <div class="${!isSaldoAnt ? 'tx-row-drawer cursor-pointer hover:bg-slate-800 border border-transparent hover:border-slate-700' : 'opacity-80 bg-slate-800/30 border border-slate-700/30'} flex items-center justify-between p-3 transition-colors rounded-xl gap-3 group" data-id="${tx.id}">
                    <div class="flex items-center gap-3 overflow-hidden pointer-events-none">
                        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 border" style="background-color: ${catColor}15; color: ${catColor}; border-color: ${catColor}30;">${catIcon}</div>
                        <div class="truncate">
                            <p class="text-sm font-bold ${isSaldoAnt ? 'text-amber-500' : 'text-white'} truncate leading-tight flex items-center">${tx.description}${recTypeHtml}</p>
                            <p class="text-[10px] text-slate-400 font-bold mt-0.5">${tx.launchDate.split('-').reverse().join('/')}</p>
                        </div>
                    </div>
                    <div class="text-right shrink-0 flex items-center">
                        <div class="flex flex-col items-end">
                            <p class="text-sm font-bold ${tx.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}">${tx.type === 'income' ? '+' : '-'} R$ ${meuValor.toFixed(2)}</p>
                            ${(tx.splitParticipants && tx.splitParticipants.length > 1 && !tx.isVirtualInvoice) ? `<p class="text-[10px] text-slate-500 font-medium mt-0.5">de R$ ${valorOriginal.toFixed(2)}</p>` : ''}
                            <p class="mt-0.5 pointer-events-none">${statusHtml}</p>
                        </div>
                        <div class="opacity-0 group-hover:opacity-100 transition-opacity ml-3 flex z-20">
                            ${acoesHTML}
                        </div>
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = htmlLista;
    
    totalPendenteGlobal = Math.max(0, totalFatura - totalPagoNaFatura);
    window.txsPendentesDaFaturaAberta = txsParaPagar; 
    
    let acaoFaturaHtml = '';
    if (isCredit && totalPendenteGlobal > 0) {
        acaoFaturaHtml = `
            <button id="btn-abrir-modal-fatura-interno" class="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-purple-500/30 transition-colors flex items-center justify-center gap-2">
                <i class="ph-fill ph-file-text text-lg"></i> Pagar Fatura (R$ ${totalPendenteGlobal.toFixed(2)})
            </button>
        `;
    }

    summaryCards.innerHTML = `
        <div class="bg-slate-800 border border-slate-700 p-4 rounded-2xl flex flex-col justify-between relative overflow-hidden w-full">
            ${isCredit ? '<div class="absolute top-0 right-0 bg-purple-500/20 text-purple-400 text-[9px] font-bold px-2 py-0.5 rounded-bl-lg tracking-wider">FATURA</div>' : ''}
            <div>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total da Fatura (Com Acréscimos)</p>
                <p class="text-2xl font-bold ${isCredit ? 'text-purple-400' : 'text-white'}">R$ ${totalFatura.toFixed(2)}</p>
            </div>
            
            <div class="mt-4 pt-3 border-t border-slate-700/50 space-y-2">
                <div class="flex justify-between items-center text-[11px] font-bold">
                    <span class="text-slate-400">Pagamentos / Créditos</span>
                    <span class="text-emerald-400">R$ ${totalPagoNaFatura.toFixed(2)}</span>
                </div>
                <div class="flex justify-between items-center text-[11px] font-bold">
                    <span class="text-slate-400">Restante a Pagar</span>
                    <span class="text-amber-400">R$ ${totalPendenteGlobal.toFixed(2)}</span>
                </div>
            </div>
            ${acaoFaturaHtml ? `<div class="mt-4">${acaoFaturaHtml}</div>` : ''}
        </div>
    `;

    const newContainer = document.getElementById('lista-tx-conta');
    newContainer.replaceWith(newContainer.cloneNode(true));
    document.getElementById('lista-tx-conta').addEventListener('click', async (e) => {
        const btnDel = e.target.closest('.btn-delete-acc');
        const btnEdit = e.target.closest('.btn-edit');
        const btnReject = e.target.closest('.btn-reject-shared');
        const row = e.target.closest('.tx-row-drawer');

        if (btnDel) {
            e.stopPropagation();
            const id = btnDel.dataset.id;
            const tx = transacoesDoMes.find(t => t.id === id);
            if (tx) await excluirTransacaoUniversal(tx);
            return;
        }

        if (btnReject) {
            e.stopPropagation();
            const id = btnReject.dataset.id;
            const tx = transacoesDoMes.find(t => t.id === id);
            if (tx) await recusarTransacaoPartilhada(tx);
            return;
        }
        
        if (btnEdit) {
            e.stopPropagation();
            const id = btnEdit.dataset.id;
            const tx = transacoesDoMes.find(t => t.id === id);
            if (tx) abrirModalTransacao('editar', tx);
            return;
        }

        if (row && row.dataset.id !== 'saldo_anterior') {
            const tx = transacoesDoMes.find(t => t.id === row.dataset.id);
            if (tx) abrirDetalheTransacao(tx);
        }
    });

    const btnAbrirModal = document.getElementById('btn-abrir-modal-fatura-interno');
    if (btnAbrirModal) {
        const newBtn = btnAbrirModal.cloneNode(true);
        btnAbrirModal.replaceWith(newBtn);
        newBtn.addEventListener('click', async () => {
            const qContas = query(collection(db, 'accounts'), where('userId', '==', user.uid));
            const snapContas = await getDocs(qContas);
            const selectAcc = document.getElementById('fatura-interno-conta');
            selectAcc.innerHTML = '';
            
            const contasValidas = snapContas.docs.map(d => ({id: d.id, ...d.data()})).filter(c => c.type !== 'credit');
            if (contasValidas.length === 0) return alert("Precisa de uma Conta Corrente para pagar a fatura!");
            
            contasValidas.forEach(c => selectAcc.innerHTML += `<option value="${c.id}">🏦 ${c.name}</option>`);

            document.getElementById('fatura-interno-valor-texto').innerText = `R$ ${totalPendenteGlobal.toFixed(2)}`;
            document.getElementById('fatura-interno-valor-pago').value = totalPendenteGlobal.toFixed(2);
            document.getElementById('fatura-interno-data').valueAsDate = new Date();
            
            document.getElementById('modal-pagar-fatura-interno').classList.remove('hidden');
        });
    }
}