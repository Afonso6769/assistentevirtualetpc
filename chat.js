import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { question } = req.body;
  if (!question || question.trim() === '') {
    return res.status(400).json({ error: 'A pergunta não pode estar vazia.' });
  }

  try {
    // 1. Carregar base de dados
    const filePath = path.join(process.cwd(), 'knowledge.json');
    const rawData = fs.readFileSync(filePath, 'utf8');
    const knowledgeBase = JSON.parse(rawData);

    // 2. Procurar excertos relevantes por palavras-chave
    const query = question.toLowerCase();
    const relevantDocs = knowledgeBase.filter(item => 
      item.conteudo.toLowerCase().includes(query) ||
      query.split(' ').some(word => word.length > 3 && item.conteudo.toLowerCase().includes(word))
    );

    const contextText = relevantDocs.length > 0 
      ? relevantDocs.map(d => `- ${d.conteudo} (Fonte: ${d.url})`).join('\n')
      : "Nenhuma informação direta encontrada no ficheiro de dados.";

    // 3. System Prompt Restritivo
    const systemInstruction = `
És o assistente virtual oficial da ETPC (Escola Profissional de Carvalhos).
REGRAS OBRIGATÓRIAS:
1. Responde APENAS com base no CONTEXTO abaixo.
2. Se a informação não estiver no contexto ou for insuficiente, responde exatamente: "Não disponho de informação suficiente no site da escola para responder a essa questão."
3. Se a pergunta for sobre futebol, receitas, política ou cultura geral fora da escola, recusa educadamente indicando que apenas respondes sobre a ETPC.
4. NUNCA inventes dados nem uses conhecimento prévio fora do contexto.
5. Quando responderes com sucesso, inclui sempre no final: "Fonte: [URL]".

CONTEXTO:
${contextText}
    `;

    // 4. Chamada à API da Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Chave da API não configurada.");
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${systemInstruction}\n\nPergunta do utilizador: ${question}` }] }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Erro na API do Gemini: ${response.statusText}`);
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Não foi possível obter resposta.";

    return res.status(200).json({ reply });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ 
      reply: "O assistente está temporariamente indisponível. Por favor, tente novamente mais tarde ou consulte diretamente o site da ETPC." 
    });
  }
}