import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import htm from "htm";

const html = htm.bind(React.createElement);

const STORAGE_KEY = "ai_chess_games";

// Utility to generate a unique ID
const generateId = () => Math.random().toString(36).substr(2, 9);

function App() {
  const [games, setGames] = useState({});
  const [activeGameId, setActiveGameId] = useState(null);
  
  const [game, setGame] = useState(() => new Chess());
  const [models, setModels] = useState([]);
  const [whitePlayer, setWhitePlayer] = useState("Human");
  const [blackPlayer, setBlackPlayer] = useState("Human");
  const [historyItems, setHistoryItems] = useState([]);
  const [fenHistory, setFenHistory] = useState([new Chess().fen()]);
  const [status, setStatus] = useState("Game started.");
  
  const [isThinking, setIsThinking] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Stockfish State
  const [evalScore, setEvalScore] = useState(0); // centipawns or mate string
  const [bestMove, setBestMove] = useState("-");
  const workerRef = useRef(null);

  // 1. Initialize Application & Stockfish
  useEffect(() => {
    // Fetch available models
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        if (data.models) setModels(data.models);
      })
      .catch((err) => console.error("Failed to load models", err));

    // Initialize Stockfish Web Worker via Blob to avoid CORS
    const stockfishCode = `importScripts("https://unpkg.com/stockfish.js@10.0.2/stockfish.js");`;
    const blob = new Blob([stockfishCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    
    worker.onmessage = (e) => {
        const line = e.data;
        if (typeof line !== 'string') return;
        
        // Parse evaluation
        if (line.startsWith("info depth") && line.includes("score")) {
            const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
            if (scoreMatch) {
                const type = scoreMatch[1];
                let value = parseInt(scoreMatch[2], 10);
                
                // If it's black's turn, stockfish returns score from black's perspective, so we negate it
                // Wait, stockfish returns score from the perspective of the side to move
                // Let's rely on the FEN to know whose turn it was when we sent it
                // But it's easier to just assume stockfish outputs for side to move.
                // We will handle negation when setting if needed. Actually standard UCI is from engine's perspective.
                // We'll just store it raw and adjust in render.
                setEvalScore({ type, value });
            }
        }
        // Parse bestmove
        if (line.startsWith("bestmove")) {
            const move = line.split(" ")[1];
            setBestMove(move);
        }
    };
    workerRef.current = worker;
    worker.postMessage("uci");
    
    // Load from LocalStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    let loadedGames = {};
    let initialActiveId = null;
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.games && Object.keys(parsed.games).length > 0) {
            loadedGames = parsed.games;
            initialActiveId = parsed.activeGameId || Object.keys(parsed.games)[0];
        }
      } catch (e) {
        console.error("Failed to parse games", e);
      }
    }
    
    // If no games, create default
    if (Object.keys(loadedGames).length === 0) {
        const id = generateId();
        initialActiveId = id;
        loadedGames[id] = {
            name: `Jogo - ${new Date().toLocaleString()}`,
            whitePlayer: "Human",
            blackPlayer: "Human",
            historyItems: [],
            fenHistory: [new Chess().fen()]
        };
    }
    
    setGames(loadedGames);
    loadGameIntoState(loadedGames[initialActiveId]);
    setActiveGameId(initialActiveId);
    setIsLoaded(true);
    
    return () => {
        if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  const loadGameIntoState = (g) => {
      setWhitePlayer(g.whitePlayer);
      setBlackPlayer(g.blackPlayer);
      setHistoryItems(g.historyItems || []);
      setFenHistory(g.fenHistory || [new Chess().fen()]);
      setGame(new Chess(g.fenHistory[g.fenHistory.length - 1]));
      setIsPaused(true);
      setBestMove("-");
      setEvalScore({ type: 'cp', value: 0 });
  };

  // Save current game state back to `games` object and localStorage whenever it changes
  useEffect(() => {
    if (!isLoaded || !activeGameId) return;
    
    setGames((prev) => {
        const updatedGames = { ...prev };
        if (updatedGames[activeGameId]) {
            updatedGames[activeGameId] = {
                ...updatedGames[activeGameId],
                whitePlayer,
                blackPlayer,
                historyItems,
                fenHistory
            };
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeGameId, games: updatedGames }));
        return updatedGames;
    });
    
    checkGameOver();
    
    // Trigger Stockfish Analysis
    if (workerRef.current && !game.isGameOver()) {
        workerRef.current.postMessage("stop");
        workerRef.current.postMessage(`position fen ${game.fen()}`);
        workerRef.current.postMessage("go depth 12");
    }
  }, [whitePlayer, blackPlayer, historyItems, fenHistory, isLoaded]);

  const switchGame = (id) => {
      if (games[id]) {
          setActiveGameId(id);
          loadGameIntoState(games[id]);
      }
  };

  const createNewGame = () => {
      const name = prompt("Nome do Jogo:", `Jogo - ${new Date().toLocaleString()}`);
      if (!name) return;
      
      const id = generateId();
      const newGame = {
          name,
          whitePlayer: "Human",
          blackPlayer: "Human",
          historyItems: [],
          fenHistory: [new Chess().fen()]
      };
      
      setGames(prev => ({ ...prev, [id]: newGame }));
      setActiveGameId(id);
      loadGameIntoState(newGame);
  };

  const deleteGame = (id) => {
      if (!confirm("Tem certeza que deseja apagar este jogo?")) return;
      setGames(prev => {
          const newGames = { ...prev };
          delete newGames[id];
          
          if (Object.keys(newGames).length === 0) {
              // Create an empty one if all are deleted
              setTimeout(createNewGame, 0); 
          } else if (activeGameId === id) {
              const nextId = Object.keys(newGames)[0];
              setActiveGameId(nextId);
              loadGameIntoState(newGames[nextId]);
          }
          
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeGameId: activeGameId === id ? Object.keys(newGames)[0] : activeGameId, games: newGames }));
          return newGames;
      });
  };

  const makeMove = (move, playerModel) => {
    try {
      const result = game.move(move);
      if (result) {
        const newFen = game.fen();
        setGame(new Chess(newFen));
        
        setHistoryItems((prev) => [...prev, {
            san: result.san,
            color: result.color === 'w' ? 'White' : 'Black',
            model: playerModel
        }]);
        setFenHistory((prev) => [...prev, newFen]);
      }
      return result;
    } catch (e) {
      return null;
    }
  };

  const checkGameOver = () => {
    // If we have an active error, don't overwrite it immediately with "Paused"
    setStatus(prevStatus => {
        if (prevStatus.includes("Error") && isPaused) return prevStatus;
        
        if (game.isCheckmate()) {
          return `Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} wins!`;
        } else if (game.isDraw()) {
          return "Draw!";
        } else {
          return game.isCheck() ? "Check!" : (isPaused ? "Paused" : "Playing...");
        }
    });
  };

  const onDrop = (sourceSquare, targetSquare, piece) => {
    if (isThinking) return false;
    
    const isWhiteTurn = game.turn() === 'w';
    if (isWhiteTurn && whitePlayer !== "Human") return false;
    if (!isWhiteTurn && blackPlayer !== "Human") return false;

    const move = makeMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: piece[1].toLowerCase() ?? "q",
    }, "Human");

    return move !== null;
  };

  // Trigger AI moves
  useEffect(() => {
    if (!isLoaded || game.isGameOver() || isPaused) {
        checkGameOver();
        return;
    }
    
    const isWhiteTurn = game.turn() === 'w';
    const currentPlayer = isWhiteTurn ? whitePlayer : blackPlayer;

    if (currentPlayer !== "Human" && !isThinking) {
      setIsThinking(true);
      setStatus(`AI (${currentPlayer}) is thinking...`);

      fetch("/api/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: game.fen(), model: currentPlayer }),
      })
        .then((res) => res.json())
        .then((data) => {
          setIsThinking(false);
          if (data.success) {
            const m = makeMove({
              from: data.move.origin,
              to: data.move.destination,
              promotion: data.move.promotion || undefined
            }, currentPlayer);
            
            if(!m) {
                 const newFen = data.fen;
                 setGame(new Chess(newFen)); 
                 setHistoryItems((prev) => [...prev, { san: `Forced: ${data.move.origin}->${data.move.destination}`, color: isWhiteTurn ? 'White':'Black', model: currentPlayer }]);
                 setFenHistory((prev) => [...prev, newFen]);
            }
          } else {
            setStatus(`AI Error: ${data.error}`);
            setIsPaused(true);
          }
        })
        .catch((err) => {
          setIsThinking(false);
          setStatus(`Network Error: ${err}`);
          setIsPaused(true);
        });
    }
  }, [game.fen(), whitePlayer, blackPlayer, isThinking, isPaused, isLoaded]);

  const resetGame = () => {
    if(!confirm("Resetar o tabuleiro atual?")) return;
    const initialFen = new Chess().fen();
    setGame(new Chess());
    setHistoryItems([]);
    setFenHistory([initialFen]);
    setStatus("Game started.");
    setIsThinking(false);
    setIsPaused(true);
  };

  const handlePlayerChange = (setter) => (e) => {
    setter(e.target.value);
    setIsPaused(true); 
  };

  const rewindToTurn = (index) => {
    const targetFen = fenHistory[index];
    setGame(new Chess(targetFen));
    setHistoryItems(historyItems.slice(0, index));
    setFenHistory(fenHistory.slice(0, index + 1));
    setIsPaused(true);
    setIsThinking(false);
  };

  // Eval bar calculations
  let fillPercentage = 50;
  let evalText = "0.0";
  
  if (evalScore) {
      const isWhiteTurn = game.turn() === 'w';
      
      if (evalScore.type === 'mate') {
          // Mate in X
          const mateIn = evalScore.value;
          // If mateIn is positive, side to move is winning
          fillPercentage = (isWhiteTurn && mateIn > 0) || (!isWhiteTurn && mateIn < 0) ? 100 : 0;
          evalText = `M${Math.abs(mateIn)}`;
      } else {
          // Centipawns
          let cp = evalScore.value;
          // stockfish returns score relative to the side to move
          if (!isWhiteTurn) cp = -cp; 
          
          evalText = (cp / 100).toFixed(1);
          if (cp > 0) evalText = "+" + evalText;
          
          // Map -1000 to +1000 into 0% to 100% logarithmically or linearly
          // Cap at +/- 10 pawns
          const cappedCp = Math.max(-1000, Math.min(1000, cp));
          fillPercentage = 50 + (cappedCp / 20); // 1000cp / 20 = 50 -> 100%
      }
  }

  if (!isLoaded) return html`<div>Loading...</div>`;

  return html`
    <div className="sidebar">
        <h2>Meus Jogos</h2>
        <button onClick=${createNewGame} className="btn-green" style=${{ marginBottom: '1rem' }}>+ Novo Jogo</button>
        
        <div style=${{ flex: 1, overflowY: 'auto' }}>
            ${Object.keys(games).map(id => html`
                <div key=${id} className=${`game-item ${id === activeGameId ? 'active' : ''}`} onClick=${() => switchGame(id)}>
                    <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ${games[id].name}
                    </span>
                    <button className="delete-btn" title="Apagar Jogo" onClick=${(e) => { e.stopPropagation(); deleteGame(id); }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>
            `)}
        </div>
    </div>
    
    <div className="main-content">
      <div className="container">
        
        <div className="board-section">
            <div className="eval-bar-container">
                <div className="eval-text-overlay top">${fillPercentage < 50 ? evalText : ""}</div>
                <div className="eval-bar-fill" style=${{ height: `${fillPercentage}%` }}></div>
                <div className="eval-text-overlay bottom" style=${{ color: '#333' }}>${fillPercentage >= 50 ? evalText : ""}</div>
            </div>
            
            <div className="board-container">
              <${Chessboard} 
                  position=${game.fen()} 
                  onPieceDrop=${onDrop}
                  boardOrientation=${whitePlayer === 'Human' || (whitePlayer !== 'Human' && blackPlayer !== 'Human') ? 'white' : 'black'}
              />
            </div>
        </div>
        
        <div className="panel">
          
          <div className="engine-info">
             <strong>Stockfish Avaliação:</strong> ${evalScore.type === 'mate' ? `Mate em ${Math.abs(evalScore.value)}` : `${evalText} pontos`} <br/>
             <strong>Melhor Lance:</strong> ${bestMove}
          </div>
          
          <div className="form-group">
            <label>Brancas:</label>
            <select value=${whitePlayer} onChange=${handlePlayerChange(setWhitePlayer)}>
              <option value="Human">Humano</option>
              ${models.map(m => html`<option key=${m} value=${m}>${m}</option>`)}
            </select>
          </div>
  
          <div className="form-group">
            <label>Pretas:</label>
            <select value=${blackPlayer} onChange=${handlePlayerChange(setBlackPlayer)}>
              <option value="Human">Humano</option>
              ${models.map(m => html`<option key=${m} value=${m}>${m}</option>`)}
            </select>
          </div>
  
          <div style=${{ display: 'flex', gap: '10px' }}>
              <button 
                  onClick=${() => setIsPaused(!isPaused)}
                  className=${isPaused ? 'btn-green' : 'btn-orange'}
                  style=${{ flex: 1 }}
              >
                  ${isPaused ? "▶ Iniciar / Continuar IA" : "⏸ Pausar IA"}
              </button>
              <button onClick=${resetGame} className="btn-red" style=${{ flex: 1 }}>
                  Resetar Tabuleiro
              </button>
          </div>
  
          <div className=${`status ${status.includes("Error") ? 'error' : (status.includes("Check") ? 'success' : '')}`}>
            Status: ${status}
          </div>
  
          <div className="history">
            ${historyItems.length === 0 ? "Sem jogadas ainda." : historyItems.map((item, i) => html`
              <div 
                  key=${i} 
                  className="history-item"
                  onClick=${() => rewindToTurn(i)} 
                  title="Clique para voltar no tempo antes deste turno"
              >
                  <strong>${i+1}. ${item.color}:</strong> ${item.san} 
                  <span className="model-badge">${item.model}</span>
              </div>
            `)}
          </div>
        </div>
      </div>
    </div>
  `;
}

const root = createRoot(document.getElementById("root"));
root.render(html`<${App} />`);
