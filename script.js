// Configurações globais de conexão
const urlServidor = "wss://graficos-braille.onrender.com/ws";
const urlAudioBase = "https://graficos-braille.onrender.com";
let ws;

window.addEventListener('DOMContentLoaded', () => {
    const tituloPagina = document.getElementById('titulo-pagina');
    const statusAudio = document.getElementById('status-audio');
    const audio = document.getElementById('audio');
    const fonte = document.getElementById('fonte-audio');
    const btnGravacao = document.getElementById('btn-gravacao');
    const statusGravacao = document.getElementById('status-gravacao');

    // Inicializa a conexão com o Render
    ws = new WebSocket(urlServidor);

    ws.onopen = () => {
        console.log("Conectado ao back-end no Render com sucesso!");
    };

    ws.onmessage = (event) => {
        const respostaAudio = event.data;
        console.log("Resposta recebida da IA:", respostaAudio);
        
        if (statusGravacao) {
            statusGravacao.textContent = "Resposta recebida. Reproduzindo...";
        }
        
        // Toca o áudio enviado pelo servidor
        const audioAssistente = new Audio(urlAudioBase + respostaAudio);
        audioAssistente.play();
    };

    ws.onerror = (error) => {
        console.error("Erro na conexão WebSocket:", error);
    };

    ws.onclose = () => {
        console.log("Conexão WebSocket encerrada.");
    };

    // Pega o ID na URL para o áudio descritivo do ambiente
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');

    if (!id) {
        tituloPagina.textContent = "Erro de Identificação";
        statusAudio.textContent = "Nenhum local foi especificado na URL do QR Code.";
        return;
    }

    // Busca o título e o áudio no banco de dados local
    fetch('db.json')
        .then(response => response.json())
        .then(dados => {
            const informacoesAudio = dados[id];

            if (informacoesAudio) {
                tituloPagina.textContent = informacoesAudio.titulo;
                document.title = `Guia em Áudio - ${informacoesAudio.titulo}`;

                const linkAudio = `./audio/${id}.mpeg`;
                fonte.src = linkAudio;
                audio.load();

                // Gerencia o Autoplay
                audio.play().then(() => {
                    statusAudio.textContent = "Áudio iniciado automaticamente.";
                }).catch(error => {
                    statusAudio.textContent = "Toque em qualquer lugar da tela para iniciar a audiodescrição.";
                    criarCamadaToqueTelaInteira(audio, statusAudio);
                });

            } else {
                tituloPagina.textContent = "Local não encontrado";
                statusAudio.textContent = "O código escaneado não existe no banco de dados.";
            }
        })
        .catch(erro => {
            tituloPagina.textContent = "Erro de Conexão";
            statusAudio.textContent = "Não foi possível carregar as informações do servidor.";
        });
    
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