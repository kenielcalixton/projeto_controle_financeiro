// js/components/dashboard.js

export function renderizarDashboard() {
    const main = document.getElementById('main-content');
    
    // Por enquanto injetamos os dados estáticos. 
    // Na próxima fase, vamos ligar isto aos dados reais do Firebase!
    main.innerHTML = `
        <div class="space-y-6 animate-fade-in max-w-6xl mx-auto h-full">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-5">
                
                <div class="p-5 bg-slate-800 border border-slate-700 rounded-2xl shadow-sm flex flex-col justify-between">
                    <div><p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Saldo Inicial (Contas)</p></div>
                    <p class="text-3xl font-bold tracking-tight text-indigo-500">R$ 1.500,00</p>
                </div>
                
                <div class="p-5 bg-slate-800 border border-slate-700 rounded-2xl shadow-sm">
                    <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Receitas do Mês</p>
                    <p class="text-2xl font-bold text-emerald-500 mb-2">R$ 5.000,00</p>
                    <div class="flex justify-between text-xs text-slate-500">
                        <span>Efetivado: <span class="font-bold text-emerald-400">R$ 4.000,00</span></span>
                    </div>
                </div>
                
                <div class="p-5 bg-slate-800 border border-slate-700 rounded-2xl shadow-sm">
                    <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Despesas do Mês</p>
                    <p class="text-2xl font-bold text-rose-500 mb-2">R$ 3.200,00</p>
                    <div class="flex justify-between text-xs text-slate-500">
                        <span>Efetivado: <span class="font-bold text-rose-400">R$ 2.000,00</span></span>
                    </div>
                </div>
                
                <div class="p-5 bg-slate-800 border border-slate-700 rounded-2xl shadow-sm bg-indigo-900/10">
                    <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Saldo Final Mês</p>
                    <p class="text-2xl font-bold text-emerald-500 mb-2">R$ 3.300,00</p>
                    <div class="text-xs text-slate-500">Saldo Efetivado: <span class="font-bold text-emerald-400">R$ 3.500,00</span></div>
                </div>

            </div>
        </div>
    `;
}