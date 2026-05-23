// =============================================
// DARK MODE — Script partilhado (theme.js)
// =============================================
// Incluir em todas as páginas ANTES de outros scripts.
// Requer um <button class="dark-mode-toggle" id="btn-dark-mode">🌙</button> no HTML.
//
// 3 estados: 'auto' (segue o SO), 'light', 'dark'.
// Ciclo do botão: auto → light → dark → auto
//
// Chave canónica: localStorage('theme_site')
//   - Aceita: 'auto' | 'light' | 'dark' | null (legado, equivalente a 'auto').
// Chaves legadas (sincronizadas, só aceitam 'light'/'dark'):
//   'tf_theme', 'tf_autoconsumo_theme' (usadas internamente pelos simuladores
//   que mantêm o seu próprio toggle binário). Recebem sempre o tema *efetivo*.

(function () {
    var THEME_KEY = 'theme_site';
    var LEGACY_KEYS = ['tf_autoconsumo_theme', 'tf_theme'];
    // Ordem do ciclo do toggle global
    var CYCLE = ['auto', 'light', 'dark'];
    // Ícones por estado (emojis — só aplicados se o botão NÃO tiver <i> de Font Awesome)
    var ICONS = { auto: '🌓', light: '☀️', dark: '🌙' };
    // Tooltips por estado (descrevem o estado ATUAL + próxima ação)
    var TITLES = {
        auto:  'Tema: Automático (segue o sistema). Clique para Claro.',
        light: 'Tema: Claro. Clique para Escuro.',
        dark:  'Tema: Escuro. Clique para Automático.'
    };

    function _safeGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
    function _safeSet(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* Safari modo privado */ } }
    function _safeDel(k)   { try { localStorage.removeItem(k); } catch (_) { } }

    function _osPrefersDark() {
        return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }

    // Lê a preferência guardada ('auto' | 'light' | 'dark'); migra chaves legadas se necessário.
    function _readPreference() {
        var v = _safeGet(THEME_KEY);
        if (v === 'auto' || v === 'light' || v === 'dark') return v;
        // Migrar valor legado (só pode ser 'light' ou 'dark')
        for (var i = 0; i < LEGACY_KEYS.length; i++) {
            var lv = _safeGet(LEGACY_KEYS[i]);
            if (lv === 'dark' || lv === 'light') {
                _safeSet(THEME_KEY, lv); // promove para chave canónica
                return lv;
            }
        }
        return 'auto'; // default
    }

    // Converte preferência em tema efetivo ('light' ou 'dark').
    function _resolve(preference) {
        if (preference === 'dark') return 'dark';
        if (preference === 'light') return 'light';
        return _osPrefersDark() ? 'dark' : 'light'; // 'auto'
    }

    // Escreve a preferência canónica + sincroniza chaves legadas com o tema EFETIVO
    // (não com 'auto', porque os simuladores legados não sabem interpretar 'auto').
    function _writePreference(preference, effective) {
        _safeSet(THEME_KEY, preference);
        for (var i = 0; i < LEGACY_KEYS.length; i++) {
            if (_safeGet(LEGACY_KEYS[i]) !== null) {
                _safeSet(LEGACY_KEYS[i], effective);
            }
        }
    }

    function _applyTheme(effective) {
        if (effective === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }

    function _syncBtnUI(preference, effective) {
        var btn = document.getElementById('btn-dark-mode');
        if (!btn) return;
        // Se o botão tem filhos <i> (Font Awesome), não tocar no texto — o simulador gere o ícone
        if (!btn.querySelector('i')) {
            btn.textContent = ICONS[preference] || ICONS.auto;
        }
        var title = TITLES[preference] || TITLES.auto;
        btn.setAttribute('title', title);
        btn.setAttribute('aria-label', title);
    }

    // Estado interno em memória (evita re-ler localStorage a toda a hora)
    var _currentPreference = _readPreference();
    var _currentEffective = _resolve(_currentPreference);

    // ── Inicialização imediata (antes de DOM pronto — evita flash) ──
    _applyTheme(_currentEffective);

    function toggleDarkMode() {
        // Avança no ciclo
        var idx = CYCLE.indexOf(_currentPreference);
        if (idx < 0) idx = 0;
        var nextPreference = CYCLE[(idx + 1) % CYCLE.length];
        var nextEffective = _resolve(nextPreference);

        _currentPreference = nextPreference;
        _currentEffective = nextEffective;

        _applyTheme(nextEffective);
        _syncBtnUI(nextPreference, nextEffective);
        _writePreference(nextPreference, nextEffective);
        document.dispatchEvent(new Event('themeChanged'));
    }
    // Exposto globalmente (atributo onclick="toggleDarkMode()" nos botões)
    window.toggleDarkMode = toggleDarkMode;

    // Permite que componentes (script.js, menu.js) ressincronizem o ícone após injeção dinâmica.
    window.refreshDarkModeIcon = function () { _syncBtnUI(_currentPreference, _currentEffective); };

    // Quando o menu é injetado, garante que o ícone e o title refletem o estado atual.
    document.addEventListener('menuLoaded', function () { _syncBtnUI(_currentPreference, _currentEffective); });

    // Sincronizar UI quando o DOM estiver pronto.
    document.addEventListener('DOMContentLoaded', function () {
        _syncBtnUI(_currentPreference, _currentEffective);
    });

    // ── Reagir a mudanças do SO ──
    // Em modo 'auto', segue dinamicamente. Nos modos manuais ('light'/'dark') ignora.
    if (window.matchMedia) {
        var mq = window.matchMedia('(prefers-color-scheme: dark)');
        var mqHandler = function (e) {
            if (_currentPreference !== 'auto') return;
            var newEffective = e.matches ? 'dark' : 'light';
            if (newEffective === _currentEffective) return;
            _currentEffective = newEffective;
            _applyTheme(newEffective);
            // Atualizar chaves legadas com o novo tema efetivo (não 'auto')
            for (var i = 0; i < LEGACY_KEYS.length; i++) {
                if (_safeGet(LEGACY_KEYS[i]) !== null) {
                    _safeSet(LEGACY_KEYS[i], newEffective);
                }
            }
            _syncBtnUI(_currentPreference, _currentEffective);
            document.dispatchEvent(new Event('themeChanged'));
        };
        if (mq.addEventListener) mq.addEventListener('change', mqHandler);
        else if (mq.addListener) mq.addListener(mqHandler); // Safari antigo
    }

    // ── Sincronizar entre separadores/janelas ──
    // Se outro separador alterar a preferência, refletir aqui.
    window.addEventListener('storage', function (e) {
        if (!e.key) return;
        if (e.key === THEME_KEY) {
            var newPref = e.newValue;
            if (newPref !== 'auto' && newPref !== 'light' && newPref !== 'dark') return;
            _currentPreference = newPref;
            _currentEffective = _resolve(newPref);
            _applyTheme(_currentEffective);
            _syncBtnUI(_currentPreference, _currentEffective);
            document.dispatchEvent(new Event('themeChanged'));
        } else if (LEGACY_KEYS.indexOf(e.key) !== -1) {
            // Um simulador (binário) alterou a chave legada → adotar como preferência manual.
            var lv = e.newValue;
            if (lv !== 'light' && lv !== 'dark') return;
            _currentPreference = lv;
            _currentEffective = lv;
            _safeSet(THEME_KEY, lv);
            _applyTheme(_currentEffective);
            _syncBtnUI(_currentPreference, _currentEffective);
            document.dispatchEvent(new Event('themeChanged'));
        }
    });
})();
