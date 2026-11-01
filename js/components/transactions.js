// js/components/transactions.js
import { auth, db } from '../config/firebase.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export function renderizarLancamentos() {
    const main = document.getElementById('main-content');
    const user = auth.currentUser;
    if (!user) return;

    // 1. Injeção do Esqueleto da Tabela
    main.innerHTML = `
        <div class="space-y-4 animate-fade-in flex flex-col h-full max-w-6xl mx-auto">
            <div class="flex justify-between items-center">
                <h2 class="text-xl font-bold">Lançamentos</h2>
                <!-- Filtros simples -->
                <div class="flex space-x-2">
                    <button class="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-500 text-white cursor-default">Este Mês</button>
                </div>
            </div>
            
            <div class="bg-slate-800 border border-slate-700 rounded-2xl shadow-sm flex-1 flex flex-col overflow-hidden">
                <div class="overflow-x-auto flex-1">
                    <table class="w-full text-left border-collapse">
                        <thead class="sticky top-0 bg-slate-900 z-10">
                            <tr class="text-slate-400 text-xs uppercase">
                                <th class="p-4 border-b border-slate-700 w-24">Ações</th>
                                <th class="p-4 border-b border-slate-700">Situação</th>
                                <th class="p-4 border-b border-slate-700">Data</th>
                                <th class="p-4 border-b border-slate-700">Descrição</th>
                                <th class="p-4 border-b border-slate-700">Categoria</th>
                                <th class="p-4 border-b border-slate-700 text-right">Valor</th>
                            </tr>
                        </thead>
                        <tbody id="tabela-lancamentos">
                            <tr><td colspan="6" class="p-8 text-center text-slate-500"><i class="ph ph-spinner animate-spin text-2xl mb-2"></i><br>A procurar lançamentos...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // 2. Buscar Dados no Firebase
    const dataAtual = new Date();
    const qTransacoes = query(collection(db, 'transactions'), where('participantEmails', 'array-contains', user.email));
    
    // Guardamos o unsubscribe para podermos desligar o listener se mudarmos de aba (otimização)
    const unsubscribe = onSnapshot(qTransacoes, (snapshot) => {
        const transacoes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Filtro do mês atual
        const txFiltradas = transacoes.filter(tx => {
            const dataRef = tx.dueDate || tx.launchDate;
            if (!dataRef) return false;
            const dataTx = new Date(dataRef + 'T12:00:00');
            return dataTx.getMonth() === dataAtual.getMonth() && dataTx.getFullYear() === dataAtual.getFullYear();
        }).sort((a, b) => new Date(a.dueDate || a.launchDate) - new Date(b.dueDate || b.launchDate));

        const tbody = document.getElementById('tabela-lancamentos');
        
        if (txFiltradas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-500">Nenhum lançamento encontrado neste mês.</td></tr>`;
            return;
        }

        // Desenhar as linhas da tabela
        tbody.innerHTML = '';
        txFiltradas.forEach(tx => {
            const dataExibicao = (tx.launchDate || '').split('-').reverse().join('/');
            const isReceita = tx.type === 'income';
            const isPago = tx.status === 'paid';
            
            const tr = document.createElement('tr');
            tr.className = 'border-b border-slate-800 hover:bg-slate-700/50 transition-colors';
            
            tr.innerHTML = `
                <td class="p-4 flex items-center space-x-2">
                    <button class="text-indigo-400 hover:text-indigo-300" title="Editar (Em breve)"><i class="ph ph-pencil-simple text-lg"></i></button>
                    <button class="text-rose-400 hover:text-rose-300" title="Excluir (Em breve)"><i class="ph ph-trash text-lg"></i></button>
                </td>
                <td class="p-4">
                    <span class="flex items-center px-2.5 py-1 w-max rounded-full text-xs font-medium ${isPago ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}">
                        <i class="ph-fill mr-1 ${isPago ? 'ph-check-circle' : 'ph-clock'}"></i> 
                        ${isPago ? 'Efetivado' : 'Pendente'}
                    </span>
                </td>
                <td class="p-4 text-sm text-slate-400">${dataExibicao}</td>
                <td class="p-4 text-sm font-medium text-slate-200">
                    ${tx.description} 
                    ${tx.splitType !== 'individual' ? '<span class="ml-2 text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-md uppercase font-bold tracking-wider">Rateio</span>' : ''}
                </td>
                <td class="p-4 text-sm text-slate-400">${tx.category}</td>
                <td class="p-4 text-sm font-bold text-right ${isReceita ? 'text-emerald-500' : 'text-rose-500'}">
                    ${isReceita ? '+' : '-'} R$ ${parseFloat(tx.amount || 0).toFixed(2)}
                </td>
            `;
            tbody.appendChild(tr);
        });
    });

    // Guardar a função de limpeza no elemento para podermos desativar ao mudar de aba
    main.dataset.unsubscribe = unsubscribe;
}