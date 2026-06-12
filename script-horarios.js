document.addEventListener('DOMContentLoaded', function () {
    // --- VARIÁVEIS GLOBAIS ---
    let dadosEstruturados = {};       // Dados quarto-horários (96 pontos por dia/tarifário/opção)
    let dadosEstruturadosHora = {};   // Dados horários (24 pontos), derivados por média das QH
    let dadosCSVGlobal = "";
    let chartInstance = null; // Guardar referência ao gráfico
    let constantes = {}; // Constantes carregadas da TABELA_CONSTANTES

    // Estado da tabela
    let estadoTabela = {
        dados: [],
        quartisOmie: {},
        quartisPreco: {},
        colunaOrdenada: null,
        direcaoOrdenacao: 1
    };

    // --- HELPERS: data ---
    function getHojeStr() {
        return new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
    }
    function getAmanhaStr() {
        return new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));
    }

    // --- HELPERS: vista atual ---
    function getVistaAtual() {
        return document.querySelector('input[name="vista"]:checked')?.value || "quartohoraria";
    }
    function getFonteDadosAtual() {
        return getVistaAtual() === "horaria" ? dadosEstruturadosHora : dadosEstruturados;
    }

    // --- HELPER: formato numérico português (vírgula decimal) ---
    function fmtPt(v, casas) {
        if (v === null || v === undefined || isNaN(v)) return "—";
        return Number(v).toFixed(casas).replace('.', ',');
    }

    // --- HELPERS: localStorage para consumos ---
    function chaveConsumos(vista) {
        return `precosHorariosConsumos:${vista}`;
    }
    function carregarConsumosGravados(vista) {
        try {
            const raw = localStorage.getItem(chaveConsumos(vista));
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }
    function gravarConsumo(vista, intervalo, valor) {
        try {
            const atual = carregarConsumosGravados(vista);
            if (valor && valor > 0) atual[intervalo] = valor;
            else delete atual[intervalo];
            localStorage.setItem(chaveConsumos(vista), JSON.stringify(atual));
        } catch (e) {}
    }
    function limparConsumosGravados(vista) {
        try { localStorage.removeItem(chaveConsumos(vista)); } catch (e) {}
    }

    // --- PARSE DAS CONSTANTES ---
    function parseConstantes(csv) {
        constantes = {};
        const linhas = csv.split("\n");
        const idxTag = linhas.findIndex(l => l.includes("TABELA_CONSTANTES"));
        if (idxTag === -1) return;

        // Linha seguinte é o cabeçalho — ignorar; depois vêm os dados
        for (let i = idxTag + 2; i < linhas.length; i++) {
            const linha = linhas[i];
            if (!linha.trim()) break;
            // Cada linha tem 18 vírgulas de offset: ,,,,,,,,,,,,,,,,,, chave, valor
            const colunas = linha.split(",");
            const chave = colunas[18]?.trim();
            const valor = colunas[19]?.trim();
            if (chave && valor !== undefined && valor !== "") {
                constantes[chave] = parseFloat(valor);
            }
        }
    }

    // --- PARSE DO CSV ---
    function parseCSV(csv) {
        dadosEstruturados = {};
        const linhas = csv.split("\n");

        linhas.slice(1).forEach(row => {
            if (!row.trim()) return;
            const colunas = row.split(",");
            
            // Proteção básica contra linhas mal formatadas
            if (colunas.length < 8) return;

            const dia = colunas[0];
            const tarifario = colunas[1];
            const opcao = colunas[2];
            const intervalo = colunas[3];
            
            const parseNum = (val) => {
                if (!val || val.trim() === "") return null;
                return parseFloat(val.replace(",", "."));
            };

            const col = parseNum(colunas[4]);
            const omie = parseNum(colunas[5]);
            const tar = parseNum(colunas[6]);
            const omieTar = parseNum(colunas[7]);

            if (!dia) return;

            if (!dadosEstruturados[dia]) dadosEstruturados[dia] = {};
            if (!dadosEstruturados[dia][tarifario]) dadosEstruturados[dia][tarifario] = {};
            if (!dadosEstruturados[dia][tarifario][opcao]) {
                dadosEstruturados[dia][tarifario][opcao] = {
                    categorias: [], colunas: [], omie: [], tar: [], omieTar: []
                };
            }
            const grupo = dadosEstruturados[dia][tarifario][opcao];
            grupo.categorias.push(intervalo);
            grupo.colunas.push(col);
            grupo.omie.push(omie);
            grupo.tar.push(tar);
            grupo.omieTar.push(omieTar);
        });
    }

    // --- CONSTRUIR DADOS HORÁRIOS (média das 4 QH de cada hora) ---
    // Equivale matematicamente ao bloco TABELA_HORARIA do CSV, mas obtemos
    // tar e omieTar para que as linhas opcionais do gráfico funcionem na vista Horária.
    function construirDadosHorarios() {
        dadosEstruturadosHora = {};
        const acumular = (arr, h) => {
            let sum = 0, cnt = 0;
            for (let q = 0; q < 4; q++) {
                const v = arr[h * 4 + q];
                if (v !== null && v !== undefined && !isNaN(v)) { sum += v; cnt++; }
            }
            return cnt > 0 ? sum / cnt : null;
        };
        for (const dia in dadosEstruturados) {
            dadosEstruturadosHora[dia] = {};
            for (const tarifario in dadosEstruturados[dia]) {
                dadosEstruturadosHora[dia][tarifario] = {};
                for (const opcao in dadosEstruturados[dia][tarifario]) {
                    const qh = dadosEstruturados[dia][tarifario][opcao];
                    const hora = { categorias: [], colunas: [], omie: [], tar: [], omieTar: [] };
                    for (let h = 0; h < 24; h++) {
                        const start = h.toString().padStart(2, '0') + ':00';
                        const endLabel = h === 23 ? '00:00' : (h + 1).toString().padStart(2, '0') + ':00';
                        hora.categorias.push(`[${start}-${endLabel}[`);
                        hora.colunas.push(acumular(qh.colunas, h));
                        hora.omie.push(acumular(qh.omie, h));
                        hora.tar.push(acumular(qh.tar, h));
                        hora.omieTar.push(acumular(qh.omieTar, h));
                    }
                    dadosEstruturadosHora[dia][tarifario][opcao] = hora;
                }
            }
        }
    }

    // --- DROPDOWNS ---
    function populaDropdowns(hojePadrao) {
        const urlParams = new URLSearchParams(window.location.search);
        const paramDia = urlParams.get('dia');
        const paramTarifario = urlParams.get('tarifario');
        const paramOpcao = urlParams.get('opcao');
        
        const diaSelect = document.getElementById("dropdownDia");
        const tarifarioSelect = document.getElementById("dropdownTarifario");
        const opcaoSelect = document.getElementById("dropdownOpcao");

        const diasDisponiveis = Object.keys(dadosEstruturados);
        diaSelect.innerHTML = diasDisponiveis.map(d => `<option value="${d}">${d}</option>`).join("");

        if (diasDisponiveis.includes(hojePadrao)) {
            diaSelect.value = hojePadrao;
        } else if (diasDisponiveis.length > 0) {
            diaSelect.value = diasDisponiveis[diasDisponiveis.length - 1];
        }

        diaSelect.addEventListener("change", atualizaTarifario);
        tarifarioSelect.addEventListener("change", atualizaOpcao);
        opcaoSelect.addEventListener("change", desenhaGrafico);

        function atualizaTarifario() {
            const dia = diaSelect.value;
            const tarifarios = Object.keys(dadosEstruturados[dia] || {});
            const tarifarioSelecionadoIndex = tarifarioSelect.selectedIndex;
            tarifarioSelect.innerHTML = tarifarios.map(t => `<option value="${t}">${t}</option>`).join("");

            if (tarifarios.length > 1) {
                if (tarifarioSelecionadoIndex >= 0 && tarifarioSelecionadoIndex < tarifarios.length) {
                    tarifarioSelect.selectedIndex = tarifarioSelecionadoIndex;
                } else {
                    tarifarioSelect.selectedIndex = 1; 
                }
            }
            atualizaOpcao();
        }

        function atualizaOpcao() {
            const dia = diaSelect.value;
            const tarifario = tarifarioSelect.value;
            const opcaoSelecionadaIndex = opcaoSelect.selectedIndex;
            const opcoes = Object.keys(dadosEstruturados[dia]?.[tarifario] || {});
            opcaoSelect.innerHTML = opcoes.map(o => `<option value="${o}">${o}</option>`).join("");

            if (opcaoSelecionadaIndex >= 0 && opcaoSelecionadaIndex < opcoes.length) {
                opcaoSelect.selectedIndex = opcaoSelecionadaIndex;
            }
            desenhaGrafico();
        }
        
        atualizaTarifario();

        // --- QUERY PARAMS: aplicar estado da URL após o carregamento inicial ---
        // Passo 1: aplicar 'dia' ('hoje', 'amanha' ou índice numérico)
        if (paramDia) {
            if (paramDia === 'hoje') {
                diaSelect.value = hojePadrao;
                atualizaTarifario();
            } else if (paramDia === 'amanha') {
                const fmtLx = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric' });
                const amanhaStr = fmtLx.format(new Date(Date.now() + 24 * 60 * 60 * 1000));
                if (Array.from(diaSelect.options).some(o => o.value === amanhaStr)) {
                    diaSelect.value = amanhaStr;
                    atualizaTarifario();
                }
            } else {
                const idx = parseInt(paramDia);
                if (!isNaN(idx) && idx >= 0 && idx < diaSelect.options.length) {
                    diaSelect.selectedIndex = idx;
                    atualizaTarifario();
                }
            }
        }

        // Passo 2: aplicar 'tarifario' por índice
        if (paramTarifario !== null) {
            const idx = parseInt(paramTarifario);
            if (!isNaN(idx) && idx >= 0 && idx < tarifarioSelect.options.length) {
                tarifarioSelect.selectedIndex = idx;
                atualizaOpcao();
            }
        }

        // Passo 3: aplicar 'opcao' por índice
        if (paramOpcao !== null) {
            const idx = parseInt(paramOpcao);
            if (!isNaN(idx) && idx >= 0 && idx < opcaoSelect.options.length) {
                opcaoSelect.selectedIndex = idx;
                desenhaGrafico();
            }
        }
    }

    // Função auxiliar para calcular quartis (USADA NO GRÁFICO E NA TABELA)
    function calcularQuartisEstatisticos(arr) {
        // Filtra nulos e ordena
        const valores = arr.filter(v => v !== null && v !== undefined && !isNaN(v)).sort((a, b) => a - b);
        
        if (valores.length === 0) return { q1: 0, q2: 0, q3: 0 };

        const getQuartile = (sortedArr, q) => {
            const pos = (sortedArr.length - 1) * q;
            const base = Math.floor(pos);
            const rest = pos - base;
            if (sortedArr[base + 1] !== undefined) {
                return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
            } else {
                return sortedArr[base];
            }
        };

        return {
            q1: getQuartile(valores, 0.25),
            q2: getQuartile(valores, 0.50),
            q3: getQuartile(valores, 0.75)
        };
    }

    function formatValue(value, casas) {
        if (value === null) return "Não disponível";
        const n = (typeof casas === 'number') ? casas : 5;
        const formatted = `${fmtPt(value, n)} €/kWh`;
        return value < 0 ? `<span class="valor-negativo">${formatted}</span>` : formatted;
    }

    // --- FÓRMULAS POR TARIFÁRIO ---
    function mostrarFormula(tarifario) {
        const container = document.getElementById('formula-container');
        const details = document.getElementById('formula-details');
        if (!container || !details) return;

        // Helper: lê constante do objeto global, formata com 4 casas decimais + unidade
        const c = (key, unit = '€/kWh', decimais = 4) => {
            const val = constantes[key];
            if (val === undefined || isNaN(val)) return `<em title="${key}">${key}</em>`;
            return `<strong>${val.toFixed(decimais).replace('.', ',')} ${unit}</strong>`;
        };

        const formulas = {
            "Alfa Power Index BTN": {
                expr: `Preço = (OMIE + CGS) × (1 + Perdas) + k + TAR + TSE`,
                legenda: [
                    ["OMIE", "Preço de energia por hora no mercado OMIE (€/kWh)"],
                    ["CGS", () => `Custos de gestão geral do sistema - Na ausência de um valor fixo, utiliza-se o valor médio de ERC do mês atual: ${c('Alfa_CGS', '€/kWh', 5)}. Nota: este valor é uma aproximação, pois o CGS real varia todos os 15 minutos. Valor atualizado semanalmente com base nos dados mais recentes disponíveis.`],
                    ["Perdas", "Perdas da rede fixadas pela ERSE (variável)"],
                    ["k", () => `Gastos operacionais Alfa Energia: ${c('Alfa_K', '€/kWh', 3)}`],
                    ["TAR", "Tarifas de Acesso às Redes (ERSE): o valor quarto-horário varia consoante o ciclo (Diário ou Semanal) e a opção horária. A opção Simples tem uma tarifa única; a Bi-horária distingue Vazio e Fora de Vazio; e a Tri-horária divide-se em Vazio, Cheias e Ponta."],
                    ["TSE", () => `Financiamento Tarifa Social de Eletricidade: ${c('Financiamento_TSE', '€/kWh', 7)}`],
                ]
            },
            "Coopérnico Base": {
                expr: `P<sub>Energia</sub> = (OMIE + k) × (1 + FP) + (CS + CR) × (1 + FP) + TAR + TSE`,
                legenda: [
                    ["OMIE", "Preço de mercado grossista para cada quarto de hora (€/kWh)"],
                    ["k", () => `Margem Coopérnico: ${c('Coop_K', '€/kWh', 3)}`],
                    ["FP", "Perfil de Perda (variável)"],
                    ["CS + CR", () => `Custos de Sistema + Regulação - Na ausência de um valor fixo, utiliza-se o valor médio de ERC do mês atual: ${c('Coop_CS_CR', '€/kWh', 5)}. Nota: este valor é uma aproximação, pois o CS+CR real varia todos os 15 minutos. Valor atualizado semanalmente com base nos dados mais recentes disponíveis.`],
                    ["TAR", "Tarifas de Acesso às Redes (ERSE): o valor quarto-horário varia consoante o ciclo (Diário ou Semanal) e a opção horária. A opção Simples tem uma tarifa única; a Bi-horária distingue Vazio e Fora de Vazio; e a Tri-horária divide-se em Vazio, Cheias e Ponta."],
                    ["TSE", () => `Financiamento Tarifa Social de Eletricidade: ${c('Financiamento_TSE', '€/kWh', 7)}`],
                ]
            },
            "Coopérnico GO": {
                expr: `P<sub>Energia</sub> = (OMIE + k) × (1 + FP) + (CS + CR) × (1 + FP) + GO + TAR + TSE`,
                legenda: [
                    ["OMIE", "Preço de mercado grossista para cada quarto de hora (€/kWh)"],
                    ["k", () => `Margem Coopérnico: ${c('Coop_K', '€/kWh', 3)}`],
                    ["GO", () => `Garantias de Origem: ${c('Coop_GO', '€/kWh', 3)}`],
                    ["FP", "Perfil de Perda (variável)"],
                    ["CS + CR", () => `Custos de Sistema + Regulação - Na ausência de um valor fixo, utiliza-se o valor médio de ERC do mês atual: ${c('Coop_CS_CR', '€/kWh', 5)}. Nota: este valor é uma aproximação, pois o CS+CR real varia todos os 15 minutos. Valor atualizado semanalmente com base nos dados mais recentes disponíveis.`],
                    ["TAR", "Tarifas de Acesso às Redes (ERSE): o valor quarto-horário varia consoante o ciclo (Diário ou Semanal) e a opção horária. A opção Simples tem uma tarifa única; a Bi-horária distingue Vazio e Fora de Vazio; e a Tri-horária divide-se em Vazio, Cheias e Ponta."],
                    ["TSE", () => `Financiamento Tarifa Social de Eletricidade: ${c('Financiamento_TSE', '€/kWh', 7)}`],
                ]
            },
            "EDP Indexada Horária": {
                expr: `P<sub>i</sub> = Σ<sub>i</sub> [(P<sub>OMIE i</sub> × (1 + Perdas<sub>i</sub>) × K<sub>1</sub> + K<sub>2</sub> + TAR<sub>Energia i</sub>]`,
                legenda: [
                    ["OMIE", "Preço de mercado grossista para cada quarto de hora (€/kWh)"],
                    ["Perdas<sub>i</sub>", "Coeficiente de ajustamento para perdas na rede (variável)"],
                    ["K<sub>1</sub>", () => c('EDP_H_K1', '(adimensional)', 2)],
                    ["K<sub>2</sub>", () => c('EDP_H_K2')],
                    ["TAR", "Tarifas de Acesso às Redes (ERSE): o valor quarto-horário varia consoante o ciclo (Diário ou Semanal) e a opção horária. A opção Simples tem uma tarifa única; a Bi-horária distingue Vazio e Fora de Vazio; e a Tri-horária divide-se em Vazio, Cheias e Ponta."],
                ]
            },
            "EZU Tarifa Indexada": {
                expr: `P<sub>p</sub> = Σ (OMIE<sub>h</sub> + CGS<sub>h</sub> + k<sub>p</sub>) × (1 + Perda<sub>ERSE</sub>) + TAR + TSE`,
                legenda: [
                    ["OMIE", "Preço de energia por hora no mercado OMIE (€/kWh)"],
                    ["CGS", () => `Custos de gestão geral do sistema - Na ausência de um valor fixo, utiliza-se o valor médio de ERC do mês atual: ${c('EZU_CGS', '€/kWh', 5)}. Nota: este valor é uma aproximação, pois o CGS real varia todos os 15 minutos. Valor atualizado semanalmente com base nos dados mais recentes disponíveis.`],
                    ["Perda<sub>ERSE</sub>", "Perdas da rede fixadas pela ERSE (variável)"],
                    ["k", () => { const mwh = constantes['EZU_K'] !== undefined ? ` (${(constantes['EZU_K']*1000).toFixed(2).replace('.',',')} €/MWh)` : ''; return `Gastos operacionais EZU Energia: ${c('EZU_K')}${mwh}`; }],
                    ["TAR", "Tarifas de Acesso às Redes (ERSE): o valor quarto-horário varia consoante o ciclo (Diário ou Semanal) e a opção horária. A opção Simples tem uma tarifa única; a Bi-horária distingue Vazio e Fora de Vazio; e a Tri-horária divide-se em Vazio, Cheias e Ponta."],
                    ["TSE", () => `Financiamento Tarifa Social de Eletricidade: ${c('Financiamento_TSE', '€/kWh', 7)}`],
                ]
            },
            "G9 Smart Dynamic": {
                expr: `PE<sub>(15m)</sub> = OMIE<sub>(15m)</sub> × F<sub>adeq</sub> × (1 + Perdas<sub>(15m)</sub>) + GGS + AC + TAR`,
                legenda: [
                    ["OMIE", "Preço de mercado grossista para cada quarto de hora (€/kWh)"],
                    ["F<sub>adeq</sub>", () => `Fator de adequação: ${c('G9_FA', '(adimensional)', 2)}`],
                    ["Perdas", "Perdas nas redes de transporte e distribuição (variável)"],
                    ["GGS", () => `Garantia de Gestão e Serviço: ${c('G9_CGS')}`],
                    ["AC", () => `Ajuste Comercial: ${c('G9_AC')}`],
                    ["TAR", "Tarifas de Acesso às Redes (ERSE): o valor quarto-horário varia consoante o ciclo (Diário ou Semanal) e a opção horária. A opção Simples tem uma tarifa única; a Bi-horária distingue Vazio e Fora de Vazio; e a Tri-horária divide-se em Vazio, Cheias e Ponta."],
                ]
            },
            "Galp Plano Dinâmico": {
                expr: `Preço = ENERGIA<sub>GALP</sub> + TAR<sub>ENERGIA</sub><br>ENERGIA<sub>GALP</sub> = Σ[(PMi + Ci) × (1 + Li)]`,
                legenda: [
                    ["PMi", "Preço horário OMIE Portugal (€/kWh), vigente em cada 15 minutos"],
                    ["Ci", () => `Componente de Comercializador (margem, desvios, garantias de origem, etc.): ${c('Galp_Ci')}`],
                    ["Li", "Perdas em percentagem para cada 15 minutos, publicadas pela ERSE (percentual)"],
                    ["TAR<sub>ENERGIA</sub>", "Tarifas de Acesso às Redes (ERSE): o valor quarto-horário varia consoante o ciclo (Diário ou Semanal) e a opção horária. A opção Simples tem uma tarifa única; a Bi-horária distingue Vazio e Fora de Vazio; e a Tri-horária divide-se em Vazio, Cheias e Ponta."],
                ]
            },
            "Iberdrola - Simples Indexado Dinâmico": {
                expr: `Preço Energia <sub>IBERDROLA</sub> = POMIE<sub>P</sub> × (1 + Perdas) + Q + Banda mFRR + TAR + TSE`,
                legenda: [
                    ["POMIE<sub>P</sub>", "Custo da eletricidade no mercado ibérico em Portugal (€/kWh), em intervalos de 15 minutos"],
                    ["Perdas", "Coeficientes de perdas por quarto de hora, conforme legislação em vigor (%)"],
                    ["Q", () => `Custo de operação e gestão do sistema + componente de comercialização da Iberdrola: ${c('Iberdrola_Dinamico_Q', '€/kWh', 3)}`],
                    ["Banda mFRR", () => `Sobrecusto associado ao leilão da Banda de Reserva de Restabelecimento de Frequência com Ativação Manual: ${c('Iberdrola_mFRR', '€/kWh', 5)}`],
                    ["TAR", "Tarifas de Acesso às Redes (ERSE): tarifa única, aplicável apenas à opção Simples."],
                    ["TSE", () => `Financiamento Tarifa Social de Eletricidade: ${c('Financiamento_TSE', '€/kWh', 7)}`],
                ]
            },
            "MeoEnergia Tarifa Variável": {
                expr: `P<sub>ENERGIA</sub> = (P<sub>OMIE</sub> + K) × (1 + FP) + TAR`,
                legenda: [
                    ["P<sub>OMIE</sub>", "Custo da eletricidade no mercado ibérico em Portugal (€/kWh), em intervalos de 15 minutos"],
                    ["K", () => `Inclui Gestão do sistema, desvios e margem: ${c('Meo_K')}`],
                    ["FP", "Fator de Perdas — ajustamento para perdas na rede de Baixa Tensão (variável, ERSE)"],
                    ["TAR", "Tarifas de Acesso às Redes (ERSE): o valor quarto-horário varia consoante o ciclo (Diário ou Semanal) e a opção horária. A opção Simples tem uma tarifa única; a Bi-horária distingue Vazio e Fora de Vazio; e a Tri-horária divide-se em Vazio, Cheias e Ponta."],
                ]
            },
            "Plenitude - Tendência": {
                expr: `(OMIE + CGS + GDOs) × Perdas + Fee + TAR`,
                legenda: [
                    ["OMIE", "Preço do mercado diário (OMIE)"],
                    ["CGS", () => `Corresponde à soma dos custos de gestão do sistema da REN com os custos de desvio a pagar por todos os comercializadores de eletricidade - Na ausência de um valor fixo, utiliza-se o valor médio de ERC do mês atual: ${c('Plenitude_CGS', '€/kWh', 5)}`],
                    ["GDOs", () => `Custo das garantias de origem: ${c('Plenitude_GDOs', '€/kWh', 5)}. Nota: este valor é uma aproximação, pois o CGS real varia todos os 15 minutos. Valor atualizado semanalmente com base nos dados mais recentes disponíveis.`],
                    ["Perdas", "Perfil de perdas da rede de distribuição, com base no perfil de perdas regulado pela ERSE."],
                    ["Fee", () => `Margem comercial da Plenitude, estabelecida para o preço indexado: ${c('Plenitude_Fee', '€/kWh', 3)}`],
                    ["TAR", "Tarifas de Acesso às Redes (ERSE): tarifa única, aplicável apenas à opção Simples."],
                ]
            },
            "Repsol Leve Sem Mais": {
                expr: `Preço = Σ (P<sub>OMIE</sub> × (1 + Perdas) × FA + QTarifa + FinTS) + TAR`,
                legenda: [
                    ["P<sub>OMIE 15min</sub>", "Preço marginal no sistema Português por quarto de hora, publicado pelo OMIE (€/MWh)"],
                    ["Perdas<sub>15min</sub>", "Coeficientes de perdas por quarto de hora, conforme legislação em vigor (%)"],
                    ["FA", () => `Fator de adequação: ${c('Repsol_FA', '(adimensional)', 2)}`],
                    ["QTarifa", () => `Serviços Complementares, Encargos, Desvios e Margem Repsol: ${c('Repsol_Q_Tarifa', '€/kWh', 5)}`],
                    ["FinTS", () => `Financiamento Tarifa Social de Eletricidade: ${c('Financiamento_TSE', '€/kWh', 7)}`],
                    ["TAR", "Tarifas de Acesso às Redes (ERSE): o valor quarto-horário varia consoante o ciclo (Diário ou Semanal) e a opção horária. A opção Simples tem uma tarifa única; a Bi-horária distingue Vazio e Fora de Vazio; e a Tri-horária divide-se em Vazio, Cheias e Ponta."],
                ]
            },
        };

        const def = formulas[tarifario];
        if (!def || !def.expr) {
            details.style.display = 'none';
            return;
        }

        const legendaHTML = def.legenda
            .map(([sigla, desc]) => {
                const texto = typeof desc === 'function' ? desc() : desc;
                return `<span>${sigla}</span> — ${texto}`;
            })
            .join('<br>');

        container.innerHTML = `
            <div class="formula-expr">${def.expr}</div>
            ${legendaHTML ? `<div class="formula-legenda">${legendaHTML}</div>` : ''}
        `;
        details.style.display = 'block';
    }

    // --- MINI-RESUMO DO DIA (chips acima do gráfico) ---
    function atualizarMiniResumo(dados, fonte, dia, tarifario, opcao) {
        const container = document.getElementById('miniResumo');
        if (!container) return;
        container.innerHTML = '';

        if (!dados || !Array.isArray(dados.colunas) || !Array.isArray(dados.categorias)) return;

        const valores = dados.colunas
            .map((v, i) => ({ v, i }))
            .filter(x => x.v !== null && x.v !== undefined && !isNaN(x.v));
        if (valores.length === 0) return;

        const ordenados = valores.slice().sort((a, b) => a.v - b.v);
        const minimo = ordenados[0];
        const maximo = ordenados[ordenados.length - 1];
        const media = valores.reduce((s, x) => s + x.v, 0) / valores.length;

        // Média do dia anterior (no dataset; pode não ser literalmente "ontem" se houver gaps)
        const parseDia = (s) => {
            const [d, m, y] = s.split('/');
            return new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).getTime();
        };
        const diasOrdenados = Object.keys(fonte).sort((a, b) => parseDia(a) - parseDia(b));
        const idxAtual = diasOrdenados.indexOf(dia);
        let mediaAnterior = null;
        let diaAnteriorLabel = null;
        if (idxAtual > 0) {
            diaAnteriorLabel = diasOrdenados[idxAtual - 1];
            const datAnt = fonte[diaAnteriorLabel]?.[tarifario]?.[opcao];
            if (datAnt?.colunas) {
                const vAnt = datAnt.colunas.filter(v => v !== null && v !== undefined && !isNaN(v));
                if (vAnt.length > 0) {
                    mediaAnterior = vAnt.reduce((s, v) => s + v, 0) / vAnt.length;
                }
            }
        }

        const decimaisMR = getVistaAtual() === "horaria" ? 4 : 5;
        const fmtPreco = v => v.toFixed(decimaisMR).replace('.', ',') + ' €/kWh';
        const fmtHora = cat => (cat || '').replace('[', '').split('-')[0];

        let html = '';
        html += `<div class="mini-resumo-chip">Mais barato: <strong>${fmtHora(dados.categorias[minimo.i])} (${fmtPreco(minimo.v)})</strong></div>`;
        html += `<div class="mini-resumo-chip">Mais caro: <strong>${fmtHora(dados.categorias[maximo.i])} (${fmtPreco(maximo.v)})</strong></div>`;
        html += `<div class="mini-resumo-chip">Média do dia: <strong>${fmtPreco(media)}</strong></div>`;

        if (mediaAnterior !== null && mediaAnterior !== 0) {
            const diff = (media - mediaAnterior) / mediaAnterior * 100;
            const cls = diff > 0.05 ? 'up' : (diff < -0.05 ? 'down' : '');
            const sinal = diff > 0 ? '+' : '';
            const tipLabel = diaAnteriorLabel ? ` (vs. ${diaAnteriorLabel})` : '';
            html += `<div class="mini-resumo-chip ${cls}" title="Comparação com a média do dia anterior disponível${tipLabel}">Vs. dia anterior: <strong>${sinal}${diff.toFixed(1).replace('.', ',')}%</strong></div>`;
        }

        container.innerHTML = html;
    }

    // --- VISIBILIDADE DO TOGGLE "SOBREPOR AMANHÃ" ---
    // Mostrar apenas quando: dia selecionado = hoje, AND amanhã existe no dataset para (tarifário, opção).
    function atualizarVisibilidadeSobreporAmanha() {
        const container = document.getElementById('sobreporAmanhaContainer');
        const checkbox = document.getElementById('checkboxSobreporAmanha');
        if (!container || !checkbox) return;

        const dia = document.getElementById('dropdownDia').value;
        const tarifario = document.getElementById('dropdownTarifario').value;
        const opcao = document.getElementById('dropdownOpcao').value;
        const hojeStr = getHojeStr();
        const amanhaStr = getAmanhaStr();

        const isHoje = (dia === hojeStr);
        const amanhaTemDados = !!(dadosEstruturados[amanhaStr]?.[tarifario]?.[opcao]);

        if (isHoje && amanhaTemDados) {
            container.style.display = 'flex';
        } else {
            container.style.display = 'none';
            if (checkbox.checked) checkbox.checked = false;
        }
    }

    // --- DESENHO DO GRÁFICO ---
    window.desenhaGrafico = function() {
        const dia = document.getElementById("dropdownDia").value;
        const tarifario = document.getElementById("dropdownTarifario").value;
        const opcao = document.getElementById("dropdownOpcao").value;

        const vista = getVistaAtual();
        const fonte = getFonteDadosAtual();
        const dados = fonte[dia]?.[tarifario]?.[opcao];
        if (!dados) return;

        // Texto da checkbox do simulador, conforme vista
        const lblSim = document.getElementById('labelSimular');
        if (lblSim) lblSim.textContent = vista === "horaria" ? "Simular consumos horários?" : "Simular consumos quarto-horários?";

        // Atualizar visibilidade do checkbox "Sobrepor amanhã" antes de o lermos
        atualizarVisibilidadeSobreporAmanha();
        const sobreporAmanhaActivo = document.getElementById("checkboxSobreporAmanha")?.checked;
        const amanhaStr = getAmanhaStr();
        const dadosAmanha = (sobreporAmanhaActivo && dia === getHojeStr())
            ? fonte[amanhaStr]?.[tarifario]?.[opcao]
            : null;

        // --- Atualizar URL com o estado atual (Omitir valores por defeito) ---
        (function() {
            const hojeStr = getHojeStr();
            const diaSelect = document.getElementById("dropdownDia");
            const tarifarioSelect = document.getElementById("dropdownTarifario");
            const opcaoSelect = document.getElementById("dropdownOpcao");

            let diaParam;
            if (dia === hojeStr) diaParam = 'hoje';
            else if (dia === amanhaStr) diaParam = 'amanha';
            else diaParam = diaSelect.selectedIndex.toString();

            const tarifarioParam = tarifarioSelect.selectedIndex.toString();
            const opcaoParam = opcaoSelect.selectedIndex.toString();

            // Verifica se as opções atuais são os valores por defeito
            const isDefault = (diaParam === 'hoje' && tarifarioParam === '1' && opcaoParam === '0');

            if (isDefault) {
                // Se for o estado padrão, limpa a querystring mantendo o link limpo
                window.history.replaceState(null, '', window.location.pathname);
            } else {
                // Se o utilizador escolheu outras opções, atualiza o link com os parâmetros
                const qp = new URLSearchParams();
                qp.set('dia', diaParam);
                qp.set('tarifario', tarifarioParam);
                qp.set('opcao', opcaoParam);
                window.history.replaceState(null, '', '?' + qp.toString());
            }
        })();

        mostrarFormula(tarifario);

        // Mini-resumo do dia (chips acima do gráfico)
        atualizarMiniResumo(dados, fonte, dia, tarifario, opcao);

        // Destruir gráfico existente se houver
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }

        // Atualiza a tabela se a checkbox estiver ativa
        if (document.getElementById("checkboxSimular").checked) {
            prepararDadosTabela(dia, tarifario, opcao, vista);
            document.getElementById("tabelaContainer").style.display = "block";
        }

        // Guard: se o Highcharts não carregou (teste local), não crashar
        if (typeof Highcharts === 'undefined') {
            const container = document.getElementById("container-chart");
            if (container) container.innerHTML = "<p style='color:orange; text-align:center; padding:20px;'>⚠️ Highcharts não disponível (teste local). O gráfico requer ligação ao CDN.</p>";
            return;
        }

        // Lógica de Quartis
        const quartis = calcularQuartisEstatisticos(dados.colunas);
        const Q1 = quartis.q1;
        const Q2 = quartis.q2;
        const Q3 = quartis.q3;

        // Stacks de cores
        const stack1 = dados.colunas.map(v => v !== null && v <= Q1 ? v : null);
        const stack2 = dados.colunas.map(v => v !== null && v > Q1 && v <= Q2 ? v : null);
        const stack3 = dados.colunas.map(v => v !== null && v > Q2 && v <= Q3 ? v : null);
        const stack4 = dados.colunas.map(v => v !== null && v > Q3 ? v : null);

        // Lógica "Agora"
        const partesLisboa = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
        const hojeEmLisboaDDMMYYYY = `${partesLisboa.find(p => p.type === 'day').value}/${partesLisboa.find(p => p.type === 'month').value}/${partesLisboa.find(p => p.type === 'year').value}`;
        const horaAtualLisboa = parseInt(partesLisboa.find(p => p.type === 'hour').value);
        const minutoAtualLisboa = parseInt(partesLisboa.find(p => p.type === 'minute').value);
        const isHoje = (dia === hojeEmLisboaDDMMYYYY);
        // Índice "Agora" depende da vista: 0..23 (horária) ou 0..95 (QH)
        const idxAgora = vista === "horaria" ? horaAtualLisboa : (horaAtualLisboa * 4) + Math.floor(minutoAtualLisboa / 15);

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const chartTextColor = isDark ? '#e2e8f0' : '#333';
        const chartBg = isDark ? '#1e293b' : '#ffffff';
        const omieLineColor = isDark ? '#e2e8f0' : 'black';

        let xAxisConfig = {
            categories: dados.categorias,
            labels: { rotation: -45, style: { fontSize: '10px', color: chartTextColor } },
            plotBands: [],
            crosshair: true
        };

        if (isHoje && idxAgora >= 0 && idxAgora < dados.categorias.length) {
            xAxisConfig.plotBands.push({
                from: idxAgora - 0.5,
                to: idxAgora + 0.5,
                color: 'rgba(255, 165, 0, 0.3)',
                label: {
                    text: 'Agora',
                    style: { color: '#D98A00', fontWeight: 'bold' },
                    align: 'center',
                    verticalAlign: 'top',
                    y: 15
                },
                zIndex: 3
            });
        }

        // Largura das barras adaptada à vista (24 vs 96 pontos)
        const pointWidthDesktop = vista === "horaria" ? 22 : 9;
        const pointWidthMobile  = vista === "horaria" ? 22 : 15;
        // Espaçamento entre etiquetas no mobile (horária = de 2 em 2; QH = de 4 em 4 = hora a hora)
        const labelStepMobile = vista === "horaria" ? 2 : 4;
        // Casas decimais: QH = 5 (mais detalhe); H = 4 (mais legível)
        const decimaisPreco = vista === "horaria" ? 4 : 5;

        // DataLabels acima/à frente das barras — só na vista Horária (24 barras cabem; em QH ficaria poluído)
        // Caixa com fundo semi-transparente para contraste, sobretudo quando o valor calha sobre a linha do eixo Y
        const dataLabelsBarra = vista === "horaria" ? {
            enabled: true,
            formatter: function () {
                return (this.y === null || this.y === undefined) ? '' : this.y.toFixed(4).replace('.', ',');
            },
            style: { fontSize: '10px', color: chartTextColor, textOutline: 'none', fontWeight: 'normal' },
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
            borderColor: isDark ? '#475569' : '#dee2e6',
            borderRadius: 3,
            borderWidth: 1,
            padding: 3,
            y: -10, // Sobe a caixa para libertar o topo da barra (Highcharts default é -6)
            crop: false,
            overflow: 'allow',
            inside: false
        } : { enabled: false };

        const seriesArr = [
            { name: "Baixo", color: "#548235", data: stack1.map(v => ({ y: v, color: v < 0 ? 'red' : '#548235' })), stack: "stack1", pointWidth: pointWidthDesktop, dataLabels: dataLabelsBarra },
            { name: "Baixo/Médio", color: "#C5E0B4", data: stack2.map(v => ({ y: v, color: v < 0 ? 'red' : '#C5E0B4' })), stack: "stack1", pointWidth: pointWidthDesktop, dataLabels: dataLabelsBarra },
            { name: "Médio/Elevado", color: "#FFD966", data: stack3.map(v => ({ y: v, color: v < 0 ? 'red' : '#FFD966' })), stack: "stack1", pointWidth: pointWidthDesktop, dataLabels: dataLabelsBarra },
            { name: "Elevado", color: "red", data: stack4.map(v => ({ y: v, color: v < 0 ? 'red' : 'red' })), stack: "stack1", pointWidth: pointWidthDesktop, dataLabels: dataLabelsBarra },
            { name: "OMIE PT", type: "line", data: dados.omie, color: omieLineColor, marker: { enabled: false } },
            { name: "TAR", type: "line", data: dados.tar, color: "#B4C7E7", marker: { enabled: false }, visible: false },
            { name: "OMIE*Perdas+TAR", type: "line", data: dados.omieTar, color: "#D3B5E9", marker: { enabled: false }, visible: false }
        ];

        // Linha tracejada com os preços de amanhã, quando aplicável
        if (dadosAmanha && Array.isArray(dadosAmanha.colunas)) {
            seriesArr.push({
                name: `Amanhã (${amanhaStr})`,
                type: 'line',
                data: dadosAmanha.colunas,
                color: '#8e44ad',
                dashStyle: 'ShortDash',
                lineWidth: 2,
                marker: { enabled: false },
                zIndex: 4
            });
        }

        chartInstance = Highcharts.chart("container-chart", {
            chart: {
                type: "column",
                marginTop: 30,
                backgroundColor: chartBg,
                style: { color: chartTextColor }
            },
            title: { text: `${tarifario} | ${opcao} | ${dia}`, style: { color: chartTextColor } },
            xAxis: xAxisConfig,
            yAxis: { title: { text: "", style: { color: chartTextColor } }, labels: { formatter: function () { return `${String(this.value).replace('.', ',')} €/kWh`; }, style: { color: chartTextColor } } },
            legend: { itemStyle: { color: chartTextColor } },
            tooltip: { pointFormatter: function () { return `<span style="color:${this.color}">●</span> ${this.series.name}: <b>${formatValue(this.y, decimaisPreco)}</b><br/>`; } },
            series: seriesArr,
            credits: { enabled: false },

            // Desliga o pixel-snapping das colunas/barras para que o centro visual da coluna
            // bata certo com o ponto da linha (que usa posições fracionais).
            plotOptions: {
                column: { crisp: false },
                bar:    { crisp: false }
            },

            // --- RESPONSIVIDADE COM HIGHCHARTS ---
            responsive: {
                rules: [{
                    condition: {
                        maxWidth: 600 // Telemóveis
                    },
                    chartOptions: {
                        chart: {
                            type: 'bar',  // Barras horizontais
                            marginLeft: 65 // Espaço para as etiquetas das horas à esquerda
                        },
                        xAxis: {
                            reversed: true, // 00:00 no topo
                            labels: {
                                rotation: 0,
                                step: labelStepMobile, // Etiqueta a cada N pontos (varia entre H e QH)
                                style: {
                                    fontSize: '11px',
                                    color: chartTextColor
                                }
                            },
                            tickInterval: 1
                        },
                        yAxis: {
                            labels: {
                                align: 'left',
                                x: 0,
                                y: -2,
                                style: { color: chartTextColor }
                            },
                            title: {
                                text: '€/kWh',
                                align: 'high',
                                style: { color: chartTextColor }
                            }
                        },
                        plotOptions: {
                            column: { crisp: false },
                            bar:    { crisp: false },
                            series: {
                                pointWidth: pointWidthMobile,
                                pointPadding: 0.1,
                                groupPadding: 0
                            }
                        }
                    }
                }]
            }
        });

        // O resto do código (tooltip automático) mantém-se igual
        if (isHoje) {
            setTimeout(() => {
                try {
                    if (idxAgora >= 0 && idxAgora < dados.categorias.length) {
                        const seriesEnergia = chartInstance.series.slice(0, 4);
                        let targetPoint = null;
                        for (const serie of seriesEnergia) {
                            const point = chartInstance.series[serie.index].points[idxAgora];
                            if (point && point.y !== null) {
                                targetPoint = point;
                                break;
                            }
                        }
                        if (targetPoint) {
                            chartInstance.xAxis[0].drawCrosshair(null, targetPoint);
                            chartInstance.tooltip.refresh(targetPoint);
                        }
                    }
                } catch (e) {
                    console.error("Erro tooltip:", e);
                }
            }, 0);
        }

        // --- FORÇAR REFLOW APÓS CRIAÇÃO ---
        setTimeout(() => {
            if (chartInstance) {
                chartInstance.reflow();
            }
        }, 100);
    };

    // Event listener para resize que redesenha o gráfico
    let resizeTimer;
    let lastWidth = window.innerWidth;
    
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            const currentWidth = window.innerWidth;
            const wasDesktop = lastWidth > 600;
            const isDesktop = currentWidth > 600;
            
            // Se mudou entre desktop e mobile, redesenhar
            if (wasDesktop !== isDesktop) {
                desenhaGrafico();
            } else if (chartInstance) {
                // Apenas reflow se manteve no mesmo modo
                chartInstance.reflow();
            }
            
            lastWidth = currentWidth;
        }, 250);
    });

    window.controlarTabela = function() {
        const checkbox = document.getElementById("checkboxSimular");
        const tabelaContainer = document.getElementById("tabelaContainer");

        if (checkbox.checked) {
            const dia = document.getElementById("dropdownDia").value;
            const tarifario = document.getElementById("dropdownTarifario").value;
            const opcao = document.getElementById("dropdownOpcao").value;
            const vista = getVistaAtual();
            prepararDadosTabela(dia, tarifario, opcao, vista);
            tabelaContainer.style.display = "block";
        } else {
            tabelaContainer.style.display = "none";
            const cmp = document.getElementById('comparacaoOpcoes');
            if (cmp) cmp.innerHTML = '';
        }
    }

    // --- LIGAÇÃO DO BOTÃO "LIMPAR CONSUMOS" ---
    function ligarBotaoLimparConsumos() {
        const btn = document.getElementById("btnLimparConsumos");
        if (!btn) return;
        btn.addEventListener("click", () => {
            const vista = getVistaAtual();
            const label = vista === "horaria" ? "horária" : "quarto-horária";
            if (!confirm(`Limpar todos os consumos gravados da vista ${label}?`)) return;
            limparConsumosGravados(vista);
            // Re-renderiza a tabela com os consumos a zero
            if (document.getElementById("checkboxSimular").checked) {
                const dia = document.getElementById("dropdownDia").value;
                const tarifario = document.getElementById("dropdownTarifario").value;
                const opcao = document.getElementById("dropdownOpcao").value;
                prepararDadosTabela(dia, tarifario, opcao, vista);
            }
        });
    }

    // --- TABELA ---

    function atualizarCabecalhosTabela(tipo) {
        const isQH = (tipo === "quartohoraria");
        const titulo = document.getElementById("tabelaTitulo");
        const thHora = document.getElementById("thHora");
        const thOmie = document.getElementById("thOmie");
        const thConsumo = document.getElementById("thConsumo");
        const thCusto = document.getElementById("thCusto");
        if (titulo) titulo.textContent = isQH ? "Tabela Quarto-horária" : "Tabela Horária";
        if (thHora) thHora.textContent = isQH ? "Quarto-hora PT" : "Hora PT";
        // Em vista Horária o OMIE mostrado é a média das 4 QH; em QH é o valor "instantâneo" de cada quarto
        if (thOmie) thOmie.textContent = isQH ? "OMIE (€/MWh)" : "OMIE Médio (€/MWh)";
        if (thConsumo) thConsumo.textContent = isQH ? "Consumo quarto-horário (kWh)" : "Consumo horário (kWh)";
        if (thCusto) thCusto.textContent = isQH ? "Custo quarto-horário (€)" : "Custo horário (€)";
    }

    // --- TABELA UNIFICADA (Horária ou Quarto-horária) ---
    // Usa dadosEstruturados (QH) ou dadosEstruturadosHora (H) — mesma estrutura.
    // OMIE é mostrado em €/MWh em ambas as vistas (consistente com o comportamento anterior).
    function prepararDadosTabela(dia, tarifario, opcao, vista) {
        vista = vista || getVistaAtual();
        atualizarCabecalhosTabela(vista);

        const fonte = vista === "horaria" ? dadosEstruturadosHora : dadosEstruturados;
        const dados = fonte[dia]?.[tarifario]?.[opcao];
        if (!dados) return;

        const subtitulo = document.querySelector("#subtituloTabela");
        const sufixo = vista === "horaria" ? "(Horária)" : "(Quarto-horária)";
        if (subtitulo) subtitulo.textContent = `${tarifario} | ${opcao} | ${dia} ${sufixo}`;

        const consumosGravados = carregarConsumosGravados(vista);

        let omieValores = [];
        let precoValores = [];
        let novosDados = [];

        for (let i = 0; i < dados.categorias.length; i++) {
            const intervalo = dados.categorias[i];
            const precoKwh = dados.colunas[i];                  // €/kWh
            const omieKwh = dados.omie[i];                      // €/kWh
            const omieParaTabela = (omieKwh !== null && omieKwh !== undefined && !isNaN(omieKwh)) ? omieKwh * 1000 : null; // €/MWh

            if (omieParaTabela !== null) omieValores.push(omieParaTabela);
            if (precoKwh !== null) precoValores.push(precoKwh);

            const consumoGravado = (precoKwh !== null && consumosGravados[intervalo]) ? consumosGravados[intervalo] : 0;
            const custo = (consumoGravado > 0 && precoKwh !== null) ? consumoGravado * precoKwh : 0;

            novosDados.push({
                hora: intervalo,
                omie: omieParaTabela,
                precoMedio: precoKwh,
                consumo: consumoGravado,
                custo: custo
            });
        }

        estadoTabela.dados = novosDados;
        estadoTabela.quartisOmie = calcularQuartisEstatisticos(omieValores);
        estadoTabela.quartisPreco = calcularQuartisEstatisticos(precoValores);
        estadoTabela.colunaOrdenada = null;

        configurarOrdenacao();
        renderizarTabela();
    }

    function renderizarTabela() {
        const corpoTabela = document.querySelector("#tabelaHoraria tbody");
        corpoTabela.innerHTML = "";

        const isDarkTable = document.documentElement.getAttribute('data-theme') === 'dark';
        // Preço Médio: QH = 5 casas; H = 4 casas
        const decimaisPrecoTabela = getVistaAtual() === "horaria" ? 4 : 5;

        // Função de cor baseada nos quartis estatísticos
        const obterCorDeFundo = (valor, quartis) => {
            if (valor === null || valor === undefined || isNaN(valor)) return isDarkTable ? '#1e293b' : 'white';
            
            if (isDarkTable) {
                if (valor <= quartis.q1) return "#2d5016"; // Baixo (verde escuro)
                if (valor <= quartis.q2) return "#3a5a28"; // Baixo/Médio
                if (valor <= quartis.q3) return "#5c4a10"; // Médio/Elevado (amarelo escuro)
                return "#6b2020"; // Elevado (vermelho escuro)
            }
            
            if (valor <= quartis.q1) return "#A9D08E"; // Baixo
            if (valor <= quartis.q2) return "#E2EFDA"; // Baixo/Médio
            if (valor <= quartis.q3) return "#F9E79F"; // Médio/Elevado
            return "#F5B7B1"; // Elevado
        };

        estadoTabela.dados.forEach((dado) => {
            const tr = document.createElement('tr');
            
            // Coluna Hora
            const tdHora = document.createElement('td');
            tdHora.textContent = dado.hora;
            tr.appendChild(tdHora);

            // Coluna OMIE — 2 casas decimais, vírgula
            const tdOmie = document.createElement('td');
            tdOmie.textContent = fmtPt(dado.omie, 2);
            tdOmie.style.backgroundColor = obterCorDeFundo(dado.omie, estadoTabela.quartisOmie);
            if (dado.omie < 0) tdOmie.style.color = 'red';
            tr.appendChild(tdOmie);

            // Coluna Preço Médio — casas decimais variam por vista (QH = 5, H = 4)
            const tdPreco = document.createElement('td');
            tdPreco.textContent = fmtPt(dado.precoMedio, decimaisPrecoTabela);
            tdPreco.style.backgroundColor = obterCorDeFundo(dado.precoMedio, estadoTabela.quartisPreco);
            if (dado.precoMedio < 0) tdPreco.style.color = 'red';
            tr.appendChild(tdPreco);

            // Coluna Consumo
            const tdConsumo = document.createElement('td');
            const input = document.createElement('input');
            input.type = "number";
            input.step = "0.001";
            input.min = "0";
            input.className = "input-consumo";
            input.value = dado.consumo > 0 ? dado.consumo : "";
            if (dado.precoMedio === null) input.disabled = true;
            
            input.addEventListener('input', (e) => {
                const valor = parseFloat(e.target.value.replace(",", "."));
                dado.consumo = isNaN(valor) ? 0 : valor;
                dado.custo = dado.consumo * (dado.precoMedio || 0);
                tdCusto.textContent = fmtPt(dado.custo, 4);
                atualizarTotaisNaPagina();
                // Persistir em localStorage por (vista, intervalo)
                gravarConsumo(getVistaAtual(), dado.hora, dado.consumo);
            });

            tdConsumo.appendChild(input);
            tr.appendChild(tdConsumo);

            // Coluna Custo — 4 casas decimais, vírgula
            const tdCusto = document.createElement('td');
            tdCusto.textContent = dado.custo > 0 ? fmtPt(dado.custo, 4) : (dado.precoMedio !== null ? "0,0000" : "");
            tr.appendChild(tdCusto);

            corpoTabela.appendChild(tr);
        });

        atualizarTotaisNaPagina();
    }

    function atualizarTotaisNaPagina() {
        let somaConsumo = 0;
        let somaCusto = 0;

        estadoTabela.dados.forEach(d => {
            somaConsumo += d.consumo;
            somaCusto += d.custo;
        });

        document.getElementById("somaConsumo").textContent = fmtPt(somaConsumo, 3);
        document.getElementById("somaCusto").textContent = fmtPt(somaCusto, 4);
        document.getElementById("mediaPonderada").textContent = somaConsumo > 0 ? fmtPt(somaCusto / somaConsumo, 5) : "—";

        atualizarComparacaoOpcoes();
    }

    // --- COMPARAÇÃO DE OPÇÕES HORÁRIAS ---
    // Aplica o mesmo padrão de consumo introduzido pelo utilizador às outras opções
    // (Simples / Bi / Tri-horário) do mesmo tarifário e mostra quanto pagaria em cada uma.
    function atualizarComparacaoOpcoes() {
        const container = document.getElementById('comparacaoOpcoes');
        if (!container) return;

        // Esconde se o simulador estiver desligado (mas o container já está dentro do tabelaContainer)
        if (!document.getElementById("checkboxSimular")?.checked) {
            container.innerHTML = '';
            return;
        }

        const dia = document.getElementById("dropdownDia").value;
        const tarifario = document.getElementById("dropdownTarifario").value;
        const opcaoAtual = document.getElementById("dropdownOpcao").value;
        const vista = getVistaAtual();
        const fonte = vista === "horaria" ? dadosEstruturadosHora : dadosEstruturados;
        const tarifarioDados = fonte[dia]?.[tarifario];

        if (!tarifarioDados) { container.innerHTML = ''; return; }

        const opcoes = Object.keys(tarifarioDados);

        // Se só existe uma opção horária, a comparação não tem sentido
        if (opcoes.length < 2) { container.innerHTML = ''; return; }

        // Soma do consumo do utilizador
        let consumoTotalUtilizador = 0;
        estadoTabela.dados.forEach(d => { consumoTotalUtilizador += (d.consumo || 0); });
        if (consumoTotalUtilizador <= 0) { container.innerHTML = ''; return; }

        // Indexa consumos por intervalo (chave = "[HH:MM-HH:MM[")
        const consumosPorIntervalo = {};
        estadoTabela.dados.forEach(d => {
            if (d.consumo > 0) consumosPorIntervalo[d.hora] = d.consumo;
        });

        // Para cada opção, calcula o custo aplicando os preços dessa opção ao padrão do utilizador
        const resultados = opcoes.map(opcao => {
            const dadosOp = tarifarioDados[opcao];
            let custo = 0;
            let consumoCoberto = 0;
            for (let i = 0; i < dadosOp.categorias.length; i++) {
                const intervalo = dadosOp.categorias[i];
                const preco = dadosOp.colunas[i];
                const consumo = consumosPorIntervalo[intervalo];
                if (consumo && preco !== null && preco !== undefined && !isNaN(preco)) {
                    custo += consumo * preco;
                    consumoCoberto += consumo;
                }
            }
            return { opcao, custo, consumoCoberto };
        });

        // Mais barato — apenas entre os que cobrem (pelo menos) o mesmo consumo da opção atual
        const consumoCobertoAtual = resultados.find(r => r.opcao === opcaoAtual)?.consumoCoberto || 0;
        const elegiveisMB = resultados.filter(r => Math.abs(r.consumoCoberto - consumoCobertoAtual) < 1e-6);
        const maisBarato = elegiveisMB.length > 0
            ? elegiveisMB.reduce((min, r) => r.custo < min.custo ? r : min)
            : null;

        const custoAtual = resultados.find(r => r.opcao === opcaoAtual)?.custo;

        // Render
        let html = '';
        html += `<h4 class="comparacao-titulo">Comparação de opções horárias</h4>`;
        html += `<p class="comparacao-subtitulo">Custo que pagaria com o mesmo padrão de consumo introduzido, para cada opção do tarifário <strong>${tarifario}</strong></p>`;
        html += `<table class="comparacao-tabela"><thead><tr><th>Opção horária e ciclo</th><th>Custo total (€)</th><th>vs. atual</th></tr></thead><tbody>`;

        resultados.forEach(r => {
            const isAtual = r.opcao === opcaoAtual;
            const isMaisBarato = (maisBarato && r === maisBarato && !isAtual);
            const classes = [];
            if (isAtual) classes.push('atual');
            if (isMaisBarato) classes.push('mais-barato');

            let badges = '';
            if (isAtual) badges += ` <span class="badge-pill atual">Atual</span>`;
            if (isMaisBarato) badges += ` <span class="badge-pill mb">Mais barato</span>`;

            let diffStr;
            if (isAtual) {
                diffStr = '—';
            } else if (custoAtual && custoAtual !== 0) {
                const diff = (r.custo - custoAtual) / custoAtual * 100;
                const sinal = diff > 0 ? '+' : '';
                diffStr = `${sinal}${fmtPt(diff, 1)}%`;
            } else {
                diffStr = '—';
            }

            html += `<tr class="${classes.join(' ')}">
                <td>${r.opcao}${badges}</td>
                <td>${fmtPt(r.custo, 4)}</td>
                <td>${diffStr}</td>
            </tr>`;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    }

    function configurarOrdenacao() {
        const headers = document.querySelectorAll("#tabelaHoraria thead th");
        const campos = ["hora", "omie", "precoMedio", "consumo", "custo"];

        headers.forEach((th, index) => {
            const novoTh = th.cloneNode(true);
            th.parentNode.replaceChild(novoTh, th);

            novoTh.addEventListener("click", () => {
                const campo = campos[index];
                if (!campo) return;

                // 1. Lógica de Direção
                if (estadoTabela.colunaOrdenada === campo) {
                    estadoTabela.direcaoOrdenacao *= -1;
                } else {
                    estadoTabela.colunaOrdenada = campo;
                    estadoTabela.direcaoOrdenacao = 1;
                }

                // 2. Ordenação dos Dados
                estadoTabela.dados.sort((a, b) => {
                    let valA = a[campo];
                    let valB = b[campo];

                    // Tratamento especial para Hora
                    if (campo === "hora") {
                        const horaLimpa = valA.replace("[", "").split(":")[0];
                        valA = parseInt(horaLimpa);
                        const horaLimpaB = valB.replace("[", "").split(":")[0];
                        valB = parseInt(horaLimpaB);
                    }

                    if (valA === null) valA = -999999;
                    if (valB === null) valB = -999999;

                    if (valA < valB) return -1 * estadoTabela.direcaoOrdenacao;
                    if (valA > valB) return 1 * estadoTabela.direcaoOrdenacao;
                    return 0;
                });

                // 3. Atualizar a Tabela (Renderizar linhas)
                renderizarTabela();
                
                // 4. ATUALIZAR AS CLASSES CSS NO CABEÇALHO
                document.querySelectorAll("#tabelaHoraria thead th").forEach(h => {
                    h.classList.remove("sort-asc", "sort-desc");
                });

                // Depois, adiciona a classe correta apenas no cabeçalho clicado
                novoTh.classList.add(estadoTabela.direcaoOrdenacao === 1 ? "sort-asc" : "sort-desc");
            });
        });
    }

    function init() {
        // fetchDados (dados.js) trata da origem (same-origin vs GitHub raw)
        // e do fallback entre ambas. Cache-busting para dados sempre frescos.
        const CSV_URL = "omie/precos-horarios.csv?cache_bust=" + new Date().getTime();

        fetchDados(CSV_URL)
            .then(res => res.text())
            .then(data => {
                dadosCSVGlobal = data;
                parseCSV(data);
                construirDadosHorarios();
                parseConstantes(data);
                ligarBotaoLimparConsumos();
                const hojeEmLisboa = getHojeStr();
                populaDropdowns(hojeEmLisboa);
            })
            .catch(error => {
                console.error("Erro CSV:", error);
                const container = document.getElementById("container-chart");
                if (container) container.innerHTML = "<p style='color: red;'>Erro ao carregar dados.</p>";
            });
    }

    // Reagir a mudanças de tema (dark mode toggle)
    document.addEventListener('themeChanged', function() {
        desenhaGrafico();
    });

    init();
});