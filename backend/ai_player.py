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

def generate_move(model_name: str, board_json: dict, history: list, history_items: list = None, full_san_history: list = None) -> dict:
    """
    history: a list of message dicts (role, content) for retries.
    Returns the updated history and the parsed move.
    """
    pass1_system_prompt = (
        "You are a chess master AI. "
        "Your task is to analyze the board and return a ranked list of the top 3 to 5 candidate moves.\n"
        "You MUST respond ONLY with the structured JSON output matching the schema."
    )
    pass1_messages = [{"role": "system", "content": pass1_system_prompt}]
    
    # Format the complete SAN moveset
    full_moveset_text = "No moves made yet."
    if full_san_history:
        # Group into move numbers: 1. e4 e5 2. Nf3 Nc6 ...
        moveset_parts = []
        for i in range(0, len(full_san_history), 2):
            move_num = (i // 2) + 1
            white_move = full_san_history[i]
            black_move = full_san_history[i+1] if i+1 < len(full_san_history) else ""
            moveset_parts.append(f"{move_num}. {white_move} {black_move}".strip())
        full_moveset_text = " ".join(moveset_parts)
    
    # Format the recent history context (reasoning and plans)
    recent_history_text = "No detailed history available."
    if history_items:
        history_lines = []
        for item in history_items:
            # history_item is a dict because it comes from FastAPI parsing MoveRequest models (so it's a dict or Pydantic object)
            # Assuming FastAPI passes it as a dict since it's inside a BaseModel and we access it via dot notation if it's an object?
            # Wait, request.history_items is a list of HistoryItem objects. We can access via dot notation if Pydantic, or dict notation if dict.
            # To be safe, let's use a helper to get attrs.
            item_dict = item.model_dump() if hasattr(item, "model_dump") else item if isinstance(item, dict) else item.dict()
            san = item_dict.get("san")
            color = item_dict.get("color")
            model = item_dict.get("model")
            reasoning = item_dict.get("reasoning")
            plan = item_dict.get("plan")
            
            line = f"--- Move by {color} ({model}) ---\nMove: {san}"
            if reasoning:
                line += f"\nReasoning: {reasoning}"
            if plan:
                line += f"\nPlan: {json.dumps(plan)}"
            history_lines.append(line)
        recent_history_text = "\n\n".join(history_lines)
        
    board_prompt = (
        f"### Complete Match Moveset (PGN-style) ###\n"
        f"{full_moveset_text}\n\n"
        f"### Detailed Context (Last Few Moves) ###\n"
        f"{recent_history_text}\n\n"
        f"### Current Board State ###\n"
        f"Turn: {board_json['turn']}\n"
        f"Is in check: {board_json['in_check']}\n\n"
        f"### Board Markdown Grid ###\n{board_json['markdown_grid']}\n\n"
        f"### Pieces List ###\n{json.dumps(board_json['pieces'])}\n\n"
        f"### Legal Moves Available ###\n"
        f"You MUST choose one of the following exact moves:\n"
        f"{json.dumps(board_json['legal_moves'])}\n\n"
        f"Please provide your reasoning, move, and plan in the structured JSON format."
    )
    
    # If we have a history of failed attempts for this specific turn, append them to the prompt
    if history:
        error_messages = [msg["content"] for msg in history if msg["role"] == "user" and "Invalid move" in msg["content"] or "JSON" in msg["content"]]
        if error_messages:
            board_prompt += f"\n\n### PREVIOUS ATTEMPT ERRORS ###\n" + "\n".join(error_messages) + "\nDo not repeat the moves that caused these errors."
            
    pass1_messages.append({"role": "user", "content": board_prompt})
        
    try:
        client = get_client()
        
        # PASS 1: Ranking Schema
        ranking_schema = {
            "type": "object",
            "properties": {
                "candidates": {
                    "type": "array",
                    "description": "A ranked list of top 3 to 5 candidate moves.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "san": {"type": "string", "description": "The SAN notation of the candidate move (e.g. 'e4', 'Nf3')"},
                            "reasoning": {"type": "string", "description": "Why this move is a good candidate."}
                        },
                        "required": ["san", "reasoning"],
                        "additionalProperties": False
                    }
                }
            },
            "required": ["candidates"],
            "additionalProperties": False
        }

        response1 = client.chat.completions.create(
            model=model_name,
            messages=pass1_messages,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "chess_candidates",
                    "schema": ranking_schema
                }
            },
            temperature=0.3
        )
        
        if not response1.choices[0].message.content:
            print(f"[{model_name}] AI returned empty content on Pass 1.")
            return {"move": None, "error": "AI returned empty content on Pass 1", "raw_content": ""}
            
        pass1_content = response1.choices[0].message.content
        print(f"\n--- AI PASS 1 (Candidates) ({model_name}) ---\n{pass1_content}\n-----------------------------\n")
        
        # PASS 2: Sanity Check and Final Selection
        pass2_system_prompt = (
            "You are a chess master AI. "
            "You MUST respond ONLY with the structured JSON output matching the schema.\n"
            "IMPORTANT REASONING RULES:\n"
            "1. Step-by-step: Evaluate your given candidate moves.\n"
            "2. Threat Check: You MUST explicitly verify if your destination square is attacked by enemy pawns or sliding pieces (bishops/rooks/queens) before deciding it is safe.\n"
            "3. Planning: Use the 'plan' array for forcing lines. If your move delivers a check or creates an immediate threat, predict the opponent's forced response (if_opponent_plays) and your planned counter-move (then_i_play_origin/destination). If unsure, leave null."
        )
        
        pass2_messages = pass1_messages.copy()
        pass2_messages[0] = {"role": "system", "content": pass2_system_prompt}
        pass2_messages.append({"role": "assistant", "content": pass1_content})
        pass2_messages.append({
            "role": "user",
            "content": "Here are your top candidates. Perform a strict sanity check on each. Verify piece safety and avoid blunders. Then, select the BEST move from these candidates and output it using the final schema."
        })
        inline_schema = {
            "type": "object",
            "properties": {
                "reasoning": {"type": "string", "description": "Your thoughts behind this move"},
                "move": {
                    "type": "object",
                    "description": "The final move to play",
                    "properties": {
                        "origin": {"type": "string", "description": "The starting square (e.g., 'e2')"},
                        "destination": {"type": "string", "description": "The ending square (e.g., 'e4')"},
                        "promotion": {"type": ["string", "null"], "description": "Promotion piece, e.g. 'q' or null"}
                    },
                    "required": ["origin", "destination"],
                    "additionalProperties": False
                },
                "plan": {
                    "type": ["array", "null"],
                    "description": "Optional contingent moves.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "if_opponent_plays": {"type": "string"},
                            "then_i_play_origin": {"type": "string"},
                            "then_i_play_destination": {"type": "string"},
                            "then_i_play_promotion": {"type": ["string", "null"]}
                        },
                        "required": ["if_opponent_plays", "then_i_play_origin", "then_i_play_destination", "then_i_play_promotion"],
                        "additionalProperties": False
                    }
                }
            },
            "required": ["reasoning", "move", "plan"],
            "additionalProperties": False
        }

        response2 = client.chat.completions.create(
            model=model_name,
            messages=pass2_messages,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "chess_move",
                    "schema": inline_schema
                }
            },
            temperature=0.1
        )
        
        # Check if the content is returned
        if not response2.choices[0].message.content:
            print(f"[{model_name}] AI returned empty content on Pass 2.")
            return {"move": None, "error": "AI returned empty content on Pass 2", "raw_content": ""}
            
        raw_content = response2.choices[0].message.content
        print(f"\n--- AI PASS 2 (Final Decision) ({model_name}) ---\n{raw_content}\n-----------------------------\n")
        
        try:
            # Robustly extract JSON block even if the model added conversational text before or after
            match = re.search(r'\{.*\}', raw_content, re.DOTALL)
            if match:
                json_str = match.group(0)
            else:
                json_str = raw_content
                
            move_data = json.loads(json_str)
            
            # Robustness: Generic deep search for the move object
            actual_move = move_data
            
            def find_move(d):
                if isinstance(d, dict):
                    if "origin" in d and "destination" in d and "if_opponent_plays" not in d:
                        return d
                    for k, v in d.items():
                        # Skip keys that contain lists of alternative moves or opponent's future moves
                        if k in ["plan", "candidates", "candidate_moves", "sanity_checks"]:
                            continue
                        if isinstance(v, dict):
                            found = find_move(v)
                            if found:
                                return found
                return None
                
            found_move = find_move(move_data)
            if found_move:
                actual_move = found_move
                        
            # Re-flatten into the exact format main.py expects
            
            # Extract reasoning from any likely key
            reasoning = ""
            for r_key in ["reasoning", "reasoning_summary", "thought_process", "strategic_purpose", "thoughts", "explanation"]:
                if r_key in move_data and isinstance(move_data[r_key], str):
                    reasoning = move_data[r_key]
                    break
                    
            result_data = {
                "origin": actual_move.get("origin"),
                "destination": actual_move.get("destination"),
                "promotion": actual_move.get("promotion"),
                "reasoning": reasoning,
                "plan": move_data.get("plan", [])
            }
                        
            return {"move": result_data, "error": None, "raw_content": raw_content}
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
