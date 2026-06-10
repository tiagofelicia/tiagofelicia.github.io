/* cookie-consent.js — Banner RGPD para Google Analytics (GA4)
   Tiago Felícia | www.tiagofelicia.pt

   Uso: adicionar em cada página antes de </body>:
   <script src="cookie-consent.js"></script>

   Modelo: Google Consent Mode v2.
   O gtag.js é carregado SEMPRE no <head> de cada página, com o bloco:

   <script async src="https://www.googletagmanager.com/gtag/js?id=G-J4NWP00S4F"></script>
   <script>
     window.dataLayer = window.dataLayer || [];
     function gtag(){dataLayer.push(arguments);}
     gtag('consent', 'default', {
       'ad_storage': 'denied',
       'ad_user_data': 'denied',
       'ad_personalization': 'denied',
       'analytics_storage': 'denied',
       'wait_for_update': 500
     });
     if (localStorage.getItem('tf_cookie_consent') === 'accepted') {
       gtag('consent', 'update', { 'analytics_storage': 'granted' });
     }
     gtag('js', new Date());
     gtag('config', 'G-J4NWP00S4F');
   </script>

   Antes do consentimento, o GA4 corre em modo "denied" (pings sem cookies,
   dados modelados). Este ficheiro apenas mostra o banner e, no "Aceitar",
   actualiza o Consent Mode para 'granted'. O gtag.js já está carregado —
   NÃO reinjeta nada (evita duplo carregamento).
*/
(function() {
    var CONSENT_KEY = 'tf_cookie_consent';
    var REJECT_TTL = 24 * 60 * 60 * 1000; // 24h

    var consent = localStorage.getItem(CONSENT_KEY);
    var showBanner = false;

    if (!consent) {
        showBanner = true;
    } else if (consent !== 'accepted') {
        var rejectTime = parseInt(consent);
        if (!rejectTime || Date.now() - rejectTime > REJECT_TTL) {
            localStorage.removeItem(CONSENT_KEY);
            showBanner = true;
        }
    }

    if (!showBanner) return;

    // Criar banner (estilos em style.css, classe .tf-cookie-banner)
    var banner = document.createElement('div');
    banner.id = 'tf-cookie-banner';
    banner.className = 'tf-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Consentimento de cookies');

    banner.innerHTML =
        '<div class="tf-cookie-banner-inner">' +
            '<div class="tf-cookie-banner-msg">' +
                '<strong>🍪 Este site utiliza cookies</strong><br>' +
                'Utilizamos cookies essenciais para o funcionamento do site e cookies analíticos ' +
                'para compreender como é utilizado e melhorar a sua experiência. ' +
                'Estes cookies só são ativados com o seu consentimento.' +
                '<span class="tf-cookie-banner-sub">' +
                    'Pode aceitar ou rejeitar a utilização de cookies analíticos. ' +
                    '<a href="/politica-de-cookies">Saber mais</a>' +
                '</span>' +
            '</div>' +
            '<div class="tf-cookie-banner-actions">' +
                '<button id="tf-cc-accept" type="button" class="tf-cookie-banner-btn tf-cookie-banner-accept">Aceitar</button>' +
                '<button id="tf-cc-reject" type="button" class="tf-cookie-banner-btn tf-cookie-banner-reject">Rejeitar</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(banner);

    function hideBanner() {
        banner.style.display = 'none';
    }

    // Garante acesso ao gtag global (definido no <head>); fallback defensivo.
    function getGtag() {
        window.dataLayer = window.dataLayer || [];
        window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
        return window.gtag;
    }

    // Aceitar: consentimento permanente + Consent Mode -> granted
    document.getElementById('tf-cc-accept').addEventListener('click', function() {
        localStorage.setItem(CONSENT_KEY, 'accepted');
        getGtag()('consent', 'update', { 'analytics_storage': 'granted' });
        hideBanner();
    });

    // Rejeitar: expira em 24h (Consent Mode mantém-se em 'denied')
    document.getElementById('tf-cc-reject').addEventListener('click', function() {
        localStorage.setItem(CONSENT_KEY, String(Date.now()));
        hideBanner();
    });
})();
