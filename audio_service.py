import os
import io
import re
import time
import uuid
import speech_recognition as sr
from gtts import gTTS
from pydub import AudioSegment


class AudioService:

    def __init__(self, output_dir: str = "./respostas"):
        self.output_dir = output_dir
        self.recognizer = sr.Recognizer()
        # Garante que a pasta ./respostas exista no Render
        os.makedirs(self.output_dir, exist_ok=True)

    def speech_to_text(self, audio_bytes: bytes) -> str:
        """
        Converte os bytes de áudio recebidos via WebSocket para WAV em memória
        e realiza a transcrição (STT).
        """
        raw_audio_io = io.BytesIO(audio_bytes)
        audio = AudioSegment.from_file(raw_audio_io)

        # Exporta para WAV em memória (evita criar arquivos temporários no disco)
        wav_io = io.BytesIO()
        audio.export(wav_io, format="wav")
        wav_io.seek(0)

        with sr.AudioFile(wav_io) as source:
            audio_data = self.recognizer.record(source)

        user_text = self.recognizer.recognize_google(audio_data, language="pt-BR")
        return user_text

    def __clean_math_text_for_tts(self, response_text: str) -> str:
        """
        Método privado que limpa remanescentes de Markdown e LaTeX
        para garantir leitura fluida por qualquer motor de TTS (gTTS ou ElevenLabs).
        """
        cleaned_text = response_text

        # 1. Remove formatação Markdown e cifrões
        cleaned_text = cleaned_text.replace("*", "").replace("$", "")

        # 2. Frações e Raízes (devem vir ANTES de remover chaves e comandos simples)
        cleaned_text = re.sub(r'\\frac\{(.*?)\}\{(.*?)\}', r'\1 sobre \2', cleaned_text)
        cleaned_text = re.sub(r'\\sqrt\{(.*?)\}', r'raiz quadrada de \1', cleaned_text)
        cleaned_text = re.sub(r'\bsqrt\b', 'raiz quadrada de ', cleaned_text)

        # 3. Comandos LaTeX e limites laterais (barra simples na raw string)
        cleaned_text = cleaned_text.replace(r"\rightarrow", " tende a ")
        cleaned_text = cleaned_text.replace(r"\to", " tende a ")
        cleaned_text = cleaned_text.replace(r"\infty", " infinito ")
        cleaned_text = cleaned_text.replace(r"\nexists", " não existe ")
        cleaned_text = cleaned_text.replace(r"\lim_", "limite de ")
        cleaned_text = cleaned_text.replace("lim_", "limite de ")
        cleaned_text = cleaned_text.replace("^{-}", " pela esquerda ")
        cleaned_text = cleaned_text.replace("^{+}", " pela direita ")
        cleaned_text = cleaned_text.replace("f(x)", " f de x ")

        # 4. Potenciação e Subscrito
        cleaned_text = cleaned_text.replace("^", " elevado a ")
        cleaned_text = cleaned_text.replace("_", " índice ")

        # 5. Logaritmos com Word Boundary (\b) para não quebrar palavras como "logo"
        cleaned_text = re.sub(r'\\?\blog\b', 'logaritmo ', cleaned_text)
        cleaned_text = re.sub(r'\\?\bln\b', 'logaritmo natural ', cleaned_text)

        # 6. Sinais matemáticos em contexto de equações
        cleaned_text = cleaned_text.replace(" - ", " menos ")
        cleaned_text = re.sub(r'(\d|\b[xnyz]\b)-((\d|\b[xnyz]\b))', r'\1 menos \2', cleaned_text)
        cleaned_text = cleaned_text.replace(" + ", " mais ")
        cleaned_text = re.sub(r'(\d|\b[xnyz]\b)\+((\d|\b[xnyz]\b))', r'\1 mais \2', cleaned_text)

        # 7. Limpa chaves, barras invertidas restantes e espaços múltiplos
        cleaned_text = cleaned_text.replace("{", "").replace("}", "").replace("\\", "")
        cleaned_text = re.sub(r'\s+', ' ', cleaned_text).strip()

        return cleaned_text

    def text_to_speech(self, response_text: str) -> str:
        """
        Limpa o texto, gera o arquivo MP3 na pasta de saída e retorna a rota relativa.
        """
        print("🔊 Convertendo texto em áudio...")
        cleaned_text = self.__clean_math_text_for_tts(response_text)

        # Usa timestamp + sufixo único curto para evitar colisão de nomes
        filename = f"resposta_agente_{int(time.time())}_{uuid.uuid4().hex[:4]}.mp3"
        file_path = os.path.join(self.output_dir, filename)

        # Motor de geração (no futuro, basta trocar estas 2 linhas pelo SDK do ElevenLabs, por exemplo)
        tts = gTTS(text=cleaned_text, lang="pt", tld="com.br")
        tts.save(file_path)

        # Retorna a rota exata que o front-end espera concatenar com urlAudioBase
        return f"/respostas/{filename}"