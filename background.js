// Background script para lidar com requisições CORS
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetchProdutos') {
        fetch(request.url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Erro na requisição direta: ${response.status} ${response.statusText}`);
                }
                return response.text();
            })
            .then(html => {
                sendResponse({ success: true, data: html });
            })
            .catch(error => {
                console.warn('Fetch direto falhou, tentando proxy...', error);

                // Tentar com proxy CORS
                const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(request.url)}`;
                return fetch(proxyUrl)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`Erro no proxy CORS: ${response.status} ${response.statusText}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        if (data && data.contents) {
                            sendResponse({ success: true, data: data.contents });
                        } else {
                            throw new Error('Dados inválidos retornados pelo proxy');
                        }
                    });
            })
            .catch(error => {
                console.error('Todas as tentativas falharam:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Indica que a resposta será assíncrona
    }

    // Função para lidar com requisições bloqueadas por CORS
    if (request.action === 'fetchApi') {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(request.url)}`;
        fetch(proxyUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Erro no proxy CORS: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                if (data && data.contents) {
                    sendResponse({ success: true, data: data.contents });
                } else {
                    throw new Error('Dados inválidos retornados pelo proxy');
                }
            })
            .catch(error => {
                console.error('Erro ao buscar dados via proxy:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Indica que a resposta será assíncrona
    }

    // Função para enviar pedido diretamente para a API do Faminto
    if (request.action === 'enviarPedidoAPI') {
        fetch(request.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(request.payload)
        })
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    if (response.status === 500) {
                        sendResponse({ success: false, html: text }); // Retornar o HTML do erro
                    } else {
                        throw new Error(`Erro na API (${response.status}): ${text}`);
                    }
                });
            }
            return response.json();
        })
        .then(data => {
            console.log('Resposta da API:', data);
            sendResponse({ success: true, data: data });
        })
        .catch(error => {
            console.error('Erro ao enviar pedido para API:', error);
            sendResponse({ success: false, error: error.message });
        });

        return true; // Indica que a resposta será assíncrona
    }

    if (request.action === 'calcularTotalCarrinho') {
        chrome.storage.local.get(['faminto_cart'], function(result) {
            const cart = result.faminto_cart || {};
            const items = Object.values(cart);

            const totalValue = items.reduce((total, item) => {
                let precoLimpo = typeof item.preco === 'string' ? item.preco.replace(/[^\d,\.]/g, '') : '0';
                if (precoLimpo.includes(',') && precoLimpo.includes('.')) {
                    precoLimpo = precoLimpo.replace(',', '');
                } else if (precoLimpo.includes(',') && !precoLimpo.includes('.')) {
                    precoLimpo = precoLimpo.replace(',', '.');
                }
                const preco = parseFloat(precoLimpo) || 0;
                return total + (preco * item.quantidade);
            }, 0);

            sendResponse({ success: true, total: `R$ ${totalValue.toFixed(2).replace('.', ',')}` });
        });

        return true; // Indica que a resposta será assíncrona
    }
});