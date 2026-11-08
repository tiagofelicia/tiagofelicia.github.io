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
    function renderEvol() {
        if (typeof Highcharts === 'undefined') return;
        const c = _hcDark(), hidro = ANO === 'hidro';
        const dU = new Date(T0 + ULT * DIA_MS);
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
                     tickInterval: 30 * DIA_MS, labels: { format: '{value:%b}', style: { color: c.txt } }, lineColor: c.grelha, tickColor: c.grelha, crosshair: true },
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

    document.addEventListener('themeChanged', () => { renderEvol(); if (MAPA) desenharMapa(); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderEvol); else renderEvol();
})();
