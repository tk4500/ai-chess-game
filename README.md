# AI Chess Battleground ♟️🤖

Uma plataforma premium de Xadrez desenvolvida em Python (FastAPI) e JavaScript (React/HTM) focada em **Rinhas de Inteligências Artificiais**. Jogue contra LLMs de ponta ou coloque diferentes modelos para jogar entre si em um ambiente altamente imersivo e controlado, com persistência de sessões, barra de avaliação da Stockfish e um design deslumbrante (Neo-Glassmorphism).

## 🚀 Principais Recursos

- **Design Premium Glassmorphism:** Tema noturno estiloso com blur profundo, botões neon interativos e tipografia elegante.
- **Rinhas de IAs (AI vs AI):** Selecione dois Modelos de Linguagem diferentes e observe-os calcular os lances.
- **Integração Stockfish (Client-Side):** Análise em tempo real do jogo rolando diretamente no seu navegador, via Web Worker, exibindo Vantagem ou Mate na Barra de Avaliação (Eval Bar).
- **Gerenciamento de Múltiplas Sessões:** Crie, pause, e alterne entre vários jogos de xadrez em andamento sem perder o histórico. Tudo salvo magicamente em seu `localStorage`.
- **Rewind Histórico Instantâneo:** Clique em qualquer momento do Histórico da Partida para voltar exatamente para aquela posição no tabuleiro e retomar a IA a partir daquele ponto.
- **Suporte a Modelos Locais & API:** Extração robusta de JSONs para lidar com as falhas e "tagarelice" de modelos menores (como o Gemma) rodando via Ollama ou OpenRouter.

---

## 🛠️ Tecnologias Utilizadas

**Backend:**
- Python 3.12+
- FastAPI & Uvicorn (Para o Servidor de API super rápido e assíncrono)
- `python-chess` (Validação rigorosa do tabuleiro e representação do jogo)
- Pydantic & OpenAI SDK (Para lidar e estruturar chamadas de LLM local/nuvem)

**Frontend:**
- HTM & React (Sem necessidade de Build Step, servido estaticamente)
- `react-chessboard` (Tabuleiro interativo para React)
- `chess.js` (Lógica e validação no navegador)
- Stockfish.js 10.0.2 (Engine rodando totalmente no navegador via Blob Worker)
- Vanilla CSS para o design Neo-Glassmorphism

---

## 💻 Como Rodar o Projeto

### Pré-requisitos
- Python 3.12 ou superior instalado.
- Chaves de API (OpenAI, OpenRouter) ou um host local de modelos LLM rodando (ex: Ollama).

### Instalação

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/tk4500/ai-chess-game.git
   cd ai-chess-game
   ```

2. **Crie um arquivo `.env`** na pasta `backend/` com suas configurações de API. Você pode usar o `.env.example` como base:
   ```env
   OPENAI_API_KEY=sk-or-sua-chave-aqui
   OPENAI_BASE_URL=https://openrouter.ai/api/v1
   ```

3. **Instale as dependências do Python:**
   *(Recomenda-se criar um ambiente virtual)*
   ```bash
   pip install -r backend/requirements.txt
   ```

4. **Inicie o Servidor:**
   ```bash
   uvicorn backend.main:app --reload
   ```

5. **Jogue:**
   Abra o seu navegador e acesse [http://localhost:8000](http://localhost:8000).

---

## 🧠 Como as IAs funcionam no Back-End

Em vez de depender apenas de representações matemáticas obscuras como o formato *FEN*, nosso backend constrói uma **Grade Markdown Visual do Tabuleiro** e uma lista de **Movimentos Legais Específicos**, entregando de bandeja para os modelos de Linguagem. Isso permite um Raciocínio (Chain of Thought) muito maior, evitando que a IA "invente" um movimento impossível, além de extrair as jogadas via Regex robusta no backend, permitindo integrar LLMs que adoram tagarelar.

## 🤝 Contribuições

Sinta-se à vontade para enviar um *Pull Request* ou reportar *Issues*. Todo tipo de colaboração e ideias criativas (como novas métricas para a IA) são super bem vindas!

---

**Desenvolvido com curiosidade, café e muito xadrez!** ♟️🔥
