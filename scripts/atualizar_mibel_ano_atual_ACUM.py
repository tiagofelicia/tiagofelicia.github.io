import pandas as pd
import numpy as np
import requests
import re
import io
import shutil
from datetime import datetime, timedelta

# ============================================================
# CONFIGURAÇÕES
# ============================================================
FICHEIRO_MIBEL_CSV = "data/MIBEL_ano_atual_ACUM.csv"
FICHEIRO_MIBEL_XLS = "data/MIBEL_ano_atual_ACUM.xlsx"
DIAS_MINIMOS_ACUM = 365
BACKUP_SUFFIX = ".bak"

# ============================================================
# SISTEMA DE LOGS
# ============================================================
def header(msg): print(f"\n🔵 {msg}")
def log(msg): print(f"   - {msg}")
def sub(msg): print(f"       • {msg}")

# ============================================================
# FUNÇÃO: Extrair dados OMIE (DIÁRIO)
# ============================================================
def tentar_extrair_dados_omie_diario(data_inicio, data_fim):

    if data_inicio > data_fim:
        header("[DIÁRIO] Nenhum intervalo para preencher.")
        return pd.DataFrame()

    header(f"[DIÁRIO] A preencher buracos de {data_inicio} até {data_fim}")
    dias = pd.date_range(data_inicio, data_fim, freq="D")
    sub(f"{len(dias)} dia(s) a verificar…")

    headers = {"User-Agent": "Mozilla/5.0"}
    lista = []
    dias_futuros = 0
    dias_ok = 0
    dias_vazios = 0

    for d in dias:
        data_str = d.strftime('%Y%m%d')
        url = f"https://www.omie.es/es/file-download?parents=marginalpdbcpt&filename=marginalpdbcpt_{data_str}.1"

        try:
            r = requests.get(url, headers=headers, timeout=12)

            if r.status_code == 404:
                dias_futuros += 1
                continue

            r.raise_for_status()

            # VERSÃO CORRIGIDA!!! (Bug V15.1)
            df = pd.read_csv(
                io.BytesIO(r.content),
                sep=';', skiprows=1, decimal=',', encoding='windows-1252',
                header=None, usecols=[3,4,5],          # ← CORREÇÃO CRÍTICA
                names=['Hora','Preco_PT','Preco_ES']
            )

            df.dropna(inplace=True)
            df['Data'] = d.date()

            if df.empty:
                dias_vazios += 1
                continue

            dias_ok += 1
            lista.append(df)

        except Exception:
            dias_vazios += 1
            continue

    # -------- LOG FINAL DOS DIÁRIOS --------
    if dias_ok == 0:
        if dias_futuros + dias_vazios == len(dias):
            sub("ℹ️ Nenhum dia disponível — pode ser futuro ou falha OMIE.")
        return pd.DataFrame()

    sub(f"✅ {dias_ok} dias recolhidos com sucesso.")
    return pd.concat(lista, ignore_index=True)

# ============================================================
# FUNÇÃO: Extrair dados LIVE (ACUM + INDICADORES)
# ============================================================
def tentar_extrair_dados_live():

    header("[LIVE] A extrair dados ACUM + INDICADORES")
    fontes = []
    df_acum = pd.DataFrame()
    df_ind = pd.DataFrame()

    # -------- ACUM --------
    try:
        sub("[ACUM] A descarregar…")

        df_acum = pd.read_csv(
            "https://www.omie.es/sites/default/files/dados/NUEVA_SECCION/INT_PBC_EV_H_ACUM.TXT",
            sep=';', skiprows=2, decimal=',', encoding='windows-1252',
            usecols=[0,1,2,3], names=['Data','Hora','Preco_ES','Preco_PT']
        )

        df_acum['Data'] = pd.to_datetime(df_acum['Data'], format="%d/%m/%Y", errors="coerce")
        df_acum.dropna(subset=['Data'], inplace=True)
        df_acum['Data'] = df_acum['Data'].dt.date
        fontes.append(df_acum)
        sub(f"[ACUM] OK ({len(df_acum)} registos)")

    except Exception as e:
        sub(f"[ACUM] ❌ Falhou ({e})")

    # -------- INDICADORES --------
    try:
        sub("[INDICADORES] A descarregar…")
        r = requests.get("https://www.omie.es/sites/default/files/dados/diario/INDICADORES.DAT", timeout=10)
        lines = r.content.decode("utf-8", errors="ignore").splitlines()

        sess = [l for l in lines if l.startswith("SESION;")][0]
        data_sessao = pd.to_datetime(sess.split(";")[1], format="%d/%m/%Y").date()

        dados = []
        for l in lines:
            m = re.match(r"^H(\d{1,2})Q([1-4]);", l)
            if not m: continue

            partes = l.split(";")
            hora_h = int(m.group(1))
            quarto = int(m.group(2))
            hora_seq = (hora_h - 1)*4 + quarto

            preco_es = float(partes[1].replace(",", "."))
            preco_pt = float(partes[2].replace(",", "."))

            dados.append([data_sessao, hora_seq, preco_pt, preco_es])

        df_ind = pd.DataFrame(dados, columns=['Data','Hora','Preco_PT','Preco_ES'])
        fontes.append(df_ind)
        sub(f"[INDICADORES] OK, dia {data_sessao} ({len(df_ind)} registos)")

    except Exception as e:
        sub(f"[INDICADORES] ❌ Falhou ({e})")

    if not fontes:
        return pd.DataFrame(), 0, pd.DataFrame()

    df_live = pd.concat(fontes, ignore_index=True)
    num_dias_acum = df_acum['Data'].nunique() if len(df_acum) else 0

    return df_live, num_dias_acum, df_ind

# ============================================================
# FUNÇÃO: Ler histórico local
# ============================================================
def ler_historico_local():

    header("[HISTÓRICO] A carregar histórico local")

    try:
        df = pd.read_csv(FICHEIRO_MIBEL_CSV, parse_dates=['Data'])
        df['Data'] = df['Data'].dt.date
        log(f"✔️ CSV carregado ({len(df)} registos)")
        return df
    except:
        log("ℹ️ CSV inexistente — tentar XLS…")

    try:
        df = pd.read_excel(FICHEIRO_MIBEL_XLS)
        df['Data'] = pd.to_datetime(df['Data']).dt.date
        log(f"✔️ XLS carregado ({len(df)} registos)")
        return df
    except:
        log("⚠️ Nem CSV nem XLS disponíveis — histórico vazio.")
        return pd.DataFrame(columns=['Data','Hora','Preco_PT','Preco_ES'])

# ============================================================
# FUNÇÃO PRINCIPAL
# ============================================================
def run_update_historico():

    header("🚀 A iniciar atualização MIBEL")
    today = datetime.now().date()

    # ---- LIVE ----
    df_live, num_acum, df_ind = tentar_extrair_dados_live()

    # ---- Base ----
    if num_acum >= DIAS_MINIMOS_ACUM:
        header("[PLANO A] ACUM válido — usar como base")
        df_base = df_live.copy()
        df_base['Data'] = pd.to_datetime(df_base['Data']).dt.date
    else:
        header(f"[PLANO B] ACUM insuficiente ({num_acum} dias)")
        df_base = ler_historico_local()

    ultima = df_base['Data'].max() if not df_base.empty else today - timedelta(days=1)
    log(f"Última data na base: {ultima}")

    # ---- Preencher buracos ----
    ind_date = df_ind['Data'].iloc[0] if not df_ind.empty else None

    if ind_date:
        log(f"INDICADORES disponível para: {ind_date}")

    fim_buracos = ind_date - timedelta(days=1) if ind_date else today

    df_diarios = pd.DataFrame()
    if ultima < fim_buracos:
        df_diarios = tentar_extrair_dados_omie_diario(ultima + timedelta(days=1), fim_buracos)

    # ---- Adicionar INDICADORES ----
    df_ind_to_add = pd.DataFrame()
    if num_acum < DIAS_MINIMOS_ACUM and ind_date and ind_date > ultima:
        df_ind_to_add = df_ind.copy()

    # ---- Combinar tudo ----
    header("[FINAL] A combinar e guardar")
    dfs = [df_base]

    if not df_diarios.empty:
        dfs.append(df_diarios)

    if not df_ind_to_add.empty:
        dfs.append(df_ind_to_add)

    df_final = pd.concat(dfs, ignore_index=True)
    
    # ---- Normalização FINAL do DataFrame ----

    # Hora numérica
    df_final['Hora'] = pd.to_numeric(df_final['Hora'], errors='coerce')

    # Preços: converter strings com vírgulas para floats
    df_final['Preco_PT'] = (
        df_final['Preco_PT']
        .astype(str)
        .str.replace(',', '.', regex=False)
    )
    df_final['Preco_PT'] = pd.to_numeric(df_final['Preco_PT'], errors='coerce')

    df_final['Preco_ES'] = (
        df_final['Preco_ES']
        .astype(str)
        .str.replace(',', '.', regex=False)
    )
    df_final['Preco_ES'] = pd.to_numeric(df_final['Preco_ES'], errors='coerce')

    # ORDEM das colunas
    df_final = df_final[['Data','Hora','Preco_PT','Preco_ES']]

    # Ordenação final
    df_final = df_final.sort_values(['Data','Hora']).drop_duplicates(['Data','Hora'])


    # ---- Backup ----
    try:
        shutil.copy(FICHEIRO_MIBEL_CSV, FICHEIRO_MIBEL_CSV + BACKUP_SUFFIX)
        log("💾 Backup criado.")
    except:
        log("ℹ️ Sem backup (CSV ainda não existia).")

    df_final.to_csv(FICHEIRO_MIBEL_CSV, index=False, encoding='utf-8-sig', float_format="%.2f")

    log(f"✅ Atualização concluída: {len(df_final)} registos")
    log("🏁 FIM")

# ============================================================
# ENTRY
# ============================================================
if __name__ == "__main__":
    run_update_historico()
