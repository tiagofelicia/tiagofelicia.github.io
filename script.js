// Adiciona um listener que executa todo o código quando o HTML estiver carregado
document.addEventListener('DOMContentLoaded', function () {

    // --- LÓGICA PARA AS TABELAS OMIE E OMIP ---
    function fetchAndProcessOMIE_OMIP() {
        // ... (todo o seu código para as tabelas OMIE e OMIP continua aqui, sem alterações)
        const csvUrl = "https://docs.google.com/spreadsheets/d/1goqE2sj--smB2hsw3TSC1u65y-Ind-zd/export?format=csv&id=1goqE2sj--smB2hsw3TSC1u65y-Ind-zd";

        fetch(csvUrl)
            .then(response => response.text())
            .then(csv => {
                const linhas = csv.trim().split("\n").map(l => l.split(","));
                const cortarColunasAteS = linha => linha.slice(18);

                const indiceOMIE = linhas.findIndex(row => row.includes("TABELA_MEDIA_OMIE"));
                const indiceOMIP = linhas.findIndex(row => row.includes("TABELA_OMIP"));

                // Processar OMIE
                const omieCabecalho1 = cortarColunasAteS(linhas[indiceOMIE + 1]);
                const omieCabecalho2 = cortarColunasAteS(linhas[indiceOMIE + 2]);
                const omieDados = [linhas[indiceOMIE + 3], linhas[indiceOMIE + 4], linhas[indiceOMIE + 5]].map(cortarColunasAteS);
                const tabelaOMIE = document.getElementById("tabela-omie");
                if (tabelaOMIE) { // Adicionar verificação se a tabela existe na página
                    tabelaOMIE.innerHTML = ''; // Limpa tabela antiga

                    const row1 = document.createElement("tr");
                    const colunasOMIE = [
                        { texto: omieCabecalho1[0], colspan: 1, cor: "dia" },
                        { texto: omieCabecalho1[1], colspan: 1, cor: "simples" },
                        { texto: omieCabecalho1[2] + " " + omieCabecalho1[3], colspan: 2, cor: "bi-horario-diario" },
                        { texto: omieCabecalho1[4] + " " + omieCabecalho1[5], colspan: 2, cor: "bi-horario_semanal" },
                        { texto: omieCabecalho1[6] + " " + omieCabecalho1[7] + " " + omieCabecalho1[8], colspan: 3, cor: "tri_horario_diario" },
                        { texto: omieCabecalho1[9] + " " + omieCabecalho1[10] + " " + omieCabecalho1[11], colspan: 3, cor: "tri_horario_semanal" }
                    ];

                    colunasOMIE.forEach(col => {
                        const th = document.createElement("th");
                        th.innerText = col.texto;
                        th.colSpan = col.colspan;
                        th.className = col.cor;
                        row1.appendChild(th);
                    });
                    tabelaOMIE.appendChild(row1);

                    const row2 = document.createElement("tr");
                    const classNames = [
                        "dia-sub", "simples-sub", "bi-horario-diario-vazio", "bi-horario-diario-fora-vazio",
                        "bi-horario-semanal-vazio", "bi-horario-semanal-fora-vazio", "tri-horario-diario-vazio",
                        "tri-horario-diario-cheias", "tri-horario-diario-ponta", "tri-horario-semanal-vazio",
                        "tri-horario-semanal-cheias", "tri-horario-semanal-ponta"
                    ];
                    omieCabecalho2.forEach((texto, i) => {
                        const th = document.createElement("th");
                        th.innerText = texto;
                        th.className = classNames[i];
                        row2.appendChild(th);
                    });
                    tabelaOMIE.appendChild(row2);

                    omieDados.forEach(linha => {
                        const tr = document.createElement("tr");
                        linha.forEach(c => {
                            const td = document.createElement("td");
                            td.innerText = c;
                            const valor = parseFloat(c.replace(",", "."));
                            if (!isNaN(valor) && valor < 0) {
                                td.classList.add("valor-negativo");
                            }
                            tr.appendChild(td);
                        });
                        tabelaOMIE.appendChild(tr);
                    });
                }
                // Processar OMIP
                const omipCabecalho = cortarColunasAteS(linhas[indiceOMIP + 1]).slice(0, 8);
                const omipDados = cortarColunasAteS(linhas[indiceOMIP + 2]).slice(0, 8);
                const tabelaOMIP = document.getElementById("tabela-omip");

                if (tabelaOMIP) { // Adicionar verificação
                    tabelaOMIP.innerHTML = ''; // Limpa tabela antiga

                    const omipHeader = document.createElement("tr");
                    omipCabecalho.forEach(c => {
                        const th = document.createElement("th");
                        th.innerText = c;
                        omipHeader.appendChild(th);
                    });

                    const omipRow = document.createElement("tr");
                    omipDados.forEach(c => {
                        const td = document.createElement("td");
                        td.innerText = c;
                        const valor = parseFloat(c.replace(",", "."));
                        if (!isNaN(valor) && valor < 0) {
                            td.classList.add("valor-negativo");
                        }
                        omipRow.appendChild(td);
                    });
                    tabelaOMIP.appendChild(omipHeader);
                    tabelaOMIP.appendChild(omipRow);
                }
            })
            .catch(err => console.error("Erro ao carregar CSV para OMIE/OMIP:", err));
    }

    // --- CARREGAMENTO DO MENU (AGORA DENTRO DO MESMO BLOCO) ---
    const menuPlaceholder = document.getElementById("menu-placeholder");
    if (menuPlaceholder) {
        fetch('menu.html')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Erro na rede: ${response.statusText}`);
                }
                return response.text();
            })
            .then(data => {
                menuPlaceholder.innerHTML = data;
            })
            .catch(error => console.error('Erro ao carregar o menu:', error));
    }

    // --- CHAMADA FINAL DE INICIALIZAÇÃO ---
    init();

}); // <--- FIM DO ÚNICO 'DOMContentLoaded'
