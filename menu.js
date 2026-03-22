/* ============================================= */
/* menu.js — JavaScript do Menu Responsivo        */
/* ============================================= */

(function() {
    function initMenu() {
        var hamburger = document.getElementById('hamburger');
        var drawer = document.getElementById('mobileDrawer');
        var overlay = document.getElementById('navOverlay');
        var closeBtn = document.getElementById('drawerClose');
        var drawerBody = document.getElementById('drawerBody');

        if (!hamburger || !drawer || !overlay || !closeBtn || !drawerBody) return false;

        /* ── MOBILE DRAWER ── */
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

        /* ── INDICADOR DE PÁGINA ATIVA ── */
        (function markActivePage() {
            var currentPage = window.location.pathname.split('/').pop() || 'index.html';
            // Também inclui hash para páginas como regulamentos.html#eletricidade
            var currentHash = window.location.hash;
            var currentFull = currentPage + currentHash;

            // Desktop: marcar link principal e item de dropdown/megamenu
            var allDesktopLinks = document.querySelectorAll('nav ul a[href], .mega-dropdown a[href]');
            allDesktopLinks.forEach(function(link) {
                var href = link.getAttribute('href');
                if (!href || href === 'javascript:void(0)') return;

                if (href === currentFull || href === currentPage) {
                    // Marca o item dentro do dropdown/megamenu
                    link.classList.add('nav-active-item');

                    // Marca o link principal (pai) na barra de navegação
                    var parentLi = link.closest('li.dropdown');
                    if (parentLi) {
                        var mainLink = parentLi.querySelector(':scope > a');
                        if (mainLink) mainLink.classList.add('nav-active');
                    }
                }
            });

            // Mobile: marcar itens no drawer
            var allMobileLinks = drawerBody.querySelectorAll('a.mobile-nav-item[href]');
            allMobileLinks.forEach(function(link) {
                var href = link.getAttribute('href');
                if (href === currentFull || href === currentPage) {
                    link.classList.add('nav-active-mobile');
                }
            });
        })();

        /* ── SUBMENUS INTELIGENTES (não saem do ecrã) ── */
        (function smartSubmenus() {
            var submenus = document.querySelectorAll('.submenu-content');
            submenus.forEach(function(sub) {
                var parent = sub.closest('.submenu');
                if (!parent) return;

                parent.addEventListener('mouseenter', function() {
                    // Reset para posição padrão (direita)
                    sub.classList.remove('flip-left');

                    // Verifica se sai do viewport
                    requestAnimationFrame(function() {
                        var rect = sub.getBoundingClientRect();
                        if (rect.right > window.innerWidth) {
                            sub.classList.add('flip-left');
                        }
                    });
                });
            });
        })();

        /* ── MEGAMENU: posicionamento inteligente ── */
        (function smartMegamenu() {
            var mega = document.querySelector('.mega-dropdown');
            if (!mega) return;
            var parentLi = mega.closest('li.dropdown');
            if (!parentLi) return;

            parentLi.addEventListener('mouseenter', function() {
                requestAnimationFrame(function() {
                    var rect = mega.getBoundingClientRect();
                    // Se sai pela direita, alinha à direita do item pai
                    if (rect.right > window.innerWidth - 10) {
                        mega.style.left = 'auto';
                        mega.style.right = '0';
                        mega.style.transform = 'translateY(0)';
                    }
                    // Se sai pela esquerda, alinha à esquerda
                    if (rect.left < 10) {
                        mega.style.left = '0';
                        mega.style.right = 'auto';
                        mega.style.transform = 'translateY(0)';
                    }
                });
            });

            parentLi.addEventListener('mouseleave', function() {
                mega.style.left = '';
                mega.style.right = '';
                mega.style.transform = '';
            });
        })();

        return true;
    }

    // Tenta inicializar imediatamente
    if (initMenu()) return;

    // Senão, observa o DOM até o menu ser injetado
    var observer = new MutationObserver(function(mutations, obs) {
        if (initMenu()) {
            obs.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
