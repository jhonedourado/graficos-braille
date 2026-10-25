from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain

# Carrega as variáveis do arquivo .env
load_dotenv()


class Agent:

    # Injeção de Dependência: recebe o gerenciador do banco já inicializado
    def __init__(self, kb_manager):
        self.kb_manager = kb_manager
        
        # Inicializa o modelo LLM (nota: os logs mostravam que temperature é ignorado no 3.6-flash)
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-3.6-flash",
            max_retries=1
        )
        
        # Cria o template de prompt e a chain de documentos uma única vez na memória
        self.prompt = self.__setup_template()
        self.qa_chain = create_stuff_documents_chain(self.llm, self.prompt)

    def __setup_template(self) -> ChatPromptTemplate:
        # Construção do Prompt de Sistema
        # A variável {context} é preenchida automaticamente pelo retriever
        # A variável {input} recebe a dúvida transcrita do estudante
        system_prompt = (
            "Você é um agente tutor de matemática acessível para estudantes com deficiência visual.\n"
            "O contexto extraído abaixo contém a fundamentação teórica, propriedades e teoremas da disciplina.\n"
            "Sua tarefa é usar EXCLUSIVAMENTE esses conceitos teóricos como base para raciocinar, "
            "mas você TEM PERMISSÃO para aplicar essas regras logicamente para resolver, explicar "
            "e calcular novas equações, limites ou exemplos propostos pelo usuário.\n"
            "DIRETRIZ DE ÁUDIO: Como sua resposta será lida em voz alta, evite usar símbolos LaTeX complexos "
            "e prefira escrever as expressões matemáticas por extenso sempre que possível.\n"
            "Se o conceito matemático necessário para resolver a dúvida não estiver no contexto, "
            "diga educadamente que não possui essa informação no material atual.\n\n"
            "Contexto Teórico:\n{context}"
        )

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "{input}")
        ])

        return prompt

    async def generate_answer(self, user_question: str, topic: str = None) -> str:
        """
        Monta a chain de recuperação filtrada pelo tópico do QR Code
        e gera a resposta de forma assíncrona.
        """
        # 1. Solicita ao gerenciador o retriever filtrado pelo tópico (ex: 'assintotas')
        retriever = self.kb_manager.get_retriever(topic=topic, k=4)

        # 2. Conecta o retriever específico desta pergunta com a qa_chain do agente
        rag_chain = create_retrieval_chain(retriever, self.qa_chain)

        # 3. Executa a chamada assíncrona para o Gemini
        response = await rag_chain.ainvoke({"input": user_question})
        
        return response["answer"]