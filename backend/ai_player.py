import json
from pydantic import BaseModel, Field
from typing import Optional
from openai import OpenAI
import os

class ChessMove(BaseModel):
    reasoning: str = Field(description="Briefly explain your thought process, evaluate the board, and explain why this is the best move. Do this BEFORE deciding the move.")
    origin: str = Field(description="The starting square of the piece to move, e.g. 'e2'")
    destination: str = Field(description="The destination square to move to, e.g. 'e4'")
    promotion: Optional[str] = Field(None, description="If promoting a pawn, the piece type (e.g. 'q', 'r', 'b', 'n'). Omit otherwise.")

def get_client():
    api_key = os.getenv("OPENAI_API_KEY", "")
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    return OpenAI(api_key=api_key, base_url=base_url)

def generate_move(model_name: str, board_json: dict, history: list) -> dict:
    """
    history: a list of message dicts (role, content) for retries.
    Returns the updated history and the parsed move.
    """
    system_prompt = (
        "You are a chess master AI. "
        "You will be given the current state of a chess board, represented both as a Markdown Grid (where uppercase = White, lowercase = Black) "
        "and as a JSON list of pieces. "
        "Your task is to respond with the best valid chess move for the current turn. "
        "You MUST respond ONLY with the structured JSON output matching the schema. "
        "Use the 'reasoning' field in the schema to think through your move step-by-step to avoid invalid moves. "
        "Pay extreme attention to pieces that are pinned or protecting the King."
    )
    
    messages = [{"role": "system", "content": system_prompt}]
    
    # Base prompt with the board state
    board_prompt = (
        f"Current turn: {board_json['turn']}\n"
        f"Is in check: {board_json['in_check']}\n\n"
        f"### Board Markdown Grid ###\n{board_json['markdown_grid']}\n\n"
        f"### Pieces List ###\n{json.dumps(board_json['pieces'])}\n\n"
        f"Please provide your reasoning and move in the structured JSON format."
    )
    
    # If this is the first attempt for this turn, start fresh
    if not history:
        messages.append({"role": "user", "content": board_prompt})
    else:
        # We have a history of failed attempts for this specific turn
        messages.append({"role": "user", "content": board_prompt})
        messages.extend(history)
        
    try:
        client = get_client()
        response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "chess_move",
                    "schema": ChessMove.model_json_schema(),
                    "strict": True
                }
            },
            temperature=0.1
        )
        raw_content = response.choices[0].message.content
    except Exception as e:
        return {"move": None, "error": f"API Error: {str(e)}", "history": history, "raw_content": None}
        
    try:
        move_json = json.loads(raw_content)
        return {"move": move_json, "error": None, "history": history, "raw_content": raw_content}
    except Exception as e:
        return {"move": None, "error": f"JSON Parse Error: {str(e)}", "history": history, "raw_content": raw_content}

def get_available_models():
    try:
        client = get_client()
        models = client.models.list()
        return [m.id for m in models.data]
    except Exception as e:
        print(f"Error fetching models: {e}")
        return ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"] # Fallbacks
