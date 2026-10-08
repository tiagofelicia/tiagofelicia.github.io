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
 *   ?source=fs               → lê APENAS de /dados-energia/data/ (caminho
 *                              same-origin). Em dev exige um servidor que
 *                              monte o repo dados-energia ao lado do site
 *                              (ver scripts/serve_dev.py). Em produção, esse
 *                              caminho faz 301 para dados.tiagofelicia.pt —
 *                              funciona, paga só o redirect.
 *
 * Uso (caminhos relativos a data/ do repo dados-energia):
 *   fetchDados('omie/omie_dados_atuais.csv')             → Promise<Response>
 *   fetchDados('mapas/precos_qh/2026-06.json')
 *   fetchDados('omie/precos-horarios.csv?cache_bust=123', { cache: 'no-store' })
 *
 * Timeout: cada tentativa tem um limite (TIMEOUT_MS) à espera da RESPOSTA
 * (headers). Se uma origem está lenta a responder (não está em baixo, só
 * lenta), aborta-se e passa-se à origem seguinte — assim o fallback dispara
 * mesmo quando o host responde devagar. O download do CORPO, depois de os
 * headers chegarem, NÃO é limitado (não aborta ficheiros grandes legítimos
 * em ligações lentas).
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
    var BASE_FS = '/dados-energia/data/';

    // Tempo máximo (ms) à espera da RESPOSTA (headers) de cada origem antes de
    // abortar e tentar a seguinte. Não limita o download do corpo.
    var TIMEOUT_MS = 8000;
    // AbortController existe em todos os browsers com fetch; o guard mantém o
    // comportamento original caso falte (browser muito antigo).
    var TEM_ABORT = (typeof AbortController !== 'undefined');

    function ordemBases() {
        var p = new URLSearchParams(window.location.search);
        var source = p.get('source');
        if (source === 'dados' || source === 'local') return [BASE_DADOS];
        if (source === 'raw') return [BASE_RAW];
        if (source === 'fs') return [BASE_FS];

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
        init = init || {};
        var callerSignal = init.signal || null;

        function tentar(i) {
            var url = bases[i] + caminho;
            var temMais = (i + 1 < bases.length);

            // Sem AbortController: fetch simples (comportamento original, sem timeout).
            if (!TEM_ABORT) {
                return fetch(url, init).then(
                    function (r) { return (!r.ok && temMais) ? tentar(i + 1) : r; },
                    function (e) { if (temMais) return tentar(i + 1); throw e; }
                );
            }

            var ctrl = new AbortController();
            var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);

            // Encadear um eventual signal do chamador ao nosso controller.
            function onCallerAbort() { ctrl.abort(); }
            if (callerSignal) {
                if (callerSignal.aborted) ctrl.abort();
                else callerSignal.addEventListener('abort', onCallerAbort);
            }
            function limpar() {
                clearTimeout(timer);
                if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
            }

            var opts = Object.assign({}, init, { signal: ctrl.signal });

            return fetch(url, opts).then(
                function (resposta) {
                    // Headers recebidos → parar o timeout (o corpo não é limitado).
                    limpar();
                    if (!resposta.ok && temMais) return tentar(i + 1);
                    return resposta;
                },
                function (erro) {
                    limpar();
                    // Cancelamento deliberado pelo chamador → não tentar outra origem.
                    if (callerSignal && callerSignal.aborted) throw erro;
                    // Timeout ou erro de rede → tentar a origem seguinte (se houver).
                    if (temMais) return tentar(i + 1);
                    throw erro;
                }
            );
        }

        return tentar(0);
    };
})();
