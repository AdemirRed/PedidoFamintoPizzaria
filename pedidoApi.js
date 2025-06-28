/**
 * Funções para envio de pedidos ao Painel do Faminto
 */

// Objeto global para armazenar configurações do cliente
let clienteConfig = {
    nome: '',
    celular: '',
    cpf: '',
    empresaId: '7',  // ID da empresa/restaurante
    bairroId: '',
    rua: '',
    numero: '',
    complemento: '',
    formaPagamentoId: '1', // ID do pagamento (1 = dinheiro normalmente)
    troco: 0,
    retira: true
};

// Carregar configurações completas do cliente
async function carregarConfigCliente() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['faminto_cliente_config', 'faminto_empresa_id', 'faminto_cnpj'], async function (result) {
            let clienteConfig = result.faminto_cliente_config || {};
            const empresaId = result.faminto_empresa_id || '7';
            const cnpj = result.faminto_cnpj || '';

            if (!clienteConfig.celular || !clienteConfig.cpf) {
                resolve(clienteConfig); // Retorna configuração básica se celular ou CPF não estiverem configurados
                return;
            }

            try {
                const apiUrl = `https://pedidos.faminto.app/api/usuario/retornaUsuarioComEndereco/${empresaId}/${clienteConfig.celular}`;
                const response = await fetch(apiUrl);

                if (!response.ok) {
                    throw new Error(`Erro ao buscar dados do cliente: ${response.status} ${response.statusText}`);
                }

                const data = await response.json();
                if (data && data.id) {
                    clienteConfig = {
                        ...clienteConfig,
                        id: data.id,
                        nome: data.nome,
                        celular: data.celular,
                        cpf: data.cpf,
                        empresaId: data.empresaId,
                        enderecos: data.enderecos || [],
                    };

                    // Salvar configurações atualizadas no armazenamento local
                    chrome.storage.local.set({ 'faminto_cliente_config': clienteConfig }, function () {
                        resolve(clienteConfig);
                    });
                } else {
                    throw new Error('Dados do cliente não encontrados.');
                }
            } catch (error) {
                console.error('Erro ao carregar dados completos do cliente:', error);
                resolve(clienteConfig); // Retorna configuração básica em caso de erro
            }
        });
    });
}

// Salvar configurações do cliente
function salvarConfigCliente(config) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ 'faminto_cliente_config': config }, function () {
            clienteConfig = { ...clienteConfig, ...config };
            resolve(true);
        });
    });
}

// Formatar o carrinho para o formato da API
function formatarCarrinhoParaAPI(carrinho) {
    try {
        const itensCarrinho = Object.values(carrinho);

        const itensFormatados = itensCarrinho.map(item => {
            // Limpar e ajustar o preço para o formato correto
            let precoLimpo = item.preco?.replace(/[^\d,\.]/g, '') || '0';
            if (precoLimpo.includes(',') && precoLimpo.includes('.')) {
                precoLimpo = precoLimpo.replace(',', '');
            } else if (precoLimpo.includes(',') && !precoLimpo.includes('.')) {
                precoLimpo = precoLimpo.replace(',', '.');
            }
            const precoEmReais = parseFloat(precoLimpo) || 0;

            // Capturar o produtoid corretamente
            const produtoId = item.id && item.id !== "0" ? item.id : null;

            if (!produtoId) {
                console.warn(`Produto sem ID válido: ${item.nome}`);
            }

            // Determinar se o item deve ter composição
            const composicao = produtoId
                ? [
                    {
                        produtoid: produtoId,
                        nomeprod: "",
                        vlrvenda: precoEmReais,
                        idInput: null,
                        qtdInput: 0,
                        tempofab: 0
                    }
                ]
                : []; // Não incluir composição para itens sem produtoid válido

            return {
                categoriaId: item.categoriaId || 0,
                qtd: item.quantidade,
                nomecat: item.nome,
                obs: item.obs || null,
                pedidoitemadicionais: item.adicionais || [],
                composicao: composicao, // Composição válida ou vazia
                senhaGarcom: "",
                montavel: item.personalizado || false
            };
        });

        return itensFormatados;
    } catch (error) {
        console.error("Erro ao formatar carrinho para API:", error);
        return [];
    }
}

// Formatar payload completo para API com dados do cliente e endereço
async function formatarPayloadAPI(carrinho) {
    // Carregar configurações atualizadas do cliente
    const clienteConfig = await carregarConfigCliente();

    // Verificar se o cliente possui endereço configurado
    if (!clienteConfig.bairroId || !clienteConfig.rua || !clienteConfig.numero) {
        throw new Error("Endereço do cliente não configurado corretamente.");
    }

    // Formatar itens do carrinho
    const itensFormatados = formatarCarrinhoParaAPI(carrinho);

    // Criar payload conforme formato esperado pela API
    const payload = {
        enderecoid: 0,
        vlrentrega: clienteConfig.retira ? 0 : clienteConfig.valorEntrega || 10,
        retira: clienteConfig.retira,
        status: 0,
        obs: "",
        mesa: "",
        agendamentoid: 0,
        dataAgendamento: null,
        nomedocupom: "",
        vlrcupom: 0,
        troco: clienteConfig.troco || 0,
        itens: itensFormatados,
        endereco: {
            bairroid: clienteConfig.bairroId,
            rua: clienteConfig.rua,
            nrocasa: clienteConfig.numero,
            complemento: clienteConfig.complemento || "",
            usuario: {
                id: clienteConfig.id || 0,
                nome: clienteConfig.nome || "Cliente Faminto",
                celular: clienteConfig.celular,
                cpf: clienteConfig.cpf,
                empresaId: clienteConfig.empresaId || 7,
                enderecos: clienteConfig.enderecos || []
            }
        },
        userAgent: navigator.userAgent,
        descontouFidelidade: false,
        pagamentos: [
            {
                formapgtoid: clienteConfig.formaPagamentoId || "17",
                troco: clienteConfig.troco || 0
            }
        ],
        entregaGratis: false,
        visitorId: generateVisitorId()
    };

    return payload;
}

// Gerar visitor ID aleatório para identificação
function generateVisitorId() {
    const characters = 'abcdef0123456789';
    let visitorId = '';
    for (let i = 0; i < 40; i++) {
        visitorId += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return visitorId;
}

// Enviar pedido para o Painel do Faminto
async function enviarPedidoParaPainel(carrinho) {
    try {
        // Verificar se há itens no carrinho
        if (Object.keys(carrinho).length === 0) {
            alert('O carrinho está vazio. Adicione produtos antes de enviar.');
            return { success: false, message: "Carrinho vazio!" };
        }

        // Carregar configurações do cliente
        const clienteConfig = await carregarConfigCliente();

        // Verificar se os dados do cliente estão configurados
        if (!clienteConfig.celular || !clienteConfig.cpf || !clienteConfig.bairroId || !clienteConfig.rua || !clienteConfig.numero) {
            alert('Dados do cliente incompletos. Configure os dados antes de enviar.');
            return { success: false, message: "Dados do cliente incompletos!" };
        }

        // Formatar payload
        const payload = await formatarPayloadAPI(carrinho);
        console.log("Payload para API:", payload);

        // Construir URL da API
        const empresaId = clienteConfig.empresaId || "7";
        const cnpj = clienteConfig.cpf.replace(/\D/g, '');
        const apiUrl = `https://pedidos.faminto.app/api/pedido/${empresaId}/${cnpj}/LinkDireto`;

        // Enviar requisição
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                {
                    action: 'enviarPedidoAPI',
                    url: apiUrl,
                    payload: payload
                },
                (response) => {
                    console.log("Resposta da API:", response);
                    if (response && response.success) {
                        alert('Pedido enviado com sucesso ao Painel!');
                        resolve({ success: true, message: "Pedido enviado com sucesso!", data: response.data });
                    } else {
                        alert(`Erro ao enviar pedido: ${response?.error || "Erro desconhecido."}`);
                        resolve({ success: false, message: response?.error || "Erro ao enviar pedido.", data: response?.data });
                    }
                }
            );
        });
    } catch (error) {
        console.error("Erro ao enviar pedido:", error);
        alert(`Erro ao processar pedido: ${error.message}`);
        return { success: false, message: "Erro ao processar pedido: " + error.message };
    }
}

// Mostrar formulário de configurações do cliente
async function mostrarFormularioCliente() {
    // Solicitar número do cliente
    const telefone = prompt('Digite o número de telefone do cliente (apenas números):');
    if (!telefone || !/^\d+$/.test(telefone)) {
        alert('Número de telefone inválido. Digite apenas números.');
        return false;
    }

    // Buscar dados do cliente pelo telefone
    const empresaId = clienteConfig.empresaId || '7'; // ID padrão da empresa
    const apiUrl = `https://pedidos.faminto.app/api/usuario/retornaUsuarioComEndereco/${empresaId}/${telefone}`;
    let clienteData;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Erro ao buscar dados do cliente: ${response.status} ${response.statusText}`);
        }
        clienteData = await response.json();
    } catch (error) {
        console.error('Erro ao buscar dados do cliente:', error);
        alert('Erro ao buscar dados do cliente. Verifique o console para mais detalhes.');
        return false;
    }

    if (!clienteData || !clienteData.id) {
        alert('Cliente não encontrado para o número fornecido.');
        return false;
    }

    // Atualizar configurações com os dados do cliente
    clienteConfig = {
        ...clienteConfig,
        id: clienteData.id,
        nome: clienteData.nome,
        celular: clienteData.celular,
        cpf: clienteData.cpf,
        bairroId: clienteData.enderecos[0]?.bairroid || '',
        rua: clienteData.enderecos[0]?.rua || '',
        numero: clienteData.enderecos[0]?.nrocasa || '',
        complemento: clienteData.enderecos[0]?.complemento || '',
    };

    // Salvar configurações no armazenamento local
    await salvarConfigCliente(clienteConfig);

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
        <h3 style="margin-top: 0; color: #25D366;">Configurações de Envio</h3>
        <p style="margin-bottom: 20px; color: #bbb; font-size: 12px;">
            Configure seus dados para envio direto ao Painel de Pedidos
        </p>
        
        <div class="input-group" style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Nome</label>
            <input type="text" id="cliente-nome" value="${clienteConfig.nome}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #555; background: #1d1d1d; color: #e0e0e0;">
        </div>
        
        <div class="input-group" style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Celular (apenas números)</label>
            <input type="tel" id="cliente-celular" value="${clienteConfig.celular}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #555; background: #1d1d1d; color: #e0e0e0;" disabled>
        </div>
        
        <div class="input-group" style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">CPF (apenas números)</label>
            <input type="text" id="cliente-cpf" value="${clienteConfig.cpf}" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #555; background: #1d1d1d; color: #e0e0e0;">
        </div>
        
        <div class="form-actions" style="display: flex; gap: 10px; margin-top: 20px;">
            <button id="fechar-form" style="flex: 1; padding: 10px; border: none; border-radius: 5px; cursor: pointer; background: #555; color: white;">Cancelar</button>
            <button id="salvar-form" style="flex: 2; padding: 10px; border: none; border-radius: 5px; cursor: pointer; background: #25D366; color: white; font-weight: bold;">Salvar Configurações</button>
        </div>
    `;

    // Adicionar formulário ao overlay
    overlay.appendChild(form);
    document.body.appendChild(overlay);

    // Configurar eventos do formulário
    const fecharBtn = document.getElementById('fechar-form');
    const salvarBtn = document.getElementById('salvar-form');

    // Evento de cancelar
    fecharBtn.addEventListener('click', function () {
        overlay.remove();
    });

    // Evento de salvar
    salvarBtn.addEventListener('click', function () {
        // Coletar dados do formulário
        const novaConfig = {
            nome: document.getElementById('cliente-nome').value.trim(),
            cpf: document.getElementById('cliente-cpf').value.replace(/\D/g, ''),
        };

        // Validar campos obrigatórios
        if (!novaConfig.nome) {
            alert('Por favor, preencha o nome do cliente.');
            return;
        }

        if (!novaConfig.cpf) {
            alert('Por favor, preencha o CPF do cliente.');
            return;
        }

        // Atualizar configurações e salvar
        salvarConfigCliente({ ...clienteConfig, ...novaConfig }).then(() => {
            overlay.remove();
            alert('Configurações salvas com sucesso!');
        });
    });
}

// Buscar ID do cliente pelo número de telefone
async function buscarIdClientePorTelefone(empresaId, telefone) {
    try {
        const url = `https://pedidos.faminto.app/api/usuario/celular/${empresaId}/${telefone}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Erro ao buscar ID do cliente: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data === -1) {
            console.warn('Cliente não encontrado para o número:', telefone);
            return null; // Retorna null se o cliente não for encontrado
        }

        return data; // Retorna o ID do cliente
    } catch (error) {
        console.error('Erro ao buscar ID do cliente:', error);
        return null;
    }
}

// Exportar funções globalmente
function inicializarAPI() {
    if (window.famintoApiInicializada) {
        console.log('API do Faminto já inicializada.');
        return; // Evitar inicializações repetidas
    }

    console.log('Inicializando API do Faminto Painel...');
    
    try {
        // Exportar funções globalmente
        window.famintoApi = {
            enviarPedidoParaPainel,
            mostrarFormularioCliente,
            carregarConfigCliente,
            salvarConfigCliente,
            buscarIdClientePorTelefone
        };
        
        // Sinalizador para indicar que a API foi inicializada
        window.famintoApiInicializada = true;
        
        // Disparar evento de inicialização
        const evento = new CustomEvent('famintoApiPronta');
        document.dispatchEvent(evento);
        
        console.log('API do Faminto Painel inicializada com sucesso!');
    } catch (error) {
        console.error('Erro ao inicializar API do Faminto:', error);
    }
}

// Adicionar listener para verificar se a API está pronta
document.addEventListener('famintoApiPronta', () => {
    console.log('Evento famintoApiPronta recebido: API está pronta.');
});

// Inicializar API quando o documento estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarAPI);
} else {
    inicializarAPI();
}
