(function () {
    'use strict';

    const placeholderUrl = chrome.runtime.getURL('placeholder.svg');
    let panel, toggleBtn, carrinho = {};
    let currentView = 'produtos'; // 'produtos' ou 'carrinho'

    // Carregar imagem com fallback
    function loadImage(imgElement, url) {
        if (!url) {
            imgElement.src = placeholderUrl;
            return;
        }
        let montagemProdutoAtiva = false; // Estado para controlar a exibição da montagem de produtos
        let produtoSelecionado = null; // Produto atualmente selecionado para montagem

        imgElement.src = url;
        imgElement.onerror = function () {
            // Tentar carregar via fetch para contornar CORS
            fetch(url)
                .then(response => response.blob())
                .then(blob => {
                    const reader = new FileReader();
                    reader.onload = function () {
                        imgElement.src = reader.result;
                    };
                    reader.readAsDataURL(blob);
                })
                .catch(() => {
                    imgElement.src = placeholderUrl;
                });
        };
    }

    // Criar header sem onclick inline
    function createHeader() {
        return `
            <div class="faminto-header">
                <div class="faminto-nav">
                    <button class="nav-button ${currentView === 'produtos' ? 'active' : ''}" data-view="produtos">
                        🍕 Produtos
                    </button>
                    <button class="nav-button ${currentView === 'carrinho' ? 'active' : ''}" data-view="carrinho">
                        🛒 Carrinho (${getCartItemCount()})
                    </button>
                </div>
                <button class="close-btn">×</button>
            </div>
        `;
    }

    // Configurar eventos do header
    function setupHeaderEvents() {
        const produtosBtn = panel.querySelector('[data-view="produtos"]');
        const carrinhoBtn = panel.querySelector('[data-view="carrinho"]');
        const closeBtn = panel.querySelector('.close-btn');

        if (produtosBtn) produtosBtn.onclick = () => switchView('produtos');
        if (carrinhoBtn) carrinhoBtn.onclick = () => switchView('carrinho');
        if (closeBtn) closeBtn.onclick = togglePanel;
    }
    function addToCart(produto) {
        const id = produto.nome;
        if (carrinho[id]) {
            carrinho[id].quantidade++;
        } else {
            carrinho[id] = {
                ...produto,
                quantidade: 1
            };
        }
        saveCart();
        updateCartDisplay();
    }

    function removeFromCart(id) {
        if (carrinho[id]) {
            carrinho[id].quantidade--;
            if (carrinho[id].quantidade <= 0) {
                delete carrinho[id];
            }
        }
        saveCart();
        updateCartDisplay();
    }

    function clearCart() {
        carrinho = {};
        saveCart();
        updateCartDisplay();
    }

    function saveCart() {
        chrome.storage.local.set({ 'faminto_cart': carrinho });
    }

    function loadCart() {
        chrome.storage.local.get(['faminto_cart'], function (result) {
            if (result.faminto_cart) {
                carrinho = result.faminto_cart;
                updateCartDisplay();
            }
        });
    }

    function getCartTotal() {
        return Object.values(carrinho).reduce((total, item) => {
            // Extrair apenas números, vírgulas e pontos do preço
            let precoLimpo = item.preco?.replace(/[^\d,\.]/g, '') || '0';

            // Se tem vírgula e ponto, assumir que vírgula é milhares e ponto é decimal
            if (precoLimpo.includes(',') && precoLimpo.includes('.')) {
                precoLimpo = precoLimpo.replace(',', '');
            }
            // Se tem apenas vírgula, assumir que é separador decimal brasileiro
            else if (precoLimpo.includes(',') && !precoLimpo.includes('.')) {
                precoLimpo = precoLimpo.replace(',', '.');
            }

            const preco = parseFloat(precoLimpo) || 0;
            return total + (preco * item.quantidade);
        }, 0);
    }

    function getCartItemCount() {
        return Object.values(carrinho).reduce((total, item) => total + item.quantidade, 0);
    }

    function updateCartDisplay() {
        const count = getCartItemCount();
        const badge = document.querySelector('.carrinho-badge');

        if (count > 0) {
            if (!badge) {
                const badgeEl = document.createElement('div');
                badgeEl.className = 'carrinho-badge';
                toggleBtn.style.position = 'relative';
                toggleBtn.appendChild(badgeEl);
            }
            document.querySelector('.carrinho-badge').textContent = count;
        } else if (badge) {
            badge.remove();
        }

        if (currentView === 'carrinho') {
            showCart();
        }
    }

    // Criar elementos da interface
    function createUI() {
        panel = document.createElement('div');
        panel.className = 'faminto-panel';

        toggleBtn = document.createElement('div');
        toggleBtn.className = 'faminto-toggle';
        toggleBtn.innerHTML = '🛒';
        toggleBtn.onclick = togglePanel;

        document.body.appendChild(panel);
        document.body.appendChild(toggleBtn);
    }

    function togglePanel() {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        toggleBtn.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    }

    function switchView(view) {
        currentView = view;
        if (view === 'produtos') {
            loadProducts();
        } else {
            showCart();
        }
    }

    // Função para buscar produtos usando background script
    async function fetchProdutos() {
        const url = "https://pedidos.faminto.app/app/85/77100042549582";

        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { action: 'fetchProdutos', url: url },
                (response) => {
                    if (response && response.success) {
                        try {
                            const produtos = parseProdutos(response.data);
                            resolve(produtos);
                        } catch (e) {
                            reject(e);
                        }
                    } else {
                        reject(new Error(response ? response.error : 'Erro na comunicação'));
                    }
                }
            );
        });
    }

    // Função para extrair produtos do HTML
    function parseProdutos(html) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const produtos = [];

        tempDiv.querySelectorAll('[id^="id_categoria_"], [id^="id_produto_"]').forEach(el => {
            const nome = el.querySelector('.nome')?.textContent.trim();
            const img = el.querySelector('img')?.src;
            const preco = el.querySelector('.post-seconds')?.textContent.trim();
            if (nome) produtos.push({ nome, img, preco });
        });

        return produtos;
    }
    async function loadProducts() {
        const header = createHeader();
        panel.innerHTML = header + '<div style="padding:20px;text-align:center">Carregando produtos...</div>';
        setupHeaderEvents();

        try {
            // Usar proxy CORS ou método alternativo
            const produtos = await fetchProdutos();
            showProducts(produtos);
        } catch (e) {
            console.error('Erro ao carregar produtos:', e);

            // Fallback: produtos mock para teste
            const produtosMock = [
                { nome: "Pizza Margherita", preco: "R$ 35,00", img: "" },
                { nome: "Hambúrguer Artesanal", preco: "R$ 28,00", img: "" },
                { nome: "Batata Frita", preco: "R$ 15,00", img: "" },
                { nome: "Refrigerante Lata", preco: "R$ 8,00", img: "" },
                { nome: "Açaí 500ml", preco: "R$ 22,00", img: "" }
            ];

            showProducts(produtosMock);

            // Mostrar aviso
            const aviso = document.createElement('div');
            aviso.style.cssText = 'background:#fff3cd;color:#856404;padding:10px;margin:8px;border-radius:5px;font-size:12px;';
            aviso.textContent = '⚠️ Usando produtos de exemplo. Verifique conexão.';
            panel.insertBefore(aviso, panel.children[1]);
        }
    }

    // Mostrar produtos
    function showProducts(produtos) {
        const header = createHeader();
        let html = header + '<div style="padding-bottom:10px">';

        if (produtos.length === 0) {
            html += `
                <div class="empty-state">
                    <div style="font-size:40px;margin-bottom:10px">📦</div>
                    <div>Nenhum produto encontrado</div>
                </div>
            `;
        } else {
            produtos.forEach((p, index) => {
                const produtoJson = JSON.stringify(p).replace(/"/g, '&quot;');
                html += `
                    <div class="produto-item">
                        <img class="produto-img" data-src="${p.img || ''}" alt="${p.nome}">
                        <div class="produto-info">
                            <div class="produto-nome">${p.nome}</div>
                            <div class="produto-preco">${p.preco || ''}</div>
                        </div>
                        <button class="add-btn" data-produto-index="${index}">+</button>
                    </div>
                `;
            });
        }

        panel.innerHTML = html + '</div>';

        // Armazenar produtos para uso nos event listeners
        panel._produtos = produtos;

        setupHeaderEvents();

        // Event listeners para adicionar produtos
        panel.querySelectorAll('.add-btn').forEach(btn => {
            btn.onclick = () => {
                const index = parseInt(btn.dataset.produtoIndex);
                const produto = panel._produtos[index];
                if (produto) addToCart(produto);
            };
        });

        // Carregar imagens
        panel.querySelectorAll('.produto-img').forEach(img => {
            loadImage(img, img.dataset.src);
        });
    }

    // Mostrar carrinho
    function showCart() {
        const header = createHeader();
        const items = Object.values(carrinho);
        let html = header + '<div style="padding-bottom:10px">';

        if (items.length === 0) {
            html += `
                <div class="empty-state">
                    <div style="font-size:40px;margin-bottom:10px">🛒</div>
                    <div>Seu carrinho está vazio</div>
                    <div style="font-size:12px;color:#999;margin-top:5px">Adicione alguns produtos!</div>
                </div>
            `;
        } else {
            items.forEach((item, index) => {
                html += `
                    <div class="carrinho-item">
                        <img class="carrinho-img" data-src="${item.img || ''}" alt="${item.nome}">
                        <div class="carrinho-info">
                            <div class="carrinho-nome">${item.nome}</div>
                            <div class="carrinho-preco">${item.preco || ''}</div>
                        </div>
                        <div class="quantity-controls">
                            <button class="qty-btn remove" data-action="remove" data-id="${item.nome}">-</button>
                            <span class="quantity">${item.quantidade}</span>
                            <button class="qty-btn" data-action="add" data-id="${item.nome}">+</button>
                        </div>
                    </div>
                `;
            });

            const total = getCartTotal();
            html += `
                <div class="carrinho-total">
                    <div class="total-valor">Total: R$ ${total.toFixed(2).replace('.', ',')}</div>
                    <button class="enviar-btn" ${items.length === 0 ? 'disabled' : ''}>
                        Enviar Pedido via WhatsApp
                    </button>
                </div>
            `;
        }

        panel.innerHTML = html + '</div>';

        setupHeaderEvents();

        // Controles de quantidade
        panel.querySelectorAll('.qty-btn').forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.id;
                const action = btn.dataset.action;

                if (action === 'remove') {
                    removeFromCart(id);
                } else if (action === 'add') {
                    const produto = carrinho[id];
                    if (produto) addToCart(produto);
                }
            };
        });

        // Enviar pedido
        const enviarBtn = panel.querySelector('.enviar-btn');
        if (enviarBtn && !enviarBtn.disabled) {
            enviarBtn.onclick = enviarPedido;
        }

        // Carregar imagens
        panel.querySelectorAll('.carrinho-img').forEach(img => {
            loadImage(img, img.dataset.src);
        });
    }

    // Enviar pedido via WhatsApp
    function enviarPedido() {
        const items = Object.values(carrinho);
        if (items.length === 0) return;

        const total = getCartTotal();

        let mensagem = `*🛒 RESUMO DO PEDIDO*\n\n${items.map(item => `• ${item.quantidade}x ${item.nome}${item.preco ? `\n  ${item.preco}` : ''}`).join('\n\n')}\n\n*💰 Total: R$ ${total.toFixed(2).replace('.', ',')}*\n\nObrigado! 😊`;

        // Copiar mensagem para área de transferência
        navigator.clipboard.writeText(mensagem).then(() => {
            // Encontrar campo de mensagem do WhatsApp
            const messageBox = document.querySelector('[contenteditable="true"][data-tab="10"]') ||
                document.querySelector('[contenteditable="true"]') ||
                document.querySelector('div[title="Digite uma mensagem"]');

            if (messageBox) {
                // Focar no campo
                messageBox.focus();

                // Simular Ctrl+V
                setTimeout(() => {
                    const pasteEvent = new KeyboardEvent('keydown', {
                        key: 'v',
                        code: 'KeyV',
                        ctrlKey: true,
                        bubbles: true,
                        cancelable: true
                    });
                    messageBox.dispatchEvent(pasteEvent);

                    // Limpar carrinho após colar
                    clearCart();

                    alert('Pedido colado no WhatsApp e carrinho limpo! Pressione Enter para enviar.');
                }, 100);
            } else {
                // Limpar carrinho mesmo sem encontrar o campo
                clearCart();
                alert('Pedido copiado para área de transferência e carrinho limpo! Cole manualmente no WhatsApp.');
            }
        }).catch(() => {
            // Limpar carrinho mesmo se clipboard falhar
            clearCart();
            alert('Erro ao copiar. Copie esta mensagem:\n\n' + mensagem);
        });
    }

    // Inicialização
    function init() {
        createUI();
        loadCart();
        loadProducts();

        // Atalho Alt+F
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 'f') togglePanel();
        });
    }

    // Aguardar WhatsApp carregar
    const readyCheck = setInterval(() => {
        if (document.querySelector('#app')) {
            clearInterval(readyCheck);
            setTimeout(init, 1000);
        }
    }, 500);
})();