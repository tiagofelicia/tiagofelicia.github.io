# --- Bibliotecas necessárias ---
import pandas as pd
import numpy as np
import requests
import re
import io
from datetime import datetime

print("✅ Bibliotecas carregadas para [Atualizador de MIBEL_ano_atual_ACUM]")

# ===================================================================
# ---- CONFIGURAÇÕES ----
# ===================================================================
FICHEIRO_MIBEL_CSV = "data/MIBEL_ano_atual_ACUM.csv"
FICHEIRO_MIBEL_XLS = "data/MIBEL_ano_atual_ACUM.xlsx" # Nome do ficheiro Excel original

# ===================================================================

def tentar_extrair_dados_omie_diario(data_inicio, data_fim):
    """
    Extrai dados dos ficheiros DIÁRIOS (marginalpdbcpt) que contêm ambos os preços (PT e ES).
    """
    print(f"   - ℹ️ [OMIE Diário] A preencher buracos de {data_inicio} a {data_fim}...")
    
    fontes_diarias = []
    dias_a_preencher = pd.date_range(pd.to_datetime(data_inicio), pd.to_datetime(data_fim), freq='D')

    if dias_a_preencher.empty:
        print("     - [OMIE Diário] Nenhum dia em falta para preencher.")
        return pd.DataFrame()

    print(f"     - [OMIE Diário] A verificar ficheiros para {len(dias_a_preencher)} dia(s)...")

    for dia in dias_a_preencher:
        data_str = dia.strftime('%Y%m%d')
        # Usar o URL 'marginalpdbcpt' que contém ambos os preços
        url_pt_es = f"https://www.omie.es/es/file-download?parents=marginalpdbcpt&filename=marginalpdbcpt_{data_str}.1"
        headers = {'User-Agent': 'Mozilla/5.0'}

        try:
            print(f"     - [OMIE Diário] A ler {data_str}.1 (PT e ES)...")
            r_pt_es = requests.get(url_pt_es, headers=headers, timeout=10)
            r_pt_es.raise_for_status()

            # Ler o conteúdo do ficheiro
            df_dia = pd.read_csv(
                io.BytesIO(r_pt_es.content),
                sep=';',
                skiprows=1, # Saltar a primeira linha de título (ex: MARGINALPDBCPT;)
                decimal=',',
                encoding='windows-1252',
                header=None, # Não têm cabeçalho útil
                usecols=[3, 4, 5], # Coluna 3=Hora, 4=Preço PT, 5=Preço ES
                names=['Hora', 'Preco_PT', 'Preco_ES']
                # ======================================================
            )
            
            df_dia.dropna(inplace=True)
            df_dia['Data'] = dia # Adicionar a data correta
            
            # Filtro de sanidade
            if len(df_dia) not in [92, 96, 100]:
                 print(f"     - ⚠️ Aviso: Ficheiro {data_str} não parece ser quarto-horário (encontradas {len(df_dia)} linhas).")
                 if len(df_dia) == 24:
                     print("     - ❌ ERRO: Ficheiro é horário (24h). Não pode ser misturado.")
                     continue # Salta para o próximo dia

            fontes_diarias.append(df_dia)
            print(f"     - ✅ [OMIE Diário] {len(df_dia)} registos encontrados para {dia.date()}.")

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                print(f"     - ⚠️ [OMIE Diário] Ficheiro {data_str}.1 não encontrado (404).")
            else:
                print(f"     - ⚠️ [OMIE Diário] Falha de HTTP para {data_str}: {e}")
        except Exception as e:
            print(f"     - ⚠️ [OMIE Diário] Falha ao processar {data_str}: {e}")

    if not fontes_diarias:
        print("   - ℹ️ [OMIE Diário] Nenhum dado encontrado nos ficheiros diários.")
        return pd.DataFrame()
    
    df_final_diario = pd.concat(fontes_diarias)
    return df_final_diario.drop_duplicates(subset=['Data', 'Hora'], keep='last')


def tentar_extrair_dados_omie_live():
    """
    Extrai dados dos ficheiros OMIE "recentes" (ACUM, INDICADORES).
    """
    print("   - ℹ️ [OMIE] A tentar extrair dados recentes (ACUM, INDICADORES)...")
    fontes_recentes_omie = [] 
    try:
        print("     - [OMIE] A ler dados (ACUM)...")
        dados_acum_qh = pd.read_csv(
            "https://www.omie.es/sites/default/files/dados/NUEVA_SECCION/INT_PBC_EV_H_ACUM.TXT", 
            sep=';', skiprows=2, header=0, usecols=[0, 1, 2, 3], 
            decimal=',', encoding='windows-1252',
            names=['Data', 'Hora', 'Preco_ES', 'Preco_PT']
        )
        dados_acum_qh['Data'] = pd.to_datetime(dados_acum_qh['Data'], format='%d/%m/%Y', errors='coerce')
        fontes_recentes_omie.append(dados_acum_qh.dropna(subset=['Data']))
    except Exception as e:
        print(f"     - ⚠️ [OMIE] Falha ao ler ACUM.TXT: {e}")

    try:
        print("     - [OMIE] A ler dados (INDICADORES)...")
        r = requests.get("https://www.omie.es/sites/default/files/dados/diario/INDICADORES.DAT", timeout=10)
        linhas = r.content.decode('utf-8').splitlines()
        data_sessao = pd.to_datetime([l for l in linhas if l.startswith("SESION;")][0].split(';')[1], format='%d/%m/%Y')
        
        linhas_dados = [l for l in linhas if re.match(r'^H\d{1,2}Q[1-4];', l)]
        if linhas_dados:
            dados_ind_list = []
            for l in linhas_dados:
                partes = l.split(';')
                match = re.match(r'^H(\d{1,2})Q(\d)', partes[0])
                if match:
                    hora_h, quarto = int(match.group(1)), int(match.group(2))
                    hora_seq = (hora_h - 1) * 4 + quarto
                    preco_pt = float(partes[2].replace(',', '.'))
                    preco_es = float(partes[1].replace(',', '.'))
                    dados_ind_list.append({'Data': data_sessao, 'Hora': hora_seq, 'Preco_PT': preco_pt, 'Preco_ES': preco_es})
            fontes_recentes_omie.append(pd.DataFrame(dados_ind_list))
    except Exception as e:
        print(f"     - ⚠️ [OMIE] Falha ao ler INDICADORES.DAT: {e}")
        
    if not fontes_recentes_omie:
        print("   - ⚠️ [OMIE] Nenhuma fonte (ACUM/INDICADORES) funcionou.")
        return pd.DataFrame()
        
    df_omie_final = pd.concat(fontes_recentes_omie)
    df_omie_final = df_omie_final.drop_duplicates(subset=['Data', 'Hora'], keep='last')
    print(f"   - ✅ [OMIE] {len(df_omie_final)} registos recentes extraídos.")
    return df_omie_final


def run_update_historico():
    """
    Função principal para atualizar o ficheiro de preços MIBEL_atual_ACUM.csv.
    """
    print("🚀 A iniciar a atualização do ficheiro histórico `MIBEL_atual_ACUM.csv`...")
    
    today = pd.to_datetime('today').date()
    df_historico_total = pd.DataFrame() 
    
    # ===================================================================
    # PASSO 1: LER HISTÓRICO
    # ===================================================================
    print(f"\n   - 1: A ler histórico local...")
    try:
        df_historico_total = pd.read_csv(FICHEIRO_MIBEL_CSV, parse_dates=['Data'])
        print(f"     - ✅ '{FICHEIRO_MIBEL_CSV}' lido com sucesso ({len(df_historico_total)} registos).")
    except FileNotFoundError:
        print(f"     - ℹ️ '{FICHEIRO_MIBEL_CSV}' não encontrado.")
        print(f"     - A tentar migrar do '{FICHEIRO_MIBEL_XLS}' (formato antigo)...")
        try:
            df_historico_total = pd.read_excel(FICHEIRO_MIBEL_XLS)
            colunas_necessarias = ['Data', 'Hora', 'Preco_PT', 'Preco_ES']
            if not all(col in df_historico_total.columns for col in colunas_necessarias):
                print(f"     - ❌ ERRO: O seu '{FICHEIRO_MIBEL_XLS}' não tem as colunas esperadas.")
                df_historico_total = pd.DataFrame(columns=colunas_necessarias)
            else:
                df_historico_total = df_historico_total[colunas_necessarias]
                df_historico_total['Data'] = pd.to_datetime(df_historico_total['Data'])
                print(f"     - ✅ '{FICHEIRO_MIBEL_XLS}' lido e migrado com sucesso ({len(df_historico_total)} registos).")
        except FileNotFoundError:
            print(f"     - ℹ️ '{FICHEIRO_MIBEL_XLS}' também não foi encontrado. A começar com um histórico vazio.")
            df_historico_total = pd.DataFrame(columns=['Data', 'Hora', 'Preco_ES', 'Preco_PT'])
        except Exception as e:
            print(f"     - ❌ Erro ao ler '{FICHEIRO_MIBEL_XLS}': {e}.")
            df_historico_total = pd.DataFrame(columns=['Data', 'Hora', 'Preco_ES', 'Preco_PT'])
    except Exception as e:
        print(f"     - ❌ Erro grave ao ler o histórico '{FICHEIRO_MIBEL_CSV}': {e}.")
        df_historico_total = pd.DataFrame(columns=['Data', 'Hora', 'Preco_ES', 'Preco_PT'])

    # ===================================================================
    # PASSO 2: OBTER DADOS DIÁRIOS DA OMIE (PREENCHER BURADOS)
    # ===================================================================
    
    df_dados_diarios = pd.DataFrame()
    data_inicio_buraco = None
    
    if df_historico_total.empty:
        data_inicio_buraco = pd.to_datetime(f"{today.year}-01-01").date()
        print(f"\n   - 2: Histórico vazio. A pedir dados diários OMIE desde {data_inicio_buraco}...")
    else:
        df_historico_total['Data'] = pd.to_datetime(df_historico_total['Data'])
        ultima_data_historico = df_historico_total['Data'].max().date()
        data_inicio_buraco = ultima_data_historico + pd.Timedelta(days=1)
        print(f"\n   - 2: Última data local: {ultima_data_historico}. A preencher buracos com OMIE Diário desde {data_inicio_buraco}...")

    # O "buraco" vai desde o dia a seguir ao que temos, ATÉ AO DIA DE HOJE
    data_fim_buraco = today 
    # =======================================================
    
    if data_inicio_buraco <= data_fim_buraco:
        # Chamar a função
        df_dados_diarios = tentar_extrair_dados_omie_diario(data_inicio_buraco, data_fim_buraco)
    else:
        print("   - ℹ️ O histórico local já está atualizado. A saltar OMIE Diário.")

    # ===================================================================
    # PASSO 3: OBTER DADOS DA OMIE (DIA ATUAL E SEGUINTE)
    # ===================================================================
    print("\n   - 3: A obter dados da OMIE (ACUM/INDICADORES)...")
    df_dados_live = tentar_extrair_dados_omie_live()

    # ===================================================================
    # PASSO 4: COMBINAR COM PRIORIDADE E GUARDAR
    # ===================================================================
    print("\n   - 4: A combinar e limpar dados...")
    
    # Ordem: 1. Histórico, 2. Diários (para buracos), 3. OMIE (prioridade máxima)
    fontes_para_combinar = [df_historico_total, df_dados_diarios, df_dados_live]
    
    df_final_completo = pd.concat(fontes_para_combinar)
    
    df_final_completo['Data'] = pd.to_datetime(df_final_completo['Data'])
    df_final_completo = df_final_completo.drop_duplicates(subset=['Data', 'Hora'], keep='last')
    df_final_completo = df_final_completo.sort_values(['Data', 'Hora']).reset_index(drop=True)

    # 5. Guardar o ficheiro histórico atualizado (SEMPRE COMO CSV)
    try:
        df_final_completo.to_csv(FICHEIRO_MIBEL_CSV, index=False, encoding='utf-8-sig', float_format='%.2f')
        print(f"\n✅ SUCESSO: '{FICHEIRO_MIBEL_CSV}' foi atualizado com sucesso.")
        print(f"   - Total de registos guardados: {len(df_final_completo)}")
    except Exception as e:
        print(f"\n❌ ERRO: Falha ao guardar o ficheiro CSV final: {e}")

# PONTO DE ENTRADA DO SCRIPT
if __name__ == "__main__":
    run_update_historico()