// js/components/spaceDetails.js
import { auth, db } from '../config/firebase.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { renderizarEspacos } from './spaces.js'; 

let unsubscribeSpaceTx = null;

export function abrirDetalheEspaco(space) {
    const main = document.getElementById('main-content');
    const user = auth.currentUser;
    if (!user) return;

    if (unsubscribeSpaceTx) unsubscribeSpaceTx();

    // Lógica Condicional: Só renderiza a secção de Auditoria se NÃO for um espaço individual
    const htmlAuditoriaMembros = space.isIndividual ? '' : `
        <h3 class="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 shrink-0">Auditoria por Membro</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 shrink-0" id="space-members-cards">
            <!-- Preenchido via JS -->
        </div>
    `;

    // 1. Injeta o Esqueleto do Detalhe do Espaço
    main.innerHTML = `
        <div class="max-w-6xl mx-auto w-full flex flex-col h-full animate-fade-in relative pb-6">
            
            <!-- Cabeçalho -->
            <div class="flex items-center gap-4 mb-6 shrink-0 mt-2">
                <button id="btn-voltar-espacos" class="p-2.5 bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors border border-slate-700 hover:border-slate-500 shadow-sm">
                    <i class="ph ph-arrow-left text-xl"></i>
                </button>
                <div>
                    <h2 class="text-2xl font-bold text-white flex items-center gap-2">
                        <span>${space.icon || '🌌'}</span> ${space.name}
                    </h2>
                    <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">
                        ${space.isIndividual ? 'Espaço Privado' : `${space.participantEmails ? space.participantEmails.length : 1} Participantes ativos`}
                    </p>
                </div>
            </div>

            <!-- Resumo Global do Espaço -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 shrink-0" id="space-global-cards">
                <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex items-center justify-between opacity-50"><p class="text-slate-400">A calcular globais...</p></div>
                <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex items-center justify-between opacity-50"><p class="text-slate-400">A calcular globais...</p></div>
            </div>

            <!-- Balanço por Membro (Injetado Condicionalmente) -->
            ${htmlAuditoriaMembros}

            <!-- Extrato do Espaço -->
            <div class="bg-darkcard border border-darkborder rounded-3xl flex-1 overflow-hidden shadow-sm flex flex-col min-h-[400px]">
                <div class="p-5 border-b border-darkborder bg-slate-800/50 flex justify-between items-center shrink-0">
                    <h3 class="text-sm font-bold text-slate-300 uppercase tracking-wider">Histórico de Lançamentos</h3>
                    <span class="hidden sm:inline-block px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-lg text-xs font-bold border border-indigo-500/20">
                        ${space.isIndividual ? 'Extrato Individual' : 'Extrato Partilhado'}
                    </span>
                </div>
                <div id="lista-tx-espaco" class="overflow-y-auto flex-1 divide-y divide-darkborder bg-darkcard p-2">
                    <div class="text-center p-8 text-slate-500"><i class="ph ph-spinner animate-spin text-2xl mb-2"></i><br>A carregar dados financeiros...</div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-voltar-espacos').addEventListener('click', () => {
        if (unsubscribeSpaceTx) unsubscribeSpaceTx();
        renderizarEspacos(); 
    });

    const q = query(collection(db, 'transactions'), where('spaceId', '==', space.id));
    unsubscribeSpaceTx = onSnapshot(q, (snapshot) => {
        const transacoes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        transacoes.sort((a, b) => new Date(b.launchDate) - new Date(a.launchDate));
        renderizarExtratoEspaco(transacoes, space, user);
    });

    main.dataset.unsubscribe = "true";
}

function renderizarExtratoEspaco(transacoes, space, user) {
    const container = document.getElementById('lista-tx-espaco');
    const globalCards = document.getElementById('space-global-cards');
    const membersCards = document.getElementById('space-members-cards');

    let totalDespesaGlobal = 0;
    let totalReceitaGlobal = 0;

    // 1. Inicializar Auditória de Membros (Se for partilhado)
    const mapParticipantes = {};
    if (!space.isIndividual && space.participantEmails) {
        space.participantEmails.forEach(email => {
            mapParticipantes[email] = {
                email: email,
                despesaTotal: 0,
                despesaEfetivada: 0,
                receitaTotal: 0,
                receitaEfetivada: 0
            };
        });
    }

    let htmlLista = '';

    if (transacoes.length === 0) {
        htmlLista = `<div class="text-center p-12 text-slate-500 font-medium flex flex-col items-center"><i class="ph ph-receipt text-4xl mb-3 opacity-30"></i>Este espaço ainda não tem lançamentos.</div>`;
    } else {
        transacoes.forEach(tx => {
            
            // Soma para o Global do Espaço
            if (tx.type === 'expense') totalDespesaGlobal += tx.amount;
            if (tx.type === 'income') totalReceitaGlobal += tx.amount;

            // 2. O MOTOR DE CÁLCULO POR MEMBRO (Ignorado em Espaços Individuais)
            if (!space.isIndividual && tx.splitParticipants) {
                tx.splitParticipants.forEach(p => {
                    if (!mapParticipantes[p.email]) {
                        mapParticipantes[p.email] = { email: p.email, despesaTotal: 0, despesaEfetivada: 0, receitaTotal: 0, receitaEfetivada: 0 };
                    }
                    const isEfetivado = (p.status === 'paid' || p.status === 'accepted');
                    
                    if (tx.type === 'expense') {
                        mapParticipantes[p.email].despesaTotal += p.amount;
                        if (isEfetivado) mapParticipantes[p.email].despesaEfetivada += p.amount;
                    } else if (tx.type === 'income') {
                        mapParticipantes[p.email].receitaTotal += p.amount;
                        if (isEfetivado) mapParticipantes[p.email].receitaEfetivada += p.amount;
                    }
                });
            }

            // ==========================================
            // Renderização da Tabela de Lançamentos
            // ==========================================
            const myPart = tx.splitParticipants ? tx.splitParticipants.find(p => p.email === user.email) : null;
            const meuValor = myPart ? myPart.amount : tx.amount;
            const myStatus = myPart ? myPart.status : (tx.status || 'pending');
            
            const catNome = tx.category || 'Outros';
            const catIcon = tx.categoryIcon || '📌';
            const catColor = tx.categoryColor || '#64748b';
            
            const isPaid = myStatus === 'paid' || myStatus === 'accepted';
            
            // Adaptação dos Textos para Individual vs Partilhado
            const txtLiquidado = space.isIndividual ? 'Liquidado' : 'A sua parte liquidada';
            const txtPendente = space.isIndividual ? 'Pendente' : 'A sua parte pendente';

            const statusHtml = isPaid
                ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">${txtLiquidado}</span>`
                : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30">${txtPendente}</span>`;

            htmlLista += `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-slate-800/50 transition-colors rounded-xl gap-4">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 border" style="background-color: ${catColor}15; color: ${catColor}; border-color: ${catColor}30;">
                            ${catIcon}
                        </div>
                        <div>
                            <p class="text-sm font-bold text-white leading-tight">${tx.description}</p>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="text-[10px] text-slate-400 font-bold px-1.5 py-0.5 bg-slate-800 rounded-md border border-slate-700">${tx.launchDate.split('-').reverse().join('/')}</span>
                                ${!space.isIndividual ? `
                                    <span class="text-slate-600">•</span>
                                    <span class="text-[10px] text-slate-500 flex items-center"><i class="ph-fill ph-user-circle mr-1"></i> Criado por: ${tx.creatorEmail.split('@')[0]}</span>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-slate-700/50 pt-3 sm:pt-0 mt-2 sm:mt-0">
                        <div class="flex items-center gap-3 sm:hidden mb-1">${statusHtml}</div>
                        <div class="text-right">
                            <p class="text-sm font-bold ${tx.type === 'expense' ? 'text-rose-500' : 'text-emerald-500'}">
                                ${tx.type === 'expense' ? '-' : '+'} R$ ${tx.amount.toFixed(2)} ${!space.isIndividual ? '<span class="text-[10px] text-slate-500 font-normal uppercase ml-1">(Total)</span>' : ''}
                            </p>
                            <div class="flex items-center justify-end gap-2 mt-1">
                                ${!space.isIndividual ? `<p class="text-xs text-indigo-300 font-bold bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">A Sua Parte: R$ ${meuValor.toFixed(2)}</p>` : ''}
                                <div class="hidden sm:block">${statusHtml}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = htmlLista;

    // 3. Renderizar Totalizadores Globais do Espaço
    const tituloDespesa = space.isIndividual ? 'Total de Despesas' : 'Despesas Globais do Espaço';
    const tituloReceita = space.isIndividual ? 'Total de Receitas' : 'Receitas Globais do Espaço';

    globalCards.innerHTML = `
        <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex items-center justify-between shadow-sm">
            <div>
                <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">${tituloDespesa}</p>
                <p class="text-2xl font-bold text-rose-500">- R$ ${totalDespesaGlobal.toFixed(2)}</p>
            </div>
            <div class="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center text-2xl border border-rose-500/30"><i class="ph-fill ph-trend-down"></i></div>
        </div>
        
        <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex items-center justify-between shadow-sm">
            <div>
                <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">${tituloReceita}</p>
                <p class="text-2xl font-bold text-emerald-500">+ R$ ${totalReceitaGlobal.toFixed(2)}</p>
            </div>
            <div class="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-2xl border border-emerald-500/30"><i class="ph-fill ph-trend-up"></i></div>
        </div>
    `;

    // 4. Renderizar Cards de Auditoria por Membro (Apenas se o Espaço for Partilhado)
    if (!space.isIndividual && membersCards) {
        let htmlMembers = '';
        
        Object.values(mapParticipantes).forEach(m => {
            const isMe = m.email === user.email;
            const percDesp = m.despesaTotal > 0 ? (m.despesaEfetivada / m.despesaTotal) * 100 : 0;
            const percRec = m.receitaTotal > 0 ? (m.receitaEfetivada / m.receitaTotal) * 100 : 0;

            htmlMembers += `
                <div class="bg-slate-800/40 border ${isMe ? 'border-indigo-500/50 shadow-md shadow-indigo-500/10' : 'border-slate-700/50'} p-4 rounded-2xl flex flex-col relative overflow-hidden transition-all hover:bg-slate-800/80">
                    ${isMe ? '<div class="absolute top-0 right-0 bg-indigo-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-lg tracking-wider">VOCÊ</div>' : ''}
                    
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-8 h-8 rounded-full ${isMe ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-700 text-slate-300'} flex items-center justify-center font-bold text-xs shrink-0">
                            ${m.email.substring(0, 2).toUpperCase()}
                        </div>
                        <p class="text-sm font-bold ${isMe ? 'text-indigo-400' : 'text-white'} truncate" title="${m.email}">${m.email.split('@')[0]}</p>
                    </div>

                    <div class="space-y-4">
                        <div>
                            <div class="flex justify-between text-[10px] font-bold uppercase tracking-wider mb-1.5">
                                <span class="text-rose-400">Pagar: R$ ${m.despesaTotal.toFixed(2)}</span>
                                <span class="text-slate-400">Efetuado: R$ ${m.despesaEfetivada.toFixed(2)}</span>
                            </div>
                            <div class="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                                <div class="bg-rose-500 h-1.5 rounded-full" style="width: ${percDesp}%"></div>
                            </div>
                        </div>
                        <div>
                            <div class="flex justify-between text-[10px] font-bold uppercase tracking-wider mb-1.5">
                                <span class="text-emerald-400">Receber: R$ ${m.receitaTotal.toFixed(2)}</span>
                                <span class="text-slate-400">Efetuado: R$ ${m.receitaEfetivada.toFixed(2)}</span>
                            </div>
                            <div class="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                                <div class="bg-emerald-500 h-1.5 rounded-full" style="width: ${percRec}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        membersCards.innerHTML = htmlMembers;
    }
}