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

    // Criar banner
    var banner = document.createElement('div');
    banner.id = 'tf-cookie-banner';
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#1e293b;color:#e2e8f0;padding:16px 24px;box-shadow:0 -4px 20px rgba(0,0,0,0.3);font-family:Arial,sans-serif;font-size:0.88rem;line-height:1.5;';

    banner.innerHTML = '<div style="max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:20px;flex-wrap:wrap;justify-content:space-between;">'
        + '<div style="flex:1;min-width:280px;">'
        + '<strong>🍪 Este site utiliza cookies</strong><br>'
        + 'Utilizamos cookies essenciais para o funcionamento do site e cookies analíticos '
        + 'para compreender como é utilizado e melhorar a sua experiência. '
        + 'Estes cookies só são ativados com o seu consentimento. '
        + '<br><span style="font-size:0.82rem;color:#94a3b8;">Pode aceitar ou rejeitar a utilização de cookies analíticos. '
        + '<a href="/politica-de-cookies.html" style="color:#60a5fa;text-decoration:underline;">Saber mais</a></span>'
        + '</div>'
        + '<div style="display:flex;gap:10px;flex-shrink:0;">'
        + '<button id="tf-cc-accept" style="padding:10px 24px;background:#16a34a;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.88rem;">Aceitar</button>'
        + '<button id="tf-cc-reject" style="padding:10px 24px;background:none;color:#94a3b8;border:1px solid #475569;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.88rem;">Rejeitar</button>'
        + '</div></div>';

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
