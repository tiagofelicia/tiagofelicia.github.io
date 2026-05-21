// =============================================
// DARK MODE — Script partilhado (theme.js)
// =============================================
// Incluir em todas as páginas ANTES de outros scripts.
// Requer um <button class="dark-mode-toggle" id="btn-dark-mode">🌙</button> no HTML.
//
// Chave canónica: localStorage('theme_site')
// Chaves legadas (com migração automática): 'tf_theme', 'tf_autoconsumo_theme'
//   - O simulador de Autoconsumo usa 'tf_autoconsumo_theme' internamente (versão minificada).
//   - A migração mantém ambas sincronizadas para que a preferência transite entre páginas.

(function () {
    var THEME_KEY = 'theme_site';
    var LEGACY_KEYS = ['tf_autoconsumo_theme', 'tf_theme'];

    function _safeGet(k) {
        try { return localStorage.getItem(k); } catch (_) { return null; }
    }
    function _safeSet(k, v) {
        try { localStorage.setItem(k, v); } catch (_) { /* Safari modo privado, etc. */ }
    }

    // Lê o tema guardado; se não existir em theme_site, migra das chaves legadas.
    function _readSavedTheme() {
        var v = _safeGet(THEME_KEY);
        if (v === 'dark' || v === 'light') return v;
        for (var i = 0; i < LEGACY_KEYS.length; i++) {
            var lv = _safeGet(LEGACY_KEYS[i]);
            if (lv === 'dark' || lv === 'light') {
                _safeSet(THEME_KEY, lv); // promove para chave canónica
                return lv;
            }
        }
        return null;
    }

    // Escreve o tema em theme_site E em todas as chaves legadas que JÁ existam
    // (para que o JS de outras páginas/sims que usem chaves legadas vejam o valor atualizado).
    function _writeSavedTheme(t) {
        _safeSet(THEME_KEY, t);
        for (var i = 0; i < LEGACY_KEYS.length; i++) {
            if (_safeGet(LEGACY_KEYS[i]) !== null) {
                _safeSet(LEGACY_KEYS[i], t);
            }
        }
    }

    // Verifica se há mudança pendente nas chaves legadas (ex.: utilizador alterou no Autoconsumo).
    // Devolve true se sincronizou alguma coisa.
    function _syncFromLegacy() {
        var canonical = _safeGet(THEME_KEY);
        for (var i = 0; i < LEGACY_KEYS.length; i++) {
            var lv = _safeGet(LEGACY_KEYS[i]);
            if ((lv === 'dark' || lv === 'light') && lv !== canonical) {
                _safeSet(THEME_KEY, lv);
                return true;
            }
        }
        return false;
    }

    function _isDark() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    // Atualizar ícone do botão (apenas se usar emojis, não FA icons)
    function _syncBtnIcon(isDark) {
        var btn = document.getElementById('btn-dark-mode');
        if (!btn) return;
        // Se o botão tem filhos <i> (Font Awesome), não mexer — o simulador gere o ícone
        if (btn.querySelector('i')) return;
        btn.textContent = isDark ? '☀️' : '🌙';
    }

    function toggleDarkMode() {
        var isDark = _isDark();
        var newTheme = isDark ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        _syncBtnIcon(newTheme === 'dark');
        _writeSavedTheme(newTheme);
        // Notificar a página para redesenhar gráficos, tabelas, etc.
        document.dispatchEvent(new Event('themeChanged'));
    }
    // Exposto globalmente para o atributo onclick="toggleDarkMode()"
    window.toggleDarkMode = toggleDarkMode;
    // Permite que componentes (script.js, menu.js) ressincronizem o ícone após injeção dinâmica.
    window.refreshDarkModeIcon = function () { _syncBtnIcon(_isDark()); };

    // Quando o menu (e portanto o botão dark-mode-toggle) é injetado dinamicamente,
    // garantir que o ícone reflete o estado atual.
    document.addEventListener('menuLoaded', function () { _syncBtnIcon(_isDark()); });

    // ── Inicialização imediata (antes do DOM estar pronto — evita flash) ──
    var saved = _readSavedTheme();
    var theme;
    if (saved) {
        theme = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        theme = 'dark';
    } else {
        theme = 'light';
    }
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Sincronizar ícone quando o DOM estiver pronto
    document.addEventListener('DOMContentLoaded', function () {
        _syncBtnIcon(_isDark());
    });

    // Reagir a mudanças do SO (se o utilizador não tiver escolhido manualmente)
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
            // Só seguir o SO se o utilizador nunca tiver definido explicitamente
            var hasUserChoice = LEGACY_KEYS.some(_safeGet) || _safeGet(THEME_KEY);
            if (!hasUserChoice) {
                var newTheme = e.matches ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', newTheme);
                _syncBtnIcon(e.matches);
                document.dispatchEvent(new Event('themeChanged'));
            }
        });
    }

    // Sincronizar entre separadores: se outro separador alterar o tema, refletir aqui.
    window.addEventListener('storage', function (e) {
        if (!e.key) return;
        if (e.key === THEME_KEY || LEGACY_KEYS.indexOf(e.key) !== -1) {
            // Re-ler a chave canónica (que pode ter sido sincronizada)
            _syncFromLegacy();
            var t = _safeGet(THEME_KEY);
            if (t === 'dark' || t === 'light') {
                document.documentElement.setAttribute('data-theme', t);
                _syncBtnIcon(t === 'dark');
                document.dispatchEvent(new Event('themeChanged'));
            }
        }
    });
})();
