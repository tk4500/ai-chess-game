import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import htm from "htm";

const html = htm.bind(React.createElement);

const STORAGE_KEY = "ai_chess_games";

const generateId = () => Math.random().toString(36).substr(2, 9);

function App() {
  const [games, setGames] = useState({});
  const [activeGameId, setActiveGameId] = useState(null);
  const [models, setModels] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Stockfish State (Only for active game UI)
  const [evalScore, setEvalScore] = useState(0); 
  const [bestMove, setBestMove] = useState("-");
  const workerRef = useRef(null);

  // Initialize
  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        if (data.models) setModels(data.models);
      })
      .catch((err) => console.error("Failed to load models", err));

    const stockfishCode = `importScripts("https://unpkg.com/stockfish.js@10.0.2/stockfish.js");`;
    const blob = new Blob([stockfishCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    
    worker.onmessage = (e) => {
        const line = e.data;
        if (typeof line !== 'string') return;
        
        if (line.startsWith("info depth") && line.includes("score")) {
            const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
            if (scoreMatch) {
                setEvalScore({ type: scoreMatch[1], value: parseInt(scoreMatch[2], 10) });
            }
        }
        if (line.startsWith("bestmove")) {
            setBestMove(line.split(" ")[1]);
        }
    };
    workerRef.current = worker;
    worker.postMessage("uci");
    
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
    
    if (Object.keys(loadedGames).length === 0) {
        const id = generateId();
        initialActiveId = id;
        loadedGames[id] = {
            name: `Jogo - ${new Date().toLocaleString()}`,
            whitePlayer: "Human",
            blackPlayer: "Human",
            historyItems: [],
            fenHistory: [new Chess().fen()],
            isPaused: true,
            status: "Game started.",
            isThinking: false,
            plan: null
        };
    } else {
        // Ensure legacy games have the new fields
        Object.keys(loadedGames).forEach(id => {
            if (loadedGames[id].isPaused === undefined) loadedGames[id].isPaused = true;
            if (loadedGames[id].status === undefined) loadedGames[id].status = "Loaded";
            loadedGames[id].isThinking = false;
        });
    }
    
    setGames(loadedGames);
    setActiveGameId(initialActiveId);
    setIsLoaded(true);
    
    return () => {
        if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  const activeGame = games[activeGameId] || null;
  const activeChess = activeGame ? new Chess(activeGame.fenHistory[activeGame.fenHistory.length - 1]) : null;

  // Stockfish analysis for active game
  useEffect(() => {
    if (workerRef.current && activeChess && !activeChess.isGameOver()) {
        workerRef.current.postMessage("stop");
        workerRef.current.postMessage(`position fen ${activeChess.fen()}`);
        workerRef.current.postMessage("go depth 12");
    }
  }, [activeGame?.fenHistory]);

  const updateGame = (id, updates) => {
      setGames(prev => {
          const newGames = { ...prev, [id]: { ...prev[id], ...updates } };
          // We can't use prev.activeGameId because prev is just the games object.
          // We rely on the closure's activeGameId, which is mostly fine for active game updates,
          // but to be absolutely safe, we can fetch it from localStorage or just use the closure's activeGameId.
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeGameId, games: newGames }));
          return newGames;
      });
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
          fenHistory: [new Chess().fen()],
          isPaused: true,
          status: "Game started.",
          isThinking: false,
          plan: null
      };
      
      setGames(prev => {
          const newGames = { ...prev, [id]: newGame };
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeGameId: id, games: newGames }));
          return newGames;
      });
      setActiveGameId(id);
  };

  const deleteGame = (id) => {
      if (!confirm("Tem certeza que deseja apagar este jogo?")) return;
      setGames(prev => {
          const newGames = { ...prev };
          delete newGames[id];
          
          let nextActive = activeGameId;
          if (Object.keys(newGames).length === 0) {
              setTimeout(createNewGame, 0);
          } else if (activeGameId === id) {
              nextActive = Object.keys(newGames)[0];
              setActiveGameId(nextActive);
          }
          
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeGameId: nextActive, games: newGames }));
          return newGames;
      });
  };

  const togglePause = (id) => {
      setGames(prev => {
          const g = prev[id];
          if (!g) return prev;
          const newGames = { ...prev, [id]: { ...g, isPaused: !g.isPaused, status: !g.isPaused ? "Paused" : "Playing..." } };
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeGameId, games: newGames }));
          return newGames;
      });
  };

  const onDrop = (sourceSquare, targetSquare, piece) => {
    if (!activeGame || activeGame.isThinking || activeGame.isPaused) return false;
    
    const isWhiteTurn = activeChess.turn() === 'w';
    if (isWhiteTurn && activeGame.whitePlayer !== "Human") return false;
    if (!isWhiteTurn && activeGame.blackPlayer !== "Human") return false;

    const move = {
      from: sourceSquare,
      to: targetSquare,
      promotion: piece[1].toLowerCase() ?? "q",
    };

    try {
        const result = activeChess.move(move);
        if (result) {
            updateGame(activeGameId, {
                historyItems: [...activeGame.historyItems, {
                    san: result.san,
                    color: result.color === 'w' ? 'White' : 'Black',
                    model: "Human",
                    reasoning: null
                }],
                fenHistory: [...activeGame.fenHistory, activeChess.fen()]
            });
            return true;
        }
    } catch(e) {}
    return false;
  };

  const resetGame = () => {
    if(!confirm("Resetar o tabuleiro atual?")) return;
    updateGame(activeGameId, {
        historyItems: [],
        fenHistory: [new Chess().fen()],
        status: "Game started.",
        isThinking: false,
        isPaused: true,
        plan: null
    });
  };

  const rewindToTurn = (index) => {
    if (!activeGame) return;
    updateGame(activeGameId, {
        historyItems: activeGame.historyItems.slice(0, index),
        fenHistory: activeGame.fenHistory.slice(0, index + 1),
        isPaused: true,
        isThinking: false,
        plan: null
    });
  };

  // BACKGROUND GAME LOOP
  useEffect(() => {
      if (!isLoaded) return;
      const interval = setInterval(() => {
          setGames(prevGames => {
              let updated = false;
              const nextGames = { ...prevGames };
              
              Object.keys(nextGames).forEach(id => {
                  const g = nextGames[id];
                  if (g.isPaused || g.isThinking || (g.status && g.status.includes("Error"))) return;
                  
                  const chess = new Chess(g.fenHistory[g.fenHistory.length - 1]);
                  if (chess.isGameOver()) {
                      if (!g.status.includes("Checkmate") && !g.status.includes("Draw")) {
                          let overStatus = chess.isCheckmate() ? `Checkmate! ${chess.turn() === 'w' ? 'Black' : 'White'} wins!` : "Draw!";
                          nextGames[id] = { ...g, status: overStatus };
                          updated = true;
                      }
                      return;
                  }
                  
                  const isWhiteTurn = chess.turn() === 'w';
                  const currentPlayer = isWhiteTurn ? g.whitePlayer : g.blackPlayer;
                  if (currentPlayer === "Human") return; 

                  // Check for conditional plan execution
                  let executedPlan = false;
                  if (g.plan && Array.isArray(g.plan) && g.plan.length > 0) {
                      const lastMove = g.historyItems[g.historyItems.length - 1]; // Opponent's last move
                      const planStep = g.plan[0]; // Currently considering just 1 step lookahead
                      
                      if (lastMove && planStep && lastMove.san === planStep.if_opponent_plays) {
                          const moveObj = {
                              from: planStep.then_i_play_origin,
                              to: planStep.then_i_play_destination,
                              promotion: planStep.then_i_play_promotion || undefined
                          };
                          try {
                              const result = chess.move(moveObj);
                              if (result) {
                                  nextGames[id] = {
                                      ...g,
                                      historyItems: [...g.historyItems, {
                                          san: result.san,
                                          color: isWhiteTurn ? 'White' : 'Black',
                                          model: currentPlayer,
                                          reasoning: "⚡ Pré-Move Condicional Executado! (O oponente fez exatamente o que eu esperava: " + lastMove.san + ")"
                                      }],
                                      fenHistory: [...g.fenHistory, chess.fen()],
                                      plan: null // consume plan
                                  };
                                  updated = true;
                                  executedPlan = true;
                              }
                          } catch (e) {
                              console.warn("Invalid planned move", e);
                          }
                      }
                  }

                  if (!executedPlan) {
                      nextGames[id] = { ...g, isThinking: true, status: `AI (${currentPlayer}) is thinking...`, plan: null };
                      updated = true;
                      
                      fetch("/api/move", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ 
                              fen: chess.fen(), 
                              model: currentPlayer, 
                              history_san: g.historyItems.map(h => `${h.color} (${h.model}): ${h.san} - Reasoning: ${h.reasoning || 'N/A'}`) 
                          }),
                      })
                      .then(res => res.json())
                      .then(data => {
                          setGames(currGames => {
                              const currG = currGames[id];
                              if (!currG) return currGames;
                              
                              const currChess = new Chess(currG.fenHistory[currG.fenHistory.length - 1]);
                              
                              if (data.success) {
                                  try {
                                      const m = currChess.move({
                                          from: data.move.origin,
                                          to: data.move.destination,
                                          promotion: data.move.promotion || undefined
                                      });
                                      if (m) {
                                          return {
                                              ...currGames,
                                              [id]: {
                                                  ...currG,
                                                  isThinking: false,
                                                  status: "Playing...",
                                                  historyItems: [...currG.historyItems, {
                                                      san: m.san,
                                                      color: isWhiteTurn ? 'White' : 'Black',
                                                      model: currentPlayer,
                                                      reasoning: data.move.reasoning
                                                  }],
                                                  fenHistory: [...currG.fenHistory, currChess.fen()],
                                                  plan: data.move.plan || null
                                              }
                                          };
                                      } else {
                                          throw new Error("Invalid move returned");
                                      }
                                  } catch (e) {
                                       // Fallback for forced move if chess.js rejects it but engine says it's legal?
                                       // Better to just throw error to prevent desync
                                       return { ...currGames, [id]: { ...currG, isThinking: false, status: `AI Move Error: ${e.message}`, isPaused: true } };
                                  }
                              } else {
                                  return { ...currGames, [id]: { ...currG, isThinking: false, status: `AI Error: ${data.error}`, isPaused: true } };
                              }
                          });
                      }).catch(err => {
                          setGames(cg => ({ ...cg, [id]: { ...cg[id], isThinking: false, status: `Network Error: ${err}`, isPaused: true } }));
                      });
                  }
              });
              
              if (updated) {
                  localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeGameId: prevGames.activeGameId, games: nextGames }));
                  return nextGames;
              }
              return prevGames;
          });
      }, 700); // Poll every 700ms
      return () => clearInterval(interval);
  }, [isLoaded]);

  if (!isLoaded || !activeGame) return html`<div>Loading...</div>`;

  // Eval bar calculations
  let fillPercentage = 50;
  let evalText = "0.0";
  
  if (evalScore) {
      const isWhiteTurn = activeChess.turn() === 'w';
      if (evalScore.type === 'mate') {
          const mateIn = evalScore.value;
          fillPercentage = (isWhiteTurn && mateIn > 0) || (!isWhiteTurn && mateIn < 0) ? 100 : 0;
          evalText = `M${Math.abs(mateIn)}`;
      } else {
          let cp = evalScore.value;
          if (!isWhiteTurn) cp = -cp; 
          evalText = (cp / 100).toFixed(1);
          if (cp > 0) evalText = "+" + evalText;
          const cappedCp = Math.max(-1000, Math.min(1000, cp));
          fillPercentage = 50 + (cappedCp / 20); 
      }
  }

  return html`
    <div className="sidebar">
        <h2>Meus Jogos</h2>
        <button onClick=${createNewGame} className="btn-green" style=${{ marginBottom: '1rem' }}>+ Novo Jogo</button>
        
        <div style=${{ flex: 1, overflowY: 'auto' }}>
            ${Object.keys(games).map(id => html`
                <div key=${id} className=${`game-item ${id === activeGameId ? 'active' : ''}`} onClick=${() => setActiveGameId(id)}>
                    <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        ${games[id].name}
                    </span>
                    <div style=${{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <button className="play-btn" onClick=${(e) => { e.stopPropagation(); togglePause(id); }} title=${games[id].isPaused ? "Play" : "Pause"} style=${{ background: 'transparent', border: 'none', cursor: 'pointer', color: games[id].isPaused ? '#94a3b8' : '#10b981', padding: '0 4px', fontSize: '1.2rem' }}>
                            ${games[id].isPaused ? "▶" : "⏸"}
                        </button>
                        <button className="delete-btn" title="Apagar Jogo" onClick=${(e) => { e.stopPropagation(); deleteGame(id); }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
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
                  position=${activeChess.fen()} 
                  onPieceDrop=${onDrop}
                  boardOrientation=${activeGame.whitePlayer === 'Human' || (activeGame.whitePlayer !== 'Human' && activeGame.blackPlayer !== 'Human') ? 'white' : 'black'}
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
            <select value=${activeGame.whitePlayer} onChange=${e => updateGame(activeGameId, { whitePlayer: e.target.value, isPaused: true })}>
              <option value="Human">Humano</option>
              ${models.map(m => html`<option key=${m} value=${m}>${m}</option>`)}
            </select>
          </div>
  
          <div className="form-group">
            <label>Pretas:</label>
            <select value=${activeGame.blackPlayer} onChange=${e => updateGame(activeGameId, { blackPlayer: e.target.value, isPaused: true })}>
              <option value="Human">Humano</option>
              ${models.map(m => html`<option key=${m} value=${m}>${m}</option>`)}
            </select>
          </div>
  
          <div style=${{ display: 'flex', gap: '10px' }}>
              <button 
                  onClick=${() => togglePause(activeGameId)}
                  className=${activeGame.isPaused ? 'btn-green' : 'btn-orange'}
                  style=${{ flex: 1 }}
              >
                  ${activeGame.isPaused ? "▶ Iniciar / Continuar IA" : "⏸ Pausar IA"}
              </button>
              <button onClick=${resetGame} className="btn-red" style=${{ flex: 1 }}>
                  Resetar Tabuleiro
              </button>
          </div>
  
          <div className=${`status ${activeGame.status.includes("Error") ? 'error' : (activeGame.status.includes("Check") ? 'success' : '')}`}>
            Status: ${activeGame.status}
          </div>
  
          <div className="history">
            ${activeGame.historyItems.length === 0 ? "Sem jogadas ainda." : activeGame.historyItems.map((item, i) => html`
              <div 
                  key=${i} 
                  className="history-item"
                  onClick=${() => rewindToTurn(i)} 
                  title=${item.reasoning ? `[${item.model}] Raciocínio:\n${item.reasoning}\n\n(Clique para voltar)` : "Clique para voltar no tempo antes deste turno"}
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
