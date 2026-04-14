"""
Script de recolha de precos medios diarios de eletricidade por zona europeia.
Utiliza a API Energy-Charts para obter dados de precos day-ahead.

Modo diario (default):  python atualizar_mapa_precos.py
Modo backfill:          python atualizar_mapa_precos.py --backfill

Gera ficheiros JSON mensais em data/mapa_precos/ (ex: 2026-01.json)
e um metadata.json com a ultima data disponivel.
"""

import requests
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

# Zonas de licitacao (codigo Energy-Charts API) - 44 zonas ativas
# Nota: DE-AT-LU foi descontinuada (404 na API)
ZONES = [
    "AT", "BE", "BG", "CH", "CZ", "DE-LU",
    "DK1", "DK2",
    "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE(SEM)",
    "IT-North", "IT-Centre-North", "IT-Centre-South", "IT-South",
    "IT-Sicily", "IT-Sardinia", "IT-Calabria",
    "IT-SACOAC", "IT-SACODC",
    "LT", "LV", "ME", "NL",
    "NO1", "NO2", "NO2NSL", "NO3", "NO4", "NO5",
    "PL", "PT", "RO", "RS",
    "SE1", "SE2", "SE3", "SE4",
    "SI", "SK",
]

# Fuso horario local de cada zona de licitacao
# Critico: os timestamps da API sao UTC, mas o dia deve ser agrupado pela hora LOCAL
ZONE_TIMEZONES = {
    # CET/CEST (UTC+1/+2) - Europa Central
    "AT": "Europe/Vienna", "BE": "Europe/Brussels", "CH": "Europe/Zurich",
    "CZ": "Europe/Prague", "DE-LU": "Europe/Berlin",
    "DK1": "Europe/Copenhagen", "DK2": "Europe/Copenhagen",
    "ES": "Europe/Madrid", "FR": "Europe/Paris",
    "HR": "Europe/Zagreb", "HU": "Europe/Budapest",
    "IT-North": "Europe/Rome", "IT-Centre-North": "Europe/Rome",
    "IT-Centre-South": "Europe/Rome", "IT-South": "Europe/Rome",
    "IT-Sicily": "Europe/Rome", "IT-Sardinia": "Europe/Rome",
    "IT-Calabria": "Europe/Rome", "IT-SACOAC": "Europe/Rome", "IT-SACODC": "Europe/Rome",
    "ME": "Europe/Podgorica", "NL": "Europe/Amsterdam",
    "NO1": "Europe/Oslo", "NO2": "Europe/Oslo", "NO2NSL": "Europe/Oslo",
    "NO3": "Europe/Oslo", "NO4": "Europe/Oslo", "NO5": "Europe/Oslo",
    "PL": "Europe/Warsaw", "RS": "Europe/Belgrade",
    "SE1": "Europe/Stockholm", "SE2": "Europe/Stockholm",
    "SE3": "Europe/Stockholm", "SE4": "Europe/Stockholm",
    "SI": "Europe/Ljubljana", "SK": "Europe/Bratislava",
    # WET/WEST (UTC+0/+1) - Portugal e Irlanda
    "PT": "Europe/Lisbon", "IE(SEM)": "Europe/Dublin",
    # EET/EEST (UTC+2/+3) - Europa Oriental
    "BG": "Europe/Sofia", "EE": "Europe/Tallinn",
    "FI": "Europe/Helsinki", "GR": "Europe/Athens",
    "LT": "Europe/Vilnius", "LV": "Europe/Riga",
    "RO": "Europe/Bucharest",
}

DATA_DIR = os.path.join("data", "mapa_precos")
BACKFILL_START = "2026-01-01"
API_BASE = "https://api.energy-charts.info/price"


def fetch_prices(zone, start_date, end_date):
    """Buscar precos da API Energy-Charts para uma zona e intervalo de datas."""
    url = f"{API_BASE}?bzn={zone}&start={start_date}&end={end_date}"
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    return data.get("unix_seconds", []), data.get("price", [])


def compute_daily_stats(unix_seconds, prices, tz_name):
    """Agrupar precos por dia LOCAL da zona e calcular estatisticas diarias.

    Os timestamps da API sao UTC. O agrupamento deve usar a hora local
    da zona de licitacao para que os dias coincidam com os valores
    publicados (ex: Energy-Charts).

    Retorna por dia: avg, min, min_hour, max, max_hour (horas locais).
    """
    tz = ZoneInfo(tz_name)
    daily = {}
    for ts, price in zip(unix_seconds, prices):
        if price is None:
            continue
        local_dt = datetime.fromtimestamp(ts, tz=tz)
        day = local_dt.strftime("%Y-%m-%d")
        hour_str = local_dt.strftime("%H:%M")
        daily.setdefault(day, []).append((price, hour_str))

    result = {}
    for day, entries in daily.items():
        if not entries:
            continue
        prices_only = [p for p, _ in entries]
        min_entry = min(entries, key=lambda x: x[0])
        max_entry = max(entries, key=lambda x: x[0])
        result[day] = {
            "avg": round(sum(prices_only) / len(prices_only), 2),
            "min": round(min_entry[0], 2),
            "min_hour": min_entry[1],
            "max": round(max_entry[0], 2),
            "max_hour": max_entry[1],
        }
    return result


def load_monthly_file(year_month):
    """Carregar ficheiro JSON mensal existente, ou retornar dict vazio."""
    filepath = os.path.join(DATA_DIR, f"{year_month}.json")
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_monthly_file(year_month, data):
    """Guardar ficheiro JSON mensal."""
    filepath = os.path.join(DATA_DIR, f"{year_month}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, sort_keys=True, ensure_ascii=False)


def save_metadata(latest_date):
    """Guardar metadata com a ultima data disponivel."""
    filepath = os.path.join(DATA_DIR, "metadata.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump({"ultima_data": latest_date}, f, ensure_ascii=False)


def get_month_ranges(start_date, end_date):
    """Gerar intervalos mensais entre duas datas (para backfill eficiente)."""
    ranges = []
    current = start_date.replace(day=1)
    while current <= end_date:
        month_start = max(current, start_date)
        # Ultimo dia do mes
        if current.month == 12:
            month_end_limit = current.replace(year=current.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            month_end_limit = current.replace(month=current.month + 1, day=1) - timedelta(days=1)
        month_end = min(month_end_limit, end_date)
        ranges.append((month_start, month_end))
        # Proximo mes
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)
    return ranges


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    backfill = "--backfill" in sys.argv
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date()

    today = datetime.now(timezone.utc).date()

    if backfill:
        start_date = datetime.strptime(BACKFILL_START, "%Y-%m-%d").date()
        end_date = yesterday
        print(f"Modo BACKFILL: {start_date} a {end_date}")
    else:
        # Modo diário (corre às 14h UTC):
        # - Amanhã: preços day-ahead publicados ~13h, já devem estar disponíveis
        # - Hoje: re-verificar (pode ter sido incompleto na execução anterior)
        # - Ontem: segurança - corrigir eventuais alterações tardias
        tomorrow = today + timedelta(days=1)
        start_date = yesterday
        end_date = tomorrow
        print(f"Modo DIÁRIO: {start_date} a {end_date} (ontem + hoje + amanhã)")

    # Cache de ficheiros mensais carregados
    monthly_cache = {}
    latest_date = None
    total_zones = len(ZONES)

    for i, zone in enumerate(ZONES, 1):
        print(f"[{i}/{total_zones}] A recolher {zone}...", end=" ")

        if backfill:
            # Em backfill, buscar mes a mes para evitar respostas muito grandes
            month_ranges = get_month_ranges(start_date, end_date)
            zone_days = 0
            for m_start, m_end in month_ranges:
                try:
                    timestamps, prices = fetch_prices(
                        zone, m_start.isoformat(), m_end.isoformat()
                    )
                    daily_stats = compute_daily_stats(timestamps, prices, ZONE_TIMEZONES.get(zone, "Europe/Berlin"))

                    for date_str, stats in daily_stats.items():
                        year_month = date_str[:7]
                        if year_month not in monthly_cache:
                            monthly_cache[year_month] = load_monthly_file(year_month)
                        monthly_cache[year_month].setdefault(date_str, {})[zone] = stats
                        zone_days += 1

                        if latest_date is None or date_str > latest_date:
                            latest_date = date_str

                    time.sleep(1.5)  # Respeitar rate limits
                except Exception as e:
                    print(f"ERRO {zone} ({m_start}-{m_end}): {e}")
                    time.sleep(3)

            print(f"{zone_days} dias")
        else:
            # Modo diario: buscar apenas um dia
            try:
                timestamps, prices = fetch_prices(
                    zone, start_date.isoformat(), end_date.isoformat()
                )
                daily_stats = compute_daily_stats(timestamps, prices, ZONE_TIMEZONES.get(zone, "Europe/Berlin"))

                for date_str, stats in daily_stats.items():
                    year_month = date_str[:7]
                    if year_month not in monthly_cache:
                        monthly_cache[year_month] = load_monthly_file(year_month)
                    monthly_cache[year_month].setdefault(date_str, {})[zone] = stats

                    if latest_date is None or date_str > latest_date:
                        latest_date = date_str

                days_found = len(daily_stats)
                print(f"OK ({days_found} dias)")
                time.sleep(1.5)
            except Exception as e:
                print(f"ERRO: {e}")
                time.sleep(1)

    # Guardar todos os ficheiros mensais atualizados
    print(f"\nA guardar {len(monthly_cache)} ficheiro(s) mensal(is)...")
    for year_month, data in sorted(monthly_cache.items()):
        save_monthly_file(year_month, data)
        num_days = len(data)
        print(f"  {year_month}.json ({num_days} dias)")

    # Guardar metadata
    if latest_date:
        save_metadata(latest_date)
        print(f"\nMetadata: ultima_data = {latest_date}")

    print("Concluido!")


if __name__ == "__main__":
    main()
