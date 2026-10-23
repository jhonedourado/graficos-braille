#!/usr/bin/env bash
set -o errexit

echo "A descarregar o motor ffmpeg..."
wget https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz -O ffmpeg.tar.xz
tar -xf ffmpeg.tar.xz

echo "A organizar os ficheiros..."
mkdir -p bin
cp ffmpeg-master-latest-linux64-gpl/bin/ffmpeg bin/
cp ffmpeg-master-latest-linux64-gpl/bin/ffprobe bin/

echo "A limpar os ficheiros temporários..."
rm -rf ffmpeg.tar.xz ffmpeg-master-latest-linux64-gpl

echo "A instalar dependências Python..."
pip install --upgrade pip
pip install -r requirements.txt