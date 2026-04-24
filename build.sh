#!/bin/bash
set -e  # Salir si cualquier comando falla

echo "=== Instalando Python3 y edge-tts para TTS REAL en Render ==="

# Instalar Python3 y pip (Render usa Ubuntu/Debian)
apt-get update -qq
apt-get install -y python3 python3-pip python3-venv > /dev/null 2>&1 || echo "⚠️  Python ya instalado o error menor"

# Verificar si Python3 está disponible
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 no se pudo instalar"
    exit 1
fi

echo "✅ Python3 encontrado: $(python3 --version)"

# Instalar edge-tts globalmente
python3 -m pip install --upgrade pip > /dev/null 2>&1
python3 -m pip install edge-tts > /dev/null 2>&1

# Verificar edge-tts
if ! command -v edge-tts &> /dev/null && ! python3 -m edge_tts --help &> /dev/null; then
    echo "❌ edge-tts no se pudo instalar"
    exit 1
fi

echo "✅ edge-tts instalado correctamente"

# Ejecutar npm install normal
npm install

echo "=== Build completado ==="
