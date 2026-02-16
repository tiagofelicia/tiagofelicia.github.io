# Simulador de Tarifários de Eletricidade - Portugal (Web Version)

![Logo](https://raw.githubusercontent.com/tiagofelicia/simulador-tarifarios-eletricidade/refs/heads/main/Logo_Tiago_Felicia.png)

Bem-vindo à nova versão web do **Simulador de Tarifários de Eletricidade**, uma ferramenta rápida e intuitiva para comparar ofertas do mercado regulado e liberalizado em Portugal.

Esta versão foi totalmente reescrita em **JavaScript**, permitindo que a simulação corra diretamente no seu browser, sem necessidade de servidores, filas de espera ou instalação de software complexo.

**➡️ [Aceda aqui à versão online do simulador](https://www.tiagofelicia.pt/eletricidade-tiagofelicia.html)**

---

## 🚀 Novidades desta Versão (v2.0)

* ⚡ **Simulação Rápida:** Obtenha uma estimativa de poupança em segundos, apenas indicando o valor da sua fatura atual ou consumo mensal.
* 🔒 **Privacidade Total:** O processamento dos ficheiros da E-Redes é feito **localmente no seu dispositivo**. Os seus dados de consumo nunca são enviados para um servidor externo.
* 📱 **Design Responsivo:** Interface otimizada para telemóveis, tablets e computadores.
* 🏆 **Pódio de Resultados:** Visualização imediata das 3 melhores ofertas para o seu caso.

---

## 💡 Funcionalidades Principais

* **Comparação Abrangente:** Análise de dezenas de tarifários, incluindo ofertas de preço fixo e indexado (média mensal e quarto-horário/dinâmico).
* **Três Modos de Simulação:**
    * ⚡ **Rápida:** Para quem quer uma resposta imediata com base em perfis padrão.
    * 📝 **Completa:** Introdução manual de consumos por período horário (Vazio, Ponta, Cheias, etc.).
    * 📊 **Avançada (E-Redes):** Carregue o ficheiro `.xlsx` do Balcão Digital da E-Redes para uma precisão absoluta, calculada hora a hora.
* **Análise de Potência:** O simulador verifica se a sua potência contratada é excessiva face aos picos reais registados, sugerindo poupanças adicionais.
* **Visualização Gráfica:** Gráficos interativos (Highcharts) para analisar o seu perfil de consumo vs. preços de mercado (OMIE).
* **Cenários Personalizados:**
    * Criação de tarifários personalizados para testar propostas de comercializadores.
* **Exportação e Partilha:** Exporte os resultados detalhados para Excel ou gere um link único para partilhar a simulação.

---

## 💻 Tecnologias Utilizadas

Esta versão abandonou o backend Python em favor de uma arquitetura leve e estática:

* **Core:** HTML5, CSS3, JavaScript (ES6+).
* **Processamento de Dados:** [SheetJS (xlsx)](https://sheetjs.com/) e [ExcelJS](https://github.com/exceljs/exceljs) para leitura e escrita de ficheiros Excel no browser.
* **Visualização:** [Highcharts](https://www.highcharts.com/) para gráficos interativos.
* **Ícones e Fontes:** FontAwesome e Google Fonts.

---

## ❤️ Apoie o Projeto

Se esta ferramenta o ajudou a poupar na fatura da luz, considere apoiar a sua manutenção e o desenvolvimento contínuo (atualização de tarifários e novas funcionalidades).

* [☕ Compre-me um café (BuyMeACoffee)](https://buymeacoffee.com/tiagofelicia)
* [🅿️ Doe via PayPal](https://www.paypal.com/donate?hosted_button_id=W6KZHVL53VFJC)

---

## 📧 Contacto

**Tiago Felícia** - [www.tiagofelicia.pt](https://www.tiagofelicia.pt)

*© 2024-2026 Tiago Felícia. Todos os direitos reservados.*