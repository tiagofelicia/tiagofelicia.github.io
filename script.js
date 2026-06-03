// Carregamento de partials (header+menu, footer) — usados globalmente.
// O menu.html agora também inclui <header> e o botão dark-mode-toggle.

document.addEventListener('DOMContentLoaded', function () {

    // --- HEADER + MENU ---
    var menuPlaceholder = document.getElementById('menu-placeholder');
    if (menuPlaceholder) {
        fetch('menu.html')
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Erro na rede ao carregar menu: ' + response.statusText);
                }
                return response.text();
            })
            .then(function (data) {
                menuPlaceholder.innerHTML = data;

                // Carregar menu.js (lógica de hamburger, drawer, dropdowns).
                // Anteriormente era auto-injetado via <img onerror> em menu.html — substituído
                // por uma injeção explícita aqui (mais robusta sob CSP estrita).
                if (!window._menuJSLoaded) {
                    window._menuJSLoaded = true;
                    var menuJsScript = document.createElement('script');
                    menuJsScript.src = 'menu.js';
                    menuJsScript.defer = true;
                    document.body.appendChild(menuJsScript);
                }

                // Notificar componentes (theme.js, etc.) de que o menu/header foram injetados.
                document.dispatchEvent(new Event('menuLoaded'));
                if (typeof window.refreshDarkModeIcon === 'function') {
                    window.refreshDarkModeIcon();
                }
            })
            .catch(function (error) { console.error('Erro ao carregar o menu:', error); });
    }

    // --- GLOSSÁRIO (decoração global de termos técnicos) ---
    // Injetar glossario.js apenas se ainda não estiver carregado e se a página tiver <main>.
    // O próprio script respeita o toggle do utilizador (localStorage tf_glossario_decoracao).
    if (!window._glossarioJSLoaded && (document.getElementById('main-content') || document.querySelector('main'))) {
        window._glossarioJSLoaded = true;
        var glScript = document.createElement('script');
        glScript.src = '/glossario.js';
        glScript.defer = true;
        document.body.appendChild(glScript);
    }

    // --- FOOTER ---
    var footerPlaceholder = document.getElementById('footer-placeholder');
    if (footerPlaceholder) {
        fetch('footer.html')
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Erro na rede ao carregar rodapé: ' + response.statusText);
                }
                return response.text();
            })
            .then(function (data) {
                footerPlaceholder.innerHTML = data;
                document.dispatchEvent(new Event('footerLoaded'));
            })
            .catch(function (error) { console.error('Erro ao carregar o rodapé:', error); });
    }

});
