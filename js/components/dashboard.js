// js/components/dashboard.js
import { auth, db } from '../config/firebase.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let unsubscribeDashboard = null;
let chartCategorias = null;

export function renderizarDashboard() {
    const main = document.getElementById('main-content');
    const user = auth.currentUser;
    if (!user) return;

    // 1. Injeção do Esqueleto do Dashboard
    main.innerHTML = `
        <div class="max-w-7xl mx-auto w-full flex flex-col h-full animate-fade-in space-y-6 overflow-y-auto pb-6">
            
            <div class="flex justify-between items-center shrink-0">
                <h2 class="text-2xl font-bold text-white">Dashboard Analítico</h2>
                <div class="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
                    <input type="month" id="filtro-mes" class="bg-transparent text-indigo-400 font-bold text-sm px-2 focus:outline-none cursor-pointer" />
                </div>
            </div>

            <!-- Cards de Resumo Rápido -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0" id="dash-cards">
                <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex items-center justify-between opacity-50"><p>A calcular...</p></div>
                <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex items-center justify-between opacity-50"><p>A calcular...</p></div>
                <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex items-center justify-between opacity-50"><p>A calcular...</p></div>
            </div>

            <!-- Área de Gráficos -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[350px]">
                
                <!-- Gráfico de Categorias -->
                <div class="bg-darkcard border border-darkborder rounded-3xl p-6 shadow-sm flex flex-col items-center relative">
                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 self-start w-full border-b border-slate-700/50 pb-3">Despesas por Categoria</h3>
                    <div class="relative w-full max-w-[280px] aspect-square flex-1 flex items-center justify-center">
                        <canvas id="grafico-categorias"></canvas>
                        <!-- Centro do Gráfico Vazio -->
                        <div id="chart-center-text" class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none hidden">
                            <span class="text-[10px] font-bold text-slate-500 uppercase">Total</span>
                            <span class="text-lg font-bold text-rose-500" id="chart-total-value">R$ 0</span>
                        </div>
                    </div>
                </div>

                <!-- Top Despesas -->
                <div class="bg-darkcard border border-darkborder rounded-3xl p-6 shadow-sm flex flex-col">
                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-700/50 pb-3">Top Maiores Despesas (Mês)</h3>
                    <div id="lista-top-despesas" class="space-y-3 overflow-y-auto flex-1 pr-2">
                        <p class="text-center text-slate-500 mt-10 text-sm">A analisar os seus dados...</p>
                    </div>
                </div>

            </div>
        </div>
    `;

    // 2. Definir o mês atual no input de filtro
    const inputMes = document.getElementById('filtro-mes');
    const dataAtual = new Date();
    const mesAtualStr = `${dataAtual.getFullYear()}-${String(dataAtual.getMonth() + 1).padStart(2, '0')}`;
    inputMes.value = mesAtualStr;

    // 3. Injetar biblioteca Chart.js dinamicamente se não existir
    if (!document.getElementById('chartjs-script')) {
        const script = document.createElement('script');
        script.id = 'chartjs-script';
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        document.head.appendChild(script);
        script.onload = () => inicializarDados(user, inputMes);
    } else {
        inicializarDados(user, inputMes);
    }

    // Atualizar dados ao mudar de mês
    inputMes.addEventListener('change', () => inicializarDados(user, inputMes));
    main.dataset.unsubscribe = "true";
}

export function limparListenerDashboard() {
    if (unsubscribeDashboard) { unsubscribeDashboard(); unsubscribeDashboard = null; }
    if (chartCategorias) { chartCategorias.destroy(); chartCategorias = null; }
}

function inicializarDados(user, inputMes) {
    if (unsubscribeDashboard) unsubscribeDashboard();

    const q = query(collection(db, 'transactions'), where('participantEmails', 'array-contains', user.email));
    
    unsubscribeDashboard = onSnapshot(q, (snapshot) => {
        const transacoes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        processarDadosDashboard(transacoes, inputMes.value, user);
    });
}

function processarDadosDashboard(todasTransacoes, mesFiltro, user) {
    let recTotal = 0;
    let despTotal = 0;
    const categoriasMap = {}; // Para o gráfico
    const despesasParaLista = []; // Para a lista de top gastos

    todasTransacoes.forEach(tx => {
        // Filtrar apenas o mês selecionado (ex: "2026-11")
        if (!tx.launchDate.startsWith(mesFiltro)) return;

        const myPart = tx.splitParticipants ? tx.splitParticipants.find(p => p.email === user.email) : null;
        const meuValor = myPart ? myPart.amount : tx.amount;

        if (tx.type === 'income') {
            recTotal += meuValor;
        } else {
            despTotal += meuValor;
            
            // Agrupar para o gráfico de categorias
            const catNome = tx.category || 'Outros';
            const catColor = tx.categoryColor || '#64748b';
            const catIcon = tx.categoryIcon || '📌';

            if (!categoriasMap[catNome]) {
                categoriasMap[catNome] = { valor: 0, cor: catColor, icone: catIcon };
            }
            categoriasMap[catNome].valor += meuValor;

            // Guardar para o Top Despesas
            despesasParaLista.push({ 
                desc: tx.description, 
                valor: meuValor, 
                data: tx.launchDate, 
                catNome, catColor, catIcon 
            });
        }
    });

    // 1. Renderizar Cards Superiores
    const saldo = recTotal - despTotal;
    document.getElementById('dash-cards').innerHTML = `
        <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex items-center justify-between shadow-sm hover:border-indigo-500/30 transition-colors">
            <div><p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Receitas</p><p class="text-xl font-bold text-emerald-500">R$ ${recTotal.toFixed(2)}</p></div>
            <div class="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xl"><i class="ph-fill ph-trend-up"></i></div>
        </div>
        <div class="bg-darkcard border border-darkborder p-5 rounded-2xl flex items-center justify-between shadow-sm hover:border-rose-500/30 transition-colors">
            <div><p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Despesas</p><p class="text-xl font-bold text-rose-500">- R$ ${despTotal.toFixed(2)}</p></div>
            <div class="w-10 h-10 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center text-xl"><i class="ph-fill ph-trend-down"></i></div>
        </div>
        <div class="bg-indigo-600 border border-indigo-500 p-5 rounded-2xl flex items-center justify-between shadow-lg shadow-indigo-500/20">
            <div><p class="text-xs font-bold text-indigo-200 uppercase tracking-wider mb-1">Saldo do Mês</p><p class="text-xl font-bold text-white">R$ ${saldo.toFixed(2)}</p></div>
            <div class="w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center text-xl"><i class="ph-fill ph-wallet"></i></div>
        </div>
    `;

    // 2. Renderizar Top Maiores Despesas (Ordenadas do maior para o menor)
    despesasParaLista.sort((a, b) => b.valor - a.valor);
    const topDespesas = despesasParaLista.slice(0, 5); // Pega as 5 maiores
    const listaHtml = document.getElementById('lista-top-despesas');
    
    if (topDespesas.length === 0) {
        listaHtml.innerHTML = `<p class="text-center text-slate-500 mt-10 text-sm font-medium">Nenhuma despesa registada neste mês.</p>`;
    } else {
        listaHtml.innerHTML = topDespesas.map((d, index) => `
            <div class="flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-700/50">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-slate-400 bg-slate-800 shrink-0">${index + 1}º</div>
                    <div>
                        <p class="text-sm font-bold text-white leading-tight">${d.desc}</p>
                        <div class="flex items-center gap-1.5 mt-0.5">
                            <span class="text-[10px] font-bold" style="color: ${d.catColor}">${d.catIcon} ${d.catNome}</span>
                            <span class="text-slate-600">•</span>
                            <span class="text-[10px] text-slate-500">${d.data.split('-').reverse().join('/')}</span>
                        </div>
                    </div>
                </div>
                <p class="text-sm font-bold text-rose-500 shrink-0">- R$ ${d.valor.toFixed(2)}</p>
            </div>
        `).join('');
    }

    // 3. Renderizar Gráfico Chart.js
    const ctx = document.getElementById('grafico-categorias');
    const nomesCategorias = Object.keys(categoriasMap);
    const valoresCategorias = nomesCategorias.map(n => categoriasMap[n].valor);
    const coresCategorias = nomesCategorias.map(n => categoriasMap[n].cor);

    if (chartCategorias) {
        chartCategorias.destroy();
    }

    if (nomesCategorias.length === 0) {
        document.getElementById('chart-center-text').classList.add('hidden');
        ctx.style.display = 'none'; // Esconde o canvas se não houver dados
        return;
    }

    ctx.style.display = 'block';
    document.getElementById('chart-center-text').classList.remove('hidden');
    document.getElementById('chart-total-value').innerText = `R$ ${despTotal.toFixed(0)}`;

    chartCategorias = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: nomesCategorias,
            datasets: [{
                data: valoresCategorias,
                backgroundColor: coresCategorias,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%', // Faz o buraco do meio ficar largo para o texto central
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { family: "'Inter', sans-serif", size: 10, weight: 'bold' }, padding: 15, usePointStyle: true, pointStyle: 'circle' }
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#f8fafc',
                    bodyColor: '#f8fafc',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            return ` R$ ${context.parsed.toFixed(2)}`;
                        }
                    }
                }
            }
        }
    });
}