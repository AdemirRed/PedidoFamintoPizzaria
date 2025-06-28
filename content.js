(function () {
    'use strict';

    const placeholderUrl = chrome.runtime.getURL('placeholder.svg');
    let panel, toggleBtn, carrinho = {};
    let currentView = 'produtos';
    let montagemProduto = null;
    let produtosApi = [];
    let gruposApi = [];
    let saboresSelecionados = {}; // Mudança: agora é objeto com quantidades
    let complementosSelecionados = {}; // Mudança: agora é objeto com quantidades

    let horariosAtendimento = [];
    let statusAtendimento = false;

    // Carregar imagem com fallback
    function loadImage(imgElement, url) {
        if (!url) {
            imgElement.src = placeholderUrl;
            return;
        }

        imgElement.src = url;
        imgElement.onerror = function () {
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

    // Verificar se o atendimento está ativo
    function verificarAtendimentoAtivo() {
        if (!horariosAtendimento || horariosAtendimento.length === 0) {
            return false;
        }

        const agora = new Date();
        const diaSemana = agora.getDay(); // 0 = domingo, 1 = segunda, etc.
        const minutosAtual = agora.getHours() * 60 + agora.getMinutes();

        const horarioHoje = horariosAtendimento.find(h => h.diaSemana === diaSemana);
        
        if (!horarioHoje) {
            return false;
        }

        return minutosAtual >= horarioHoje.minutoAbre && minutosAtual <= horarioHoje.minutoFecha;
    }

    // Carregar horários de atendimento
    async function carregarHorariosAtendimento() {
        chrome.storage.local.get(['faminto_empresa_id'], function(result) {
            const empresaId = result.faminto_empresa_id || '7';
            const apiUrl = `https://pedidos.faminto.app/api/horariosteleretirada/${empresaId}`;

            chrome.runtime.sendMessage(
                { action: 'fetchApi', url: apiUrl },
                (response) => {
                    if (response && response.success) {
                        try {
                            horariosAtendimento = JSON.parse(response.data);
                            statusAtendimento = verificarAtendimentoAtivo();
                            console.log('Horários carregados:', horariosAtendimento);
                            console.log('Status atendimento:', statusAtendimento);
                            
                            // Atualizar header se o painel estiver aberto
                            if (panel && panel.style.display !== 'none') {
                                updateHeaderStatus();
                            }
                        } catch (error) {
                            console.error('Erro ao processar horários de atendimento:', error);
                        }
                    } else {
                        console.error('Erro ao carregar horários:', response?.error);
                    }
                }
            );
        });
    }

    // Atualizar status no header
    function updateHeaderStatus() {
        const headerElement = panel.querySelector('.faminto-header');
        if (!headerElement) return;

        let statusIndicator = headerElement.querySelector('.status-indicator');
        if (!statusIndicator) {
            statusIndicator = document.createElement('div');
            statusIndicator.className = 'status-indicator';
            headerElement.appendChild(statusIndicator);
        }

        const agora = new Date();
        const horaAtual = agora.getHours().toString().padStart(2, '0') + ':' + agora.getMinutes().toString().padStart(2, '0');
        
        if (statusAtendimento) {
            statusIndicator.innerHTML = `
                <span class="status-dot active"></span>
                <span class="status-text">Aberto - ${horaAtual}</span>
            `;
            statusIndicator.className = 'status-indicator active';
        } else {
            const diaSemana = agora.getDay();
            const horarioHoje = horariosAtendimento.find(h => h.diaSemana === diaSemana);
            const proximaAbertura = horarioHoje ? horarioHoje.horaAbre : 'N/A';
            
            statusIndicator.innerHTML = `
                <span class="status-dot inactive"></span>
                <span class="status-text">Fechado - Abre às ${proximaAbertura}</span>
            `;
            statusIndicator.className = 'status-indicator inactive';
        }
    }

    // Criar header atualizado com status
    function createHeader() {
        return `
            <div class="faminto-header">
                <div class="header-top">
                    <div class="faminto-nav">
                        <button class="nav-button ${currentView === 'produtos' ? 'active' : ''}" data-view="produtos">
                            🍕 Produtos
                        </button>
                        <button class="nav-button ${currentView === 'carrinho' ? 'active' : ''}" data-view="carrinho">
                            🛒 Carrinho (${getCartItemCount()})
                        </button>
                        ${currentView === 'montagem' ?
                    '<button class="nav-button active" data-view="montagem">🔧 Montagem</button>' :
                    ''
                }
                    </div>
                    <button class="close-btn">×</button>
                </div>
            </div>
        `;
    }

    // Configurar eventos do header
    function setupHeaderEvents() {
        const produtosBtn = panel.querySelector('[data-view="produtos"]');
        const carrinhoBtn = panel.querySelector('[data-view="carrinho"]');
        const montagemBtn = panel.querySelector('[data-view="montagem"]');
        const closeBtn = panel.querySelector('.close-btn');

        if (produtosBtn) produtosBtn.onclick = () => switchView('produtos');
        if (carrinhoBtn) carrinhoBtn.onclick = () => switchView('carrinho');
        if (montagemBtn) montagemBtn.onclick = () => switchView('montagem');
        if (closeBtn) closeBtn.onclick = togglePanel;

        // Atualizar status após configurar eventos
        updateHeaderStatus();
    }

    // Detectar se produto permite montagem personalizada
    function isProdutoPersonalizavel(nome) {
        const nomeMin = nome.toLowerCase();
        return nomeMin.includes('sabor') ||
            nomeMin.includes('pizza') ||
            nomeMin.includes('monte') ||
            nomeMin.includes('personaliz') ||
            nomeMin.includes('combo') ||
            nomeMin.includes('fritas');
    }

    // Extrair limite de sabores do nome do produto
    function getLimiteSabores(nome) {
        const match = nome.match(/(\d+)\s*sabores?/i);
        return match ? parseInt(match[1]) : 1;
    }

    // Detectar tipo de complemento baseado no nome
    function detectarTipoComplemento(complementos) {
        const complementosLower = complementos.map(c => c.toLowerCase());

        // Palavras-chave para bordas
        const palavrasBorda = [
            'borda', 'catupiry', 'cheddar', 'chocolate', 'doce de leite',
            'nutella', 'morango', 'banana', 'cream cheese', 'requeijão'
        ];

        // Verificar se algum complemento é borda
        const temBorda = complementosLower.some(comp =>
            palavrasBorda.some(palavra => comp.includes(palavra))
        );

        return temBorda ? 'Bordas' : 'Complementos';
    }

    // Detectar se produto é pizza
    function isPizzaProduct(nome) {
        const nomeMin = nome.toLowerCase();
        return nomeMin.includes('pizza') ||
            nomeMin.includes('fatias') ||
            nomeMin.includes('sabor');
    }

    // Escolher emoji baseado no tipo de produto
    function escolherEmoji(nome) {
        const nomeMin = nome.toLowerCase();

        if (isPizzaProduct(nome)) return '🍕';
        if (nomeMin.includes('combo') || nomeMin.includes('lanche')) return '🍔';
        if (nomeMin.includes('fritas') || nomeMin.includes('batata')) return '🍟';
        if (nomeMin.includes('refrigerante') || nomeMin.includes('coca') || nomeMin.includes('suco')) return '🥤';
        if (nomeMin.includes('sobremesa') || nomeMin.includes('doce') || nomeMin.includes('açaí')) return '🍰';

        return '🍽️'; // emoji padrão
    }

    function addToCart(produto) {
        const id = produto.nome;
        if (carrinho[id]) {
            carrinho[id].quantidade++;
        } else {
            carrinho[id] = {
                ...produto,
                produtoid: produto.id || "0", // Salvar o ID real do produto
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
            let precoLimpo = typeof item.preco === 'string' ? item.preco.replace(/[^\d,\.]/g, '') : '0'; // Verificar se item.preco é string
            if (precoLimpo.includes(',') && precoLimpo.includes('.')) {
                precoLimpo = precoLimpo.replace(',', '');
            } else if (precoLimpo.includes(',') && !precoLimpo.includes('.')) {
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
        // Remover elementos existentes se houver
        const existingPanel = document.querySelector('.faminto-panel');
        const existingToggle = document.querySelector('.faminto-toggle');
        if (existingPanel) existingPanel.remove();
        if (existingToggle) existingToggle.remove();

        panel = document.createElement('div');
        panel.className = 'faminto-panel';
        panel.style.display = 'none';

        toggleBtn = document.createElement('div');
        toggleBtn.className = 'faminto-toggle';
        toggleBtn.innerHTML = '🛒';
        toggleBtn.onclick = togglePanel;
        toggleBtn.style.display = 'flex';

        document.body.appendChild(panel);
        document.body.appendChild(toggleBtn);

        console.log('UI criada com sucesso!');
    }

    function togglePanel() {
        console.log('togglePanel chamado');
        if (panel.style.display === 'none' || panel.style.display === '') {
            panel.style.display = 'block';
            toggleBtn.style.display = 'none';

            // Se o painel está vazio, mostrar produtos por padrão
            if (!panel.innerHTML.trim()) {
                showWelcome();
            }
        } else {
            panel.style.display = 'none';
            toggleBtn.style.display = 'flex';
        }
    }

    function switchView(view) {
        currentView = view;
        if (view === 'produtos') {
            loadProducts();
        } else if (view === 'carrinho') {
            showCart();
        } else if (view === 'montagem') {
            showMontagem();
        }
    }

    // Mostrar tela de boas-vindas
    function showWelcome() {
        let html = createHeader() + '<div class="content">';
        html += `
            <div class="welcome-section">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 48px; margin-bottom: 15px;">🍕</div>
                    <h2 style="color: #25D366; margin: 0 0 10px 0;">Bem-vindo ao Faminto!</h2>
                    <p style="color: #666; margin: 0; font-size: 14px;">
                        Sistema de pedidos com montagem personalizada para WhatsApp
                    </p>
                </div>
                
                <div class="action-buttons">
                    <button class="action-btn primary" data-action="request-url">
                        📋 Carregar Cardápio
                    </button>
                    <button class="action-btn secondary" data-action="view-cart">
                        🛒 Ver Carrinho (${getCartItemCount()})
                    </button>
                </div>
                
                <div class="info-section">
                    <h3>🔧 Como usar:</h3>
                    <ul>
                        <li>Clique em "Carregar Cardápio" e cole a URL do restaurante</li>
                        <li>Navegue pelos produtos e adicione ao carrinho</li>
                        <li>Para pizzas, combos e fritas, use "Personalizar"</li>
                        <li>Use +/- para escolher quantas partes de cada sabor</li>
                        <li>Finalize o pedido enviando para o WhatsApp</li>
                    </ul>
                </div>
            </div>
        `;
        html += '</div>';

        panel.innerHTML = html;
        setupHeaderEvents();
        setupWelcomeEvents();
    }

    // Configurar eventos da tela de boas-vindas
    function setupWelcomeEvents() {
        const requestUrlBtn = panel.querySelector('[data-action="request-url"]');
        const viewCartBtn = panel.querySelector('[data-action="view-cart"]');

        if (requestUrlBtn) requestUrlBtn.onclick = requestUrl;
        if (viewCartBtn) viewCartBtn.onclick = () => switchView('carrinho');
    }

    // Função para solicitar URL
    function requestUrl() {
        chrome.storage.local.get(['faminto_default_url'], function (result) {
            const defaultUrl = result.faminto_default_url || 'https://pedidos.faminto.app/app/85/77100042549582';
            const url = prompt('Cole a URL do cardápio do Faminto:', defaultUrl);

            if (url) {
                loadProductsFromUrl(url);
            }
        });
    }

    // Carregar dados da API para montagem via background script
    async function loadApiData(productId, baseUrl) {
        try {
            // Extrair IDs da URL base
            const match = baseUrl.match(/\/app\/(\d+)\/(\d+)/);
            if (!match) return false;

            const [, appId, restaurantId] = match;
            const apiUrl = `${baseUrl.split('/app/')[0]}/api/produto/carregarProdutosOrganizados/${appId}/${restaurantId}/${productId}?delivery=true`;

            console.log('Carregando API para produto:', productId, 'URL:', apiUrl);

            return new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    { action: 'fetchApi', url: apiUrl },
                    (response) => {
                        if (response && response.success) {
                            try {
                                const data = JSON.parse(response.data);
                                console.log('Dados da API recebidos:', data);

                                // Processar tipoProdutos (sabores)
                                produtosApi = [];
                                if (data.tipoProdutos && Array.isArray(data.tipoProdutos)) {
                                    data.tipoProdutos.forEach(tipo => {
                                        if (tipo.listaProdutos && Array.isArray(tipo.listaProdutos)) {
                                            produtosApi.push({
                                                id: tipo.id,
                                                nome: tipo.titulo,
                                                produtos: tipo.listaProdutos.filter(p => p.ativo === 1)
                                            });
                                        }
                                    });
                                }

                                // Processar grupos (complementos)
                                gruposApi = [];
                                if (data.grupos && Array.isArray(data.grupos)) {
                                    gruposApi = data.grupos.filter(g => g.ativo === true).map(grupo => ({
                                        id: grupo.id,
                                        nome: grupo.nome,
                                        maxItens: grupo.maxItens || 1,
                                        obrigatorio: grupo.tipo === 1, // assumindo que tipo 1 = obrigatório
                                        produtos: grupo.itens || []
                                    }));
                                }

                                console.log('Sabores processados:', produtosApi);
                                console.log('Grupos processados:', gruposApi);

                                resolve(true);
                            } catch (error) {
                                console.error('Erro ao parsear JSON da API:', error);
                                resolve(false);
                            }
                        } else {
                            console.error('Erro ao carregar dados da API:', response?.error);
                            resolve(false);
                        }
                    }
                );
            });
        } catch (error) {
            console.error('Erro ao carregar dados da API:', error);
            return false;
        }
    }

    // Sistema de Montagem de Produtos
    function showMontagem() {
        if (!montagemProduto) {
            panel.innerHTML = createHeader() + `
                <div class="content">
                    <div class="empty-state">
                        <div style="font-size: 48px; margin-bottom: 15px;">🍕</div>
                        <p>Nenhum produto selecionado para montagem</p>
                        <button class="nav-button" data-action="back-to-products">
                            Voltar aos Produtos
                        </button>
                    </div>
                </div>
            `;
            setupHeaderEvents();
            setupMontagemEmptyEvents();
            return;
        }

        const limiteSabores = getLimiteSabores(montagemProduto.nome);

        let html = createHeader() + '<div class="content montagem-container">';

        // Produto base
        html += `
            <div class="produto-base">
                <h3>🍕 ${montagemProduto.nome}</h3>
                <p class="preco-base">${montagemProduto.preco}</p>
                <p class="limite-info">Escolha sabores (máx: ${limiteSabores} partes) - Mínimo: 1 sabor</p>
            </div>
        `;

        // Exibir sabores disponíveis
        if (produtosApi.length > 0) {
            produtosApi.forEach(tipoSabor => {
                if (tipoSabor.produtos && tipoSabor.produtos.length > 0) {
                    html += `
                        <div class="sabores-section">
                            <h4>🧀 ${tipoSabor.nome}</h4>
                            <div class="sabores-grid">
                    `;

                    tipoSabor.produtos.forEach(sabor => {
                        const preco = sabor.valorVenda > 0 ? `R$ ${sabor.valorVenda.toFixed(2).replace('.', ',')}` : '';
                        const quantidade = saboresSelecionados[sabor.id] || 0;

                        html += `
                            <div class="sabor-item ${quantidade > 0 ? 'selected' : ''}" data-sabor-id="${sabor.id}" data-tipo="${tipoSabor.id}">
                                <div class="sabor-info">
                                    <span class="sabor-nome">${sabor.nome}</span>
                                    ${sabor.textocomposicao ? `<span class="sabor-desc">${sabor.textocomposicao}</span>` : ''}
                                    ${preco ? `<span class="sabor-preco">${preco}</span>` : ''}
                                </div>
                                <div class="quantity-controls-sabor">
                                    <button class="qty-btn-sabor remove" data-action="remove-sabor" data-id="${sabor.id}" ${quantidade === 0 ? 'disabled' : ''}>-</button>
                                    <span class="quantity-sabor">${quantidade}</span>
                                    <button class="qty-btn-sabor add" data-action="add-sabor" data-id="${sabor.id}">+</button>
                                </div>
                            </div>
                        `;
                    });

                    html += '</div></div>';
                }
            });
        } else {
            html += `
                <div class="sabores-section">
                    <h4>🧀 Sabores</h4>
                    <p style="color: #666; text-align: center; padding: 20px;">
                        Nenhum sabor disponível para personalização
                    </p>
                </div>
            `;
        }

        // Exibir complementos disponíveis
        if (gruposApi.length > 0) {
            html += '<div class="complementos-section"><h4>🍔 Complementos Extras</h4>';

            gruposApi.forEach(grupo => {
                if (grupo.produtos && grupo.produtos.length > 0) {
                    html += `
                        <div class="grupo-complementos">
                            <h5>${grupo.nome}</h5>
                            <p class="grupo-info">
                                ${grupo.obrigatorio ? 'Obrigatório' : 'Opcional'} 
                                (máx: ${grupo.maxItens})
                            </p>
                            <div class="complementos-list">
                    `;

                    grupo.produtos.forEach(complemento => {
                        const preco = complemento.valorVenda > 0 ? `R$ ${complemento.valorVenda.toFixed(2).replace('.', ',')}` : '';
                        const quantidade = complementosSelecionados[complemento.id] || 0;

                        html += `
                            <div class="complemento-item ${quantidade > 0 ? 'selected' : ''}" data-complemento-id="${complemento.id}" data-grupo="${grupo.id}">
                                <div class="complemento-info">
                                    <span class="complemento-nome">${complemento.nome}</span>
                                    ${preco ? `<span class="complemento-preco">${preco}</span>` : ''}
                                </div>
                                <div class="quantity-controls-complemento">
                                    <button class="qty-btn-complemento remove" data-action="remove-complemento" data-id="${complemento.id}" data-grupo="${grupo.id}" ${quantidade === 0 ? 'disabled' : ''}>-</button>
                                    <span class="quantity-complemento">${quantidade}</span>
                                    <button class="qty-btn-complemento add" data-action="add-complemento" data-id="${complemento.id}" data-grupo="${grupo.id}">+</button>
                                </div>
                            </div>
                        `;
                    });

                    html += '</div></div>';
                }
            });

            html += '</div>';
        }

        // Resumo e finalização
        html += `
            <div class="montagem-resumo">
                <div id="resumo-content">
                    <h4>📋 Resumo da Montagem</h4>
                    <div id="sabores-selecionados"></div>
                    <div id="complementos-selecionados"></div>
                </div>
                <button id="finalizar-montagem" class="finalizar-btn" disabled data-action="finalizar-montagem">
                    Adicionar ao Carrinho
                </button>
            </div>
        `;

        html += '</div>';
        panel.innerHTML = html;
        setupHeaderEvents();
        setupMontagemEvents();
        updateResumoMontagem();
    }

    function setupMontagemEmptyEvents() {
        const backBtn = panel.querySelector('[data-action="back-to-products"]');
        if (backBtn) backBtn.onclick = () => switchView('produtos');
    }

    function setupMontagemEvents() {
        // Eventos para sabores (adicionar)
        panel.querySelectorAll('[data-action="add-sabor"]').forEach(btn => {
            btn.onclick = () => {
                const saborId = btn.dataset.id;
                const limiteSabores = getLimiteSabores(montagemProduto.nome);

                // Calcular total de partes já selecionadas
                const totalPartes = Object.values(saboresSelecionados).reduce((sum, qty) => sum + qty, 0);

                if (totalPartes < limiteSabores) {
                    saboresSelecionados[saborId] = (saboresSelecionados[saborId] || 0) + 1;

                    // Atualizar interface
                    const saborItem = panel.querySelector(`[data-sabor-id="${saborId}"]`);
                    const quantitySpan = saborItem.querySelector('.quantity-sabor');
                    const removeBtn = saborItem.querySelector('[data-action="remove-sabor"]');

                    quantitySpan.textContent = saboresSelecionados[saborId];
                    removeBtn.disabled = false;
                    saborItem.classList.add('selected');

                    updateResumoMontagem();
                } else {
                    alert(`Você já selecionou o máximo de ${limiteSabores} parte(s) de sabores`);
                }
            };
        });

        // Eventos para sabores (remover)
        panel.querySelectorAll('[data-action="remove-sabor"]').forEach(btn => {
            btn.onclick = () => {
                const saborId = btn.dataset.id;

                if (saboresSelecionados[saborId] && saboresSelecionados[saborId] > 0) {
                    saboresSelecionados[saborId]--;

                    const saborItem = panel.querySelector(`[data-sabor-id="${saborId}"]`);
                    const quantitySpan = saborItem.querySelector('.quantity-sabor');

                    quantitySpan.textContent = saboresSelecionados[saborId];

                    if (saboresSelecionados[saborId] === 0) {
                        btn.disabled = true;
                        saborItem.classList.remove('selected');
                        delete saboresSelecionados[saborId];
                    }

                    updateResumoMontagem();
                }
            };
        });

        // Eventos para complementos (adicionar)
        panel.querySelectorAll('[data-action="add-complemento"]').forEach(btn => {
            btn.onclick = () => {
                const complementoId = btn.dataset.id;
                const grupoId = btn.dataset.grupo;

                const grupo = gruposApi.find(g => g.id == grupoId);
                const maxItens = grupo?.maxItens || 1;

                // Calcular quantos itens já foram selecionados neste grupo
                const itensDoGrupo = Object.keys(complementosSelecionados).filter(id => {
                    const comp = findComplementoById(id);
                    return comp && comp.grupoId == grupoId;
                });

                const totalGrupo = itensDoGrupo.reduce((sum, id) => sum + (complementosSelecionados[id] || 0), 0);

                if (totalGrupo < maxItens) {
                    complementosSelecionados[complementoId] = (complementosSelecionados[complementoId] || 0) + 1;

                    // Atualizar interface
                    const complementoItem = panel.querySelector(`[data-complemento-id="${complementoId}"]`);
                    const quantitySpan = complementoItem.querySelector('.quantity-complemento');
                    const removeBtn = complementoItem.querySelector('[data-action="remove-complemento"]');

                    quantitySpan.textContent = complementosSelecionados[complementoId];
                    removeBtn.disabled = false;
                    complementoItem.classList.add('selected');

                    updateResumoMontagem();
                } else {
                    alert(`Você já selecionou o máximo de ${maxItens} item(ns) para ${grupo.nome}`);
                }
            };
        });

        // Eventos para complementos (remover)
        panel.querySelectorAll('[data-action="remove-complemento"]').forEach(btn => {
            btn.onclick = () => {
                const complementoId = btn.dataset.id;

                if (complementosSelecionados[complementoId] && complementosSelecionados[complementoId] > 0) {
                    complementosSelecionados[complementoId]--;

                    const complementoItem = panel.querySelector(`[data-complemento-id="${complementoId}"]`);
                    const quantitySpan = complementoItem.querySelector('.quantity-complemento');

                    quantitySpan.textContent = complementosSelecionados[complementoId];

                    if (complementosSelecionados[complementoId] === 0) {
                        btn.disabled = true;
                        complementoItem.classList.remove('selected');
                        delete complementosSelecionados[complementoId];
                    }

                    updateResumoMontagem();
                }
            };
        });

        // Evento finalizar
        const finalizarBtn = panel.querySelector('#finalizar-montagem');
        if (finalizarBtn) {
            finalizarBtn.onclick = finalizarMontagem;
        }
    }

    // Função auxiliar para encontrar complemento por ID
    function findComplementoById(id) {
        for (let grupo of gruposApi) {
            if (grupo.produtos) {
                const complemento = grupo.produtos.find(p => p.id == id);
                if (complemento) {
                    return { ...complemento, grupoId: grupo.id };
                }
            }
        }
        return null;
    }

    function updateResumoMontagem() {
        const saboresDiv = panel.querySelector('#sabores-selecionados');
        const complementosDiv = panel.querySelector('#complementos-selecionados');
        const finalizarBtn = panel.querySelector('#finalizar-montagem');

        if (!saboresDiv || !complementosDiv || !finalizarBtn) return;

        const limiteSabores = getLimiteSabores(montagemProduto.nome);

        // Calcular total de partes selecionadas
        const totalPartesSabores = Object.values(saboresSelecionados).reduce((sum, qty) => sum + qty, 0);

        // Atualizar sabores
        let saboresHtml = '<div class="resumo-section"><strong>Sabores:</strong>';
        if (totalPartesSabores === 0) {
            saboresHtml += ' <span class="text-muted">Nenhum sabor selecionado</span>';
        } else {
            Object.keys(saboresSelecionados).forEach(saborId => {
                const quantidade = saboresSelecionados[saborId];
                if (quantidade > 0) {
                    let saborEncontrado = null;
                    produtosApi.forEach(tipo => {
                        const sabor = tipo.produtos?.find(p => p.id == saborId);
                        if (sabor) saborEncontrado = sabor;
                    });

                    if (saborEncontrado) {
                        const parteTexto = quantidade === 1 ? 'parte' : 'partes';
                        saboresHtml += `<div class="item-selecionado">• ${quantidade} ${parteTexto} de ${saborEncontrado.nome}</div>`;
                    }
                }
            });
        }
        saboresHtml += `</div><div class="contador-sabores">${totalPartesSabores}/${limiteSabores} partes</div>`;
        saboresDiv.innerHTML = saboresHtml;

        // Atualizar complementos
        let complementosHtml = '<div class="resumo-section"><strong>Complementos:</strong>';
        const totalComplementos = Object.values(complementosSelecionados).reduce((sum, qty) => sum + qty, 0);

        if (totalComplementos === 0) {
            complementosHtml += ' <span class="text-muted">Nenhum complemento selecionado</span>';
        } else {
            Object.keys(complementosSelecionados).forEach(complementoId => {
                const quantidade = complementosSelecionados[complementoId];
                if (quantidade > 0) {
                    const complemento = findComplementoById(complementoId);
                    if (complemento) {
                        const preco = complemento.valorVenda > 0 ? `R$ ${complemento.valorVenda.toFixed(2).replace('.', ',')}` : '';
                        complementosHtml += `<div class="item-selecionado">• ${quantidade}x ${complemento.nome} ${preco}</div>`;
                    }
                }
            });
        }
        complementosHtml += '</div>';
        complementosDiv.innerHTML = complementosHtml;

        // Habilitar/desabilitar botão - agora precisa ter pelo menos 1 sabor
        const temSaboresDisponiveis = produtosApi.some(tipo => tipo.produtos && tipo.produtos.length > 0);
        const podeFinalize = !temSaboresDisponiveis || totalPartesSabores >= 1;

        finalizarBtn.disabled = !podeFinalize;
        finalizarBtn.style.background = podeFinalize ? '#25D366' : '#ccc';
    }

    function finalizarMontagem() {
        if (!montagemProduto) return;

        // Criar arrays com os sabores e complementos selecionados
        const saboresNomes = [];
        Object.keys(saboresSelecionados).forEach(saborId => {
            const quantidade = saboresSelecionados[saborId];
            if (quantidade > 0) {
                let saborEncontrado = null;
                produtosApi.forEach(tipo => {
                    const sabor = tipo.produtos?.find(p => p.id == saborId);
                    if (sabor) saborEncontrado = sabor;
                });

                if (saborEncontrado) {
                    // Se quantidade > 1, mostrar quantas partes
                    if (quantidade > 1) {
                        saboresNomes.push(`${quantidade} partes de ${saborEncontrado.nome}`);
                    } else {
                        saboresNomes.push(saborEncontrado.nome);
                    }
                }
            }
        });

        const complementosNomes = [];
        Object.keys(complementosSelecionados).forEach(complementoId => {
            const quantidade = complementosSelecionados[complementoId];
            if (quantidade > 0) {
                const complemento = findComplementoById(complementoId);
                if (complemento) {
                    if (quantidade > 1) {
                        complementosNomes.push(`${quantidade}x ${complemento.nome}`);
                    } else {
                        complementosNomes.push(complemento.nome);
                    }
                }
            }
        });

        // Montar nome do produto personalizado
        let nomePersonalizado = montagemProduto.nome;
        if (saboresNomes.length > 0) {
            nomePersonalizado += ` - ${saboresNomes.join(', ')}`;
        }
        if (complementosNomes.length > 0) {
            nomePersonalizado += ` + ${complementosNomes.join(', ')}`;
        }

        const produtoPersonalizado = {
            nome: nomePersonalizado,
            preco: montagemProduto.preco,
            img: montagemProduto.img,
            sabores: saboresNomes,
            complementos: complementosNomes,
            personalizado: true
        };

        // Adicionar ao carrinho
        addToCart(produtoPersonalizado);

        // Limpar estado da montagem
        saboresSelecionados = {};
        complementosSelecionados = {};
        montagemProduto = null;
        produtosApi = [];
        gruposApi = [];

        // Voltar para carrinho
        switchView('carrinho');

        alert('Produto personalizado adicionado ao carrinho!');
    }

    // Enviar pedido via WhatsApp - Versão Atualizada
    function enviarPedido() {
        const items = Object.values(carrinho);
        if (items.length === 0) return;

        const total = getCartTotal();

        let mensagem = `*🛒 RESUMO DO PEDIDO*\n\n`;

        items.forEach(item => {
            // Escolher emoji apropriado
            const emoji = escolherEmoji(item.nome);

            // Linha principal do produto
            mensagem += `*\`→\`*${emoji}*${item.quantidade}x ${item.nome}*\n\n`;

            // Se tem personalização, mostrar sabores e complementos formatados
            if (item.personalizado) {
                // Sabores
                if (item.sabores && item.sabores.length > 0) {
                    mensagem += `${emoji}*Sabores:*\n\n`;
                    item.sabores.forEach(sabor => {
                        mensagem += `*\`→\`**${sabor}*\n`;
                    });
                    mensagem += '\n';
                }

                // Complementos
                if (item.complementos && item.complementos.length > 0) {
                    const tipoComplemento = detectarTipoComplemento(item.complementos);
                    mensagem += `🥘 *${tipoComplemento}:*\n`;

                    item.complementos.forEach(complemento => {
                        mensagem += `*\`→\`**${complemento}*\n`;
                    });
                    mensagem += '\n';
                }
            }

            // Preço do item (limpar formatação se necessário)
            let precoLimpo = item.preco;
            if (typeof precoLimpo === 'string') {
                precoLimpo = precoLimpo.replace(/[^\d,\.]/g, '');
                // Se já tem formatação brasileira, manter
                if (!precoLimpo.includes('R$')) {
                    precoLimpo = `R$ ${precoLimpo}`;
                }
            }
            mensagem += `${precoLimpo}\n\n`;
        });

        mensagem += `\`💰 Total: *R$ ${total.toFixed(2).replace('.', ',')}*\`\n\nObrigado! 😊`;

        // Copiar mensagem para área de transferência
        navigator.clipboard.writeText(mensagem).then(() => {
            // Encontrar campo de mensagem do WhatsApp
            const messageBox = document.querySelector('[contenteditable="true"][data-tab="10"]') ||
                document.querySelector('[contenteditable="true"]') ||
                document.querySelector('div[title="Digite uma mensagem"]');

            if (messageBox) {
                messageBox.focus();
                setTimeout(() => {
                    const pasteEvent = new KeyboardEvent('keydown', {
                        key: 'v',
                        code: 'KeyV',
                        ctrlKey: true,
                        bubbles: true,
                        cancelable: true
                    });
                    messageBox.dispatchEvent(pasteEvent);
                    clearCart();
                    togglePanel(); // Fechar painel após enviar
                    alert('Pedido colado no WhatsApp e carrinho limpo! Pressione Enter para enviar.');
                }, 100);
            } else {
                clearCart();
                alert('Pedido copiado para área de transferência e carrinho limpo! Cole manualmente no WhatsApp.');
            }
        }).catch(() => {
            clearCart();
            alert('Erro ao copiar. Copie esta mensagem:\n\n' + mensagem);
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

            // Tentar extrair ID do produto do atributo id do elemento
            const elementId = el.id;
            const produtoId = elementId.replace(/id_(categoria|produto)_/, '');

            if (nome) {
                produtos.push({
                    nome,
                    img,
                    preco,
                    id: produtoId // Adicionar ID para usar na API
                });
            }
        });

        return produtos;
    }

    // Carregar produtos de uma URL
    function loadProductsFromUrl(url) {
        // Mostrar loading
        panel.innerHTML = createHeader() + '<div class="content"><div style="text-align: center; padding: 40px;"><div style="font-size: 24px;">⏳</div><p>Carregando produtos...</p></div></div>';
        setupHeaderEvents();

        chrome.runtime.sendMessage(
            { action: 'fetchProdutos', url: url },
            (response) => {
                if (response && response.success) {
                    const produtos = parseProdutos(response.data);
                    showProducts(produtos, url);
                } else {
                    console.error('Erro ao carregar produtos:', response?.error);
                    showErrorState();
                }
            }
        );
    }

    function showErrorState() {
        panel.innerHTML = createHeader() + `
            <div class="content">
                <div class="error-state">
                    <div style="font-size: 48px; margin-bottom: 15px;">❌</div>
                    <p>Erro ao carregar produtos</p>
                    <p style="font-size: 12px; color: #666;">Verifique se a URL está correta</p>
                    <button class="nav-button" data-action="try-again">Tentar Novamente</button>
                </div>
            </div>
        `;
        setupHeaderEvents();

        const tryAgainBtn = panel.querySelector('[data-action="try-again"]');
        if (tryAgainBtn) tryAgainBtn.onclick = requestUrl;
    }

    // Carregar produtos (compatibilidade)
    function loadProducts() {
        requestUrl();
    }

    function showProducts(produtos, url = null) {
        let html = createHeader() + '<div class="content">';

        if (produtos.length === 0) {
            html += '<div class="empty-state"><div style="font-size: 48px; margin-bottom: 15px;">🍕</div><p>Nenhum produto encontrado</p><button class="nav-button" data-action="load-other">Carregar Outro Cardápio</button></div>';
        } else {
            html += '<div class="produtos-grid">';
            produtos.forEach(produto => {
                const isPersonalizavel = isProdutoPersonalizavel(produto.nome);

                html += `
                    <div class="produto-card">
                        <img class="produto-img" data-src="${produto.img}" src="${placeholderUrl}" alt="${produto.nome}">
                        <div class="produto-info">
                            <div class="produto-nome">${produto.nome}</div>
                            <div class="produto-id" style="font-size: 11px; color: #bbb;">ID: ${produto.id}</div> <!-- Adicionar produtoid ao lado do nome -->
                            <div class="produto-preco">${produto.preco}</div>
                            <div class="produto-actions">
                                <button class="add-btn" data-nome="${produto.nome}" data-preco="${produto.preco}" data-img="${produto.img}">
                                    + Carrinho
                                </button>
                                ${isPersonalizavel ? 
                                `<button class="customize-btn" data-nome="${produto.nome}" data-preco="${produto.preco}" data-img="${produto.img}" data-url="${url || ''}" data-id="${produto.id || ''}">
                                    🔧 Personalizar
                                </button>` : 
                                ''}
                            </div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        }

        html += '</div>';
        panel.innerHTML = html;
        setupHeaderEvents();
        setupProductsEvents(url);

        // Carregar imagens
        panel.querySelectorAll('.produto-img').forEach(img => {
            loadImage(img, img.dataset.src);
        });
    }

    function setupProductsEvents(url) {
        // Configurar eventos dos produtos
        panel.querySelectorAll('.add-btn').forEach(btn => {
            btn.onclick = () => {
                const produto = {
                    nome: btn.dataset.nome,
                    preco: formatarPreco(btn.dataset.preco), // Formatar preço corretamente
                    img: btn.dataset.img,
                    id: btn.dataset.id // Adicionar produtoid
                };
                addToCart(produto);
            };
        });

        // Configurar eventos de personalização
        panel.querySelectorAll('.customize-btn').forEach(btn => {
            btn.onclick = async () => {
                const produto = {
                    nome: btn.dataset.nome,
                    preco: formatarPreco(btn.dataset.preco), // Formatar preço corretamente
                    img: btn.dataset.img,
                    id: btn.dataset.id
                };

                const produtoUrl = btn.dataset.url;
                const produtoId = btn.dataset.id;

                // Mostrar loading
                panel.innerHTML = createHeader() + '<div class="content"><div style="text-align: center; padding: 40px;"><div style="font-size: 24px;">⏳</div><p>Carregando opções de personalização...</p></div></div>';
                setupHeaderEvents();

                // Carregar dados da API
                if (produtoId && produtoUrl) {
                    const loaded = await loadApiData(produtoId, produtoUrl);
                    if (!loaded) {
                        alert('Erro ao carregar dados para personalização. Adicionando produto simples ao carrinho.');
                        addToCart(produto);
                        switchView('carrinho');
                        return;
                    }
                } else {
                    alert('ID do produto não encontrado. Adicionando produto simples ao carrinho.');
                    addToCart(produto);
                    switchView('carrinho');
                    return;
                }

                montagemProduto = produto;
                switchView('montagem');
            };
        });

        // Botão para carregar outro cardápio
        const loadOtherBtn = panel.querySelector('[data-action="load-other"]');
        if (loadOtherBtn) loadOtherBtn.onclick = requestUrl;
    }

    function formatarPreco(preco) {
        let precoLimpo = preco?.replace(/[^\d,\.]/g, '') || '0';
        if (precoLimpo.includes(',') && precoLimpo.includes('.')) {
            precoLimpo = precoLimpo.replace(',', '');
        } else if (precoLimpo.includes(',') && !precoLimpo.includes('.')) {
            precoLimpo = precoLimpo.replace(',', '.');
        }
        return parseFloat(precoLimpo) || 0; // Retornar valor em formato numérico
    }

    // Mostrar carrinho
    function showCart() {
        let html = createHeader() + '<div class="content">';

        const items = Object.values(carrinho);
        if (items.length === 0) {
            html += '<div class="empty-state"><div style="font-size: 48px; margin-bottom: 15px;">🛒</div><p>Seu carrinho está vazio</p><button class="nav-button" data-action="add-products">Adicionar Produtos</button></div>';
        } else {
            html += '<div class="carrinho-items">';
            items.forEach(item => {
                html += `
                    <div class="carrinho-item">
                        <img class="carrinho-img" data-src="${item.img}" src="${item.img}" alt="${item.nome}">
                        <div class="carrinho-info">
                            <div class="carrinho-nome">${item.nome}</div>
                            ${item.personalizado && item.sabores && item.sabores.length > 0 ?
                        `<div class="carrinho-sabores">Sabores: ${item.sabores.join(', ')}</div>` :
                        ''
                    }
                            ${item.personalizado && item.complementos && item.complementos.length > 0 ?
                        `<div class="carrinho-complementos">Complementos: ${item.complementos.join(', ')}</div>` :
                        ''
                    }
                            <div class="carrinho-preco">R$ ${(parseFloat(item.preco) || 0).toFixed(2).replace('.', ',')}</div> <!-- Garantir formato "R$" -->
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
                    <div class="total-valor">Total: R$ ${total.toFixed(2).replace('.', ',')}</div> <!-- Garantir formato "R$" -->
                    <div class="carrinho-acoes">
                        <button class="enviar-btn" data-action="send-order" ${items.length === 0 ? 'disabled' : ''}>
                            <i class="ico-whatsapp"></i> Enviar via WhatsApp
                        </button>
                        <button class="enviar-painel-btn" data-action="send-to-panel" ${items.length === 0 ? 'disabled' : ''}>
                            <i class="ico-panel"></i> Enviar ao Painel
                        </button>
                    </div>
                </div>
            `;
        }

        panel.innerHTML = html + '</div>';

        setupHeaderEvents();
        setupCartEvents();

        // Carregar imagens
        panel.querySelectorAll('.carrinho-img').forEach(img => {
            loadImage(img, img.dataset.src);
        });
    }

    // Modificar a função setupCartEvents para adicionar eventos dos novos botões
    function setupCartEvents() {
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

        // Enviar pedido via WhatsApp
        const enviarBtn = panel.querySelector('[data-action="send-order"]');
        if (enviarBtn && !enviarBtn.disabled) {
            enviarBtn.onclick = enviarPedido;
        }

        // Novo botão: Enviar ao Painel
        const enviarPainelBtn = panel.querySelector('[data-action="send-to-panel"]');
        if (enviarPainelBtn && !enviarPainelBtn.disabled) {
            enviarPainelBtn.onclick = enviarPedidoPainel;
        }

       

        // Adicionar produtos
        const addProductsBtn = panel.querySelector('[data-action="add-products"]');
        if (addProductsBtn) addProductsBtn.onclick = requestUrl;
    }

    // Nova função simplificada para enviar pedido ao Painel
    async function enviarPedidoPainel() {
        try {
            // Verificar se o carrinho está vazio
            if (Object.keys(carrinho).length === 0) {
                alert('O carrinho está vazio. Adicione produtos antes de enviar.');
                return;
            }

            // Verificar se o atendimento está ativo
            if (!statusAtendimento) {
                const diaSemana = new Date().getDay();
                const horarioHoje = horariosAtendimento.find(h => h.diaSemana === diaSemana);
                const proximaAbertura = horarioHoje ? horarioHoje.horaAbre : 'Consulte os horários';
                
                alert(`🕐 Atendimento fechado no momento.\n\nPróxima abertura: ${proximaAbertura}\n\nTente novamente durante o horário de funcionamento.`);
                return;
            }

            // Solicitar dados do cliente
            const telefone = prompt('Digite o número de telefone do cliente (apenas números):');
            if (!telefone || !/^\d+$/.test(telefone)) {
                alert('Número de telefone inválido. Digite apenas números.');
                return;
            }

            // Buscar dados do cliente via API
            chrome.storage.local.get(['faminto_empresa_id'], async function (result) {
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

                                // Processar carrinho e criar payload
                                const itens = Object.values(carrinho).map(item => {
                                    let precoLimpo = typeof item.preco === 'string' ? item.preco.replace(/[^\d,\.]/g, '') : '0'; // Verificar se item.preco é string
                                    if (precoLimpo.includes(',') && precoLimpo.includes('.')) {
                                        precoLimpo = precoLimpo.replace(',', '');
                                    } else if (precoLimpo.includes(',') && !precoLimpo.includes('.')) {
                                        precoLimpo = precoLimpo.replace(',', '.');
                                    }
                                    const precoEmCentavos = Math.round(parseFloat(precoLimpo) * 100);

                                    return {
                                        categoriaId: item.categoriaId || 42, // ID padrão para categoria
                                        qtd: item.quantidade,
                                        nomecat: item.nome,
                                        valorTotal: `R$ ${(parseFloat(precoLimpo) || 0).toFixed(2).replace('.', ',')}`, // Garantir formato "R$"
                                        obs: item.obs || null,
                                        pedidoitemadicionais: [],
                                        composicao: [
                                            {
                                                produtoid: item.id || item.produtoid || "0", // Garantir que o ID real do produto seja usado
                                                nomeprod: item.nome,
                                                vlrvenda: precoEmCentavos,
                                                idInput: null,
                                                qtdInput: 0,
                                                tempofab: 0
                                            }
                                        ],
                                        senhaGarcom: "",
                                        montavel: item.personalizado || false
                                    };
                                });

                                const endereco = clienteData.enderecos[0];
                                const payload = {
                                    enderecoid: 0,
                                    vlrentrega: 0,
                                    retira: true,
                                    status: 0,
                                    obs: "",
                                    mesa: "",
                                    agendamentoid: 0,
                                    dataAgendamento: null,
                                    nomedocupom: "",
                                    vlrcupom: 0,
                                    troco: 0,
                                    itens: itens,
                                    endereco: {
                                        bairroid: endereco.bairroid.toString(),
                                        rua: endereco.rua,
                                        nrocasa: endereco.nrocasa,
                                        bairro: endereco.bairro,
                                        usuario: {
                                            enderecos: clienteData.enderecos,
                                            id: clienteData.id,
                                            celular: clienteData.celular,
                                            cpf: clienteData.cpf,
                                            empresaId: clienteData.empresaId,
                                            nome: clienteData.nome,
                                            sexo: clienteData.sexo,
                                            empresa: null,
                                            cartoesUsuario: [],
                                            CartoesUsuario: []
                                        },
                                        textoendereco: null,
                                        complemento: endereco.complemento || "",
                                        meuspedidos: null
                                    },
                                    userAgent: navigator.userAgent,
                                    descontouFidelidade: false,
                                    pagamentos: [
                                        {
                                            formapgtoid: "17",
                                            troco: 0,
                                            codigopix: null,
                                            CartaoId: null,
                                            Cartao: null,
                                            DataCartao: null,
                                            NomeCartao: null,
                                            cvv: null,
                                            autorizado: null
                                        }
                                    ],
                                    entregaGratis: false,
                                    visitorId: generateVisitorId()
                                };

                                // Enviar pedido
                                const pedidoUrl = `https://pedidos.faminto.app/api/pedido/${empresaId}/${clienteData.cpf}/LinkDireto`;
                                chrome.runtime.sendMessage(
                                    {
                                        action: 'enviarPedidoAPI',
                                        url: pedidoUrl,
                                        payload: payload
                                    },
                                    (response) => {
                                        if (response && response.success) {
                                            alert('Pedido enviado com sucesso ao Painel!');
                                            clearCart(); // Limpar carrinho após sucesso
                                            togglePanel(); // Fechar painel
                                        } else {
                                            console.error('Erro ao enviar pedido:', response?.error);
                                            console.log('Dados enviados:', JSON.stringify(payload, null, 2)); // Exibir dados enviados para debug
                                            alert(`Erro ao enviar pedido: ${response?.error || "Erro desconhecido."}\n\nConfira os dados enviados no console.`);
                                        }
                                    }
                                );

                            } catch (error) {
                                console.error('Erro ao processar dados do cliente:', error);
                                alert('Erro ao processar dados do cliente.');
                            }
                        } else {
                            console.error('Erro ao buscar dados do cliente:', response?.error);
                            alert('Erro ao buscar dados do cliente.');
                        }
                    }
                );
            });

        } catch (error) {
            console.error('Erro ao enviar pedido ao painel:', error);
            alert(`Erro ao processar pedido: ${error.message}`);
        }
    }

    // Função para gerar visitor ID aleatório
    function generateVisitorId() {
        const characters = 'abcdef0123456789';
        let visitorId = '';
        for (let i = 0; i < 40; i++) {
            visitorId += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return visitorId;
    }

    // Listener para mensagens do popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'openPanel') {
            togglePanel();
            sendResponse({ success: true });
        } else if (request.action === 'openClienteConfig') {
            configurarDadosCliente()
                .then(() => sendResponse({ success: true }))
                .catch(() => sendResponse({ success: false, error: 'Erro ao configurar dados do cliente.' }));
        }
        return true; // Indica que a resposta será assíncrona
    });

    // Solicitar ou carregar URL padrão ao iniciar
function solicitarOuCarregarURLPadrao() {
    chrome.storage.local.get(['faminto_default_url'], function (result) {
        let defaultUrl = result.faminto_default_url;

        if (!defaultUrl) {
            defaultUrl = prompt('Digite a URL padrão do cardápio do Faminto:', 'https://pedidos.faminto.app/app/7/44056498040');
            if (defaultUrl && defaultUrl.startsWith('https://')) {
                chrome.storage.local.set({ 'faminto_default_url': defaultUrl }, function () {
                    console.log('URL padrão salva:', defaultUrl);
                    extrairEmpresaIdECNPJ(defaultUrl);
                });
            } else {
                alert('URL inválida. A extensão não funcionará corretamente sem uma URL padrão.');
            }
        } else {
            console.log('URL padrão carregada:', defaultUrl);
            extrairEmpresaIdECNPJ(defaultUrl);
        }
    });
}

// Extrair empresaId e CNPJ da URL padrão
function extrairEmpresaIdECNPJ(url) {
    const match = url.match(/\/app\/(\d+)\/(\d+)/);
    if (match) {
        const empresaId = match[1];
        const cnpj = match[2];
        console.log('Empresa ID:', empresaId, 'CNPJ:', cnpj);

        // Salvar empresaId e CNPJ no armazenamento local
        chrome.storage.local.set({ 'faminto_empresa_id': empresaId, 'faminto_cnpj': cnpj }, function () {
            console.log('Empresa ID e CNPJ salvos no armazenamento local.');
        });
    } else {
        console.error('Erro ao extrair Empresa ID e CNPJ da URL:', url);
    }
}

// Modificar inicialização para incluir lógica de URL padrão
function init() {
    if (!checkWhatsAppPage()) return;

    console.log('Iniciando extensão Faminto...');
    solicitarOuCarregarURLPadrao();
    createUI();
    loadCart();
    
    // Carregar horários de atendimento
    carregarHorariosAtendimento();
    
    // Atualizar status a cada minuto
    setInterval(() => {
        statusAtendimento = verificarAtendimentoAtivo();
        updateHeaderStatus();
    }, 60000);

    if (!window.famintoApiInicializada) {
        console.warn('API do Faminto não está disponível ainda.');
    }

    console.log('Extensão Faminto carregada com sucesso!');
}

// Verificar se estamos na página correta
function checkWhatsAppPage() {
    const url = window.location.href;
    if (!url.includes('web.whatsapp.com')) {
        console.warn('Extensão Faminto não está ativa na página correta.');
        return false;
    }
    return true;
}

// Chamar init ao carregar o script
init();
})();