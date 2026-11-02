// js/components/transactionModal.js
import { auth, db } from '../config/firebase.js';
import { processarNotificacaoEmail } from '../services/emailService.js';
import { collection, addDoc, updateDoc, doc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Variável global para evitar injetar o HTML repetidas vezes
let isModalInjected = false;
let modoAtual = 'criar'; // 'criar' ou 'editar'
let txEditId = null;     // ID da transação se estiver a editar
let txEditDadosAntigos = null;

export async function abrirModalTransacao(modo = 'criar', dados = null) {
    const user = auth.currentUser;
    if (!user) return;

    modoAtual = modo;
    txEditId = dados ? dados.id : null;
    txEditDadosAntigos = dados;

    // 1. Injeta o HTML apenas na primeira vez
    if (!isModalInjected) {
        injetarHTMLDoModal();
        configurarEventosBase();
        isModalInjected = true;
    }

    // 2. Limpar formulário e preparar estado inicial
    const form = document.getElementById('form-transaction');
    form.reset();
    document.getElementById('input-date').valueAsDate = new Date();
    
    window.txState = {
        type: 'expense',
        recurrence: 'none',
        splitMode: 'ind',
        participants: [{ id: 'me', name: 'Sua Parte', email: user.email, amount: 0 }]
    };
    atualizarUI();

    // 3. Buscar Contas, Espaços e Categorias REAIS do Firebase
    const btnSubmit = document.getElementById('btn-submit-tx');
    btnSubmit.innerText = 'A carregar os seus dados...';
    btnSubmit.disabled = true;

    try {
        // Busca Contas
        const qContas = query(collection(db, 'accounts'), where('userId', '==', user.uid));
        const snapContas = await getDocs(qContas);
        const selectAcc = document.getElementById('select-account');
        selectAcc.innerHTML = '';
        snapContas.forEach(docSnap => {
            const acc = docSnap.data();
            const icon = acc.type === 'credit' ? '💳' : '🏦';
            selectAcc.innerHTML += `<option value="${docSnap.id}" data-type="${acc.type}">${icon} ${acc.name}</option>`;
        });
        selectAcc.dispatchEvent(new Event('change')); 

        // Busca Espaços
        const qEspacos = query(collection(db, 'spaces'), where('participantEmails', 'array-contains', user.email));
        const snapEspacos = await getDocs(qEspacos);
        const selectSpace = document.getElementById('space-selector');
        selectSpace.innerHTML = '<option value="">Selecione um espaço...</option>';
        window.espacosCarregados = [];
        snapEspacos.forEach(docSnap => {
            const sp = docSnap.data();
            if(!sp.isIndividual) {
                window.espacosCarregados.push({ id: docSnap.id, ...sp });
                selectSpace.innerHTML += `<option value="${docSnap.id}">${sp.icon} ${sp.name}</option>`;
            }
        });

        // Carrega Categorias
        await carregarCategorias(dados ? dados.category : null);

        // 4. Se for MODO EDIÇÃO, preenche os campos com os dados existentes
        if (modo === 'editar' && dados) {
            document.getElementById('modal-tx-title').innerText = 'Editar Lançamento';
            
            // Define o Tipo (Despesa / Receita)
            if (dados.type === 'income') {
                window.txState.type = 'income';
                document.getElementById('btn-type-income').click();
            } else {
                window.txState.type = 'expense';
                document.getElementById('btn-type-expense').click();
            }

            document.getElementById('input-desc').value = dados.description || '';
            document.getElementById('input-amount').value = dados.amount || '';
            document.getElementById('input-date').value = dados.launchDate || '';
            
            if (dados.accountId) selectSpace.value = dados.accountId;
            if (dados.category) document.getElementById('select-category').value = dados.category;
            if (dados.spaceId) {
                selectSpace.value = dados.spaceId;
                document.getElementById('btn-split-space').click();
            }
        } else {
            document.getElementById('modal-tx-title').innerText = 'Novo Lançamento';
        }

        btnSubmit.innerText = modo === 'editar' ? 'Atualizar Lançamento' : 'Salvar Lançamento';
        btnSubmit.disabled = false;
    } catch (e) {
        console.error("Erro ao carregar dados:", e);
        btnSubmit.innerText = 'Erro ao carregar';
    }

    // 5. Exibir o Modal
    document.getElementById('modal-overlay').classList.remove('hidden');
}

// ==========================================
// GESTÃO DE CATEGORIAS
// ==========================================
async function carregarCategorias(categoriaSelecionada = null) {
    const user = auth.currentUser;
    if (!user) return;
    
    const select = document.getElementById('select-category');
    if (!select) return;

    try {
        const q = query(collection(db, 'categories'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        
        let categorias = [];
        if (snap.empty) {
            const defaultCats = ['Alimentação', 'Casa', 'Transporte', 'Saúde', 'Lazer', 'Salário', 'Outros'];
            for (let c of defaultCats) {
                const docRef = await addDoc(collection(db, 'categories'), { nome: c, userId: user.uid });
                categorias.push({ id: docRef.id, nome: c });
            }
        } else {
            categorias = snap.docs.map(d => ({ id: d.id, nome: d.data().nome }));
        }

        categorias.sort((a, b) => a.nome.localeCompare(b.nome));

        select.innerHTML = '';
        categorias.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.nome;
            opt.innerText = cat.nome;
            select.appendChild(opt);
        });

        if (categoriaSelecionada) {
            select.value = categoriaSelecionada;
        }
    } catch (e) {
        console.error("Erro ao carregar categorias:", e);
    }
}

// ==========================================
// FUNÇÕES AUXILIARES DE INTERFACE
// ==========================================
function injetarHTMLDoModal() {
    const modalHTML = `
    <div id="modal-overlay" class="fixed inset-0 bg-black/80 z-[105] flex justify-center items-center p-4 hidden animate-fade-in">
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
                    
                    <div class="md:col-span-6">
                        <label class="block text-xs font-bold text-slate-400 mb-1">Valor Total (R$)</label>
                        <input type="number" id="input-amount" step="0.01" required class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xl font-bold text-white focus:outline-none focus:border-indigo-500" placeholder="0,00" />
                    </div>

                    <!-- CAMPO DE CATEGORIA ADICIONADO -->
                    <div class="md:col-span-6">
                        <label class="block text-xs font-bold text-slate-400 mb-1">Categoria</label>
                        <div class="flex gap-2">
                            <select id="select-category" required class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-indigo-500 text-sm"></select>
                            <button type="button" id="btn-add-category" title="Nova Categoria" class="bg-slate-800 border border-slate-700 rounded-xl px-3.5 text-indigo-400 font-bold hover:bg-slate-700 transition-colors">+</button>
                        </div>
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
                            <input type="number" id="current-inst" min="1" placeholder="Ex: 5" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none" />
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-400 mb-1">Total de Parcelas</label>
                            <input type="number" id="total-inst" min="2" placeholder="Ex: 10" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none" />
                        </div>
                    </div>
                </div>

                <div class="space-y-4 bg-slate-800/30 p-4 rounded-xl border border-slate-700/50">
                    <div>
                        <label class="block text-xs font-bold text-slate-400 mb-1">Conta ou Cartão</label>
                        <select id="select-account" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"></select>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <div>
                            <label class="block text-xs font-bold text-slate-400 mb-1">Data do Registro</label>
                            <input type="date" id="input-date" required class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
                        </div>
                        <div id="box-due-date">
                            <label class="block text-xs font-bold text-slate-400 mb-1">Data de Vencimento</label>
                            <input type="date" id="input-due" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
                        </div>
                        <div id="box-credit-info" class="hidden flex items-center text-sm text-purple-300 bg-purple-900/30 p-3 rounded-lg border border-purple-500/30 h-full">
                            <i class="ph-fill ph-magic-wand text-2xl mr-3 text-purple-400"></i> 
                            <div><p class="font-bold text-purple-400">Lançamento em Cartão</p><p class="text-[10px] opacity-80">O sistema calculará a fatura automaticamente.</p></div>
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
                        <button type="button" id="btn-add-email" class="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center mt-2 px-2 py-1 rounded">
                            <i class="ph ph-plus mr-1"></i> Adicionar pessoa (E-mail)
                        </button>
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
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function configurarEventosBase() {
    const user = auth.currentUser;
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        document.getElementById('modal-overlay').classList.add('hidden');
    });

    // Botão Adicionar Categoria Rápida (+)
    document.getElementById('btn-add-category').addEventListener('click', async () => {
        const novaCat = prompt("Digite o nome da nova categoria:");
        if (novaCat && novaCat.trim() !== '') {
            await addDoc(collection(db, 'categories'), { nome: novaCat.trim(), userId: user.uid });
            await carregarCategorias(novaCat.trim());
        }
    });

    // Eventos UI (Cor Type, Recurrence, Conta)
    document.getElementById('btn-type-expense').addEventListener('click', () => { window.txState.type = 'expense'; atualizarUI(); });
    document.getElementById('btn-type-income').addEventListener('click', () => { window.txState.type = 'income'; atualizarUI(); });
    
    document.getElementById('btn-rec-none').addEventListener('click', () => { window.txState.recurrence = 'none'; atualizarUI(); });
    document.getElementById('btn-rec-fixed').addEventListener('click', () => { window.txState.recurrence = 'fixed'; atualizarUI(); });
    document.getElementById('btn-rec-inst').addEventListener('click', () => { window.txState.recurrence = 'installments'; atualizarUI(); });

    document.getElementById('select-account').addEventListener('change', (e) => {
        const type = e.target.options[e.target.selectedIndex].dataset.type;
        document.getElementById('box-due-date').classList.toggle('hidden', type === 'credit');
        document.getElementById('box-credit-info').classList.toggle('hidden', type !== 'credit');
    });

    // Eventos de Rateio
    document.getElementById('btn-split-ind').addEventListener('click', () => { window.txState.splitMode = 'ind'; setupParticipants(); });
    document.getElementById('btn-split-space').addEventListener('click', () => { window.txState.splitMode = 'space'; setupParticipants(); });
    document.getElementById('btn-split-avulso').addEventListener('click', () => { window.txState.splitMode = 'avulso'; setupParticipants(); });

    document.getElementById('space-selector').addEventListener('change', (e) => {
        const sp = window.espacosCarregados.find(s => s.id === e.target.value);
        if (sp) {
            window.txState.participants = sp.participantEmails.map(email => ({
                id: email === user.email ? 'me' : email,
                name: email === user.email ? 'Sua Parte' : email,
                email: email,
                amount: 0
            }));
            calcularMatematicaBase();
        }
    });

    document.getElementById('btn-add-email').addEventListener('click', () => {
        window.txState.participants.push({ id: Math.random().toString(), name: 'Convidado', email: '', amount: 0 });
        renderAvulsoInputs();
        calcularMatematicaBase();
    });

    document.getElementById('input-amount').addEventListener('input', calcularMatematicaBase);

    // ==========================================
    // GRAVAÇÃO NO FIREBASE (CRIAR OU EDITAR)
    // ==========================================
    document.getElementById('form-transaction').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSubmit = document.getElementById('btn-submit-tx');
        btnSubmit.disabled = true;
        btnSubmit.innerText = modoAtual === 'editar' ? 'A atualizar...' : 'A salvar...';

        try {
            const accSelect = document.getElementById('select-account');
            const isCredit = accSelect.options[accSelect.selectedIndex].dataset.type === 'credit';
            const participantEmails = window.txState.participants.map(p => p.email).filter(Boolean);

            const txData = {
                creatorId: user.uid,
                creatorEmail: user.email,
                type: window.txState.type,
                description: document.getElementById('input-desc').value,
                amount: parseFloat(document.getElementById('input-amount').value),
                category: document.getElementById('select-category').value, // Salva a categoria escolhida
                accountId: accSelect.value,
                launchDate: document.getElementById('input-date').value,
                dueDate: isCredit ? '' : document.getElementById('input-due').value,
                recurrence: window.txState.recurrence,
                installmentsTotal: document.getElementById('total-inst').value || null,
                currentInstallment: document.getElementById('current-inst').value || null,
                splitType: window.txState.splitMode,
                spaceId: window.txState.splitMode === 'space' ? document.getElementById('space-selector').value : null,
                splitParticipants: window.txState.participants,
                participantEmails: participantEmails
            };

            if (modoAtual === 'criar') {
                txData.status = 'pending';
                txData.createdAt = new Date().toISOString();
                
                // 1. Salva a Transação Principal
                await addDoc(collection(db, 'transactions'), txData);
                
                // Disparar e-mails de rateio
                if (txData.splitParticipants && txData.splitParticipants.length > 1) {
                    txData.splitParticipants.forEach(participante => {
                        if (participante.email !== user.email) {
                            processarNotificacaoEmail(participante.email, user.email, 'rateio', { 
                                descricao: txData.description, 
                                valor: participante.amount 
                            });
                        }
                    });
                }

                // 2. Prospecção avulsa
                if (window.txState.splitMode === 'avulso') {
                    for (const p of window.txState.participants) {
                        if (p.id !== 'me' && p.email) {
                            await addDoc(collection(db, 'mail'), {
                                to: p.email,
                                message: {
                                    subject: `${user.email.split('@')[0]} partilhou uma despesa consigo!`,
                                    html: `
                                        <h2>Olá!</h2>
                                        <p>O(a) <b>${user.email.split('@')[0]}</b> registou a despesa <b>"${txData.description}"</b> e a sua parte ficou em <b>R$ ${p.amount.toFixed(2)}</b>.</p>
                                        <p>Crie a sua conta na plataforma para organizar as suas contas e responder a esta cobrança!</p>
                                    `
                                }
                            });
                        }
                    }
                }
            } else if (modoAtual === 'editar' && txEditId) {
                // Mantém metadados antigos e atualiza os campos editados
                txData.createdAt = txEditDadosAntigos.createdAt;
                txData.status = txEditDadosAntigos.status;
                await updateDoc(doc(db, 'transactions', txEditId), txData);
            }

            document.getElementById('modal-overlay').classList.add('hidden');
        } catch (error) {
            console.error(error);
            alert('Erro ao salvar o lançamento.');
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerText = modoAtual === 'editar' ? 'Atualizar Lançamento' : 'Salvar Lançamento';
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

    document.getElementById('box-space').classList.add('hidden');
    document.getElementById('box-avulso').classList.add('hidden');
    document.getElementById('box-math').classList.add('hidden');

    if(s.splitMode === 'ind') {
        s.participants = [{ id: 'me', name: 'Sua Parte', email: auth.currentUser.email, amount: 0 }];
    } else if(s.splitMode === 'space') {
        document.getElementById('box-space').classList.remove('hidden');
    } else if(s.splitMode === 'avulso') {
        document.getElementById('box-avulso').classList.remove('hidden');
        document.getElementById('box-math').classList.remove('hidden');
        s.participants = [{ id: 'me', name: 'Sua Parte', email: auth.currentUser.email, amount: 0 }];
        renderAvulsoInputs();
    }
    calcularMatematicaBase();
}

function renderAvulsoInputs() {
    const list = document.getElementById('avulso-list');
    list.innerHTML = '';
    window.txState.participants.filter(p => p.id !== 'me').forEach(p => {
        const div = document.createElement('div');
        div.className = "flex gap-2 items-center animate-fade-in";
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
    let newAmount = parseFloat(newAmountStr);
    if(isNaN(newAmount)) newAmount = 0;
    const total = parseFloat(document.getElementById('input-amount').value) || 0;
    const target = window.txState.participants.find(p => p.id === id);
    if(!target) return;
    target.amount = newAmount;

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
    document.getElementById('box-math').classList.remove('hidden');
    list.innerHTML = '';
    window.txState.participants.forEach(p => {
        const isMe = p.id === 'me';
        list.innerHTML += `<div class="flex items-center justify-between gap-3"><span class="text-sm font-medium ${isMe?'text-indigo-400 font-bold':'text-slate-300'} truncate flex-1">${p.name}</span><div class="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 w-32 focus-within:border-indigo-500 transition-colors"><span class="text-slate-500 text-xs font-bold mr-1">R$</span><input type="number" step="0.01" value="${p.amount.toFixed(2)}" onchange="window.handleManualMathChange('${p.id}', this.value)" class="w-full bg-transparent p-0 text-white text-sm focus:outline-none text-right font-bold" /></div></div>`;
    });
}