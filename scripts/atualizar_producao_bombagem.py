#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
atualizar_producao_bombagem.py
Recolhe a "Produção por Bombagem" (geração de hidroelétricas reversíveis a turbinar)
do serviço 1363 da REN (Balanço Diário), que só está disponível à escala DIÁRIA.

Output: data/producao_bombagem_diaria.csv  (colunas: dia, producao_bombagem_gwh)

Esta série permite separar, nos agregados diários da página producao-omie.html,
a parcela NÃO renovável (turbinagem de bombagem) que vem "escondida" dentro da
coluna "Hídrica" do serviço 15-min (1354).

Uso:
  python atualizar_producao_bombagem.py                 # últimos 7 dias (incremental)
  python atualizar_producao_bombagem.py --dias 30       # últimos 30 dias
  python atualizar_producao_bombagem.py --from 2026-01-01 --to 2026-05-28   # intervalo (backfill)
"""

import argparse
import csv
import os
import sys
import time
from datetime import date, datetime, timedelta

import requests

URL_BASE = "https://datahub.ren.pt/service/download/csv/1363"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'data'))
OUT_PATH = os.path.join(DATA_DIR, 'producao_bombagem_diaria.csv')

HEADERS = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
}


def buscar_bombagem(dia_iso):
    """Devolve a Produção por Bombagem (GWh) para um dia (YYYY-MM-DD), ou None se indisponível."""
    params = {'startDateString': dia_iso, 'endDateString': dia_iso, 'culture': 'pt-PT'}
    try:
        resp = requests.get(URL_BASE, params=params, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        texto = resp.content.decode('utf-8-sig')
        for linha in texto.splitlines():
            # Formato: "Produção por Bombagem;;8;11;8;-30.4"
            # Colunas: [0]=nome [1]=Ponta MW [2]=Energia diária GWh [3]=dia eq. [4]=acumulada [5]=variação
            if linha.startswith('Produção por Bombagem'):
                partes = linha.split(';')
                if len(partes) > 2:
                    val = partes[2].strip().replace(',', '.')
                    if val in ('', '-'):
                        return 0.0
                    return float(val)
        return None
    except Exception as e:
        print(f"  [ERR] {dia_iso}: {e}", file=sys.stderr)
        return None


def carregar_existente():
    dados = {}
    if os.path.exists(OUT_PATH):
        with open(OUT_PATH, 'r', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                if row.get('dia'):
                    dados[row['dia']] = row.get('producao_bombagem_gwh', '')
    return dados


def gravar(dados):
    def chave(d):
        dd, mm, yy = d.split('/')
        return (yy, mm, dd)
    linhas = sorted(dados.items(), key=lambda kv: chave(kv[0]))
    with open(OUT_PATH, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow(['dia', 'producao_bombagem_gwh'])
        for dia, val in linhas:
            w.writerow([dia, val])


def main():
    ap = argparse.ArgumentParser(description='Recolhe Produção por Bombagem diária (REN serviço 1363).')
    ap.add_argument('--from', dest='dfrom', help='Data início YYYY-MM-DD (backfill)')
    ap.add_argument('--to', dest='dto', help='Data fim YYYY-MM-DD (backfill)')
    ap.add_argument('--dias', type=int, default=7, help='Nº de dias recentes a atualizar (default 7)')
    args = ap.parse_args()

    if args.dfrom and args.dto:
        d0 = datetime.strptime(args.dfrom, '%Y-%m-%d').date()
        d1 = datetime.strptime(args.dto, '%Y-%m-%d').date()
    else:
        d1 = date.today()
        d0 = d1 - timedelta(days=max(1, args.dias) - 1)

    print(f"A recolher Produção por Bombagem de {d0} a {d1}...")
    dados = carregar_existente()
    novos = 0
    d = d0
    while d <= d1:
        iso = d.strftime('%Y-%m-%d')
        dia_csv = d.strftime('%d/%m/%Y')
        val = buscar_bombagem(iso)
        if val is not None:
            dados[dia_csv] = f"{val:.2f}"
            novos += 1
            print(f"  [OK] {dia_csv}: {val:.2f} GWh")
        else:
            print(f"  [--] {dia_csv}: sem dados")
        d += timedelta(days=1)
        time.sleep(0.3)  # gentileza com o servidor da REN

    gravar(dados)
    print(f"\n[OK] {OUT_PATH} — {novos} dias atualizados, {len(dados)} no total.")


if __name__ == '__main__':
    main()
