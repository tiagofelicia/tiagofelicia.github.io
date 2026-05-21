"""
Valida que os hashes SRI (integrity="sha384-...") declarados nos HTMLs ainda
correspondem ao conteúdo atual servido pelo CDN.

Razão: se um CDN republicar um ficheiro (mesmo com a mesma versão), o hash deixa
de bater e os browsers bloqueiam o script. Este script deteta esse caso
proactivamente antes dos utilizadores reportarem problemas.

Modo padrão: imprime relatório, exit code 0 se tudo OK, 1 se houver mismatch.

Uso:
    python scripts/validar_sri.py
"""
import base64
import glob
import hashlib
import re
import sys
import urllib.request

# Forçar UTF-8 no stdout (necessário em Windows para emojis)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# Padrão: <... src="URL" integrity="sha384-HASH" ...>
TAG_RE = re.compile(
    r'<(?:script|link)[^>]*?(?:src|href)=["\'](https://[^"\']+)["\'][^>]*?integrity=["\']sha384-([A-Za-z0-9+/=]+)["\']',
    re.IGNORECASE,
)

# CDNs reconhecidos (apenas estes serão validados — ignorar outros)
TRUSTED_CDNS = (
    "https://cdn.jsdelivr.net/",
    "https://cdnjs.cloudflare.com/",
    "https://cdn.sheetjs.com/",
    "https://unpkg.com/",
)


def hash_sha384_base64(content: bytes) -> str:
    """Calcula sha384 + base64 do conteúdo bruto."""
    return base64.b64encode(hashlib.sha384(content).digest()).decode("ascii")


def fetch_url(url: str, timeout: int = 30) -> bytes:
    """Descarrega URL e devolve bytes."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 SRI-Validator"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def main():
    # Recolher todas as (URL, hash_declarado) únicas
    pairs = {}
    for html_file in glob.glob("*.html"):
        with open(html_file, encoding="utf-8") as fh:
            content = fh.read()
        for m in TAG_RE.finditer(content):
            url = m.group(1)
            declared_hash = m.group(2)
            if not url.startswith(TRUSTED_CDNS):
                continue
            # Multiplas paginas referenciam o mesmo URL — recolher uma só vez
            key = (url, declared_hash)
            pairs.setdefault(key, []).append(html_file)

    print(f"Validando {len(pairs)} pares (URL, hash) únicos...\n")

    failures = []
    ok_count = 0

    for (url, declared), pages in sorted(pairs.items()):
        try:
            content = fetch_url(url)
        except Exception as e:
            failures.append((url, declared, "ERRO_REDE", str(e)[:80], pages))
            print(f"❌ ERRO REDE  {url}  ({e})")
            continue

        actual = hash_sha384_base64(content)
        if actual == declared:
            ok_count += 1
            print(f"✅ OK         {url}")
        else:
            failures.append((url, declared, actual, "MISMATCH", pages))
            print(f"❌ MISMATCH   {url}")
            print(f"   Declarado: sha384-{declared}")
            print(f"   Atual:     sha384-{actual}")
            print(f"   Páginas afetadas: {', '.join(pages)}")

    print()
    print(f"Total: {ok_count} OK, {len(failures)} falhas")

    if failures:
        print()
        print("AÇÃO RECOMENDADA:")
        print("Para cada MISMATCH, gerar novo hash com:")
        print("  curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A")
        print("E atualizar o atributo integrity= nas páginas listadas.")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
