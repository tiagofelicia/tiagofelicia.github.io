document.addEventListener('DOMContentLoaded', function () {
    // --- LÓGICA PARA O GRÁFICO E SIMULAÇÃO HORÁRIA ---
    let dadosEstruturados = {};
    let dadosCSVGlobal = "";

    function parseCSV(csv) {
        const linhas = csv.split("\n").filter(l => l.trim());
        linhas.slice(1).forEach(row => {
            const [dia, tarifario, opcao, intervalo, col, omie, tar, omieTar] = row.split(",");
            if (!dadosEstruturados[dia]) dadosEstruturados[dia] = {};
            if (!dadosEstruturados[dia][tarifario]) dadosEstruturados[dia][tarifario] = {};
            if (!dadosEstruturados[dia][tarifario][opcao]) {
                dadosEstruturados[dia][tarifario][opcao] = {
                    categorias: [], colunas: [], omie: [], tar: [], omieTar: []
                };
            }
            const grupo = dadosEstruturados[dia][tarifario][opcao];
            grupo.categorias.push(intervalo);
            grupo.colunas.push(parseFloat(col.replace(",", ".")));
            grupo.omie.push(parseFloat(omie.replace(",", ".")));
            grupo.tar.push(parseFloat(tar.replace(",", ".")));
            grupo.omieTar.push(parseFloat(omieTar.replace(",", ".")));
        });
    }

    function populaDropdowns() {
        const diaSelect = document.getElementById("dropdownDia");
        const tarifarioSelect = document.getElementById("dropdownTarifario");
        const opcaoSelect = document.getElementById("dropdownOpcao");

        diaSelect.innerHTML = Object.keys(dadosEstruturados).map(d => `<option value="${d}">${d}</option>`).join("");
        diaSelect.addEventListener("change", atualizaTarifario);
        tarifarioSelect.addEventListener("change", atualizaOpcao);
        opcaoSelect.addEventListener("change", desenhaGrafico);

        function atualizaTarifario() {
            const dia = diaSelect.value;
            const tarifarios = Object.keys(dadosEstruturados[dia] || {});
            tarifarioSelect.innerHTML = tarifarios.map(t => `<option value="${t}">${t}</option>`).join("");
            atualizaOpcao();
        }

        function atualizaOpcao() {
            const dia = diaSelect.value;
            const tarifario = tarifarioSelect.value;
            const opcoes = Object.keys(dadosEstruturados[dia]?.[tarifario] || {});
            opcaoSelect.innerHTML = opcoes.map(o => `<option value="${o}">${o}</option>`).join("");
            desenhaGrafico();
        }
        atualizaTarifario();
    }

    function formatValue(value) {
        if (value === null) return "Não disponível";
        const formatted = `${value.toFixed(5)} €/kWh`;
        return value < 0 ? `<span class="valor-negativo">${formatted}</span>` : formatted;
    }

    window.desenhaGrafico = function() {
        const dia = document.getElementById("dropdownDia").value;
        const tarifario = document.getElementById("dropdownTarifario").value;
        const opcao = document.getElementById("dropdownOpcao").value;
        const dados = dadosEstruturados[dia]?.[tarifario]?.[opcao];
        if (!dados) return;

        if (document.getElementById("checkboxSimular").checked) {
            carregarTabelaCSV(dia, tarifario, opcao);
            document.getElementById("tabelaContainer").style.display = "block";
        }

        const valores = dados.colunas.filter(v => v != null).sort((a, b) => a - b);
        const getQuartile = (arr, q) => {
            const pos = (arr.length - 1) * q;
            const base = Math.floor(pos);
            const rest = pos - base;
            return arr[base + 1] !== undefined ? arr[base] + rest * (arr[base + 1] - arr[base]) : arr[base];
        };
        const Q1 = getQuartile(valores, 0.25);
        const Q2 = getQuartile(valores, 0.5);
        const Q3 = getQuartile(valores, 0.75);

        const stack1 = dados.colunas.map(v => v <= Q1 ? v : null);
        const stack2 = dados.colunas.map(v => v > Q1 && v <= Q2 ? v : null);
        const stack3 = dados.colunas.map(v => v > Q2 && v <= Q3 ? v : null);
        const stack4 = dados.colunas.map(v => v > Q3 ? v : null);

        Highcharts.chart("container-chart", {
            chart: { type: "column" },
            title: { text: `${tarifario} | ${opcao} | ${dia}` },
            xAxis: { categories: dados.categorias, labels: { rotation: -45, style: { fontSize: '10px' } } },
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
            credits: { enabled: false }
        });
    }

    window.controlarTabela = function() {
        const checkbox = document.getElementById("checkboxSimular");
        const tabela = document.getElementById("tabelaContainer");
        if (checkbox.checked) {
            const dia = document.getElementById("dropdownDia").value;
            const tarifario = document.getElementById("dropdownTarifario").value;
            const opcao = document.getElementById("dropdownOpcao").value;
            carregarTabelaCSV(dia, tarifario, opcao);
            tabela.style.display = "block";
        } else {
            tabela.style.display = "none";
        }
    }

    function carregarTabelaCSV(dia, tarifario, opcao) {
        const linhas = dadosCSVGlobal.split("\n").filter(l => l.trim());
        const linhaTabelaIndex = linhas.findIndex(linha => linha.includes("TABELA_HORARIA"));

        const subtitulo = document.querySelector("#subtituloTabela");
        if (subtitulo) {
            subtitulo.textContent = `${tarifario} | ${opcao} | ${dia}`;
        }

        if (linhaTabelaIndex === -1) {
            console.error("Não foi possível encontrar 'TABELA_HORARIA' no CSV.");
            return;
        }

        const linhasTabela = linhas.slice(linhaTabelaIndex + 1);
        const corpoTabela = document.querySelector("#tabelaHoraria tbody");
        corpoTabela.innerHTML = "";

        let omieValores = [];
        // let precoMedioValores = []; // REMOVIDO
        const dadosParaTabela = [];

        linhasTabela.forEach((linha) => {
            const colunas = linha.split(",").map(c => c.trim());
            if (colunas.length < 16) return;

            const [csvDia, csvTarifario, csvOpcao, hora, omie, precoMedio] = colunas.slice(10, 16);

            if (csvDia === dia && csvTarifario === tarifario && csvOpcao === opcao) {
                const precoMedioValido = !isNaN(precoMedio) && precoMedio !== "" ? parseFloat(precoMedio) : null;
                const omieValido = !isNaN(omie) ? parseFloat(omie) : null;

                if (omieValido !== null) omieValores.push(omieValido);
                // if (precoMedioValido !== null) precoMedioValores.push(precoMedioValido); // REMOVIDO
                
                dadosParaTabela.push({ hora, omie, precoMedio, precoMedioValido });
            }
        });

        const calcularQuartis = (valores) => {
            if (valores.length === 0) return { q1: 0, q2: 0, q3: 0 };
            valores.sort((a, b) => a - b);
            const q1 = valores[Math.floor(valores.length / 4)];
            const q2 = valores[Math.floor(valores.length / 2)];
            const q3 = valores[Math.floor(valores.length * 3 / 4)];
            return { q1, q2, q3 };
        };

        const quartisOmie = calcularQuartis(omieValores);
        // const quartisPrecoMedio = calcularQuartis(precoMedioValores); // REMOVIDO

        const obterCorDeFundo = (valor, quartis) => {
            if (valor === null || valor === undefined || isNaN(valor)) return 'white'; // Células sem valor ficam brancas
            if (valor <= quartis.q1) return "#A9D08E";
            if (valor <= quartis.q2) return "#E2EFDA";
            if (valor <= quartis.q3) return "#F9E79F";
            return "#F5B7B1";
        };

        dadosParaTabela.forEach((dadosLinha, index) => {
            const idInput = `consumo_${index}`;
            const idCusto = `custo_${index}`;
            const custoValido = dadosLinha.precoMedioValido !== null ? "0.0000" : "";
            const precoMedioFormatado = dadosLinha.precoMedioValido !== null ? dadosLinha.precoMedioValido.toFixed(5) : "";
            const tr = document.createElement('tr');
            
            // ===== ALTERAÇÃO 2: Usar o valor OMIE da linha para definir a cor de AMBAS as células =====
            const corDeFundoDaLinha = obterCorDeFundo(parseFloat(dadosLinha.omie), quartisOmie);

            const tdHora = document.createElement('td');
            tdHora.textContent = dadosLinha.hora;
            tr.appendChild(tdHora);

            const tdOmie = document.createElement('td');
            tdOmie.textContent = dadosLinha.omie;
            tdOmie.style.backgroundColor = corDeFundoDaLinha; // Usar a cor calculada
            if (parseFloat(dadosLinha.omie) < 0) tdOmie.style.color = 'red';
            tr.appendChild(tdOmie);

            const tdPrecoMedio = document.createElement('td');
            tdPrecoMedio.textContent = precoMedioFormatado;
            tdPrecoMedio.style.backgroundColor = corDeFundoDaLinha; // Usar a MESMA cor
            if (dadosLinha.precoMedioValido < 0) tdPrecoMedio.style.color = 'red';
            tr.appendChild(tdPrecoMedio);

            const tdConsumo = document.createElement('td');
            tdConsumo.innerHTML = `<input type="number" step="0.001" min="0" id="${idInput}" data-preco="${precoMedioFormatado}" data-custo-id="${idCusto}" class="input-consumo" ${precoMedioFormatado ? "" : "disabled"}>`;
            tr.appendChild(tdConsumo);

            const tdCusto = document.createElement('td');
            tdCusto.id = idCusto;
            tdCusto.textContent = custoValido;
            if (parseFloat(custoValido) < 0) tdCusto.style.color = 'red';
            tr.appendChild(tdCusto);

            corpoTabela.appendChild(tr);
        });

        document.querySelectorAll(".input-consumo").forEach(input => {
            input.addEventListener("input", atualizarTotais);
        });
        atualizarTotais();
    }

    function atualizarTotais() {
        let somaConsumo = 0;
        let somaCusto = 0;
        document.querySelectorAll(".input-consumo").forEach(input => {
            const consumo = parseFloat(input.value.replace(",", ".")) || 0;
            const preco = parseFloat(input.dataset.preco);
            const custo = preco ? consumo * preco : 0;
            somaConsumo += consumo;
            somaCusto += custo;
            const custoCell = document.getElementById(input.dataset.custoId);
            if (custoCell) custoCell.textContent = custo.toFixed(4);
        });
        document.getElementById("somaConsumo").textContent = somaConsumo.toFixed(3);
        document.getElementById("somaCusto").textContent = somaCusto.toFixed(4);
        document.getElementById("mediaPonderada").textContent = somaConsumo > 0 ? (somaCusto / somaConsumo).toFixed(5) : "—";
    }

    function init() {
        const CSV_URL = "https://docs.google.com/spreadsheets/d/1goqE2sj--smB2hsw3TSC1u65y-Ind-zd/export?format=csv&id=1goqE2sj--smB2hsw3TSC1u65y-Ind-zd";
        fetch(CSV_URL)
            .then(res => res.text())
            .then(data => {
                dadosCSVGlobal = data;
                parseCSV(data);
                populaDropdowns();
            });
    }

    init();
});
