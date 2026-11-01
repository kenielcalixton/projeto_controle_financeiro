// js/components/spaces.js
import { auth, db } from '../config/firebase.js';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let unsubscribeEspacos = null;
let isModalInjected = false;
let estadoAtual = { modo: 'criar', espacoId: null };

export function renderizarEspacos() {
    const main = document.getElementById('main-content');
    const user = auth.currentUser;
    if (!user) return;

    // 1. Injeção do Esqueleto Base da Tela
    main.innerHTML = `
        <div class="space-y-6 animate-fade-in max-w-6xl mx-auto h-full flex flex-col">
            <div class="flex justify-between items-center">
                <h2 class="text-xl font-bold">Espaços e Rateios</h2>
                <button id="btn-new-space" class="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/30 hover:bg-indigo-500 transition-colors">
                    + Novo Espaço
                </button>
            </div>
            
            <div id="grid-spaces" class="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div class="col-span-3 text-center text-slate-500 p-8"><i class="ph ph-spinner animate-spin text-2xl mb-2"></i><br>A carregar espaços...</div>
            </div>
        </div>
    `;

    // 2. Garantir que o HTML do Modal existe no DOM
    injetarModalEspacos();

    // Evento de Novo Espaço
    document.getElementById('btn-new-space').addEventListener('click', () => abrirModalEspaco('criar'));

    // 3. Conexão em Tempo Real com o Firebase
    const qEspacos = query(collection(db, 'spaces'), where('participantEmails', 'array-contains', user.email));
    
    unsubscribeEspacos = onSnapshot(qEspacos, (snapshot) => {
        const espacos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const grid = document.getElementById('grid-spaces');
        grid.innerHTML = '';

        espacos.forEach(sp => {
            const isCreator = sp.creatorEmail === user.email;
            const isPessoal = sp.name === 'Pessoal'; // Regra: O espaço Pessoal é sagrado
            
            // Construção das tags de membros
            let membrosHTML = '';
            if (!sp.isIndividual && sp.membersData) {
                membrosHTML = sp.membersData.filter(m => m.email !== sp.creatorEmail).map(m => {
                    const isPending = m.status === 'pending';
                    return `<span class="text-[10px] px-2 py-1 rounded-md font-bold ${isPending ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800 text-slate-300'}">${m.email}${isPending ? ' (Pendente)' : ''}</span>`;
                }).join('');
            }

            // Construção dos Botões de Ação do Cartão
            let botoesHTML = '';
            if (isCreator) {
                botoesHTML = `<button class="btn-edit text-slate-400 hover:text-indigo-400 bg-slate-800 p-2 rounded-lg" data-id="${sp.id}"><i class="ph ph-pencil-simple text-lg pointer-events-none"></i></button>`;
                if (!isPessoal) {
                    botoesHTML += `<button class="btn-delete text-slate-400 hover:text-rose-400 bg-slate-800 p-2 rounded-lg ml-2" data-id="${sp.id}"><i class="ph ph-trash text-lg pointer-events-none"></i></button>`;
                }
            } else {
                botoesHTML = `
                    <button class="btn-view text-slate-400 hover:text-indigo-400 bg-slate-800 p-2 rounded-lg" data-id="${sp.id}"><i class="ph ph-eye text-lg pointer-events-none"></i></button>
                    <button class="btn-leave text-slate-400 hover:text-rose-400 bg-slate-800 p-2 rounded-lg ml-2" data-id="${sp.id}"><i class="ph ph-sign-out text-lg pointer-events-none"></i></button>
                `;
            }

            const card = document.createElement('div');
            card.className = "p-5 bg-darkcard border border-darkborder rounded-2xl flex flex-col items-center text-center relative group hover:border-indigo-500/50 transition-colors";
            card.innerHTML = `
                <div class="absolute top-3 right-3 flex opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    ${botoesHTML}
                </div>
                <div class="w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-3" style="background-color: ${sp.color}20; color: ${sp.color}">${sp.icon}</div>
                <h3 class="font-bold text-lg mb-1">${sp.name}</h3>
                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">${sp.isIndividual ? 'Espaço Privado' : 'Espaço Partilhado'}</p>
                ${!isCreator ? `<span class="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20 mb-3">De: ${sp.creatorEmail}</span>` : ''}
                ${!sp.isIndividual ? `<div class="flex flex-wrap justify-center gap-1 mt-1">${membrosHTML}</div>` : ''}
            `;
            grid.appendChild(card);
        });

        // Associar eventos aos botões gerados dinamicamente
        document.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', (e) => {
            const sp = espacos.find(x => x.id === e.target.dataset.id);
            if(sp) abrirModalEspaco('editar', sp);
        }));
        document.querySelectorAll('.btn-view').forEach(btn => btn.addEventListener('click', (e) => {
            const sp = espacos.find(x => x.id === e.target.dataset.id);
            if(sp) abrirModalEspaco('visualizar', sp);
        }));
        document.querySelectorAll('.btn-delete').forEach(btn => btn.addEventListener('click', async (e) => {
            if(confirm('Tem a certeza que deseja excluir este espaço?')) {
                await deleteDoc(doc(db, 'spaces', e.target.dataset.id));
            }
        }));
        document.querySelectorAll('.btn-leave').forEach(btn => btn.addEventListener('click', async (e) => {
            const sp = espacos.find(x => x.id === e.target.dataset.id);
            if(sp && confirm('Tem a certeza que deseja sair deste espaço?')) {
                const novosEmails = sp.participantEmails.filter(email => email !== user.email);
                const novosDados = sp.membersData.filter(m => m.email !== user.email);
                await updateDoc(doc(db, 'spaces', sp.id), { participantEmails: novosEmails, membersData: novosDados });
            }
        }));

    });

    main.dataset.unsubscribeEspacos = "true"; // Sinalizador para o router
}

export function limparListenerEspacos() {
    if (unsubscribeEspacos) {
        unsubscribeEspacos();
        unsubscribeEspacos = null;
    }
}

// ==========================================
// LÓGICA DO MODAL (INJEÇÃO E ESTADOS)
// ==========================================

function injetarModalEspacos() {
    if (isModalInjected) return;
    
    const modalHTML = `
    <div id="modal-space" class="fixed inset-0 bg-black/80 z-[105] flex items-center justify-center p-4 hidden animate-fade-in">
        <form id="form-space" class="bg-darkcard w-full max-w-md rounded-3xl p-6 border border-darkborder shadow-2xl flex flex-col max-h-[90vh]">
            <div class="flex justify-between items-center mb-6 shrink-0">
                <h2 id="modal-space-title" class="text-xl font-bold text-white">Novo Espaço</h2>
                <button type="button" id="btn-close-space-modal" class="text-slate-400 hover:text-rose-500 transition-colors"><i class="ph ph-x text-2xl"></i></button>
            </div>

            <div class="space-y-5 overflow-y-auto pr-2 flex-1">
                <div>
                    <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Nome do Espaço</label>
                    <input type="text" id="space-input-name" required class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed" placeholder="Ex: Casa, Carro, Casamento" />
                </div>
                
                <label id="space-label-ind" class="flex items-center bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 transition-colors cursor-pointer">
                    <input type="checkbox" id="space-check-ind" class="w-5 h-5 rounded border-slate-600 bg-slate-900 text-indigo-500 mr-3 disabled:cursor-not-allowed disabled:opacity-50" />
                    <div class="flex-1">
                        <span class="text-sm font-bold text-slate-200 block">Espaço Individual (Privado)</span>
                        <span class="text-[10px] text-slate-400">Desmarque para adicionar convidados.</span>
                    </div>
                </label>

                <div id="space-box-members" class="animate-fade-in space-y-3 bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                    <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Membros (E-mails)</label>
                    <div id="space-members-list" class="space-y-2"></div>
                    <button type="button" id="space-btn-add-member" class="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center mt-2 px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors">
                        <i class="ph ph-plus mr-1"></i> Adicionar membro
                    </button>
                </div>

                <div class="flex space-x-4 relative">
                    <div class="flex-1">
                        <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Cor de Destaque</label>
                        <input type="color" id="space-input-color" value="#10b981" class="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl p-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer" />
                    </div>
                    
                    <div class="flex-1 relative">
                        <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Ícone</label>
                        <button type="button" id="space-btn-icon" class="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl flex items-center justify-center text-2xl shadow-inner disabled:opacity-50 disabled:cursor-not-allowed hover:border-indigo-500 transition-colors">🏠</button>
                        
                        <div id="space-icon-selector" class="hidden absolute bottom-[60px] right-0 bg-slate-800 border border-slate-700 p-3 rounded-2xl shadow-2xl w-64 z-[110] animate-fade-in">
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Escolha uma categoria visual</p>
                            <div class="grid grid-cols-5 gap-2" id="space-icon-grid"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="flex justify-end space-x-3 mt-6 pt-4 border-t border-slate-700 shrink-0">
                <button type="button" id="space-btn-cancel" class="px-5 py-2.5 text-slate-400 font-bold hover:bg-slate-800 rounded-xl transition-colors">Cancelar</button>
                <button type="submit" id="space-btn-save" class="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 shadow-lg shadow-indigo-500/30 transition-colors">Salvar Espaço</button>
            </div>
        </form>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    isModalInjected = true;
    configurarEventosModal();
}

function configurarEventosModal() {
    const modal = document.getElementById('modal-space');
    const checkInd = document.getElementById('space-check-ind');
    const boxMembers = document.getElementById('space-box-members');
    const membersList = document.getElementById('space-members-list');
    
    // Grelha de Ícones
    const listaIcones = ['🏠', '🚗', '🛒', '✈️', '💼', '🎉', '🍔', '🐶', '❤️', '🎓', '🏥', '🛠️', '📱', '🎮', '⚽', '💡', '💰', '🔑', '🎨', '🔥'];
    const btnIcon = document.getElementById('space-btn-icon');
    const iconSelector = document.getElementById('space-icon-selector');
    const iconGrid = document.getElementById('space-icon-grid');
    
    listaIcones.forEach(icone => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `icon-opt w-10 h-10 flex items-center justify-center text-xl rounded-xl hover:bg-slate-700 transition-all bg-transparent border border-transparent`;
        btn.innerText = icone;
        btn.addEventListener('click', () => {
            window.spaceIconSelecionado = icone;
            btnIcon.innerText = icone;
            iconSelector.classList.add('hidden');
        });
        iconGrid.appendChild(btn);
    });

    btnIcon.addEventListener('click', (e) => { e.stopPropagation(); if(!btnIcon.disabled) iconSelector.classList.toggle('hidden'); });
    document.addEventListener('click', (e) => { if (!iconSelector.contains(e.target) && !btnIcon.contains(e.target)) iconSelector.classList.add('hidden'); });

    // Fechar
    const fechar = () => { modal.classList.add('hidden'); iconSelector.classList.add('hidden'); };
    document.getElementById('btn-close-space-modal').addEventListener('click', fechar);
    document.getElementById('space-btn-cancel').addEventListener('click', fechar);

    // Toggle Individual
    checkInd.addEventListener('change', (e) => {
        if(e.target.checked) boxMembers.classList.add('hidden');
        else {
            boxMembers.classList.remove('hidden');
            if(membersList.children.length === 0) window.addSpaceMember();
        }
    });

    // Adicionar Membro
    window.addSpaceMember = function(email = '', bloqueado = false) {
        const div = document.createElement('div');
        div.className = "flex gap-2 items-center animate-fade-in";
        div.innerHTML = `
            <input type="email" value="${email}" placeholder="amigo@email.com" class="space-member-input flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed" ${bloqueado?'disabled':''} required />
            ${!bloqueado ? `<button type="button" class="p-2 text-rose-500 hover:bg-rose-500/20 rounded-lg transition-colors"><i class="ph ph-trash"></i></button>` : ''}
        `;
        if(!bloqueado) div.querySelector('button').addEventListener('click', () => div.remove());
        membersList.appendChild(div);
    };
    document.getElementById('space-btn-add-member').addEventListener('click', () => window.addSpaceMember());

    // --- Submissão para o Firebase ---
    document.getElementById('form-space').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        const btnSave = document.getElementById('space-btn-save');
        btnSave.disabled = true;
        btnSave.innerText = 'A guardar...';

        try {
            const isIndividual = document.getElementById('space-check-ind').checked;
            
            // Recolher emails
            let emailsAmigos = [];
            if(!isIndividual) {
                const inputs = document.querySelectorAll('.space-member-input');
                inputs.forEach(inp => { if(inp.value.trim() !== '') emailsAmigos.push(inp.value.trim()); });
            }

            // O dono está sempre incluído
            let participantEmails = [user.email, ...emailsAmigos];
            participantEmails = [...new Set(participantEmails)]; // Remove duplicados
            
            // Dados de status (Quem aceitou o convite)
            const membersData = participantEmails.map(email => ({
                email: email,
                status: email === user.email ? 'accepted' : 'pending' // O criador aceita automaticamente
            }));

            const spaceData = {
                name: document.getElementById('space-input-name').value,
                color: document.getElementById('space-input-color').value,
                icon: window.spaceIconSelecionado || '🏠',
                isIndividual: isIndividual,
                creatorId: user.uid,
                creatorEmail: user.email,
                participantEmails: participantEmails,
                membersData: membersData
            };

            if (estadoAtual.modo === 'criar') {
                spaceData.createdAt = new Date().toISOString();
                await addDoc(collection(db, 'spaces'), spaceData);
            } else if (estadoAtual.modo === 'editar' && estadoAtual.espacoId) {
                await updateDoc(doc(db, 'spaces', estadoAtual.espacoId), spaceData);
            }

            fechar();
        } catch(err) {
            console.error(err);
            alert('Erro ao guardar espaço.');
        } finally {
            btnSave.disabled = false;
            btnSave.innerText = 'Salvar Espaço';
        }
    });
}

function abrirModalEspaco(modo, dados = null) {
    estadoAtual = { modo, espacoId: dados ? dados.id : null };
    document.getElementById('form-space').reset();
    document.getElementById('space-members-list').innerHTML = '';
    
    const title = document.getElementById('modal-space-title');
    const inputName = document.getElementById('space-input-name');
    const inputColor = document.getElementById('space-input-color');
    const checkInd = document.getElementById('space-check-ind');
    const btnIcon = document.getElementById('space-btn-icon');
    const boxMembers = document.getElementById('space-box-members');
    const btnAddMember = document.getElementById('space-btn-add-member');
    const btnSave = document.getElementById('space-btn-save');
    const btnCancel = document.getElementById('space-btn-cancel');

    // Desbloquear tudo por defeito
    [inputName, inputColor, checkInd, btnIcon].forEach(el => el.disabled = false);
    btnSave.classList.remove('hidden');
    btnAddMember.classList.remove('hidden');
    btnCancel.innerText = 'Cancelar';

    if (modo === 'criar') {
        title.innerText = 'Novo Espaço';
        checkInd.checked = true;
        boxMembers.classList.add('hidden');
        window.spaceIconSelecionado = '🏠';
        btnIcon.innerText = '🏠';
        
    } else if (modo === 'editar') {
        title.innerText = 'Editar Espaço';
        inputName.value = dados.name;
        inputColor.value = dados.color;
        window.spaceIconSelecionado = dados.icon;
        btnIcon.innerText = dados.icon;
        checkInd.checked = dados.isIndividual;
        
        if (dados.isIndividual) boxMembers.classList.add('hidden');
        else {
            boxMembers.classList.remove('hidden');
            const user = auth.currentUser;
            dados.participantEmails.filter(e => e !== user.email).forEach(email => window.addSpaceMember(email, false));
        }

    } else if (modo === 'visualizar') {
        title.innerText = 'Detalhes do Espaço';
        [inputName, inputColor, checkInd, btnIcon].forEach(el => el.disabled = true);
        btnSave.classList.add('hidden');
        btnAddMember.classList.add('hidden');
        btnCancel.innerText = 'Fechar';
        
        inputName.value = dados.name;
        inputColor.value = dados.color;
        btnIcon.innerText = dados.icon;
        checkInd.checked = dados.isIndividual;
        boxMembers.classList.remove('hidden');
        
        const user = auth.currentUser;
        dados.participantEmails.filter(e => e !== user.email).forEach(email => window.addSpaceMember(email, true));
    }
    
    document.getElementById('modal-space').classList.remove('hidden');
}