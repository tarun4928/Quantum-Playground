"""
Quantum Game module alias for state_challenge.py.
Allows importing or executing quantum_game.py with identical functionality.
"""

from state_challenge import (
    ALLOWED_GATES,
    bloch_angle_difference,
    bloch_distance,
    create_custom_challenge,
    evaluate_game_state,
    find_shortest_path,
    generate_challenge,
    get_hint,
    get_preset_challenges,
    implement_gate,
    is_target_reached,
    run_cli_game,
    serialize_state_payload,
    state_fidelity,
    state_ket_notation,
)

if __name__ == "__main__":
    run_cli_game()
