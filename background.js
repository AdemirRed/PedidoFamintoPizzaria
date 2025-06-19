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

    // Nova função para carregar dados da API
    if (request.action === 'fetchApi') {
        fetch(request.url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Erro na requisição da API: ${response.status} ${response.statusText}`);
                }
                return response.text();
            })
            .then(data => {
                sendResponse({ success: true, data: data });
            })
            .catch(error => {
                console.warn('Fetch direto da API falhou, tentando proxy...', error);

                // Tentar com proxy CORS
                const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(request.url)}`;
                return fetch(proxyUrl)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`Erro no proxy CORS da API: ${response.status} ${response.statusText}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        if (data && data.contents) {
                            sendResponse({ success: true, data: data.contents });
                        } else {
                            throw new Error('Dados inválidos retornados pelo proxy da API');
                        }
                    });
            })
            .catch(error => {
                console.error('Todas as tentativas da API falharam:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Indica que a resposta será assíncrona
    }
});