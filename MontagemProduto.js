import React, { useState } from 'react';

function MontagemProduto({ produto, tipoProdutos, onFinalizar }) {
    const limiteSabores = parseInt(produto.nome.match(/(\d+)\s*sabores/i)?.[1] || 0);
    const [saboresSelecionados, setSaboresSelecionados] = useState([]);
    const [complementosSelecionados, setComplementosSelecionados] = useState([]);

    const handleSelecionarSabor = (sabor) => {
        if (saboresSelecionados.includes(sabor)) {
            setSaboresSelecionados(saboresSelecionados.filter(s => s !== sabor));
        } else if (saboresSelecionados.length < limiteSabores) {
            setSaboresSelecionados([...saboresSelecionados, sabor]);
        }
    };

    const handleSelecionarComplemento = (complemento) => {
        if (complementosSelecionados.includes(complemento)) {
            setComplementosSelecionados(complementosSelecionados.filter(c => c !== complemento));
        } else {
            setComplementosSelecionados([...complementosSelecionados, complemento]);
        }
    };

    const handleFinalizar = () => {
        const payload = {
            sabores: saboresSelecionados.map(s => s.id),
            complementos: complementosSelecionados.map(c => c.id),
        };
        onFinalizar(payload);
    };

    return (
        <div>
            <h2>Monte seu produto</h2>
            <p>Selecione até {limiteSabores} sabores:</p>
            {tipoProdutos
                .filter(tipo => tipo.categoria === 'sabores')
                .map((tipo) => (
                    <div key={tipo.id}>
                        <h3>{tipo.nome}</h3>
                        {tipo.produtos.map((produto) => (
                            <div
                                key={produto.id}
                                style={{
                                    border: '1px solid #ccc',
                                    borderRadius: '8px',
                                    padding: '10px',
                                    marginBottom: '10px',
                                    background: saboresSelecionados.includes(produto) ? '#e0ffe0' : '#fff',
                                }}
                            >
                                <p>{produto.nome}</p>
                                <p>{produto.preco}</p>
                                <button
                                    onClick={() => handleSelecionarSabor(produto)}
                                    style={{
                                        background: saboresSelecionados.includes(produto) ? '#25D366' : '#ccc',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '5px',
                                        padding: '5px 10px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {saboresSelecionados.includes(produto) ? 'Remover' : 'Selecionar'}
                                </button>
                            </div>
                        ))}
                    </div>
                ))}
            <h3>Complementos:</h3>
            {tipoProdutos
                .filter(tipo => tipo.categoria === 'complementos')
                .map((tipo) => (
                    <div key={tipo.id}>
                        <h4>{tipo.nome}</h4>
                        {tipo.produtos.map((complemento) => (
                            <div
                                key={complemento.id}
                                style={{
                                    border: '1px solid #ccc',
                                    borderRadius: '8px',
                                    padding: '10px',
                                    marginBottom: '10px',
                                    background: complementosSelecionados.includes(complemento) ? '#e0ffe0' : '#fff',
                                }}
                            >
                                <p>{complemento.nome}</p>
                                <p>{complemento.preco}</p>
                                <button
                                    onClick={() => handleSelecionarComplemento(complemento)}
                                    style={{
                                        background: complementosSelecionados.includes(complemento) ? '#25D366' : '#ccc',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '5px',
                                        padding: '5px 10px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {complementosSelecionados.includes(complemento) ? 'Remover' : 'Selecionar'}
                                </button>
                            </div>
                        ))}
                    </div>
                ))}
            <button
                onClick={handleFinalizar}
                disabled={saboresSelecionados.length !== limiteSabores}
                style={{
                    background: saboresSelecionados.length === limiteSabores ? '#25D366' : '#ccc',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '5px',
                    padding: '10px 20px',
                    cursor: saboresSelecionados.length === limiteSabores ? 'pointer' : 'not-allowed',
                }}
            >
                Próximo
            </button>
        </div>
    );
}

export default MontagemProduto;
