// Cores das linhas e dos rótulos dos gráficos (Highcharts e Chart.js) que ficavam com pouco contraste num dos temas.
// Cada cor fraca é trocada, quando o gráfico é criado ou atualizado, pela versão do tema em que a página está: mais
// escura no claro (amarelos, laranjas, pastéis) e mais clara no escuro (azuis, roxos e castanhos escuros). As páginas
// já redesenham os gráficos quando se troca de tema (evento themeChanged), por isso a cor certa aparece logo.
// Linhas: ≥ 3:1 contra o fundo do gráfico; textos (rótulos das linhas de referência, eixos, subtítulos): ≥ 4,5:1.
// Carregar logo a seguir à biblioteca de gráficos e antes do código da página.
(function () {
    var LINHAS = {
        light: {
            '#f59e0b': '#d97706',                       // laranja (ERC, Futuros MIBGAS)
            '#fd7e14': '#c2410c',                       // laranja da média (histograma do OMIE)
            '#b4c7e7': '#6687c4', '#d3b5e9': '#9a69c4', '#f4b183': '#d0702e',   // pastéis dos Preços Horários
            '#70ad47': '#548235', '#a9d08e': '#5e8f3c', '#8ea9db': '#5b7fc0', '#bf8f00': '#a07800',   // períodos (OMIE)
            '#9aa0a6': '#7b8289',                       // ano anterior
            '#2caffe': '#0284c7', '#00e272': '#009a4e', '#fe6a35': '#e2541c',   // paleta por omissão do Highcharts
            '#1baf7a': '#13895f', '#eda100': '#b07a00', '#e87ba4': '#d0477f',   // agentes (Quotas)
            '#0ea5e9': '#0284c7'
        },
        dark: {
            '#2563eb': '#60a5fa', '#1d4ed8': '#60a5fa',
            '#6f42c1': '#a78bfa', '#806000': '#d4a72c', '#843c0c': '#e0855a', '#9c27b0': '#d17ae0',
            '#544fc5': '#8f8bf0', '#008300': '#4ade80', '#15803d': '#4ade80',
            '#111': '#e2e8f0', '#111111': '#e2e8f0', '#475569': '#cbd5e1', '#9333ea': '#c084fc'
        }
    };
    var TEXTO = {
        light: {
            '#007bff': '#0066cc', '#28a745': '#15803d', '#16a34a': '#15803d', 'red': '#dc2626', '#ff0000': '#dc2626',
            '#fd7e14': '#c2410c', '#d98a00': '#b45309',
            '#888': '#666666', '#888888': '#666666', '#999': '#666666', '#999999': '#666666'
        },
        dark: {
            '#007bff': '#60a5fa', '#2563eb': '#60a5fa', '#1d4ed8': '#60a5fa',
            'red': '#f87171', '#ff0000': '#f87171', '#dc3545': '#f87171',
            '#16a34a': '#4ade80', '#15803d': '#4ade80',
            '#888': '#94a3b8', '#888888': '#94a3b8'
        }
    };

    function tema() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
    function mapear(mapa, c) {
        if (typeof c !== 'string') return c;
        return mapa[tema()][c.trim().toLowerCase()] || c;
    }

    // Troca obj[prop] guardando a cor original (propriedade escondida, que o merge do Highcharts não copia): os
    // objetos de opções são muitas vezes reutilizados ao redesenhar noutro tema, e a troca tem de partir sempre
    // da cor original. Se a página puser outra cor entretanto, essa passa a ser a original.
    function trocar(obj, prop, mapa) {
        if (!obj || typeof obj[prop] !== 'string') return;
        var k = '__corSite_' + prop, g = obj[k];
        if (!g || obj[prop] !== g.posta) {
            g = { original: obj[prop], posta: null };
            try { Object.defineProperty(obj, k, { value: g, writable: true, configurable: true, enumerable: false }); } catch (e) { return; }
        }
        g.posta = mapear(mapa, g.original);
        obj[prop] = g.posta;
    }
    function estilo(o) { if (o && o.style) trocar(o.style, 'color', TEXTO); }

    window.corGraficoSite = { linha: function (c) { return mapear(LINHAS, c); }, texto: function (c) { return mapear(TEXTO, c); } };

    var H = window.Highcharts;
    if (H && H.wrap) {
        // Séries de linhas: a cor da opção ou da paleta (o getColor corre em cada criação e em cada update)
        H.wrap(H.Series.prototype, 'getColor', function (proceed) {
            proceed.apply(this, Array.prototype.slice.call(arguments, 1));
            if (/^(line|spline)$/.test(this.type) && typeof this.color === 'string') this.color = mapear(LINHAS, this.color);
        });
        // Linhas e bandas de referência (as das opções e as acrescentadas depois com addPlotLine/addPlotBand)
        H.wrap(H.Axis.prototype, 'addPlotBandOrLine', function (proceed, options, coll) {
            if (options) {
                if (coll === 'plotLines' || (coll !== 'plotBands' && options.value !== undefined)) trocar(options, 'color', LINHAS);
                if (options.label) estilo(options.label);
            }
            return proceed.apply(this, Array.prototype.slice.call(arguments, 1));
        });
        // Títulos, subtítulos e eixos
        H.addEvent(H.Chart, 'init', function (e) {
            var o = e && e.args && e.args[0];
            if (!o) return;
            estilo(o.title); estilo(o.subtitle);
            ['xAxis', 'yAxis'].forEach(function (a) {
                [].concat(o[a] || []).forEach(function (ax) { if (ax) { estilo(ax.title); estilo(ax.labels); } });
            });
        });
    }

    var C = window.Chart;
    if (C && C.register) {
        var aplicar = function (chart) {
            var cfg = chart.config, opt = cfg.options || {};
            (chart.data.datasets || []).forEach(function (ds) {
                if ((ds.type || cfg.type) !== 'line') return;
                trocar(ds, 'borderColor', LINHAS);
                trocar(ds, 'pointBackgroundColor', LINHAS);
            });
            var sc = opt.scales || {};
            Object.keys(sc).forEach(function (id) {
                var s = sc[id]; if (!s) return;
                if (s.ticks) trocar(s.ticks, 'color', TEXTO);
                if (s.title) trocar(s.title, 'color', TEXTO);
            });
        };
        C.register({ id: 'coresSite', beforeInit: aplicar, beforeUpdate: aplicar });
    }
})();
