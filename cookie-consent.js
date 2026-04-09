/* cookie-consent.js — Banner RGPD para Google Analytics (GA4)
   Tiago Felícia | www.tiagofelicia.pt
   
   Uso: adicionar em cada página antes de </body>:
   <script src="cookie-consent.js"></script>
   
   O bloco GA4 no <head> deve ser:
   <script>
     window.dataLayer = window.dataLayer || [];
     function gtag(){dataLayer.push(arguments);}
     gtag('consent', 'default', { analytics_storage: 'denied' });
     if (localStorage.getItem('tf_cookie_consent') === 'accepted') {
       gtag('consent', 'update', { analytics_storage: 'granted' });
       var _ga = document.createElement('script');
       _ga.async = true;
       _ga.src = 'https://www.googletagmanager.com/gtag/js?id=G-J4NWP00S4F';
       document.head.appendChild(_ga);
       gtag('js', new Date());
       gtag('config', 'G-J4NWP00S4F');
     }
   </script>
*/
(function() {
    var GA_ID = 'G-J4NWP00S4F';
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
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#1e293b;color:#e2e8f0;padding:16px 24px;box-shadow:0 -4px 20px rgba(0,0,0,0.3);font-family:Roboto,sans-serif;font-size:0.88rem;line-height:1.5;';

    banner.innerHTML = '<div style="max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:20px;flex-wrap:wrap;justify-content:space-between;">'
        + '<div style="flex:1;min-width:280px;">'
        + '<strong>\uD83C\uDF6A Este site utiliza cookies</strong><br>'
        + 'Utilizamos cookies essenciais para o funcionamento do site e cookies anal\u00edticos '
        + 'para compreender como \u00e9 utilizado e melhorar a sua experi\u00eancia. '
        + 'Estes cookies s\u00f3 s\u00e3o ativados com o seu consentimento. '
        + '<br><span style="font-size:0.82rem;color:#94a3b8;">Pode aceitar ou rejeitar a utiliza\u00e7\u00e3o de cookies anal\u00edticos. '
        + '<a href="/politica-de-cookies.html" style="color:#60a5fa;text-decoration:underline;">Saber mais</a></span>'
        + '</div>'
        + '<div style="display:flex;gap:10px;flex-shrink:0;">'
        + '<button id="tf-cc-accept" style="padding:10px 24px;background:#16a34a;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.88rem;">Aceitar</button>'
        + '<button id="tf-cc-reject" style="padding:10px 24px;background:none;color:#94a3b8;border:1px solid #475569;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.88rem;">Rejeitar</button>'
        + '</div></div>';

    document.body.appendChild(banner);

    // Carregar GA4 (autónomo — não depende do head)
    function loadGA4() {
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        window.gtag = gtag;

        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
        document.head.appendChild(s);

        gtag('js', new Date());
        gtag('config', GA_ID);
    }

    function hideBanner() {
        banner.style.display = 'none';
    }

    // Aceitar: permanente + consent update + load GA4
    document.getElementById('tf-cc-accept').addEventListener('click', function() {
        localStorage.setItem(CONSENT_KEY, 'accepted');

        // Atualizar Consent Mode ANTES de carregar GA4
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        window.gtag = gtag;
        gtag('consent', 'update', { analytics_storage: 'granted' });

        hideBanner();
        loadGA4();
    });

    // Rejeitar: expira em 24h
    document.getElementById('tf-cc-reject').addEventListener('click', function() {
        localStorage.setItem(CONSENT_KEY, String(Date.now()));
        hideBanner();
    });
})();
