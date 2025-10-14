# ============================================================
# SISTEMA COMPLETO DE ATUALIZAÇÃO DE PREÇOS-HORÁRIOS
# ============================================================

import pandas as pd
import requests
import re
from datetime import datetime
import io
import csv

# ============================================================
# 1. EXTRATOR OMIE
# ============================================================

def obter_dados_reais_omie():
    """Extrai dados reais da OMIE (histórico + diário)"""
    print("ℹ️ A extrair dados reais da OMIE...")
    fontes_qh = []
    
    # 1. Dados históricos (ACUM)
    data_acum_max = None
    try:
        dados_acum_qh = pd.read_csv(
            "https://www.omie.es/sites/default/files/dados/NUEVA_SECCION/INT_PBC_EV_H_ACUM.TXT",
            sep=';', skiprows=2, header=0, usecols=[0, 1, 3],
            decimal=',', encoding='windows-1252'
        )
        dados_acum_qh.columns = ['Data', 'Hora', 'Preco']
        dados_acum_qh['Data'] = pd.to_datetime(dados_acum_qh['Data'], format='%d/%m/%Y', errors='coerce')
        data_acum_max = dados_acum_qh['Data'].max()
        print(f"   - ACUM carregado: {len(dados_acum_qh)} registos até {data_acum_max.date()}")
        fontes_qh.append(dados_acum_qh.dropna())
    except Exception as e:
        print(f"   - Aviso: Falha ao ler dados (ACUM). {e}")

# 2. Dados do dia seguinte (INDICADORES)
    try:
        r = requests.get("https://www.omie.es/sites/default/files/dados/diario/INDICADORES.DAT", timeout=10)
        linhas = r.content.decode('utf-8').splitlines()
        data_sessao = pd.to_datetime(
            [l for l in linhas if l.startswith("SESION;")][0].split(';')[1],
            format='%d/%m/%Y'
        )
        # 🔑 CORREÇÃO: \d{1,2} em vez de \d{2} para capturar H1-H24 (1 ou 2 dígitos)
        linhas_dados = [l for l in linhas if re.match(r'^H\d{1,2}Q[1-4];', l)]
        
        if linhas_dados:
            dados_ind_list = []
            for l in linhas_dados:
                partes = l.split(';')
                # Extrair HH e Q: "H14Q3" → hora=14, Q=3
                match = re.match(r'^H(\d{1,2})Q(\d)', partes[0])
                if match:
                    hora_h = int(match.group(1))  # Hora (1-24)
                    quarto = int(match.group(2))  # Quarto (1-4)
                    # Converter para sequência 1-96: (hora-1)*4 + quarto
                    hora = (hora_h - 1) * 4 + quarto
                    preco = float(partes[2].replace(',', '.'))
                    dados_ind_list.append({'Data': data_sessao, 'Hora': hora, 'Preco': preco})
            
            dados_ind_qh = pd.DataFrame(dados_ind_list)
            print(f"   - INDICADORES carregado: {len(dados_ind_qh)} registos para {data_sessao.date()}")
            
            # Se ACUM tem dados de data_sessao, remover INDICADORES desse dia
            if data_acum_max and data_sessao <= data_acum_max:
                print(f"   - ⚠️ INDICADORES ({data_sessao.date()}) já existe em ACUM. Ignorando INDICADORES.")
            else:
                fontes_qh.append(dados_ind_qh)
        else:
            print(f"   - Aviso: Nenhum dado encontrado em INDICADORES.DAT")
    except Exception as e:
        print(f"   - Aviso: Falha ao ler dados (INDICADORES). {e}")

    if not fontes_qh:
        raise ValueError("Não foi possível extrair nenhum dado da OMIE.")

    # Combinar e limpar
    todos_dados_qh = pd.concat(fontes_qh, ignore_index=True)
    
    # 🔑 Remover duplicatas: manter último (mais recente/confiável)
    todos_dados_qh = todos_dados_qh.drop_duplicates(subset=['Data', 'Hora'], keep='last')
    
    todos_dados_qh['Data'] = pd.to_datetime(todos_dados_qh['Data'])
    todos_dados_qh = todos_dados_qh.sort_values(['Data', 'Hora']).reset_index(drop=True)
    
    print(f"✅ Dados da OMIE extraídos: {len(todos_dados_qh)} registos")
    print(f"   - Período: {todos_dados_qh['Data'].min().date()} a {todos_dados_qh['Data'].max().date()}")
    
    return todos_dados_qh


# ============================================================
# 2. MOTOR DE CÁLCULO
# ============================================================

def gerar_tabelas_tarifarias(df_omie, ficheiro_config):
    """
    Função principal que orquestra todos os cálculos.
    Garante que todos os intervalos de tempo (96 por dia) são gerados, mesmo que faltem dados OMIE no final do dia.
    """
    print("ℹ️ A iniciar cálculos dos tarifários...")

    # 1. Carregar dados de configuração do Excel
    try:
        constantes_df = pd.read_excel(ficheiro_config, sheet_name="Constantes")
        constantes_dict = dict(zip(constantes_df["constante"], constantes_df["valor_unitário"]))
        omie_perdas_ciclos = pd.read_excel(ficheiro_config, sheet_name="OMIE_PERDAS_CICLOS")
        omie_perdas_ciclos['DataHora'] = omie_perdas_ciclos.apply(lambda r: pd.to_datetime(f"{r['Data']} {r['Hora']}", errors='coerce'), axis=1)
        omie_perdas_ciclos['DataHora'] = (omie_perdas_ciclos['DataHora'].dt.tz_localize('Europe/Madrid', nonexistent='shift_forward', ambiguous='NaT').dt.tz_convert('Europe/Lisbon').dt.tz_localize(None))
        omie_perdas_ciclos['DataHora'] = omie_perdas_ciclos['DataHora'] + pd.Timedelta(minutes=45)
        omie_perdas_ciclos['DataHora'] = omie_perdas_ciclos['DataHora'].dt.round('15min')
        print("   - Ficheiro de configuração lido com sucesso.")
    except Exception as e:
        print(f"❌ Erro ao carregar configuração: {e}")
        raise

    # 2. Preparar DataFrame OMIE com DataHora
    df_omie_trabalho = df_omie.copy()
    df_omie_trabalho['DataHora'] = df_omie_trabalho.apply(
        lambda row: pd.Timestamp(row['Data'], tz='Europe/Madrid') + pd.Timedelta(minutes=15 * (row['Hora'] - 1)),
        axis=1
    ).dt.tz_convert('Europe/Lisbon').dt.tz_localize(None)


    # --- Criar um "MOLDE" com todos os intervalos de 15 minutos ---
    print("   - A criar molde de tempo completo para garantir 96 registos/dia...")
    dias_a_processar = df_omie['Data'].dt.date.unique()
    todos_intervalos = []
    for dia in dias_a_processar:
        intervalos_dia = pd.date_range(start=pd.Timestamp(dia), periods=96, freq='15min', tz='Europe/Lisbon')
        todos_intervalos.extend(intervalos_dia)
    
    # DataFrame com todos os intervalos de tempo possíveis, em hora de Portugal
    df_scaffold = pd.DataFrame({'DataHora': todos_intervalos}).copy()
    df_scaffold['DataHora'] = df_scaffold['DataHora'].dt.tz_localize(None)

    # Juntar o molde com os dados OMIE. Onde não houver dados, 'Preco' será NaN.
    df_omie_completo = pd.merge(df_scaffold, df_omie_trabalho, on='DataHora', how='left')
    # --------------------------------------------------------------------

    # 3. Fazer merge com OMIE_PERDAS_CICLOS
    df_merged = pd.merge(
        df_omie_completo,
        omie_perdas_ciclos[['DataHora', 'Perdas', 'BD', 'BS', 'TD', 'TS']],
        on='DataHora',
        how='left'
    )
    df_merged['Perdas'] = df_merged['Perdas'].fillna(1.04)

    # 4. Calcular preços para cada comercializador
    resultados = []
    comercializadores = [
        "Alfa Power Index BTN", "Coopérnico Base 2.0", "EDP Indexada Horária",
        "EZU Tarifa Coletiva", "Galp Plano Dinâmico", "G9 Smart Dynamic",
        "MeoEnergia Tarifa Variável", "Repsol Leve Sem Mais",
    ]
    ordem_ciclo = {
        'Simples': 0, 'Bi-horário - Ciclo Diário': 1, 'Bi-horário - Ciclo Semanal': 2,
        'Tri-horário - Ciclo Diário': 3, 'Tri-horário - Ciclo Semanal': 4,
        'Tri-horário > 20.7 kVA - Ciclo Diário': 5, 'Tri-horário > 20.7 kVA - Ciclo Semanal': 6
    }

    for _, row in df_merged.iterrows():
        dt = row['DataHora']
        hora_inicio = dt.strftime('%H:%M')
        hora_fim = (dt + pd.Timedelta(minutes=15)).strftime('%H:%M')
        hora_str = f"[{hora_inicio}-{hora_fim}["
        
        # Verifica se existe preço OMIE para este intervalo de tempo
        if pd.isna(row['Preco']):
            # CASO 1: NÃO HÁ DADOS OMIE -> Criar linhas com valores vazios
            for comercializador in comercializadores:
                # É preciso determinar os ciclos mesmo sem preço
                # A lógica abaixo funciona porque depende das colunas BD, BS, TD, TS que vêm do ficheiro de configuração e não do OMIE.
                
                ciclos_a_processar = []
                if pd.notna(row.get('BD')): ciclos_a_processar.append({'opcao_nome': 'Bi-horário - Ciclo Diário'})
                if pd.notna(row.get('BS')): ciclos_a_processar.append({'opcao_nome': 'Bi-horário - Ciclo Semanal'})
                if pd.notna(row.get('TD')): 
                    ciclos_a_processar.append({'opcao_nome': 'Tri-horário - Ciclo Diário'})
                    ciclos_a_processar.append({'opcao_nome': 'Tri-horário > 20.7 kVA - Ciclo Diário'})
                if pd.notna(row.get('TS')): 
                    ciclos_a_processar.append({'opcao_nome': 'Tri-horário - Ciclo Semanal'})
                    ciclos_a_processar.append({'opcao_nome': 'Tri-horário > 20.7 kVA - Ciclo Semanal'})
                ciclos_a_processar.append({'opcao_nome': 'Simples'})

                for ciclo in list({c['opcao_nome']: c for c in ciclos_a_processar}.values()): # Remove duplicados
                    resultados.append({
                        'Dia': dt.strftime('%Y-%m-%d'),
                        'Tarifário': comercializador,
                        'Opção Horária e Ciclo': ciclo['opcao_nome'],
                        'Hora': hora_str,
                        'Valor': None,  # VALORES NUMÉRICOS FICAM VAZIOS
                        'OMIE_PT': None,
                        'TAR': None,
                        'OMIE*Perdas+TAR': None,
                        '_ordem_ciclo': ordem_ciclo.get(ciclo['opcao_nome'], 99)
                    })
        else:
            # CASO 2: HÁ DADOS OMIE -> Calcular normalmente
            omie_kwh = row['Preco'] / 1000.0
            perdas = row['Perdas']
            
            for comercializador in comercializadores:
                preco_comercializador_kwh = calcular_preco_comercializador(comercializador, omie_kwh, perdas, constantes_dict)
                
                ciclos_processar = []
                ciclos_processar.append({'ciclo_codigo': 'S','periodo': None, 'opcao_nome': 'Simples','tar_key': 'TAR_Energia_Simples'})
                if pd.notna(row.get('BD')): ciclos_processar.append({'ciclo_codigo': 'BD','periodo': row['BD'],'opcao_nome': 'Bi-horário - Ciclo Diário','tar_key': 'TAR_Energia_Bi_Vazio' if row['BD'] == 'V' else 'TAR_Energia_Bi_ForaVazio'})
                if pd.notna(row.get('BS')): ciclos_processar.append({'ciclo_codigo': 'BS','periodo': row['BS'],'opcao_nome': 'Bi-horário - Ciclo Semanal','tar_key': 'TAR_Energia_Bi_Vazio' if row['BS'] == 'V' else 'TAR_Energia_Bi_ForaVazio'})
                if pd.notna(row.get('TD')): 
                    periodo_td = row['TD']
                    tar_map_td = {'V': 'TAR_Energia_Tri_Vazio','C': 'TAR_Energia_Tri_Cheias','P': 'TAR_Energia_Tri_Ponta'}
                    ciclos_processar.append({'ciclo_codigo': 'TD','periodo': periodo_td,'opcao_nome': 'Tri-horário - Ciclo Diário','tar_key': tar_map_td.get(periodo_td)})
                    tar_map_td_alta = {'V': 'TAR_Energia_Tri_27.6_Vazio','C': 'TAR_Energia_Tri_27.6_Cheias','P': 'TAR_Energia_Tri_27.6_Ponta'}
                    ciclos_processar.append({'ciclo_codigo': 'TD>20.7','periodo': periodo_td,'opcao_nome': 'Tri-horário > 20.7 kVA - Ciclo Diário','tar_key': tar_map_td_alta.get(periodo_td)})
                if pd.notna(row.get('TS')):
                    periodo_ts = row['TS']
                    tar_map_ts = {'V': 'TAR_Energia_Tri_Vazio','C': 'TAR_Energia_Tri_Cheias','P': 'TAR_Energia_Tri_Ponta'}
                    ciclos_processar.append({'ciclo_codigo': 'TS','periodo': periodo_ts,'opcao_nome': 'Tri-horário - Ciclo Semanal','tar_key': tar_map_ts.get(periodo_ts)})
                    tar_map_ts_alta = {'V': 'TAR_Energia_Tri_27.6_Vazio','C': 'TAR_Energia_Tri_27.6_Cheias','P': 'TAR_Energia_Tri_27.6_Ponta'}
                    ciclos_processar.append({'ciclo_codigo': 'TS>20.7','periodo': periodo_ts,'opcao_nome': 'Tri-horário > 20.7 kVA - Ciclo Semanal','tar_key': tar_map_ts_alta.get(periodo_ts)})

                for ciclo_info in ciclos_processar:
                    tar_kwh = constantes_dict.get(ciclo_info['tar_key'], 0.0)
                    valor_final_kwh = preco_comercializador_kwh + tar_kwh
                    omie_perdas_tar_kwh = (omie_kwh * perdas) + tar_kwh
                    
                    resultados.append({
                        'Dia': dt.strftime('%Y-%m-%d'),
                        'Tarifário': comercializador,
                        'Opção Horária e Ciclo': ciclo_info['opcao_nome'],
                        'Hora': hora_str,
                        'Valor': round(valor_final_kwh, 5),
                        'OMIE_PT': round(omie_kwh, 5),
                        'TAR': round(tar_kwh, 5),
                        'OMIE*Perdas+TAR': round(omie_perdas_tar_kwh, 5),
                        '_ordem_ciclo': ordem_ciclo.get(ciclo_info['opcao_nome'], 99)
                    })

    # 5. Gerar tabelas finais
    df_quarto_horario_final = pd.DataFrame(resultados)
    df_quarto_horario_final = df_quarto_horario_final.sort_values(
        by=['Tarifário', 'Dia', '_ordem_ciclo', 'Hora'],
        ascending=[True, False, True, True]
    ).reset_index(drop=True)
    df_quarto_horario_final = df_quarto_horario_final.drop(columns=['_ordem_ciclo'])
    print(f"   - Cálculos quarto-horários concluídos: {len(df_quarto_horario_final)} registos")

    # Calcular médias horárias
    df_quarto_horario_final['Hora_Int'] = df_quarto_horario_final['Hora'].str.extract(r'\[(\d{2}):\d{2}').astype(int)
    df_horario_final = df_quarto_horario_final.groupby(
        ['Dia', 'Tarifário', 'Opção Horária e Ciclo', 'Hora_Int']
    ).agg(
        OMIE_PT=('OMIE_PT', 'mean'),
        Valor=('Valor', 'mean')
    ).reset_index()
    df_horario_final['Hora'] = df_horario_final['Hora_Int'].apply(lambda h: f"[{h:02d}:00-{(h + 1):02d}:00[")
    df_horario_final['_ordem_ciclo'] = df_horario_final['Opção Horária e Ciclo'].map(ordem_ciclo)
    df_horario_final = df_horario_final.sort_values(
        by=['Tarifário', 'Dia', '_ordem_ciclo', 'Hora_Int'],
        ascending=[True, False, True, True]
    ).reset_index(drop=True)
    df_horario_final = df_horario_final.drop(columns=['_ordem_ciclo', 'Hora_Int'])
    df_horario_final = df_horario_final[['Dia', 'Tarifário', 'Opção Horária e Ciclo', 'Hora', 'OMIE_PT', 'Valor']]
    print(f"   - Tabela horária gerada: {len(df_horario_final)} registos")

    print("✅ Cálculos concluídos.")
    return df_quarto_horario_final, df_horario_final


def calcular_preco_comercializador(nome_tarifario, omie_kwh, perdas, constantes_dict):
    """
    Calcula o preço do comercializador baseado nas fórmulas específicas. RETORNA: Preço em €/kWh
    """
    if "Alfa Power Index BTN" in nome_tarifario:
        return ((omie_kwh + constantes_dict.get('Alfa_CGS', 0.0)) * perdas + constantes_dict.get('Alfa_K', 0.0) + constantes_dict.get('Financiamento_TSE', 0.0))
    
    elif nome_tarifario == "Coopérnico Base 2.0":
        return (omie_kwh + constantes_dict.get('Coop_CS_CR', 0.0) + constantes_dict.get('Coop_K', 0.0)) * perdas + constantes_dict.get('Financiamento_TSE', 0.0)
    
    elif "EDP Indexada Horária" in nome_tarifario:
        return (omie_kwh * perdas * constantes_dict.get('EDP_H_K1', 1.0) + constantes_dict.get('EDP_H_K2', 0.0))
    
    elif "EZU Tarifa Coletiva" in nome_tarifario:
        return (omie_kwh + constantes_dict.get('EZU_K', 0.0) + constantes_dict.get('EZU_CGS', 0.0)) * perdas + constantes_dict.get('Financiamento_TSE', 0.0)
        
    elif "Galp Plano Dinâmico" in nome_tarifario:
        return (omie_kwh + constantes_dict.get('Galp_Ci', 0.0)) * perdas    
    
    elif "G9 Smart Dynamic" in nome_tarifario:
        return (omie_kwh * constantes_dict.get('G9_FA', 0.0) * perdas + constantes_dict.get('G9_CGS', 0.0) + constantes_dict.get('G9_AC', 0.0)) + constantes_dict.get('Financiamento_TSE', 0.0)
    
    elif "MeoEnergia Tarifa Variável" in nome_tarifario:
        return (omie_kwh + constantes_dict.get('Meo_K', 0.0)) * perdas        
    
    elif "Repsol Leve Sem Mais" in nome_tarifario:
        return (omie_kwh * perdas * constantes_dict.get('Repsol_FA', 0.0) + constantes_dict.get('Repsol_Q_Tarifa', 0.0)) + constantes_dict.get('Financiamento_TSE', 0.0)
    
    else:
        # Fallback
        return omie_kwh * perdas


# ============================================================
# 3. EXPORTADOR CSV
# ============================================================

def exportar_para_csv_compativel(df_q_horario, df_horario, nome_ficheiro):
    """
    Gera o ficheiro CSV com a formatação final e exata.
    """
    print(f"ℹ️ A gerar ficheiro CSV com formato final para '{nome_ficheiro}'...")

    # --- 1. PREPARAÇÃO DA TABELA QUARTO-HORÁRIA ---
    df_q_export = df_q_horario.copy()
    
    df_q_export['Dia'] = pd.to_datetime(df_q_export['Dia']).dt.strftime('%d/%m/%Y')
    
    df_q_export = df_q_export.rename(columns={
        'Dia': 'dia', 'Tarifário': 'tarifario', 'Opção Horária e Ciclo': 'opcao',
        'Hora': 'intervalo', 'Valor': 'col', 'OMIE_PT': 'omie',
        'TAR': 'tar', 'OMIE*Perdas+TAR': 'omieTar'
    })
    colunas_qh = ['dia', 'tarifario', 'opcao', 'intervalo', 'col', 'omie', 'tar', 'omieTar']
    df_q_export = df_q_export[colunas_qh]

    # --- 2. PREPARAÇÃO DA TABELA HORÁRIA ---
    df_h_export = df_horario.copy()

    df_h_export['Dia'] = pd.to_datetime(df_h_export['Dia']).dt.strftime('%d/%m/%Y')

    df_h_export['OMIE_PT'] = df_h_export['OMIE_PT'] * 1000
    df_h_export = df_h_export.rename(columns={
        'Dia': 'CSV_Dia', 'Tarifário': 'CSV_Tarifario', 'Opção Horária e Ciclo': 'CSV_Opcao',
        'Hora': 'CSV_Hora', 'OMIE_PT': 'CSV_OMIE_Medio_MWh', 'Valor': 'CSV_Preco_Medio_kWh'
    })
    colunas_horarias = ['CSV_Dia', 'CSV_Tarifario', 'CSV_Opcao', 'CSV_Hora', 'CSV_OMIE_Medio_MWh', 'CSV_Preco_Medio_kWh']
    df_h_export = df_h_export[colunas_horarias]

    # --- 3. CONSTRUÇÃO DO FICHEIRO CSV ---
    with open(nome_ficheiro, 'w', encoding='utf-8-sig', newline='') as f:
        # Tabela 1: Quarto-Horária
        f.write(df_q_export.to_csv(index=False, header=True, decimal='.', float_format='%.5f'))
        
        # Separador
        f.write("\n" + "," * 10 + "TABELA_HORARIA\n")

        # Tabela 2: Horária
        df_h_export['CSV_OMIE_Medio_MWh'] = df_h_export['CSV_OMIE_Medio_MWh'].apply(
            lambda x: f'{x:.2f}' if pd.notna(x) else ''
        )
        df_h_export['CSV_Preco_Medio_kWh'] = df_h_export['CSV_Preco_Medio_kWh'].apply(
            lambda x: f'{x:.5f}' if pd.notna(x) else ''
        )
        
        csv_tabela_h = df_h_export.to_csv(index=False, header=True, decimal='.')
        
        offset = "," * 10
        linhas_h = csv_tabela_h.strip().split('\n')
        for i, linha in enumerate(linhas_h):
            f.write(offset + linha + ('\n' if i < len(linhas_h) - 1 else ''))

    print(f"✅ Ficheiro CSV '{nome_ficheiro}' criado com o formato definitivo.")

# ============================================================
# 4. MAIN
# ============================================================

def main():
    print("=" * 60)
    print("SISTEMA DE ATUALIZAÇÃO DE PREÇOS-HORÁRIOS")
    print("=" * 60)

    # --- Definir o URL do ficheiro de configuração ---
    URL_CONFIG = "https://raw.githubusercontent.com/tiagofelicia/simulador-tarifarios-eletricidade/main/Tarifarios_%F0%9F%94%8C_Eletricidade_Tiago_Felicia.xlsx"

    try:
        # 1. Obter dados OMIE
        df_omie = obter_dados_reais_omie()

        # 2. Determinar período (últimos 2 dias com dados)
        data_omie = df_omie['Data'].max()
        data_anterior = data_omie - pd.Timedelta(days=1)
        
        print(f"\nℹ️ Data de referência: {data_omie.date()}")
        print(f"ℹ️ A processar: {data_anterior.date()} e {data_omie.date()}")

        # 3. Filtrar para os 2 dias
        df_omie_filtrado = df_omie[df_omie['Data'].isin([data_omie, data_anterior])].copy()
        print(f"ℹ️ Registos filtrados: {len(df_omie_filtrado)}")
        
        # 4. Executar cálculos, passando o URL
        df_qh, df_h = gerar_tabelas_tarifarias(
            df_omie_filtrado, 
            URL_CONFIG 
        )

        # 5. Aplicar filtro de datas
        df_qh['Dia_dt'] = pd.to_datetime(df_qh['Dia'])
        data_minima = pd.to_datetime(data_anterior) 
        df_qh = df_qh[df_qh['Dia_dt'] >= data_minima].copy()
        df_qh = df_qh.drop(columns=['Dia_dt'])
        df_h['Dia_dt'] = pd.to_datetime(df_h['Dia'])
        df_h = df_h[df_h['Dia_dt'] >= data_minima].copy()
        df_h = df_h.drop(columns=['Dia_dt'])
        print(f"✂️ Após filtro: {len(df_qh)} registos quarto-horários | {len(df_h)} registos horários")

        # 6. Exportar para CSV
        exportar_para_csv_compativel(df_qh, df_h, "data/precos-horarios.csv")
        
        print("\n" + "=" * 60)
        print("✅ PROCESSO CONCLUÍDO COM SUCESSO")
        print("=" * 60)

    except Exception as e:
        print("\n" + "=" * 60)
        print(f"❌ ERRO NO PROCESSO: {e}")
        print("=" * 60)
        import traceback
        traceback.print_exc()
        raise

if __name__ == "__main__":
    main()
