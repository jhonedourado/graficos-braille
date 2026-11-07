import asyncio
import os
import json
import edge_tts

async def generate_initial_audios():
    # Pasta onde o front-end vai procurar os arquivos de áudio
    destination_folder = "audio"
    os.makedirs(destination_folder, exist_ok=True)
    
    # A mesma voz padrão que você usa no seu AudioService
    voice = "pt-BR-AntonioNeural"

    # 1. Lê o arquivo JSON com os textos que está na pasta output
    json_path = os.path.join("output", "textos_iniciais.json")
    try:
        with open(json_path, 'r', encoding='utf-8') as file:
            texts = json.load(file)
    except FileNotFoundError:
        print(f"Erro: O arquivo '{json_path}' não foi encontrado.")
        return

    print("Verificando e gerando áudios descritivos...")

    # 2. Itera através do dicionário do JSON
    for topic_id, text in texts.items():
        # Define o caminho final do arquivo usando o ID exato (ex: audio/assintotas.mpeg)
        file_path = os.path.join(destination_folder, f"{topic_id}.mpeg")
        
        # Pula se o arquivo já existir
        if os.path.exists(file_path):
            print(f"▶ Áudio '{topic_id}.mpeg' já existe. Pulando...")
            continue
        
        print(f"Gerando novo áudio para '{topic_id}'...")
        
        # Gera o áudio utilizando o edge-tts com a mesma qualidade e voz do backend
        communicate = edge_tts.Communicate(text=text, voice=voice)
        await communicate.save(file_path)
        
        print(f"Feito! Salvo em: {file_path}\n")

if __name__ == "__main__":
    asyncio.run(generate_initial_audios())