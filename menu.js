/* ============================================= */
/* menu.js — JavaScript do Menu Responsivo        */
/* Inicializa automaticamente quando o HTML do    */
/* menu é detetado na página (via fetch/innerHTML) */
/* ============================================= */

(function() {
    function initMenu() {
        var hamburger = document.getElementById('hamburger');
        var drawer = document.getElementById('mobileDrawer');
        var overlay = document.getElementById('navOverlay');
        var closeBtn = document.getElementById('drawerClose');
        var drawerBody = document.getElementById('drawerBody');

        // Se os elementos ainda não existem, sai (o observer vai tentar de novo)
        if (!hamburger || !drawer || !overlay || !closeBtn || !drawerBody) return false;

        var currentView = 'main';

        function openDrawer() {
            drawer.classList.add('active');
            overlay.classList.add('active');
            hamburger.classList.add('active');
            hamburger.setAttribute('aria-expanded', 'true');
            document.body.style.overflow = 'hidden';
        }

        function closeDrawer() {
            drawer.classList.remove('active');
            overlay.classList.remove('active');
            hamburger.classList.remove('active');
            hamburger.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
            setTimeout(function() { navigateTo('main'); }, 350);
        }

        function navigateTo(viewName) {
            var allViews = drawerBody.querySelectorAll('.drawer-view');
            var targetView = drawerBody.querySelector('[data-view="' + viewName + '"]');
            if (!targetView) return;

            var goingDeeper = viewName !== 'main' && (currentView === 'main' || viewName.startsWith(currentView));

            allViews.forEach(function(v) {
                if (v === targetView) {
                    v.className = 'drawer-view visible';
                } else {
                    v.className = 'drawer-view ' + (goingDeeper ? 'hidden-left' : 'hidden-right');
                }
            });

            currentView = viewName;
            requestAnimationFrame(function() { drawerBody.scrollTop = 0; });
        }

        hamburger.addEventListener('click', function() {
            drawer.classList.contains('active') ? closeDrawer() : openDrawer();
        });

        closeBtn.addEventListener('click', closeDrawer);
        overlay.addEventListener('click', closeDrawer);

        drawerBody.addEventListener('click', function(e) {
            var gotoBtn = e.target.closest('[data-goto]');
            if (gotoBtn) { navigateTo(gotoBtn.dataset.goto); return; }

            var backBtn = e.target.closest('[data-back]');
            if (backBtn) { navigateTo(backBtn.dataset.back); return; }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && drawer.classList.contains('active')) closeDrawer();
        });

        window.addEventListener('resize', function() {
            if (window.innerWidth > 768 && drawer.classList.contains('active')) closeDrawer();
        });

        return true; // Inicializado com sucesso
    }

    // Tenta inicializar imediatamente (caso o HTML já esteja na página)
    if (initMenu()) return;

    // Se não, observa o DOM à espera que o menu seja injetado via fetch/innerHTML
    var observer = new MutationObserver(function(mutations, obs) {
        if (initMenu()) {
            obs.disconnect(); // Para de observar depois de inicializar
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
