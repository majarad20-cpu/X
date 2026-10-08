#!/usr/bin/env python3
"""Junta la app en un solo archivo HTML (para publicarla como página en Claude).

Lee el orden de los módulos de index.html, incrusta styles.css y los scripts de js/
y escribe dist/enfoque.html. Uso: python3 tools/build.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / 'index.html').read_text(encoding='utf-8')
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
scripts = re.findall(r'<script src="(js/[^"]+)"></script>', body)
code = '\n'.join((ROOT / s).read_text(encoding='utf-8') for s in scripts)
body = re.sub(r'\s*<script src="js/[^"]+"></script>', '', body)
body = body.rstrip() + f'\n\n  <script>\n{code}\n  </script>\n'
css = (ROOT / 'styles.css').read_text(encoding='utf-8')
out = ROOT / 'dist' / 'enfoque.html'
out.parent.mkdir(exist_ok=True)
out.write_text(f'<title>Enfoque</title>\n<style>\n{css}</style>\n{body}', encoding='utf-8')
print(f'{out.relative_to(ROOT)}: {len(scripts)} módulos, {out.stat().st_size // 1024} KB')
