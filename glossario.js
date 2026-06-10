/* =====================================================================
 * glossario.js — Decoração global de termos técnicos do setor energético.
 *
 * Funcionalidades:
 *   - Lista de termos (sigla + nome + definição curta/longa + categoria)
 *   - Decoração in-DOM da 1ª ocorrência de cada termo por página
 *   - Tooltip nativo via `title=` + popover JS opcional ao hover
 *   - Toggle utilizador (persistente via localStorage)
 *   - Salvaguardas: ignora <a>, <code>, <pre>, <script>, <style>, <abbr>,
 *     <input>, <textarea>, <select>, <noscript>, headings H1-H3 e nós
 *     com data-glossario="off".
 *
 * Carregado por script.js em todas as páginas. Expõe:
 *   window.GLOSSARIO_DADOS  — dicionário completo
 *   window.GLOSSARIO_CATS   — labels das categorias
 *   window.GlossarioDecorar — API: ativar(), desativar(), refazer()
 * ===================================================================== */

(function() {
    'use strict';

    // ---------- Categorias ----------
    var CATS = {
        mercado:      'Mercado',
        regulacao:    'Regulação',
        eletricidade: 'Eletricidade',
        gas:          'Gás Natural',
        solar:        'Solar / Autoconsumo',
        unidades:     'Unidades e cálculo',
        horarios:     'Períodos horários',
        tarif:        'Tarifários',
        docs:         'Documentos legais'
    };

    // ---------- Dicionário de termos ----------
    // Estrutura: { full, cat, short, long?, nota?, related?, autoDec? }
    // autoDec: false = não decorar automaticamente em texto (ambíguo ou palavra comum)
    var GL = {
        // ===== Mercado e operadores =====
        'MIBEL': {
            full: 'Mercado Ibérico de Eletricidade',
            cat: 'mercado',
            short: 'Mercado integrado de eletricidade que une Portugal e Espanha, com componente diária (OMIE) e a prazo (OMIP).',
            long: '<p>O <strong>MIBEL</strong> arrancou em <strong>1 de julho de 2007</strong> e é o mercado integrado de eletricidade entre Portugal e Espanha. Tem duas componentes:</p><ul><li><strong>Mercado Diário e Intradiário</strong> (spot) — gerido pelo OMIE.</li><li><strong>Mercado a Prazo</strong> (futuros) — gerido pelo OMIP.</li></ul>',
            related: ['OMIE', 'OMIP']
        },
        'OMIE': {
            full: 'Operador del Mercado Ibérico de Energía (polo espanhol)',
            cat: 'mercado',
            short: 'Operador do mercado spot/diário (Day-Ahead) do MIBEL. Define os preços horários da eletricidade.',
            long: '<p>O <strong>OMIE</strong> gere o <strong>mercado diário</strong> de eletricidade do MIBEL. Os preços horários para o dia seguinte são publicados todos os dias, geralmente entre as 12:50 e as 13:30 (hora de Portugal Continental).</p>',
            related: ['MIBEL', 'OMIP', 'Day-Ahead']
        },
        'OMIP': {
            full: 'Operador do Mercado Ibérico de Energia (polo português)',
            cat: 'mercado',
            short: 'Gere o mercado a prazo (futuros) do MIBEL. Contratos diários, semanais, mensais, trimestrais e anuais.',
            long: '<p>O <strong>OMIP</strong> gere o <strong>mercado a prazo</strong> de eletricidade, onde se negoceiam contratos futuros para entrega em períodos definidos. Os contratos podem ser Diários (D), Semanais (Wk), Mensais (M), Trimestrais (Q) ou Anuais (YR).</p>',
            related: ['MIBEL', 'OMIE']
        },
        'ENTSO-E': {
            full: 'European Network of Transmission System Operators for Electricity',
            cat: 'mercado',
            short: 'Associação europeia que reúne os operadores de rede de transporte de eletricidade. Publica preços day-ahead europeus.',
            long: '<p>A <strong>ENTSO-E</strong> reúne os operadores das redes de transporte (TSOs) de eletricidade na Europa. Disponibiliza preços diários por zona de licitação via Transparency Platform — fonte do mapa de preços europeus.</p>'
        },
        'REN': {
            full: 'Redes Energéticas Nacionais',
            cat: 'mercado',
            short: 'Operador da rede de transporte de eletricidade e gás natural em Portugal. Responsável pelo equilíbrio da rede.',
            long: '<p>A <strong>REN</strong> opera a rede de transporte de eletricidade em <strong>Muito Alta Tensão</strong> em Portugal, bem como infraestruturas de gás natural. Publica diariamente dados de produção, consumo e bombagem.</p>'
        },
        'E-Redes': {
            full: 'E-Redes',
            cat: 'mercado',
            short: 'Principal operador da rede de distribuição de eletricidade em Portugal. Gere os contadores e os Diagramas de Carga.',
            long: '<p>A <strong>E-Redes</strong> é o principal operador da rede de distribuição (ORD) de eletricidade em Portugal Continental. Disponibiliza no Balcão Digital o histórico de consumos (diagrama de carga) em ficheiro <code>.xlsx</code> que é a base de muitos cálculos rigorosos.</p>',
            related: ['ORD', 'CPE']
        },
        'PVGIS': {
            full: 'Photovoltaic Geographical Information System',
            cat: 'solar',
            short: 'Ferramenta da Comissão Europeia que estima a produção solar fotovoltaica em qualquer local. Base do simulador de autoconsumo.',
            long: '<p>O <strong>PVGIS</strong> é uma ferramenta gratuita do JRC (Comissão Europeia) que estima a produção solar fotovoltaica horária ou mensal para qualquer localização da Europa e África, com base em dados de irradiância de longo prazo.</p>'
        },
        'Day-Ahead': {
            full: 'Mercado Diário (Day-Ahead)',
            cat: 'mercado',
            short: 'Mercado onde se determinam os preços horários da eletricidade para o dia seguinte. Conhecido como "mercado spot".',
            long: '<p>O <strong>Day-Ahead</strong> é o mercado onde compradores e vendedores acordam preços horários para entrega no dia seguinte. No MIBEL, é gerido pelo OMIE. Os preços são publicados diariamente, geralmente entre as 12:50 e as 13:30.</p>',
            related: ['OMIE', 'MIBEL'],
            autoDec: false
        },
        'Curva forward': {
            full: 'Curva forward',
            cat: 'mercado',
            short: 'Sucessão de preços OMIP para entrega futura, por período (semanal, mensal, trimestral, anual).',
            autoDec: false
        },
        'Spread': {
            full: 'Spread',
            cat: 'mercado',
            short: 'Diferença de preço entre duas zonas (ex.: PT vs ES) ou dois períodos. Indicador de congestionamento ou volatilidade.',
            autoDec: false
        },

        // ===== Regulação =====
        'ERSE': {
            full: 'Entidade Reguladora dos Serviços Energéticos',
            cat: 'regulacao',
            short: 'Regulador dos setores da eletricidade e gás natural em Portugal. Define tarifas reguladas, TAR e Tarifa Social.',
            long: '<p>A <strong>ERSE</strong> é a entidade reguladora independente dos setores da eletricidade e gás natural em Portugal. Publica anualmente as Tarifas de Acesso às Redes (TAR), a Tarifa Regulada do CUR e os descontos da Tarifa Social.</p>'
        },
        'DGEG': {
            full: 'Direção-Geral de Energia e Geologia',
            cat: 'regulacao',
            short: 'Serviço da Administração Pública responsável pela política energética e geológica em Portugal. Atribui a Tarifa Social.',
            long: '<p>A <strong>DGEG</strong> é responsável pela política energética nacional e pela atribuição automática da Tarifa Social, através do cruzamento mensal de dados com a Segurança Social e a Autoridade Tributária.</p>'
        },
        'CUR': {
            full: 'Comercializador de Último Recurso',
            cat: 'regulacao',
            short: 'Comercializador regulado que aplica a Tarifa Regulada definida anualmente pela ERSE.',
            long: '<p>O <strong>CUR</strong> é obrigado a fornecer energia a quem o solicite, a preços regulados pela ERSE. Em Portugal, a SU Eletricidade (eletricidade) e a Galp/Floene e Gás SU (gás) são CUR para os respetivos setores.</p>',
            related: ['ERSE', 'TT']
        },
        'TAR': {
            full: 'Tarifa de Acesso às Redes',
            cat: 'regulacao',
            short: 'Componente regulada pela ERSE que remunera o uso das redes de transporte e distribuição. Paga por todos os clientes.',
            long: '<p>A <strong>TAR</strong> é a componente regulada da fatura que remunera o uso das redes de transporte (REN) e distribuição (E-Redes / outros). É <strong>paga por todos os clientes</strong> independentemente do comercializador, e é igual no mercado regulado e no mercado livre.</p>',
            related: ['ERSE', 'CUR']
        },
        'CAV': {
            full: 'Contribuição para o Audiovisual',
            cat: 'regulacao',
            short: 'Contribuição mensal de 2,85 € (1 € reduzida para Tarifa Social) para financiar a RTP. Cobrada na fatura de eletricidade.',
            long: '<p>A <strong>CAV</strong> financia o serviço público de radiodifusão e televisão (RTP). Valor normal: <strong>2,85 €/mês</strong>; reduzido a <strong>1 €/mês</strong> para alguns beneficiários da Tarifa Social; <strong>isenta</strong> para clientes com consumo anual &lt; 400 kWh por ano civil. Tem IVA a 6 %. Base legal: Lei n.º 30/2003.</p>',
            related: ['Tarifa Social']
        },
        'IEC': {
            full: 'Imposto Especial de Consumo (eletricidade)',
            cat: 'regulacao',
            short: 'Imposto pago por kWh consumido. Definido pelo Orçamento do Estado.',
            long: '<p>O <strong>IEC</strong> é cobrado por <strong>kWh consumido</strong>. O valor é definido pela Lei do Orçamento do Estado e pode variar anualmente.</p>'
        },
        'ISP': {
            full: 'Imposto sobre Produtos Petrolíferos e Energéticos',
            cat: 'regulacao',
            short: 'Imposto pago por kWh de gás natural consumido. Aplicável desde 1 de julho de 2022.',
            long: '<p>O <strong>ISP</strong> aplica-se ao gás natural desde <strong>1 de julho de 2022</strong>, sendo cobrado por kWh consumido. O valor é definido pelo Orçamento do Estado.</p>'
        },
        'TOS': {
            full: 'Taxa de Ocupação do Subsolo',
            cat: 'regulacao',
            short: 'Taxa cobrada pelos municípios pelo direito de utilização do subsolo para passagem de condutas de gás natural.',
            long: '<p>A <strong>TOS</strong> é cobrada pelos <strong>municípios</strong> pelo uso do subsolo público para condutas de gás natural. <strong>Varia por município</strong> — cada Câmara Municipal define o valor aplicável.</p>'
        },
        'Tarifa Social': {
            full: 'Tarifa Social de Energia',
            cat: 'regulacao',
            short: 'Desconto aplicado a clientes economicamente vulneráveis em BTN ≤ 6,9 kVA (eletricidade) ou BP ≤ 500 m³/ano (gás).',
            long: '<p>A <strong>Tarifa Social</strong> é um desconto na TAR aplicado a clientes vulneráveis. Atribuição normalmente automática pela DGEG. Para a eletricidade existe critério alternativo de rendimento; no gás não — só prestações sociais.</p>',
            related: ['DGEG', 'TAR', 'CAV'],
            autoDec: false
        },
        'IAS': {
            full: 'Indexante dos Apoios Sociais',
            cat: 'regulacao',
            short: 'Valor de referência usado no cálculo de prestações sociais e do critério de rendimento da Tarifa Social. Atualizado anualmente.',
            long: '<p>O <strong>IAS</strong> é o valor de referência do sistema de Segurança Social, usado para definir o limiar de rendimento elegível para a Tarifa Social de Eletricidade. Atualiza-se anualmente.</p>'
        },
        'RSI': {
            full: 'Rendimento Social de Inserção',
            cat: 'regulacao',
            short: 'Prestação social atribuída a indivíduos em situação de pobreza. Beneficia a Tarifa Social de eletricidade e de gás.',
            long: '<p>O <strong>RSI</strong> é uma prestação social para combate à pobreza. Ser beneficiário do RSI confere direito à Tarifa Social de Eletricidade e à Tarifa Social de Gás Natural.</p>'
        },
        'CSI': {
            full: 'Complemento Solidário para Idosos',
            cat: 'regulacao',
            short: 'Prestação social para idosos com baixos rendimentos. Confere direito à Tarifa Social de eletricidade e gás.',
            long: '<p>O <strong>CSI</strong> é uma prestação para idosos com 65+ anos com baixos rendimentos. Beneficiários têm direito à Tarifa Social de energia e à CAV reduzida.</p>'
        },
        'PSI': {
            full: 'Pensão Social de Invalidez',
            cat: 'regulacao',
            short: 'Pensão para pessoas com invalidez do regime especial. Confere direito à Tarifa Social de eletricidade e de gás.',
            long: '<p>A <strong>Pensão Social de Invalidez</strong> do regime especial de proteção na invalidez (ou o Complemento da Prestação Social para a Inclusão) confere direito à Tarifa Social. Não confundir com pensão de invalidez comum.</p>'
        },
        'Ano gás': {
            full: 'Ano gás',
            cat: 'regulacao',
            short: 'Período compreendido entre 1 de outubro e 30 de setembro do ano seguinte, durante o qual se aplicam as tarifas fixadas pela ERSE.',
            long: '<p>O <strong>Ano gás</strong> é o período durante o qual se aplicam as tarifas fixadas pela ERSE para o fornecimento de gás natural.</p>'
        },
        // ===== Tensões e ligações =====
        'BTN': {
            full: 'Baixa Tensão Normal',
            cat: 'eletricidade',
            short: 'Tensão até 41,4 kVA. Onde se enquadram quase todos os clientes domésticos e pequenos negócios.',
            long: '<p>A <strong>BTN</strong> tem potências contratadas de <strong>1,15 a 41,4 kVA</strong>. É a categoria onde se encaixam a quase totalidade dos clientes domésticos e pequenos negócios. A Tarifa Social aplica-se a clientes BTN ≤ 6,9 kVA.</p>',
            related: ['kVA', 'BTE', 'MT']
        },
        'BTE': {
            full: 'Baixa Tensão Especial',
            cat: 'eletricidade',
            short: 'Tensão para potências superiores (até 250 kVA). Tipicamente clientes industriais pequenos.',
            related: ['BTN', 'MT']
        },
        'MT': {
            full: 'Média Tensão',
            cat: 'eletricidade',
            short: 'Entre 1 kV e 45 kV. Clientes industriais e comerciais médios. Não tem Tarifa Social.',
            long: '<p>A <strong>MT</strong> serve clientes industriais e comerciais médios (por exemplo, grandes superfícies). A Tarifa Social <strong>não se aplica</strong> a MT.</p>',
            related: ['BTN', 'BTE']
        },
        'kVA': {
            full: 'Quilovolt-ampere',
            cat: 'unidades',
            short: 'Unidade de potência aparente. Em BTN: 1,15 / 2,3 / 3,45 / 4,6 / 5,75 / 6,9 / 10,35 / 13,8 / 17,25 / 20,7 / 27,6 / 34,5 / 41,4 kVA.',
            long: '<p>O <strong>kVA</strong> mede a <strong>potência aparente</strong> (vs kW que mede potência ativa). Define a capacidade máxima de uso simultâneo da instalação — se exceder, o disjuntor dispara.</p>',
            related: ['kW', 'BTN']
        },
        'CPE': {
            full: 'Código de Ponto de Entrega',
            cat: 'eletricidade',
            short: 'Identificador único de 20 dígitos do contador de eletricidade (começa por PT0002 na E-Redes). Mantém-se entre comercializadores.',
            long: '<p>O <strong>CPE</strong> é o identificador único da instalação elétrica, começa por <strong>PT0002</strong> e tem 20 dígitos. É o "documento de identidade" do contador — mantém-se quando muda de comercializador.</p>',
            related: ['CUI', 'E-Redes', 'ORD']
        },
        'CUI': {
            full: 'Código Universal de Instalação',
            cat: 'gas',
            short: 'Identificador único da instalação de gás natural (começa por PT16). Mantém-se entre comercializadores.',
            related: ['CPE', 'ORD']
        },
        'ORD': {
            full: 'Operador de Rede de Distribuição',
            cat: 'mercado',
            short: 'Entidade responsável pela operação da rede de distribuição (E-Redes na eletricidade; vários no gás natural).',
            related: ['E-Redes', 'CPE', 'CUI']
        },

        // ===== Unidades e cálculo =====
        'kW': {
            full: 'Quilowatt',
            cat: 'unidades',
            short: 'Unidade de potência ativa. 1 kW = 1 000 W. Diferente de kVA (potência aparente).'
        },
        'kWh': {
            full: 'Quilowatt-hora',
            cat: 'unidades',
            short: 'Unidade de energia. 1 kWh = consumo de 1 kW durante 1 hora. Unidade base da fatura.',
            related: ['MWh', 'kW']
        },
        'Joule (J)': {
            full: 'Joule',
            cat: 'unidades',
            short: 'Unidade de energia. 1 J = 1 W·s. Unidade do Sistema Internacional (SI).',
            related: ['kWh', 'MWh']
        },
        'MWh': {
            full: 'Megawatt-hora',
            cat: 'unidades',
            short: '1 MWh = 1 000 kWh. Unidade típica dos preços de mercado grossista (OMIE, OMIP).',
            related: ['kWh', 'OMIE']
        },
        'PCS': {
            full: 'Poder Calorífico Superior',
            cat: 'gas',
            short: 'Fator que converte volume de gás (m³) em energia (kWh). Ronda os ~11 kWh/m³ e varia ligeiramente por mês e ORD.',
            long: '<p>O <strong>PCS</strong> mede a energia libertada na combustão completa de 1 m³ de gás natural. Usa-se para converter <strong>volume (m³) em energia (kWh)</strong>: Energia (kWh) ≈ Volume (m³) × PCS. Tipicamente ~<strong>11 kWh/m³</strong>, valor publicado mensalmente pelo ORD.</p>'
        },
        'Termo Fixo': {
            full: 'Termo Fixo (Potência)',
            cat: 'unidades',
            short: 'Valor pago diariamente pela disponibilidade da potência contratada (€/dia), independentemente do consumo.',
            autoDec: false
        },
        'IVA': {
            full: 'Imposto sobre o Valor Acrescentado',
            cat: 'unidades',
            short: 'Imposto que coexiste em duas taxas (6 % e 23 %) na fatura de eletricidade e gás. Não há IVA a 13 % na energia.',
            long: '<p>Na fatura de energia coexistem <strong>IVA a 6 % e a 23 %</strong> em simultâneo. Têm <strong>IVA a 6 %</strong>: TAR do termo fixo em potências ≤ 3,45 kVA, energia até 200 kWh/30 dias (300 para famílias numerosas) em potências ≤ 6,9 kVA, e a CAV. Tudo o resto tem 23 %.</p>',
            related: ['TAR', 'CAV']
        },

        // ===== Períodos horários =====
        'Vazio': {
            full: 'Vazio (período horário)',
            cat: 'horarios',
            short: 'Período em que a energia é mais barata. No ciclo diário: 22h–8h. No ciclo semanal: madrugadas dos dias úteis + grande parte do fim de semana.',
            autoDec: false
        },
        'Fora de Vazio': {
            full: 'Fora de Vazio',
            cat: 'horarios',
            short: 'Período mais caro nos tarifários bi-horários (oposto a Vazio).',
            autoDec: false
        },
        'Cheias': {
            full: 'Cheias (período horário)',
            cat: 'horarios',
            short: 'Período intermédio nos tarifários tri-horários (entre Vazio e Ponta).',
            autoDec: false
        },
        'Ponta': {
            full: 'Ponta (período horário)',
            cat: 'horarios',
            short: 'Período mais caro nos tarifários tri-horários. Tipicamente 2-3 horas por dia em dias úteis.',
            autoDec: false
        },
        'Bi-horário': {
            full: 'Tarifário Bi-horário',
            cat: 'horarios',
            short: 'Tarifário com 2 períodos: Vazio (mais barato) e Fora de Vazio.',
            autoDec: false
        },
        'Tri-horário': {
            full: 'Tarifário Tri-horário',
            cat: 'horarios',
            short: 'Tarifário com 3 períodos: Vazio, Cheias e Ponta.',
            autoDec: false
        },

        // ===== Tarifários =====
        'TT': {
            full: 'Tarifa Transitória de Venda a Clientes Finais',
            cat: 'tarif',
            short: 'Tarifa regulada aplicada pelo CUR (eletricidade e gás). Definida anualmente pela ERSE.',
            related: ['CUR', 'ERSE']
        },

        // ===== Autoconsumo solar =====
        'UPAC': {
            full: 'Unidade de Produção para Autoconsumo',
            cat: 'solar',
            short: 'Sistema de produção (tipicamente solar fotovoltaico) para consumo próprio, com ou sem injeção de excedentes na rede.',
            related: ['Autoconsumo']
        },
        'BESS': {
            full: 'Battery Energy Storage System',
            cat: 'solar',
            short: 'Sistema de armazenamento de energia em bateria. Permite usar energia produzida em horas não-solares.',
            autoDec: false
        },
        'Payback': {
            full: 'Payback (tempo de retorno)',
            cat: 'solar',
            short: 'Tempo necessário para recuperar o investimento de um sistema fotovoltaico através das poupanças/receitas geradas.',
            autoDec: false
        },
        'Autoconsumo': {
            full: 'Autoconsumo',
            cat: 'solar',
            short: 'Consumo de energia produzida na própria instalação. Em fotovoltaico, é a energia solar consumida na hora em que é produzida.',
            autoDec: false
        },

        // ===== Documentos legais =====
        'RARI': {
            full: 'Regulamento do Acesso às Redes e às Interligações',
            cat: 'docs',
            short: 'Regulamento ERSE que define regras de acesso de produtores e consumidores às redes elétricas.',
            long: '<p>O <strong>RARI</strong> (Regulamento n.º 818/2023) define as regras de acesso de produtores e consumidores às redes elétricas em Portugal — incluindo procedimentos, prazos e perfis de perdas aplicados aos cálculos.</p>'
        },
        'RRC': {
            full: 'Regulamento de Relações Comerciais',
            cat: 'docs',
            short: 'Define as regras das relações comerciais entre comercializadores, consumidores e operadores das redes.'
        },
        'ROR': {
            full: 'Regulamento de Operação das Redes',
            cat: 'docs',
            short: 'Regulamento ERSE com regras técnicas de operação das redes elétricas.'
        },
        'RQS': {
            full: 'Regulamento da Qualidade de Serviço',
            cat: 'docs',
            short: 'Define padrões mínimos de qualidade técnica e comercial do fornecimento de energia.'
        },
        'RT': {
            full: 'Regulamento Tarifário',
            cat: 'docs',
            short: 'Define a metodologia de cálculo das tarifas reguladas pela ERSE.',
            autoDec: false
        },
        'RAC': {
            full: 'Regulamento do Autoconsumo',
            cat: 'docs',
            short: 'Define as regras do autoconsumo de energia elétrica e das comunidades de energia renovável em Portugal.'
        },
        'RAIE': {
            full: 'Regulamento relativo à Apropriação Indevida de Energia',
            cat: 'docs',
            short: 'Define procedimentos e penalizações em casos de furto ou utilização irregular de energia.'
        },
        'RSRI': {
            full: 'Regulamento dos Serviços das Redes Inteligentes',
            cat: 'docs',
            short: 'Define as regras dos serviços disponibilizados pelas redes inteligentes em Portugal.'
        },

        // ===== Mercado / operadores (adições) =====
        'MIBGAS': {
            full: 'Mercado Ibérico do Gás',
            cat: 'mercado',
            short: 'Mercado organizado de gás natural ibérico. Referência para tarifários indexados de gás natural em PT/ES.',
            long: '<p>O <strong>MIBGAS</strong> é o operador do mercado ibérico de gás natural, criado em 2015. Publica preços diários (PVB-ES) que servem de referência para a maioria dos tarifários indexados de gás natural em Portugal.</p>'
        },
        'REE': {
            full: 'Red Eléctrica de España',
            cat: 'mercado',
            short: 'Operador da rede de transporte de eletricidade em Espanha. Equivalente espanhol da REN.',
            related: ['REN', 'TSO']
        },
        'TSO': {
            full: 'Transmission System Operator',
            cat: 'mercado',
            short: 'Operador da rede de transporte de eletricidade ou gás. Em Portugal: REN. Em Espanha: REE / Enagás.',
            related: ['REN', 'REE', 'DSO']
        },
        'DSO': {
            full: 'Distribution System Operator',
            cat: 'mercado',
            short: 'Operador da rede de distribuição. Termo internacional equivalente a ORD.',
            related: ['ORD', 'E-Redes']
        },
        'TTF': {
            full: 'Title Transfer Facility',
            cat: 'mercado',
            short: 'Hub virtual de gás natural na Holanda. Referência europeia para preços de gás natural.',
            autoDec: false
        },
        'Cooperativas Elétricas': {
            full: 'Cooperativas Elétricas / ORD locais em BT',
            cat: 'mercado',
            short: 'Onze pequenos operadores de rede de distribuição que servem áreas geográficas restritas em BT. A E-REDES detém ~99,5 % dos clientes.',
            long: '<p>Em Portugal Continental, além da <strong>E-REDES</strong> (operador nacional, AT/MT/BT), operam <strong>11 ORD locais</strong> exclusivamente em <strong>Baixa Tensão</strong>:</p><ul><li>A Celer (Rebordosa)</li><li>AEMC — A Eléctrica de Moreira de Cónegos</li><li>Casa do Povo de Valongo do Vouga</li><li>CEL — Cooperativa Eléctrica do Loureiro</li><li>CEVE — Cooperativa Eléctrica de Vale D\'Este</li><li>Cooperativa Eléctrica de Vilarinho</li><li>CESSN — Cooperativa Eléctrica S. Simão de Novais</li><li>Cooperativa A Lord</li><li>Cooproriz</li><li>Junta de Freguesia de Cortes do Meio</li></ul><p>Fonte: <a href="https://www.erse.pt/eletricidade/funcionamento/distribuicao/" target="_blank" rel="noopener noreferrer">ERSE — Distribuição de eletricidade</a>.</p>',
            related: ['ORD', 'E-Redes'],
            autoDec: false
        },
        'Distribuidoras de Gás': {
            full: 'Operadores de Rede de Distribuição de Gás Natural',
            cat: 'mercado',
            short: 'Empresas que distribuem gás natural em Portugal: 6 com concessão regional + 5 com licenças locais.',
            long: '<p>Os <strong>ORD de gás natural</strong> em Portugal Continental dividem-se em dois grupos:</p><p><strong>Concessões regionais (6):</strong></p><ul><li>REN Portgás Distribuição (Norte)</li><li>Lusitaniagás — Companhia de Gás do Centro</li><li>Lisboagás GDL (Lisboa)</li><li>Setgás (Margem Sul)</li><li>Tagusgás (Vale do Tejo)</li><li>Beiragás (Beiras)</li></ul><p><strong>Licenças de distribuição local (5):</strong></p><ul><li>Dianagás (Évora)</li><li>Duriensegás (Douro)</li><li>Medigás (Algarve)</li><li>Paxgás (Beja)</li><li>Sonorgás</li></ul><p>Fonte: <a href="https://www.erse.pt/gas/funcionamento/distribuicao/" target="_blank" rel="noopener noreferrer">ERSE — Distribuição de gás natural</a>.</p>',
            related: ['ORD', 'CUR Gás'],
            autoDec: false
        },
        'CUR Gás': {
            full: 'Comercializadores de Último Recurso de Gás Natural',
            cat: 'mercado',
            short: 'Em gás natural, o CUR varia consoante o município. Existem 11 CUR ligados às 11 distribuidoras (ORD).',
            long: '<p>No gás natural <strong>o CUR varia consoante o município</strong>, ligado à respetiva distribuidora (ORD). Os 11 CUR em Portugal Continental são:</p><table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:0.92em;"><thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #cbd5e1;">ORD / Distribuidora</th><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #cbd5e1;">CUR</th></tr></thead><tbody><tr><td style="padding:3px 8px;">BeiraGás</td><td style="padding:3px 8px;">BeiraGás – Floene CUR</td></tr><tr><td style="padding:3px 8px;">DianaGás</td><td style="padding:3px 8px;">DianaGás – Floene CUR</td></tr><tr><td style="padding:3px 8px;">DurienseGás</td><td style="padding:3px 8px;">DurienseGás – Floene CUR</td></tr><tr><td style="padding:3px 8px;">LisboaGás</td><td style="padding:3px 8px;">LisboaGás – Galp CUR</td></tr><tr><td style="padding:3px 8px;">LusitaniaGás</td><td style="padding:3px 8px;">LusitaniaGás – Galp CUR</td></tr><tr><td style="padding:3px 8px;">MediGás</td><td style="padding:3px 8px;">MediGás – Floene CUR</td></tr><tr><td style="padding:3px 8px;">PaxGás</td><td style="padding:3px 8px;">PaxGás – Floene CUR</td></tr><tr><td style="padding:3px 8px;">Portgás</td><td style="padding:3px 8px;">Gás SU CUR</td></tr><tr><td style="padding:3px 8px;">SetGás</td><td style="padding:3px 8px;">SetGás – Galp CUR</td></tr><tr><td style="padding:3px 8px;">Sonorgás</td><td style="padding:3px 8px;">Sonorgas CUR</td></tr><tr><td style="padding:3px 8px;">TagusGás</td><td style="padding:3px 8px;">TagusGás – Floene CUR</td></tr></tbody></table><p>Os 4 grupos comerciais — <strong>Floene</strong> (6 ORD, 48 municípios), <strong>Galp</strong> (3 ORD, 58 municípios), <strong>Gás SU</strong> (Portgás, 29 municípios) e <strong>Sonorgás</strong> (34 municípios) — cobrem os 169 municípios servidos por gás natural canalizado.</p><p>Para a lista completa com municípios e valores TOS, consulte <a href="/lista-cur-gas">CUR e ORD de Gás Natural</a>.</p>',
            related: ['CUR', 'Distribuidoras de Gás'],
            autoDec: false
        },
        'Agente de mercado': {
            full: 'Agente de mercado',
            cat: 'mercado',
            short: 'Entidade autorizada a transacionar eletricidade ou gás no mercado organizado (OMIE, OMIP, MIBGAS).',
            autoDec: false
        },
        'APREN': {
            full: 'Associação Portuguesa de Energias Renováveis',
            cat: 'mercado',
            short: 'Associação que representa o setor renovável em Portugal. Publica estatísticas mensais de produção renovável.'
        },

        // ===== Regulação (adições) =====
        'CIEG': {
            full: 'Custos de Interesse Económico Geral',
            cat: 'regulacao',
            short: 'Componente da tarifa que financia rendas extraordinárias (PRE, déficit tarifário, etc.). Pago por todos os consumidores.',
            long: '<p>Os <strong>CIEG</strong> são custos do sistema elétrico considerados de interesse económico geral, incluindo rendas garantidas da Produção em Regime Especial (renováveis e cogeração), CMEC, défice tarifário e outros. São repercutidos na fatura via TAR.</p>',
            related: ['TAR', 'PRE']
        },
        'PRE': {
            full: 'Produção em Regime Especial',
            cat: 'regulacao',
            short: 'Produção renovável e cogeração com regime de remuneração especial. Inclui FIT (Feed-in Tariff) garantidos.',
            related: ['PRO', 'CIEG']
        },
        'PRO': {
            full: 'Produção em Regime Ordinário',
            cat: 'regulacao',
            short: 'Centrais convencionais (gás, hídrica grande, etc.) que vendem em mercado sem regime especial de remuneração.',
            related: ['PRE']
        },
        'PNEC': {
            full: 'Plano Nacional Energia e Clima 2030',
            cat: 'regulacao',
            short: 'Documento estratégico nacional que define metas de descarbonização para Portugal até 2030.',
            autoDec: false
        },
        'RAB': {
            full: 'Regulatory Asset Base',
            cat: 'regulacao',
            short: 'Base de ativos regulados sobre a qual a ERSE calcula a remuneração dos operadores de rede.',
            autoDec: false
        },

        // ===== Eletricidade (adições) =====
        'AT': {
            full: 'Alta Tensão (45 kV–110 kV)',
            cat: 'eletricidade',
            short: 'Tensão entre fases entre 45 kV e 110 kV. Usada para grandes consumidores industriais.',
            long: '<p>A <strong>Alta Tensão (AT)</strong> tem tensão eficaz entre fases <strong>superior a 45 kV</strong> e inferior a 110 kV. Definição da ERSE.</p>',
            nota: 'Não confundir com "AT" fiscal (Autoridade Tributária). No setor energético, AT refere-se exclusivamente a Alta Tensão.',
            related: ['MT', 'MAT', 'BTN'],
            autoDec: false
        },
        'MAT': {
            full: 'Muito Alta Tensão',
            cat: 'eletricidade',
            short: 'Tensão entre fases ≥ 110 kV. Rede de transporte gerida pela REN.',
            related: ['AT', 'REN']
        },
        'Monofásico': {
            full: 'Ligação Monofásica',
            cat: 'eletricidade',
            short: 'Ligação elétrica com uma fase ativa + neutro. Tipicamente para potências ≤ 6,9 kVA.',
            autoDec: false
        },
        'Trifásico': {
            full: 'Ligação Trifásica',
            cat: 'eletricidade',
            short: 'Ligação elétrica com três fases ativas. Obrigatório para potências ≥ 13,80 kVA e equipamentos industriais.',
            autoDec: false
        },
        'Fator de potência': {
            full: 'Fator de potência (cos φ)',
            cat: 'eletricidade',
            short: 'Razão entre potência ativa (kW) e aparente (kVA). Quanto mais próximo de 1, mais eficiente a instalação.',
            autoDec: false
        },
        'Energia reativa': {
            full: 'Energia reativa',
            cat: 'eletricidade',
            short: 'Energia trocada entre cargas indutivas/capacitivas e a rede, sem produzir trabalho útil. Faturada em clientes MT/AT.',
            autoDec: false
        },
        'Aerogerador': {
            full: 'Aerogerador (turbina eólica)',
            cat: 'eletricidade',
            short: 'Instalação na qual uma turbina movida pelo vento aciona um gerador elétrico.',
            autoDec: false
        },

        // ===== Gás (adições) =====
        'PCI': {
            full: 'Poder Calorífico Inferior',
            cat: 'gas',
            short: 'Energia útil libertada na combustão de 1 m³ de gás, descontando o calor latente do vapor de água. Menor que o PCS.',
            related: ['PCS']
        },
        'Fator de correção': {
            full: 'Fator de correção volumétrica (gás)',
            cat: 'gas',
            short: 'Ajuste do volume medido pelo contador (m³ a temperatura/pressão ambiente) para condições padrão (15 °C, 1 atm).',
            long: '<p>O contador de gás mede o <strong>volume real</strong> a condições ambiente. O <strong>fator de correção</strong> ajusta esse volume para <strong>condições padrão (15 °C, 1 atm)</strong>, sendo tipicamente próximo de 1. Publicado mensalmente pelo ORD.</p>',
            autoDec: false
        },
        'GNL': {
            full: 'Gás Natural Liquefeito',
            cat: 'gas',
            short: 'Gás natural arrefecido a –162 °C para reduzir volume 600× e permitir transporte marítimo em navios metaneiros.'
        },
        'Biometano': {
            full: 'Biometano',
            cat: 'gas',
            short: 'Gás renovável produzido por digestão anaeróbia de resíduos orgânicos. Equivalente ao gás natural na sua composição.',
            autoDec: false
        },
        'Hidrogénio verde': {
            full: 'Hidrogénio verde',
            cat: 'gas',
            short: 'Hidrogénio produzido por eletrólise da água usando eletricidade renovável. Vetor energético sem emissões.',
            autoDec: false
        },

        // ===== Unidades (adições) =====
        'Wh': {
            full: 'Watt-hora',
            cat: 'unidades',
            short: 'Unidade base de energia. 1 kWh = 1 000 Wh.',
            related: ['kWh']
        },
        'GWh': {
            full: 'Gigawatt-hora',
            cat: 'unidades',
            short: '1 GWh = 1 000 MWh = 1 000 000 kWh.',
            related: ['MWh', 'TWh']
        },
        'TWh': {
            full: 'Terawatt-hora',
            cat: 'unidades',
            short: '1 TWh = 1 000 GWh. Usado para totais anuais (consumo nacional ~50 TWh/ano).',
            related: ['GWh']
        },
        'VA': {
            full: 'Volt-ampere',
            cat: 'unidades',
            short: 'Unidade de potência aparente. 1 kVA = 1 000 VA.',
            related: ['kVA']
        },
        'Potência aparente': {
            full: 'Potência aparente (S)',
            cat: 'unidades',
            short: 'Soma vetorial da potência ativa e reativa. Medida em VA ou kVA. S = √(P² + Q²).',
            autoDec: false
        },
        'Potência ativa': {
            full: 'Potência ativa (P)',
            cat: 'unidades',
            short: 'Potência que produz trabalho útil. Medida em W ou kW. É a que aparece na conta.',
            autoDec: false
        },

        // ===== Horários (adições) =====
        'Tarifa Simples': {
            full: 'Tarifa Simples',
            cat: 'horarios',
            short: 'Opção tarifária com preço único da energia 24h/dia, sem distinção horária. Alternativa à bi-horária e tri-horária.',
            autoDec: false
        },

        // ===== Tarifários (adições) =====
        'Tarifa Fixa': {
            full: 'Tarifa Fixa',
            cat: 'tarif',
            short: 'Tarifário com preços de energia e termo fixo estáveis durante o período contratado (tipicamente 1 ano).',
            autoDec: false
        },
        'Tarifa Indexada': {
            full: 'Tarifa Indexada',
            cat: 'tarif',
            short: 'Tarifário cujo preço de energia varia com o OMIE. Pode ser indexado à média mensal ou hora a hora.',
            autoDec: false
        },
        'Tarifa Dinâmica': {
            full: 'Tarifa Dinâmica (quarto-horária)',
            cat: 'tarif',
            short: 'Tarifário indexado ao OMIE com preço a variar por hora ou quarto-hora. Reflete o preço de mercado em tempo quase real.',
            autoDec: false
        },
        'Mercado Livre': {
            full: 'Mercado Livre',
            cat: 'tarif',
            short: 'Conjunto de comercializadores não-regulados. Preços livres negociados entre cliente e comercializador.',
            related: ['CUR'],
            autoDec: false
        },
        'Mercado Regulado': {
            full: 'Mercado Regulado',
            cat: 'tarif',
            short: 'Fornecimento de energia pelo CUR a preços fixados pela ERSE (Tarifa Transitória).',
            related: ['CUR', 'TT'],
            autoDec: false
        },

        // ===== Solar / Autoconsumo (adições) =====
        'CER': {
            full: 'Comunidade de Energia Renovável',
            cat: 'solar',
            short: 'Vários consumidores partilham uma instalação de produção renovável (tipicamente fotovoltaica) e a energia produzida.',
            long: '<p>As <strong>Comunidades de Energia Renovável</strong> permitem que vários consumidores partilhem uma instalação de produção (tipicamente FV) e a energia produzida. Regulamentadas pelo Decreto-Lei n.º 162/2019.</p>',
            related: ['UPAC', 'Autoconsumo']
        },
        'Excedente solar': {
            full: 'Excedente de produção solar',
            cat: 'solar',
            short: 'Energia produzida pela UPAC acima do consumo instantâneo, injetada na rede. Pode ser vendida ou compensada.',
            autoDec: false
        },
        'Inversor': {
            full: 'Inversor solar',
            cat: 'solar',
            short: 'Equipamento que converte a corrente contínua (DC) dos painéis em corrente alternada (AC) compatível com a rede.',
            autoDec: false
        },
        'Painel fotovoltaico': {
            full: 'Painel fotovoltaico',
            cat: 'solar',
            short: 'Módulo solar que converte luz solar em eletricidade DC. Tipicamente 400–550 Wp por painel residencial.',
            autoDec: false
        },

        // ===== Outros (adições) =====
        'Diagrama de carga': {
            full: 'Diagrama de carga (E-Redes)',
            cat: 'mercado',
            short: 'Ficheiro .xlsx descarregável no Balcão Digital da E-Redes com o consumo registado quarto-hora a quarto-hora.',
            long: '<p>O <strong>diagrama de carga</strong> regista o consumo do cliente em períodos de 15 minutos (clientes com contador inteligente) ou de uma hora. Disponível no <a href="https://balcaodigital.e-redes.pt" target="_blank" rel="noopener noreferrer">Balcão Digital da E-Redes</a> em ficheiro <code>.xlsx</code>. Base para análises rigorosas em tarifários dinâmicos e simulação de autoconsumo.</p>',
            related: ['E-Redes', 'CPE'],
            autoDec: false
        },

        // ===== Adições baseadas no glossário oficial ERSE (letras B-F, T) =====

        // Contratos históricos e mecanismos do setor
        'CMEC': {
            full: 'Custos para a Manutenção do Equilíbrio Contratual',
            cat: 'regulacao',
            short: 'Compensação devida aos antigos titulares de CAE pela cessação antecipada destes contratos com a entrada do MIBEL.',
            long: '<p>Os <strong>CMEC</strong> compensam os antigos titulares de Contratos de Aquisição de Energia (CAE) pela sua cessação antecipada com a liberalização do mercado. São repercutidos na fatura via tarifa de Uso Global do Sistema (CIEG).</p>',
            related: ['CAE', 'CIEG']
        },
        'CAE': {
            full: 'Contrato de Aquisição de Energia',
            cat: 'regulacao',
            short: 'Contrato de longo prazo entre produtores e a entidade concessionária da Rede Nacional de Transporte (REN), anterior à liberalização.',
            related: ['CMEC', 'REN']
        },
        'CURg': {
            full: 'Comercializador de Último Recurso Grossista (gás)',
            cat: 'regulacao',
            short: 'Entidade obrigada a assegurar o fornecimento de gás a comercializadores retalhistas e a grandes clientes em mercado regulado grossista.',
            related: ['CUR', 'CUR Gás']
        },

        // Cogeração e fontes
        'Cogeração': {
            full: 'Cogeração',
            cat: 'eletricidade',
            short: 'Produção simultânea de energia elétrica e térmica útil a partir do mesmo combustível, com maior eficiência energética global.',
            autoDec: false
        },
        'Fontes renováveis': {
            full: 'Fontes de Energia Renováveis',
            cat: 'mercado',
            short: 'Fontes não fósseis: eólica, solar, geotérmica, das ondas, das marés, hídrica, biomassa, gás de aterro e biogás.',
            autoDec: false
        },
        'Energia eólica': {
            full: 'Energia eólica',
            cat: 'mercado',
            short: 'Energia elétrica produzida por aerogeradores que aproveitam a energia cinética do vento.',
            autoDec: false
        },
        'Energia hídrica': {
            full: 'Energia hídrica',
            cat: 'mercado',
            short: 'Energia elétrica produzida em centrais hidroelétricas, aproveitando o caudal ou desnível de água.',
            autoDec: false
        },
        'Energia solar fotovoltaica': {
            full: 'Energia solar fotovoltaica',
            cat: 'mercado',
            short: 'Conversão direta da luz solar em eletricidade através do efeito fotovoltaico em painéis FV.',
            autoDec: false
        },
        'Energia termoelétrica': {
            full: 'Energia termoelétrica',
            cat: 'mercado',
            short: 'Energia elétrica produzida pela queima de combustíveis fósseis (gás natural, carvão, fuelóleo, gasóleo).',
            autoDec: false
        },
        'Energia nuclear': {
            full: 'Energia nuclear',
            cat: 'mercado',
            short: 'Energia elétrica produzida pela fissão nuclear. Portugal não tem centrais nucleares; importa de Espanha.',
            autoDec: false
        },

        // Períodos horários (definições oficiais ERSE)
        'Ciclo diário': {
            full: 'Ciclo diário',
            cat: 'horarios',
            short: 'Ciclo horário com os mesmos períodos (Vazio, Cheias, Ponta) todos os dias da semana.',
            autoDec: false
        },
        'Ciclo semanal': {
            full: 'Ciclo semanal',
            cat: 'horarios',
            short: 'Ciclo horário com distinção entre dias úteis, sábados e domingos, e ainda Verão/Inverno.',
            autoDec: false
        },
        'Contagem bi-horária': {
            full: 'Contagem bi-horária',
            cat: 'horarios',
            short: 'Medição que distingue dois períodos: Vazio e Fora de Vazio.',
            autoDec: false
        },
        'Contagem tri-horária': {
            full: 'Contagem tri-horária',
            cat: 'horarios',
            short: 'Medição em três períodos: Vazio, Cheias e Ponta.',
            autoDec: false
        },
        'Contagem tetra-horária': {
            full: 'Contagem tetra-horária',
            cat: 'horarios',
            short: 'Medição em quatro períodos: Vazio Normal, Super Vazio, Cheias e Ponta. Aplicável a clientes MT/AT.',
            autoDec: false
        },

        // Equipamentos e qualidade de serviço
        'Contador inteligente': {
            full: 'Contador inteligente (smart meter)',
            cat: 'eletricidade',
            short: 'Equipamento de medição que regista o consumo em intervalos curtos (15 min ou 1 h) e comunica remotamente com o ORD.',
            related: ['E-Redes', 'Diagrama de carga'],
            autoDec: false
        },
        'Disjuntor': {
            full: 'Disjuntor',
            cat: 'eletricidade',
            short: 'Dispositivo de proteção que abre automaticamente o circuito em caso de curto-circuito ou sobrecarga (excesso de potência).',
            autoDec: false
        },
        'SAIDI': {
            full: 'System Average Interruption Duration Index',
            cat: 'eletricidade',
            short: 'Indicador da qualidade do serviço — duração média das interrupções por cliente, em minutos por ano.'
        },
        'SAIFI': {
            full: 'System Average Interruption Frequency Index',
            cat: 'eletricidade',
            short: 'Indicador da qualidade do serviço — número médio de interrupções por cliente, por ano.'
        },

        // Tipos de cliente
        'Cliente doméstico': {
            full: 'Cliente doméstico',
            cat: 'regulacao',
            short: 'Cliente que compra gás natural ou eletricidade para uso doméstico próprio, sem fim profissional.',
            autoDec: false
        },
        'Cliente não-doméstico': {
            full: 'Cliente não-doméstico',
            cat: 'regulacao',
            short: 'Cliente que compra energia para uso profissional ou comercial (comércio, serviços, indústria).',
            autoDec: false
        },

        // Ambiente
        'GEE': {
            full: 'Gases de Efeito Estufa',
            cat: 'regulacao',
            short: 'Gases que retêm calor na atmosfera: CO₂ (o principal), metano (CH₄), óxidos de azoto, etc. Causa do aquecimento global.'
        },
        'CO2e': {
            full: 'Equivalente CO₂',
            cat: 'regulacao',
            short: 'Equivalência em CO₂ usada para comparar o impacto climático de diferentes GEE.',
            autoDec: false
        },

        // Unidades adicionais (mercado petróleo / gás)
        'Brent': {
            full: 'Brent (petróleo)',
            cat: 'mercado',
            short: 'Tipo de petróleo do Mar do Norte usado como uma das principais referências mundiais para preço do barril de petróleo bruto.',
            autoDec: false
        },
        'BTU': {
            full: 'British Thermal Unit',
            cat: 'unidades',
            short: 'Unidade imperial de energia. 1 BTU ≈ 1 055 J. Frequente em mercados anglo-saxónicos de gás (MMBtu).'
        },

        // ===== Adições baseadas no glossário oficial ERSE (letras G-U) =====

        // Mercado e operações
        'Gestão da procura': {
            full: 'Gestão da procura',
            cat: 'mercado',
            short: 'Medidas de incentivo aos consumidores para modificar os seus padrões de consumo, normalmente deslocando consumo de horas de Ponta para Vazio.',
            autoDec: false
        },
        'Gestor de Sistema': {
            full: 'Gestor de Sistema',
            cat: 'mercado',
            short: 'Função (atribuída à REN) que assegura a coordenação do funcionamento das instalações da Rede Nacional de Transporte.',
            related: ['REN'],
            autoDec: false
        },
        'ICE': {
            full: 'Intercontinental Exchange',
            cat: 'mercado',
            short: 'Empresa norte-americana que opera mercados de futuros e derivados energéticos (eletricidade, gás, petróleo, CO₂).'
        },
        'Mercado spot': {
            full: 'Mercado spot / Mercado diário',
            cat: 'mercado',
            short: 'Mercado de entrega imediata. Para eletricidade, é o OMIE Day-Ahead. Para gás, é o MIBGAS.',
            related: ['OMIE', 'MIBGAS', 'Day-Ahead'],
            autoDec: false
        },
        'Ordem de mérito': {
            full: 'Ordem de mérito',
            cat: 'mercado',
            short: 'Sequência ordenada de ofertas de produção por preço crescente. Define quais centrais entram em despacho até cobrir a procura.',
            long: '<p>A <strong>ordem de mérito</strong> determina o despacho económico do sistema: as centrais com custos marginais mais baixos (renováveis, hídrica, nuclear) entram primeiro; o gás natural costuma fechar a oferta, fixando o preço marginal do MIBEL.</p>',
            autoDec: false
        },
        'OPEP': {
            full: 'Organização dos Países Exportadores de Petróleo',
            cat: 'mercado',
            short: 'Cartel internacional que coordena políticas de produção e exportação de petróleo bruto. Reúne 13 países.'
        },
        'OLMC': {
            full: 'Operador Logístico de Mudança de Comercializador',
            cat: 'mercado',
            short: 'Entidade que gere o processo de mudança de comercializador, garantindo que ocorre sem cortes de fornecimento.',
            related: ['CUR', 'ORD']
        },
        'Upstream': {
            full: 'Upstream (petróleo / gás)',
            cat: 'mercado',
            short: 'Setor da indústria petrolífera e de gás que abrange a exploração e a produção (extração).',
            autoDec: false
        },
        'Midstream': {
            full: 'Midstream (petróleo / gás)',
            cat: 'mercado',
            short: 'Setor que abrange o transporte e armazenamento de petróleo bruto e gás natural entre a extração e a refinação.',
            autoDec: false
        },
        'Downstream': {
            full: 'Downstream (petróleo / gás)',
            cat: 'mercado',
            short: 'Setor que abrange a refinação, distribuição e comercialização ao cliente final.',
            autoDec: false
        },

        // Regulação
        'IPC': {
            full: 'Índice de Preços no Consumidor',
            cat: 'regulacao',
            short: 'Indicador da evolução dos preços ao consumidor (INE). Usado em fórmulas de tarifários indexados à inflação.'
        },
        'Período de regulação': {
            full: 'Período de regulação',
            cat: 'regulacao',
            short: 'Intervalo de tempo durante o qual a ERSE fixa antecipadamente os parâmetros para cálculo de proveitos e tarifas reguladas. Tipicamente 3 anos.',
            autoDec: false
        },
        'Opção tarifária': {
            full: 'Opção tarifária',
            cat: 'regulacao',
            short: 'Modalidade de tarifa que o cliente pode escolher consoante potência contratada: simples, bi-horária ou tri-horária, com ciclo diário ou semanal.',
            autoDec: false
        },
        'Licença de concessão': {
            full: 'Licença de concessão',
            cat: 'regulacao',
            short: 'Contrato em que o Estado atribui ao titular direitos sobre uma área e período definidos, em troca de obrigações e taxas.',
            autoDec: false
        },

        // Eletricidade — infraestrutura e regulação técnica
        'Potência contratada': {
            full: 'Potência contratada',
            cat: 'eletricidade',
            short: 'Potência (em kVA) que o ORD disponibiliza contratualmente ao cliente. Define o termo fixo da fatura e o limite máximo do disjuntor.',
            related: ['kVA', 'Termo Fixo'],
            autoDec: false
        },
        'Ponto de entrega': {
            full: 'Ponto de entrega',
            cat: 'eletricidade',
            short: 'Localização da rede onde a eletricidade ou o gás transitam para a instalação do cliente. Identificado por CPE (eletricidade) ou CUI (gás).',
            related: ['CPE', 'CUI'],
            autoDec: false
        },
        'Posto de transformação': {
            full: 'Posto de transformação (PT)',
            cat: 'eletricidade',
            short: 'Instalação que converte tensão entre MT (15 ou 30 kV) e BT (400/230 V). Liga as redes MT às BT de distribuição local.',
            autoDec: false
        },
        'Subestação': {
            full: 'Subestação (SE)',
            cat: 'eletricidade',
            short: 'Instalação com equipamentos para transformação de tensão, compensação de fator de potência ou seccionamento de linhas.',
            autoDec: false
        },
        'RESP': {
            full: 'Rede Elétrica de Serviço Público',
            cat: 'eletricidade',
            short: 'Conjunto integrado das redes de transporte e distribuição que asseguram o serviço público de eletricidade.'
        },
        'RND': {
            full: 'Rede Nacional de Distribuição',
            cat: 'eletricidade',
            short: 'Conjunto das redes de distribuição de eletricidade em MT e BT, operadas maioritariamente pela E-REDES.'
        },
        'RNT': {
            full: 'Rede Nacional de Transporte',
            cat: 'eletricidade',
            short: 'Rede em MAT (≥110 kV) operada pela REN, que interliga centrais produtoras às redes de distribuição.',
            related: ['REN', 'MAT']
        },
        'Grupo gerador': {
            full: 'Grupo gerador',
            cat: 'eletricidade',
            short: 'Conjunto de equipamentos com máquina motriz (turbina, motor) acoplada a um alternador, que produz energia elétrica.',
            autoDec: false
        },

        // Gás natural — vocabulário técnico
        'm³(n)': {
            full: 'Metro cúbico normal (m³(n))',
            cat: 'gas',
            short: 'Volume de gás medido em condições padrão: 0 °C e 1 013,25 mbar. Usado para faturação grossista de gás.',
            related: ['PCS', 'PCI']
        },
        'GPL': {
            full: 'Gás de Petróleo Liquefeito',
            cat: 'gas',
            short: 'Mistura de propano e butano que passa ao estado líquido sob pressão moderada. Usado em garrafas e botijas.',
            autoDec: false
        },
        'GNC': {
            full: 'Gás Natural Comprimido',
            cat: 'gas',
            short: 'Gás natural sob pressão (~200 bar), usado para abastecimento veicular (autocarros, camiões) e zonas sem rede.',
            autoDec: false
        },
        'GNV': {
            full: 'Gás Natural Veicular',
            cat: 'gas',
            short: 'Designação genérica do gás natural usado como combustível em veículos (GNC ou GNL).',
            autoDec: false
        },
        'Mercaptano': {
            full: 'Mercaptano',
            cat: 'gas',
            short: 'Composto sulfuroso adicionado ao gás natural e GPL para lhe dar odor detetável — o gás é incolor e inodoro por natureza.',
            autoDec: false
        },
        'IW': {
            full: 'Índice de Wobbe',
            cat: 'gas',
            short: 'Razão entre poder calorífico e densidade do gás. Mede a intercambialidade entre diferentes qualidades de gás.'
        },
        'UAG': {
            full: 'Unidade Autónoma de Gás',
            cat: 'gas',
            short: 'Terminal que recebe GNL por camião-cisterna, armazena temporariamente e regaseifica para uso local. Usado em zonas sem rede.',
            related: ['GNL']
        },
        'MP': {
            full: 'Média Pressão',
            cat: 'gas',
            short: 'Pressão de gás natural superior a 4 bar e igual ou inferior a 20 bar. Usada para redes secundárias.',
            related: ['BP']
        },
        'Metano': {
            full: 'Metano (CH₄)',
            cat: 'gas',
            short: 'Hidrocarboneto mais simples e principal componente do gás natural. Gás de efeito de estufa muito potente.'
        },
        'RNDGN': {
            full: 'Rede Nacional de Distribuição de Gás Natural',
            cat: 'gas',
            short: 'Conjunto das redes de distribuição de gás natural (MP e BP) das 11 concessionárias e licenciadas.',
            related: ['Distribuidoras de Gás']
        },
        'RNTGN': {
            full: 'Rede Nacional de Transporte de Gás Natural',
            cat: 'gas',
            short: 'Rede de gasodutos de alta pressão operada pela REN, que liga o terminal GNL de Sines e as interligações com Espanha às redes de distribuição.',
            related: ['REN', 'GNL']
        },

        // Solar / Renováveis (índices de produção)
        'IPE': {
            full: 'Índice de Produtibilidade Eólica',
            cat: 'solar',
            short: 'Quantifica desvio mensal da produção eólica face à média de longo prazo. >1 = ano mais ventoso que a média.',
            autoDec: false
        },
        'IPH': {
            full: 'Índice de Produtibilidade Hidroelétrica',
            cat: 'solar',
            short: 'Quantifica desvio mensal da produção hídrica face à média de longo prazo. >1 = ano mais chuvoso que a média.',
            autoDec: false
        },
        'LCA': {
            full: 'Life Cycle Assessment',
            cat: 'solar',
            short: 'Análise do impacto ambiental ao longo de todo o ciclo de vida de um produto: matérias-primas, produção, uso e fim de vida.'
        }
    };

    // Expor globalmente (para a página /glossario.html)
    window.GLOSSARIO_DADOS = GL;
    window.GLOSSARIO_CATS = CATS;

    // ---------- Decoração in-DOM ----------
    // Tags onde NÃO decorar
    var TAGS_SKIP = {
        'A': 1, 'CODE': 1, 'PRE': 1, 'KBD': 1, 'SCRIPT': 1, 'STYLE': 1,
        'NOSCRIPT': 1, 'INPUT': 1, 'TEXTAREA': 1, 'SELECT': 1, 'BUTTON': 1,
        'ABBR': 1, 'OPTION': 1, 'SVG': 1,
        'H1': 1, 'H2': 1, 'H3': 1 // sem decorar nos cabeçalhos
    };

    // Construir lista de termos a decorar (ordenada por comprimento descendente
    // para que termos mais longos sejam tentados primeiro, ex.: "Tarifa Social" antes de "Tarifa")
    var TERMOS_AUTODEC = Object.keys(GL).filter(function(k) {
        return GL[k].autoDec !== false;
    }).sort(function(a, b) { return b.length - a.length; });

    // Compilar regex por termo (case-sensitive para siglas; case-insensitive para nomes longos)
    var TERMO_REGEX = {};
    TERMOS_AUTODEC.forEach(function(t) {
        // Escapar caracteres especiais
        var escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Para termos só em maiúsculas/com hífens (siglas) → case-sensitive + word boundary;
        // para nomes próprios capitalizados → case-sensitive idem.
        TERMO_REGEX[t] = new RegExp('\\b' + escaped + '\\b');
    });

    function nodoIgnoravel(node) {
        if (!node) return true;
        if (node.nodeType !== 1) return false;
        if (TAGS_SKIP[node.tagName]) return true;
        if (node.dataset && (node.dataset.glossario === 'off' || node.dataset.glHandled === '1')) return true;
        if (node.classList && node.classList.contains('gl-term')) return true;
        return false;
    }

    function ascendIgnoravel(node) {
        for (var cur = node; cur && cur.nodeType === 1; cur = cur.parentNode) {
            if (nodoIgnoravel(cur)) return true;
        }
        return false;
    }

    // Quais termos já foram decorados nesta página (1ª ocorrência apenas)
    var jaDecorado = {};

    function decorarTexto(textNode) {
        if (!textNode || textNode.nodeType !== 3) return;
        if (ascendIgnoravel(textNode.parentNode)) return;

        var texto = textNode.nodeValue;
        if (!texto || texto.length < 2) return;

        // Encontrar o primeiro termo (não-decorado ainda) que aparece neste nó
        var melhor = null;
        for (var i = 0; i < TERMOS_AUTODEC.length; i++) {
            var t = TERMOS_AUTODEC[i];
            if (jaDecorado[t]) continue;
            var m = texto.match(TERMO_REGEX[t]);
            if (m && (!melhor || m.index < melhor.idx)) {
                melhor = { t: t, idx: m.index, m: m[0] };
                if (m.index === 0) break;
            }
        }

        if (!melhor) return;

        // Substituir o texto
        var antes = texto.slice(0, melhor.idx);
        var matched = melhor.m;
        var depois = texto.slice(melhor.idx + matched.length);

        var pai = textNode.parentNode;
        if (antes) pai.insertBefore(document.createTextNode(antes), textNode);

        var entry = GL[melhor.t];
        var abbr = document.createElement('abbr');
        abbr.className = 'gl-term';
        abbr.dataset.term = melhor.t;
        abbr.setAttribute('tabindex', '0');
        abbr.setAttribute('role', 'button');
        // Fallback nativo (browsers / leitores ecrã sem JS / SR)
        abbr.setAttribute('title', (entry.full ? entry.full + ' — ' : '') + entry.short);
        abbr.setAttribute('aria-label', melhor.t + (entry.full ? ' (' + entry.full + ')' : '') + ' — ver definição');
        abbr.appendChild(document.createTextNode(matched));
        pai.insertBefore(abbr, textNode);

        textNode.nodeValue = depois;

        jaDecorado[melhor.t] = true;
    }

    function caminharENodecorar(root) {
        if (!root) return;
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function(node) {
                if (!node.nodeValue || node.nodeValue.length < 2) return NodeFilter.FILTER_REJECT;
                if (ascendIgnoravel(node.parentNode)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        // Coletar nós primeiro (para não invalidar o walker ao mutar o DOM)
        var nodos = [];
        var n;
        while ((n = walker.nextNode())) nodos.push(n);

        for (var i = 0; i < nodos.length; i++) {
            if (Object.keys(jaDecorado).length === TERMOS_AUTODEC.length) break;
            decorarTexto(nodos[i]);
        }
    }

    function ativar() {
        // Não correr em páginas sem <main>
        var main = document.getElementById('main-content') || document.querySelector('main');
        if (!main) return;
        // Não correr na própria página do glossário (ia interferir com listas).
        // O site é servido com URLs sem extensão (/glossario) — aceitar ambas as formas.
        if (/\/glossario(\.html)?$/.test(window.location.pathname)) return;

        var processar = function() {
            jaDecorado = {};
            caminharENodecorar(main);
        };

        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(processar, { timeout: 1500 });
        } else {
            setTimeout(processar, 200);
        }
    }

    function desativar() {
        // Reverter decorações: substituir cada <abbr class="gl-term"> pelo texto original
        document.querySelectorAll('abbr.gl-term').forEach(function(el) {
            var txt = el.textContent;
            var pai = el.parentNode;
            if (!pai) return;
            pai.replaceChild(document.createTextNode(txt), el);
            // Compactar text nodes adjacentes
            pai.normalize();
        });
    }

    function refazer() {
        desativar();
        ativar();
    }

    window.GlossarioDecorar = { ativar: ativar, desativar: desativar, refazer: refazer };

    // ---------- Tooltip popover ----------
    // Singleton no DOM, reutilizado para todos os termos.
    var tooltipEl = null;
    var tooltipTarget = null;
    var hideTimer = null;
    var showTimer = null;

    var CAT_ICON = {
        mercado: '📊', regulacao: '⚖️', eletricidade: '⚡', gas: '🔥',
        solar: '☀️', unidades: '📏', horarios: '⏱️', tarif: '💰', docs: '📜'
    };

    function criarTooltip() {
        if (tooltipEl) return tooltipEl;
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'gl-tooltip';
        tooltipEl.className = 'gl-tooltip';
        tooltipEl.setAttribute('role', 'tooltip');
        tooltipEl.style.cssText = 'position:absolute;display:none;';
        // Não esconder quando o rato entra no próprio tooltip
        tooltipEl.addEventListener('mouseenter', function() {
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        });
        tooltipEl.addEventListener('mouseleave', function() {
            agendarOcultar(250);
        });
        document.body.appendChild(tooltipEl);
        return tooltipEl;
    }

    function escapeHtml(s) {
        return (s || '').toString()
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function popularTooltip(termoKey) {
        var t = GL[termoKey];
        if (!t) return;
        var anchor = termoKey.replace(/[^A-Za-z0-9_-]/g, '-');
        var icon = CAT_ICON[t.cat] || '🏷️';
        var catLabel = CATS[t.cat] || t.cat;

        var html = '';
        html += '<div class="gl-tooltip-cabec">';
        html += '<span class="gl-tooltip-sigla">' + escapeHtml(termoKey) + '</span>';
        if (t.full) html += '<span class="gl-tooltip-full">' + escapeHtml(t.full) + '</span>';
        html += '</div>';
        html += '<div class="gl-tooltip-cat"><span class="gl-cat-badge ' + t.cat + '">' + icon + ' ' + escapeHtml(catLabel) + '</span></div>';
        html += '<div class="gl-tooltip-def">' + escapeHtml(t.short) + '</div>';
        html += '<a class="gl-tooltip-btn" href="/glossario#' + anchor + '" target="_blank" rel="noopener" aria-label="Abrir ' + escapeHtml(termoKey) + ' no glossário (nova aba)">Saber mais <span aria-hidden="true">↗</span></a>';
        html += '<div class="gl-tooltip-arrow"></div>';
        tooltipEl.innerHTML = html;
    }

    function posicionarTooltip(target) {
        var rect = target.getBoundingClientRect();
        var scrollY = window.pageYOffset || document.documentElement.scrollTop;
        var scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        var viewportW = window.innerWidth;
        var viewportH = window.innerHeight;

        // Tornar visível antes de medir
        tooltipEl.style.display = 'block';
        tooltipEl.style.left = '0px';
        tooltipEl.style.top = '0px';
        tooltipEl.classList.remove('gl-tooltip-below', 'gl-tooltip-above');

        var ttRect = tooltipEl.getBoundingClientRect();
        var ttW = ttRect.width;
        var ttH = ttRect.height;

        // Posição horizontal centrada no termo, mas dentro do viewport
        var termoCentroX = rect.left + rect.width / 2;
        var left = termoCentroX - ttW / 2;
        var margin = 8;
        if (left < margin) left = margin;
        if (left + ttW > viewportW - margin) left = viewportW - ttW - margin;

        // Posição vertical: tenta acima; se não couber, vai abaixo
        var topAcima = rect.top - ttH - 10;
        var topAbaixo = rect.bottom + 10;
        var top, dirArrow;
        if (topAcima >= margin) {
            top = topAcima;
            dirArrow = 'below'; // seta aponta para baixo (em direção ao termo)
            tooltipEl.classList.add('gl-tooltip-above');
        } else {
            top = topAbaixo;
            dirArrow = 'above';
            tooltipEl.classList.add('gl-tooltip-below');
        }

        // Aplicar coordenadas absolutas (page coordinates)
        tooltipEl.style.left = (left + scrollX) + 'px';
        tooltipEl.style.top  = (top + scrollY) + 'px';

        // Posicionar seta
        var arrow = tooltipEl.querySelector('.gl-tooltip-arrow');
        if (arrow) {
            var arrowX = termoCentroX - (left + scrollX) + scrollX; // relativo ao tooltip
            arrowX = Math.max(14, Math.min(ttW - 14, arrowX));
            arrow.style.left = arrowX + 'px';
        }

        // ID dinâmico para aria-describedby
        var ttId = 'gl-tooltip';
        tooltipEl.id = ttId;
        target.setAttribute('aria-describedby', ttId);

        // Animação fade-in
        requestAnimationFrame(function() {
            tooltipEl.classList.add('gl-tooltip-visible');
        });
    }

    function mostrarTooltip(target) {
        if (!target || !target.dataset || !target.dataset.term) return;
        if (showTimer) { clearTimeout(showTimer); showTimer = null; }
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        tooltipTarget = target;
        criarTooltip();
        popularTooltip(target.dataset.term);
        posicionarTooltip(target);
    }

    function ocultarTooltip() {
        if (!tooltipEl) return;
        tooltipEl.classList.remove('gl-tooltip-visible');
        tooltipEl.style.display = 'none';
        if (tooltipTarget) {
            tooltipTarget.removeAttribute('aria-describedby');
            tooltipTarget = null;
        }
    }

    function agendarMostrar(target, delay) {
        if (showTimer) clearTimeout(showTimer);
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        showTimer = setTimeout(function() {
            showTimer = null;
            mostrarTooltip(target);
        }, delay);
    }

    function agendarOcultar(delay) {
        if (hideTimer) clearTimeout(hideTimer);
        if (showTimer) { clearTimeout(showTimer); showTimer = null; }
        hideTimer = setTimeout(function() {
            hideTimer = null;
            ocultarTooltip();
        }, delay);
    }

    // Event delegation no body — funciona para termos decorados dinamicamente
    function temPointerFino() {
        return window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    }

    document.addEventListener('mouseover', function(e) {
        var target = e.target;
        if (!target.classList || !target.classList.contains('gl-term')) return;
        if (!temPointerFino()) return; // em touch ignora hover
        agendarMostrar(target, 200);
    });

    document.addEventListener('mouseout', function(e) {
        var target = e.target;
        if (!target.classList || !target.classList.contains('gl-term')) return;
        if (!temPointerFino()) return;
        agendarOcultar(250);
    });

    document.addEventListener('click', function(e) {
        var target = e.target.closest && e.target.closest('abbr.gl-term');
        if (!target) {
            // Click fora do tooltip → fechar
            if (tooltipEl && tooltipEl.classList.contains('gl-tooltip-visible') &&
                !(tooltipEl.contains(e.target))) {
                ocultarTooltip();
            }
            return;
        }
        // Click num termo: alterna o tooltip
        e.preventDefault();
        if (tooltipTarget === target && tooltipEl && tooltipEl.classList.contains('gl-tooltip-visible')) {
            ocultarTooltip();
        } else {
            mostrarTooltip(target);
        }
    });

    document.addEventListener('focusin', function(e) {
        var target = e.target;
        if (!target.classList || !target.classList.contains('gl-term')) return;
        mostrarTooltip(target);
    });

    document.addEventListener('focusout', function(e) {
        var target = e.target;
        if (!target.classList || !target.classList.contains('gl-term')) return;
        agendarOcultar(150);
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && tooltipEl && tooltipEl.classList.contains('gl-tooltip-visible')) {
            ocultarTooltip();
            // Devolver foco ao termo
            if (tooltipTarget && tooltipTarget.focus) tooltipTarget.focus();
        }
    });

    // Recalcular posição em resize/scroll (apenas se visível)
    window.addEventListener('scroll', function() {
        if (tooltipEl && tooltipEl.classList.contains('gl-tooltip-visible') && tooltipTarget) {
            posicionarTooltip(tooltipTarget);
        }
    }, { passive: true });
    window.addEventListener('resize', function() {
        if (tooltipEl && tooltipEl.classList.contains('gl-tooltip-visible') && tooltipTarget) {
            posicionarTooltip(tooltipTarget);
        }
    });

    // ---------- Auto-inicialização ----------
    function init() {
        var pref = localStorage.getItem('tf_glossario_decoracao');
        if (pref === 'off') return; // desativado pelo utilizador
        // Esperar pelo footer/menu ser injetado se necessário; usar DOMContentLoaded por segurança
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', ativar);
        } else {
            ativar();
        }
    }

    init();
})();
