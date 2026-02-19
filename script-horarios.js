document.addEventListener('DOMContentLoaded', function () {
    // --- VARIÁVEIS GLOBAIS ---
    let dadosEstruturados = {};
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

    // --- DROPDOWNS ---
    function populaDropdowns(hojePadrao) {
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

    function formatValue(value) {
        if (value === null) return "Não disponível";
        const formatted = `${value.toFixed(5)} €/kWh`;
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
                    ["TAR", "Tarifa de Acesso às Redes (variável consoante a opção horária e ciclo escolhida)"],
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
                    ["TAR", "Tarifa de Acesso às Redes (variável consoante a opção horária e ciclo escolhida)"],
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
                    ["TAR", "Tarifa de Acesso às Redes (variável consoante a opção horária e ciclo escolhida)"],
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
                    ["TAR", "Tarifa de Acesso às Redes (variável consoante a opção horária e ciclo escolhida)"],
                ]
            },
            "EZU Tarifa Indexada": {
                expr: `P<sub>p</sub> = Σ (OMIE<sub>h</sub> + CGS<sub>h</sub> + k<sub>p</sub>) × (1 + Perda<sub>ERSE</sub>) + TAR + TSE`,
                legenda: [
                    ["OMIE", "Preço de energia por hora no mercado OMIE (€/kWh)"],
                    ["CGS", () => `Custos de gestão geral do sistema - Na ausência de um valor fixo, utiliza-se o valor médio de ERC do mês atual: ${c('EZU_CGS', '€/kWh', 5)}. Nota: este valor é uma aproximação, pois o CGS real varia todos os 15 minutos. Valor atualizado semanalmente com base nos dados mais recentes disponíveis.`],
                    ["Perda<sub>ERSE</sub>", "Perdas da rede fixadas pela ERSE (variável)"],
                    ["k", () => { const mwh = constantes['EZU_K'] !== undefined ? ` (${(constantes['EZU_K']*1000).toFixed(2).replace('.',',')} €/MWh)` : ''; return `Gastos operacionais EZU Energia: ${c('EZU_K')}${mwh}`; }],
                    ["TSE", () => `Financiamento Tarifa Social de Eletricidade: ${c('Financiamento_TSE', '€/kWh', 7)}`],
                    ["TAR", "Tarifa de Acesso às Redes (variável consoante a opção horária e ciclo escolhida)"],
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
                    ["TAR", "Tarifa de Acesso às Redes (variável consoante a opção horária e ciclo escolhida)"],
                ]
            },
            "Galp Plano Dinâmico": {
                expr: `Preço = ENERGIA<sub>GALP</sub> + TAR<sub>ENERGIA</sub><br>ENERGIA<sub>GALP</sub> = Σ[(PMi + Ci) × (1 + Li)]`,
                legenda: [
                    ["PMi", "Preço horário OMIE Portugal (€/kWh), vigente em cada 15 minutos"],
                    ["Ci", () => `Componente de Comercializador (margem, desvios, garantias de origem, etc.): ${c('Galp_Ci')}`],
                    ["Li", "Perdas em percentagem para cada 15 minutos, publicadas pela ERSE (percentual)"],
                    ["TAR<sub>ENERGIA</sub>", "Valores para o termo variável divulgados pela ERSE"],
                ]
            },
            "Iberdrola - Simples Indexado Dinâmico": {
                expr: `Preço Energia <sub>IBERDROLA</sub> = POMIE<sub>P</sub> × (1 + Perdas) + Q + Banda mFRR + TSE + TAR`,
                legenda: [
                    ["POMIE<sub>P</sub>", "Custo da eletricidade no mercado ibérico em Portugal (€/kWh), em intervalos de 15 minutos"],
                    ["Perdas", "Coeficientes de perdas por quarto de hora, conforme legislação em vigor (%)"],
                    ["Q", () => `Custo de operação e gestão do sistema + componente de comercialização da Iberdrola: ${c('Iberdrola_Dinamico_Q', '€/kWh', 3)}`],
                    ["Banda mFRR", () => `Sobrecusto associado ao leilão da Banda de Reserva de Restabelecimento de Frequência com Ativação Manual: ${c('Iberdrola_mFRR', '€/kWh', 5)}`],
                    ["TSE", () => `Financiamento Tarifa Social de Eletricidade: ${c('Financiamento_TSE', '€/kWh', 7)}`],
                    ["TAR", "Tarifa de Acesso às Redes (variável consoante a opção horária e ciclo escolhida)"],
                ]
            },
            "MeoEnergia Tarifa Variável": {
                expr: `P<sub>ENERGIA</sub> = (P<sub>OMIE</sub> + K) × (1 + FP) + TAR`,
                legenda: [
                    ["P<sub>OMIE</sub>", "Custo da eletricidade no mercado ibérico em Portugal (€/kWh), em intervalos de 15 minutos"],
                    ["K", () => `Inclui Gestão do sistema, desvios e margem: ${c('Meo_K')}`],
                    ["FP", "Fator de Perdas — ajustamento para perdas na rede de Baixa Tensão (variável, ERSE)"],
                    ["TAR", "Tarifa de Acesso às Redes (variável consoante a opção horária e ciclo escolhida)"],
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
                    ["TAR", "Tarifa de Acesso às Redes (variável consoante a opção horária e ciclo escolhida)"],                    
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
                    ["TAR", "Tarifa de Acesso às Redes (variável consoante a opção horária e ciclo escolhida)"],
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

    // --- DESENHO DO GRÁFICO ---
    window.desenhaGrafico = function() {
        const dia = document.getElementById("dropdownDia").value;
        const tarifario = document.getElementById("dropdownTarifario").value;
        const opcao = document.getElementById("dropdownOpcao").value;
        const dados = dadosEstruturados[dia]?.[tarifario]?.[opcao];
        if (!dados) return;

        mostrarFormula(tarifario);

        // Destruir gráfico existente se houver
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }

        // Atualiza a tabela se a checkbox estiver ativa
        if (document.getElementById("checkboxSimular").checked) {
            prepararDadosTabela(dia, tarifario, opcao);
            document.getElementById("tabelaContainer").style.display = "block";
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
        const agoraLisboa = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Lisbon" }));
        const diaLisboa = String(agoraLisboa.getDate()).padStart(2, '0');
        const mesLisboa = String(agoraLisboa.getMonth() + 1).padStart(2, '0');
        const anoLisboa = agoraLisboa.getFullYear();
        const hojeEmLisboaDDMMYYYY = `${diaLisboa}/${mesLisboa}/${anoLisboa}`;
        const horaAtualLisboa = agoraLisboa.getHours(); 
        const minutoAtualLisboa = agoraLisboa.getMinutes();
        const isHoje = (dia === hojeEmLisboaDDMMYYYY);
        const qhIndex = (horaAtualLisboa * 4) + Math.floor(minutoAtualLisboa / 15);

        let xAxisConfig = {
            categories: dados.categorias,
            labels: { rotation: -45, style: { fontSize: '10px' } },
            plotBands: [],
            crosshair: true
        };

        if (isHoje && qhIndex >= 0 && qhIndex < dados.categorias.length) {
            xAxisConfig.plotBands.push({
                from: qhIndex - 0.5,
                to: qhIndex + 0.5,
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

        chartInstance = Highcharts.chart("container-chart", {
            chart: { 
                type: "column",
                marginTop: 30
            },
            title: { text: `${tarifario} | ${opcao} | ${dia}` },
            xAxis: xAxisConfig,
            yAxis: { title: { text: "" }, labels: { formatter: function () { return `${this.value} €/kWh`; } } },
            tooltip: { pointFormatter: function () { return `<span style="color:${this.color}">●</span> ${this.series.name}: <b>${formatValue(this.y)}</b><br/>`; } },
            series: [
                { name: "Baixo", color: "#548235", data: stack1.map(v => ({ y: v, color: v < 0 ? 'red' : '#548235' })), stack: "stack1", pointWidth: 9 },
                { name: "Baixo/Médio", color: "#C5E0B4", data: stack2.map(v => ({ y: v, color: v < 0 ? 'red' : '#C5E0B4' })), stack: "stack1", pointWidth: 9 },
                { name: "Médio/Elevado", color: "#FFD966", data: stack3.map(v => ({ y: v, color: v < 0 ? 'red' : '#FFD966' })), stack: "stack1", pointWidth: 9 },
                { name: "Elevado", color: "red", data: stack4.map(v => ({ y: v, color: v < 0 ? 'red' : 'red' })), stack: "stack1", pointWidth: 9 },
                { name: "OMIE PT", type: "line", data: dados.omie, color: "black", marker: { enabled: false } },
                { name: "TAR", type: "line", data: dados.tar, color: "#B4C7E7", marker: { enabled: false }, visible: false },
                { name: "OMIE*Perdas+TAR", type: "line", data: dados.omieTar, color: "#D3B5E9", marker: { enabled: false }, visible: false }
            ],
            credits: { enabled: false },
            
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
                                step: 4,      // Mostra apenas de hora em hora (00:00, 01:00...) para não atulhar
                                style: {
                                    fontSize: '11px'
                                }
                            },
                            // Garante que desenha todas as grelhas, mesmo que não mostre o texto
                            tickInterval: 1 
                        },
                        yAxis: {
                            labels: {
                                align: 'left',
                                x: 0,
                                y: -2
                            },
                            title: {
                                text: '€/kWh',
                                align: 'high'
                            }
                        },
                        plotOptions: {
                            series: {
                                pointWidth: 15, // Largura fixa da barra para ficar "gordinha" e legível
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
                    if (qhIndex >= 0 && qhIndex < dados.categorias.length) {
                        const seriesEnergia = chartInstance.series.slice(0, 4);
                        let targetPoint = null;
                        for (const serie of seriesEnergia) {
                            const point = chartInstance.series[serie.index].points[qhIndex];
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
            prepararDadosTabela(dia, tarifario, opcao);
            tabelaContainer.style.display = "block";
        } else {
            tabelaContainer.style.display = "none";
        }
    }

    // --- TABELA ---

    function prepararDadosTabela(dia, tarifario, opcao) {
        const linhas = dadosCSVGlobal.split("\n").filter(l => l.trim());
        const linhaTabelaIndex = linhas.findIndex(linha => linha.includes("TABELA_HORARIA"));

        const subtitulo = document.querySelector("#subtituloTabela");
        if (subtitulo) subtitulo.textContent = `${tarifario} | ${opcao} | ${dia}`;

        if (linhaTabelaIndex === -1) return;

        const linhasTabela = linhas.slice(linhaTabelaIndex + 1);
        
        let omieValores = [];
        let precoValores = [];
        let novosDados = [];

        // 1. Extrair dados
        linhasTabela.forEach((linha) => {
            const colunas = linha.split(",").map(c => c.trim());
            if (colunas.length < 16) return;

            // Formato esperado do CSV: ... Hora, OMIE, PrecoMedio
            const [csvDia, csvTarifario, csvOpcao, hora, omieRaw, precoRaw] = colunas.slice(10, 16);

            if (csvDia === dia && csvTarifario === tarifario && csvOpcao === opcao) {
                const precoMedioValido = (!isNaN(precoRaw) && precoRaw !== "") ? parseFloat(precoRaw) : null;
                const omieValido = (!isNaN(omieRaw) && omieRaw !== "") ? parseFloat(omieRaw) : null;

                if (omieValido !== null) omieValores.push(omieValido);
                if (precoMedioValido !== null) precoValores.push(precoMedioValido);
                
                novosDados.push({ 
                    hora: hora, // Ex: "[00:00-01:00["
                    omie: omieValido,
                    precoMedio: precoMedioValido,
                    consumo: 0, 
                    custo: 0
                });
            }
        });

        estadoTabela.dados = novosDados;
        // Usa EXATAMENTE a mesma lógica matemática do gráfico
        estadoTabela.quartisOmie = calcularQuartisEstatisticos(omieValores);
        estadoTabela.quartisPreco = calcularQuartisEstatisticos(precoValores);
        estadoTabela.colunaOrdenada = null; 
        
        configurarOrdenacao(); 
        renderizarTabela();
    }

    function renderizarTabela() {
        const corpoTabela = document.querySelector("#tabelaHoraria tbody");
        corpoTabela.innerHTML = "";

        // Função de cor baseada nos quartis estatísticos
        const obterCorDeFundo = (valor, quartis) => {
            if (valor === null || valor === undefined || isNaN(valor)) return 'white';
            
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

            // Coluna OMIE (ALTERADO AQUI: .toFixed(2))
            const tdOmie = document.createElement('td');
            // Se for null mostra traço, senão formata com 2 casas decimais
            tdOmie.textContent = dado.omie !== null ? dado.omie.toFixed(2) : "—";
            tdOmie.style.backgroundColor = obterCorDeFundo(dado.omie, estadoTabela.quartisOmie);
            if (dado.omie < 0) tdOmie.style.color = 'red';
            tr.appendChild(tdOmie);

            // Coluna Preço Médio (ALTERADO AQUI: .toFixed(4))
            const tdPreco = document.createElement('td');
            // Se for null mostra traço, senão formata com 4 casas decimais
            tdPreco.textContent = dado.precoMedio !== null ? dado.precoMedio.toFixed(4) : "—";
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
                tdCusto.textContent = dado.custo.toFixed(4);
                atualizarTotaisNaPagina();
            });
            
            tdConsumo.appendChild(input);
            tr.appendChild(tdConsumo);

            // Coluna Custo
            const tdCusto = document.createElement('td');
            // Mantivemos o custo com 4 casas também para consistência
            tdCusto.textContent = dado.custo > 0 ? dado.custo.toFixed(4) : (dado.precoMedio !== null ? "0.0000" : "");
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

        document.getElementById("somaConsumo").textContent = somaConsumo.toFixed(3);
        document.getElementById("somaCusto").textContent = somaCusto.toFixed(4);
        document.getElementById("mediaPonderada").textContent = somaConsumo > 0 ? (somaCusto / somaConsumo).toFixed(5) : "—";
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
        const baseURL = "https://raw.githubusercontent.com/tiagofelicia/tiagofelicia.github.io/main/data/precos-horarios.csv";
        const CSV_URL = baseURL + "?cache_bust=" + new Date().getTime();
        
        fetch(CSV_URL)
            .then(res => res.text())
            .then(data => {
                dadosCSVGlobal = data;
                parseCSV(data);
                parseConstantes(data);
                const agoraLisboa = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Lisbon" }));
                const diaLisboa = String(agoraLisboa.getDate()).padStart(2, '0');
                const mesLisboa = String(agoraLisboa.getMonth() + 1).padStart(2, '0');
                const anoLisboa = agoraLisboa.getFullYear();
                populaDropdowns(`${diaLisboa}/${mesLisboa}/${anoLisboa}`);
            })
            .catch(error => {
                console.error("Erro CSV:", error);
                const container = document.getElementById("container-chart");
                if (container) container.innerHTML = "<p style='color: red;'>Erro ao carregar dados.</p>";
            });
    }

    init();
});