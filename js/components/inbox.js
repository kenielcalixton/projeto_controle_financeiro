// js/components/inbox.js
import { auth, db } from '../config/firebase.js';
import { collection, query, where, onSnapshot, updateDoc, doc, arrayUnion, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let unsubscribeTx = null;
let unsubscribeSp = null;
let currentChatTx = null; 

let inboxData = {
    transactions: [],
    spaces: []
};

export function renderizarInbox() {
    const main = document.getElementById('main-content');
    const user = auth.currentUser;
    if (!user) return;

    main.innerHTML = `
        <div class="flex flex-col h-full max-w-4xl mx-auto w-full animate-fade-in">
            <div class="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
                <h2 class="text-2xl font-bold">Pendências & Inbox</h2>
                <div class="flex bg-slate-800 p-1 rounded-xl border border-slate-700 w-full md:w-auto shrink-0">
                    <button id="tab-pendentes" class="flex-1 md:px-6 py-2 text-sm font-bold rounded-lg bg-slate-700 text-amber-400 shadow transition-all">Pendentes (0)</button>
                    <button id="tab-historico" class="flex-1 md:px-6 py-2 text-sm font-bold rounded-lg text-slate-500 hover:bg-slate-800 transition-all">Histórico</button>
                </div>
            </div>

            <div class="flex-1 bg-darkcard border border-darkborder rounded-3xl p-6 shadow-sm overflow-y-auto relative">
                <div id="view-pendentes" class="space-y-4">
                    <div class="text-center text-slate-500 p-8"><i class="ph ph-spinner animate-spin text-2xl mb-2"></i><br>A verificar pendências...</div>
                </div>
                <div id="view-historico" class="space-y-4 hidden"></div>
            </div>
        </div>
    `;

    injetarModalChat();
    configurarAbas();

    const qTx = query(collection(db, 'transactions'), where('participantEmails', 'array-contains', user.email));
    unsubscribeTx = onSnapshot(qTx, (snapshot) => {
        inboxData.transactions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        window.transacoesInbox = inboxData.transactions; 
        atualizarListasInbox(user);
    });

    const qSp = query(collection(db, 'spaces'), where('participantEmails', 'array-contains', user.email));
    unsubscribeSp = onSnapshot(qSp, (snapshot) => {
        inboxData.spaces = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        atualizarListasInbox(user);
    });

    main.dataset.unsubscribeInbox = "true";
}

function atualizarListasInbox(user) {
    const listPendentes = document.getElementById('view-pendentes');
    const listHistorico = document.getElementById('view-historico');
    
    let htmlPendentes = '';
    let htmlHistorico = '';
    let contPendentes = 0;

    inboxData.spaces.forEach(sp => {
        if (sp.isIndividual) return;
        const isCreator = sp.creatorEmail === user.email;
        const myPart = (sp.membersData || []).find(m => m.email === user.email);
        if (!myPart) return;

        if (!isCreator && myPart.status === 'pending') {
            contPendentes++;
            htmlPendentes += `
                <div class="p-5 bg-slate-800 rounded-2xl border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-indigo-500/50">
                    <div class="flex items-center gap-4 pointer-events-none">
                        <div class="w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0 bg-indigo-500/20 text-indigo-400 relative">
                            <i class="ph-fill ph-users-three"></i>
                            <span class="absolute top-0 right-0 w-3 h-3 bg-rose-500 border-2 border-slate-800 rounded-full animate-pulse"></span>
                        </div>
                        <div>
                            <p class="font-bold text-white">${sp.creatorEmail.split('@')[0]} convidou-o para um espaço</p>
                            <p class="text-sm font-medium text-slate-300">Espaço: <span class="text-white font-bold">${sp.name}</span></p>
                            <p class="text-xs text-slate-400 mt-1">Colaboração financeira mútua</p>
                        </div>
                    </div>
                    <div class="flex gap-2 shrink-0">
                        <button class="px-5 py-2.5 bg-rose-500/10 text-rose-400 rounded-xl text-sm font-bold hover:bg-rose-500/20 transition-colors" onclick="window.responderConviteEspaco('${sp.id}', 'rejected')">Recusar</button>
                        <button class="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-500 transition-colors" onclick="window.responderConviteEspaco('${sp.id}', 'accepted')">Aceitar Convite</button>
                    </div>
                </div>
            `;
        } else if (!isCreator && (myPart.status === 'accepted' || myPart.status === 'rejected')) {
            let icon = myPart.status === 'accepted' ? 'check-circle' : 'x-circle';
            let color = myPart.status === 'accepted' ? 'emerald' : 'rose';
            let txt = myPart.status === 'accepted' ? 'Aceitou o convite para o espaço' : 'Recusou o convite para o espaço';
            
            htmlHistorico += `
                <div class="p-5 bg-slate-800/50 rounded-2xl border border-slate-700/50 flex items-center justify-between gap-4 opacity-70">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 bg-${color}-500/20 text-${color}-500"><i class="ph-fill ph-${icon}"></i></div>
                        <div>
                            <p class="font-bold text-slate-300">${txt} <span class="text-white">${sp.name}</span></p>
                            <p class="text-xs text-slate-500 mt-1">De: ${sp.creatorEmail}</p>
                        </div>
                    </div>
                </div>
            `;
        }
    });

    inboxData.transactions.forEach(tx => {
        if (!tx.splitParticipants || tx.splitParticipants.length <= 1) return;

        const isCreator = tx.creatorEmail === user.email;
        const myPart = tx.splitParticipants.find(p => p.email === user.email);
        if (!myPart) return;
        
        let precisaAcao = false;
        let statusBadge = '';
        
        if (!isCreator) {
            if (!myPart.status || myPart.status === 'pending' || myPart.status === 'contested' || myPart.status === 'accepted' || myPart.status === 'payment_rejected') {
                precisaAcao = true;
                statusBadge = myPart.status || 'pending';
            } else {
                statusBadge = myPart.status; 
            }
        } else {
            const someoneContested = tx.splitParticipants.find(p => p.status === 'contested');
            const someoneDeclared = tx.splitParticipants.find(p => p.status === 'payment_declared');
            const someonePendingOrAccepted = tx.splitParticipants.find(p => p.email !== user.email && (p.status === 'pending' || p.status === 'accepted' || p.status === 'payment_rejected'));
            
            if (someoneContested || someoneDeclared || someonePendingOrAccepted) {
                precisaAcao = true;
                if (someoneContested) statusBadge = 'contested';
                else if (someoneDeclared) statusBadge = 'payment_declared';
                else statusBadge = 'waiting_payment';
            } else {
                statusBadge = 'resolved'; 
            }
        }

        const isIncome = tx.type === 'income';
        const valDisplay = myPart.amount || 0;

        if (precisaAcao) {
            contPendentes++;
            
            let statusText = '';
            let statusIcon = '';
            
            if (isCreator && statusBadge === 'payment_declared') {
                statusText = 'Validar pagamento recebido'; statusIcon = 'ph-check-circle';
            } else if (isCreator && statusBadge === 'waiting_payment') {
                statusText = 'Aguardando Pagamentos'; statusIcon = 'ph-clock';
            } else if (isCreator) {
                statusText = 'Alguém contestou um valor'; statusIcon = 'ph-bell-ringing';
            } else if (!isCreator && statusBadge === 'accepted') {
                statusText = 'Aceite (Aguardando o seu pagamento)'; statusIcon = 'ph-wallet';
            } else if (!isCreator && statusBadge === 'payment_rejected') {
                statusText = 'Pagamento Recusado (Tente novamente)'; statusIcon = 'ph-warning-circle';
            } else {
                statusText = `${tx.creatorEmail} enviou um rateio`; statusIcon = 'ph-bell-ringing';
            }

            htmlPendentes += `
                <div class="p-5 bg-slate-800 rounded-2xl border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-indigo-500/50 cursor-pointer" onclick="window.abrirChatInbox('${tx.id}')">
                    <div class="flex items-center gap-4 pointer-events-none">
                        <div class="w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0 bg-amber-500/20 text-amber-500 relative">
                            <i class="ph-fill ${statusIcon}"></i>
                            ${(statusBadge !== 'accepted' && statusBadge !== 'waiting_payment' && statusBadge !== 'payment_declared') ? '<span class="absolute top-0 right-0 w-3 h-3 bg-rose-500 border-2 border-slate-800 rounded-full animate-pulse"></span>' : ''}
                        </div>
                        <div>
                            <p class="font-bold text-white">${statusText}</p>
                            <p class="text-sm font-medium text-slate-300">${tx.description}</p>
                            <p class="text-xs text-slate-400 mt-1">Data: ${tx.launchDate.split('-').reverse().join('/')}</p>
                        </div>
                    </div>
                    <div class="flex flex-col items-end gap-2 shrink-0 pointer-events-none">
                        <div class="text-right flex justify-between md:block items-center w-full mb-2 md:mb-0">
                            <p class="text-xs text-slate-400">${isCreator ? 'Valor Requerido' : 'A sua Parte'}</p>
                            <span class="text-2xl font-bold ${isIncome ? 'text-emerald-400' : 'text-rose-400'}">R$ ${valDisplay.toFixed(2)}</span>
                        </div>
                        <button class="w-full md:w-auto px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 pointer-events-auto">
                            <i class="ph-fill ph-chat-circle-dots mr-2"></i> Abrir Chat
                        </button>
                    </div>
                </div>
            `;
        } else if (statusBadge === 'paid' || statusBadge === 'rejected' || statusBadge === 'resolved') {
            let icon = statusBadge === 'paid' ? 'check-circle' : 'x-circle';
            let color = statusBadge === 'paid' ? 'emerald' : 'rose';
            let txt = statusBadge === 'paid' ? 'Rateio Pago' : 'Recusou o rateio';
            
            if (isCreator) { txt = 'Rateio Resolvido (Todos Pagaram)'; color = 'slate'; icon = 'check-circle'; }

            htmlHistorico += `
                <div class="p-5 bg-slate-800/50 rounded-2xl border border-slate-700/50 flex items-center justify-between gap-4 opacity-70">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 bg-${color}-500/20 text-${color}-500"><i class="ph-fill ph-${icon}"></i></div>
                        <div>
                            <p class="font-bold text-slate-300">${txt}: ${tx.description}</p>
                            <p class="text-xs text-slate-500 mt-1">Valor base: R$ ${tx.amount.toFixed(2)}</p>
                        </div>
                    </div>
                    <button class="px-4 py-2 bg-slate-700 text-white rounded-lg text-xs font-bold hover:bg-slate-600 transition-colors" onclick="window.abrirChatInbox('${tx.id}')">Ver Chat</button>
                </div>
            `;
        }
    });

    document.getElementById('tab-pendentes').innerText = `Pendentes (${contPendentes})`;
    if (contPendentes === 0) {
        listPendentes.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-slate-500 animate-fade-in">
                <i class="ph-fill ph-check-circle text-6xl mb-4 opacity-30"></i>
                <p class="font-medium text-lg text-slate-400">Tudo limpo!</p>
                <p class="text-sm">Nenhuma pendência no momento.</p>
            </div>
        `;
    } else listPendentes.innerHTML = htmlPendentes;
    
    listHistorico.innerHTML = htmlHistorico || `<div class="text-center p-8 text-slate-500">Sem histórico.</div>`;

    if (currentChatTx) {
        const atualizada = inboxData.transactions.find(t => t.id === currentChatTx.id);
        if (atualizada) window.abrirChatInbox(atualizada.id);
    }
}

export function limparListenerInbox() {
    if (unsubscribeTx) { unsubscribeTx(); unsubscribeTx = null; }
    if (unsubscribeSp) { unsubscribeSp(); unsubscribeSp = null; }
}

window.responderConviteEspaco = async (spaceId, novoStatus) => {
    const user = auth.currentUser;
    const sp = inboxData.spaces.find(s => s.id === spaceId);
    if (!sp) return;

    let novosMembros = [...sp.membersData];
    const index = novosMembros.findIndex(m => m.email === user.email);
    if (index !== -1) { novosMembros[index].status = novoStatus; }

    let payload = { membersData: novosMembros };
    if (novoStatus === 'rejected') {
        payload.participantEmails = sp.participantEmails.filter(e => e !== user.email);
    }

    try { await updateDoc(doc(db, 'spaces', spaceId), payload); } 
    catch (err) { console.error(err); alert("Erro ao responder convite."); }
};

function configurarAbas() {
    const tabPend = document.getElementById('tab-pendentes');
    const tabHist = document.getElementById('tab-historico');
    const viewPend = document.getElementById('view-pendentes');
    const viewHist = document.getElementById('view-historico');

    tabPend.addEventListener('click', () => {
        tabPend.className = 'flex-1 md:px-6 py-2 text-sm font-bold rounded-lg bg-slate-700 text-amber-400 shadow transition-all';
        tabHist.className = 'flex-1 md:px-6 py-2 text-sm font-bold rounded-lg text-slate-500 hover:bg-slate-800 transition-all';
        viewPend.classList.remove('hidden'); viewHist.classList.add('hidden');
    });

    tabHist.addEventListener('click', () => {
        tabHist.className = 'flex-1 md:px-6 py-2 text-sm font-bold rounded-lg bg-slate-700 text-white shadow transition-all';
        tabPend.className = 'flex-1 md:px-6 py-2 text-sm font-bold rounded-lg text-slate-500 hover:bg-slate-800 transition-all';
        viewHist.classList.remove('hidden'); viewPend.classList.add('hidden');
    });
}

function injetarModalChat() {
    if (document.getElementById('modal-chat')) return;
    
    const html = `
    <div id="modal-chat" class="fixed inset-0 bg-black/80 z-[105] flex justify-center items-center p-4 hidden animate-fade-in">
        <div class="bg-darkcard w-full max-w-md rounded-3xl shadow-2xl border border-darkborder overflow-hidden flex flex-col h-[90vh]">
            <div class="p-5 bg-slate-800 border-b border-darkborder flex justify-between items-center shrink-0">
                <div>
                    <h3 id="chat-header-title" class="font-bold text-white text-lg leading-tight"></h3>
                    <p id="chat-header-creator" class="text-xs text-slate-400 mt-0.5"></p>
                </div>
                <button type="button" onclick="document.getElementById('modal-chat').classList.add('hidden'); window.currentChatTx = null;" class="text-slate-400 hover:text-rose-500 bg-slate-700 w-8 h-8 rounded-full flex items-center justify-center transition-colors">
                    <i class="ph ph-x text-lg"></i>
                </button>
            </div>
            
            <div class="p-4 bg-slate-900 border-b border-darkborder flex justify-between shrink-0">
                <div class="text-center flex-1 border-r border-slate-700">
                    <p class="text-[10px] uppercase text-slate-500 font-bold">Valor Total</p>
                    <p id="chat-total-val" class="text-lg font-bold text-slate-300"></p>
                </div>
                <div class="text-center flex-1">
                    <p class="text-[10px] uppercase text-slate-500 font-bold">A sua Parte</p>
                    <p id="chat-my-val" class="text-lg font-bold text-rose-400"></p>
                </div>
            </div>
            
            <div id="chat-messages" class="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-900 scroll-smooth"></div>
            
            <div id="chat-footer" class="p-5 bg-slate-800 border-t border-darkborder shrink-0 transition-all">
                <div id="state-default" class="animate-fade-in">
                    <div class="flex gap-2 mb-3">
                        <input type="text" id="chat-input" placeholder="Mensagem..." class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                        <button id="btn-send-msg" class="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-500 shrink-0 transition-colors">
                            <i class="ph-fill ph-paper-plane-right text-lg"></i>
                        </button>
                    </div>
                    <div id="chat-action-buttons"></div>
                </div>

                <div id="state-reject" class="hidden animate-fade-in space-y-3">
                    <p class="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2 border-b border-slate-700 pb-2">Motivo da Recusa</p>
                    <select id="reject-reason" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500">
                        <option>Não reconheço esta despesa</option>
                        <option>Já paguei por fora (Pix/Dinheiro)</option>
                        <option>O valor total está errado</option>
                    </select>
                    <div class="flex gap-2 pt-2">
                        <button class="btn-cancel-state flex-1 py-2 text-slate-400 font-bold text-xs hover:bg-slate-700 rounded-xl">Cancelar</button>
                        <button id="btn-confirm-reject" class="flex-1 py-2 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-500 shadow-lg">Confirmar Recusa</button>
                    </div>
                </div>

                <div id="state-contest" class="hidden animate-fade-in space-y-3">
                    <p class="text-xs font-bold text-amber-500 uppercase tracking-wider mb-2 border-b border-slate-700 pb-2">Sugerir Novo Valor</p>
                    <div class="flex items-center bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 focus-within:border-amber-500">
                        <span class="text-slate-500 text-sm font-bold mr-2">R$</span>
                        <input type="number" id="contest-val" step="0.01" placeholder="0.00" class="w-full bg-transparent p-0 text-white text-base focus:outline-none font-bold" />
                    </div>
                    <input type="text" id="contest-obs" placeholder="Justificativa (Ex: Eu comprei o carvão)" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500" />
                    <div class="flex gap-2 pt-2">
                        <button class="btn-cancel-state flex-1 py-2 text-slate-400 font-bold text-xs hover:bg-slate-700 rounded-xl">Cancelar</button>
                        <button id="btn-confirm-contest" class="flex-1 py-2 bg-amber-500 text-slate-900 font-bold text-xs rounded-xl hover:bg-amber-400 shadow-lg">Enviar Proposta</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', html);
    
    document.querySelectorAll('.btn-cancel-state').forEach(b => b.addEventListener('click', () => window.changeChatState('default')));
    
    const enviarMsg = async () => {
        const txt = document.getElementById('chat-input').value.trim();
        if(!txt || !currentChatTx) return;
        const user = auth.currentUser;
        const newMsg = { sender: user.email, text: txt, type: 'text', time: new Date().toISOString() };
        document.getElementById('chat-input').value = '';
        await updateDoc(doc(db, 'transactions', currentChatTx.id), { messages: arrayUnion(newMsg) });
    };
    document.getElementById('btn-send-msg').addEventListener('click', enviarMsg);
    document.getElementById('chat-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') enviarMsg(); });

    document.getElementById('btn-confirm-reject').addEventListener('click', async () => {
        const reason = document.getElementById('reject-reason').value;
        await processarNegociacao('rejected', `Recusado: ${reason}`);
    });

    document.getElementById('btn-confirm-contest').addEventListener('click', async () => {
        const newVal = parseFloat(document.getElementById('contest-val').value);
        const obs = document.getElementById('contest-obs').value;
        if(!newVal) return alert('Insira um valor.');
        await processarNegociacao('contested', `Propôs novo valor: R$ ${newVal.toFixed(2)}. Obs: ${obs}`, newVal);
    });

    window.aceitarDespesa = async (newVal = null) => {
        await processarNegociacao('accepted', `Aceitou a despesa. Vá à aba de Lançamentos para Efetivar/Pagar.`, newVal);
    };

    // A VALIDAÇÃO DO PAGAMENTO PELO CRIADOR DA DESPESA
    window.validarPagamento = async (guestEmail, isAccepted) => {
        if(!currentChatTx) return;
        const txRef = doc(db, 'transactions', currentChatTx.id);
        let novaLista = [...currentChatTx.splitParticipants];
        const guestIndex = novaLista.findIndex(p => p.email === guestEmail);
        if (guestIndex === -1) return;

        const guestPart = novaLista[guestIndex];
        const meuValor = guestPart.amount;

        if (isAccepted) {
            novaLista[guestIndex].status = 'paid';
            const newMsg = { sender: 'SYSTEM', text: `Pagamento de R$ ${meuValor.toFixed(2)} validado e recebido por ${auth.currentUser.email}.`, type: 'system', time: new Date().toISOString() };
            
            await updateDoc(txRef, { splitParticipants: novaLista, messages: arrayUnion(newMsg) });

            // CRIA A RECEITA DE REEMBOLSO NA CONTA DO CRIADOR
            await addDoc(collection(db, 'transactions'), {
                creatorId: currentChatTx.creatorId,
                creatorEmail: currentChatTx.creatorEmail,
                type: 'income',
                description: `Reembolso de Rateio: ${currentChatTx.description}`,
                amount: meuValor,
                category: 'Reembolso',
                categoryIcon: '💸',
                categoryColor: '#10b981',
                accountId: '', // Sem conta definida, ele vai ter de Efetivar para dizer onde caiu o dinheiro
                accountType: 'wallet',
                accountName: 'A Receber',
                launchDate: new Date().toISOString().split('T')[0],
                status: 'pending', 
                splitType: 'ind', recurrence: 'none',
                participantEmails: [currentChatTx.creatorEmail],
                splitParticipants: [{email: currentChatTx.creatorEmail, amount: meuValor, status: 'pending'}],
                spaceId: currentChatTx.spaceId || null,
                createdAt: new Date().toISOString()
            });
        } else {
            // CRIADOR RECUSOU O PAGAMENTO -> Muda para payment_rejected para que o convidado possa tentar novamente
            novaLista[guestIndex].status = 'payment_rejected';
            const newMsg = { sender: 'SYSTEM', text: `Pagamento recusado por ${auth.currentUser.email}. A dívida voltou a ficar pendente.`, type: 'system', time: new Date().toISOString() };
            await updateDoc(txRef, { splitParticipants: novaLista, messages: arrayUnion(newMsg) });
        }
        window.changeChatState('default');
    };
}

window.changeChatState = (state) => {
    document.getElementById('state-default').classList.add('hidden');
    document.getElementById('state-reject').classList.add('hidden');
    document.getElementById('state-contest').classList.add('hidden');
    document.getElementById(`state-${state}`).classList.remove('hidden');
};

async function processarNegociacao(newStatus, msgText, propValue = null) {
    if(!currentChatTx) return;
    const user = auth.currentUser;
    const txRef = doc(db, 'transactions', currentChatTx.id);
    
    const isCreator = currentChatTx.creatorEmail === user.email;
    let novaLista = [...currentChatTx.splitParticipants];
    
    if (isCreator && newStatus === 'accepted') {
        const pessoaContestando = novaLista.find(p => p.status === 'contested');
        if(pessoaContestando) {
            pessoaContestando.status = 'accepted';
            if (propValue) pessoaContestando.amount = propValue;
        }
    } else {
        const meuIndex = novaLista.findIndex(p => p.email === user.email);
        if(meuIndex !== -1) {
            novaLista[meuIndex].status = newStatus;
            if(newStatus === 'contested' && propValue) novaLista[meuIndex].proposedAmount = propValue;
            if(newStatus === 'accepted' && propValue) novaLista[meuIndex].amount = propValue;
        }
    }

    const newMsg = { sender: 'SYSTEM', text: `${user.email} ${msgText}`, type: 'system', time: new Date().toISOString() };

    await updateDoc(txRef, { splitParticipants: novaLista, messages: arrayUnion(newMsg) });
    window.changeChatState('default');
}

window.abrirChatInbox = (txId) => {
    const lista = window.transacoesInbox; 
    const tx = lista.find(t => t.id === txId);
    if (!tx) return;
    currentChatTx = tx;
    const user = auth.currentUser;

    const isCreator = tx.creatorEmail === user.email;
    const myPart = tx.splitParticipants.find(p => p.email === user.email) || tx.splitParticipants[0];

    document.getElementById('chat-header-title').innerText = tx.description;
    document.getElementById('chat-header-creator').innerText = `De: ${tx.creatorEmail}`;
    document.getElementById('chat-total-val').innerText = `R$ ${tx.amount.toFixed(2)}`;
    document.getElementById('chat-my-val').innerText = `R$ ${(myPart.amount || 0).toFixed(2)}`;

    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    
    const msgs = tx.messages || [];
    msgs.forEach(m => {
        if(m.type === 'system') {
            container.innerHTML += `<div class="text-center my-4"><span class="bg-slate-800 px-3 py-1 rounded-full text-[10px] text-slate-400 font-bold border border-slate-700"><i class="ph-fill ph-info mr-1"></i>${m.text}</span></div>`;
        } else {
            const isMe = m.sender === user.email;
            const timeStr = new Date(m.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            container.innerHTML += `
                <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-fade-in">
                    <span class="text-[10px] text-slate-500 mb-1">${isMe ? 'Você' : m.sender.split('@')[0]} - ${timeStr}</span>
                    <div class="p-3 text-sm max-w-[85%] ${isMe ? 'bg-indigo-600 text-white chat-bubble-right' : 'bg-slate-800 text-slate-200 border border-slate-700 chat-bubble-left'} shadow-sm">
                        ${m.text}
                    </div>
                </div>
            `;
        }
    });

    const actionsBox = document.getElementById('chat-action-buttons');
    const contestedPart = tx.splitParticipants.find(p => p.status === 'contested');
    const declaredPart = tx.splitParticipants.find(p => p.status === 'payment_declared');

    if (isCreator && contestedPart) {
        actionsBox.innerHTML = `
            <div class="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 mb-3">
                <p class="text-xs text-amber-500 font-bold mb-1">Contraproposta recebida: R$ ${contestedPart.proposedAmount.toFixed(2)}</p>
                <div class="flex gap-2 mt-2">
                    <button class="flex-1 py-2 bg-rose-500/20 text-rose-400 rounded-lg text-xs font-bold" onclick="window.aceitarDespesa(null)">Recusar Proposta</button>
                    <button class="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold" onclick="window.aceitarDespesa(${contestedPart.proposedAmount})">Aceitar Novo Valor</button>
                </div>
            </div>
        `;
    } else if (isCreator && declaredPart) {
        actionsBox.innerHTML = `
            <div class="bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20 mb-3">
                <p class="text-xs text-indigo-400 font-bold mb-1">${declaredPart.email.split('@')[0]} declarou pagamento de R$ ${declaredPart.amount.toFixed(2)}</p>
                <div class="flex gap-2 mt-2">
                    <button class="flex-1 py-2 bg-rose-500/20 text-rose-400 rounded-lg text-xs font-bold hover:bg-rose-500/30" onclick="window.validarPagamento('${declaredPart.email}', false)">Não Recebi</button>
                    <button class="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-500" onclick="window.validarPagamento('${declaredPart.email}', true)">Validar e Receber</button>
                </div>
            </div>
        `;
    } else if (!isCreator && myPart.status === 'payment_rejected') {
        actionsBox.innerHTML = `
            <div class="text-center p-4 bg-rose-500/10 rounded-xl border border-rose-500/20 text-xs text-rose-400 mb-2">
                <i class="ph-fill ph-warning-circle text-2xl mb-1"></i><br>
                <strong>Pagamento Recusado!</strong><br>
                O criador informou que não recebeu o valor. A dívida voltou para o seu extrato como Pendente.
            </div>
        `;
    } else if (!isCreator && myPart.status === 'accepted') {
        actionsBox.innerHTML = `
            <div class="text-center p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-xs text-emerald-400 mb-2">
                <i class="ph-fill ph-check-circle text-2xl mb-1"></i><br>
                <strong>Você aceitou esta dívida!</strong><br>
                Ela já aparece no seu Extrato. Para enviar o comprovativo para o criador, vá à aba <strong class="text-white">Lançamentos</strong> e clique em Efetivar.
            </div>
        `;
    } else if (!isCreator && myPart.status === 'payment_declared') {
        actionsBox.innerHTML = `
            <div class="text-center p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-xs text-indigo-400 mb-2">
                <i class="ph-fill ph-hourglass text-2xl mb-1"></i><br>
                <strong>Aguardando Validação!</strong><br>
                Você informou o pagamento. O criador precisa confirmar o recebimento do dinheiro.
            </div>
        `;
    } else if (!isCreator && (!myPart.status || myPart.status === 'pending')) {
        actionsBox.innerHTML = `
            <button class="w-full py-2 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl text-xs font-bold hover:bg-amber-500/20 transition-colors mb-2" onclick="window.changeChatState('contest')">
                <i class="ph-fill ph-scales mr-1"></i> Contestar Valor
            </button>
            <div class="flex gap-2">
                <button class="flex-1 py-2.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-bold hover:bg-rose-500/20" onclick="window.changeChatState('reject')">Recusar</button>
                <button class="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-500" onclick="window.aceitarDespesa()">Aceitar</button>
            </div>
        `;
    } else {
        actionsBox.innerHTML = `<div class="text-center p-3 bg-slate-900 rounded-xl border border-slate-700 text-xs font-bold text-slate-500"><i class="ph-fill ph-lock-key mr-1"></i> Ação Finalizada</div>`;
    }

    document.getElementById('modal-chat').classList.remove('hidden');
    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
};