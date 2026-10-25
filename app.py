import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from knowledge_base import KnowledgeBaseManager
from agent import Agent
from audio_service import AudioService


class AppState:
    """
    Container que armazena as instâncias únicas (Singletons) dos serviços da aplicação,
    eliminando a necessidade de variáveis 'global' soltas pelo código.
    """
    def __init__(self):
        self.kb_manager: KnowledgeBaseManager | None = None
        self.agent: Agent | None = None
        self.audio_service: AudioService | None = None
        self.is_ready: bool = False


state = AppState()


async def initialize_services():
    """
    Inicializa o banco vetorial, o agente e o serviço de áudio em segundo plano
    usando threads separadas para não bloquear a abertura da porta no Render.
    """
    try:
        print("Inicializando serviços de IA nos bastidores...")
        
        # 1. Instancia e carrega o banco vetorial (ChromaDB)
        kb_manager = await asyncio.to_thread(KnowledgeBaseManager)
        await asyncio.to_thread(kb_manager.initialize_db)

        # 2. Instancia o Agente injetando o gerenciador de banco de dados
        agent = await asyncio.to_thread(Agent, kb_manager=kb_manager)

        # 3. Instancia o serviço de áudio (garantindo a criação da pasta ./respostas)
        audio_service = await asyncio.to_thread(AudioService, output_dir="./respostas")

        # Salva as instâncias prontas no container de estado
        state.kb_manager = kb_manager
        state.agent = agent
        state.audio_service = audio_service
        state.is_ready = True

        print("=" * 50)
        print("Sistema RAG e Agente de IA prontos para uso!")
        print("=" * 50)

    except Exception as e:
        print(f"Erro crítico na inicialização dos serviços: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Abre a porta imediatamente para o Render detectar que o serviço está vivo
    print("Abrindo a porta do servidor imediatamente...")
    bg_task = asyncio.create_task(initialize_services())
    yield
    # Cancela a tarefa de background caso o servidor seja desligado
    bg_task.cancel()


app = FastAPI(lifespan=lifespan)

# No CORS, a origem deve conter APENAS protocolo e domínio (sem caminhos ou ?id=...)
allowed_origins = [
    "https://jhonedourado.github.io",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "status": "Servidor IA de Acessibilidade Online",
        "ai_ready": state.is_ready
    }


@app.get("/respostas/{filename}")
async def get_audio_file(filename: str):
    # Busca o arquivo MP3 gerado dentro da pasta dedicada './respostas'
    file_path = os.path.join("./respostas", filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Arquivo de áudio não encontrado.")
        
    return FileResponse(file_path, media_type="audio/mpeg")


# Aceita tanto '/ws' (front-end atual) quanto '/ws/{topic}' (filtro por QR Code)
@app.websocket("/ws")
@app.websocket("/ws/{topic}")
async def websocket_endpoint(websocket: WebSocket, topic: str = None):
    await websocket.accept()
    print(f"Cliente WebSocket conectado! Tópico: {topic or 'geral'}")

    # Define o filtro de tópico (se for 'geral' ou vazio, busca em todos os JSONs)
    topic_filter = None if topic in (None, "geral") else topic

    try:
        while True:
            # 1. Recebe os bytes de áudio enviados pelo navegador
            audio_bytes = await websocket.receive_bytes()

            # Verifica se o carregamento em background já terminou
            if not state.is_ready:
                print("Aviso: Áudio recebido, mas a IA ainda está inicializando.")
                continue

            # 2. Converte Áudio para Texto (STT) em thread separada para não travar o loop
            user_text = await asyncio.to_thread(
                state.audio_service.speech_to_text, 
                audio_bytes
            )
            print(f"👤 Usuário (STT): {user_text}")

            # 3. Gera a resposta matemática via RAG (Assíncrono)
            ai_text = await state.agent.generate_answer(
                user_question=user_text,
                topic=topic_filter
            )
            print(f"🤖 Agente (LLM): {ai_text}")

            # 4. Converte Texto para Áudio (TTS) em thread separada e obtém a rota
            audio_route = await asyncio.to_thread(
                state.audio_service.text_to_speech, 
                ai_text
            )

            # 5. Devolve o caminho '/respostas/resposta_agente_xxx.mp3' ao front-end
            await websocket.send_text(audio_route)

    except WebSocketDisconnect:
        print("Cliente Desconectado")
    except Exception as e:
        print(f"Erro durante o processamento no WebSocket: {e}")