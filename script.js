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
    const audioContainer = document.getElementById('audio-container');
    const tituloPagina = document.getElementById('titulo-pagina');
    const statusAudio = document.getElementById('status-audio');
    const audio = document.getElementById('audio');
    const fonte = document.getElementById('fonte-audio');
    const tituloAgente = document.getElementById('titulo-agente')
    const descricaoAgente = document.getElementById('descricao-agente')
    const esferaIA = document.getElementById('esfera-ia');
    const btnGravacao = document.getElementById('btn-gravacao');
    const btnPause = document.getElementById('btn-pause');
    const statusGravacao = document.getElementById('status-gravacao');
    
    // Variáveis de escopo da página
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

        // Se o áudio descritivo original do HTML estiver tocando, pausa ele também
        if (audio && !audio.paused) {
            audio.pause();
        }

        const urlAudioFinal = `${urlAudioBase}/${caminhoLimpo}`;
        console.log("Tentando reproduzir áudio em:", urlAudioFinal);

        // Cria o áudio da IA
        audioAssistente = new Audio(urlAudioFinal);
        
        // Desliga a esfera quando a fala da IA acabar
        audioAssistente.onended = () => {
            if (esferaIA) esferaIA.classList.remove('falando');
        };

        // Toca o áudio da IA e liga a esfera
        audioAssistente.play().then(() => {
            if (esferaIA) esferaIA.classList.add('falando');
        }).catch(error => {
            console.error("Erro ao reproduzir áudio:", error);
        });
    };

    ws.onerror = (error) => {
        console.error("Erro na conexão WebSocket:", error);
    };

    ws.onclose = () => {
        console.log("Conexão WebSocket encerrada.");
    };

    // ---------------------------------------------------------
    // LÓGICA DO ÁUDIO DESCRITIVO INICIAL
    // ---------------------------------------------------------
    const id = topic;

    if (!id) {
        audioContainer.classList.add('remove')
        tituloAgente.textContent = "Tutor de Cálculo - IA";
        descricaoAgente.textContent = "Conectado ao assistente de voz.";
    } else {
        // Formata a primeira letra para maiúscula (ex: 'assintotas' vira 'Assintotas')
        const tituloFormatado = id.charAt(0).toUpperCase() + id.slice(1);
        
        tituloPagina.textContent = tituloFormatado;
        document.title = `Guia em Áudio - ${tituloFormatado}`;

        // Aponta direto para o arquivo de áudio usando o ID da URL
        const linkAudio = `./audio/${id}.mpeg`;
        fonte.src = linkAudio;
        audio.load();

        // Tenta rodar o áudio automaticamente
        audio.play().then(() => {
            statusAudio.textContent = "Áudio iniciado automaticamente. Faça sua pergunta à IA abaixo.";
        }).catch(error => {
            // Se o navegador bloquear o autoplay, pede para o usuário tocar na tela
            statusAudio.textContent = "Toque em qualquer lugar da tela para iniciar a audiodescrição.";
            criarCamadaToqueTelaInteira(audio, statusAudio);
        });
    }

    // ---------------------------------------------------------
    // LÓGICA DE GRAVAÇÃO
    // ---------------------------------------------------------
    if (!isRecording) {
        btnPause.classList.add('remove');
    }
    btnGravacao.addEventListener('click', async () => {
        btnGravacao.blur(); // Tira o foco do botão para não dar conflito com a barra de espaço

        // 1. SE JÁ ESTIVER GRAVANDO: O clique serve para PARAR
        if (isRecording) {
            isRecording = false;
            
            btnPause.classList.add('remove');
            
            btnGravacao.textContent = "Gravar Pergunta";
            // btnGravacao.style.backgroundColor = ""; 
            btnGravacao.classList.remove('gravando');
            
            if (statusGravacao) statusGravacao.textContent = "Processando áudio...";

            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();
            }
            return; 
        }

        // 2. SE NÃO ESTIVER GRAVANDO: O clique serve para INICIAR
        isRecording = true;

        btnPause.classList.remove('remove');
        
        btnGravacao.textContent = "Parar Gravação";
        // btnGravacao.style.backgroundColor = "#d32f2f"; 
        btnGravacao.classList.add('gravando');
        
        if (statusGravacao) statusGravacao.textContent = "Gravando... Clique novamente para enviar.";

        // Silencia a IA imediatamente se ela estiver falando e desliga a esfera
        if (audioAssistente && !audioAssistente.paused) {
            audioAssistente.pause();
            if (esferaIA) esferaIA.classList.remove('falando');
        }

        // Silencia o áudio descritivo original também (caso esteja tocando a introdução)
        if (audio && !audio.paused) {
            audio.pause();
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                console.log("Áudio pronto para envio:", audioBlob);
                enviarParaBackend(audioBlob); 
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();

        } catch (erro) {
            console.error("Erro ao acessar o microfone:", erro);
            isRecording = false;
            btnGravacao.textContent = "Gravar Pergunta";
            btnGravacao.classList.remove('gravando');
            if (statusGravacao) statusGravacao.textContent = "Erro no microfone. Tente novamente.";
        }
    });

    // ---------------------------------------------------------
    // CONTROLES DE REPRODUÇÃO (PAUSE/PLAY DA IA)
    // ---------------------------------------------------------
    
    // Clicando na tela
    // document.addEventListener('click', (event) => {
    btnGravacao.addEventListener('click', async () => {
        // if (event.target.id === 'btn-gravacao') return; // Ignora se o clique for no botão

        if (audioAssistente) {
            if (audioAssistente.paused) {
                audioAssistente.play();
                if (esferaIA) esferaIA.classList.add('falando');
            } else {
                audioAssistente.pause();
                if (esferaIA) esferaIA.classList.remove('falando');
            }
        }
    });

    // Pela barra de espaço
    document.addEventListener('keydown', (event) => {
        if (event.code === 'Space') {
            event.preventDefault(); // Evita rolar a página

            if (audioAssistente) {
                if (audioAssistente.paused) {
                    audioAssistente.play();
                    if (esferaIA) esferaIA.classList.add('falando');
                } else {
                    audioAssistente.pause();
                    if (esferaIA) esferaIA.classList.remove('falando');
                }
            }
        }
    });
});

// Camada extra de acessibilidade para ambiente (quando o autoplay é bloqueado)
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

// Envia o Blob de áudio para o servidor FastAPI
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
