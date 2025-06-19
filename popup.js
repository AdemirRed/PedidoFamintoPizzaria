document.addEventListener('DOMContentLoaded', function() {
    // Elementos
    const statusDisplay = document.getElementById('status-display');
    const cartCount = document.getElementById('cart-count');
    const cartTotal = document.getElementById('cart-total');
    const openPanelBtn = document.getElementById('open-panel');
    const clearCartBtn = document.getElementById('clear-cart');
    const defaultUrlInput = document.getElementById('default-url');
    const saveConfigBtn = document.getElementById('save-config');
    const currentPage = document.getElementById('current-page');

    // Verificar se estamos no WhatsApp
    function checkCurrentPage() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const url = tabs[0].url;
            if (url.includes('web.whatsapp.com')) {
                currentPage.textContent = 'WhatsApp Web ✅';
                statusDisplay.textContent = 'Extensão ativa no WhatsApp';
                statusDisplay.className = 'status status-success';
                openPanelBtn.disabled = false;
            } else {
                currentPage.textContent = 'Outra página ❌';
                statusDisplay.textContent = 'Acesse o WhatsApp Web para usar a extensão';
                statusDisplay.className = 'status status-warning';
                openPanelBtn.disabled = true;
            }
        });
    }

    // Carregar informações do carrinho
    function loadCartInfo() {
        chrome.storage.local.get(['faminto_cart'], function(result) {
            const cart = result.faminto_cart || {};
            const items = Object.values(cart);
            
            // Contar itens
            const totalItems = items.reduce((total, item) => total + item.quantidade, 0);
            cartCount.textContent = `${totalItems} itens`;
            
            // Calcular total
            const totalValue = items.reduce((total, item) => {
                let precoLimpo = item.preco?.replace(/[^\d,\.]/g, '') || '0';
                if (precoLimpo.includes(',') && precoLimpo.includes('.')) {
                    precoLimpo = precoLimpo.replace(',', '');
                } else if (precoLimpo.includes(',') && !precoLimpo.includes('.')) {
                    precoLimpo = precoLimpo.replace(',', '.');
                }
                const preco = parseFloat(precoLimpo) || 0;
                return total + (preco * item.quantidade);
            }, 0);
            
            cartTotal.textContent = `R$ ${totalValue.toFixed(2).replace('.', ',')}`;
        });
    }

    // Carregar configurações
    function loadConfig() {
        chrome.storage.local.get(['faminto_default_url'], function(result) {
            if (result.faminto_default_url) {
                defaultUrlInput.value = result.faminto_default_url;
            }
        });
    }

    // Abrir painel
    openPanelBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'openPanel'}, function(response) {
                if (chrome.runtime.lastError) {
                    alert('Erro: Recarregue a página do WhatsApp e tente novamente.');
                } else {
                    window.close();
                }
            });
        });
    });

    // Limpar carrinho
    clearCartBtn.addEventListener('click', function() {
        if (confirm('Tem certeza que deseja limpar o carrinho?')) {
            chrome.storage.local.set({ 'faminto_cart': {} }, function() {
                loadCartInfo();
                alert('Carrinho limpo com sucesso!');
            });
        }
    });

    // Salvar configurações
    saveConfigBtn.addEventListener('click', function() {
        const url = defaultUrlInput.value.trim();
        if (url && !url.startsWith('http')) {
            alert('URL deve começar com http:// ou https://');
            return;
        }
        
        chrome.storage.local.set({ 'faminto_default_url': url }, function() {
            alert('Configurações salvas com sucesso!');
        });
    });

    // Inicializar
    checkCurrentPage();
    loadCartInfo();
    loadConfig();

    // Atualizar informações a cada 2 segundos
    setInterval(function() {
        loadCartInfo();
    }, 2000);
});