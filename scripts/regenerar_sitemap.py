"""
Regenera sitemap.xml automaticamente com base nos ficheiros HTML do repositório.

- Inclui todas as páginas HTML exceto: redirects, partials (footer/menu), 404.
- 'lastmod' = data do último commit que modificou cada ficheiro (via git log).
- Priority/changefreq são definidos por categoria.

Pode ser executado manualmente:
    python scripts/regenerar_sitemap.py

Ou via GitHub Action (atualizar_sitemap.yml).
"""
import os
import subprocess
import sys
from datetime import date

BASE_URL = "https://www.tiagofelicia.pt"

# Ficheiros HTML excluídos do sitemap (redirects, partials, etc.)
EXCLUDE = {
    "404.html",
    "footer.html",
    "menu.html",
    "producao-omie.html",  # redirect noindex → balanco-omie
}

# Priority + changefreq por padrão de filename
# Ordem: regras mais específicas primeiro
RULES = [
    # Simuladores principais
    ({"eletricidade-tiagofelicia.html", "gas-natural-tiagofelicia.html",
      "autoconsumo-tiagofelicia.html"}, "daily", "1.0"),
    # Página principal
    ({"index.html"}, "weekly", "1.0"),
    # Dashboards e dados de mercado (atualizam todos os dias)
    ({"omie-diario.html", "europe-prices.html", "europe-generation.html"},
     "daily", "0.9"),
    ({"omie.html", "omip.html", "balanco-omie.html", "balanco-historico.html",
      "europe-balance.html", "mibgas.html", "mibgas-futuros.html",
      "precos-horarios.html", "formulas-tarifarios-indexados.html"}, "daily", "0.8"),
    # Regulação eletricidade/gás
    ({"periodos-horarios.html", "tarifas-acesso-redes.html", "tarifa-social.html",
      "tarifa-regulada-eletricidade.html", "perfil-perdas.html",
      "tarifas-acesso-redes-gas.html", "tarifa-social-gas.html",
      "tarifa-regulada-gas-natural.html"}, "yearly", "0.7"),
    # Regulamentação
    ({"regulamentos.html"}, "yearly", "0.6"),
    # Calendário energético (atualizado quando há eventos novos)
    ({"calendario-energetico.html"}, "monthly", "0.6"),
    # Como ler a fatura (informacional, atualizado raramente)
    ({"como-ler-fatura.html"}, "yearly", "0.7"),
    # Glossário (acrescenta termos com alguma frequência)
    ({"glossario.html"}, "monthly", "0.7"),
    # Lista CUR e ORD de gás (relativamente estável)
    ({"lista-cur-gas.html"}, "yearly", "0.6"),
    # Excel alternativo
    ({"simulador-autoconsumo-excel.html"}, "monthly", "0.5"),
    # Institucionais
    ({"sobre.html", "apoio.html"}, "monthly", "0.5"),
    ({"contacto.html"}, "yearly", "0.4"),
    # Legal
    ({"termos-e-condicoes.html", "politica-de-privacidade.html",
      "politica-de-cookies.html"}, "yearly", "0.3"),
]


# Páginas com versões noutras línguas (via ?lang=). Cada idioma gera um <url>
# próprio e todos listam os mesmos <xhtml:link rel="alternate" hreflang> (incl.
# x-default). Caminhos relativos ao BASE_URL.
LANG_ALTERNATES = {
    "europe-balance.html": [
        ("pt-pt", "/europe-balance"),
        ("en", "/europe-balance?lang=en"),
        ("x-default", "/europe-balance"),
    ],
    "europe-prices.html": [
        ("pt-pt", "/europe-prices"),
        ("en", "/europe-prices?lang=en"),
        ("x-default", "/europe-prices"),
    ],
    "europe-generation.html": [
        ("pt-pt", "/europe-generation"),
        ("en", "/europe-generation?lang=en"),
        ("x-default", "/europe-generation"),
    ],
}


def get_last_commit_date(filepath):
    """Devolve a data do último commit (YYYY-MM-DD) que modificou o ficheiro."""
    try:
        out = subprocess.check_output(
            ["git", "log", "-1", "--format=%cs", "--", filepath],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
        return out if out else date.today().isoformat()
    except Exception:
        return date.today().isoformat()


def get_priority_freq(filename):
    """Devolve (changefreq, priority) consoante regras."""
    for fset, freq, prio in RULES:
        if filename in fset:
            return freq, prio
    return "monthly", "0.5"


def main():
    files = sorted(f for f in os.listdir(".") if f.endswith(".html") and f not in EXCLUDE)

    def alts_for(filename):
        a = LANG_ALTERNATES.get(filename)
        return [(hl, BASE_URL + path) for hl, path in a] if a else None

    urls = []
    for f in files:
        # URLs canónicas sem extensão .html (coerente com rel="canonical" das páginas)
        if f == "index.html":
            loc = BASE_URL + "/"  # index.html → URL termina em "/"
        else:
            loc = BASE_URL + "/" + f.removesuffix(".html")
        lastmod = get_last_commit_date(f)
        freq, prio = get_priority_freq(f)
        alts = alts_for(f)
        urls.append((loc, lastmod, freq, prio, f, alts))
        # Páginas multilingues: um <url> por idioma (a variante não-default),
        # cada um listando todos os alternates.
        if alts:
            for hl, path in LANG_ALTERNATES[f]:
                if hl in ("pt-pt", "x-default"):
                    continue
                extra = BASE_URL + path
                if extra != loc:
                    urls.append((extra, lastmod, freq, prio, f, alts))

    # Ordenar: index primeiro, depois por ficheiro e URL
    urls.sort(key=lambda x: (0 if x[0].endswith("/") else 1, x[4], x[0]))

    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:xhtml="http://www.w3.org/1999/xhtml"',
        '        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        '        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9',
        '                            http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">',
        '',
    ]
    for loc, lastmod, freq, prio, _, alts in urls:
        parts.append("  <url>")
        parts.append(f"    <loc>{loc}</loc>")
        if alts:
            for hl, href in alts:
                parts.append(f'    <xhtml:link rel="alternate" hreflang="{hl}" href="{href}"/>')
        parts.append(f"    <lastmod>{lastmod}</lastmod>")
        parts.append(f"    <changefreq>{freq}</changefreq>")
        parts.append(f"    <priority>{prio}</priority>")
        parts.append("  </url>")
    parts.append("")
    parts.append("</urlset>")
    parts.append("")

    new_content = "\n".join(parts)

    # Comparar com existente — só escrever se mudou
    existing = ""
    if os.path.exists("sitemap.xml"):
        with open("sitemap.xml", encoding="utf-8") as f:
            existing = f.read()

    if new_content.strip() == existing.strip():
        print(f"sitemap.xml inalterado ({len(urls)} URLs)")
        return 0

    with open("sitemap.xml", "w", encoding="utf-8", newline="\n") as f:
        f.write(new_content)
    print(f"sitemap.xml regenerado ({len(urls)} URLs)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
