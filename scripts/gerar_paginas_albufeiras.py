#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gerar_paginas_albufeiras.py — uma página por albufeira (/albufeira/<nome>, por exemplo /albufeira/alqueva).

Lê os CSV das albufeiras do dados-energia e escreve, para cada albufeira, uma página estática com o texto e os
números do último dia já no HTML (o que o Google lê sem correr JavaScript) e a série inteira num
<script type="application/json">, de onde o albufeira/albufeira.js desenha o gráfico. A cabeça (CSP, Google
Analytics, Highcharts com SRI) é copiada da albufeiras.html, para as páginas ficarem sempre iguais à página geral.
Na albufeiras.html, refaz também a lista das páginas, entre os comentários PAGINAS-ALBUFEIRAS.

Correr a partir da raiz do site, todos os dias depois de chegarem os dados do SNIRH (os textos levam a data do
último valor). As páginas de albufeiras que saiam da lista são apagadas.

USO
---
  python scripts/gerar_paginas_albufeiras.py                      # as 57, com os dados de dados.tiagofelicia.pt
  python scripts/gerar_paginas_albufeiras.py --dados <pasta>      # com CSV locais
  python scripts/gerar_paginas_albufeiras.py --so alqueva,caia --sem-ga --sem-indice --saida <pasta> --base /x/
                                                                  # cópias de teste

  --dados       pasta ou endereço com albufeiras_snirh.csv, albufeiras_snirh_diario.csv e centrais_hidricas.csv
  --modelo      a página geral (a cabeça e a lista das páginas); por omissão albufeiras.html
  --saida       a raiz onde fica a pasta das páginas; por omissão a do site
  --base        o caminho das páginas no site; por omissão /albufeira/
  --so          só estas albufeiras (colunas do CSV, separadas por vírgulas): não apaga nem mexe na lista
  --sem-ga      sem o Google Analytics (cópias de teste)
  --sem-indice  não mexe na lista das páginas da albufeiras.html

Os artigos dos nomes («o Alqueva», «a Aguieira», «Montargil») estão em scripts/albufeiras_artigos.csv; uma
albufeira nova sem linha lá fica sem artigo («albufeira de …») e o script avisa.
"""
import argparse
import csv
import html
import json
import math
import os
import hashlib
import io
import re
import sys
import urllib.request
from datetime import date, timedelta

sys.stdout.reconfigure(encoding='utf-8')

SITE = 'https://www.tiagofelicia.pt'
ANO_COMP = 2011      # como a página geral: os anos completos desde 2011 (o Alqueva encheu pela primeira vez em 2010)
ARRASTO = 31         # um valor conta até 31 dias para a frente (até 2017 há albufeiras com um valor por mês)
TOL = 7              # no resumo, um valor com até 7 dias
MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro',
         'novembro', 'dezembro']
AQUI = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(AQUI)
DADOS = 'https://dados.tiagofelicia.pt/data/producao/'
ARTIGOS_CSV = os.path.join(AQUI, 'albufeiras_artigos.csv')
ORDEM_BACIAS = ['Lima', 'Cávado', 'Ave', 'Douro', 'Vouga', 'Mondego', 'Tejo', 'Sado', 'Guadiana', 'Arade', 'Ribeiras do Algarve']
INICIO_IDX = '<!-- PAGINAS-ALBUFEIRAS: gerado por scripts/gerar_paginas_albufeiras.py, não editar à mão -->'
FIM_IDX = '<!-- /PAGINAS-ALBUFEIRAS -->'
# O endereço de cada página: a coluna do CSV com hífenes (castelo_de_bode → castelo-de-bode)
slug = lambda col: col.replace('_', '-')


# ---------------------------------------------------------------- formatação (como o Intl.NumberFormat('pt-PT'))
def num(v, casas=0):
    s = f'{abs(v):.{casas}f}'
    inteiro, _, dec = s.partition('.')
    if len(inteiro) >= 5:                       # o pt-PT só agrupa a partir de 10 000
        g = []
        while inteiro:
            g.insert(0, inteiro[-3:])
            inteiro = inteiro[:-3]
        inteiro = ' '.join(g)
    neg = v < 0 and float(s) != 0
    return ('−' if neg else '') + inteiro + (',' + dec if dec else '')


fmt1 = lambda v: num(v, 1)
fmt_pct = lambda v: fmt1(v) + '%'
fmt_hm3 = lambda v: (num(v) if abs(v) >= 100 else fmt1(v)) + ' hm³'
fmt_data = lambda d: d.strftime('%d/%m/%Y')
fmt_dia_mes = lambda d: f'{d.day} de {MESES[d.month - 1]}'


def fmt_pp(v):
    sinal = '+' if v > 0.05 else '−' if v < -0.05 else ''
    return sinal + fmt1(abs(v)) + ' p.p.'


def comp(d, txt):
    if abs(d) < 0.05:
        return f'igual {txt}'
    return f'{fmt1(abs(d))} p.p. {"acima" if d > 0 else "abaixo"} {txt}'


esc = lambda s: html.escape(str(s), quote=True)
# «do Lima», «das Ribeiras do Algarve» (como o nomeBacia da albufeiras.html)
da_bacia = lambda b: ('das ' if b.startswith('Ribeiras') else 'do ') + b


# ---------------------------------------------------------------- dados
def texto(pasta, nome):
    if pasta.startswith(('http://', 'https://')):
        pedido = urllib.request.Request(pasta.rstrip('/') + '/' + nome, headers={'User-Agent': 'gerar_paginas_albufeiras (tiagofelicia.pt)'})
        with urllib.request.urlopen(pedido, timeout=120) as r:
            return r.read().decode('utf-8-sig')
    with open(os.path.join(pasta, nome), encoding='utf-8-sig', newline='') as f:
        return f.read()


def carregar(pasta):
    lista = list(csv.DictReader(io.StringIO(texto(pasta, 'albufeiras_snirh.csv'))))
    diario = list(csv.reader(io.StringIO(texto(pasta, 'albufeiras_snirh_diario.csv'))))
    cab, linhas = diario[0], diario[1:]
    d0 = date.fromisoformat(linhas[0][0])
    n = (date.fromisoformat(linhas[-1][0]) - d0).days + 1
    alb = []
    for r in lista:
        ref = float(r['referencia_hm3'] or 0)
        if not r['coluna'] or ref <= 0 or r['coluna'] not in cab:
            continue
        j = cab.index(r['coluna'])
        bruto = [math.nan] * n
        for l in linhas:
            if j < len(l) and l[j] != '':
                bruto[(date.fromisoformat(l[0]) - d0).days] = float(l[j])
        cheio, ult, v = [math.nan] * n, -10 ** 9, math.nan
        for i in range(n):
            if not math.isnan(bruto[i]):
                ult, v = i, bruto[i]
            if i - ult <= ARRASTO:
                cheio[i] = v
        alb.append(dict(r, ref=ref, bruto=bruto, cheio=cheio,
                        cap=float(r['capacidade_hm3']) if r['capacidade_hm3'] else None,
                        lat=float(r['latitude']) if r['latitude'] else None,
                        lon=float(r['longitude']) if r['longitude'] else None))
    centrais = {}
    for r in csv.DictReader(io.StringIO(texto(pasta, 'centrais_hidricas.csv'))):
        if r['albufeira']:
            centrais.setdefault(r['albufeira'], []).append(r)
    return alb, centrais, d0, n


# ---------------------------------------------------------------- contas (as mesmas da albufeiras.html)
class Contas:
    def __init__(self, d0, n):
        self.d0, self.n = d0, n

    def idx(self, d):
        return (d - self.d0).days

    def dia(self, i):
        return self.d0 + timedelta(days=i)

    def valor(self, a, i, t=TOL):
        """O valor do dia i ou o último dos t dias anteriores."""
        for j in range(min(i, self.n - 1), max(0, i - t) - 1, -1):
            if not math.isnan(a['bruto'][j]):
                return a['bruto'][j], j
        return None

    def menos_um_ano(self, i):
        d = self.dia(i)
        return self.idx(date(d.year - 1, d.month, 28 if (d.month, d.day) == (2, 29) else d.day))

    def historico(self, a, i):
        """O mesmo dia do calendário nos anos completos desde 2011, antes do ano do dia i."""
        d = self.dia(i)
        anos = []
        for y in range(ANO_COMP, d.year):
            j = self.idx(date(y, d.month, 28 if (d.month, d.day) == (2, 29) else d.day))
            if 0 <= j < self.n and not math.isnan(a['cheio'][j]):
                anos.append((y, a['cheio'][j] / a['ref'] * 100))
        if len(anos) < 3:
            return None
        media = sum(p for _, p in anos) / len(anos)
        return dict(media=media, anos=anos, min=min(anos, key=lambda x: x[1]), max=max(anos, key=lambda x: x[1]),
                    de=anos[0][0], ate=anos[-1][0])

    def por_ano(self, a):
        out = []
        primeiro = next((i for i, v in enumerate(a['bruto']) if not math.isnan(v)), None)
        if primeiro is None:
            return out
        for y in range(self.dia(primeiro).year, self.dia(self.n - 1).year + 1):
            vals = [(a['bruto'][i], i) for i in range(max(0, self.idx(date(y, 1, 1))), min(self.n, self.idx(date(y, 12, 31)) + 1))
                    if not math.isnan(a['bruto'][i])]
            if not vals:
                continue
            mx, mn = max(vals), min(vals)
            out.append(dict(ano=y, n=len(vals), max=mx[0], dmax=self.dia(mx[1]), min=mn[0], dmin=self.dia(mn[1]),
                            fim=vals[-1][0], dfim=self.dia(vals[-1][1]), inicio=vals[0][0]))
        return out


# ---------------------------------------------------------------- página
CSS_PAGINA = 'albufeira.css'
JS_PAGINA = 'albufeira.js'


def cabeca_do_modelo(modelo, sem_ga):
    s = open(modelo, encoding='utf-8').read()
    csp = re.search(r'^\s*<meta http-equiv="Content-Security-Policy"[^\n]*$', s, re.M).group(0).strip()
    hc = re.findall(r'^\s*<script src="https://cdn\.jsdelivr\.net/npm/highcharts@[^\n]*$', s, re.M)
    leaflet_css = re.search(r'<link rel="stylesheet" href="https://unpkg\.com/leaflet@[^>]*>', s, re.S).group(0)
    ga = ''
    if not sem_ga:
        a = s.index('    <!-- Google Analytics (GA4) + Consent Mode v2 -->')
        b = s.index('</script>', s.index("gtag('config'")) + len('</script>')
        ga = s[a:b]
    return dict(csp=csp, hc=[h.strip() for h in hc], leaflet_css=leaflet_css, ga=ga)


def card(rot, val, sub):
    return f'<div class="kpi-card"><div class="kpi-label">{rot}</div><div class="kpi-value">{val}</div><div class="kpi-sub">{sub}</div></div>'


def pagina(a, todas, centrais, artigos, C, ULT, cab, base):
    nome, col = a['nome'], a['coluna']
    art = artigos.get(col, '')
    do_ = {'o': 'do ', 'a': 'da ', 'os': 'dos ', 'as': 'das '}.get(art, 'de ') + nome     # «do Alqueva», «de Montargil»
    o_ = (art + ' ' if art else '') + nome                                                # «o Alqueva», «Montargil»
    O_ = o_[0].upper() + o_[1:]
    url = f'{SITE}{base}{slug(col)}'
    # O último valor, mesmo que antigo: uma falha do SNIRH não apaga a página (o texto leva a data do valor)
    agora = C.valor(a, ULT, C.n)
    if not agora:
        return None
    v, iv = agora
    pct = v / a['ref'] * 100
    dv = du = C.dia(iv)
    sem = C.valor(a, iv - 7)
    ano = C.valor(a, C.menos_um_ano(iv))
    hist = C.historico(a, iv)
    anos = C.por_ano(a)
    refmax = a['referencia'] == 'maximo_registado'
    rot_ref = 'do máximo registado' if refmax else 'da capacidade'
    semanal = a['frequencia'] == 'semanal'

    # ---- frase principal
    partes = []
    if ano:
        partes.append(comp(pct - ano[0] / a['ref'] * 100, f'do mesmo dia de {du.year - 1}'))
    if hist:
        partes.append(comp(pct - hist['media'], f'da média de {hist["de"]} a {hist["ate"]} para este dia'))
    frase = (f'A {fmt_data(dv)}, a albufeira {esc(do_)} tinha '
             f'<strong>{fmt_hm3(v)}</strong> de água, <strong>{fmt_pct(pct)}</strong> {rot_ref}'
             + (': ' + ' e '.join(partes) if partes else '') + '.')
    if hist:
        acima = [y for y, p in hist['anos'] if p > pct]
        if not acima:
            frase += f' Nenhum ano de {hist["de"]} a {hist["ate"]} tinha tanta água a {fmt_dia_mes(dv)}.'
        elif len(acima) <= 4:
            anos_txt = str(acima[0]) if len(acima) == 1 else ', '.join(map(str, acima[:-1])) + ' e ' + str(acima[-1])
            frase += f' De {hist["de"]} a {hist["ate"]}, só em {anos_txt} tinha mais água a {fmt_dia_mes(dv)}.'
        else:
            frase += f' De {hist["de"]} a {hist["ate"]}, em {len(acima)} dos {len(hist["anos"])} anos tinha mais água a {fmt_dia_mes(dv)}.'

    # ---- cartões
    kpis = card('💧 Água guardada', fmt_hm3(v), f'{fmt_pct(pct)} {rot_ref}')
    kpis += card('📅 Numa semana', fmt_pp(pct - sem[0] / a['ref'] * 100) if sem else '--',
                 (('+' if v - sem[0] > 0.5 else '−' if v - sem[0] < -0.5 else '') + fmt_hm3(abs(v - sem[0])) + f' desde {fmt_data(C.dia(sem[1]))}') if sem else '')
    kpis += card('↩️ Há um ano', fmt_pct(ano[0] / a['ref'] * 100) if ano else '--',
                 f'{fmt_hm3(ano[0])} a {fmt_data(C.dia(ano[1]))}' if ano else '')
    kpis += card(f'📊 Média {hist["de"]}–{hist["ate"]} para {dv.strftime("%d/%m")}' if hist else '📊 Média', fmt_pct(hist['media']) if hist else '--',
                 f'mín. {fmt_pct(hist["min"][1])} ({hist["min"][0]}) · máx. {fmt_pct(hist["max"][1])} ({hist["max"][0]})' if hist else '')

    # ---- recordes
    mx_reg = float(a['maximo_registado_hm3']) if a['maximo_registado_hm3'] else None
    d_mx = date.fromisoformat(a['data_maximo']) if a['data_maximo'] else None
    i11 = max(0, C.idx(date(ANO_COMP, 1, 1)))
    desde = [(a['bruto'][i], i) for i in range(i11, C.n) if not math.isnan(a['bruto'][i])]
    mn11 = min(desde) if desde else None
    # «desde 2011», ou desde o 1.º ano completo da série, se for depois (Baixo Sabor, Alto Ceira)
    ano_min = max(ANO_COMP, (hist['de'] if hist else ANO_COMP))
    caps = sorted((x['cap'] for x in todas if x['cap']), reverse=True)
    rank = caps.index(a['cap']) + 1 if a['cap'] in caps else None
    quota = a['cap'] / sum(caps) * 100 if a['cap'] else None
    fmt_quota = lambda q: 'menos de 0,1%' if q < 0.05 else fmt_pct(q)
    rec = []
    if mx_reg and d_mx:
        rec.append(card('🔝 Máximo registado', fmt_hm3(mx_reg), f'{fmt_data(d_mx)} · {fmt_pct(mx_reg / a["ref"] * 100)}'))
    if mn11:
        rec.append(card(f'🔻 Mínimo desde {ano_min}', fmt_hm3(mn11[0]), f'{fmt_data(C.dia(mn11[1]))} · {fmt_pct(mn11[0] / a["ref"] * 100)}'))
    if a['cap']:
        rec.append(card('📏 Capacidade', fmt_hm3(a['cap']),
                        f'{rank}.ª maior pela capacidade · {fmt_quota(quota)} da capacidade de todas'))

    # ---- ano a ano
    linhas_ano = ''.join(
        f'<tr><td class="esq">{x["ano"]}{"*" if x["n"] < 300 else ""}</td>'
        f'<td>{fmt_hm3(x["max"])}<span class="mini">{fmt_data(x["dmax"])}</span></td>'
        f'<td>{fmt_hm3(x["min"])}<span class="mini">{fmt_data(x["dmin"])}</span></td>'
        f'<td>{fmt_pct(x["fim"] / a["ref"] * 100)}<span class="mini">{"a " + fmt_data(x["dfim"]) if x["dfim"] != date(x["ano"], 12, 31) else "31/12"}</span></td>'
        f'<td class="col-opc {"sobe" if x["fim"] - x["inicio"] > 0.5 else "desce" if x["fim"] - x["inicio"] < -0.5 else ""}">{("+" if x["fim"] - x["inicio"] > 0.5 else "−" if x["fim"] - x["inicio"] < -0.5 else "")}{fmt_hm3(abs(x["fim"] - x["inicio"]))}</td></tr>'
        for x in reversed(anos))
    poucos = any(x['n'] < 300 for x in anos)

    # ---- centrais
    cs = centrais.get(col, [])
    fn = lambda t: float(t) if t not in ('', None) else None
    mwf = lambda x: (fmt1(x).replace(',0', '') if x is not None else '—')
    linhas_c = ''.join(
        f'<tr><td class="esq">{esc(c["central"])}</td><td class="col-opc">{esc(c["inicio"] or "—")}</td><td class="esq col-opc">{esc(c["turbinas"] or "—")}</td>'
        f'<td>{mwf(fn(c["potencia_mw"]))}</td><td>{"—" if fn(c["bombagem_mw"]) is None else ("não" if not fn(c["bombagem_mw"]) else mwf(fn(c["bombagem_mw"])))}</td>'
        f'<td class="col-opc">{"—" if fn(c["producao_2024_gwh"]) is None else mwf(fn(c["producao_2024_gwh"]))}</td>'
        f'<td>{"—" if fn(c["producao_2025_gwh"]) is None else mwf(fn(c["producao_2025_gwh"]))}</td></tr>'
        for c in cs)
    tot_mw = sum(fn(c['potencia_mw']) or 0 for c in cs)
    tot_b = sum(fn(c['bombagem_mw']) or 0 for c in cs)
    tot_25 = sum(fn(c['producao_2025_gwh']) or 0 for c in cs)
    frase_c = ''
    if cs:
        nomes = [c['central'] for c in cs]
        lista_n = nomes[0] if len(nomes) == 1 else ', '.join(nomes[:-1]) + ' e ' + nomes[-1]
        frase_c = (f'{"A central" if len(cs) == 1 else "As centrais"} {esc(lista_n)} {"pode" if len(cs) == 1 else "podem"} turbinar '
                   f'<strong>{mwf(tot_mw)} MW</strong>' + (f' e bombear <strong>{mwf(tot_b)} MW</strong>' if tot_b else ', sem bombagem')
                   + (f'; em 2025 {"produziu" if len(cs) == 1 else "produziram"} {mwf(tot_25)} GWh' if tot_25 else '') + ' (APREN, Anuário 2026).')

    # ---- a mesma bacia
    irmas = [x for x in todas if x['bacia'] == a['bacia'] and x['coluna'] != col]
    def pct_hoje(x):
        r = C.valor(x, iv)
        return r[0] / x['ref'] * 100 if r else None
    bacia_html = ''.join(
        f'<li><a href="{base}{slug(x["coluna"])}">{esc(x["nome"])}</a> <span class="mini">{fmt_pct(pct_hoje(x)) if pct_hoje(x) is not None else "--"}</span></li>'
        for x in sorted(irmas, key=lambda x: -x['ref']))
    pct_bacia = None
    vs = [(C.valor(x, iv), x['ref']) for x in irmas + [a]]
    if all(r for r, _ in vs):
        pct_bacia = sum(r[0] for r, _ in vs) / sum(ref for _, ref in vs) * 100

    # ---- FAQ (visível e JSON-LD com o mesmo texto)
    faq = [
        (f'Quanta água tem {o_} hoje?',
         f'A {fmt_data(dv)}, o último valor publicado pelo SNIRH, {o_} tinha {fmt_hm3(v)} de água, {fmt_pct(pct)} {rot_ref}'
         + (': ' + ' e '.join(partes) if partes else '') + '. Esta página é atualizada todos os dias.'),
    ]
    if a['cap']:
        faq.append((f'Qual é a capacidade {do_}?',
                    f'{fmt_hm3(a["cap"])}, segundo o boletim semanal de albufeiras da APA. '
                    + (f'É a maior das albufeiras com uso para energia em Portugal: sozinha, tem {fmt_quota(quota)} da capacidade de todas.'
                       if rank == 1 else f'É a {rank}.ª maior das albufeiras com uso para energia em Portugal ({fmt_quota(quota)} da capacidade de todas).')))
    if mx_reg and d_mx:
        faq.append((f'Qual foi o máximo {do_}?',
                    f'{fmt_hm3(mx_reg)}, a {fmt_data(d_mx)} ({fmt_pct(mx_reg / a["ref"] * 100)} {rot_ref}), desde o início da série do SNIRH, a {fmt_data(date.fromisoformat(a["inicio_serie"]))}.'
                    + (f' Desde {ano_min}, o mínimo foi de {fmt_hm3(mn11[0])}, a {fmt_data(C.dia(mn11[1]))} ({fmt_pct(mn11[0] / a["ref"] * 100)}).' if mn11 else '')))
    if cs:
        faq.append((f'Que centrais usam a água {do_}?', re.sub('<[^>]+>', '', frase_c)))
    faq.append(('De onde vêm estes dados?',
                'O volume vem do SNIRH, o Sistema Nacional de Informação de Recursos Hídricos da Agência Portuguesa do Ambiente: '
                + ('um valor por semana, à segunda-feira. ' if semanal else 'o volume armazenado no fim de cada dia, que costuma aparecer na manhã seguinte. ')
                + 'A capacidade é a do boletim semanal de albufeiras da APA'
                + (' (sem capacidade publicada, os 100% são o máximo registado)' if refmax else '')
                + ('; a potência e a produção das centrais, as do Anuário 2026 da APREN.' if cs else '.')))
    faq_html = ''.join(f'<details class="faq-item"><summary><strong>{esc(q)}</strong></summary><div class="faq-content"><p>{esc(r)}</p></div></details>\n'
                       for q, r in faq)
    ld_faq = {'@context': 'https://schema.org', '@type': 'FAQPage',
              'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': r}} for q, r in faq]}
    ld_bc = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'Início', 'item': SITE + '/'},
        {'@type': 'ListItem', 'position': 2, 'name': 'Albufeiras', 'item': SITE + '/albufeiras'},
        {'@type': 'ListItem', 'position': 3, 'name': nome, 'item': url}]}
    ld_ds = {'@context': 'https://schema.org', '@type': 'Dataset',
             'name': f'Água guardada na albufeira {do_}',
             'description': f'O volume de água armazenado na albufeira {do_} (bacia {da_bacia(a["bacia"])}), {"por semana" if semanal else "por dia"} desde {fmt_data(date.fromisoformat(a["inicio_serie"]))}, a partir dos dados de base do SNIRH (Agência Portuguesa do Ambiente), e a percentagem {rot_ref}.',
             'url': url, 'inLanguage': 'pt-PT', 'isAccessibleForFree': True,
             'license': 'https://creativecommons.org/licenses/by/4.0/', 'dateModified': du.isoformat(),
             'temporalCoverage': f'{a["inicio_serie"]}/..',
             'spatialCoverage': {'@type': 'Place', 'name': f'Albufeira {do_}',
                                 **({'geo': {'@type': 'GeoCoordinates', 'latitude': a['lat'], 'longitude': a['lon']}} if a['lat'] else {})},
             'variableMeasured': [{'@type': 'PropertyValue', 'name': 'Volume armazenado', 'unitText': 'hm3'},
                                  {'@type': 'PropertyValue', 'name': 'Percentagem ' + rot_ref, 'unitText': '%'}],
             'isBasedOn': {'@type': 'CreativeWork', 'name': 'SNIRH — dados de base da rede hidrométrica', 'url': 'https://snirh.apambiente.pt',
                           'creator': {'@type': 'Organization', 'name': 'Agência Portuguesa do Ambiente', 'url': 'https://apambiente.pt'}},
             'creator': {'@type': 'Person', 'name': 'Tiago Felícia', 'url': SITE + '/'},
             'distribution': [{'@type': 'DataDownload', 'encodingFormat': 'text/csv',
                               'contentUrl': 'https://dados.tiagofelicia.pt/data/producao/albufeiras_snirh_diario.csv'}]}
    ld = lambda o: '<script type="application/ld+json">\n' + json.dumps(o, ensure_ascii=False, indent=2) + '\n    </script>'

    # ---- série para o gráfico: um valor por dia desde o primeiro (null sem valor)
    i0 = next(i for i, x in enumerate(a['bruto']) if not math.isnan(x))
    serie = [None if math.isnan(x) else round(x, 2) for x in a['bruto'][i0:iv + 1]]
    dados = {'nome': nome, 'ref': a['ref'], 'refMax': refmax, 'inicio': C.dia(i0).isoformat(), 'ult': du.isoformat(),
             'lat': a['lat'], 'lon': a['lon'], 'v': serie}

    titulo = f'{nome} hoje: quanta água tem a albufeira | Tiago Felícia'
    desc = (f'A albufeira {do_} tinha {fmt_hm3(v)} a {fmt_data(dv)}, {fmt_pct(pct)} {rot_ref}. Comparação com o ano anterior e '
            f'com a média desde {ANO_COMP}, máximos e mínimos, ano a ano e as centrais. Dados do SNIRH, atualizados todos os dias.')
    hc = '\n    '.join(cab['hc'])
    return f'''<!DOCTYPE html>
<html lang="pt-PT">
<head>
    <meta charset="UTF-8" />
    {cab['csp']}
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#2c3e50" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0f172a" media="(prefers-color-scheme: dark)" />

    <title>{esc(titulo)}</title>
    <meta name="description" content="{esc(desc)}" />

    <link rel="canonical" href="{url}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="{esc(O_)} hoje — a água guardada na albufeira" />
    <meta property="og:description" content="{esc(desc)}" />
    <meta property="og:url" content="{url}" />
    <meta property="og:image" content="{SITE}/images/social/social-albufeiras.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="pt_PT" />
    <meta name="twitter:card" content="summary_large_image" />

    <link rel="icon" type="image/png" href="/images/favicon-96x96.png" sizes="96x96" />
    <link rel="icon" type="image/svg+xml" href="/images/favicon.svg" />
    <link rel="shortcut icon" href="/images/favicon.ico" />
    <link rel="apple-touch-icon" sizes="180x180" href="/images/apple-touch-icon.png" />
    <link rel="manifest" href="/images/site.webmanifest" />
    <link rel="stylesheet" href="/style.css" />
    <link rel="stylesheet" href="{base}{CSS_PAGINA}?v={cab['versao']}" />
    <script src="/theme.js"></script>
    {hc}
    <script src="/cores-graficos.js"></script>
    {cab['leaflet_css']}

{cab['ga']}

    {ld(ld_bc)}
    {ld(ld_ds)}
    {ld(ld_faq)}
</head>
<body>
<a href="#main-content" class="skip-link">Saltar para o conteúdo</a>
<div id="menu-placeholder"></div>

<nav class="breadcrumb" aria-label="breadcrumb">
    <ol>
        <li><a href="/">Início</a></li>
        <li><a href="/albufeiras">Albufeiras</a></li>
        <li aria-current="page">{esc(nome)}</li>
    </ol>
</nav>

<main id="main-content">
    <div class="painel-header">
        <p class="badge-global">Dados desde <strong>{fmt_data(date.fromisoformat(a['inicio_serie']))}</strong> · {"um valor por semana" if semanal else "um valor por dia"} · Último valor: <strong>{fmt_data(dv)}</strong></p>
        <h1>Albufeira {esc(do_)}: quanta água tem hoje</h1>
        <p>Bacia {esc(da_bacia(a['bacia']))} · {"capacidade " + fmt_hm3(a['cap']) if a['cap'] else "sem capacidade publicada"}{" · " + str(len(cs)) + (" central" if len(cs) == 1 else " centrais") if cs else ""} · dados do SNIRH (Agência Portuguesa do Ambiente)</p>
    </div>

    <section class="bloco" id="bloco-resumo">
        <p class="resumo-topo">{frase}</p>
        <div class="kpis">{kpis}</div>
    </section>

    <section class="grafico-box" id="bloco-evol">
        <h2>📈 Ao longo do ano</h2>
        <p class="grafico-intro">A percentagem de água guardada, dia a dia, comparada com o ano anterior e com os anos completos desde {ANO_COMP} (a média e a faixa entre o mínimo e o máximo de cada dia).</p>
        <div class="bloco-controls">
            <span class="ctrl-label">Ano</span>
            <div class="btn-toggle" id="ctrl-ano" role="group" aria-label="Ano">
                <button type="button" data-v="civil" class="active">Civil</button>
                <button type="button" data-v="hidro" title="De 1 de outubro a 30 de setembro">Hidrológico</button>
            </div>
        </div>
        <div id="grafico-evol" class="grafico"></div>
        <noscript><p class="nota-bloco">O gráfico precisa de JavaScript; os valores estão no resumo acima e na tabela abaixo.</p></noscript>
    </section>

    <section class="grafico-box" id="bloco-recordes">
        <h2>🏆 Máximos, mínimos e tamanho</h2>
        <div class="kpis kpis-3">{''.join(rec)}</div>
    </section>

    <section class="grafico-box" id="bloco-anos">
        <h2>📅 Ano a ano</h2>
        <p class="grafico-intro">O maior e o menor volume de cada ano, com o dia, o volume no fim do ano (no ano em curso, no último dia) e quanto subiu ou desceu do primeiro ao último valor do ano.</p>
        <div class="tabela-box"><table class="tabela-alb">
            <thead><tr><th scope="col" class="esq">Ano</th><th scope="col">Máximo</th><th scope="col">Mínimo</th><th scope="col">No fim do ano</th><th scope="col" class="col-opc">Variação no ano</th></tr></thead>
            <tbody>{linhas_ano}</tbody>
        </table></div>
        {'<p class="nota-bloco">* Com menos de 300 valores no ano (nos primeiros anos da série, o SNIRH tem um valor por mês).</p>' if poucos else ''}
    </section>

    {f"""<section class="grafico-box" id="bloco-centrais">
        <h2>⚡ As centrais</h2>
        <p class="resumo-bloco" style="margin-top:0">{frase_c}</p>
        <div class="tabela-box"><table class="tabela-alb">
            <thead><tr><th scope="col" class="esq">Central</th><th scope="col" class="col-opc">Desde</th><th scope="col" class="esq col-opc">Turbinas</th><th scope="col">Turbina&shy;mento (MW)</th><th scope="col">Bomba&shy;gem (MW)</th><th scope="col" class="col-opc">Produção 2024 (GWh)</th><th scope="col">Produ&shy;ção 2025 (GWh)</th></tr></thead>
            <tbody>{linhas_c}</tbody>
        </table></div>
        <p class="nota-bloco">Fonte: APREN, Anuário 2026 (fichas técnicas das grandes e pequenas centrais hídricas).</p>
    </section>""" if cs else ''}

    <section class="grafico-box" id="bloco-bacia">
        <h2>🗺️ Na bacia {esc(da_bacia(a['bacia']))}</h2>
        <p class="grafico-intro">{"As outras albufeiras com uso para energia da mesma bacia, com a percentagem do último dia" + (f"; no conjunto da bacia, {fmt_pct(pct_bacia)}" if pct_bacia is not None else "") + "." if irmas else "É a única albufeira com uso para energia desta bacia nesta lista."}</p>
        {f'<ul class="lista-bacia">{bacia_html}</ul>' if irmas else ''}
        <p class="nota-bloco"><a href="/albufeiras?albufeira=bacia-{esc(a['bacia'])}">Ver a bacia na página das albufeiras</a> · <a href="/albufeiras?albufeira={col}">ver {esc(o_)} ao lado das outras</a></p>
    </section>

    {f"""<section class="grafico-box" id="bloco-mapa">
        <h2>📍 Onde fica</h2>
        <div id="mapa-alb" role="region" aria-label="Mapa com a localização da barragem"></div>
        <p class="nota-bloco">A barragem: {str(a['lat']).replace('.', ',')}, {str(a['lon']).replace('.', ',')} (SNIRH; CNPGB nas que lá não estão). Fundo: Natural Earth e <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© colaboradores do OpenStreetMap</a> (licença ODbL).</p>
    </section>""" if a['lat'] else ''}

    <section class="grafico-box" id="bloco-ficha">
        <h2>🧾 Ficha</h2>
        <table class="tabela-alb tabela-ficha"><tbody>
            <tr><th scope="row" class="esq">Bacia</th><td class="esq">{esc(a['bacia'])}</td></tr>
            <tr><th scope="row" class="esq">Capacidade total</th><td class="esq">{fmt_hm3(a['cap']) + ' (boletim semanal de albufeiras da APA; inclui o volume morto)' if a['cap'] else 'sem capacidade publicada: os 100% são o máximo registado'}</td></tr>
            <tr><th scope="row" class="esq">Código SNIRH</th><td class="esq">{esc(a['codigo_snirh'])}</td></tr>
            <tr><th scope="row" class="esq">Série</th><td class="esq">{"semanal (à segunda-feira)" if semanal else "diária"}, desde {fmt_data(date.fromisoformat(a['inicio_serie']))}</td></tr>
        </tbody></table>
    </section>

    <div class="cta-simulador">
        <h2>E as outras albufeiras?</h2>
        <p>As 57 albufeiras com uso para energia, no mapa e numa tabela, por bacia, com a energia guardada em Portugal e em Espanha.</p>
        <div class="botoes"><a href="/albufeiras" class="button-link">Todas as albufeiras</a></div>
    </div>

    <h2 id="faq" class="faq-titulo">❔ Perguntas Frequentes</h2>
    <div class="faq-lista">
{faq_html}    </div>
</main>

<div id="footer-placeholder"></div>

<script type="application/json" id="dados-albufeira">{json.dumps(dados, ensure_ascii=False, separators=(",", ":"))}</script>
<script src="{base}{JS_PAGINA}?v={cab['versao']}"></script>
<script src="/script.js"></script>
<script src="/cookie-consent.js"></script>
</body>
</html>
'''


def indice(feitas, base):
    """A lista das páginas para a albufeiras.html: uma linha por bacia, as albufeiras por ordem alfabética."""
    linhas = []
    for b in ORDEM_BACIAS + sorted({a['bacia'] for a in feitas} - set(ORDEM_BACIAS)):
        xs = sorted((a for a in feitas if a['bacia'] == b), key=lambda a: a['nome'])
        if xs:
            linhas.append(f'        <p class="lista-paginas"><strong>{esc(b)}:</strong> '
                          + ' · '.join(f'<a href="{base}{slug(a["coluna"])}">{esc(a["nome"])}</a>' for a in xs) + '</p>')
    return '\n'.join(linhas)


def escrever(caminho, conteudo):
    """Só escreve se mudou (não refaz commits iguais)."""
    if os.path.exists(caminho) and open(caminho, encoding='utf-8', newline='').read() == conteudo:
        return False
    open(caminho, 'w', encoding='utf-8', newline='\n').write(conteudo)
    return True


def ler_artigos():
    with open(ARTIGOS_CSV, encoding='utf-8-sig', newline='') as f:
        return {r['coluna']: r['artigo'].strip() for r in csv.DictReader(f)}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--dados', default=DADOS)
    p.add_argument('--modelo', default=os.path.join(ROOT, 'albufeiras.html'))
    p.add_argument('--saida', default=ROOT)
    p.add_argument('--base', default='/albufeira/')
    p.add_argument('--so', default='')
    p.add_argument('--sem-ga', action='store_true')
    p.add_argument('--sem-indice', action='store_true')
    args = p.parse_args()
    todas, centrais, d0, n = carregar(args.dados)
    C = Contas(d0, n)
    ULT = n - 1
    cab = cabeca_do_modelo(args.modelo, args.sem_ga)
    pasta = os.path.join(args.saida, args.base.strip('/'))
    os.makedirs(pasta, exist_ok=True)
    # O ?v= do CSS e do JS muda quando eles mudam (a cache do browser e do service worker)
    cab['versao'] = hashlib.sha1(b''.join(open(os.path.join(pasta, f), 'rb').read() if os.path.exists(os.path.join(pasta, f)) else b''
                                          for f in (CSS_PAGINA, JS_PAGINA))).hexdigest()[:8]
    artigos = ler_artigos()
    so = set(filter(None, args.so.split(',')))
    feitas, mudadas = [], 0
    for a in todas:
        if so and a['coluna'] not in so:
            continue
        if a['coluna'] not in artigos:
            print(f'  aviso: {a["coluna"]} sem linha em {os.path.basename(ARTIGOS_CSV)} (fica «albufeira de {a["nome"]}»)')
        h = pagina(a, todas, centrais, artigos, C, ULT, cab, args.base)
        if h is None:
            print('  sem nenhum valor:', a['coluna'])
            continue
        mudadas += escrever(os.path.join(pasta, slug(a['coluna']) + '.html'), h)
        feitas.append(a)
    print(f'✓ {len(feitas)} página(s) em {pasta} ({mudadas} alterada(s))')
    if so:
        return
    # As páginas de albufeiras que já não estão na lista
    validas = {slug(a['coluna']) + '.html' for a in feitas}
    for f in sorted(os.listdir(pasta)):
        if f.endswith('.html') and f not in validas:
            os.remove(os.path.join(pasta, f))
            print('  apagada:', f)
    if args.sem_indice:
        return
    s = open(args.modelo, encoding='utf-8', newline='').read()
    i, j = s.find(INICIO_IDX), s.find(FIM_IDX)
    if i < 0 or j < i:
        print(f'  aviso: {os.path.basename(args.modelo)} sem os comentários PAGINAS-ALBUFEIRAS; a lista não foi refeita')
        return
    novo = s[:i + len(INICIO_IDX)] + '\n' + indice(feitas, args.base) + '\n        ' + s[j:]
    if escrever(args.modelo, novo):
        print(f'✓ lista das páginas refeita em {os.path.basename(args.modelo)}')


if __name__ == '__main__':
    main()
