// js/services/emailService.js
import { db } from '../config/firebase.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export async function processarNotificacaoEmail(emailDestino, remetenteEmail, tipo, dados) {
    try {
        // 1. Verifica se o e-mail já existe na base de dados
        const q = query(collection(db, 'users'), where('email', '==', emailDestino));
        const snap = await getDocs(q);
        
        // Se a pessoa já tem conta, não fazemos nada (ela vê na aba Pendências)
        if (!snap.empty) {
            console.log(`Utilizador ${emailDestino} já existe. Notificação interna.`);
            return; 
        }

        // 2. Prepara a mensagem para quem não tem conta
        let textoMensagem = '';
        if (tipo === 'rateio') {
            textoMensagem = `Você foi adicionado a um rateio referente a "${dados.descricao}". A sua parte é de R$ ${dados.valor.toFixed(2)}. Crie a sua conta gratuita para aceitar ou contestar este valor.`;
        } else if (tipo === 'espaco') {
            textoMensagem = `Você foi convidado para colaborar no espaço financeiro "${dados.nomeEspaco}". Crie a sua conta gratuita para começar a dividir despesas.`;
        }

        // 3. Monta o objeto de variáveis para o EmailJS
        const templateParams = {
            to_email: emailDestino,
            from_email: remetenteEmail,
            mensagem: textoMensagem,
            link_app: window.location.origin // Pega o link real do seu app (localhost ou domínio do Firebase)
        };

        // 4. Dispara o e-mail
        // ⚠️ ATENÇÃO: COLOQUE OS SEUS IDs AQUI ABAIXO
        const response = await emailjs.send('service_gf3mz3n', 'template_bgr45or', templateParams);
        
        console.log(`E-mail enviado com sucesso para ${emailDestino}! Status:`, response.status);
    } catch (error) {
        console.error("Erro ao enviar e-mail via EmailJS:", error);
    }
}