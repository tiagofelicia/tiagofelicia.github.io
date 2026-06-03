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
    ({"omie-diario.html", "mapa-precos.html", "mapa-producao.html"},
     "daily", "0.9"),
    ({"omie.html", "omip.html", "balanco-omie.html", "balanco-historico.html",
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

    urls = []
    for f in files:
        loc = BASE_URL + "/" + ("" if f == "index.html" else f)
        # index.html → URL termina em "/"
        if f == "index.html":
            loc = BASE_URL + "/"
        lastmod = get_last_commit_date(f)
        freq, prio = get_priority_freq(f)
        urls.append((loc, lastmod, freq, prio, f))

    # Ordenar: index primeiro, depois alfabético
    urls.sort(key=lambda x: (0 if x[0].endswith("/") else 1, x[4]))

    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        '        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9',
        '                            http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">',
        '',
    ]
    for loc, lastmod, freq, prio, _ in urls:
        parts.append("  <url>")
        parts.append(f"    <loc>{loc}</loc>")
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
