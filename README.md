# AI Chess Battleground ♟️🤖

Uma plataforma premium de Xadrez desenvolvida em Python (FastAPI) e JavaScript (React/HTM) focada em **Rinhas de Inteligências Artificiais**. Jogue contra LLMs de ponta ou coloque diferentes modelos para jogar entre si em um ambiente altamente imersivo e controlado, com persistência de sessões, barra de avaliação da Stockfish e um design deslumbrante (Neo-Glassmorphism).

## 🚀 Principais Recursos

- **Arquitetura "Two-Pass" de Raciocínio (Novo!):** As IAs agora pensam antes de agir. No *Pass 1*, a IA analisa o tabuleiro e lista seus movimentos candidatos. No *Pass 2*, ela faz uma varredura de segurança (*Sanity Check*) nos candidatos para evitar pendurar peças antes de realizar o movimento final.
- **Planejamento Condicional (Pre-moves da IA):** O sistema agora permite que a IA crie planos para as próximas jogadas. Se o oponente realizar o movimento esperado, a IA responde instantaneamente usando a jogada pré-calculada, economizando tokens e tempo.
- **Design Premium Glassmorphism:** Tema noturno estiloso com blur profundo, botões neon interativos e tipografia elegante.
- **Rinhas de IAs Simultâneas:** Selecione dois Modelos de Linguagem diferentes, crie várias sessões em paralelo e deixe os jogos rodarem de forma autônoma em segundo plano (com play/pause embutido).
- **Integração Stockfish (Client-Side):** Análise em tempo real do jogo rolando diretamente no seu navegador, via Web Worker, exibindo Vantagem ou Mate na Barra de Avaliação (Eval Bar).
- **Gerenciamento de Múltiplas Sessões:** Crie, pause, e alterne entre vários jogos de xadrez em andamento sem perder o histórico. Tudo salvo magicamente em seu `localStorage`.
- **Rewind Histórico Instantâneo:** O Frontend envia um histórico contextual detalhado para as IAs, onde elas podem ler os pensamentos e o planejamento das últimas jogadas para manter uma consistência lógica durante a partida.
- **Suporte a Modelos Locais & API:** Integração robusta em formato JSON puro para ser amplamente compatível com APIs da OpenAI, Groq, OpenRouter ou modelos rodando via Ollama (Gemma, Llama, etc).

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
- Chaves de API (OpenAI, OpenRouter, Groq) ou um host local de modelos LLM rodando (ex: Ollama).

### Instalação

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/tk4500/ai-chess-game.git
   cd ai-chess-game
   ```

2. **Configure suas variáveis de ambiente:**
   Na pasta `backend/`, copie o arquivo de exemplo e crie o seu `.env`:
   ```bash
   cp backend/.env.example backend/.env
   ```
   Abra o `.env` e configure sua API base (ex: OpenAI, OpenRouter, Groq ou Local):
   ```env
   OPENAI_API_KEY=sk-or-sua-chave-aqui
   OPENAI_BASE_URL=https://openrouter.ai/api/v1
   ```

3. **Instale as dependências do Python:**
   *(Recomenda-se criar um ambiente virtual)*
   ```bash
   python -m venv venv
   source venv/bin/activate  # ou venv\Scripts\activate no Windows
   pip install -r backend/requirements.txt
   ```

4. **Inicie o Servidor:**
   ```bash
   uvicorn backend.main:app --reload
   ```

5. **Jogue:**
   Abra o seu navegador e acesse [http://localhost:8000](http://localhost:8000).

---

## 🧠 Como as IAs pensam no Back-End

Nosso backend não envia apenas o FEN cru. Ele envia à IA:
1. Uma **Grade Markdown Visual** do tabuleiro atual.
2. A lista de **Movimentos Legais Exatos**.
3. O **Histórico Completo em formato PGN**.
4. O **Contexto Detalhado das últimas N jogadas**, incluindo o motivo (*reasoning*) exato de cada IA ter feito a jogada anterior.

Além disso, nosso sistema **Two-Pass** força a IA a calcular múltiplas opções de jogadas e depois revisá-las buscando erros e ameaças óbvias antes de bater o martelo. Isso melhora drasticamente o desempenho de Modelos Menores no Xadrez.

## 🤝 Contribuições

Sinta-se à vontade para enviar um *Pull Request* ou reportar *Issues*. Todo tipo de colaboração e ideias criativas (como novas métricas para a IA ou novos modos de jogo) são super bem vindas!

---

**Desenvolvido com curiosidade, café e muito xadrez!** ♟️🔥
