#!/bin/bash
set -e  # Salir si cualquier comando falla

echo "=== Build para Node.js puro (msedge-tts) ==="

# Instalar dependencias de Node.js (msedge-tts ya está en package.json)
npm install

echo "=== Build completado ==="
echo "ℹ️  TTS: usando msedge-tts (npm) - sin dependencias de Python"
