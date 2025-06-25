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
    const configClienteBtn = document.getElementById('config-cliente');

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

    // Configurar dados do cliente
    configClienteBtn.addEventListener('click', function () {
        const telefone = prompt('Digite o número de telefone do cliente (apenas números):');
        if (!telefone || !/^\d+$/.test(telefone)) {
            alert('Número de telefone inválido. Digite apenas números.');
            return;
        }

        chrome.storage.local.get(['faminto_empresa_id'], function (result) {
            const empresaId = result.faminto_empresa_id || '7';
            const apiUrl = `https://pedidos.faminto.app/api/usuario/retornaUsuarioComEndereco/${empresaId}/${telefone}`;

            chrome.runtime.sendMessage(
                { action: 'fetchApi', url: apiUrl },
                (response) => {
                    if (response && response.success) {
                        try {
                            const clienteData = JSON.parse(response.data);
                            if (!clienteData || !clienteData.id) {
                                alert('Cliente não encontrado para o número fornecido.');
                                return;
                            }

                            const endereco = clienteData.enderecos[0];
                            const enderecoCompleto = `${endereco.rua}, ${endereco.nrocasa}, ${endereco.bairro.nome}, ${endereco.bairro.cidade.nome} - ${endereco.bairro.cidade.uf}`;
                            const valorEntrega = `R$ ${endereco.bairro.valorEntrega.toFixed(2).replace('.', ',')}`;

                            // Criar overlay para formulário
                            const overlay = document.createElement('div');
                            overlay.className = 'faminto-overlay';
                            overlay.style.cssText = `
                                position: fixed;
                                top: 0;
                                left: 0;
                                width: 100%;
                                height: 100%;
                                background: rgba(0, 0, 0, 0.7);
                                z-index: 100000;
                                display: flex;
                                justify-content: center;
                                align-items: center;
                            `;

                            // Criar formulário
                            const form = document.createElement('div');
                            form.className = 'faminto-form';
                            form.style.cssText = `
                                background: #2d2d2d;
                                padding: 20px;
                                border-radius: 10px;
                                width: 90%;
                                max-width: 400px;
                                max-height: 80vh;
                                overflow-y: auto;
                                color: #e0e0e0;
                                border: 1px solid #444;
                            `;

                            // Adicionar título e descrição
                            form.innerHTML = `
                                <h3 style="margin-top: 0; color: #25D366;">Dados do Cliente</h3>
                                <p style="margin-bottom: 20px; color: #bbb; font-size: 12px;">
                                    Confira os dados do cliente antes de enviar o pedido.
                                </p>
                                
                                <div class="input-group" style="margin-bottom: 15px;">
                                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Nome</label>
                                    <input type="text" id="cliente-nome" value="${clienteData.nome}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #555; background: #1d1d1d; color: #e0e0e0;" disabled>
                                </div>
                                
                                <div class="input-group" style="margin-bottom: 15px;">
                                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Endereço Completo</label>
                                    <input type="text" id="cliente-endereco" value="${enderecoCompleto}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #555; background: #1d1d1d; color: #e0e0e0;" disabled>
                                </div>
                                
                                <div class="input-group" style="margin-bottom: 15px;">
                                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Valor da Entrega</label>
                                    <input type="text" id="valor-entrega" value="${valorEntrega}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #555; background: #1d1d1d; color: #e0e0e0;" disabled>
                                </div>
                                
                                <div class="form-actions" style="display: flex; gap: 10px; margin-top: 20px;">
                                    <button id="fechar-form" style="flex: 1; padding: 10px; border: none; border-radius: 5px; cursor: pointer; background: #555; color: white;">Fechar</button>
                                </div>
                            `;

                            // Adicionar formulário ao overlay
                            overlay.appendChild(form);
                            document.body.appendChild(overlay);

                            // Configurar evento de fechar
                            const fecharBtn = document.getElementById('fechar-form');
                            fecharBtn.addEventListener('click', function () {
                                overlay.remove();
                            });
                        } catch (error) {
                            console.error('Erro ao processar dados do cliente:', error);
                            alert('Erro ao processar dados do cliente. Verifique o console para mais detalhes.');
                        }
                    } else {
                        console.error('Erro ao buscar dados do cliente:', response?.error);
                        alert('Erro ao buscar dados do cliente. Verifique o console para mais detalhes.');
                    }
                }
            );
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