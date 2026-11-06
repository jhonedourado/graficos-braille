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
    
    let audioAssistente = null;
    let isRecording = false;
    let mediaRecorder = null;
    let audioChunks = [];

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

        // Se já estiver o áudio de aguarde tocando, pausa e zera antes de tocar a resposta
        if (audioAssistente){
            audioAssistente.pause();
            audioAssistente.currentTime = 0;
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

    btnGravacao.addEventListener('click', async () => {
        // 1. SE JÁ ESTIVER GRAVANDO: O clique serve para PARAR
        if (isRecording) {
            isRecording = false;
            
            // Reseta o visual do botão para o estado original
            btnGravacao.textContent = "Gravar Pergunta";
            btnGravacao.style.backgroundColor = ""; // Volta à cor padrão
            
            if (statusGravacao) statusGravacao.textContent = "Processando áudio...";

            // Manda o gravador parar (isso dispara o evento onstop abaixo)
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();
            }
            return; // Sai da função para não iniciar uma nova gravação
        }

        // 2. SE NÃO ESTIVER GRAVANDO: O clique serve para INICIAR
        isRecording = true;
        
        // Altera o visual do botão para o usuário saber que está gravando
        btnGravacao.textContent = "Parar Gravação";
        btnGravacao.style.backgroundColor = "#d32f2f"; // Fica vermelho
        
        if (statusGravacao) statusGravacao.textContent = "Gravando... Clique novamente para enviar.";

        // Silencia a IA imediatamente (seu código original que estava certinho)
        if (audioAssistente && !audioAssistente.paused) {
            audioAssistente.pause();
        }

        try {
            // Pede permissão e liga o microfone
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            // Vai guardando os pedaços do áudio
            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            // Quando o mediaRecorder.stop() for chamado (lá no passo 1), ele monta o arquivo e envia
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                console.log("Áudio pronto para envio:", audioBlob);
                
                // Envia para o seu back-end
                enviarParaBackend(audioBlob); 
                
                // Desliga a "luz vermelha" do microfone na aba do navegador
                stream.getTracks().forEach(track => track.stop());
            };

            // Começa a gravar de fato
            mediaRecorder.start();

        } catch (erro) {
            console.error("Erro ao acessar o microfone:", erro);
            isRecording = false;
            btnGravacao.textContent = "Gravar Pergunta";
            if (statusGravacao) statusGravacao.textContent = "Erro no microfone. Tente novamente.";
        }
    });

    // Lógica do Pause e Reprodução de Áudio ao clicar
    document.addEventListener('click', (event) => {
        // Se o usuário clicar no botão de gravar, ignora para não dar conflito
        if (event.target.id === 'btn-gravacao') return;

        if (audioAssistente) {
            if (audioAssistente.paused) {
                audioAssistente.play();
            } else {
                audioAssistente.pause();
            }
        }
    });

    // Lógica do Pause e Reprodução de Áudio pela barra de espaço
    document.addEventListener('keydown', (event) => {
        if (event.code === 'Space' && event.target !== 'btn-gravacao'){
            event.preventDefault();

            if (audioAssistente.paused) {
                audioAssistente.play();
            } else {
                audioAssistente.pause();
            }
        }
    })
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