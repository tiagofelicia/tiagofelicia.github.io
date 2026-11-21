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
As fotografias (Wikimedia Commons, cada uma com o autor e a licença) estão em scripts/albufeiras_fotos.csv e os
ficheiros em images/albufeiras/<nome>.webp; uma albufeira sem linha fica sem fotografia.
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
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

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
FOTOS_CSV = os.path.join(AQUI, 'albufeiras_fotos.csv')
# O copyrightNotice das fotografias sem direitos de autor (licenças como estão no albufeiras_fotos.csv)
DOMINIO_PUBLICO = {'Public domain': 'Domínio público', 'CC0': 'Domínio público (CC0)'}
ORDEM_BACIAS = ['Lima', 'Cávado', 'Ave', 'Douro', 'Vouga', 'Mondego', 'Ribeiras do Oeste', 'Tejo', 'Sado', 'Ribeiras do Alentejo',
                'Mira', 'Guadiana', 'Arade', 'Ribeiras do Algarve']
INICIO_IDX = '<!-- PAGINAS-ALBUFEIRAS: gerado por scripts/gerar_paginas_albufeiras.py, não editar à mão -->'
FIM_IDX = '<!-- /PAGINAS-ALBUFEIRAS -->'
# O endereço de cada página: a coluna do CSV com hífenes (castelo_de_bode → castelo-de-bode)
slug = lambda col: col.replace('_', '-')


# ---------------------------------------------------------------- formatação (como o Intl.NumberFormat('pt-PT'))
def num(v, casas=0):
    s = f'{Decimal(repr(abs(v))).quantize(Decimal(1).scaleb(-casas), rounding=ROUND_HALF_UP):f}'
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


# ---------------------------------------------------------------- «Agora»: o InfoÁgua (APA), de hora a hora
# albufeiras_agora.json (dados-energia, de hora a hora): por albufeira, [data_utc, volume_pct, cota_m, afluente,
# efluente] das últimas 48 h. As mesmas contas estão no albufeira.js, que refaz os cartões com o ficheiro do momento.
LISBOA = ZoneInfo('Europe/Lisbon')
AGORA_MAX_H = 48        # sem valor do volume há mais de 48 h, a secção não aparece
AGORA_MIN_HORAS = 6     # com menos horas com volume (estações com um valor por dia), não há gráfico
_utc = lambda s: datetime.strptime(s, '%Y-%m-%d %H:%M').replace(tzinfo=timezone.utc)
fmt_caudal = lambda v: num(v, 0 if abs(v) >= 100 else 1 if abs(v) >= 10 else 2) + ' m³/s'


def ler_agora(pasta):
    try:
        return json.loads(texto(pasta, 'albufeiras_agora.json')).get('albufeiras') or {}
    except Exception as e:   # sem o ficheiro, as páginas ficam sem a secção
        print(f'  aviso: sem o albufeiras_agora.json ({type(e).__name__}): as páginas ficam sem «Agora»')
        return {}


def ler_fichas(pasta):
    try:
        return json.loads(texto(pasta, 'albufeiras_fichas.json'))
    except Exception as e:   # sem o ficheiro, as páginas ficam sem a ficha técnica
        print(f'  aviso: sem o albufeiras_fichas.json ({type(e).__name__}): as páginas ficam sem a ficha técnica')
        return {}


# As albufeiras que não estão no boletim semanal da APA e têm a capacidade da CNPGB (as «# CNPGB» do ALBUFEIRAS do
# atualizar_albufeiras_snirh.py, no dados-energia)
CAP_CNPGB = {'alto_tamega', 'daivoes', 'feiticeiro', 'gouvaes', 'pedrogao'}
PARTICULAS = {'a', 'o', 'de', 'da', 'do', 'das', 'dos', 'e'}
SIGLAS = {'EDP', 'EDIA', 'COBA', 'DGADR', 'DGHEA', 'EEM', 'EM', 'REN', 'APA', 'ETA', 'INAG', 'EPAL', 'HP', 'SA'}


def nome_proprio(s, siglas=False):
    """«RIO ZÊZERE» → «Rio Zêzere», «SANTA CLARA-A-VELHA» → «Santa Clara-a-Velha» (o inventário tem muitos em maiúsculas).
    Com siglas (as entidades), as siglas conhecidas e as palavras com pontos ficam como estão: «ÁGUAS DO ALGARVE S.A.» →
    «Águas do Algarve S.A.», «COBA», «EDP». Um texto que já tem minúsculas fica como está."""
    if not s or not s.isupper():
        return s
    def palavra(w, primeira):
        if siglas and (w.strip('.,()') in SIGLAS or '.' in w.strip('.,()')):   # S.A., I.P., Lda., EDP, COBA…
            return w
        partes = w.lower().split('-')
        return '-'.join(x if (j or not primeira) and x in PARTICULAS else x[:1].upper() + x[1:] for j, x in enumerate(partes))
    return ' '.join(palavra(w, i == 0) for i, w in enumerate(s.split()))


def n_curto(x):
    """121.5 → «121,5», 122 → «122», 1095000 → «1 095 000» (sem zeros à direita)."""
    s = num(x, 2)
    return s.rstrip('0').rstrip(',') if ',' in s else s


def lista_pt(xs):
    return xs[0] if len(xs) == 1 else ', '.join(xs[:-1]) + ' e ' + xs[-1]


def linhas_ficha(f):
    """As linhas da ficha técnica (do inventário de albufeiras do SNIRH ou, nas centrais que lá não estão, da CNPGB)
    para a tabela «Ficha técnica e limitações»."""
    if not f:
        return ''
    al, ba, lo, bh = f.get('albufeira', {}), f.get('barragem', {}), f.get('local', {}), f.get('bacia', {})
    linhas = []
    usos = f.get('aproveitamentos')
    if usos:
        linhas.append(('Usos', lista_pt([u if i == 0 else u.lower() for i, u in enumerate(usos)])))
    cu, vm = al.get('capacidade_util_dam3'), al.get('volume_morto_dam3')
    xs = [f'{fmt_hm3(cu / 1000)} de capacidade útil' if cu else None,
          f'{fmt_hm3(vm / 1000)} de volume morto (abaixo do nível mínimo de exploração)' if vm else None]
    if any(xs):
        linhas.append(('Capacidade útil e volume morto', ' · '.join(x for x in xs if x)))
    niveis = [(k, al.get(c)) for k, c in (('pleno armazenamento (NPA)', 'npa_m'), ('máxima cheia (NMC)', 'nmc_m'), ('mínimo de exploração (NmE)', 'nme_m'))]
    if any(v is not None for _, v in niveis):
        linhas.append(('Cotas dos níveis de água', ' · '.join(f'{k}: {n_curto(v)} m' for k, v in niveis if v is not None)
                       + ('; num sistema local (subtrair 9,20 m para o sistema altimétrico nacional)' if f.get('referencial_local') else '')))
    if al.get('area_npa_ha'):
        linhas.append(('Área inundada', f'{n_curto(al["area_npa_ha"])} ha ao nível de pleno armazenamento'))
    xs = [ba.get('tipo'), f'{n_curto(ba["altura_m"])} m de altura acima da fundação' if ba.get('altura_m') else None,
          (f'coroamento com {n_curto(ba["coroamento_m"])} m' + (f', à cota {n_curto(ba["cota_coroamento_m"])} m' if ba.get('cota_coroamento_m') else ''))
          if ba.get('coroamento_m') else None,
          f'em funcionamento desde {ba["ano"]}' if ba.get('ano') else
          f'concluída em {ba["ano_conclusao"]}' if ba.get('ano_conclusao') else None]     # CNPGB: o ano de conclusão da obra
    if any(xs):
        linhas.append(('Barragem', ' · '.join(x for x in xs if x)))
    xs = [ba.get('descarregador'), f'{n_curto(ba["descarregador_m3s"])} m³/s' if ba.get('descarregador_m3s') else None]
    if any(xs):
        linhas.append(('Descarregador de cheias', ' · '.join(x for x in xs if x)))
    sitio = ', '.join(x for x in (nome_proprio(lo.get('freguesia')), nome_proprio(lo.get('concelho')), nome_proprio(lo.get('distrito'))) if x)
    xs = [nome_proprio(ba.get('curso_agua')), sitio]
    if any(xs):
        linhas.append(('Rio e local', ' · '.join(x for x in xs if x)))
    for rot, c in (('Dono da obra', 'dono_obra'), ('Entidade exploradora', 'entidade_exploradora'), ('Projeto', 'projetista')):
        if lo.get(c):
            linhas.append((rot, nome_proprio(lo[c], siglas=True)))
    xs = [(f'{n_curto(bh["area_total_km2"])} km²' + (f' (bacia própria: {n_curto(bh["area_propria_km2"])} km²)'
                                                    if bh.get('area_propria_km2') and bh['area_propria_km2'] < bh['area_total_km2'] else ''))
          if bh.get('area_total_km2') else None,
          f'precipitação média de {n_curto(bh["precipitacao_mm"])} mm por ano' if bh.get('precipitacao_mm') else None,
          f'altitude de {n_curto(bh["altitude_min_m"])} a {n_curto(bh["altitude_max_m"])} m'
          if bh.get('altitude_min_m') is not None and bh.get('altitude_max_m') is not None else None]
    if any(xs):
        linhas.append(('Bacia hidrográfica', ' · '.join(x for x in xs if x)))
    return ''.join(f'            <tr><th scope="row" class="esq">{esc(k)}</th><td class="esq">{esc(v)}</td></tr>\n' for k, v in linhas)


def resumo_agora(linhas, agora=None, npa=None):
    """Os quatro cartões e a hora do último volume, ou None (sem volume nas últimas 48 h)."""
    agora = agora or datetime.now(timezone.utc)
    ultimo = lambda k: next(((l[0], l[k]) for l in reversed(linhas) if l[k] is not None), None)
    por_hora = {l[0]: l for l in linhas}

    def ha24(t, k):    # o valor 24 h antes (ou a hora antes ou depois dessa)
        for dh in (24, 25, 23):
            l = por_hora.get((_utc(t) - timedelta(hours=dh)).strftime('%Y-%m-%d %H:%M'))
            if l and l[k] is not None:
                return l[k]
        return None

    def media24(t, k):
        ini = _utc(t) - timedelta(hours=24)
        v = [l[k] for l in linhas if l[k] is not None and ini < _utc(l[0]) <= _utc(t)]
        return sum(v) / len(v) if v else None

    vol = ultimo(1)
    if not vol or (agora - _utc(vol[0])).total_seconds() > AGORA_MAX_H * 3600:
        return None
    t, v = vol
    v24 = ha24(t, 1)
    cartoes = card('💧 Volume armazenado', fmt_pct(v), f'{fmt_pp(v - v24)} em 24 horas' if v24 is not None else '')
    cota = ultimo(2)
    if cota:
        c24 = ha24(cota[0], 2)
        d = cota[1] - c24 if c24 is not None else None
        partes = []
        if npa is not None:    # a cota do nível de pleno armazenamento, da ficha técnica (o mesmo referencial do InfoÁgua)
            dn = npa - cota[1]
            partes.append(f'a {num(dn, 2)} m do nível de pleno armazenamento' if dn > 0.005 else
                          'no nível de pleno armazenamento' if dn > -0.005 else f'{num(-dn, 2)} m acima do nível de pleno armazenamento')
        if d is not None:
            partes.append(('+' if d > 0.005 else '−' if d < -0.005 else '') + num(abs(d), 2) + ' m em 24 horas')
        cartoes += card('📏 Cota (nível da água)', num(cota[1], 2) + ' m', '<br>'.join(partes))
    else:
        cartoes += card('📏 Cota (nível da água)', '--', '')
    for k, rot in ((3, '⬇️ A entrar (caudal afluente)'), (4, '⬆️ A sair (caudal efluente)')):
        u = ultimo(k)      # sem nenhum valor nas 48 h, o cartão não aparece
        if u:
            m = media24(u[0], k)
            cartoes += card(rot, fmt_caudal(u[1]), f'média de 24 horas: {fmt_caudal(m)}' if m is not None else '')
    quando = _utc(t).astimezone(LISBOA).strftime('%d/%m/%Y às %H:%M')
    return dict(cartoes=cartoes, quando=quando, horas=sum(1 for l in linhas if l[1] is not None))


def bloco_agora(col, linhas, npa=None):
    r = resumo_agora(linhas, npa=npa) if linhas else None
    if not r:
        return ''
    # Estações com um valor por dia (as de rega do Alentejo, às 07:00): só os cartões, sem o gráfico de 48 h
    if r['horas'] < AGORA_MIN_HORAS:
        return f'''<section class="grafico-box" id="bloco-agora" data-albufeira="{col}">
        <h2>⏱️ Agora</h2>
        <p class="grafico-intro">O último valor da estação de tempo real da APA, que aqui só publica um valor por dia: <strong id="agora-quando">{r['quando']}</strong><span id="agora-idade"></span> (hora de Portugal continental).</p>
        <div class="kpis" id="agora-kpis">{r['cartoes']}</div>
        <p class="nota-bloco">Fonte: APA (InfoÁgua), estações de albufeira de tempo real. A percentagem é a que a APA publica e pode diferir um pouco da do resumo, que usa o valor diário do SNIRH.</p>
    </section>

    '''
    return f'''<section class="grafico-box" id="bloco-agora" data-albufeira="{col}">
        <h2>⏱️ Agora</h2>
        <p class="grafico-intro">Os valores de hora a hora das últimas 48 horas, das estações de tempo real da APA. Último valor: <strong id="agora-quando">{r['quando']}</strong><span id="agora-idade"></span> (hora de Portugal continental).</p>
        <div class="kpis" id="agora-kpis">{r['cartoes']}</div>
        <div class="bloco-controls">
            <span class="ctrl-label">Gráfico</span>
            <div class="btn-toggle" id="ctrl-agora" role="group" aria-label="O que mostrar no gráfico das últimas 48 horas">
                <button type="button" data-v="caudais" class="active">Caudais</button>
                <button type="button" data-v="volume">Volume</button>
                <button type="button" data-v="cota">Cota</button>
            </div>
        </div>
        <div id="grafico-agora" class="grafico grafico-agora"></div>
        <p class="nota-bloco">Fonte: APA (InfoÁgua), estações de albufeira de tempo real. A percentagem é a que a APA publica e pode diferir um pouco da do resumo, que usa o valor diário do SNIRH; o caudal afluente nem sempre vem em todas as horas.</p>
    </section>

    '''


def pagina(a, todas, centrais, artigos, fotos, C, ULT, cab, base, agora_apa=None, fichas=None):
    nome, col = a['nome'], a['coluna']
    energia = a.get('energia') != 'não'      # as com central (57) e as sem central (29, desde a fase 2)
    ficha = (fichas or {}).get(col)
    npa = (ficha or {}).get('albufeira', {}).get('npa_m')
    fonte_ficha = ('' if not ficha else
                   '; a ficha técnica, da CNPGB (Comissão Nacional Portuguesa das Grandes Barragens, da APA)'
                   if ficha.get('fonte') == 'cnpgb' else '; a ficha técnica, do inventário de albufeiras do SNIRH')
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
    # A capacidade é a do boletim semanal da APA ou, nas que lá não estão, a da CNPGB. Com o máximo registado como 100%,
    # a capacidade publicada (a do boletim ou, sem ela, a da ficha técnica) é menor do que volumes já registados.
    fonte_cap, fonte_cap_curta = (('a CNPGB (Comissão Nacional Portuguesa das Grandes Barragens, da APA)', 'CNPGB')
                                  if col in CAP_CNPGB else ('o boletim semanal de albufeiras da APA', 'boletim semanal de albufeiras da APA'))
    cap_ficha = ((ficha or {}).get('albufeira', {}).get('capacidade_total_dam3') or 0) / 1000 or None
    ficha_cnpgb = (ficha or {}).get('fonte') == 'cnpgb'
    cap_baixa = (a['cap'], fonte_cap_curta) if a['cap'] else (cap_ficha, 'CNPGB' if ficha_cnpgb else 'inventário de albufeiras do SNIRH')
    if not (refmax and cap_baixa[0] and cap_baixa[0] < a['ref']):
        cap_baixa = (None, None)
    if a['cap']:
        txt_cap = f'{fmt_hm3(a["cap"])} ({fonte_cap_curta}; inclui o volume morto)'
        frase_cap = ('A capacidade é a da CNPGB (Comissão Nacional Portuguesa das Grandes Barragens, da APA): esta albufeira não '
                     'está no boletim semanal de albufeiras da APA' if col in CAP_CNPGB else 'A capacidade é a do boletim semanal de albufeiras da APA')
        if cap_baixa[0]:
            txt_cap += f', menos do que volumes já registados: os 100% são o máximo registado, {fmt_hm3(a["ref"])}'
            frase_cap += ', menor do que volumes já registados: os 100% são o máximo registado'
    elif cap_baixa[0]:
        da_ficha = 'da CNPGB' if ficha_cnpgb else 'do inventário de albufeiras do SNIRH'
        txt_cap = (f'sem capacidade no boletim semanal de albufeiras da APA; a ficha técnica {da_ficha} dá {fmt_hm3(cap_ficha)}, '
                   f'menos do que volumes já registados: os 100% são o máximo registado, {fmt_hm3(a["ref"])}')
        frase_cap = (f'Esta albufeira não está no boletim semanal de albufeiras da APA, e a capacidade que a ficha técnica {da_ficha} '
                     f'lhe dá, {fmt_hm3(cap_ficha)}, é menor do que volumes já registados: os 100% são o máximo registado')
    else:
        txt_cap = ('sem capacidade no boletim semanal de albufeiras da APA' if cap_ficha else 'sem capacidade publicada') \
            + ': os 100% são o máximo registado'
        frase_cap = 'Esta albufeira não tem capacidade publicada: os 100% são o máximo registado'
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
    caps = sorted((x['cap'] for x in todas if x['cap'] and (x.get('energia') != 'não') == energia), reverse=True)
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
                        f'{rank}.ª maior pela capacidade · {fmt_quota(quota)} da capacidade de todas'
                        + ('' if energia else ' as sem central')))

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
    # nas com central, as outras com central (como até aqui); nas sem central, todas as da bacia
    irmas = [x for x in todas if x['bacia'] == a['bacia'] and x['coluna'] != col and (not energia or x.get('energia') != 'não')]
    def pct_hoje(x):
        r = C.valor(x, iv)
        return r[0] / x['ref'] * 100 if r else None
    bacia_html = ''.join(
        f'<li><a href="{base}{slug(x["coluna"])}">{esc(x["nome"])}</a> <span class="mini">{fmt_pct(pct_hoje(x)) if pct_hoje(x) is not None else "--"}</span></li>'
        for x in sorted(irmas, key=lambda x: -x['ref']))
    pct_bacia = None
    vs = [(C.valor(x, iv), x['ref']) for x in irmas + [a]]
    if energia and all(r for r, _ in vs):
        pct_bacia = sum(r[0] for r, _ in vs) / sum(ref for _, ref in vs) * 100
    if irmas:
        intro_bacia = (('As outras albufeiras com uso para energia da mesma bacia' if energia else 'As outras albufeiras da mesma bacia acompanhadas neste site')
                       + ', com a percentagem do último dia (' + fmt_data(dv) + ')'
                       + (f'; no conjunto da bacia, {fmt_pct(pct_bacia)}' if pct_bacia is not None else '') + '.')
    else:
        intro_bacia = 'É a única albufeira com uso para energia desta bacia nesta lista.' if energia else 'É a única albufeira desta bacia acompanhada neste site.'

    # ---- FAQ (visível e JSON-LD com o mesmo texto)
    faq = [
        (f'Quanta água tem {o_} hoje?',
         f'A {fmt_data(dv)}, o último valor publicado pelo SNIRH, {o_} tinha {fmt_hm3(v)} de água, {fmt_pct(pct)} {rot_ref}'
         + (': ' + ' e '.join(partes) if partes else '') + '. Esta página é atualizada todos os dias.'),
        (f'Qual é o nível da barragem {do_}?',
         f'A {fmt_data(dv)}, a albufeira da barragem {do_} estava a {fmt_pct(pct)} {rot_ref}, com {fmt_hm3(v)} de água. '
         'É esta percentagem do volume guardado que costuma ser dada como o nível da barragem.'),
    ]
    if a['cap']:
        faq.append((f'Qual é a capacidade {do_}?',
                    f'{fmt_hm3(a["cap"])}, segundo {fonte_cap}. '
                    + ((f'É a maior das albufeiras com uso para energia em Portugal: sozinha, tem {fmt_quota(quota)} da capacidade de todas.'
                        if rank == 1 else f'É a {rank}.ª maior das albufeiras com uso para energia em Portugal ({fmt_quota(quota)} da capacidade de todas).')
                       if energia else
                       (f'É a maior das albufeiras sem central acompanhadas neste site: sozinha, tem {fmt_quota(quota)} da capacidade de todas elas.'
                        if rank == 1 else f'É a {rank}.ª maior das albufeiras sem central acompanhadas neste site ({fmt_quota(quota)} da capacidade de todas elas).'))))
    if mx_reg and d_mx:
        faq.append((f'Qual foi o máximo {do_}?',
                    f'{fmt_hm3(mx_reg)}, a {fmt_data(d_mx)} ({fmt_pct(mx_reg / a["ref"] * 100)} {rot_ref}), desde o início da série do SNIRH, a {fmt_data(date.fromisoformat(a["inicio_serie"]))}.'
                    + (f' Desde {ano_min}, o mínimo foi de {fmt_hm3(mn11[0])}, a {fmt_data(C.dia(mn11[1]))} ({fmt_pct(mn11[0] / a["ref"] * 100)}).' if mn11 else '')))
    if cs:
        faq.append((f'Que centrais usam a água {do_}?', re.sub('<[^>]+>', '', frase_c)))
    faq.append(('De onde vêm estes dados?',
                'O volume vem do SNIRH, o Sistema Nacional de Informação de Recursos Hídricos da Agência Portuguesa do Ambiente: '
                + ('um valor por semana, à segunda-feira. ' if semanal else 'o volume armazenado no fim de cada dia, que costuma aparecer na manhã seguinte. ')
                + frase_cap
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

    # ---- a fotografia (Wikimedia Commons): o crédito pede o autor, a fonte e a licença, e que se diga que foi alterada
    foto = fotos.get(col)
    foto_html, ld_foto = '', None
    if foto:
        src = f'/images/albufeiras/{slug(col)}.webp'
        quem = esc(foto['autor']) if foto['autor'] else f'carregada por {esc(foto["carregada_por"])}'
        lic = foto['licenca']
        url_lic = foto['url_licenca'] or foto['pagina_commons']
        rot_lic = {'Public domain': 'domínio público', 'Attribution': 'licença de atribuição'}.get(lic, lic)
        foto_html = (f'<figure class="foto-alb"><img src="{src}" width="{foto["largura"]}" height="{foto["altura"]}" '
                     f'alt="Fotografia da barragem e da albufeira {esc(do_)}" loading="lazy" decoding="async" />'
                     f'<figcaption>Fotografia: {quem} · <a href="{esc(foto["pagina_commons"])}" target="_blank" rel="noopener">Wikimedia Commons</a>'
                     f' · <a href="{esc(url_lic)}" target="_blank" rel="noopener">{esc(rot_lic)}</a> · redimensionada. '
                     f'Não mostra o nível de hoje.</figcaption></figure>')
        ld_foto = {'@context': 'https://schema.org', '@type': 'ImageObject', 'contentUrl': SITE + src,
                   'name': f'Barragem e albufeira {do_}', 'license': url_lic, 'acquireLicensePage': foto['pagina_commons'],
                   'creditText': (foto['autor'] or foto['carregada_por']) + ', Wikimedia Commons',
                   # Quem tem os direitos: o autor (as licenças Creative Commons não os tiram ao autor);
                   # as fotografias em domínio público e CC0 não têm dono
                   'copyrightNotice': DOMINIO_PUBLICO.get(lic, foto['autor'] or foto['carregada_por']),
                   'creator': {'@type': 'Person', 'name': foto['autor'] or foto['carregada_por']}}

    # ---- as limitações desta albufeira
    limites = ['A percentagem conta o volume morto, a água abaixo das tomadas que não se pode usar.']
    if semanal:
        limites.append('O SNIRH só tem um valor por semana: a comparação «numa semana» e os gráficos são feitos com esses valores.')
    if refmax:
        limites.append(f'A capacidade publicada ({fmt_hm3(cap_baixa[0])}, {cap_baixa[1]}) é menor do que volumes já registados: '
                       'os 100% são o maior volume registado na série.' if cap_baixa[0] else
                       'Sem capacidade publicada: os 100% são o maior volume registado na série.')
    if hist and hist['de'] > ANO_COMP:
        limites.append(f'A série só tem anos completos desde {hist["de"]}: a média, o mínimo e o máximo para o dia só contam esses anos.')
    elif not hist:
        limites.append(f'A série começa a {fmt_data(date.fromisoformat(a["inicio_serie"]))}: ainda não há anos completos que cheguem para a média, o mínimo e o máximo para o dia.')
    if not semanal:
        falta = sum(1 for i in range(max(0, iv - 364), iv + 1) if math.isnan(a['bruto'][i]))
        if falta > 7:
            limites.append(f'{falta} dias sem valor nos últimos 12 meses: no gráfico, um dia sem valor usa o último dos 31 dias anteriores.')
    if not cs and energia:
        limites.append('Não há centrais com potência publicada (APREN; CNPGB) associadas a esta albufeira.')
    limites.append('Os valores impossíveis do SNIRH (erros de leitura) são retirados antes das contas.')
    agora_html = bloco_agora(col, (agora_apa or {}).get(col), npa)   # («agora», mais acima, é o último valor do SNIRH)
    if agora_html:
        limites.append('O «Agora» vem das estações de tempo real da APA (InfoÁgua), de hora a hora, e não do SNIRH: '
                       'a percentagem é a que a APA publica e pode diferir um pouco da do resumo.')
    limites_html = ''.join(f'<li>{esc(x)}</li>' for x in limites)

    # ---- série para o gráfico: um valor por dia desde o primeiro (null sem valor)
    i0 = next(i for i, x in enumerate(a['bruto']) if not math.isnan(x))
    serie = [None if math.isnan(x) else round(x, 2) for x in a['bruto'][i0:iv + 1]]
    dados = {'nome': nome, 'do': do_, 'o': o_, 'ref': a['ref'], 'refMax': refmax, 'inicio': C.dia(i0).isoformat(), 'ult': du.isoformat(),
             'lat': a['lat'], 'lon': a['lon'], 'npa': npa, 'v': serie}

    opcoes_comp = ''.join(f'<option value="{v}">{t}</option>' for v, t in (
        ('semana', 'Uma semana antes'), ('mes', 'Um mês antes'), ('hidro', 'Início do ano hidrológico (1 de outubro)'),
        ('jan', 'Início do ano (1 de janeiro)'), ('ano', 'Um ano antes'), ('data', 'Outra data…')))

    # «barragem» e «nível» são o que mais se pesquisa (Search Console, novembro de 2026); «albufeira» fica nos textos
    titulo = f'Barragem {do_} hoje: nível e água da albufeira | Tiago Felícia'
    desc = (f'Nível da barragem {do_}: a albufeira tinha {fmt_hm3(v)} a {fmt_data(dv)}, {fmt_pct(pct)} {rot_ref}. Comparação com o ano anterior e '
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
    <meta property="og:title" content="Barragem {esc(do_)} hoje — a água guardada na albufeira" />
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
    {ld(ld_faq)}{chr(10) + '    ' + ld(ld_foto) if ld_foto else ''}
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
        <h1>Barragem e albufeira {esc(do_)}: quanta água tem hoje</h1>
        <p>Bacia {esc(da_bacia(a['bacia']))} · {"capacidade " + fmt_hm3(a['cap']) if a['cap'] else "sem capacidade no boletim da APA" if cap_ficha else "sem capacidade publicada"}{" · " + str(len(cs)) + (" central" if len(cs) == 1 else " centrais") if cs else ""} · dados do SNIRH (Agência Portuguesa do Ambiente)</p>
    </div>

    <section class="bloco" id="bloco-resumo">
        <div class="vista-bar" id="alb-dia">
            <span class="vista-grupo">
                <label class="ctrl-label" for="sel-dia">Dia</label>
                <button type="button" class="btn-nav" id="dia-ant" title="Dia anterior" aria-label="Dia anterior">&#10094;</button>
                <input type="date" id="sel-dia" value="{du.isoformat()}" min="{C.dia(i0).isoformat()}" max="{du.isoformat()}">
                <button type="button" class="btn-nav" id="dia-seg" title="Dia seguinte" aria-label="Dia seguinte" disabled>&#10095;</button>
                <button type="button" class="btn-nav" id="dia-ultimo" title="Voltar ao último dia" hidden>Mais recente</button>
            </span>
            <span class="vista-grupo">
                <label class="ctrl-label" for="sel-comp">Comparar com</label>
                <select id="sel-comp">{opcoes_comp}</select>
                <input type="date" id="sel-comp-data" aria-label="Data de comparação" hidden>
            </span>
        </div>
        <div class="vista-nota" id="vista-nota" role="note" hidden></div>
        <p class="resumo-topo" id="resumo-frase">{frase}</p>
        <div class="kpis" id="resumo-kpis">{kpis}</div>
    </section>

    {agora_html}<section class="grafico-box" id="bloco-evol">
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
        <p class="grafico-intro">{intro_bacia}</p>
        {f'<ul class="lista-bacia">{bacia_html}</ul>' if irmas else ''}
        <p class="nota-bloco"><a id="link-bacia" href="/albufeiras?albufeira=bacia-{esc(a['bacia'])}">Ver a bacia na página das albufeiras</a> · <a id="link-outras" href="/albufeiras?albufeira={col}">ver {esc(o_)} ao lado das outras</a></p>
    </section>

    {f"""<section class="grafico-box" id="bloco-mapa">
        <h2>📍 Onde fica</h2>
        <div class="onde-fica{' com-foto' if foto_html else ''}">
            <div>
                <div id="mapa-alb" role="region" aria-label="Mapa com a localização da barragem"></div>
                <p class="nota-bloco">A barragem: {str(a['lat']).replace('.', ',')}, {str(a['lon']).replace('.', ',')} (SNIRH; CNPGB nas que lá não estão). Fundo: Natural Earth e <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© colaboradores do OpenStreetMap</a> (licença ODbL).</p>
            </div>
            {foto_html}
        </div>
    </section>""" if a['lat'] else ''}

    <section class="grafico-box" id="bloco-ficha">
        <h2>🧾 Ficha técnica e limitações</h2>
        <table class="tabela-alb tabela-ficha"><tbody>
            <tr><th scope="row" class="esq">Bacia</th><td class="esq">{esc(a['bacia'])}</td></tr>
            <tr><th scope="row" class="esq">Capacidade total</th><td class="esq">{txt_cap}</td></tr>
            <tr><th scope="row" class="esq">Código SNIRH</th><td class="esq">{esc(a['codigo_snirh'])}</td></tr>
{linhas_ficha(ficha)}            <tr><th scope="row" class="esq">Série</th><td class="esq">{"semanal (à segunda-feira)" if semanal else "diária"}, desde {fmt_data(date.fromisoformat(a['inicio_serie']))}</td></tr>
            <tr><th scope="row" class="esq">Fonte</th><td class="esq">SNIRH (Agência Portuguesa do Ambiente), dados de base: {"o volume de cada segunda-feira" if semanal else "o volume no fim de cada dia"}{fonte_ficha}</td></tr>
            <tr><th scope="row" class="esq">Atualização</th><td class="esq">{"Todos os dias; o SNIRH publica um valor por semana" if semanal else "Todos os dias; o SNIRH publica o valor de cada dia na manhã seguinte"}</td></tr>
            <tr><th scope="row" class="esq">Limitações</th><td class="esq"><ul class="lista-limites">{limites_html}</ul></td></tr>
        </tbody></table>
        <p class="nota-bloco"><a href="/albufeiras#bloco-fontes">As fontes e as limitações de todos os números</a>{' · a fotografia tem a sua própria licença, indicada por baixo dela' if foto_html else ''}.</p>
    </section>

    <div class="cta-simulador">
        <h2>E as outras albufeiras?</h2>
        <p>As 57 albufeiras com uso para energia e as 29 sem central que o site acompanha, no mapa e numa tabela, por bacia, com a energia guardada em Portugal e em Espanha.</p>
        <div class="botoes"><a href="/albufeiras" class="button-link">Todas as albufeiras</a></div>
    </div>

    <h2 id="faq" class="faq-titulo">❔ Perguntas Frequentes</h2>
    <div class="faq-lista">
{faq_html}    </div>
</main>

<div id="footer-placeholder"></div>

<script type="application/json" id="dados-albufeira">{json.dumps(dados, ensure_ascii=False, separators=(",", ":"))}</script>
<script src="/dados.js"></script>
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


def ler_fotos():
    if not os.path.exists(FOTOS_CSV):
        return {}
    with open(FOTOS_CSV, encoding='utf-8-sig', newline='') as f:
        return {r['coluna']: r for r in csv.DictReader(f)}


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
    agora = ler_agora(args.dados)
    fichas = ler_fichas(args.dados)
    C = Contas(d0, n)
    ULT = n - 1
    cab = cabeca_do_modelo(args.modelo, args.sem_ga)
    pasta = os.path.join(args.saida, args.base.strip('/'))
    os.makedirs(pasta, exist_ok=True)
    # O ?v= do CSS e do JS muda quando eles mudam (a cache do browser e do service worker)
    cab['versao'] = hashlib.sha1(b''.join(open(os.path.join(pasta, f), 'rb').read() if os.path.exists(os.path.join(pasta, f)) else b''
                                          for f in (CSS_PAGINA, JS_PAGINA))).hexdigest()[:8]
    artigos = ler_artigos()
    fotos = ler_fotos()
    so = set(filter(None, args.so.split(',')))
    feitas, mudadas = [], 0
    for a in todas:
        if so and a['coluna'] not in so:
            continue
        if a['coluna'] not in artigos:
            print(f'  aviso: {a["coluna"]} sem linha em {os.path.basename(ARTIGOS_CSV)} (fica «albufeira de {a["nome"]}»)')
        h = pagina(a, todas, centrais, artigos, fotos, C, ULT, cab, args.base, agora, fichas)
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
