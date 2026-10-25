import os
import json
from langchain_core.documents import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma


class KnowledgeBaseManager:

    def __init__(self):
        self.JSON_DIRECTORY = "./output"
        self.PERSIST_DIRECTORY = "./chroma_db"
        self.COLLECTION_NAME = "agente_calculo_langchain"
        self.embedding_function = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001"
        )
        self.vectorstore = None

    def initialize_db(self) -> Chroma:
        """Carrega o banco do disco se já existir, ou vetoriza todos os JSONs da pasta."""
        if os.path.exists(self.PERSIST_DIRECTORY) and os.listdir(self.PERSIST_DIRECTORY):
            print("Carregando banco vetorial existente do disco...")
            self.vectorstore = Chroma(
                persist_directory=self.PERSIST_DIRECTORY,
                embedding_function=self.embedding_function,
                collection_name=self.COLLECTION_NAME
            )
        else:
            print("Lendo arquivos JSON e construindo banco vetorial...")
            documents = self.__load_all_json_documents()
            self.vectorstore = Chroma.from_documents(
                documents=documents,
                embedding=self.embedding_function,
                persist_directory=self.PERSIST_DIRECTORY,
                collection_name=self.COLLECTION_NAME
            )
        return self.vectorstore

    def get_retriever(self, topic: str = None, k: int = 4):
        """Retorna o retriever filtrando pelo metadado 'topic' (nome do arquivo JSON)."""
        if not self.vectorstore:
            self.initialize_db()

        search_kwargs = {"k": k}
        if topic:
            search_kwargs["filter"] = {"topic": topic}

        return self.vectorstore.as_retriever(search_kwargs=search_kwargs)

    def __document_convert(self, topic: str, file_path: str, data: dict) -> list[Document]:
        """Converte os blocos do JSON em objetos Document do LangChain."""
        docs_in_file = []
        
        # As chaves buscadas no dicionário ('conteudo_completo', 'secao', etc.) 
        # permanecem em português para bater com a estrutura dos seus arquivos JSON
        for block in data.get("conteudo_completo", []):
            section = block.get("secao", "Geral")
            theory_text = block.get("teoria_texto", "")
            latex_equations = block.get("equacoes_latex", [])
            page_number = str(block.get("pagina", "0"))
            
            # Mantém o cabeçalho em português para alinhar com os embeddings em PT-BR
            content = f"Tópico: {topic} | Seção: {section}\n{theory_text}"
            
            if latex_equations:
                content += "\nFórmulas LaTeX: " + ", ".join(latex_equations)

            doc_in_file = Document(
                page_content=content,
                metadata={
                    "topic": topic,      # Ex: 'assintotas', 'limites'
                    "source": file_path,
                    "section": section,
                    "page": page_number
                }
            )
            docs_in_file.append(doc_in_file)

        return docs_in_file

    def __load_all_json_documents(self) -> list[Document]:
        """Varre o diretório './output' e carrega todos os arquivos JSON."""
        documents = []
        
        if not os.path.exists(self.JSON_DIRECTORY):
            raise FileNotFoundError(f"O diretório {self.JSON_DIRECTORY} não existe.")

        json_files = [f for f in os.listdir(self.JSON_DIRECTORY) if f.endswith(".json")]

        if not json_files:
            raise ValueError(f"Nenhum arquivo .json encontrado em {self.JSON_DIRECTORY}.")

        for json_file in json_files:
            file_path = os.path.join(self.JSON_DIRECTORY, json_file)
            
            # Remove a extensão '.json' para usar o nome do arquivo como identificador do tópico
            topic = os.path.splitext(json_file)[0]

            with open(file_path, "r", encoding="utf-8") as fp:
                data = json.load(fp)

            docs_from_file = self.__document_convert(
                topic=topic, 
                file_path=file_path, 
                data=data
            )
            documents.extend(docs_from_file)

        return documents