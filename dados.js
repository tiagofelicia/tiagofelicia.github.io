/* =====================================================================
 * dados.js — Acesso unificado aos dados (repo dados-energia) com fallback.
 *
 * Os dados vivem no repositório dedicado github.com/tiagofelicia/dados-energia,
 * servido pelo GitHub Pages com domínio próprio: https://dados.tiagofelicia.pt
 * (o caminho antigo www.tiagofelicia.pt/dados-energia/ faz 301 para lá).
 * O Pages envia Access-Control-Allow-Origin: * — o cross-origin funciona;
 * a CSP das páginas inclui https://dados.tiagofelicia.pt em connect-src.
 *
 * Em produção (www.tiagofelicia.pt):
 *   1.º https://dados.tiagofelicia.pt/data/ (CDN Fastly, brotli)
 *   2.º GitHub raw (escapa a deploys atrasados do Pages ou quota)
 * Em dev (localhost / file://):
 *   1.º GitHub raw (dados sempre frescos, sem esperar pelo deploy do Pages)
 *   2.º dados.tiagofelicia.pt (CORS * permite-o de qualquer origem)
 *
 * Overrides de debug via query string:
 *   ?source=dados (ou local) → lê APENAS de dados.tiagofelicia.pt
 *   ?source=raw              → lê APENAS do GitHub raw
 *
 * Uso (caminhos relativos a data/ do repo dados-energia):
 *   fetchDados('omie/omie_dados_atuais.csv')             → Promise<Response>
 *   fetchDados('mapas/precos_qh/2026-06.json')
 *   fetchDados('omie/precos-horarios.csv?cache_bust=123', { cache: 'no-store' })
 *
 * Nota: devolve a última Response mesmo com !ok (se todas as origens
 * falharem), para que o tratamento de erros de cada página continue a
 * funcionar como com fetch() direto.
 *
 * Incluir ANTES dos scripts da página: <script src="/dados.js"></script>
 * ===================================================================== */

(function () {
    'use strict';

    var BASE_DADOS = 'https://dados.tiagofelicia.pt/data/';
    var BASE_RAW = 'https://raw.githubusercontent.com/tiagofelicia/dados-energia/main/data/';

    function ordemBases() {
        var p = new URLSearchParams(window.location.search);
        var source = p.get('source');
        if (source === 'dados' || source === 'local') return [BASE_DADOS];
        if (source === 'raw') return [BASE_RAW];

        var isDev = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1' ||
                    window.location.protocol === 'file:';
        return isDev ? [BASE_RAW, BASE_DADOS] : [BASE_DADOS, BASE_RAW];
    }

    /**
     * fetch de um ficheiro de data/ com fallback de origem.
     * @param {string} caminho — relativo a data/ (pode incluir query string)
     * @param {RequestInit} [init] — opções passadas a fetch()
     * @returns {Promise<Response>}
     */
    window.fetchDados = function (caminho, init) {
        var bases = ordemBases();

        function tentar(i) {
            return fetch(bases[i] + caminho, init).then(
                function (resposta) {
                    if (!resposta.ok && i + 1 < bases.length) return tentar(i + 1);
                    return resposta;
                },
                function (erro) {
                    if (i + 1 < bases.length) return tentar(i + 1);
                    throw erro;
                }
            );
        }

        return tentar(0);
    };
})();
