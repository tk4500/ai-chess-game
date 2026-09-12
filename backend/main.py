from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import chess
import os
from dotenv import load_dotenv

from backend.engine import get_board_state_json, try_move
from backend.ai_player import generate_move, get_available_models

env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path=env_path)

app = FastAPI()

# Allow CORS for local frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend"))
app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

@app.get("/")
def read_root():
    return FileResponse(os.path.join(frontend_dir, "index.html"))

class MoveRequest(BaseModel):
    fen: str
    model: str
    history_san: Optional[List[str]] = []

class MoveResponse(BaseModel):
    success: bool
    fen: str
    move: Optional[dict] = None
    error: Optional[str] = None
    retries: int = 0

@app.get("/api/models")
def list_models():
    models = get_available_models()
    return {"models": models}

@app.post("/api/move", response_model=MoveResponse)
def ai_make_move(request: MoveRequest):
    try:
        board = chess.Board(request.fen)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid FEN string")

    if board.is_game_over():
        return MoveResponse(success=False, fen=board.fen(), error="Game is already over")

    board_json = get_board_state_json(board)
    history = []
    max_retries = 5
    
    for attempt in range(max_retries):
        result = generate_move(request.model, board_json, history, request.history_san)
        if result["error"]:
            if "JSON Parse Error" in result["error"]:
                raw = result.get("raw_content", "")
                history.append({"role": "assistant", "content": raw})
                history.append({"role": "user", "content": "You did not output valid JSON. Please respond with ONLY a valid JSON object. Do not include markdown formatting or extra text."})
                continue
            else:
                return MoveResponse(success=False, fen=board.fen(), error=f"AI generation failed: {result['error']}", retries=attempt)
        
        ai_move = result["move"]
        
        # Defensive parsing: If the model wrapped the response in a "move" object, unwrap it
        if ai_move and "move" in ai_move and isinstance(ai_move["move"], dict):
            actual_move = ai_move["move"]
            if "reasoning" in ai_move:
                actual_move["reasoning"] = ai_move["reasoning"]
            ai_move = actual_move
            
        if not ai_move or "origin" not in ai_move or "destination" not in ai_move:
             history.append({"role": "assistant", "content": "Failed to output structured JSON."})
             history.append({"role": "user", "content": "You must respond with the structured JSON output containing origin and destination."})
             continue
             
        origin = ai_move["origin"]
        dest = ai_move["destination"]
        promotion = ai_move.get("promotion")
        
        is_valid, error_msg = try_move(board, origin, dest, promotion)
        if is_valid:
            return MoveResponse(success=True, fen=board.fen(), move=ai_move, retries=attempt)
        else:
            # Move was invalid, append to history
            history.append({"role": "assistant", "content": str(ai_move)})
            history.append({"role": "user", "content": f"Invalid move: {error_msg}. Try again."})
            
    return MoveResponse(success=False, fen=board.fen(), error="Max retries reached. AI failed to provide a valid move.", retries=max_retries)
