"""Subconjunto de Material Symbols Rounded (plan visual F1-3).

La fuente completa (4262 iconos, 536 kB) se precargaba en cada página. Este script deja solo los iconos que la
app necesita (scripts/ui/icon-names.mjs) y comprueba que cada uno conserva su ligadura.

Uso, desde frontend/ (requiere fontTools y brotli; en esta máquina: C:\\Python313\\python.exe):
    node scripts/ui/icon-names.mjs > <tmp>/iconos.json
    python -I scripts/ui/subset-icons.py scripts/ui/fonts/material-symbols-rounded-full.woff2 <tmp>/iconos.json src/assets/fonts/material-symbols-rounded.woff2 scripts/ui/material-symbols-rounded.icons.json

Escribe además la lista de iconos incluidos (4.º argumento; vive en scripts/ui y no se publica), que leen
scripts/ui/icons.test.mjs y el e2e @icons. Sale con 1 si un nombre pedido no es una ligadura de la fuente o se pierde.
"""
import json
import string
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


def ligatures(font):
    """Nombre del icono (texto que forma la ligadura) → glifo, leído de las sustituciones de ligadura de GSUB."""
    by_glyph = {glyph: chr(code) for code, glyph in font.getBestCmap().items()}
    found = {}
    for lookup in font['GSUB'].table.LookupList.Lookup:
        for table in lookup.SubTable:
            if getattr(table, 'LookupType', None) == 7:
                table = table.ExtSubTable
            if getattr(table, 'LookupType', None) != 4:
                continue
            for first, items in table.ligatures.items():
                for item in items:
                    parts = [first, *item.Component]
                    if all(part in by_glyph for part in parts):
                        found[''.join(by_glyph[part] for part in parts)] = item.LigGlyph
    return found


def main(source, names_json, output, list_path):
    names = sorted(set(json.loads(Path(names_json).read_text(encoding='utf-8'))))
    font = TTFont(source)
    available = ligatures(font)
    unknown = [name for name in names if name not in available]
    if unknown:
        print('No son iconos de Material Symbols:', ', '.join(unknown))
        return 1

    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['liga', 'rlig']
    options.layout_closure = False
    options.notdef_outline = True
    options.name_IDs = ['*']
    subsetter = subset.Subsetter(options)
    letters = string.ascii_lowercase + string.digits + '_'
    subsetter.populate(glyphs=[available[name] for name in names], unicodes=[ord(char) for char in letters])
    subsetter.subset(font)
    font.flavor = 'woff2'
    font.save(output)

    kept = ligatures(TTFont(output))
    lost = [name for name in names if name not in kept]
    if lost:
        print('Ligaduras perdidas en el subconjunto:', ', '.join(lost))
        return 1
    out = Path(output)
    Path(list_path).write_text(json.dumps(names, indent=1) + '\n', encoding='utf-8', newline='\n')
    print(f'{len(names)} iconos · {out.stat().st_size} B · {out}')
    return 0


if __name__ == '__main__':
    sys.exit(main(*sys.argv[1:5]))
