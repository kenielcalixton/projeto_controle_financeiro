// js/components/accountDetails.js
import { auth, db } from '../config/firebase.js';
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let unsubscribeAccountTx = null;
let dataReferenciaFatura = new Date();
let transacoesPendentesFatura = [];

function atualizarLabelMesFatura() {
    const label = document.getElementById('label-month-fatura');
    if (label) label.innerText = dataReferenciaFatura.toLocaleString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '').toUpperCase();
}

export function abrirDetalheConta(conta) {
    const main = document.getElementById('main-content');
    const user = auth.currentUser;
    if (!user) return;

    if (unsubscribeAccountTx) unsubscribeAccountTx();

    const isCredit = conta.type === 'credit';
    const accIcon = isCredit ? '💳' : '🏦';
    const accColor = isCredit ? 'text-purple-400' : 'text-slate-400';
    const bgAccColor = isCredit ? 'bg-purple-500/10' : 'bg-slate-500/10';

    main.innerHTML = `
        <div class="max-w-6xl mx-auto w-full flex flex-col h-full animate-fade-in relative pb-6">
            
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0 mt-2">
                <div class="flex items-center gap-4">
                    <button id="btn-voltar-contas" class="p-2.5 bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors border border-slate-700 shadow-sm">
                        <i class="ph ph-arrow-left text-xl"></i>
                    </button>
                    <div>
                        <h2 class="text-2xl font-bold text-white flex items-center gap-2">
                            <span class="${bgAccColor} ${accColor} w-10 h-10 flex items-center justify-center rounded-xl border border-current/20">${accIcon}</span> 
                            ${conta.name}
                        </h2>
                        <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">
                            ${isCredit ? `Cartão de Crédito • Fecha dia ${conta.closingDay || '--'} • Vence dia ${conta.dueDay || '--'}` : 'Conta Corrente / Débito'}
                        </p>
                    </div>
                </div>

                <div class="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 shadow-sm">
                    <button id="btn-prev-fatura" class="px-3 py-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700"><i class="ph ph-caret-left text-lg"></i></button>
                    <div id="label-month-fatura" class="px-4 py-1.5 text-sm font-bold ${accColor} min-w-[110px] text-center uppercase tracking-wider">...</div>
                    <button id="btn-next-fatura" class="px-3 py-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700"><i class="ph ph-caret-right text-lg"></i></button>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 shrink-0" id="account-summary-cards">
                <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex items-center justify-between opacity-50"><p class="text-slate-400">A calcular...</p></div>
                <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex items-center justify-between opacity-50"><p class="text-slate-400">A calcular...</p></div>
            </div>

            <div class="bg-darkcard border border-darkborder rounded-3xl flex-1 overflow-hidden shadow-sm flex flex-col min-h-[400px]">
                <div class="p-5 border-b border-darkborder bg-slate-800/50 flex justify-between items-center shrink-0">
                    <h3 class="text-sm font-bold text-slate-300 uppercase tracking-wider">${isCredit ? 'Compras nesta Fatura' : 'Movimentações do Mês'}</h3>
                </div>
                <div id="lista-tx-conta" class="overflow-y-auto flex-1 divide-y divide-darkborder bg-darkcard p-2">
                    <div class="text-center p-8 text-slate-500"><i class="ph ph-spinner animate-spin text-2xl mb-2"></i><br>A carregar lançamentos...</div>
                </div>
            </div>

            <!-- MODAL PAGAMENTO DE FATURA INTERNO -->
            <div id="modal-pagar-fatura-interno" class="fixed inset-0 bg-black/90 z-[120] flex items-center justify-center p-4 hidden animate-fade-in">
                <form id="form-pagar-fatura-interno" class="bg-darkcard w-full max-w-sm rounded-3xl p-6 border border-darkborder shadow-2xl flex flex-col">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-lg font-bold text-white">Pagar Fatura</h2>
                        <button type="button" id="btn-close-fatura-interno" class="text-slate-400 hover:text-rose-500"><i class="ph ph-x text-xl"></i></button>
                    </div>
                    
                    <p class="text-sm text-slate-400 mb-5">Você está prestes a efetivar <strong id="fatura-interno-qtd" class="text-white">X</strong> compras no valor total de <strong id="fatura-interno-valor" class="text-purple-400">R$ 0,00</strong>.</p>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Pagar com qual conta?</label>
                            <select id="fatura-interno-conta" required class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"></select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Data do Pagamento</label>
                            <input type="date" id="fatura-interno-data" required class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500" />
                        </div>
                    </div>
                    
                    <div class="flex justify-end space-x-3 mt-6 pt-4 border-t border-slate-700">
                        <button type="button" id="btn-cancel-fatura-interno" class="px-4 py-2 text-slate-400 font-bold hover:bg-slate-800 rounded-xl">Cancelar</button>
                        <button type="submit" id="btn-submit-fatura-interno" class="px-4 py-2 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500 shadow-lg shadow-purple-500/30 transition-colors">Confirmar Pagamento</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    atualizarLabelMesFatura();

    document.getElementById('btn-voltar-contas').addEventListener('click', async () => {
        if (unsubscribeAccountTx) unsubscribeAccountTx();
        const { renderizarContas } = await import('./accounts.js');
        renderizarContas(); 
    });

    document.getElementById('btn-prev-fatura').addEventListener('click', () => { dataReferenciaFatura.setMonth(dataReferenciaFatura.getMonth() - 1); atualizarLabelMesFatura(); seederFatura(conta, user); });
    document.getElementById('btn-next-fatura').addEventListener('click', () => { dataReferenciaFatura.setMonth(dataReferenciaFatura.getMonth() + 1); atualizarLabelMesFatura(); seederFatura(conta, user); });

    const modalFatura = document.getElementById('modal-pagar-fatura-interno');
    const fecharFatura = () => modalFatura.classList.add('hidden');
    document.getElementById('btn-close-fatura-interno').addEventListener('click', fecharFatura);
    document.getElementById('btn-cancel-fatura-interno').addEventListener('click', fecharFatura);

    document.getElementById('form-pagar-fatura-interno').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSubmit = document.getElementById('btn-submit-fatura-interno');
        btnSubmit.disabled = true; btnSubmit.innerText = 'A processar...';

        try {
            const dataPagamento = document.getElementById('fatura-interno-data').value;
            const contaDebitoId = document.getElementById('fatura-interno-conta').value;
            const keyMes = `${dataReferenciaFatura.getFullYear()}-${String(dataReferenciaFatura.getMonth() + 1).padStart(2, '0')}`;
            
            const promises = transacoesPendentesFatura.map(async (tx) => {
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
            fecharFatura();
        } catch (error) {
            console.error(error); alert("Erro ao efetivar a fatura.");
        } finally {
            btnSubmit.disabled = false; btnSubmit.innerText = 'Confirmar Pagamento';
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
    
    let transacoesDoMes = [];

    todasTransacoes.forEach(tx => {
        if (!tx.launchDate) return;
        if (tx.endDate && keyMesAtual > tx.endDate.substring(0, 7)) return;

        const [txAnoStr, txMesStr, txDiaStr] = tx.launchDate.split('-');
        const txAno = parseInt(txAnoStr, 10);
        const txMes = parseInt(txMesStr, 10) - 1; 
        const txDia = parseInt(txDiaStr, 10);

        let isProjection = false;
        let launchDateFinal = tx.launchDate;
        let parcelaFinal = tx.currentInstallment;

        if (isCredit) {
            const closingDay = parseInt(conta.closingDay) || 31;
            
            let invMes = txMes + (txDia >= closingDay ? 2 : 1);
            let invAno = txAno;
            while (invMes > 11) { invMes -= 12; invAno++; }
            
            const diff = (anoRef - invAno) * 12 + (mesRef - invMes);
            let fallsInCurrent = false;

            if (tx.recurrence === 'none') {
                if (diff === 0) fallsInCurrent = true;
            } else if (tx.recurrence === 'fixed') {
                if (diff >= 0) fallsInCurrent = true;
            } else if (tx.recurrence === 'installments') {
                const totalInst = parseInt(tx.installmentsTotal, 10) || 1;
                const startInst = parseInt(tx.currentInstallment, 10) || 1;
                if (diff >= 0 && (startInst + diff) <= totalInst) { fallsInCurrent = true; parcelaFinal = startInst + diff; }
            }

            if (!fallsInCurrent) return; // Só mostra o que cai na fatura selecionada no ecrã!
            isProjection = true;
            
        } else {
            // Conta Corrente
            const diff = (anoRef - txAno) * 12 + (mesRef - txMes);
            if (diff < 0) return;

            if (diff === 0) isProjection = false;
            else if (diff > 0) {
                if (tx.recurrence === 'fixed') { isProjection = true; launchDateFinal = `${keyMesAtual}-${txDiaStr}`; }
                else if (tx.recurrence === 'installments') {
                    const totalInst = parseInt(tx.installmentsTotal, 10) || 1;
                    const startInst = parseInt(tx.currentInstallment, 10) || 1;
                    if ((startInst + diff) <= totalInst) { isProjection = true; launchDateFinal = `${keyMesAtual}-${txDiaStr}`; parcelaFinal = startInst + diff; }
                    else return; 
                } else return; 
            }
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

        if (txFinal.participantEmails && txFinal.participantEmails.includes(user.email)) {
            transacoesDoMes.push(txFinal);
        }
    });

    transacoesDoMes.sort((a, b) => new Date(b.launchDate) - new Date(a.launchDate));

    // Renderizar
    const container = document.getElementById('lista-tx-conta');
    const summaryCards = document.getElementById('account-summary-cards');
    
    let totalPago = 0, totalPendente = 0;
    transacoesPendentesFatura = []; 

    let htmlLista = '';

    if (transacoesDoMes.length === 0) {
        htmlLista = `<div class="text-center p-12 text-slate-500 font-medium flex flex-col items-center"><i class="ph ph-receipt text-4xl mb-3 opacity-30"></i>Nenhuma movimentação para este mês.</div>`;
    } else {
        transacoesDoMes.forEach(tx => {
            const myPart = tx.splitParticipants ? tx.splitParticipants.find(p => p.email === user.email) : null;
            const meuValor = myPart ? myPart.amount : tx.amount;
            const status = myPart ? myPart.status : (tx.status || 'pending');
            const isPaid = status === 'paid' || status === 'accepted';
            
            if (tx.type === 'expense') {
                if (isPaid) totalPago += meuValor;
                else { totalPendente += meuValor; transacoesPendentesFatura.push(tx); }
            } else if (tx.type === 'income') {
                if (isPaid) totalPago -= meuValor;
                else { totalPendente -= meuValor; transacoesPendentesFatura.push(tx); }
            }

            const catNome = tx.category || 'Outros';
            const catIcon = tx.categoryIcon || '📌';
            const catColor = tx.categoryColor || '#64748b';

            const statusHtml = isPaid
                ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Efetivado</span>`
                : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30">Pendente</span>`;

            htmlLista += `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-slate-800/50 transition-colors rounded-xl gap-4">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 border" style="background-color: ${catColor}15; color: ${catColor}; border-color: ${catColor}30;">${catIcon}</div>
                        <div>
                            <p class="text-sm font-bold text-white leading-tight">${tx.description}</p>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="text-[10px] text-slate-400 font-bold px-1.5 py-0.5 bg-slate-800 rounded-md border border-slate-700">Comprado: ${tx.launchDate.split('-').reverse().join('/')}</span>
                                ${tx.installmentsTotal > 1 ? `<span class="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-300 font-bold">${tx.currentInstallment}/${tx.installmentsTotal}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center">
                        <div class="flex items-center gap-3 sm:hidden mb-1">${statusHtml}</div>
                        <div class="text-right"><p class="text-sm font-bold ${tx.type === 'expense' ? 'text-rose-500' : 'text-emerald-500'}">${tx.type === 'expense' ? '-' : '+'} R$ ${meuValor.toFixed(2)}</p><div class="hidden sm:block mt-1">${statusHtml}</div></div>
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = htmlLista;
    const totalMes = totalPago + totalPendente;
    
    let acaoFaturaHtml = '';
    if (isCredit && totalPendente > 0) {
        acaoFaturaHtml = `
            <button id="btn-abrir-modal-fatura" class="mt-4 w-full py-3 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-purple-500/30 transition-colors flex items-center justify-center gap-2">
                <i class="ph-fill ph-file-text text-lg"></i> Pagar Fatura Total (R$ ${totalPendente.toFixed(2)})
            </button>
        `;
    }

    summaryCards.innerHTML = `
        <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex flex-col justify-between shadow-sm relative overflow-hidden">
            ${isCredit ? '<div class="absolute top-0 right-0 bg-purple-500/20 text-purple-400 text-[9px] font-bold px-2 py-0.5 rounded-bl-lg tracking-wider">FATURA</div>' : ''}
            <div>
                <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total do Mês</p>
                <p class="text-2xl font-bold ${isCredit ? 'text-purple-400' : 'text-white'}">R$ ${totalMes.toFixed(2)}</p>
            </div>
            ${acaoFaturaHtml}
        </div>
        
        <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex flex-col justify-center shadow-sm space-y-3">
            <div class="flex justify-between items-center text-sm font-bold">
                <span class="text-slate-400">Já Pago / Efetivado</span>
                <span class="text-emerald-400">R$ ${totalPago.toFixed(2)}</span>
            </div>
            <div class="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                <div class="bg-emerald-500 h-2 rounded-full" style="width: ${totalMes > 0 ? (totalPago/totalMes)*100 : 0}%"></div>
            </div>
            <div class="flex justify-between items-center text-sm font-bold pt-2 border-t border-slate-700/50">
                <span class="text-slate-400">Restante Pendente</span>
                <span class="text-amber-400">R$ ${totalPendente.toFixed(2)}</span>
            </div>
        </div>
    `;

    const btnAbrirModal = document.getElementById('btn-abrir-modal-fatura');
    if (btnAbrirModal) {
        btnAbrirModal.addEventListener('click', async () => {
            const qContas = query(collection(db, 'accounts'), where('userId', '==', user.uid), where('type', '!=', 'credit'));
            const snapContas = await getDocs(qContas);
            const selectAcc = document.getElementById('fatura-interno-conta');
            selectAcc.innerHTML = '';
            
            if (snapContas.empty) return alert("Você precisa cadastrar uma Conta Corrente ou Carteira para pagar a fatura!");
            snapContas.forEach(docSnap => selectAcc.innerHTML += `<option value="${docSnap.id}">🏦 ${docSnap.data().name}</option>`);

            document.getElementById('fatura-interno-qtd').innerText = transacoesPendentesFatura.length;
            document.getElementById('fatura-interno-valor').innerText = `R$ ${totalPendente.toFixed(2)}`;
            document.getElementById('fatura-interno-data').valueAsDate = new Date();
            
            document.getElementById('modal-pagar-fatura-interno').classList.remove('hidden');
        });
    }
}