// Adiciona um listener que executa todo o código quando o HTML estiver carregado
document.addEventListener('DOMContentLoaded', function () {

    // --- CARREGAMENTO DO MENU (Lógica Global para todas as páginas) ---
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

});
