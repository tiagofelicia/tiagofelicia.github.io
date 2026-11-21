"""
Gera o ficheiro bacias_portugal.js — as bacias hidrográficas do mapa de albufeiras.html, pintadas pela percentagem
das albufeiras de cada uma.

Fonte: Agência Portuguesa do Ambiente (APA), «Principais Bacias Hidrográficas (DQA)», escala 1:25 000, as bacias
reportadas à Comissão Europeia no âmbito da Diretiva-Quadro da Água (ficha de metadados no geoportal do SNIAmb:
restrições de uso e de acesso «Sem restrições»). São 66 bacias e sub-bacias de Portugal continental (só a parte
portuguesa das bacias internacionais), lidas no serviço de mapas da APA:
    https://inspire.apambiente.pt/getogc/rest/services/INSPIRE/HY_PhysicalWaters_BaciasDQA/MapServer/0

Cada sub-bacia tem um código de Pfafstetter (o Douro é 12 e o Tâmega 1212, por exemplo), que diz a que bacia
pertence. Juntam-se nas bacias do boletim semanal de albufeiras da APA, as da coluna «bacia» de
data/producao/albufeiras_snirh.csv (REGRAS): o Tejo junta o Zêzere, o Sorraia, o Ocreza e as outras; as Ribeiras do
Algarve, o Barlavento e o Sotavento; as Ribeiras do Alentejo, as costeiras entre o Tejo e o Sado e entre o Sado e o
Mira. As que não têm nenhuma albufeira da página (o Minho, o Lis, o Leça e as costeiras do Norte e do Centro) ficam
com o seu nome e sem cor no mapa.

A simplificação é a de uma cobertura (shapely.coverage_simplify, shapely 2.1 ou mais recente): cada fronteira entre
duas sub-bacias é simplificada uma só vez, por isso as bacias vizinhas ficam com a mesma linha, sem frestas nem
sobreposições.

Uso (precisa do shapely 2.1 ou mais recente, só para gerar; o site não o usa):
    python scripts/gerar_bacias_portugal.py
    python scripts/gerar_bacias_portugal.py --tol 0.004       # simplificação mais fina (ficheiro maior)
    python scripts/gerar_bacias_portugal.py --sem-cache       # volta a pedir as bacias à APA
"""
import argparse
import csv
import io
import json
import os
import re
import sys
import tempfile
import urllib.parse
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import shapely
from shapely.geometry import Point, mapping, shape
from shapely.ops import unary_union

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "bacias_portugal.js")
CACHE = os.path.join(tempfile.gettempdir(), "bacias_dqa_apa.geojson")   # fora da pasta do site
SERVICO = ("https://inspire.apambiente.pt/getogc/rest/services/INSPIRE/HY_PhysicalWaters_BaciasDQA/MapServer/0/query?"
           + urllib.parse.urlencode({"where": "1=1", "outFields": "name,basinorder_order", "returnGeometry": "true",
                                     "outSR": "4326", "f": "geojson"}))
LISTA = "https://dados.tiagofelicia.pt/data/producao/albufeiras_snirh.csv"
UA = {"User-Agent": "gerar_bacias_portugal (tiagofelicia.pt)"}

# Código de Pfafstetter (início) → bacia do boletim semanal; o código mais comprido ganha
REGRAS = {
    "1192": "Lima", "1196": "Cávado", "1198": "Ave", "12": "Douro", "132": "Vouga", "134": "Mondego",
    "1372": "Ribeiras do Oeste", "139": "Ribeiras do Oeste", "14": "Tejo",
    "151": "Ribeiras do Alentejo", "153": "Ribeiras do Alentejo", "152": "Sado", "154": "Mira",
    "155": "Ribeiras do Algarve", "159": "Ribeiras do Algarve", "156": "Arade", "16": "Guadiana",
}
# As outras, com o nome escrito como deve ser (a APA tira os acentos)
NOMES_OUTRAS = {
    "118": "Minho", "1191": "Costeiras entre o Minho e o Lima", "1194": "Neiva e costeiras entre o Lima e o Neiva",
    "1195": "Costeiras entre o Neiva e o Cávado", "1197": "Costeiras entre o Cávado e o Ave",
    "11994": "Costeiras entre o Ave e o Leça", "11998": "Leça", "11999": "Costeiras entre o Leça e o Douro",
    "131": "Costeiras entre o Douro e o Vouga", "133": "Costeiras entre o Vouga e o Mondego",
    "135": "Costeiras entre o Mondego e o Lis", "136": "Lis",
}


def bacia_de(codigo):
    for p in sorted(REGRAS, key=len, reverse=True):
        if codigo.startswith(p):
            return REGRAS[p]
    return None


def ler_bacias(sem_cache):
    if not sem_cache and os.path.exists(CACHE):
        return json.load(open(CACHE, encoding="utf-8"))
    print("  a pedir as bacias à APA…")
    with urllib.request.urlopen(urllib.request.Request(SERVICO, headers=UA), timeout=300) as r:
        g = json.load(r)
    json.dump(g, open(CACHE, "w", encoding="utf-8"))
    return g


def arredondar(geom, casas=4):
    def r(c):
        if isinstance(c, (int, float)):
            return round(c, casas)
        return [r(x) for x in c]
    g = mapping(geom)
    return {"type": g["type"], "coordinates": r(g["coordinates"])}


def conferir(regioes):
    """Cada albufeira da lista tem de cair na sua bacia (aviso se não)."""
    try:
        with urllib.request.urlopen(urllib.request.Request(LISTA, headers=UA), timeout=60) as r:
            linhas = list(csv.DictReader(io.StringIO(r.read().decode("utf-8-sig"))))
    except Exception as e:  # noqa: BLE001
        print(f"  aviso: sem a lista das albufeiras ({e}): não confiro as bacias")
        return
    mal = 0
    for l in linhas:
        if not l.get("latitude") or not l.get("longitude"):
            continue
        pt = Point(float(l["longitude"]), float(l["latitude"]))
        b = l["bacia"]
        if b not in regioes or not regioes[b].buffer(0.003).contains(pt):
            mal += 1
            print(f"  aviso: {l['nome']} ({b}) não cai na sua bacia")
    print(f"  {len(linhas) - mal} de {len(linhas)} albufeiras na sua bacia")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tol", type=float, default=0.006, help="tolerância da simplificação, em graus (0,006 ≈ 600 m)")
    ap.add_argument("--sem-cache", action="store_true")
    args = ap.parse_args()
    g = ler_bacias(args.sem_cache)
    nomes = [bacia_de(f["properties"]["basinorder_order"]) or NOMES_OUTRAS.get(f["properties"]["basinorder_order"])
             or f["properties"]["name"] for f in g["features"]]
    geoms = [shape(f["geometry"]).buffer(0) for f in g["features"]]
    juntar = lambda gs: {k: unary_union([x for x, n in zip(gs, nomes) if n == k]).buffer(0) for k in dict.fromkeys(nomes)}  # noqa: E731
    simples = juntar(list(shapely.coverage_simplify(geoms, args.tol)))
    print(f"  {len(geoms)} sub-bacias da APA → {len(simples)} regiões "
          f"({sum(1 for k in simples if k in REGRAS.values())} bacias com albufeiras)")
    conferir(simples)      # com 300 m de folga, por causa da simplificação
    feats = [{"type": "Feature", "properties": {"b": k, "alb": k in REGRAS.values()}, "geometry": arredondar(p)}
             for k, p in sorted(simples.items())]
    corpo = json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":"))
    cab = ("/* As bacias hidrográficas do mapa de albufeiras.html (gerado por scripts/gerar_bacias_portugal.py).\n"
           "   Fonte: Agência Portuguesa do Ambiente, «Principais Bacias Hidrográficas (DQA)», 1:25 000 — as sub-bacias\n"
           "   juntas nas bacias do boletim semanal de albufeiras da APA pelo código de Pfafstetter; simplificado. */\n")
    texto = cab + "var PORTUGAL_BACIAS_GEOJSON = " + corpo + ";\n"
    antigo = open(SAIDA, encoding="utf-8").read() if os.path.exists(SAIDA) else None
    if texto != antigo:
        with open(SAIDA, "w", encoding="utf-8", newline="\n") as f:
            f.write(texto)
        print(f"✓ {os.path.relpath(SAIDA, RAIZ)}: {len(feats)} regiões, {len(texto.encode('utf-8')) // 1024} KB")
    else:
        print("= sem alterações")


if __name__ == "__main__":
    main()
