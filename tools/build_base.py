#!/usr/bin/env python3
"""Gera extension/data.js a partir da planilha de classificações da Plataforma Sucupira.

Uso:
    python3 tools/build_base.py data/qualis_2021_2024_area39.xlsx [data/bonus_scopus.csv]

Entrada 1: planilha exportada da Sucupira (colunas ISSN, Título, Estrato) para a
área Ciência Política e Relações Internacionais, Qualis 2021-2024.
Entrada 2 (opcional): CSV com uma coluna ISSN listando periódicos no primeiro
quintil (top 20%) da Scopus nas categorias indicadas na Ficha 2025-2028.

Regra de estimativa (Ficha de Avaliação 2025-2028, itens 2.3.1 e 2.4.2a):
o Qualis 2021-2024 da Área 39 foi construído com o h5 do Google Scholar, em
duas listas (ibero-americanas/lusófonas x demais) e oito estratos. A Ficha
2025-2028 usa a mesma lógica com nove estratos (A1-A8 e B). Por isso:
    A1->A1, A2->A2, A3->A3, A4->A4, B1->A5, B2->A6, B3->A7, B4->A8, C->B
O resultado é uma ESTIMATIVA, não a classificação oficial (feita em 2029).
"""
import csv
import json
import re
import sys
import unicodedata
from collections import Counter
from datetime import date
from pathlib import Path

import openpyxl

MAP = {"A1": "A1", "A2": "A2", "A3": "A3", "A4": "A4",
       "B1": "A5", "B2": "A6", "B3": "A7", "B4": "A8", "C": "B"}
POINTS = {"A1": 100, "A2": 85, "A3": 70, "A4": 55,
          "A5": 25, "A6": 20, "A7": 10, "A8": 5, "B": 0}


def norm_issn(v):
    s = re.sub(r"[^0-9X]", "", str(v or "").upper())
    return s if len(s) == 8 else ""


def norm_title(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    s = re.sub(r"\((impresso|online|print|on line|en linea|en línea)\)", " ", s)
    s = re.sub(r"\b(online|impresso|print)\b\s*$", " ", s)
    s = re.sub(r"[^0-9a-z]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def title_variants(s):
    """Variações do título para casar com o Lattes: completo, sem parênteses, antes de ' - '."""
    s = str(s or "")
    out = [norm_title(s), norm_title(re.sub(r"\([^)]*\)", " ", s))]
    if " - " in s:
        out.append(norm_title(re.sub(r"\([^)]*\)", " ", s.split(" - ")[0])))
    return [v for i, v in enumerate(out) if v and v not in out[:i]]


def read_rows(path):
    wb = openpyxl.load_workbook(path)
    ws = wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)
    header = [str(h or "").strip().lower() for h in next(rows)]
    i_issn = next(i for i, h in enumerate(header) if "issn" in h)
    i_tit = next(i for i, h in enumerate(header) if h.startswith("t"))
    i_est = next(i for i, h in enumerate(header) if "estrato" in h)
    for r in rows:
        yield r[i_issn], r[i_tit], r[i_est]


def main():
    src = Path(sys.argv[1])
    bonus = set()
    if len(sys.argv) > 2 and Path(sys.argv[2]).exists():
        with open(sys.argv[2], newline="", encoding="utf-8") as f:
            for row in csv.reader(f):
                for cell in row:
                    x = norm_issn(cell)
                    if x:
                        bonus.add(x)

    by_issn, titles = {}, {}
    skipped = 0
    for issn, title, est in read_rows(src):
        x, est = norm_issn(issn), str(est or "").strip().upper()
        if not x or est not in MAP:
            skipped += 1
            continue
        by_issn[x] = {"t": str(title).strip(), "q": est, "e": MAP[est]}
        if x in bonus:
            by_issn[x]["s"] = 1
        for v in title_variants(title):
            titles.setdefault(v, set()).add(x)

    # Índice por título só para títulos sem ambiguidade de estrato.
    title_index, ambiguous = {}, 0
    for k, issns in titles.items():
        if len(k) < 4:
            continue
        estratos = {by_issn[i]["e"] for i in issns}
        if len(estratos) == 1:
            title_index[k] = sorted(issns)[0]
        else:
            ambiguous += 1

    out = {
        "area": "39",
        "areaNome": "Ciência Política e Relações Internacionais",
        "fonte": "Plataforma Sucupira — Qualis Periódicos 2021–2024, Área 39 (" + src.name + ")",
        "geradoEm": date.today().isoformat(),
        "mapa": MAP,
        "pontos": POINTS,
        "issn": by_issn,
        "titulo": title_index,
    }
    dest = Path(__file__).resolve().parent.parent / "extension" / "data.js"
    dest.write_text("globalThis.CPRI39_DATA=" + json.dumps(out, ensure_ascii=False,
                                                           separators=(",", ":")) + ";\n",
                    encoding="utf-8")
    dist = Counter(v["e"] for v in by_issn.values())
    print(f"ISSNs: {len(by_issn)} | títulos indexados: {len(title_index)} | "
          f"títulos ambíguos: {ambiguous} | linhas ignoradas: {skipped} | bônus Scopus: {len(bonus)}")
    print("Distribuição estimada:", dict(sorted(dist.items())))
    print("Gravado em", dest, f"({dest.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
