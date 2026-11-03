const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { question } = req.body || {};
  if (!question || typeof question !== 'string' || question.trim() === '') {
    return res.status(400).json({ reply: 'Por favor, escreve uma pergunta válida.' });
  }

  try {
    // 1. Carregar a base de dados local
    const filePath = path.join(process.cwd(), 'knowledge.json');
    const rawData = fs.readFileSync(filePath, 'utf8');
    const knowledgeBase = JSON.parse(rawData);

    // 2. Filtrar conteúdos relacionados com a pergunta
    const query = question.toLowerCase();
    const matches = knowledgeBase.filter(item => {
      const text = item.conteudo.toLowerCase();
      return text.includes(query) || query.split(' ').some(word => word.length > 3 && text.includes(word));
    });

    const contextText = matches.length > 0
      ? matches.map(d => `- ${d.conteudo} (Fonte: ${d.url})`).join('\n')
      : "Nenhuma informação direta encontrada na base de dados da escola.";

    // 3. Instrução para a Inteligência Artificial (System Prompt)
    const systemPrompt = `
És o assistente virtual oficial da ETPC (Escola Profissional de Carvalhos).
REGRAS OBRIGATÓRIAS:
1. Responde APENAS com base no CONTEXTO abaixo.
2. Se a informação não estiver no contexto, responde exatamente: "Não disponho de informação suficiente no site da escola para responder a essa questão."
3. Se a pergunta for sobre futebol, receitas, política ou outros temas fora da escola, recusa educadamente indicando que apenas respondes sobre a ETPC.
4. NUNCA inventes dados.
5. Sempre que responderes com sucesso, inclui a fonte no final: "Fonte: URL".

CONTEXTO:
${contextText}

PERGUNTA: ${question}
`;

    // 4. Chamada à API do Google Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ reply: 'Erro interno: Chave de API não configurada no servidor.' });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Erro na API Gemini:', data);
      return res.status(500).json({ reply: 'Ocorreu um erro ao consultar a inteligência artificial.' });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Não foi possível gerar uma resposta.";
    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Erro no handler:', err);
    return res.status(500).json({ reply: 'O assistente está temporariamente indisponível. Tente novamente mais tarde.' });
  }
};
