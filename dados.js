/* =====================================================================
 * dados.js — Acesso unificado aos ficheiros de dados (data/) com fallback.
 *
 * Em produção (www.tiagofelicia.pt):
 *   1.º /data/ (same-origin: Fastly CDN, brotli, sem ligação extra)
 *   2.º GitHub raw (escapa a deploys atrasados do Pages ou quota)
 * Em dev (localhost / file://):
 *   1.º GitHub raw (dados sempre frescos, sem precisar de git pull)
 *   2.º /data/ (cópia local)
 *
 * Overrides de debug via query string:
 *   ?source=local → lê APENAS de /data/ (sem fallback — não mascara faltas)
 *   ?source=raw   → lê APENAS do GitHub raw
 *
 * Uso:
 *   fetchDados('omie_dados_atuais.csv')                  → Promise<Response>
 *   fetchDados('mapa_precos_qh/2026-06.json')
 *   fetchDados('precos-horarios.csv?cache_bust=123', { cache: 'no-store' })
 *
 * Nota: devolve a última Response mesmo com !ok (se todas as origens
 * falharem), para que o tratamento de erros de cada página continue a
 * funcionar como com fetch() direto.
 *
 * Incluir ANTES dos scripts da página: <script src="/dados.js"></script>
 * ===================================================================== */

(function () {
    'use strict';

    var BASE_LOCAL = '/data/';
    var BASE_RAW = 'https://raw.githubusercontent.com/tiagofelicia/tiagofelicia.github.io/main/data/';

    function ordemBases() {
        var p = new URLSearchParams(window.location.search);
        if (p.get('source') === 'local') return [BASE_LOCAL];
        if (p.get('source') === 'raw') return [BASE_RAW];

        var isDev = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1' ||
                    window.location.protocol === 'file:';
        return isDev ? [BASE_RAW, BASE_LOCAL] : [BASE_LOCAL, BASE_RAW];
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
