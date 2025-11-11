import requests
import pandas as pd
import io
from datetime import date 

# --- 1. CONFIGURAÇÕES ---

API_REN_SERVICE_ID = "1354"
URL_REN_API = f"https://datahub.ren.pt/service/download/csv/{API_REN_SERVICE_ID}"
NOME_FICHEIRO_SAIDA = "data/producao_dados_atuais.csv" # <- Corrigi o caminho


def buscar_dados_ren(data_inicio, data_fim):
    """
    Busca os dados de Repartição da Produção da REN para um intervalo de datas.
    """
    print(f"Buscando dados da REN de {data_inicio} a {data_fim}...")
    
    params = {
        "startDateString": data_inicio,
        "endDateString": data_fim,
        "culture": "pt-PT"
    }
    
    # --- CORREÇÃO DE CACHE AQUI ---
    # Estes 'headers' dizem ao servidor da REN para NÃO enviar
    # uma resposta em cache e forçar um download novo.
    headers = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
    }
    # --- FIM DA CORREÇÃO ---
    
    try:
        # Adicionámos o parâmetro 'headers=headers' ao pedido
        response = requests.get(URL_REN_API, params=params, headers=headers)
        response.raise_for_status() 
        response_text = response.content.decode('utf-8')
        
        dados_ren = pd.read_csv(
            io.StringIO(response_text), 
            sep=';', 
            skiprows=2, 
            engine='python'
        )
        
        dados_ren['datetime'] = pd.to_datetime(
            dados_ren['Data e Hora'], 
            format='%Y-%m-%d %H:%M:%S'
        )

        print("Dados da REN carregados com sucesso (sem cache).")
        return dados_ren

    except Exception as e:
        print(f"Erro CRÍTICO ao buscar dados da REN: {e}")
        return None

def transformar_dados(df_ren):
    """
    Transforma o DataFrame da REN para o formato do ficheiro OMIE.
    Cria as colunas 'dia', 'hora' e 'intervalo'.
    """
    if df_ren is None or 'datetime' not in df_ren.columns:
        print("DataFrame de entrada inválido. Transformação cancelada.")
        return None
        
    print("Iniciando transformação para o formato OMIE...")
    
    df_final = df_ren.copy()
    df_final['dia'] = df_final['datetime'].dt.strftime('%d/%m/%Y')
    
    hora_inicio_str = df_final['datetime'].dt.strftime('%H:%M')
    datetime_fim = df_final['datetime'] + pd.Timedelta(minutes=15)
    hora_fim_str = datetime_fim.dt.strftime('%H:%M')

    df_final['intervalo'] = '[' + hora_inicio_str + '-' + hora_fim_str + '['
    
    # Substitui '00:00' por '23:59' (APENAS na coluna 'hora')
    df_final['hora'] = hora_fim_str.replace('00:00', '23:59')
    
    colunas_a_remover = ['Data e Hora', 'datetime']
    colunas_dados = [col for col in df_final.columns if col not in colunas_a_remover]
    
    colunas_finais = ['dia', 'hora', 'intervalo'] + \
                     [col for col in colunas_dados if col not in ['dia', 'hora', 'intervalo']]
    
    df_final = df_final[colunas_finais]
    
    print("Transformação concluída.")
    return df_final


# --- 4. EXECUÇÃO PRINCIPAL DO SCRIPT ---

if __name__ == "__main__":
    
    print("--- INICIANDO SCRIPT DE ATUALIZAÇÃO DA PRODUÇÃO (REN) ---")
    
    hoje = date.today()
    ano_atual = hoje.year
    
    DATA_INICIO = f"{ano_atual}-01-01"
    DATA_FIM = hoje.strftime('%Y-%m-%d')
    
    df_ren_bruto = buscar_dados_ren(DATA_INICIO, DATA_FIM)
    
    if df_ren_bruto is not None:
        
        df_producao_formatado = transformar_dados(df_ren_bruto)
        
        if df_producao_formatado is not None:
            try:
                # NOTA: Verifiquei o seu link. O ficheiro está em /data/
                # O script deve guardar no sítio certo.
                df_producao_formatado.to_csv(
                    NOME_FICHEIRO_SAIDA, 
                    index=False, 
                    encoding='utf-8-sig'
                )
                print(f"\nSUCESSO! Ficheiro '{NOME_FICHEIRO_SAIDA}' criado com {len(df_producao_formatado)} registos.")
                print(f"Intervalo de dados: {df_producao_formatado['dia'].iloc[0]} a {df_producao_formatado['dia'].iloc[-1]}")
                
            except Exception as e:
                print(f"Erro CRÍTICO ao guardar o ficheiro CSV: {e}")
        else:
            print("Falha na transformação dos dados. Ficheiro não guardado.")
    else:
        print("Falha na busca de dados. Script terminado.")
        
    print("--- SCRIPT TERMINADO ---")
