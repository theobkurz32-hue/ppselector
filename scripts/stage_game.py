#!/usr/bin/env python3
"""Stage only the compiled game directory, preserving the existing root website."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
build = root / 'estrada-do-pampa' / 'dist'
destination = root / 'jogo'
if not (build / 'index.html').is_file():
    raise SystemExit('Execute npm run build dentro de estrada-do-pampa primeiro.')
if destination.exists():
    shutil.rmtree(destination)
shutil.copytree(build, destination)
(destination / '.nojekyll').touch()
print('Jogo compilado preparado em jogo/. Commit e push para publicar no Pages.')
