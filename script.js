window.addEventListener('DOMContentLoaded', () => {
    const tituloPagina = document.getElementById('titulo-pagina');
    const statusAudio = document.getElementById('status-audio');
    const audio = document.getElementById('audio');
    const fonte = document.getElementById('fonte-audio');

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

                // Monta link do Drive usando o ID
                const linkDrive = `https://drive.google.com/uc?export=open&id=${informacoesAudio.audio_id}`;
                fonte.src = linkDrive;
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
