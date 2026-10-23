# Classe do Agente
import json
import os
import re
import time
import speech_recognition as sr
import io
from langchain_core.documents import Document
from langchain_chroma import Chroma
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from gtts import gTTS
from pydub import AudioSegment
from dotenv import load_dotenv

load_dotenv()

class Agente:

    def estruturar_agente(self):
        # 1. Configuração da API (chave de API)
        os.environ["GOOGLE_API_KEY"] = os.getenv("GOOGLE_API_KEY")

        # 2. Inicializando o LLM e o Modelo de Embeddings
        # Usamos o modelo dos servidores da Google para gerar os vetores
        modelo_embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")
        llm = ChatGoogleGenerativeAI(model="gemini-3.6-flash",
                                    temperature=0.2,
                                    max_retries=1)

        # 3. Carregamento e Preparação dos Documentos (ETL)
        print("Carregando o JSON e convertendo para LangChain Documents...")
        with open("limites_assintoticos_completo.json", "r", encoding="utf-8") as arquivo:
            dados = json.load(arquivo)

        documentos = []
        for bloco in dados["conteudo_completo"]:
            # Montando o conteúdo rico (Texto + Matemática)
            conteudo = bloco["teoria_texto"]
            if "equacoes_latex" in bloco:
                conteudo += "\nFórmulas LaTeX: " + ", ".join(bloco["equacoes_latex"])

                # Criando o objeto Document do LangChain com metadados
                doc = Document(
                page_content=conteudo,
                metadata={"secao": bloco["secao"], "pagina": str(bloco["pagina"])}
                )
                documentos.append(doc)

        # 4. Criação do Banco Vetorial e Retriever
        print("Vetorizando e armazenando no ChromaDB...")
        vectorstore = Chroma.from_documents(
            documents=documentos,
            embedding=modelo_embeddings,
            collection_name="agente_matematica_langchain"
        )

        # O retriever é a interface de busca. Configuramos para trazer os 2 trechos mais relevantes.
        retriever = vectorstore.as_retriever(search_kwargs={"k": 2})

        # 5. Construção do Prompt e das Chains (Corrente de Execução)
        # O prompt_sistema diz as diretrizes de resposta que o agente deve seguir
        # A variável {context} será preenchida automaticamente pelo retriever
        # A variável {input} é a pergunta do usuário
        prompt_sistema = (
            "Você é um agente tutor de matemática.\n"
            "O contexto extraído abaixo contém a fundamentação teórica, propriedades e teoremas da disciplina.\n"
            "Sua tarefa é usar EXCLUSIVAMENTE esses conceitos teóricos como base para raciocinar, "
            "mas você TEM PERMISSÃO para aplicar essas regras logicamente para resolver, explicar "
            "e calcular novas equações, limites ou exemplos propostos pelo usuário.\n"
            "Se o conceito matemático necessário para resolver a dúvida não estiver no contexto, diga que não possui a informação.\n\n"
            "Contexto Teórico:\n{context}"
        )

        prompt = ChatPromptTemplate.from_messages([
                ("system", prompt_sistema),
                    ("human", "{input}"),
                    ])

        # Combina os documentos recuperados e envia para o LLM
        qa_chain = create_stuff_documents_chain(llm, prompt)

        # Une o Retriever (busca) com a qa_chain (geração de resposta)
        rag_chain = create_retrieval_chain(retriever, qa_chain)

        print("Sistema RAG inicializado com sucesso!\n")
        print("=" * 50)

        return rag_chain


    # Conversão de Áudio em Texto
    def conversao_audio_texto(self, audio_bytes):
        # 1. Salva os bytes brutos vindos do navegador
        raw_audio_io = io.BytesIO(audio_bytes)

        # 2. Usa o pydub para ler o arquivo (ele identifica se é WebM, OGG ou WAV malformado)
        # from_file é mais genérico que from_wav e resolve problemas de cabeçalho
        audio = AudioSegment.from_file(raw_audio_io)

        # 3. Exporta como um WAV PCM real (RIFF)
        audio.export("audio_final.wav", format="wav")

        # 4. Transcrição
        reconhecedor = sr.Recognizer()
        with sr.AudioFile("audio_final.wav") as fonte:
            audio_data = reconhecedor.record(fonte)

        texto_usuario = reconhecedor.recognize_google(audio_data, language="pt-BR")

        return texto_usuario


    # Conversão Texto em Áudio
    def conversao_texto_audio(self, texto_resposta):
        # Adição de TTS
        # Limpeza do texto: remove asteriscos do markdown e delimitadores LaTeX
        print("🔊 Convertendo texto em áudio...")
        # Pega a resposta original
        texto_limpo = texto_resposta

        # 1. Remove formatação Markdown e TODOS os cifrões
        texto_limpo = texto_limpo.replace("*", "").replace("$", "")

        # 2. Traduz comandos LaTeX e notações comuns para leitura natural
        texto_limpo = texto_limpo.replace(r"\\rightarrow", " tende a ")
        texto_limpo = texto_limpo.replace(r"\\infty", " infinito ")
        texto_limpo = texto_limpo.replace(r"\\nexists", " não existe ")
        texto_limpo = texto_limpo.replace("lim_", "limite de ")
        texto_limpo = texto_limpo.replace("^{-}", " pela esquerda")
        texto_limpo = texto_limpo.replace("^{+ ", " pela direita")
        texto_limpo = texto_limpo.replace("f(x)", " f de x")

        # 3. NOVAS REGRAS: Potenciação, Raiz e Logaritmo
        # Exponenciação (^2 -> elevado a 2)
        texto_limpo = texto_limpo.replace("^", " elevado a ")

        # Radiciação (sqrt{x} -> raiz quadrada de x)
        texto_limpo = re.sub(r'\\sqrt\{(.*?)\}', r'raiz quadrada de \1', texto_limpo)
        texto_limpo = texto_limpo.replace("sqrt", "raiz quadrada de ")

        # Logaritmos (log_b(x) ou log(x))
        texto_limpo = texto_limpo.replace("log", "logaritmo ")
        texto_limpo = texto_limpo.replace("ln", "logaritmo natural ")

        # 4. CORREÇÃO REFINADA: Sinais em contexto matemático
        texto_limpo = texto_limpo.replace(" - ", " menos ")
        texto_limpo = re.sub(r'(\d|\b[xnyz]\b)-((\d|\b[xnyz]\b))', r'\1 menos \2', texto_limpo)
        texto_limpo = texto_limpo.replace(" + ", " mais ")
        texto_limpo = re.sub(r'(\d|\b[xnyz]\b)\+((\d|\b[xnyz]\b))', r'\1 mais \2', texto_limpo)

        # 5. Lê frações de forma natural (A sobre B)
        texto_limpo = re.sub(r'\\frac\{(.*?)\}\{(.*?)\}', r'\1 sobre \2', texto_limpo)

        # 6. Limpa chaves e barras invertidas que sobrarem
        texto_limpo = texto_limpo.replace("{", "").replace("}", "").replace("\\", "")

        # Gera o áudio com o texto traduzido
        tts = gTTS(text=texto_limpo, lang='pt', tld='com.br')
        arquivo_audio = f"resposta_agente_{int(time.time())}.mp3"
        tts.save(arquivo_audio)
        return arquivo_audio


    # Aplicar o Agente
    async def rodar_agente(self, rag_chain, audio_bytes):
        '''
        Responsável por executar o agente de forma assíncrona
        '''
        try:
            # 1. Transformo o áuido da pessoa em texto
            texto_usuario = self.conversao_audio_texto(audio_bytes)
            print(f"👤 Usuário (STT): {texto_usuario}")

            # 2. Gerar a resposta
            resposta = await rag_chain.ainvoke({"input": texto_usuario})
            texto_resposta = resposta["answer"]
            print(f"🤖 Agente (LLM): {texto_resposta}")

            # 3. Transformo a resposta do agente em áudio
            arquivo_audio_agente = self.conversao_texto_audio(texto_resposta)

            # 4. Acessando resposta
            return f"/respostas/{arquivo_audio_agente}"

        except Exception as e:
            return f'Erro ao processar o RAG: {e}.'

agente = Agente()
agente.estruturar_agente()