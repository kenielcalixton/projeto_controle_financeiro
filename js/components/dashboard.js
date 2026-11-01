// js/components/dashboard.js
import { auth, db } from '../config/firebase.js';
import { 
    collection, 
    query, 
    where, 
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export function renderizarDashboard() {
    const main = document.getElementById('main-content');
    const user = auth.currentUser;
    
    if (!user) return;

    // 1. Injeção do Esqueleto HTML com IDs específicos para os valores
    main.innerHTML = `
        <div class="space-y-6 animate-fade-in max-w-6xl mx-auto h-full">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-5">
                
                <div class="p-5 bg-slate-800 border border-slate-700 rounded-2xl shadow-sm flex flex-col justify-between">
                    <div><p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Saldo Inicial (Contas)</p></div>
                    <p id="saldo-inicial" class="text-3xl font-bold tracking-tight text-indigo-500">A carregar...</p>
                </div>
                
                <div class="p-5 bg-slate-800 border border-slate-700 rounded-2xl shadow-sm">
                    <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Receitas do Mês</p>
                    <p id="receitas-mes" class="text-2xl font-bold text-emerald-500 mb-2">R$ 0.00</p>
                    <div class="flex justify-between text-xs text-slate-500">
                        <span>Efetivado: <span id="receitas-efetivadas" class="font-bold text-emerald-400">R$ 0.00</span></span>
                    </div>
                </div>
                
                <div class="p-5 bg-slate-800 border border-slate-700 rounded-2xl shadow-sm">
                    <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Despesas do Mês</p>
                    <p id="despesas-mes" class="text-2xl font-bold text-rose-500 mb-2">R$ 0.00</p>
                    <div class="flex justify-between text-xs text-slate-500">
                        <span>Efetivado: <span id="despesas-efetivadas" class="font-bold text-rose-400">R$ 0.00</span></span>
                    </div>
                </div>
                
                <div class="p-5 bg-slate-800 border border-slate-700 rounded-2xl shadow-sm bg-indigo-900/10">
                    <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Saldo Final Mês</p>
                    <p id="saldo-projetado" class="text-2xl font-bold mb-2">R$ 0.00</p>
                    <div class="text-xs text-slate-500">Saldo Efetivado: <span id="saldo-efetivado" class="font-bold">R$ 0.00</span></div>
                </div>

            </div>
        </div>
    `;

    // 2. Variáveis de Estado Nativas
    let contas = [];
    let transacoes = [];
    const dataAtual = new Date(); // Para o filtro de mês

    // 3. Função Matemática que calcula e atualiza o DOM (Interface)
    function calcularEAtualizar() {
        // Cálculo do Saldo das Contas Bancárias (Ignorando Cartões de Crédito)
        const totalBalance = contas
            .filter(a => a.type !== 'credit')
            .reduce((acc, curr) => acc + parseFloat(curr.initialBalance || 0), 0);

        // Filtrar Transações do Mês e Ano atuais
        const mesAtual = dataAtual.getMonth();
        const anoAtual = dataAtual.getFullYear();
        
        const txFiltradas = transacoes.filter(tx => {
            const dataRef = tx.dueDate || tx.launchDate;
            if (!dataRef) return false;
            const dataTx = new Date(dataRef + 'T12:00:00');
            return dataTx.getMonth() === mesAtual && dataTx.getFullYear() === anoAtual;
        });

        // Somatórios
        let totalIncome = 0, totalExpense = 0, paidIncome = 0, paidExpense = 0;
        
        txFiltradas.forEach(tx => {
            const val = parseFloat(tx.amount || 0);
            if (tx.type === 'income') { 
                totalIncome += val; 
                if (tx.status === 'paid') paidIncome += val; 
            } else { 
                totalExpense += val; 
                if (tx.status === 'paid') paidExpense += val; 
            }
        });

        const saldoEfetivado = paidIncome - paidExpense;
        const saldoProjetado = totalIncome - totalExpense;

        // Atualizar os elementos visuais pelo ID
        document.getElementById('saldo-inicial').innerText = `R$ ${totalBalance.toFixed(2)}`;
        document.getElementById('receitas-mes').innerText = `R$ ${totalIncome.toFixed(2)}`;
        document.getElementById('receitas-efetivadas').innerText = `R$ ${paidIncome.toFixed(2)}`;
        document.getElementById('despesas-mes').innerText = `R$ ${totalExpense.toFixed(2)}`;
        document.getElementById('despesas-efetivadas').innerText = `R$ ${paidExpense.toFixed(2)}`;
        
        // Atualizar Saldo Projetado (Cor dinâmica)
        const elProjetado = document.getElementById('saldo-projetado');
        elProjetado.innerText = `R$ ${saldoProjetado.toFixed(2)}`;
        elProjetado.className = `text-2xl font-bold mb-2 ${saldoProjetado >= 0 ? 'text-emerald-500' : 'text-rose-500'}`;

        // Atualizar Saldo Efetivado (Cor dinâmica)
        const elEfetivado = document.getElementById('saldo-efetivado');
        elEfetivado.innerText = `R$ ${saldoEfetivado.toFixed(2)}`;
        elEfetivado.className = `font-bold ${saldoEfetivado >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    // 4. Conexão em Tempo Real com o Firebase (Contas)
    const qContas = query(collection(db, 'accounts'), where('userId', '==', user.uid));
    onSnapshot(qContas, (snapshot) => {
        contas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        calcularEAtualizar();
    });

    // 5. Conexão em Tempo Real com o Firebase (Transações partilhadas ou privadas)
    const qTransacoes = query(collection(db, 'transactions'), where('participantEmails', 'array-contains', user.email));
    onSnapshot(qTransacoes, (snapshot) => {
        transacoes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        calcularEAtualizar();
    });
}