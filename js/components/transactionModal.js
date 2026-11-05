// js/components/transactionModal.js
import { auth, db } from '../config/firebase.js';
import { processarNotificacaoEmail } from '../services/emailService.js';
import { collection, addDoc, updateDoc, doc, deleteDoc, getDocs, query, where, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let isModalInjected = false;
let modoAtual = 'criar';
let txEditId = null;
let txEditDadosAntigos = null;
window.categoriasCarregadas = [];
window.todasContasCarregadas = []; 

export async function excluirTransacaoUniversal(tx) {
    if (!confirm('Tem a certeza que deseja excluir este lançamento globalmente?')) return false;
    try {
        if (tx.linkedPaymentId) {
            const q = query(collection(db, 'transactions'), where('linkedPaymentId', '==', tx.linkedPaymentId));
            const snaps = await getDocs(q);
            const promises = [];
            snaps.forEach(docSnap => promises.push(deleteDoc(docSnap.ref)));
            await Promise.all(promises);
        } else {
            await deleteDoc(doc(db, 'transactions', tx.id));
        }
        return true;
    } catch (error) {
        console.error(error); alert("Erro ao excluir transação."); return false;
    }
}

export async function recusarTransacaoPartilhada(tx) {
    if (!confirm('Deseja remover este lançamento da sua conta? O criador será notificado e o valor voltará para a Inbox dele.')) return false;
    try {
        const user = auth.currentUser;
        const novaLista = [...tx.splitParticipants];
        const meuIndex = novaLista.findIndex(p => p.email === user.email);
        if (meuIndex !== -1) {
            novaLista[meuIndex].status = 'rejected';
        }
        const newMsg = { sender: 'SYSTEM', text: `${user.email} removeu a despesa do seu extrato (Recusado).`, type: 'system', time: new Date().toISOString() };
        
        await updateDoc(doc(db, 'transactions', tx.id), {
            splitParticipants: novaLista,
            messages: arrayUnion(newMsg)
        });
        return true;
    } catch (e) {
        console.error(e); alert("Erro ao recusar."); return false;
    }
}

export function abrirDetalheTransacao(tx) {
    const user = auth.currentUser;
    if (!isModalInjected) { injetarHTMLDoModal(); configurarEventosBase(); configurarEventosGestorCategorias(); isModalInjected = true; }
    
    document.getElementById('drawer-tx-backdrop').classList.remove('hidden');
    document.getElementById('drawer-tx-detail').classList.remove('hidden');
    
    setTimeout(() => {
        document.getElementById('drawer-tx-backdrop').classList.remove('opacity-0');
        document.getElementById('drawer-tx-panel').classList.remove('translate-x-full');
    }, 10);

    const isCreator = !tx.creatorEmail || tx.creatorEmail === user.email;
    const isIncome = tx.type === 'income';
    const myPart = tx.splitParticipants ? tx.splitParticipants.find(p => p.email === user.email) : null;
    const meuValor = myPart ? parseFloat(myPart.amount) : parseFloat(tx.amount || 0);

    document.getElementById('dt-icon').className = `w-12 h-12 flex items-center justify-center rounded-xl border text-2xl shadow-inner ${isIncome ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' : 'bg-rose-500/20 text-rose-500 border-rose-500/30'}`;
    document.getElementById('dt-icon').innerHTML = isIncome ? '<i class="ph-fill ph-trend-up"></i>' : '<i class="ph-fill ph-trend-down"></i>';
    
    document.getElementById('dt-title').innerText = tx.description;
    document.getElementById('dt-amount').innerText = `R$ ${meuValor.toFixed(2)}`;
    document.getElementById('dt-amount').className = `text-4xl font-bold mt-2 ${isIncome ? 'text-emerald-500' : 'text-rose-500'}`;
    
    const myStatus = myPart ? myPart.status : (tx.status || 'pending');
    document.getElementById('dt-status').innerHTML = (myStatus === 'paid' || myStatus === 'accepted') ? `<span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400"><i class="ph-fill ph-check-circle"></i> Efetivado</span>` : `<span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-500"><i class="ph-fill ph-clock"></i> Pendente</span>`;

    document.getElementById('dt-date').innerText = tx.launchDate.split('-').reverse().join('/');
    
    const catColor = tx.categoryColor || '#64748b';
    document.getElementById('dt-category').innerHTML = `<span class="mr-1.5">${tx.categoryIcon || '📌'}</span> ${tx.category || 'Outros'}`;
    document.getElementById('dt-category').style.backgroundColor = `${catColor}20`;
    document.getElementById('dt-category').style.color = catColor;
    document.getElementById('dt-category').style.borderColor = `${catColor}40`;

    document.getElementById('dt-account').innerHTML = `<i class="ph-fill ${tx.accountType === 'credit' ? 'ph-credit-card text-purple-400' : 'ph-bank text-indigo-400'} text-lg"></i> ${tx.accountName || 'Desconhecida'}`;

    let extras = '';
    
    if (tx.splitParticipants && tx.splitParticipants.length > 1 && !tx.isVirtualInvoice) {
        extras += `<div class="flex justify-between items-center border-b border-slate-700/50 pb-3 mt-4"><span class="text-xs font-bold text-slate-400 uppercase">Valor Total Original</span><span class="text-sm font-bold text-slate-300">R$ ${parseFloat(tx.amount).toFixed(2)}</span></div>`;
        if (!isCreator) {
            extras += `<div class="flex justify-between items-center border-b border-slate-700/50 pb-3 mt-4"><span class="text-xs font-bold text-slate-400 uppercase">Criado por</span><span class="text-sm font-bold text-indigo-400 flex items-center gap-1.5"><i class="ph-fill ph-user-circle"></i> ${tx.creatorEmail.split('@')[0]}</span></div>`;
        }
    }

    if (tx.recurrence === 'installments') extras += `<div class="flex justify-between items-center text-sm font-bold text-slate-300 border-b border-slate-700/50 pb-3 mt-4"><span class="text-slate-400 uppercase text-xs">Parcela</span> ${tx.currentInstallment} de ${tx.installmentsTotal}</div>`;
    if (tx.recurrence === 'fixed') extras += `<div class="flex items-center text-sm font-bold text-indigo-400 mt-4"><i class="ph-bold ph-arrows-clockwise mr-2"></i> Despesa Fixa</div>`;
    
    document.getElementById('dt-extras').innerHTML = extras;

    const btnDel = document.getElementById('btn-dt-delete');
    const btnEdit = document.getElementById('btn-dt-edit');
    
    const newBtnDel = btnDel.cloneNode(true); btnDel.replaceWith(newBtnDel);
    const newBtnEdit = btnEdit.cloneNode(true); btnEdit.replaceWith(newBtnEdit);

    if (isCreator) {
        newBtnEdit.classList.remove('hidden');
        newBtnDel.innerHTML = '<i class="ph ph-trash text-lg"></i> Apagar Total';
        newBtnDel.addEventListener('click', async () => {
            const deleted = await excluirTransacaoUniversal(tx);
            if(deleted) fecharDetalheTransacao();
        });
        newBtnEdit.addEventListener('click', () => {
            fecharDetalheTransacao();
            setTimeout(() => abrirModalTransacao('editar', tx), 300);
        });
    } else {
        newBtnEdit.classList.add('hidden'); 
        newBtnDel.innerHTML = '<i class="ph ph-trash text-lg"></i> Remover/Recusar minha parte';
        newBtnDel.addEventListener('click', async () => {
            const rejected = await recusarTransacaoPartilhada(tx);
            if(rejected) fecharDetalheTransacao();
        });
    }
}

function fecharDetalheTransacao() {
    document.getElementById('drawer-tx-panel').classList.add('translate-x-full');
    document.getElementById('drawer-tx-backdrop').classList.add('opacity-0');
    setTimeout(() => {
        document.getElementById('drawer-tx-detail').classList.add('hidden');
        document.getElementById('drawer-tx-backdrop').classList.add('hidden');
    }, 300);
}

export async function abrirModalTransacao(modo = 'criar', dados = null) {
    const user = auth.currentUser;
    if (!user) return;
    modoAtual = modo;
    txEditId = dados ? dados.id : null;
    txEditDadosAntigos = dados;

    if (!isModalInjected) { injetarHTMLDoModal(); configurarEventosBase(); configurarEventosGestorCategorias(); isModalInjected = true; }

    const form = document.getElementById('form-transaction');
    form.reset();
    document.getElementById('input-date').valueAsDate = new Date();
    document.getElementById('select-category').value = ''; 
    document.getElementById('custom-cat-selected').innerHTML = '<span class="text-slate-500 text-sm">A carregar...</span>';
    
    window.txState = {
        type: 'expense', recurrence: 'none', splitMode: 'ind',
        originType: (dados && dados.accountType === 'credit') ? 'credit' : 'wallet',
        participants: [{ id: 'me', name: 'Sua Parte', email: user.email, amount: 0 }]
    };
    
    // FORÇA O BLOQUEIO VISUAL IMEDIATO DO VENCIMENTO ANTES DO CARREGAMENTO
    atualizarToggleOrigemUI();
    atualizarUI();

    const btnSubmit = document.getElementById('btn-submit-tx');
    btnSubmit.innerText = 'A carregar...'; btnSubmit.disabled = true;

    try {
        const qContas = query(collection(db, 'accounts'), where('userId', '==', user.uid));
        const snapContas = await getDocs(qContas);
        window.todasContasCarregadas = snapContas.docs.map(d => ({ id: d.id, ...d.data() }));
        
        atualizarToggleOrigemUI(); // Re-aplica após carregar os dados reais

        const qEspacos = query(collection(db, 'spaces'), where('participantEmails', 'array-contains', user.email));
        const snapEspacos = await getDocs(qEspacos);
        const selectSpace = document.getElementById('space-selector');
        selectSpace.innerHTML = '<option value="">Nenhum (Individual)</option>';
        window.espacosCarregados = [];
        snapEspacos.forEach(docSnap => {
            const sp = docSnap.data();
            if(!sp.isIndividual) { window.espacosCarregados.push({ id: docSnap.id, ...sp }); selectSpace.innerHTML += `<option value="${docSnap.id}">${sp.icon} ${sp.name}</option>`; }
        });

        await carregarCategorias(dados ? dados.category : null);

        if (modo === 'editar' && dados) {
            document.getElementById('modal-tx-title').innerText = dados.isOverrideMode ? 'Editar Exceção (Este Mês)' : 'Editar Lançamento';
            
            if (dados.type === 'income') { window.txState.type = 'income'; } 
            else { window.txState.type = 'expense'; }
            
            window.txState.recurrence = dados.recurrence || 'none';
            if (dados.recurrence === 'installments') {
                document.getElementById('current-inst').value = dados.currentInstallment || '';
                document.getElementById('total-inst').value = dados.installmentsTotal || '';
            }
            atualizarUI();
            
            document.getElementById('input-desc').value = dados.description || '';
            document.getElementById('input-amount').value = dados.amount || '';
            document.getElementById('input-date').value = dados.launchDate || '';
            
            if (dados.accountId) { 
                document.getElementById('select-account').value = dados.accountId; 
            }
            
            window.txState.splitMode = dados.splitType || 'ind';
            if (dados.splitParticipants && dados.splitParticipants.length > 0) {
                window.txState.participants = dados.splitParticipants.map(p => ({
                    id: p.email === user.email ? 'me' : (p.id || Math.random().toString(36).substr(2, 5)),
                    name: p.email === user.email ? 'Sua Parte' : (p.name || p.email),
                    email: p.email,
                    amount: p.amount || 0
                }));
            }

            ['ind', 'space', 'avulso'].forEach(m => {
                document.getElementById(`btn-split-${m}`).className = 'split-btn flex-1 py-2 text-xs font-bold rounded-lg border bg-slate-800 border-slate-700 text-slate-400';
            });
            document.getElementById(`btn-split-${window.txState.splitMode}`).className = 'split-btn flex-1 py-2 text-xs font-bold rounded-lg border bg-indigo-600 border-indigo-500 text-white';

            document.getElementById('box-space').classList.add('hidden'); 
            document.getElementById('box-avulso').classList.add('hidden'); 
            document.getElementById('box-math').classList.add('hidden');

            if (window.txState.splitMode === 'space') {
                document.getElementById('box-space').classList.remove('hidden');
                document.getElementById('box-math').classList.remove('hidden');
                if (dados.spaceId) selectSpace.value = dados.spaceId;
            } else if (window.txState.splitMode === 'avulso') {
                document.getElementById('box-avulso').classList.remove('hidden');
                document.getElementById('box-math').classList.remove('hidden');
                renderAvulsoInputs();
            }
            
            renderMathInputs(); 
        } else {
            document.getElementById('modal-tx-title').innerText = 'Novo Lançamento';
        }
        btnSubmit.innerText = modo === 'editar' ? 'Salvar Alterações' : 'Salvar Lançamento'; btnSubmit.disabled = false;
    } catch (e) { console.error("Erro:", e); btnSubmit.innerText = 'Erro ao carregar'; }

    document.getElementById('modal-overlay').classList.remove('hidden');
}

// CORREÇÃO CIRÚRGICA DO VENCIMENTO: Totalmente desvinculado do HTML event
function atualizarToggleOrigemUI() {
    const btnWallet = document.getElementById('btn-orig-wallet'); 
    const btnCredit = document.getElementById('btn-orig-credit'); 
    const selectAcc = document.getElementById('select-account');
    
    const isCredit = window.txState.originType === 'credit';

    if (isCredit) {
        btnCredit.className = 'flex-1 py-2 text-sm font-bold rounded-lg bg-slate-700 text-purple-400 shadow transition-all flex items-center justify-center gap-2';
        btnWallet.className = 'flex-1 py-2 text-sm font-bold rounded-lg text-slate-500 hover:bg-slate-800 transition-all flex items-center justify-center gap-2';
        
        // ESCONDE O VENCIMENTO DE FORMA INQUEBRÁVEL
        document.getElementById('box-due-date').classList.add('hidden');
        document.getElementById('box-credit-info').classList.remove('hidden');
    } else {
        btnWallet.className = 'flex-1 py-2 text-sm font-bold rounded-lg bg-slate-700 text-indigo-400 shadow transition-all flex items-center justify-center gap-2';
        btnCredit.className = 'flex-1 py-2 text-sm font-bold rounded-lg text-slate-500 hover:bg-slate-800 transition-all flex items-center justify-center gap-2';
        
        // MOSTRA O VENCIMENTO DE FORMA INQUEBRÁVEL
        document.getElementById('box-due-date').classList.remove('hidden');
        document.getElementById('box-credit-info').classList.add('hidden');
    }

    if (!window.todasContasCarregadas) return;

    selectAcc.innerHTML = '';
    const contasFiltradas = window.todasContasCarregadas.filter(c => isCredit ? c.type === 'credit' : c.type !== 'credit');
    
    if (contasFiltradas.length === 0) {
        selectAcc.innerHTML = '<option value="" disabled selected>Nenhuma cadastrada</option>';
    } else {
        contasFiltradas.forEach(acc => selectAcc.innerHTML += `<option value="${acc.id}" data-type="${acc.type}">${acc.type === 'credit' ? '💳' : '🏦'} ${acc.name}</option>`);
    }
}

async function carregarCategorias(categoriaSelecionada = null) {
    const user = auth.currentUser;
    if (!user) return;
    try {
        const q = query(collection(db, 'categories'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        window.categoriasCarregadas = [];
        if (snap.empty) {
            const defaultCats = [
                { nome: 'Alimentação', icon: '🍔', color: '#f97316' }, { nome: 'Casa', icon: '🏠', color: '#3b82f6' },
                { nome: 'Transporte', icon: '🚗', color: '#0ea5e9' }, { nome: 'Saúde', icon: '💊', color: '#ef4444' }
            ];
            for (let c of defaultCats) { const docRef = await addDoc(collection(db, 'categories'), { ...c, userId: user.uid }); window.categoriasCarregadas.push({ id: docRef.id, ...c }); }
        } else {
            window.categoriasCarregadas = snap.docs.map(d => { const data = d.data(); return { id: d.id, nome: data.nome || data.name || 'Sem Nome', icon: data.icon || '📌', color: data.color || '#64748b', userId: data.userId || user.uid }; });
        }
        window.categoriasCarregadas.sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
        renderizarDropdownCustomizado(categoriaSelecionada);
    } catch (e) { console.error("Erro categorias:", e); }
}

function renderizarDropdownCustomizado(selecionada = null) {
    const dropdownList = document.getElementById('custom-cat-dropdown'); const inputHidden = document.getElementById('select-category'); const selectedDisplay = document.getElementById('custom-cat-selected');
    dropdownList.innerHTML = '';
    window.categoriasCarregadas.forEach(cat => {
        const div = document.createElement('div'); div.className = "px-4 py-2 hover:bg-slate-700 cursor-pointer transition-colors flex items-center";
        div.innerHTML = `<span class="px-2.5 py-1 rounded-lg text-xs font-bold flex items-center border" style="background-color: ${cat.color}15; color: ${cat.color}; border-color: ${cat.color}30;"><span class="mr-1.5 text-sm">${cat.icon}</span> ${cat.nome}</span>`;
        div.addEventListener('click', () => { inputHidden.value = cat.nome; selectedDisplay.innerHTML = div.innerHTML; dropdownList.classList.add('hidden'); });
        dropdownList.appendChild(div);
    });
    if (selecionada) {
        const cat = window.categoriasCarregadas.find(c => c.nome === selecionada);
        if (cat) { inputHidden.value = cat.nome; selectedDisplay.innerHTML = `<span class="px-2.5 py-1 rounded-lg text-xs font-bold flex items-center border" style="background-color: ${cat.color}15; color: ${cat.color}; border-color: ${cat.color}30;"><span class="mr-1.5 text-sm">${cat.icon}</span> ${cat.nome}</span>`; }
    } else if (window.categoriasCarregadas.length > 0) dropdownList.firstChild.click();
}
function configurarEventosGestorCategorias() {}

function injetarHTMLDoModal() {
    if(document.getElementById('modal-overlay')) return;
    
    const modalHTML = `
    <!-- MODAL DE EDIÇÃO Z-[140] -->
    <div id="modal-overlay" class="fixed inset-0 bg-black/80 z-[140] flex justify-center items-center p-4 hidden animate-fade-in">
        <div class="bg-darkcard w-full max-w-2xl rounded-3xl shadow-2xl border border-darkborder flex flex-col max-h-[95vh]">
            <div class="p-6 border-b border-darkborder flex justify-between items-center bg-slate-800/50 shrink-0 rounded-t-3xl">
                <h2 id="modal-tx-title" class="text-xl font-bold text-white">Novo Lançamento</h2>
                <button id="btn-close-modal" class="text-slate-400 hover:text-rose-500 transition-colors"><i class="ph ph-x text-2xl"></i></button>
            </div>
            
            <form id="form-transaction" class="p-6 overflow-y-auto space-y-6 flex-1">
                <div class="flex bg-slate-900 p-1 rounded-xl border border-slate-700">
                    <button type="button" id="btn-type-expense" class="flex-1 py-2 text-sm font-bold rounded-lg bg-slate-700 text-rose-500 shadow transition-all">Despesa</button>
                    <button type="button" id="btn-type-income" class="flex-1 py-2 text-sm font-bold rounded-lg text-slate-500 hover:bg-slate-800 transition-all">Receita</button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div class="md:col-span-12">
                        <label class="block text-xs font-bold text-slate-400 mb-1">Descrição</label>
                        <input type="text" id="input-desc" required class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" placeholder="Ex: Compra do mês" />
                    </div>
                    
                    <div class="md:col-span-5">
                        <label class="block text-xs font-bold text-slate-400 mb-1">Valor Total (R$)</label>
                        <input type="number" id="input-amount" step="0.01" required class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xl font-bold text-white focus:outline-none focus:border-indigo-500" placeholder="0,00" />
                    </div>

                    <div class="md:col-span-7 relative">
                        <label class="block text-xs font-bold text-slate-400 mb-1">Categoria</label>
                        <div class="flex gap-2">
                            <div id="custom-cat-selector" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white cursor-pointer flex items-center justify-between hover:border-indigo-500 transition-colors h-[52px]">
                                <div id="custom-cat-selected" class="flex items-center gap-2 overflow-hidden"></div>
                                <i class="ph ph-caret-down text-slate-400"></i>
                            </div>
                            <input type="hidden" id="select-category" required />
                        </div>
                        <div id="custom-cat-dropdown" class="hidden absolute top-[75px] left-0 w-full bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto py-2"></div>
                    </div>

                    <div class="md:col-span-12">
                        <label class="block text-xs font-bold text-slate-400 mb-2">Tipo de Registro</label>
                        <div class="flex bg-slate-900 p-1 rounded-xl border border-slate-700 h-[52px]">
                            <button type="button" id="btn-rec-none" class="flex-1 py-1 text-xs font-bold rounded-lg bg-slate-700 text-indigo-400 shadow transition-all">Único</button>
                            <button type="button" id="btn-rec-fixed" class="flex-1 py-1 text-xs font-bold rounded-lg text-slate-500 hover:bg-slate-800 transition-all">Fixo</button>
                            <button type="button" id="btn-rec-inst" class="flex-1 py-1 text-xs font-bold rounded-lg text-slate-500 hover:bg-slate-800 transition-all">Parcelado</button>
                        </div>
                    </div>
                    
                    <div id="box-installments" class="hidden md:col-span-12 grid-cols-2 gap-4 animate-fade-in bg-slate-800/30 p-4 rounded-xl border border-slate-700/50">
                        <div>
                            <label class="block text-xs font-bold text-slate-400 mb-1">Parcela Inicial</label>
                            <input type="number" id="current-inst" min="1" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none" />
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-400 mb-1">Total de Parcelas</label>
                            <input type="number" id="total-inst" min="2" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none" />
                        </div>
                    </div>
                </div>

                <div class="space-y-4 bg-slate-800/30 p-4 rounded-xl border border-slate-700/50">
                    <div>
                        <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">De onde sai o dinheiro?</label>
                        <div class="flex bg-slate-900 p-1 rounded-xl border border-slate-700 mb-3">
                            <button type="button" id="btn-orig-wallet" class="flex-1 py-2 text-sm font-bold rounded-lg bg-slate-700 text-indigo-400 shadow transition-all flex items-center justify-center gap-2"><i class="ph-fill ph-bank"></i> Conta Corrente</button>
                            <button type="button" id="btn-orig-credit" class="flex-1 py-2 text-sm font-bold rounded-lg text-slate-500 hover:bg-slate-800 transition-all flex items-center justify-center gap-2"><i class="ph-fill ph-credit-card"></i> Cartão Crédito</button>
                        </div>
                        <select id="select-account" required class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"></select>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <div>
                            <label class="block text-xs font-bold text-slate-400 mb-1">Data da Movimentação</label>
                            <input type="date" id="input-date" required class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
                        </div>
                        <div id="box-due-date">
                            <label class="block text-xs font-bold text-slate-400 mb-1">Data de Vencimento</label>
                            <input type="date" id="input-due" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
                        </div>
                        <div id="box-credit-info" class="hidden flex items-center text-sm text-purple-300 bg-purple-900/30 p-3 rounded-lg border border-purple-500/30 h-full">
                            <i class="ph-fill ph-magic-wand text-2xl mr-3 text-purple-400"></i> 
                            <div><p class="font-bold text-purple-400">Lançamento em Cartão</p><p class="text-[10px] opacity-80">Será agrupado na fatura.</p></div>
                        </div>
                    </div>
                </div>

                <div class="border-t border-slate-700 pt-4">
                    <label class="block text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Divisão / Rateio Editável</label>
                    <div class="flex gap-2 mb-4">
                        <button type="button" id="btn-split-ind" class="split-btn flex-1 py-2 text-xs font-bold rounded-lg border bg-indigo-600 border-indigo-500 text-white">Individual</button>
                        <button type="button" id="btn-split-space" class="split-btn flex-1 py-2 text-xs font-bold rounded-lg border bg-slate-800 border-slate-700 text-slate-400">Em Espaço</button>
                        <button type="button" id="btn-split-avulso" class="split-btn flex-1 py-2 text-xs font-bold rounded-lg border bg-slate-800 border-slate-700 text-slate-400">Avulso</button>
                    </div>
                    <div id="box-space" class="hidden animate-fade-in bg-slate-800/30 p-3 rounded-xl border border-slate-700/50 text-sm text-slate-400">
                        <select class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white" id="space-selector"></select>
                    </div>
                    <div id="box-avulso" class="hidden space-y-3 animate-fade-in bg-slate-800/30 p-3 rounded-xl border border-slate-700/50">
                        <div id="avulso-list" class="space-y-2"></div>
                        <button type="button" id="btn-add-email" class="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center mt-2 px-2 py-1 rounded"><i class="ph ph-plus mr-1"></i> Adicionar pessoa (E-mail)</button>
                    </div>
                    <div id="box-math" class="hidden mt-4 space-y-3 bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                        <p class="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-2">Ajuste Fino (R$)</p>
                        <div id="math-list" class="space-y-2"></div>
                    </div>
                </div>

                <div class="pt-4 shrink-0">
                    <button type="submit" id="btn-submit-tx" class="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 shadow-lg shadow-indigo-500/30 text-lg transition-colors">Salvar Lançamento</button>
                </div>
            </form>
        </div>
    </div>
    
    <!-- NOVA GAVETA VIEW-MODE Z-[125] -->
    <div id="drawer-tx-detail" class="fixed inset-0 z-[125] flex justify-end hidden">
        <div id="drawer-tx-backdrop" class="absolute inset-0 bg-black/60 transition-opacity duration-300 opacity-0 cursor-pointer"></div>
        <div id="drawer-tx-panel" class="w-full md:w-[450px] bg-slate-900 border-l border-slate-700 h-full shadow-2xl relative flex flex-col transform translate-x-full transition-transform duration-300">
            <div class="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800 shrink-0">
                <div class="flex items-center gap-3">
                    <div id="dt-icon" class="w-10 h-10 flex items-center justify-center rounded-xl border text-xl shadow-inner"></div>
                    <h2 id="dt-title" class="text-xl font-bold text-white leading-tight"></h2>
                </div>
                <button id="btn-close-tx-drawer" class="text-slate-400 hover:text-rose-500 bg-slate-700 w-8 h-8 rounded-full flex items-center justify-center transition-colors"><i class="ph ph-x text-lg"></i></button>
            </div>
            <div class="p-6 flex-1 overflow-y-auto space-y-6 bg-darkcard">
                <div class="text-center">
                    <p class="text-sm text-slate-400 font-bold uppercase tracking-wider mb-1">A sua Parte / Valor</p>
                    <p id="dt-amount" class="text-4xl font-bold"></p>
                    <p id="dt-status" class="mt-2 text-sm font-bold"></p>
                </div>
                <div class="space-y-4 bg-slate-800/50 p-5 rounded-2xl border border-slate-700/50">
                    <div class="flex justify-between items-center border-b border-slate-700/50 pb-3">
                        <span class="text-xs font-bold text-slate-400 uppercase">Data Movimentação</span>
                        <span id="dt-date" class="text-sm font-bold text-white"></span>
                    </div>
                    <div class="flex justify-between items-center border-b border-slate-700/50 pb-3">
                        <span class="text-xs font-bold text-slate-400 uppercase">Categoria</span>
                        <span id="dt-category" class="text-sm font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-lg border"></span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-xs font-bold text-slate-400 uppercase">Origem</span>
                        <span id="dt-account" class="text-sm font-bold text-slate-300 flex items-center gap-1.5"></span>
                    </div>
                </div>
                <div id="dt-extras" class="space-y-1"></div>
            </div>
            <div class="p-6 border-t border-slate-700 flex gap-3 shrink-0 bg-slate-800">
                <button id="btn-dt-delete" class="flex-1 py-3 bg-rose-500/10 text-rose-400 font-bold rounded-xl hover:bg-rose-500 hover:text-white transition-colors flex items-center justify-center gap-2"><i class="ph ph-trash text-lg"></i></button>
                <button id="btn-dt-edit" class="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 shadow-lg shadow-indigo-500/30 transition-colors flex items-center justify-center gap-2"><i class="ph ph-pencil-simple text-lg"></i> Editar Lançamento</button>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('drawer-tx-backdrop').addEventListener('click', fecharDetalheTransacao);
    document.getElementById('btn-close-tx-drawer').addEventListener('click', fecharDetalheTransacao);
}

function configurarEventosBase() {
    const user = auth.currentUser;
    document.getElementById('btn-close-modal').addEventListener('click', () => document.getElementById('modal-overlay').classList.add('hidden'));

    document.getElementById('btn-orig-wallet').addEventListener('click', () => { window.txState.originType = 'wallet'; atualizarToggleOrigemUI(); });
    document.getElementById('btn-orig-credit').addEventListener('click', () => { window.txState.originType = 'credit'; atualizarToggleOrigemUI(); });

    const catSelectorBox = document.getElementById('custom-cat-selector');
    const catDropdown = document.getElementById('custom-cat-dropdown');
    catSelectorBox.addEventListener('click', (e) => { e.stopPropagation(); catDropdown.classList.toggle('hidden'); });
    document.addEventListener('click', (e) => { if (!catDropdown.contains(e.target) && !catSelectorBox.contains(e.target)) catDropdown.classList.add('hidden'); });

    document.getElementById('btn-type-expense').addEventListener('click', () => { window.txState.type = 'expense'; atualizarUI(); });
    document.getElementById('btn-type-income').addEventListener('click', () => { window.txState.type = 'income'; atualizarUI(); });
    document.getElementById('btn-rec-none').addEventListener('click', () => { window.txState.recurrence = 'none'; atualizarUI(); });
    document.getElementById('btn-rec-fixed').addEventListener('click', () => { window.txState.recurrence = 'fixed'; atualizarUI(); });
    document.getElementById('btn-rec-inst').addEventListener('click', () => { window.txState.recurrence = 'installments'; atualizarUI(); });

    document.getElementById('btn-split-ind').addEventListener('click', () => { window.txState.splitMode = 'ind'; setupParticipants(); });
    document.getElementById('btn-split-space').addEventListener('click', () => { window.txState.splitMode = 'space'; setupParticipants(); });
    document.getElementById('btn-split-avulso').addEventListener('click', () => { window.txState.splitMode = 'avulso'; setupParticipants(); });

    document.getElementById('space-selector').addEventListener('change', (e) => {
        const sp = window.espacosCarregados.find(s => s.id === e.target.value);
        if (sp) { window.txState.participants = sp.participantEmails.map(email => ({ id: email === user.email ? 'me' : email, name: email === user.email ? 'Sua Parte' : email, email: email, amount: 0 })); calcularMatematicaBase(); }
    });

    document.getElementById('btn-add-email').addEventListener('click', () => {
        window.txState.participants.push({ id: Math.random().toString(), name: 'Convidado', email: '', amount: 0 });
        renderAvulsoInputs(); calcularMatematicaBase();
    });

    document.getElementById('input-amount').addEventListener('input', calcularMatematicaBase);

    document.getElementById('form-transaction').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSubmit = document.getElementById('btn-submit-tx');
        
        const catNome = document.getElementById('select-category').value;
        if (!catNome) return alert("Por favor, selecione uma categoria.");
        const accSelect = document.getElementById('select-account');
        if (accSelect.options.length === 0 || !accSelect.value) return alert('Nenhuma conta selecionada.');

        btnSubmit.disabled = true;
        btnSubmit.innerText = modoAtual === 'editar' ? 'A atualizar...' : 'A salvar...';

        try {
            const selectedOption = accSelect.options[accSelect.selectedIndex];
            const isCredit = selectedOption.dataset.type === 'credit';
            const accType = selectedOption.dataset.type;
            const accName = selectedOption.text.replace(/^[💳🏦]\s*/, ''); 

            const participantEmails = window.txState.participants.map(p => p.email).filter(Boolean);
            const catSelecionada = window.categoriasCarregadas.find(c => c.nome === catNome);

            const txData = {
                creatorId: user.uid, creatorEmail: user.email, type: window.txState.type,
                description: document.getElementById('input-desc').value,
                amount: parseFloat(document.getElementById('input-amount').value),
                category: catNome, categoryIcon: catSelecionada ? catSelecionada.icon : '📌', categoryColor: catSelecionada ? catSelecionada.color : '#64748b',
                accountId: accSelect.value, accountType: accType, accountName: accName,
                launchDate: document.getElementById('input-date').value,
                dueDate: isCredit ? '' : document.getElementById('input-due').value,
                recurrence: window.txState.recurrence,
                installmentsTotal: document.getElementById('total-inst').value || null,
                currentInstallment: document.getElementById('current-inst').value || null,
                splitType: window.txState.splitMode, spaceId: window.txState.splitMode === 'space' ? document.getElementById('space-selector').value : null,
                splitParticipants: window.txState.participants, participantEmails: participantEmails
            };

            if (modoAtual === 'criar') {
                txData.status = 'pending'; txData.createdAt = new Date().toISOString();
                await addDoc(collection(db, 'transactions'), txData);
                if (txData.splitParticipants && txData.splitParticipants.length > 1) {
                    txData.splitParticipants.forEach(participante => { if (participante.email !== user.email) { processarNotificacaoEmail(participante.email, user.email, 'rateio', { descricao: txData.description, valor: participante.amount }); } });
                }
            } else if (modoAtual === 'editar' && txEditId) {
                if (txEditDadosAntigos.isOverrideMode) {
                    const overrideKey = txEditDadosAntigos.overrideKey; 
                    const overrides = txEditDadosAntigos.overrides || {};
                    overrides[overrideKey] = {
                        ...overrides[overrideKey], description: txData.description, amount: txData.amount,
                        category: txData.category, categoryIcon: txData.categoryIcon, categoryColor: txData.categoryColor,
                        accountId: txData.accountId, accountType: txData.accountType, accountName: txData.accountName
                    };
                    await updateDoc(doc(db, 'transactions', txEditId), { overrides });
                } else {
                    txData.createdAt = txEditDadosAntigos.createdAt; txData.status = txEditDadosAntigos.status;
                    await updateDoc(doc(db, 'transactions', txEditId), txData);
                }
            }
            document.getElementById('modal-overlay').classList.add('hidden');
        } catch (error) {
            console.error(error); alert('Erro ao salvar o lançamento.');
        } finally {
            btnSubmit.disabled = false; btnSubmit.innerText = modoAtual === 'editar' ? 'Atualizar Lançamento' : 'Salvar Lançamento';
        }
    });
}

function atualizarUI() {
    const s = window.txState;
    document.getElementById('btn-type-expense').className = `flex-1 py-2 text-sm font-bold rounded-lg transition-all ${s.type==='expense' ? 'bg-slate-700 text-rose-500 shadow' : 'text-slate-500 hover:bg-slate-800'}`;
    document.getElementById('btn-type-income').className = `flex-1 py-2 text-sm font-bold rounded-lg transition-all ${s.type==='income' ? 'bg-slate-700 text-emerald-500 shadow' : 'text-slate-500 hover:bg-slate-800'}`;
    document.getElementById('btn-rec-none').className = `flex-1 py-1 text-xs font-bold rounded-lg transition-all ${s.recurrence==='none' ? 'bg-slate-700 text-indigo-400 shadow' : 'text-slate-500 hover:bg-slate-800'}`;
    document.getElementById('btn-rec-fixed').className = `flex-1 py-1 text-xs font-bold rounded-lg transition-all ${s.recurrence==='fixed' ? 'bg-slate-700 text-indigo-400 shadow' : 'text-slate-500 hover:bg-slate-800'}`;
    document.getElementById('btn-rec-inst').className = `flex-1 py-1 text-xs font-bold rounded-lg transition-all ${s.recurrence==='installments' ? 'bg-slate-700 text-indigo-400 shadow' : 'text-slate-500 hover:bg-slate-800'}`;
    
    const boxInst = document.getElementById('box-installments');
    if(s.recurrence === 'installments') { boxInst.classList.remove('hidden'); boxInst.classList.add('grid'); document.getElementById('current-inst').required=true; document.getElementById('total-inst').required=true; }
    else { boxInst.classList.add('hidden'); boxInst.classList.remove('grid'); document.getElementById('current-inst').required=false; document.getElementById('total-inst').required=false; }
}

function setupParticipants() {
    const s = window.txState;
    document.getElementById('btn-split-ind').className = document.getElementById('btn-split-space').className = document.getElementById('btn-split-avulso').className = 'split-btn flex-1 py-2 text-xs font-bold rounded-lg border bg-slate-800 border-slate-700 text-slate-400';
    document.getElementById(`btn-split-${s.splitMode}`).className = 'split-btn flex-1 py-2 text-xs font-bold rounded-lg border bg-indigo-600 border-indigo-500 text-white';
    document.getElementById('box-space').classList.add('hidden'); document.getElementById('box-avulso').classList.add('hidden'); document.getElementById('box-math').classList.add('hidden');

    if(s.splitMode === 'ind') { s.participants = [{ id: 'me', name: 'Sua Parte', email: auth.currentUser.email, amount: 0 }]; } 
    else if(s.splitMode === 'space') { document.getElementById('box-space').classList.remove('hidden'); } 
    else if(s.splitMode === 'avulso') {
        document.getElementById('box-avulso').classList.remove('hidden'); document.getElementById('box-math').classList.remove('hidden');
        s.participants = [{ id: 'me', name: 'Sua Parte', email: auth.currentUser.email, amount: 0 }];
        renderAvulsoInputs();
    }
    calcularMatematicaBase();
}
function renderAvulsoInputs() {
    const list = document.getElementById('avulso-list'); list.innerHTML = '';
    window.txState.participants.filter(p => p.id !== 'me').forEach(p => {
        const div = document.createElement('div'); div.className = "flex gap-2 items-center animate-fade-in";
        div.innerHTML = `<input type="email" value="${p.email}" placeholder="email@exemplo.com" class="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm outline-none" /><button type="button" class="p-2 text-rose-500 hover:bg-rose-500/20 rounded-lg"><i class="ph ph-trash"></i></button>`;
        div.querySelector('button').addEventListener('click', () => { window.txState.participants = window.txState.participants.filter(x => x.id !== p.id); renderAvulsoInputs(); calcularMatematicaBase(); });
        div.querySelector('input').addEventListener('input', (e) => { p.email = p.name = e.target.value; renderMathInputs(); });
        list.appendChild(div);
    });
}
function calcularMatematicaBase() {
    const total = parseFloat(document.getElementById('input-amount').value) || 0;
    const each = total / window.txState.participants.length;
    window.txState.participants.forEach(p => p.amount = each);
    renderMathInputs();
}
window.handleManualMathChange = function(id, newAmountStr) {
    let newAmount = parseFloat(newAmountStr); if(isNaN(newAmount)) newAmount = 0;
    const total = parseFloat(document.getElementById('input-amount').value) || 0;
    const target = window.txState.participants.find(p => p.id === id);
    if(!target) return; target.amount = newAmount;

    if(id !== 'me') {
        const othersSum = window.txState.participants.filter(p => p.id !== 'me').reduce((acc, p) => acc + p.amount, 0);
        const me = window.txState.participants.find(p => p.id === 'me');
        if(me) me.amount = Math.max(0, total - othersSum);
    } else {
        const remaining = Math.max(0, total - newAmount);
        const others = window.txState.participants.filter(p => p.id !== 'me');
        if(others.length > 0) others.forEach(p => p.amount = remaining / others.length);
    }
    renderMathInputs();
}
function renderMathInputs() {
    const list = document.getElementById('math-list');
    if(window.txState.splitMode === 'ind') { document.getElementById('box-math').classList.add('hidden'); return; }
    document.getElementById('box-math').classList.remove('hidden'); list.innerHTML = '';
    window.txState.participants.forEach(p => {
        const isMe = p.id === 'me';
        list.innerHTML += `<div class="flex items-center justify-between gap-3"><span class="text-sm font-medium ${isMe?'text-indigo-400 font-bold':'text-slate-300'} truncate flex-1">${p.name}</span><div class="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 w-32 focus-within:border-indigo-500 transition-colors"><span class="text-slate-500 text-xs font-bold mr-1">R$</span><input type="number" step="0.01" value="${p.amount.toFixed(2)}" onchange="window.handleManualMathChange('${p.id}', this.value)" class="w-full bg-transparent p-0 text-white text-sm focus:outline-none text-right font-bold" /></div></div>`;
    });
}