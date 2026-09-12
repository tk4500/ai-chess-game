import os
import json
import re
from openai import OpenAI
from pydantic import BaseModel, Field
from typing import Optional, List
from openai import OpenAI
import os

class PlanStep(BaseModel):
    if_opponent_plays: str = Field(description="The SAN notation of the move you expect the opponent to play (e.g. 'e5', 'Nf3')")
    then_i_play_origin: str = Field(description="Your planned response origin square (e.g. 'e4')")
    then_i_play_destination: str = Field(description="Your planned response destination square (e.g. 'e5')")
    then_i_play_promotion: Optional[str] = Field(None, description="Promotion piece, e.g. 'q', 'r', 'b', 'n' or null")

class ChessMove(BaseModel):
    reasoning: str = Field(description="Your thoughts behind this move, strategy, and analysis of the opponent's last move")
    origin: str = Field(description="The starting square of your move (e.g., 'e2')")
    destination: str = Field(description="The ending square of your move (e.g., 'e4')")
    promotion: Optional[str] = Field(None, description="Promotion piece, e.g. 'q', 'r', 'b', 'n' or null")
    plan: Optional[List[PlanStep]] = Field(None, description="Optional. Plan your next moves! If the opponent plays a specific move (if_opponent_plays), you can automatically execute a response. Leave null if unsure.")

def get_client():
    api_key = os.getenv("OPENAI_API_KEY", "")
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    return OpenAI(api_key=api_key, base_url=base_url)

def generate_move(model_name: str, board_json: dict, history: list, history_san: list = None) -> dict:
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
    
    # Format recent history to limit to ~5 last thoughts
    history_text = "No moves made yet."
    if history_san:
        # history_san might contain dicts like {'san': 'e4', 'reasoning': '...'} or just strings
        # We need to adapt it. If it's a list of dicts, we extract it.
        # Let's assume the frontend sends a list of strings or we format it beforehand.
        recent_moves = history_san[-5:]  # Last 5 moves
        history_text = "\n".join(recent_moves)
        
    board_prompt = (
        f"Current turn: {board_json['turn']}\n"
        f"Is in check: {board_json['in_check']}\n\n"
        f"### Recent Match History (Last 5 moves & thoughts) ###\n"
        f"{history_text}\n\n"
        f"### Legal Moves Available ###\n"
        f"You MUST choose one of the following exact moves:\n"
        f"{json.dumps(board_json['legal_moves'])}\n\n"
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
        
        # Check if the content is returned
        if not response.choices[0].message.content:
            print(f"[{model_name}] AI returned empty content.")
            return {"move": None, "error": "AI returned empty content", "raw_content": ""}
            
        raw_content = response.choices[0].message.content
        print(f"\n--- AI RESPONSE ({model_name}) ---\n{raw_content}\n-----------------------------\n")
        
        try:
            # Robustly extract JSON block even if the model added conversational text before or after
            match = re.search(r'\{.*\}', raw_content, re.DOTALL)
            if match:
                json_str = match.group(0)
            else:
                json_str = raw_content
                
            move_data = json.loads(json_str)
            return {"move": move_data, "error": None, "raw_content": raw_content}
        except json.JSONDecodeError as e:
            print(f"[{model_name}] JSON Parse Error: {str(e)}")
            return {"move": None, "error": f"JSON Parse Error: {str(e)}", "raw_content": raw_content}
            
    except Exception as e:
        print(f"[{model_name}] API Error: {str(e)}")
        return {"move": None, "error": str(e), "raw_content": ""}

def get_available_models():
    try:
        client = get_client()
        models = client.models.list()
        return [m.id for m in models.data]
    except Exception as e:
        print(f"Error fetching models: {e}")
        return ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"] # Fallbacks
