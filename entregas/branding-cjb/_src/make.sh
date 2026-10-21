#!/usr/bin/env bash
# Uso: PPTX_SKILL=<pasta da skill pptx> NODE_PATH=<node_modules com pptxgenjs, react, react-dom, react-icons, sharp> ./make.sh
set -e
cd "$(dirname "$0")"
node build.js
python3 animar.py tmp_semanim.pptx ../Diagnostico-Branding-CJB.pptx
rm -f tmp_semanim.pptx
