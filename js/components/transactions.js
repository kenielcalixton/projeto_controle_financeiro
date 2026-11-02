// js/components/transactions.js
import { auth, db } from '../config/firebase.js';
import { collection, query, where, onSnapshot, doc, deleteDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { abrirModalTransacao } from './transactionModal.js';

let unsubscribeTransactions = null;
let currentFilter = 'all'; 

export function renderizarLancamentos() {
    const main = document.getElementById('main-content');
    const user = auth.currentUser;
    if (!user) return;

    // 1. Injeção do Esqueleto + Modal Dinâmico
    main.innerHTML = `
        <div class="max-w-7xl mx-auto w-full flex flex-col h-full animate-fade-in relative">
            
            <div class="flex justify-between items-center mb-4 shrink-0">
                <h2 class="text-2xl font-bold text-white">Lançamentos</h2>
                <div class="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
                    <button class="px-4 py-1.5 text-sm font-bold rounded-lg bg-slate-700 text-indigo-400 shadow transition-all">Este Mês</button>
                </div>
            </div>

            <!-- Filtros Rápidos -->
            <div class="flex gap-2 mb-4 overflow-x-auto pb-2 shrink-0" id="filter-bar" style="scrollbar-width: none;">
                <button class="filter-btn shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition-colors bg-indigo-600 text-white border-indigo-500 shadow-md" data-filter="all">Todos</button>
                <button class="filter-btn shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition-colors bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700" data-filter="income">Receitas</button>
                <button class="filter-btn shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition-colors bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700" data-filter="expense">Despesas</button>
                <button class="filter-btn shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition-colors bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700" data-filter="pending">Pendentes/Vencidos</button>
            </div>

            <!-- Lista Responsiva -->
            <div class="bg-darkcard border border-darkborder rounded-3xl flex-1 overflow-hidden shadow-sm flex flex-col min-h-[300px]">
                <div class="hidden md:grid grid-cols-12 gap-4 p-4 border-b border-darkborder bg-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider sticky top-0 z-10">
                    <div class="col-span-2">Situação</div>
                    <div class="col-span-2">Data</div>
                    <div class="col-span-3">Descrição & Origem</div>
                    <div class="col-span-2">Categoria</div>
                    <div class="col-span-2 text-right">A Sua Parte</div>
                    <div class="col-span-1 text-right">Ações</div>
                </div>
                <div id="lista-lancamentos" class="overflow-y-auto flex-1 divide-y divide-darkborder bg-darkcard">
                    <div class="text-center p-8 text-slate-500"><i class="ph ph-spinner animate-spin text-2xl mb-2"></i><br>A carregar lançamentos...</div>
                </div>
            </div>

            <!-- Totalizadores -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 shrink-0 pb-4" id="cards-totais"></div>
            
            <!-- MODAL DE EFETIVAÇÃO DINÂMICO -->
            <div id="modal-efetivar" class="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4 hidden animate-fade-in">
                <form id="form-efetivar" class="bg-darkcard w-full max-w-sm rounded-3xl p-6 border border-darkborder shadow-2xl flex flex-col">
                    <div class="flex justify-between items-center mb-4">
                        <h2 id="modal-efetivar-title" class="text-lg font-bold text-white">Confirmar</h2>
                        <button type="button" id="btn-close-efetivar" class="text-slate-400 hover:text-rose-500"><i class="ph ph-x text-xl"></i></button>
                    </div>
                    <p class="text-sm text-slate-400 mb-4" id="efetivar-desc">Confirme a data de efetivação.</p>
                    
                    <input type="hidden" id="efetivar-id" />
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
        </div>
    `;

    // Eventos de Filtro
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => {
                b.className = "filter-btn shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition-colors bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700";
            });
            e.target.className = "filter-btn shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition-colors bg-indigo-600 text-white border-indigo-500 shadow-md";
            currentFilter = e.target.dataset.filter;
            if (window.lastTransactionsSnapshot) processarDadosTabela(window.lastTransactionsSnapshot);
        });
    });

    // Eventos do Modal Efetivar
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
            const docRef = doc(db, 'transactions', id);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const txData = docSnap.data();
                const myEmail = auth.currentUser.email;

                // Prepara a atualização forçando a mudança no documento principal
                let payload = { status: 'paid', paymentDate: dataPagamento };

                // Se houver array de participantes (rateio ou não), garante que atualiza a NOSSA parte
                if (txData.splitParticipants && txData.splitParticipants.length > 0) {
                    const updatedParticipants = txData.splitParticipants.map(p => {
                        if (p.email === myEmail) {
                            return { ...p, status: 'paid', paymentDate: dataPagamento };
                        }
                        return p;
                    });
                    payload.splitParticipants = updatedParticipants;
                }
                
                await updateDoc(docRef, payload); // Dispara a atualização dupla (Bug resolvido!)
            }
            fecharModalEfetivar();
        } catch (error) {
            console.error(error);
            alert("Erro ao efetivar lançamento.");
        } finally {
            btnSave.disabled = false;
            btnSave.innerText = originalText;
        }
    });

    // Listener de Transações
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
}

function processarDadosTabela(todasTransacoes) {
    const user = auth.currentUser;
    const containerLista = document.getElementById('lista-lancamentos');
    const cardsTotais = document.getElementById('cards-totais');
    containerLista.innerHTML = '';

    let recEfetivado = 0, recPrevisto = 0;
    let despEfetivado = 0, despPrevisto = 0, despVencido = 0;
    const hoje = new Date().toISOString().split('T')[0];

    let transacoesFiltradas = todasTransacoes.filter(tx => {
        const myPart = tx.splitParticipants ? tx.splitParticipants.find(p => p.email === user.email) : null;
        const meuValor = myPart ? myPart.amount : tx.amount;
        const status = myPart ? myPart.status : (tx.status || 'pending');
        const isVencido = (tx.launchDate < hoje && status !== 'paid' && status !== 'accepted');

        if (tx.type === 'income') {
            recPrevisto += meuValor;
            if (status === 'paid' || status === 'accepted') recEfetivado += meuValor;
        } else {
            despPrevisto += meuValor;
            if (status === 'paid' || status === 'accepted') despEfetivado += meuValor;
            else if (isVencido) despVencido += meuValor;
        }

        if (currentFilter === 'income') return tx.type === 'income';
        if (currentFilter === 'expense') return tx.type === 'expense';
        if (currentFilter === 'pending') return (status !== 'paid' && status !== 'accepted');
        return true; 
    });

    transacoesFiltradas.sort((a, b) => new Date(b.launchDate) - new Date(a.launchDate));

    if (transacoesFiltradas.length === 0) {
        containerLista.innerHTML = `<div class="text-center p-8 text-slate-500 font-medium">Nenhum lançamento encontrado.</div>`;
    } else {
        transacoesFiltradas.forEach(tx => {
            const myPart = tx.splitParticipants ? tx.splitParticipants.find(p => p.email === user.email) : null;
            const meuValor = myPart ? (myPart.amount || 0) : tx.amount;
            const totalOriginal = tx.amount;
            
            const isIncome = tx.type === 'income';
            const sinal = isIncome ? '+' : '-';
            const corValor = isIncome ? 'text-emerald-500' : 'text-rose-500';
            
            let status = myPart ? myPart.status : (tx.status || 'pending');
            let isVencido = (tx.launchDate < hoje && status !== 'paid' && status !== 'accepted');
            
            let statusBadge = '';
            let cardClass = '';

            if (status === 'paid' || status === 'accepted') {
                statusBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 flex items-center w-max"><i class="ph-fill ph-check-circle mr-1"></i> Efetivado</span>`;
                cardClass = 'opacity-70 hover:opacity-100';
            } else if (isVencido) {
                statusBadge = `<button class="btn-quick-efetivar px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 flex items-center w-max hover:bg-rose-500 hover:text-white transition-colors cursor-pointer border border-rose-500/30" data-id="${tx.id}"><i class="ph-fill ph-warning-circle mr-1"></i> Vencido (Efetivar)</button>`;
                cardClass = 'bg-rose-500/5 hover:bg-rose-500/10';
            } else {
                statusBadge = `<button class="btn-quick-efetivar px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-500 flex items-center w-max hover:bg-amber-500 hover:text-white transition-colors cursor-pointer border border-amber-500/30" data-id="${tx.id}"><i class="ph-fill ph-clock mr-1"></i> Pendente (Efetivar)</button>`;
            }

            let tagsDescricao = '';
            if (tx.splitParticipants && tx.splitParticipants.length > 1) tagsDescricao += `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-400 uppercase border border-indigo-500/20 mt-1 sm:mt-0">Rateio</span> `;
            if (tx.installments > 1) tagsDescricao += `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-700 text-slate-300 uppercase border border-slate-600 mt-1 sm:mt-0">${tx.currentInstallment}/${tx.installments}</span>`;

            let metaHTML = `<span class="flex items-center gap-1"><i class="ph-fill ph-bank text-slate-400"></i> Conta Padrão</span>`;
            if (tx.spaceId) metaHTML += `<span class="text-slate-700 hidden sm:inline">•</span><span class="flex items-center gap-1 text-indigo-400/70"><i class="ph-fill ph-users"></i> Espaço</span>`;

            const catNome = tx.category || 'Outros';
            
            containerLista.innerHTML += `
                <div class="flex flex-col md:grid md:grid-cols-12 md:gap-4 md:items-center p-4 border-b border-darkborder hover:bg-slate-800/50 transition-colors group ${cardClass}">
                    <div class="flex justify-between items-start md:items-center mb-3 md:mb-0 md:col-span-2">
                        ${statusBadge}
                        <div class="flex space-x-3 md:hidden">
                            <button class="btn-edit text-slate-500 hover:text-indigo-400 bg-slate-800 p-1.5 rounded-lg" data-id="${tx.id}"><i class="ph ph-pencil-simple text-lg pointer-events-none"></i></button>
                            <button class="btn-delete text-slate-500 hover:text-rose-400 bg-slate-800 p-1.5 rounded-lg" data-id="${tx.id}"><i class="ph ph-trash text-lg pointer-events-none"></i></button>
                        </div>
                    </div>
                    <div class="text-[11px] md:text-sm text-slate-400 md:text-slate-300 mb-2 md:mb-0 md:col-span-2">
                        <span class="md:hidden font-bold uppercase mr-1">Data:</span>${tx.launchDate.split('-').reverse().join('/')}
                    </div>
                    <div class="mb-3 md:mb-0 md:col-span-3">
                        <div class="flex flex-col sm:flex-row sm:items-center sm:gap-2 mb-1.5">
                            <p class="text-sm font-bold text-white leading-tight">${tx.description}</p>
                            <div class="flex gap-1">${tagsDescricao}</div>
                        </div>
                        <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">${metaHTML}</div>
                    </div>
                    <div class="flex justify-between items-end md:contents">
                        <div class="md:col-span-2">
                            <span class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-700 text-slate-300 flex items-center w-max"><i class="ph-fill ph-tag mr-1.5"></i> ${catNome}</span>
                        </div>
                        <div class="text-right md:col-span-2">
                            <p class="text-sm font-bold ${corValor}">${sinal} R$ ${meuValor.toFixed(2)}</p>
                            ${(tx.splitParticipants && tx.splitParticipants.length > 1) ? `<p class="text-[10px] text-slate-500 font-medium mt-1">Total: R$ ${totalOriginal.toFixed(2)}</p>` : ''}
                        </div>
                    </div>
                    <div class="hidden md:flex justify-end space-x-2 md:col-span-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="btn-edit text-slate-500 hover:text-indigo-400" data-id="${tx.id}"><i class="ph ph-pencil-simple text-lg pointer-events-none"></i></button>
                        <button class="btn-delete text-slate-500 hover:text-rose-400" data-id="${tx.id}"><i class="ph ph-trash text-lg pointer-events-none"></i></button>
                    </div>
                </div>
            `;
        });
    }

    // A MÁGICA: Modal Inteligente que sabe se é Receita ou Despesa
    document.querySelectorAll('.btn-quick-efetivar').forEach(btn => btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const tx = todasTransacoes.find(t => t.id === id);
        
        document.getElementById('efetivar-id').value = id;
        document.getElementById('efetivar-data').value = hoje; 
        
        const modalTitle = document.getElementById('modal-efetivar-title');
        const modalDesc = document.getElementById('efetivar-desc');
        const modalLabel = document.getElementById('efetivar-label-data');
        const btnSave = document.getElementById('btn-save-efetivar');

        if (tx.type === 'income') {
            modalTitle.innerText = 'Confirmar Recebimento';
            modalDesc.innerText = 'Confirme a data em que o dinheiro entrou na conta.';
            modalLabel.innerText = 'Data de Recebimento';
            btnSave.className = 'px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 transition-colors';
        } else {
            modalTitle.innerText = 'Confirmar Pagamento';
            modalDesc.innerText = 'Confirme a data em que o dinheiro saiu da conta.';
            modalLabel.innerText = 'Data de Pagamento';
            btnSave.className = 'px-4 py-2 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-500 transition-colors';
        }

        document.getElementById('modal-efetivar').classList.remove('hidden');
    }));

    document.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const tx = todasTransacoes.find(t => t.id === id);
        if(tx) abrirModalTransacao('editar', tx); 
    }));

    document.querySelectorAll('.btn-delete').forEach(btn => btn.addEventListener('click', async (e) => {
        if(confirm('Tem a certeza que deseja excluir este lançamento?')) {
            await deleteDoc(doc(db, 'transactions', e.currentTarget.dataset.id)); 
        }
    }));

    const saldoAtual = recEfetivado - despEfetivado;
    const saldoProjetado = recPrevisto - despPrevisto;

    cardsTotais.innerHTML = `
        <!-- ... Totalizadores (O HTML mantém-se inalterado) ... -->
        <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex flex-col justify-between shadow-sm">
            <div class="flex justify-between items-start mb-3">
                <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Receitas</p>
                <div class="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-lg"><i class="ph-fill ph-trend-up"></i></div>
            </div>
            <div>
                <p class="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Efetivado (Atual)</p>
                <p class="text-2xl font-bold text-emerald-500 mb-2">R$ ${recEfetivado.toFixed(2)}</p>
                <div class="flex justify-between items-center text-xs font-medium border-t border-slate-700/50 pt-2.5 mt-1">
                    <span class="text-slate-400">Total Previsto</span>
                    <span class="text-emerald-400/70 font-bold">R$ ${recPrevisto.toFixed(2)}</span>
                </div>
            </div>
        </div>
        
        <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden shadow-sm">
            ${despVencido > 0 ? `<div class="absolute left-0 top-0 bottom-0 w-1 bg-rose-500 animate-pulse"></div>` : ''}
            <div class="flex justify-between items-start mb-3 pl-2">
                <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Despesas</p>
                <div class="w-8 h-8 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center text-lg"><i class="ph-fill ph-trend-down"></i></div>
            </div>
            <div class="pl-2">
                <p class="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Efetivado (Pago)</p>
                <p class="text-2xl font-bold text-white mb-2">- R$ ${despEfetivado.toFixed(2)}</p>
                <div class="flex justify-between items-center text-[11px] font-medium border-t border-slate-700/50 pt-2.5 mt-1">
                    ${despVencido > 0 ? `<span class="text-slate-400 flex items-center"><i class="ph-fill ph-warning-circle text-rose-500 mr-1"></i> Vencido: <strong class="text-rose-400 ml-1"> R$ ${despVencido.toFixed(2)}</strong></span>` : `<span class="text-slate-400">Em dia</span>`}
                    <span class="text-slate-400">Previsto: <strong class="text-slate-200">R$ ${despPrevisto.toFixed(2)}</strong></span>
                </div>
            </div>
        </div>

        <div class="bg-indigo-600/10 border border-indigo-500/30 p-5 rounded-2xl flex flex-col justify-between shadow-sm">
            <div class="flex justify-between items-start mb-3">
                <p class="text-xs font-bold text-indigo-300 uppercase tracking-wider">Saldo Líquido</p>
                <div class="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-lg"><i class="ph-fill ph-wallet"></i></div>
            </div>
            <div>
                <p class="text-[10px] text-indigo-300/70 font-bold uppercase mb-0.5">Atual (Real)</p>
                <p class="text-2xl font-bold text-indigo-400 mb-2">R$ ${saldoAtual.toFixed(2)}</p>
                <div class="flex justify-between items-center text-xs font-medium border-t border-indigo-500/20 pt-2.5 mt-1">
                    <span class="text-indigo-300/70">Projetado</span>
                    <span class="text-indigo-300 font-bold">R$ ${saldoProjetado.toFixed(2)}</span>
                </div>
            </div>
        </div>
    `;
}