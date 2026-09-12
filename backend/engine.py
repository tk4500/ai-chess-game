import chess

PIECE_NAMES = {
    chess.PAWN: "pawn",
    chess.KNIGHT: "knight",
    chess.BISHOP: "bishop",
    chess.ROOK: "rook",
    chess.QUEEN: "queen",
    chess.KING: "king"
}

def get_markdown_board(board: chess.Board) -> str:
    """Creates a textual markdown grid of the board for better AI spatial awareness."""
    lines = ["|   | a | b | c | d | e | f | g | h |", "|---|---|---|---|---|---|---|---|---|"]
    for rank in range(7, -1, -1):
        row = [f"| {rank + 1} |"]
        for file in range(8):
            square = chess.square(file, rank)
            piece = board.piece_at(square)
            if piece:
                symbol = piece.symbol() # Uppercase for White, lowercase for Black
                row.append(f" {symbol} |")
            else:
                row.append("   |")
        lines.append("".join(row))
    return "\n".join(lines)

def get_board_state_json(board: chess.Board) -> dict:
    pieces = []
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece:
            pieces.append({
                "position": chess.square_name(square),
                "color": "white" if piece.color == chess.WHITE else "black",
                "piece": PIECE_NAMES[piece.piece_type]
            })
    legal_moves = []
    for move in board.legal_moves:
        legal_moves.append({
            "origin": chess.square_name(move.from_square),
            "destination": chess.square_name(move.to_square),
            "promotion": chess.piece_symbol(move.promotion) if move.promotion else None
        })

    return {
        "turn": "white" if board.turn == chess.WHITE else "black",
        "in_check": board.is_check(),
        "is_checkmate": board.is_checkmate(),
        "is_stalemate": board.is_stalemate(),
        "legal_moves": legal_moves,
        "pieces": pieces,
        "markdown_grid": get_markdown_board(board),
        "fen": board.fen() # useful for the frontend, but we won't emphasize it to the AI
    }

def try_move(board: chess.Board, origin: str, destination: str, promotion: str = None) -> tuple[bool, str]:
    """
    Attempts to make a move. 
    Returns (True, None) if successful.
    Returns (False, error_message) if invalid.
    """
    try:
        move_str = origin + destination
        if promotion:
            # simple mapping for promotion piece
            prom_char = promotion.lower()[0]
            if prom_char in ['q', 'r', 'b', 'n']:
                move_str += prom_char
            else:
                move_str += 'q' # default to queen
                
        move = chess.Move.from_uci(move_str)
        if move in board.legal_moves:
            board.push(move)
            return True, None
        else:
            return False, f"Move {move_str} is illegal. Valid moves for this board state can be seen using chess rules, but this specific move is not allowed."
    except Exception as e:
        return False, f"Error parsing move: {str(e)}. Use format like 'e2' for origin and 'e4' for destination."
