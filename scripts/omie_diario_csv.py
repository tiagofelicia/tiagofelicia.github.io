# --- Carregar as bibliotecas necessárias ---
import pandas as pd
import numpy as np
import requests
import openpyxl
from datetime import datetime
import io
import re

print("✅ Bibliotecas carregadas")

# ===================================================================
# ---- CONFIGURAÇÕES ----
# ===================================================================
DATA_INICIO_ATUALIZACAO = pd.to_datetime("2025-10-01")
FICHEIRO_CSV = "omie_diario.csv"

print(f"ℹ️ Data de início da atualização definida para: {DATA_INICIO_ATUALIZACAO.date()}")
# ===================================================================

# ===================================================================
# FUNÇÃO PARA EXTRAIR E PROCESSAR FUTUROS
# ===================================================================
def extrair_dados_futuros_omip(product_code, data_relatorio_omip, ficheiro_omip_bytes):
    """
    Extrai e processa dados de futuros (FPB para PT, FTB para ES) a partir
    do conteúdo do ficheiro OMIPdaily.xlsx.
    Retorna um DataFrame formatado e pronto para exportação.
    """
    pais = "Portugal" if product_code == 'FPB' else "Espanha"
    print(f"\n⏳ A extrair futuros para {pais} ({product_code})...")
    
    try:
        # Usar o conteúdo do ficheiro já descarregado
        with io.BytesIO(ficheiro_omip_bytes) as ficheiro_memoria:
            df = pd.read_excel(ficheiro_memoria, sheet_name="OMIP Daily", header=None, skiprows=10, usecols=[1, 10], names=['Nome', 'Preco'])

        df = df.dropna(subset=['Nome'])
        df = df[df['Nome'].str.startswith(product_code)]

        conditions = [
            df['Nome'].str.contains(" D "), df['Nome'].str.contains(" Wk"),
            df['Nome'].str.contains(" M "), df['Nome'].str.contains(" Q"),
            df['Nome'].str.contains(" YR-")
        ]
        choices = ["Dia", "Semana", "Mês", "Trimestre", "Ano"]
        df['Classificacao'] = np.select(conditions, choices, default=None)
        df = df.dropna(subset=['Classificacao'])

        df['Preco'] = pd.to_numeric(df['Preco'], errors='coerce')
        df['AnoRaw'] = "20" + df['Nome'].str.extract(r'(\d{2})$')[0]

        datas = []
        for _, row in df.iterrows():
            nome, ano = row['Nome'], row['AnoRaw']
            try:
                if row['Classificacao'] == 'Dia':
                    match = re.search(r'(\d{2}[A-Za-z]{3})', nome)
                    datas.append(pd.to_datetime(match.group(1) + ano, format='%d%b%Y'))
                elif row['Classificacao'] == 'Semana':
                    week_num = int(re.search(r'Wk(\d+)', nome).group(1))
                    datas.append(datetime.fromisocalendar(int(ano), week_num, 1))
                elif row['Classificacao'] == 'Mês':
                    mes_str = re.search(r' M ([A-Za-z]{3})-', nome).group(1)
                    datas.append(pd.to_datetime(f'01-{mes_str}-{ano}', format='%d-%b-%Y'))
                elif row['Classificacao'] == 'Trimestre':
                    trimestre = int(re.search(r' Q(\d)', nome).group(1))
                    mes_inicio = (trimestre - 1) * 3 + 1
                    datas.append(pd.to_datetime(f'{ano}-{mes_inicio:02d}-01'))
                elif row['Classificacao'] == 'Ano':
                     datas.append(pd.to_datetime(f'{ano}-01-01'))
                else: datas.append(pd.NaT)
            except Exception: datas.append(pd.NaT)
        
        df['Data'] = pd.to_datetime(datas)
        df.dropna(subset=['Preco', 'Data'], inplace=True)

        meses_pt = {'Jan':'Janeiro', 'Feb':'Fevereiro', 'Mar':'Março', 'Apr':'Abril', 'May':'Maio', 'Jun':'Junho', 'Jul':'Julho', 'Aug':'Agosto', 'Sep':'Setembro', 'Oct':'Outubro', 'Nov':'Novembro', 'Dec':'Dezembro'}
        
        def formatar_descricao_futuro(row):
            cat, data, nome = row['Classificacao'], row['Data'], row['Nome']
            if cat == 'Dia': return data.strftime('%d/%m/%Y')
            if cat == 'Semana': return f"Semana {data.isocalendar().week}, {data.year}"
            if cat == 'Mês':
                mes_abbr = re.search(r' M ([A-Za-z]{3})-', nome).group(1)
                return f"{meses_pt.get(mes_abbr, mes_abbr)} {data.year}"
            if cat == 'Trimestre':
                trimestre = re.search(r' Q(\d)', nome).group(1)
                return f"{trimestre}º Trimestre {data.year}"
            if cat == 'Ano': return f"Ano {data.year}"
            return ""

        df['Descricao'] = df.apply(formatar_descricao_futuro, axis=1)
        df['Data_Atualizacao'] = data_relatorio_omip.strftime('%d/%m/%Y')
        df_final = df[['Nome', 'Descricao', 'Preco', 'Data_Atualizacao']].copy()
        df_final.rename(columns={'Nome': 'Contrato', 'Preco': 'Valor', 'Data_Atualizacao': 'Data de Atualizacao'}, inplace=True)
        
        print(f"   - ✅ {len(df_final)} contratos de futuros para {pais} processados.")
        return df_final

    except Exception as e:
        print(f"   - ❌ ERRO ao processar futuros para {pais}: {e}")
        return pd.DataFrame()
    

def run_update_process():
    """
    Função principal que encapsula todo o processo de ETL.
    """
    try:
        # ========================================================
        # PASSO 1: Extração de Dados de Futuros (OMIP)
        # ========================================================
        
        print("\n⏳ Passo 1: A extrair dados de futuros do ficheiro OMIPdaily.xlsx...")
        url_omip_excel = "https://www.omip.pt/sites/default/files/dados/eod/omipdaily.xlsx"
        resposta_http = requests.get(url_omip_excel, timeout=20)
        resposta_http.raise_for_status()

        ficheiro_omip_bytes = resposta_http.content # Guardar o conteúdo para reutilizar

        ficheiro_omip_memoria = io.BytesIO(ficheiro_omip_bytes)
        valor_celula_data = pd.read_excel(ficheiro_omip_memoria, sheet_name="OMIP Daily", header=None, skiprows=4, usecols="E", nrows=1).iloc[0, 0]
        data_relatorio_omip = pd.to_datetime(valor_celula_data, dayfirst=True)
        print(f"   - Data do relatório extraída: {data_relatorio_omip.date()}")

        ficheiro_omip_memoria.seek(0)
        df = pd.read_excel(ficheiro_omip_memoria, sheet_name="OMIP Daily", header=None, skiprows=10, usecols=[1, 10], names=['Nome', 'Preco'])

        df = df.dropna(subset=['Nome'])
        df = df[df['Nome'].str.startswith('FPB')]

        # Classificar tipos de futuros
        conditions = [
            df['Nome'].str.contains(" D "), 
            df['Nome'].str.contains(" Wk"),
            df['Nome'].str.contains(" M "), 
            df['Nome'].str.contains(" Q"),
            df['Nome'].str.contains(" YR-")
        ]
        choices = ["Dia", "Semana", "Mês", "Trimestre", "Ano"]
        df['Classificacao'] = np.select(conditions, choices, default=None)

        df = df.dropna(subset=['Classificacao'])
        df['Preco'] = pd.to_numeric(df['Preco'], errors='coerce')
        df['AnoRaw'] = "20" + df['Nome'].str.extract(r'(\d{2})$')[0]

        # Calcular datas
        datas = []
        for index, row in df.iterrows():
            nome, ano = row['Nome'], row['AnoRaw']
            try:
                if row['Classificacao'] == 'Dia':
                    # Extrair data diretamente do nome (ex: "Th09Oct-25")
                    partes = nome.split(" ")
                    data_str = partes[2] if len(partes) > 2 else partes[1]
                    
                    # Remover sufixo "-25" se existir
                    if '-' in data_str:
                        data_str = data_str.split('-')[0]
                    
                    # Remover prefixo do dia da semana se existir (Th, Fr, We, Sa, Su)
                    if data_str[:2].isalpha():
                        data_str = data_str[2:]
                    
                    # Agora data_str deve ser algo como "09Oct"
                    datas.append(pd.to_datetime(data_str + ano, format='%d%b%Y'))
                    
                elif row['Classificacao'] == 'Semana':
                    week_num = int(nome.split(" Wk")[1].split("-")[0])
                    # Usar a lógica ISO: semana 1 contém 4 de Janeiro
                    # Calcular a segunda-feira dessa semana
                    jan_4 = pd.Timestamp(f'{ano}-01-04')
                    # Encontrar a segunda-feira da semana 1
                    seg_semana_1 = jan_4 - pd.Timedelta(days=jan_4.weekday())
                    # Adicionar semanas
                    data_semana = seg_semana_1 + pd.Timedelta(weeks=week_num - 1)
                    datas.append(data_semana)
                    
                elif row['Classificacao'] == 'Mês':
                    mes_str = nome.split(" ")[2].split("-")[0]
                    datas.append(pd.to_datetime(f'01-{mes_str}-{ano}', format='%d-%b-%Y'))
                    
                elif row['Classificacao'] == 'Trimestre':
                    trimestre = int(nome.split(" Q")[1][0])
                    mes_inicio = (trimestre - 1) * 3 + 1
                    datas.append(pd.to_datetime(f'{ano}-{mes_inicio:02d}-01'))
                    
                elif row['Classificacao'] == 'Ano':
                    datas.append(pd.to_datetime(f'{ano}-01-01'))
                    
                else: 
                    datas.append(pd.NaT)
            except Exception as e:
                print(f"   ⚠️ Erro ao processar '{nome}': {e}")
                datas.append(pd.NaT)

        df['Data'] = datas

        # Finalizar
        dados_web = df.dropna(subset=['Preco', 'Data'])[['Data', 'Preco', 'Classificacao', 'Nome']]
        dados_web = dados_web.drop_duplicates(subset=['Nome'], keep='first').reset_index(drop=True)

        print("✅ Dados de futuros extraídos e processados.")
        print(f"   - Total: {len(dados_web)} futuros")
        print(f"   - Dias: {len(dados_web[dados_web['Classificacao']=='Dia'])}")
        print(f"   - Semanas: {len(dados_web[dados_web['Classificacao']=='Semana'])}")
        print(f"   - Meses: {len(dados_web[dados_web['Classificacao']=='Mês'])}")

        # DEBUG: Mostrar alguns futuros para verificação
        print("\n   📋 Amostra de futuros extraídos:")
        for tipo in ['Dia', 'Semana', 'Mês']:
            amostra = dados_web[dados_web['Classificacao'] == tipo].head(3)
            if not amostra.empty:
                print(f"\n   {tipo}:")
                for _, row in amostra.iterrows():
                    print(f"      {row['Nome']:30s} -> {row['Data'].strftime('%Y-%m-%d (%A)')} = {row['Preco']:.2f} €/MWh")

        # --- LÓGICA PARA AS TABELAS DE FUTUROS FINAIS ---
        futuros_pt = extrair_dados_futuros_omip('FPB', data_relatorio_omip, ficheiro_omip_bytes)
        futuros_es = extrair_dados_futuros_omip('FTB', data_relatorio_omip, ficheiro_omip_bytes)

        # ========================================================
        # PASSO 2: Leitura e Combinação dos Dados OMIE
        # ========================================================

        print("\n⏳ Passo 2: A ler e combinar dados OMIE (todos quarto-horários)...")
        
        fontes_qh = []

        print("   - 2a: A ler 'MIBEL.xlsx'...")
        try:
            dados_base_qh = pd.read_excel("MIBEL.xlsx", usecols=['Data', 'Hora', 'Preço marginal no sistema português (EUR/MWh)'])
            dados_base_qh = dados_base_qh.rename(columns={'Preço marginal no sistema português (EUR/MWh)': 'Preco'})
            dados_base_qh['Data'] = pd.to_datetime(dados_base_qh['Data'])
            fontes_qh.append(dados_base_qh)
        except Exception as e: print(f"   - Aviso: Não foi possível ler 'MIBEL.xlsx'. {e}")
        
        print("   - 2b: A ler dados recentes (ACUM) para PT e ES...")
        try:
            # Colunas: 0=Data, 1=Hora, 2=Preço ES, 3=Preço PT
            dados_acum_qh = pd.read_csv(
                "https://www.omie.es/sites/default/files/dados/NUEVA_SECCION/INT_PBC_EV_H_ACUM.TXT", 
                sep=';', 
                skiprows=2, 
                header=0, 
                usecols=[0, 1, 2, 3], # Lemos as 4 colunas
                decimal=',', 
                encoding='windows-1252',
                names=['Data', 'Hora', 'Preco_ES', 'Preco_PT'] # Damos nomes às colunas
            )
            dados_acum_qh['Data'] = pd.to_datetime(dados_acum_qh['Data'], format='%d/%m/%Y', errors='coerce')
            fontes_qh.append(dados_acum_qh.dropna(subset=['Data']))
        except Exception as e: 
            print(f"   - Aviso: Falha ao ler dados (ACUM). {e}")

        print("   - 2c: A ler dados do dia seguinte (INDICADORES) para PT e ES...")
        try:
            r = requests.get("https://www.omie.es/sites/default/files/dados/diario/INDICADORES.DAT", timeout=10)
            linhas = r.content.decode('utf-8').splitlines()
            data_sessao = pd.to_datetime([l for l in linhas if l.startswith("SESION;")][0].split(';')[1], format='%d/%m/%Y')
            
            # Usar regex para garantir que capturamos H1Q1 até H24Q4
            linhas_dados = [l for l in linhas if re.match(r'^H\d{1,2}Q[1-4];', l)]
            if linhas_dados:
                dados_ind_list = []
                for l in linhas_dados:
                    partes = l.split(';')
                    match = re.match(r'^H(\d{1,2})Q(\d)', partes[0])
                    if match:
                        hora_h = int(match.group(1))
                        quarto = int(match.group(2))
                        hora_seq = (hora_h - 1) * 4 + quarto
                        
                        # Capturar preço de PT (coluna 2) e ES (coluna 1)
                        preco_pt = float(partes[2].replace(',', '.'))
                        preco_es = float(partes[1].replace(',', '.'))
                        
                        dados_ind_list.append({
                            'Data': data_sessao, 
                            'Hora': hora_seq, 
                            'Preco_PT': preco_pt,
                            'Preco_ES': preco_es
                        })
                
                fontes_qh.append(pd.DataFrame(dados_ind_list))
        except Exception as e: 
            print(f"   - Aviso: Falha ao ler dados (INDICADORES). {e}")
        
        print("   - 2d: A combinar fontes de dados...")
        todos_dados_qh = pd.concat(fontes_qh).drop_duplicates(subset=['Data', 'Hora'], keep='last')
        
        dados_para_manter = todos_dados_qh[todos_dados_qh['Data'] < DATA_INICIO_ATUALIZACAO]
        dados_para_atualizar = todos_dados_qh[todos_dados_qh['Data'] >= DATA_INICIO_ATUALIZACAO]

        dados_combinados_qh = pd.concat([dados_para_manter, dados_para_atualizar]).sort_values(['Data', 'Hora']).reset_index(drop=True)
        print("✅ Todas as fontes de dados OMIE foram combinadas.")

        # =================================================================
        # PASSO 3: Criar calendário e aplicar futuros com a lógica correta
        # =================================================================

        print("\n⏳ Passo 3: A criar calendário e aplicar futuros...")

        # 3a. Criar calendário base
        calendario_es = pd.DataFrame({
            'Data': pd.date_range(start='2025-01-01', end='2026-12-31', freq='D')
        })
        calendario_es['Ano'] = calendario_es['Data'].dt.year
        calendario_es['Mes'] = calendario_es['Data'].dt.month
        calendario_es['Trimestre'] = calendario_es['Data'].dt.quarter
        calendario_es['Semana'] = calendario_es['Data'].dt.isocalendar().week

        # 3b. Preparar futuros por tipo
        print("   - A preparar futuros diários...")
        dados_web_dia = dados_web[dados_web['Classificacao'] == 'Dia'][['Data', 'Preco']].rename(columns={'Preco': 'Preco_Dia'})
        dados_web_dia = dados_web_dia.drop_duplicates(subset=['Data'], keep='first')

        print("   - A preparar futuros semanais...")
        dados_web_semana = dados_web[dados_web['Classificacao'] == 'Semana'].copy()
        dados_web_semana['Semana'] = dados_web_semana['Data'].dt.isocalendar().week
        dados_web_semana['Ano'] = dados_web_semana['Data'].dt.year
        dados_web_semana = dados_web_semana[['Ano', 'Semana', 'Preco']].rename(columns={'Preco': 'Preco_Semana'})

        print("   - A preparar futuros mensais...")
        dados_web_mes = dados_web[dados_web['Classificacao'] == 'Mês'][['Data', 'Preco']].rename(columns={'Preco': 'Preco_Mes'})

        print("   - A preparar futuros trimestrais...")
        dados_web_trimestre = dados_web[dados_web['Classificacao'] == 'Trimestre'][['Data', 'Preco']].rename(columns={'Preco': 'Preco_Trimestre'})

        # 3c. Juntar futuros ao calendário
        print("   - A fazer merge dos futuros...")

        # Merge semanal (por Ano + Semana)
        calendario_es = pd.merge(calendario_es, dados_web_semana, on=['Ano', 'Semana'], how='left')

        # Merge mensal (por Data - primeiro dia do mês)
        calendario_es = pd.merge(calendario_es, dados_web_mes, on='Data', how='left')

        # Merge trimestral (por Data - primeiro dia do trimestre)
        calendario_es = pd.merge(calendario_es, dados_web_trimestre, on='Data', how='left')

        # 3d. CHAVE: Aplicar fill (propagação) dentro de cada grupo
        print("   - A propagar futuros dentro dos períodos (fill)...")

        # Para semanas: propagar Preco_Semana dentro de cada (Ano, Semana)
        calendario_es['Preco_Semana'] = calendario_es.groupby(['Ano', 'Semana'])['Preco_Semana'].ffill().bfill()

        # Para meses: propagar Preco_Mes dentro de cada (Ano, Mes)
        calendario_es['Preco_Mes'] = calendario_es.groupby(['Ano', 'Mes'])['Preco_Mes'].ffill().bfill()

        # Para trimestres: propagar Preco_Trimestre dentro de cada (Ano, Trimestre)
        calendario_es['Preco_Trimestre'] = calendario_es.groupby(['Ano', 'Trimestre'])['Preco_Trimestre'].ffill().bfill()

        # 3e. Juntar dados históricos reais
        print("   - A juntar dados históricos reais...")
        dados_historicos_diarios = dados_combinados_qh.groupby('Data')['Preco_PT'].mean().rename('Preco_Diario_Real')
        calendario_es = pd.merge(calendario_es, dados_historicos_diarios, left_on='Data', right_index=True, how='left')

        # 3f. Juntar futuros diários (último, porque têm prioridade sobre semanais)
        calendario_es = pd.merge(calendario_es, dados_web_dia, left_on='Data', right_on='Data', how='left')

        # 3g. Aplicar a hierarquia de preços (ordem correta!)
        print("   - A aplicar hierarquia de preços...")
        calendario_es['Preco_Final_Diario'] = (
            calendario_es['Preco_Diario_Real']
            .fillna(calendario_es['Preco_Dia'])
            .fillna(calendario_es['Preco_Semana'])
            .fillna(calendario_es['Preco_Mes'])
            .fillna(calendario_es['Preco_Trimestre'])
        )

        print("✅ Preços diários (reais e projetados) calculados.")

        # 3h. Criar grelha quarto-horária em hora de Espanha
        print("   - A criar grelha quarto-horária...")

        def num_quartos_dia(data):
            """Calcula número de quartos horários considerando DST"""
            tz_es = 'Europe/Madrid'
            dt0 = pd.Timestamp(f"{data} 00:00:00", tz=tz_es)
            dt24 = pd.Timestamp(f"{data} 23:59:59", tz=tz_es)
            horas = (dt24 - dt0).total_seconds() / 3600
            return int(round(horas * 4))

        # Gerar datas futuras a partir da última data histórica
        ultima_data_historica = dados_combinados_qh['Data'].max()
        datas_futuras = pd.date_range(start=ultima_data_historica + pd.Timedelta(days=1), end='2026-01-01', freq='D')

        # Criar tabela de futuros quarto-horários
        futuro_qh = []
        for data in datas_futuras:
            n_quartos = num_quartos_dia(data)
            for hora in range(1, n_quartos + 1):
                futuro_qh.append({'Data': data, 'Hora': hora})

        futuro_qh = pd.DataFrame(futuro_qh)

        # Combinar histórico + futuros
        dados_finais_es = pd.concat([dados_combinados_qh, futuro_qh], ignore_index=True)
        dados_finais_es = dados_finais_es.merge(
            calendario_es[['Data', 'Preco_Final_Diario']], 
            on='Data', 
            how='left'
        )

        # Manter histórico real PT e ES; preencher apenas futuros de PT
        dados_finais_es['Preco_PT'] = dados_finais_es['Preco_PT'].fillna(dados_finais_es['Preco_Final_Diario'])
        # A coluna Preco_ES permanecerá com NaN (vazia) para datas futuras.
        dados_finais_es = dados_finais_es.sort_values(['Data', 'Hora']).reset_index(drop=True)

        print("✅ Estrutura ES criada com número correto de quartos-horários.")

        # DEBUG: Verificar aplicação de futuros
        print("\n   🔍 Verificação da aplicação de futuros:")
        dias_teste = pd.to_datetime(['2025-10-18', '2025-10-25', '2025-11-01', '2025-11-25', '2025-12-25', '2026-02-25'])
        for dia in dias_teste:
            linha = calendario_es[calendario_es['Data'] == dia]
            if not linha.empty:
                linha = linha.iloc[0]
                print(f"      {dia.strftime('%Y-%m-%d (%A)')}:")
                print(f"         Real: {linha.get('Preco_Diario_Real', 'N/A')}")
                print(f"         Dia:  {linha.get('Preco_Dia', 'N/A')}")
                print(f"         Sem:  {linha.get('Preco_Semana', 'N/A')}")
                print(f"         Mês:  {linha.get('Preco_Mes', 'N/A')}")
                print(f"         ➡️  FINAL: {linha['Preco_Final_Diario']:.2f} €/MWh")
                
        # ============================================================
        # PASSO 4: Conversão para hora de Portugal
        # ============================================================

        print("\n⏳ Passo 4: A converter para hora de Portugal...")

        # Gerar datetime em hora de Espanha
        def gerar_datetime_es(row):
            """Gera timestamp correto considerando DST"""
            data = row['Data']
            hora = row['Hora']
            inicio_dia = pd.Timestamp(f"{data} 00:00:00", tz='Europe/Madrid')
            return inicio_dia + pd.Timedelta(minutes=15 * (hora - 1))

        dados_finais_es['datetime_es'] = dados_finais_es.apply(gerar_datetime_es, axis=1)
        
        # Esta é a conversão chave que lida corretamente com a mudança de hora
        dados_finais_es['datetime_pt'] = dados_finais_es['datetime_es'].dt.tz_convert('Europe/Lisbon')
        
        # Criar as colunas de Data e Hora de Portugal a partir do timestamp correto
        dados_finais_pt = dados_finais_es.sort_values('datetime_pt').copy()
        dados_finais_pt['Data'] = dados_finais_pt['datetime_pt'].dt.date
        dados_finais_pt['Hora'] = dados_finais_pt.groupby('Data').cumcount() + 1

        # Selecionar apenas 2025 e 2026
        dados_finais_pt = dados_finais_pt[dados_finais_pt['datetime_pt'].dt.year.isin([2025, 2026])].copy()

        # Selecionar as colunas finais, MANTENDO o datetime_pt para o passo seguinte
        dados_finais_pt = dados_finais_pt[['Data', 'Hora', 'Preco_PT', 'Preco_ES', 'datetime_pt']].copy()
        
        dados_finais_pt = dados_finais_pt.dropna(subset=['Preco_PT']).reset_index(drop=True)
        print(f"✅ {len(dados_finais_pt)} registos finais preparados em hora de Portugal.")

        # Validação de quartos
        check_quartos = dados_finais_pt.groupby('Data').size().reset_index(name='n')
        dias_estranhos = check_quartos[~check_quartos['n'].isin([92, 96, 100])]

        if not dias_estranhos.empty:
            print("⚠️ Aviso: Dias com número de quartos inesperado:")
            print(dias_estranhos.to_string(index=False))
        else:
            print("✅ Todos os dias têm número de quartos esperado (92, 96 ou 100).")

        # =======================================================================
        # PASSO 5: Adicionar Ciclos Horários e Exportar para CSV
        # =======================================================================

        print(f"\n⏳ Passo 5: A adicionar ciclos horários e a exportar dados para CSV...")

        # --- 5a. Adicionar Colunas de Ciclos Horários ---
        df_com_ciclos = dados_finais_pt.copy()
        
        # Funções para cálculo dos ciclos
        def last_sunday(year, month):
            d = datetime(year, month, 1) + pd.DateOffset(months=1) - pd.DateOffset(days=1)
            offset = (d.weekday() - 6) % 7
            return (d - pd.DateOffset(days=offset)).date()

        def is_summer_time(dt):
            year = dt.year
            start_summer = last_sunday(year, 3)
            end_summer = last_sunday(year, 10)
            return start_summer <= dt < end_summer

        def calcular_ciclos(row):
            ts = row['datetime_pt']
            time = ts.time()
            weekday = ts.weekday()
            is_weekday, is_saturday, is_sunday = weekday <= 4, weekday == 5, weekday == 6
            is_summer = is_summer_time(ts.date())
            simples, bd, bs, td, ts_period = 'S', '', '', '', ''
            if time >= datetime.strptime("22:00", "%H:%M").time() or time < datetime.strptime("08:00", "%H:%M").time(): bd = 'V'
            else: bd = 'F'
            if time >= datetime.strptime("22:00", "%H:%M").time() or time < datetime.strptime("08:00", "%H:%M").time(): td = 'V'
            else:
                if is_summer:
                    if (time >= datetime.strptime("10:30", "%H:%M").time() and time < datetime.strptime("13:00", "%H:%M").time()) or \
                       (time >= datetime.strptime("19:30", "%H:%M").time() and time < datetime.strptime("21:00", "%H:%M").time()): td = 'P'
                    else: td = 'C'
                else:
                    if (time >= datetime.strptime("09:00", "%H:%M").time() and time < datetime.strptime("10:30", "%H:%M").time()) or \
                       (time >= datetime.strptime("18:00", "%H:%M").time() and time < datetime.strptime("20:30", "%H:%M").time()): td = 'P'
                    else: td = 'C'
            if is_sunday:
                bs, ts_period = 'V', 'V'
            elif is_saturday:
                if is_summer:
                    if (time >= datetime.strptime("09:00", "%H:%M").time() and time < datetime.strptime("14:00", "%H:%M").time()) or \
                       (time >= datetime.strptime("20:00", "%H:%M").time() and time < datetime.strptime("22:00", "%H:%M").time()): bs, ts_period = 'F', 'C'
                    else: bs, ts_period = 'V', 'V'
                else:
                    if (time >= datetime.strptime("09:30", "%H:%M").time() and time < datetime.strptime("13:00", "%H:%M").time()) or \
                       (time >= datetime.strptime("18:30", "%H:%M").time() and time < datetime.strptime("22:00", "%H:%M").time()): bs, ts_period = 'F', 'C'
                    else: bs, ts_period = 'V', 'V'
            elif is_weekday:
                if time < datetime.strptime("07:00", "%H:%M").time(): bs, ts_period = 'V', 'V'
                else:
                    bs = 'F'
                    if is_summer:
                        if time >= datetime.strptime("09:15", "%H:%M").time() and time < datetime.strptime("12:15", "%H:%M").time(): ts_period = 'P'
                        else: ts_period = 'C'
                    else:
                        if (time >= datetime.strptime("09:30", "%H:%M").time() and time < datetime.strptime("12:00", "%H:%M").time()) or \
                           (time >= datetime.strptime("18:30", "%H:%M").time() and time < datetime.strptime("21:00", "%H:%M").time()): ts_period = 'P'
                        else: ts_period = 'C'
            return simples, bd, bs, td, ts_period

        df_com_ciclos[['Simples', 'BD', 'BS', 'TD', 'TS']] = df_com_ciclos.apply(
            calcular_ciclos, axis=1, result_type='expand'
        )

        # --- 5b. Preparar a Tabela Principal para Exportação ---
        df_principal = df_com_ciclos.copy()
        
        # Formatar a coluna de dia
        df_principal['dia'] = df_principal['datetime_pt'].dt.strftime('%d/%m/%Y')
        
        # Definir os timestamps de início e fim de cada intervalo
        start_time = df_principal['datetime_pt']
        end_time = start_time + pd.Timedelta(minutes=15)
        
        # 1. Criar a coluna 'hora' com a hora de fim do intervalo
        df_principal['hora'] = end_time.dt.strftime('%H:%M')
        # 2. Aplicar a regra especial: substituir '00:00' por '23:59'
        df_principal.loc[df_principal['hora'] == '00:00', 'hora'] = '23:59'

        # Gerar a coluna 'intervalo'
        df_principal['intervalo'] = '[' + start_time.dt.strftime('%H:%M') + '-' + end_time.dt.strftime('%H:%M') + '['

        df_principal.rename(columns={'Preco_PT': 'preco_pt', 'Preco_ES': 'preco_es'}, inplace=True)
        
        # Definir a ordem final das colunas
        colunas_finais = [
            'dia', 'hora', 'intervalo', 'Simples', 'BD', 'BS', 'TD', 'TS', 
            'preco_pt', 'preco_es'
        ]
        df_principal = df_principal[colunas_finais]

        # --- 5c. Preparar a Tabela Secundária (Datas de Atualização) ---
        ultima_data_omie = dados_combinados_qh['Data'].max()
        dados_atualizacao = {
            'chave': ['Data_Valores_OMIE', 'Data_Valores_OMIP'],
            'valor': [
                ultima_data_omie.strftime('%d/%m/%Y'), 
                data_relatorio_omip.strftime('%d/%m/%Y')
            ]
        }
        df_atualizacao = pd.DataFrame(dados_atualizacao)

        # --- 5d. Escrever as tabelas no mesmo ficheiro CSV ---
        try:
            with open(FICHEIRO_CSV, 'w', encoding='utf-8-sig', newline='') as f:
                df_principal.to_csv(f, index=False, decimal='.', float_format='%.2f')
                f.write("\nTABELA_ATUALIZACOES\n")
                df_atualizacao.to_csv(f, index=False, header=True)

                if not futuros_pt.empty:
                    f.write("\nTABELA_FUTUROS_PT\n")
                    futuros_pt.to_csv(f, index=False, decimal='.', float_format='%.2f')
                
                if not futuros_es.empty:
                    f.write("\nTABELA_FUTUROS_ES\n")
                    futuros_es.to_csv(f, index=False, decimal='.', float_format='%.2f')
            
            print(f"✅ Ficheiro CSV '{FICHEIRO_CSV}' criado com sucesso com todas as tabelas.")
            print(f"   - Inclui colunas de ciclos horários e tabela de datas de atualização.")
        except Exception as e:
            print(f"❌ Erro ao escrever o ficheiro CSV final: {e}")
            raise

    except Exception as e:
        import traceback
        print(f"❌ Ocorreu um erro inesperado no processo: {e}")
        traceback.print_exc()

# PONTO DE ENTRADA DO SCRIPT
if __name__ == "__main__":
    run_update_process()