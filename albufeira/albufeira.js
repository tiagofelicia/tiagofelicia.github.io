// Páginas de cada albufeira (/albufeira/<nome>): o gráfico «Ao longo do ano» e o mapa, a partir da série que a
// página traz em #dados-albufeira ({ nome, ref, refMax, inicio, ult, lat, lon, v: um valor por dia, null sem valor }).
// O texto e os números já vêm no HTML (scripts/gerar_paginas_albufeiras.py); aqui só se desenha. As contas são as
// da albufeiras.html.
(function () {
    'use strict';
    const el = document.getElementById('dados-albufeira');
    if (!el) return;
    const A = JSON.parse(el.textContent);
    const DIA_MS = 86400000, ANO_COMP = 2011, ARRASTO = 31;
    const tsDia = iso => { const [a, m, d] = iso.split('-').map(Number); return Date.UTC(a, m - 1, d); };
    const T0 = tsDia(A.inicio), N = A.v.length, ULT = N - 1;
    const idxDe = iso => Math.round((tsDia(iso) - T0) / DIA_MS);
    const _nf0 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 });
    const _nf1 = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const fmtPct = v => _nf1.format(v) + '%';
    const fmtHm3 = v => (Math.abs(v) >= 100 ? _nf0.format(v) : _nf1.format(v)) + ' hm³';
    const isoDe = i => new Date(T0 + i * DIA_MS).toISOString().slice(0, 10);
    const fmtData = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);

    // O valor arrastado até 31 dias (como o CHEIO da página geral)
    const CHEIO = new Float64Array(N).fill(NaN);
    { let ult = -Infinity, v = NaN;
      for (let i = 0; i < N; i++) { if (A.v[i] !== null) { ult = i; v = A.v[i]; } if (i - ult <= ARRASTO) CHEIO[i] = v; } }

    function _hcDark() {
        const dk = document.documentElement.getAttribute('data-theme') === 'dark';
        return { dk, bg: dk ? '#1e293b' : '#fff', txt: dk ? '#e2e8f0' : '#333', grelha: dk ? '#334155' : '#e6e6e6',
                 atual: dk ? '#60a5fa' : '#2563eb', passado: dk ? '#94a3b8' : '#64748b',
                 media: dk ? '#cbd5e1' : '#334155', faixa: dk ? 'rgba(148,163,184,0.22)' : 'rgba(100,116,139,0.16)' };
    }
    // Eixo comum a todos os anos: um ano bissexto fixo (o hidrológico começa a 1 de outubro do ano antes)
    const chaveX = (m, d, hidro) => (hidro && m >= 9) ? Date.UTC(1999, m, d) : Date.UTC(2000, m, d);
    const rotPeriodo = (p, hidro) => hidro ? `${p}/${String(p + 1).slice(2)}` : String(p);
    function seriePeriodo(p, hidro) {
        const i0 = idxDe(hidro ? `${p}-10-01` : `${p}-01-01`), i1 = idxDe(hidro ? `${p + 1}-09-30` : `${p}-12-31`);
        const out = [];
        for (let i = Math.max(0, i0); i <= Math.min(i1, ULT); i++) {
            const v = CHEIO[i];
            if (isNaN(v)) continue;
            const d = new Date(T0 + i * DIA_MS);
            out.push({ x: chaveX(d.getUTCMonth(), d.getUTCDate(), hidro), y: Math.round(v / A.ref * 1000) / 10, hm3: v });
        }
        return out;
    }
    let ANO = 'civil';
    let DIA = ULT;                  // o dia escolhido no Resumo; por omissão, o último
    function renderEvol() {
        if (typeof Highcharts === 'undefined') return;
        const c = _hcDark(), hidro = ANO === 'hidro';
        const dU = new Date(T0 + DIA * DIA_MS);
        const linhaDia = DIA === ULT ? [] : [{ value: chaveX(dU.getUTCMonth(), dU.getUTCDate(), hidro), color: c.atual, width: 1.5, dashStyle: 'Dash', zIndex: 4,
                                               label: { text: fmtData(isoDe(DIA)), rotation: 0, x: 4, y: 14, style: { color: c.txt, fontSize: '11px' } } }];
        const pAtual = hidro ? (dU.getUTCMonth() >= 9 ? dU.getUTCFullYear() : dU.getUTCFullYear() - 1) : dU.getUTCFullYear();
        const atualS = seriePeriodo(pAtual, hidro), passadoS = seriePeriodo(pAtual - 1, hidro);
        const porX = new Map(), usados = [];
        for (let p = ANO_COMP; p < pAtual; p++) {
            const s = seriePeriodo(p, hidro);
            if (s.length < 300) continue;
            usados.push(p);
            s.forEach(pt => { if (!porX.has(pt.x)) porX.set(pt.x, []); porX.get(pt.x).push(pt.y); });
        }
        const chaves = [...porX.keys()].filter(x => porX.get(x).length >= Math.max(3, usados.length * 0.6)).sort((a, b) => a - b);
        const comFaixa = usados.length >= 3;
        const faixa = comFaixa ? chaves.map(x => { const v = porX.get(x); return [x, Math.min(...v), Math.max(...v)]; }) : [];
        const media = comFaixa ? chaves.map(x => { const v = porX.get(x); return [x, Math.round(v.reduce((t, y) => t + y, 0) / v.length * 10) / 10]; }) : [];
        const rotComp = comFaixa ? `${rotPeriodo(usados[0], hidro)}–${rotPeriodo(usados[usados.length - 1], hidro)}` : '';
        const rotY = A.refMax ? '% do máximo registado' : '% da capacidade';
        Highcharts.chart('grafico-evol', {
            chart: { type: 'line', backgroundColor: c.bg, style: { fontFamily: 'inherit' }, zooming: { type: 'x' } },
            title: { text: null }, credits: { enabled: false },
            exporting: { enabled: true, filename: 'albufeira-' + A.nome.toLowerCase().replace(/\s+/g, '-') + '-' + ANO, fallbackToExportServer: false,
                         buttons: { contextButton: { menuItems: ['viewFullscreen', 'printChart', 'separator', 'downloadPNG', 'downloadSVG', 'separator', 'downloadCSV', 'downloadXLS'] } } },
            legend: { itemStyle: { color: c.txt, fontWeight: 'normal' }, itemHoverStyle: { color: c.dk ? '#fff' : '#000' } },
            xAxis: { type: 'datetime', min: hidro ? Date.UTC(1999, 9, 1) : Date.UTC(2000, 0, 1), max: hidro ? Date.UTC(2000, 8, 30) : Date.UTC(2000, 11, 31),
                     tickInterval: 30 * DIA_MS, labels: { format: '{value:%b}', style: { color: c.txt } }, lineColor: c.grelha, tickColor: c.grelha, crosshair: true, plotLines: linhaDia },
            yAxis: { title: { text: rotY, style: { color: c.txt } }, labels: { format: '{value}%', style: { color: c.txt } }, gridLineColor: c.grelha, softMax: 100 },
            tooltip: { shared: true, useHTML: true, backgroundColor: c.dk ? '#0f172a' : '#fff', style: { color: c.txt }, xDateFormat: '%e de %B',
                       pointFormatter: function () {
                           const v = this.series.type === 'arearange' ? `${fmtPct(this.low)} – ${fmtPct(this.high)}` : fmtPct(this.y) + (this.hm3 !== undefined ? ` · ${fmtHm3(this.hm3)}` : '');
                           return `<span style="color:${this.color}">●</span> ${this.series.name}: <b>${v}</b><br>`;
                       } },
            plotOptions: { series: { marker: { enabled: false }, states: { inactive: { opacity: 1 } } } },
            series: [
                { type: 'arearange', name: `Mín.–máx. ${rotComp}`, data: faixa, color: c.faixa, fillColor: c.faixa, lineWidth: 0, zIndex: 0, visible: comFaixa, showInLegend: comFaixa },
                { name: `Média ${rotComp}`, data: media, color: c.media, dashStyle: 'ShortDot', lineWidth: 1.5, zIndex: 1, visible: comFaixa, showInLegend: comFaixa },
                { name: rotPeriodo(pAtual - 1, hidro), data: passadoS, color: c.passado, dashStyle: 'ShortDash', lineWidth: 1.5, zIndex: 2 },
                { name: rotPeriodo(pAtual, hidro), data: atualS, color: c.atual, lineWidth: 2.5, zIndex: 3 }
            ]
        });
    }
    const grupo = document.getElementById('ctrl-ano');
    if (grupo) grupo.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b || b.classList.contains('active')) return;
        grupo.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
        ANO = b.dataset.v;
        renderEvol();
    });

    // Mapa: o Leaflet e o fundo (portugal_background.js, ~430 KB) só se pedem quando o bloco está quase à vista
    let MAPA = null;
    function estiloFundo(f) {
        const dk = document.documentElement.getAttribute('data-theme') === 'dark';
        const agua = dk ? '#3a78bd' : '#9ec9e8';
        const t = f.properties.t;
        if (t === 'rio') return { color: agua, weight: 1.2, opacity: 0.9, fill: false };
        if (t === 'lago') return { color: agua, weight: 0.5, fillColor: agua, fillOpacity: 1 };
        return { color: dk ? '#475569' : '#b8c0c6', weight: t === 'pt' ? 1.2 : 0.7, opacity: 1,
                 fillColor: t === 'pt' ? (dk ? '#1e293b' : '#f4f4f1') : (dk ? '#172131' : '#e7e8e3'), fillOpacity: 1 };
    }
    // O Leaflet com o mesmo SRI da albufeiras.html
    const LEAFLET = { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=' };
    const carregar = (src, integrity) => new Promise((ok, falha) => {
        const s = document.createElement('script');
        s.src = src; s.onload = ok; s.onerror = falha;
        if (integrity) { s.integrity = integrity; s.crossOrigin = ''; }
        document.head.appendChild(s);
    });
    function desenharMapa() {
        if (MAPA) { MAPA.remove(); MAPA = null; }
        const c = _hcDark();
        MAPA = L.map('mapa-alb', { zoomSnap: 0.5, scrollWheelZoom: false, attributionControl: true });
        MAPA.createPane('fundo');
        MAPA.getPane('fundo').style.zIndex = 250;
        L.geoJson(PORTUGAL_BG_GEOJSON, { pane: 'fundo', renderer: L.canvas({ pane: 'fundo', padding: 0.5 }), interactive: false, style: estiloFundo,
                                         attribution: '&copy; <a href="https://www.naturalearthdata.com/" rel="noopener">Natural Earth</a> · &copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener">colaboradores do OpenStreetMap</a>' }).addTo(MAPA);
        L.circleMarker([A.lat, A.lon], { radius: 9, color: c.dk ? '#e2e8f0' : '#1e293b', weight: 2, fillColor: c.atual, fillOpacity: 0.9 })
            .bindTooltip(A.nome, { permanent: true, direction: 'top', offset: [0, -8] }).addTo(MAPA);
        MAPA.setView([A.lat, A.lon], 9);
        MAPA.on('click', () => MAPA.scrollWheelZoom.enable());
        MAPA.on('mouseout', () => MAPA.scrollWheelZoom.disable());
    }
    const caixaMapa = document.getElementById('mapa-alb');
    if (caixaMapa && A.lat !== null && 'IntersectionObserver' in window) {
        const obs = new IntersectionObserver(entradas => {
            if (!entradas.some(e => e.isIntersecting)) return;
            obs.disconnect();
            const leaflet = typeof L !== 'undefined' ? Promise.resolve() : carregar(LEAFLET.src, LEAFLET.integrity);
            Promise.all([leaflet, typeof PORTUGAL_BG_GEOJSON !== 'undefined' ? null : carregar('/portugal_background.js')])
                .then(desenharMapa)
                .catch(() => { document.getElementById('bloco-mapa').hidden = true; });
        }, { rootMargin: '300px' });
        obs.observe(caixaMapa);
    }

    // ---- Outro dia no Resumo: as contas do gerador (scripts/gerar_paginas_albufeiras.py) e da albufeiras.html, a partir
    // da série da página. O HTML vem com o último dia (o que o Google lê), que se repõe tal e qual ao voltar a ele.
    const selDia = document.getElementById('sel-dia'), caixaFrase = document.getElementById('resumo-frase'),
          caixaKpis = document.getElementById('resumo-kpis');
    if (selDia && caixaFrase && caixaKpis) (function () {
        const TOL = 7, I_TOL = idxDe('2017-01-01');      // um valor com até 7 dias; até 2016, até 31 (como a página geral)
        const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        const rotRef = A.refMax ? 'do máximo registado' : 'da capacidade';
        const doNome = A.do || ('de ' + A.nome), oNome = A.o || A.nome;
        const fmt1 = v => _nf1.format(v);
        const fmtPp = v => (v > 0.05 ? '+' : v < -0.05 ? '−' : '') + fmt1(Math.abs(v)) + ' p.p.';
        const comp = (d, txt) => Math.abs(d) < 0.05 ? `igual ${txt}` : `${fmt1(Math.abs(d))} p.p. ${d > 0 ? 'acima' : 'abaixo'} ${txt}`;
        const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' })[ch]);
        const card = (rot, val, sub) => `<div class="kpi-card"><div class="kpi-label">${rot}</div><div class="kpi-value">${val}</div><div class="kpi-sub">${sub}</div></div>`;
        const pctDe = v => v / A.ref * 100;
        const diaMes = iso => +iso.slice(8, 10) + ' de ' + MESES[+iso.slice(5, 7) - 1];
        const ddmm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);
        const mesmoDia = (y, iso) => `${y}-${iso.slice(5, 7)}-${iso.slice(5) === '02-29' ? '28' : iso.slice(8, 10)}`;
        const isoValido = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && isoDe(idxDe(s)) === s && idxDe(s) >= 0 && idxDe(s) <= ULT;
        // O valor do dia i ou o último dos dias anteriores (null sem nenhum)
        function valor(i) {
            if (i < 0) return null;
            const t = i < I_TOL ? ARRASTO : TOL;
            for (let j = Math.min(i, ULT); j >= Math.max(0, i - t); j--) if (A.v[j] !== null) return [A.v[j], j];
            return null;
        }
        const menosUmAno = i => { const iso = isoDe(i); return idxDe(mesmoDia(+iso.slice(0, 4) - 1, iso)); };
        function menosUmMes(i) {
            const iso = isoDe(i), y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
            const y2 = m === 1 ? y - 1 : y, m2 = m === 1 ? 12 : m - 1, fim = new Date(Date.UTC(y2, m2, 0)).getUTCDate();
            return idxDe(`${y2}-${String(m2).padStart(2, '0')}-${String(Math.min(d, fim)).padStart(2, '0')}`);
        }
        // O mesmo dia do calendário nos anos completos desde 2011, antes do ano do dia (pelo menos 3 anos)
        function historico(i) {
            const iso = isoDe(i), anos = [];
            for (let y = ANO_COMP; y < +iso.slice(0, 4); y++) {
                const j = idxDe(mesmoDia(y, iso));
                if (j >= 0 && j <= ULT && !isNaN(CHEIO[j])) anos.push([y, pctDe(CHEIO[j])]);
            }
            if (anos.length < 3) return null;
            let mn = anos[0], mx = anos[0];
            anos.forEach(x => { if (x[1] < mn[1]) mn = x; if (x[1] > mx[1]) mx = x; });
            return { media: anos.reduce((t, x) => t + x[1], 0) / anos.length, anos, min: mn, max: mx, de: anos[0][0], ate: anos[anos.length - 1][0] };
        }

        // «Comparar com»: o dia da comparação, a partir do dia do valor (-1 se não for anterior ou cair antes da série)
        let MODO = 'semana', COMP_DATA = null;
        const ROT = { semana: '📅 Numa semana', mes: '📅 Num mês', hidro: '📅 Desde o início do ano hidrológico', jan: '📅 Desde o início do ano', ano: '📅 Num ano' };
        const rotCard = () => MODO === 'data' ? `📅 Desde ${fmtData(COMP_DATA)}` : ROT[MODO];
        function idxComp(iv) {
            const iso = isoDe(iv), y = +iso.slice(0, 4), m = +iso.slice(5, 7);
            const c = MODO === 'mes' ? menosUmMes(iv) : MODO === 'hidro' ? idxDe(`${m >= 10 ? y : y - 1}-09-30`)
                    : MODO === 'jan' ? idxDe(`${y - 1}-12-31`) : MODO === 'ano' ? menosUmAno(iv)
                    : MODO === 'data' ? idxDe(COMP_DATA) : iv - 7;
            return c < 0 || c >= iv ? -1 : c;
        }

        const FRASE0 = caixaFrase.innerHTML, KPIS0 = caixaKpis.innerHTML, nota = document.getElementById('vista-nota');
        function renderResumo() {
            const notas = [];
            let antigos = DIA < I_TOL;        // algum valor de antes de 2017 (até 31 dias antes)
            if (DIA === ULT && MODO === 'semana') { caixaFrase.innerHTML = FRASE0; caixaKpis.innerHTML = KPIS0; }
            else {
                const r = valor(DIA);
                if (!r) {
                    caixaFrase.innerHTML = `Não há nenhum valor publicado nos ${DIA < I_TOL ? ARRASTO : TOL} dias até ${fmtData(isoDe(DIA))}.`;
                    caixaKpis.innerHTML = card('💧 Água guardada', '--', '') + card(rotCard(), '--', '') + card('↩️ Há um ano', '--', '') + card('📊 Média', '--', '');
                } else {
                    const [v, iv] = r, pct = pctDe(v), dv = isoDe(iv), ano = valor(menosUmAno(iv)), hist = historico(iv);
                    const ic = idxComp(iv), cmp = ic < 0 ? null : valor(ic);
                    if (menosUmAno(iv) < I_TOL || (ic >= 0 && ic < I_TOL)) antigos = true;
                    const partes = [];
                    if (ano) partes.push(comp(pct - pctDe(ano[0]), `do mesmo dia de ${+dv.slice(0, 4) - 1}`));
                    if (hist) partes.push(comp(pct - hist.media, `da média de ${hist.de} a ${hist.ate} para este dia`));
                    let frase = `A ${fmtData(dv)}, a albufeira ${esc(doNome)} tinha <strong>${fmtHm3(v)}</strong> de água, <strong>${fmtPct(pct)}</strong> ${rotRef}`
                        + (partes.length ? ': ' + partes.join(' e ') : '') + '.';
                    if (hist) {
                        const acima = hist.anos.filter(x => x[1] > pct).map(x => x[0]);
                        if (!acima.length) frase += ` Nenhum ano de ${hist.de} a ${hist.ate} tinha tanta água a ${diaMes(dv)}.`;
                        else if (acima.length <= 4) frase += ` De ${hist.de} a ${hist.ate}, só em ${acima.length === 1 ? acima[0] : acima.slice(0, -1).join(', ') + ' e ' + acima[acima.length - 1]} tinha mais água a ${diaMes(dv)}.`;
                        else frase += ` De ${hist.de} a ${hist.ate}, em ${acima.length} dos ${hist.anos.length} anos tinha mais água a ${diaMes(dv)}.`;
                    }
                    caixaFrase.innerHTML = frase;
                    const dif = cmp ? v - cmp[0] : 0;
                    caixaKpis.innerHTML = card('💧 Água guardada', fmtHm3(v), `${fmtPct(pct)} ${rotRef}`)
                        + card(rotCard(), cmp ? fmtPp(pct - pctDe(cmp[0])) : '--',
                               cmp ? (dif > 0.5 ? '+' : dif < -0.5 ? '−' : '') + fmtHm3(Math.abs(dif)) + ` desde ${fmtData(isoDe(cmp[1]))}` : '')
                        + card('↩️ Há um ano', ano ? fmtPct(pctDe(ano[0])) : '--', ano ? `${fmtHm3(ano[0])} a ${fmtData(isoDe(ano[1]))}` : '')
                        + card(hist ? `📊 Média ${hist.de}–${hist.ate} para ${ddmm(dv)}` : '📊 Média', hist ? fmtPct(hist.media) : '--',
                               hist ? `mín. ${fmtPct(hist.min[1])} (${hist.min[0]}) · máx. ${fmtPct(hist.max[1])} (${hist.max[0]})` : '');
                    if (iv !== DIA) notas.push(`Sem valor a ${fmtData(isoDe(DIA))}: conta o último antes, de ${fmtData(dv)}.`);
                    if (ic < 0) notas.push(MODO === 'data' && idxDe(COMP_DATA) >= iv ? 'A data de comparação tem de ser anterior à do dia escolhido.'
                                                                                      : `A data de comparação fica antes de ${fmtData(A.inicio)}, o primeiro dia com dados.`);
                    else if (!cmp) notas.push(`Não há valor publicado perto de ${fmtData(isoDe(ic))}, a data de comparação.`);
                    if (!hist) notas.push(+dv.slice(0, 4) < ANO_COMP + 3 ? `Antes de ${ANO_COMP + 3} ainda não há três anos completos antes do dia para a média, o mínimo e o máximo.`
                                                                         : 'A série ainda não tem três anos completos antes deste dia para a média, o mínimo e o máximo.');
                }
                if (antigos) notas.push('Até 2016, várias albufeiras só têm um valor por semana ou por mês: nessas datas, quando falta o valor do dia, conta o último dos 31 dias anteriores.');
            }
            if (nota) {
                nota.hidden = !notas.length;
                nota.innerHTML = notas.length > 1 ? '<ul>' + notas.map(p => `<li>${p}</li>`).join('') + '</ul>' : notas.join('');
            }
        }

        const bAnt = document.getElementById('dia-ant'), bSeg = document.getElementById('dia-seg'), bUlt = document.getElementById('dia-ultimo');
        const selComp = document.getElementById('sel-comp'), compData = document.getElementById('sel-comp-data');
        const links = ['link-bacia', 'link-outras'].map(id => document.getElementById(id)).filter(Boolean)
            .map(a => ({ a, href: a.getAttribute('href'), txt: a.textContent }));
        function atualizarControlos() {
            selDia.min = A.inicio; selDia.max = isoDe(ULT); selDia.value = isoDe(DIA);
            if (bAnt) bAnt.disabled = DIA <= 0;
            if (bSeg) bSeg.disabled = DIA >= ULT;
            if (bUlt) bUlt.hidden = DIA === ULT;
            if (selComp) selComp.value = MODO;
            if (compData) {
                compData.hidden = MODO !== 'data';
                if (MODO === 'data') { compData.min = A.inicio; compData.max = isoDe(Math.max(0, DIA - 1)); compData.value = COMP_DATA; }
            }
        }
        // As ligações para a página geral levam o dia escolhido
        function atualizarLinks() {
            const iso = isoDe(DIA);
            links.forEach(({ a, href, txt }) => {
                if (DIA === ULT) { a.setAttribute('href', href); a.textContent = txt; return; }
                a.setAttribute('href', href + '&data=' + iso);
                a.textContent = a.id === 'link-bacia' ? `Ver a bacia a ${fmtData(iso)} na página das albufeiras` : `ver ${oNome} ao lado das outras a ${fmtData(iso)}`;
            });
        }
        // No endereço, com os nomes da página geral: ?data=AAAA-MM-DD&comparar=… (o último dia e «uma semana» não aparecem)
        function atualizarURL() {
            const p = new URLSearchParams(location.search);
            p.delete('data'); p.delete('comparar');
            if (DIA !== ULT) p.set('data', isoDe(DIA));
            if (MODO !== 'semana') p.set('comparar', MODO === 'data' ? COMP_DATA : MODO);
            const q = p.toString();
            history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
        }
        function aplicar(mudouDia) {
            atualizarControlos(); renderResumo(); atualizarLinks(); atualizarURL();
            if (mudouDia) renderEvol();
        }
        const escolherDia = i => { i = Math.max(0, Math.min(ULT, i)); if (i !== DIA) { DIA = i; aplicar(true); } };
        if (bAnt) bAnt.addEventListener('click', () => escolherDia(DIA - 1));
        if (bSeg) bSeg.addEventListener('click', () => escolherDia(DIA + 1));
        if (bUlt) bUlt.addEventListener('click', () => escolherDia(ULT));
        selDia.addEventListener('change', () => { if (isoValido(selDia.value)) escolherDia(idxDe(selDia.value)); });
        selDia.addEventListener('blur', () => { if (selDia.value !== isoDe(DIA)) selDia.value = isoDe(DIA); });
        if (selComp) selComp.addEventListener('change', () => {
            MODO = selComp.value;
            if (MODO === 'data' && !COMP_DATA) COMP_DATA = isoDe(Math.max(0, menosUmAno(DIA)));
            aplicar(false);
        });
        if (compData) {
            compData.addEventListener('change', () => { if (isoValido(compData.value)) { COMP_DATA = compData.value; aplicar(false); } });
            compData.addEventListener('blur', () => { if (COMP_DATA && compData.value !== COMP_DATA) compData.value = COMP_DATA; });
        }

        // Um endereço com ?data= e/ou ?comparar= (por exemplo, partilhado) abre nesse dia
        const params = new URLSearchParams(location.search), pd = params.get('data'), pc = params.get('comparar');
        if (isoValido(pd)) DIA = idxDe(pd);
        if (isoValido(pc)) { MODO = 'data'; COMP_DATA = pc; }
        else if (['mes', 'hidro', 'jan', 'ano'].includes(pc)) MODO = pc;
        atualizarControlos();
        if (DIA !== ULT || MODO !== 'semana') { renderResumo(); atualizarLinks(); }
    })();

    // ---- «Agora»: os valores de hora a hora do InfoÁgua (APA), em albufeiras_agora.json (dados-energia, de hora a
    // hora). O HTML vem com os cartões do momento em que o gerador correu; aqui refazem-se com o ficheiro do momento
    // (as mesmas contas do gerador) e desenha-se o gráfico. Sem volume nas últimas 48 h, a secção esconde-se.
    const blocoAgora = document.getElementById('bloco-agora');
    let AGORA = null, VISTA_AGORA = 'caudais';
    const AGORA_MAX_H = 48;
    const tUtc = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16));
    const fmtN = (v, casas) => new Intl.NumberFormat('pt-PT', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v);
    const fmtCaudal = v => fmtN(v, Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2) + ' m³/s';
    const fmtPpAgora = v => (v > 0.05 ? '+' : v < -0.05 ? '−' : '') + _nf1.format(Math.abs(v)) + ' p.p.';
    const cardAgora = (rot, val, sub) => `<div class="kpi-card"><div class="kpi-label">${rot}</div><div class="kpi-value">${val}</div><div class="kpi-sub">${sub}</div></div>`;
    const quandoLisboa = ms => {
        const p = Object.fromEntries(new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric',
                                                                            hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ms).map(x => [x.type, x.value]));
        return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`;
    };
    function resumoAgora(linhas, agora) {
        const ultimo = k => { for (let i = linhas.length - 1; i >= 0; i--) if (linhas[i][k] !== null) return [linhas[i][0], linhas[i][k]]; return null; };
        const porHora = new Map(linhas.map(l => [l[0], l]));
        const iso = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
        const ha24 = (t, k) => { for (const dh of [24, 25, 23]) { const l = porHora.get(iso(tUtc(t) - dh * 3600000)); if (l && l[k] !== null) return l[k]; } return null; };
        const media24 = (t, k) => { const ini = tUtc(t) - 24 * 3600000, v = linhas.filter(l => l[k] !== null && tUtc(l[0]) > ini && tUtc(l[0]) <= tUtc(t)).map(l => l[k]);
                                    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
        const vol = ultimo(1);
        if (!vol || agora - tUtc(vol[0]) > AGORA_MAX_H * 3600000) return null;
        const [t, v] = vol, v24 = ha24(t, 1);
        let cartoes = cardAgora('💧 Volume armazenado', fmtPct(v), v24 !== null ? `${fmtPpAgora(v - v24)} em 24 horas` : '');
        const cota = ultimo(2);
        if (cota) {
            const c24 = ha24(cota[0], 2), d = c24 !== null ? cota[1] - c24 : null;
            cartoes += cardAgora('📏 Cota (nível da água)', fmtN(cota[1], 2) + ' m', d !== null ? (d > 0.005 ? '+' : d < -0.005 ? '−' : '') + fmtN(Math.abs(d), 2) + ' m em 24 horas' : '');
        } else cartoes += cardAgora('📏 Cota (nível da água)', '--', '');
        for (const [k, rot] of [[3, '⬇️ A entrar (caudal afluente)'], [4, '⬆️ A sair (caudal efluente)']]) {
            const u = ultimo(k);      // sem nenhum valor nas 48 h, o cartão não aparece
            if (!u) continue;
            const m = media24(u[0], k);
            cartoes += cardAgora(rot, fmtCaudal(u[1]), m !== null ? `média de 24 horas: ${fmtCaudal(m)}` : '');
        }
        return { cartoes, quando: quandoLisboa(tUtc(t)), idadeH: (agora - tUtc(t)) / 3600000 };
    }
    function desenharAgora() {
        if (!AGORA || typeof Highcharts === 'undefined' || !document.getElementById('grafico-agora')) return;
        const c = _hcDark(), sai = c.dk ? '#fb923c' : '#ea580c';
        const serie = k => AGORA.map(l => [tUtc(l[0]), l[k]]);
        const cfg = VISTA_AGORA === 'volume' ? { u: '%', casas: 1, series: [{ name: 'Volume armazenado', data: serie(1), color: c.atual }] }
                  : VISTA_AGORA === 'cota' ? { u: 'm', casas: 2, series: [{ name: 'Cota', data: serie(2), color: c.atual }] }
                  : { u: 'm³/s', casas: null, series: [{ name: 'A entrar (afluente)', data: serie(3), color: c.atual }, { name: 'A sair (efluente)', data: serie(4), color: sai }] };
        const fmtV = v => cfg.casas === null ? fmtCaudal(v) : fmtN(v, cfg.casas) + (cfg.u === '%' ? '%' : ' ' + cfg.u);
        Highcharts.chart('grafico-agora', {
            time: { timezone: 'Europe/Lisbon' },
            chart: { type: 'line', backgroundColor: c.bg, style: { fontFamily: 'inherit' }, zooming: { type: 'x' } },
            title: { text: null }, credits: { enabled: false },
            exporting: { enabled: true, filename: 'albufeira-' + A.nome.toLowerCase().replace(/\s+/g, '-') + '-48h-' + VISTA_AGORA, fallbackToExportServer: false,
                         buttons: { contextButton: { menuItems: ['viewFullscreen', 'printChart', 'separator', 'downloadPNG', 'downloadSVG', 'separator', 'downloadCSV', 'downloadXLS'] } } },
            legend: { enabled: cfg.series.length > 1, itemStyle: { color: c.txt, fontWeight: 'normal' }, itemHoverStyle: { color: c.dk ? '#fff' : '#000' } },
            xAxis: { type: 'datetime', labels: { style: { color: c.txt } }, lineColor: c.grelha, tickColor: c.grelha, crosshair: true },
            yAxis: { title: { text: cfg.u, style: { color: c.txt } }, labels: { style: { color: c.txt } }, gridLineColor: c.grelha },
            tooltip: { shared: true, useHTML: true, backgroundColor: c.dk ? '#0f172a' : '#fff', style: { color: c.txt }, xDateFormat: '%e de %B, %H:%M',
                       pointFormatter: function () { return `<span style="color:${this.color}">●</span> ${this.series.name}: <b>${fmtV(this.y)}</b><br>`; } },
            plotOptions: { series: { marker: { enabledThreshold: 30, radius: 3 }, connectNulls: false, states: { inactive: { opacity: 1 } } } },
            series: cfg.series
        });
    }
    if (blocoAgora) {
        const grupoAgora = document.getElementById('ctrl-agora');
        if (grupoAgora) grupoAgora.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b || b.classList.contains('active')) return;
            grupoAgora.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
            VISTA_AGORA = b.dataset.v;
            desenharAgora();
        });
        const pedir = c => typeof window.fetchDados === 'function' ? window.fetchDados(c, { cache: 'no-cache' })
                                                                     : fetch('https://dados.tiagofelicia.pt/data/' + c, { cache: 'no-cache' });
        pedir('producao/albufeiras_agora.json').then(r => r.ok ? r.json() : null).then(doc => {
            const linhas = doc && doc.albufeiras ? doc.albufeiras[blocoAgora.dataset.albufeira] : null;
            const r = linhas && linhas.length ? resumoAgora(linhas, Date.now()) : null;
            if (!r) { blocoAgora.hidden = true; return; }
            AGORA = linhas;
            document.getElementById('agora-kpis').innerHTML = r.cartoes;
            document.getElementById('agora-quando').textContent = r.quando;
            document.getElementById('agora-idade').textContent = r.idadeH >= 3 ? `, há ${Math.floor(r.idadeH)} horas` : '';
            desenharAgora();
        }).catch(() => { /* sem o ficheiro, ficam os cartões do HTML, sem gráfico */ });
    }

    document.addEventListener('themeChanged', () => { renderEvol(); if (MAPA) desenharMapa(); desenharAgora(); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderEvol); else renderEvol();
})();
