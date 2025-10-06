// Adiciona um listener que executa todo o código quando o HTML estiver carregado
document.addEventListener('DOMContentLoaded', function () {

    // --- CARREGAMENTO DO MENU (Lógica Global) ---
    const menuPlaceholder = document.getElementById("menu-placeholder");
    if (menuPlaceholder) {
        fetch('menu.html')
            .then(response => {
                if (!response.ok) { 
                    throw new Error(`Erro na rede ao carregar menu: ${response.statusText}`); 
                }
                return response.text();
            })
            .then(data => { 
                menuPlaceholder.innerHTML = data; 
            })
            .catch(error => console.error('Erro ao carregar o menu:', error));
    }

    // --- CARREGAMENTO DO RODAPÉ (Nova Lógica Global) ---
    const footerPlaceholder = document.getElementById("footer-placeholder");
    if (footerPlaceholder) {
        fetch('footer.html')
            .then(response => {
                if (!response.ok) { 
                    throw new Error(`Erro na rede ao carregar rodapé: ${response.statusText}`); 
                }
                return response.text();
            })
            .then(data => { 
                footerPlaceholder.innerHTML = data; 
            })
            .catch(error => console.error('Erro ao carregar o rodapé:', error));
    }
    
});
