// Configurações globais de conexão baseadas no QR Code (?id=...)
const urlParams = new URLSearchParams(window.location.search);
const topic = urlParams.get('id');

// Se houver um ID, conecta na rota específica do tópico. Se não, vai para o chat geral.
const urlServidor = topic 
    ? `wss://graficos-braille.onrender.com/ws/${topic}` 
    : "wss://graficos-braille.onrender.com/ws";

const urlAudioBase = "https://graficos-braille.onrender.com";
let ws;

window.addEventListener('DOMContentLoaded', () => {
    const tituloPagina = document.getElementById('titulo-pagina');
    const statusAudio = document.getElementById('status-audio');
    const audio = document.getElementById('audio');
    const fonte = document.getElementById('fonte-audio');
    const btnGravacao = document.getElementById('btn-gravacao');
    const statusGravacao = document.getElementById('status-gravacao');

    // Inicializa a conexão com o Render enviando o tópico correspondente
    ws = new WebSocket(urlServidor);

    ws.onopen = () => {
        console.log(`Conectado ao back-end no Render com sucesso! Tópico: ${topic || 'geral'}`);
    };

    ws.onmessage = (event) => {
        const respostaAudio = event.data;
        console.log("Resposta recebida da IA:", respostaAudio);
        
        if (statusGravacao) {
            statusGravacao.textContent = "Resposta recebida. Reproduzindo...";
        }
        
        // Garante que não haja barras duplas na união do domínio com a rota do servidor
        let caminhoLimpo = respostaAudio;
        if (caminhoLimpo.startsWith("/")) {
            caminhoLimpo = caminhoLimpo.substring(1);
        }

        const urlAudioFinal = `${urlAudioBase}/${caminhoLimpo}`;
        console.log("Tentando reproduzir áudio em:", urlAudioFinal);

        // Toca o áudio enviado pelo servidor
        const audioAssistente = new Audio(urlAudioFinal);
        audioAssistente.play().catch(error => {
            console.error("Erro ao reproduzir áudio:", error);
        });
    };

    ws.onerror = (error) => {
        console.error("Erro na conexão WebSocket:", error);
    };

    ws.onclose = () => {
        console.log("Conexão WebSocket encerrada.");
    };

    // Pega o ID na URL para o áudio descritivo do ambiente
    // Pega o ID na URL (ex: ?id=assintotas)
    const id = topic;

    if (!id) {
        tituloPagina.textContent = "Tutor de Cálculo - IA";
        statusAudio.textContent = "Conectado ao assistente de voz.";
    } else {
        // Formata o título com base no ID (ex: 'assintotas' vira 'Assíntotas')
        const tituloFormatado = id.charAt(0).toUpperCase() + id.slice(1);
        tituloPagina.textContent = tituloFormatado;
        document.title = `Tutor de Cálculo - ${tituloFormatado}`;
        statusAudio.textContent = "Áudio descritivo pronto. Faça sua pergunta à IA abaixo.";
    }
    
    // Dispara a lógica de gravação para a IA
    btnGravacao.addEventListener('click', async function iniciarFluxoGravacao() {
        try {
            // Aguarda a gravação terminar e devolve o arquivo em bytes puros
            const audioBlob = await recordAudio();
            console.log("Áudio pronto para envio:", audioBlob);

            enviarParaBackend(audioBlob);
        } catch (erro) {
            console.error("Erro durante a gravação:", erro);
        }
    });
});

function criarCamadaToqueTelaInteira(audio, statusAudio) {
    const telaInterativa = document.createElement('div');
    telaInterativa.style.position = 'fixed';
    telaInterativa.style.top = '0';
    telaInterativa.style.left = '0';
    telaInterativa.style.width = '100vw';
    telaInterativa.style.height = '100vh';
    telaInterativa.style.zIndex = '9999';
    telaInterativa.setAttribute('role', 'button');
    telaInterativa.setAttribute('aria-label', 'Toque na tela para iniciar o áudio descritivo deste ambiente');
    
    telaInterativa.addEventListener('click', () => {
        audio.play();
        statusAudio.textContent = "Reproduzindo áudio do ambiente.";
        telaInterativa.remove();
    });
    
    document.body.appendChild(telaInterativa);
}

// Captura o microfone e devolve um Blob (bytes do áudio)
async function recordAudio() {
    const btnGravacao = document.getElementById('btn-gravacao');
    const statusGravacao = document.getElementById('status-gravacao');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        statusGravacao.textContent = "Seu navegador não suporta gravação de áudio.";
        throw new Error("API MediaDevices não suportada.");
    }

    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
        statusGravacao.textContent = "Permissão de microfone negada ou não encontrada.";
        throw err;
    }

    const mediaRecorder = new MediaRecorder(stream);
    let chunks = [];

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
    };

    const recordingPromise = new Promise((resolve) => {
        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
            resolve(blob); 
        };
    });

    mediaRecorder.start();

    btnGravacao.classList.add('gravando');
    btnGravacao.setAttribute('aria-label', 'Parar gravação e enviar pergunta');
    btnGravacao.textContent = 'Parar Gravação';
    statusGravacao.textContent = 'Gravação iniciada. Fale sua pergunta e clique em Parar Gravação quando terminar.';

    btnGravacao.onclick = () => {
        if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();

            btnGravacao.classList.remove('gravando');
            btnGravacao.setAttribute('aria-label', 'Gravar pergunta em áudio');
            btnGravacao.textContent = 'Gravar pergunta ao assistente';
            statusGravacao.textContent = 'Gravação finalizada. Enviando áudio...';
            
            btnGravacao.onclick = null;
        }
    };

    return recordingPromise;
}

function enviarParaBackend(audioBlob) {
    const statusGravacao = document.getElementById('status-gravacao');
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(audioBlob); 
        console.log("Áudio enviado com sucesso para o servidor.");
    } else {
        if (statusGravacao) {
            statusGravacao.textContent = "Erro: O servidor ainda não está conectado. Tente novamente.";
        }
        console.warn("Aguarde. O servidor ainda está conectando...");
    }
}