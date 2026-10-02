window.addEventListener('DOMContentLoaded', () => {
    const tituloPagina = document.getElementById('titulo-pagina');
    const statusAudio = document.getElementById('status-audio');
    const audio = document.getElementById('audio');
    const fonte = document.getElementById('fonte-audio');
    const btnGravacao = document.getElementById('btn-gravacao');

    // Pega o ID na URL
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');

    if (!id) {
        tituloPagina.textContent = "Erro de Identificação";
        statusAudio.textContent = "Nenhum local foi especificado na URL do QR Code.";
        return;
    }

    // Busca o título e o áudio
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
    
    btnGravacao.addEventListener('click', async function iniciarFluxoGravação() {
        try {
            // Dispara a gravação e aguarda a string Base64
            const audioBase64 = await recordAudio();

            console.log("Áudio em Base64 pronto para envio:", audioBase64);

            // Envia 'audioBase64' para a API do chatbot
            enviarParaBackend(audioBase64);

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

// Captura o áudio do usuário, atualiza a interface de forma acessível e retorna uma Promise que resolve para a string Base64 do áudio
async function recordAudio() {
    const btnGravacao = document.getElementById('btn-gravacao');
    const statusGravacao = document.getElementById('status-gravacao');

    // Verifica suporte ao microfone
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        statusGravacao.textContent = "Seu navegador não suporta gravação de áudio.";
        throw new Error("API MediaDevices não suportada.");
    }

    // Solicita acesso ao microfone
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

    // Promise que será resolvida quando o usuário clicar em "Parar"
    const recordingPromise = new Promise((resolve) => {
        mediaRecorder.onstop = () => {
            // Desliga o indicador do microfone no hardware/navegador
            stream.getTracks().forEach(track => track.stop());

            // Cria o Blob no tipo nativo gravado
            const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
            
            // Converte para Base64
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
                // Retorna apenas a string Base64 (sem o cabeçalho data:audio/...;base64,)
                const base64Data = reader.result.split(',')[1];
                resolve(base64Data);
            };
        };
    });

    // Inicia a gravação imediatamente
    mediaRecorder.start();

    // Atualiza estados visuais e acessíveis
    btnGravacao.classList.add('gravando');
    btnGravacao.setAttribute('aria-label', 'Parar gravação e enviar pergunta');
    btnGravacao.textContent = 'Parar Gravação';
    statusGravacao.textContent = 'Gravação iniciada. Fale sua pergunta e clique em Parar Gravação quando terminar.';

    // Gerencia o clique de parada
    btnGravacao.onclick = () => {
        if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();

            // Restaura o estado inicial do botão
            btnGravacao.classList.remove('gravando');
            btnGravacao.setAttribute('aria-label', 'Gravar pergunta em áudio');
            btnGravacao.textContent = 'Gravar pergunta ao assistente';
            statusGravacao.textContent = 'Gravação finalizada. Enviando áudio...';
            
            // Remove o evento para evitar múltiplos listeners em futuras chamadas
            btnGravacao.onclick = null;
        }
    };

    return recordingPromise;
}

async function enviarParaBackend(audioBase64) {
    //
}
