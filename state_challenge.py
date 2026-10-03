"""
State Challenge Engine for Quantum Playground.

This module provides the core game logic for the Quantum State Challenge:
1. Generates an initial qubit state and a target final qubit state.
2. Lets the user implement gates from gates.py / simulator.py.
3. Calculates the shortest path (minimum steps) using Breadth-First Search (BFS).
4. Verifies whether the user reaches the final state in the least amount of steps.
5. Provides hints, presets, custom challenge creation, and standalone CLI gameplay.
"""

from collections import deque
import cmath
import math
import random
import sys

# Ensure UTF-8 stdout encoding for Windows console ket characters
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

import numpy as np

from bloch import bloch_coordinates, bloch_angles
from gates import GATES, get_gate
from simulator import apply_named_gate, probabilities, state_to_dictionary
from states import (
    minus_state,
    normalize_state,
    one_state,
    plus_state,
    zero_state,
)

# Standard single-qubit gates available in the challenge
ALLOWED_GATES = ("X", "Y", "Z", "H", "S", "T")

# Numerical tolerance for state equivalence (mod global phase)
FIDELITY_TOLERANCE = 1e-4
BLOCH_TOLERANCE = 2e-3


# =========================================================
# STATE UTILITIES & COMPARISON
# =========================================================

def state_fidelity(state_a, state_b):
    """
    Calculate quantum fidelity F = |<state_a | state_b>|^2 between two pure states.
    Fidelity equals 1.0 if and only if state_a and state_b represent the identical
    physical quantum state up to an arbitrary global phase factor e^(i * theta).
    """
    a = normalize_state(state_a)
    b = normalize_state(state_b)
    overlap = np.vdot(a, b)
    fidelity = float(abs(overlap) ** 2)
    return min(1.0, max(0.0, fidelity))


def bloch_distance(state_a, state_b):
    """
    Calculate Euclidean distance between two states on the Bloch sphere:
    ||r_a - r_b||.
    """
    c_a = bloch_coordinates(state_a)
    c_b = bloch_coordinates(state_b)
    dx = c_a["x"] - c_b["x"]
    dy = c_a["y"] - c_b["y"]
    dz = c_a["z"] - c_b["z"]
    return float(math.sqrt(dx * dx + dy * dy + dz * dz))


def bloch_angle_difference(state_a, state_b):
    """
    Calculate the angular difference in degrees between two states on the Bloch sphere.
    Returns a float between 0.0 and 180.0 degrees.
    """
    c_a = bloch_coordinates(state_a)
    c_b = bloch_coordinates(state_b)
    dot = c_a["x"] * c_b["x"] + c_a["y"] * c_b["y"] + c_a["z"] * c_b["z"]
    dot = max(-1.0, min(1.0, dot))
    return float(math.degrees(math.acos(dot)))


def is_target_reached(current_state, target_state, tolerance=FIDELITY_TOLERANCE):
    """
    Check if the current state matches the target state within numerical tolerance.
    Accounting for global phase: pure states are physically identical if fidelity ~ 1.
    """
    fid = state_fidelity(current_state, target_state)
    if fid >= 1.0 - tolerance:
        return True
    return bloch_distance(current_state, target_state) < BLOCH_TOLERANCE


def state_hash_key(state, decimals=3):
    """
    Generate a hashable tuple representing the state's Bloch sphere coordinates.
    Because Bloch coordinates are completely invariant under global phase, two
    states with the same key represent the same physical qubit state.
    """
    coord = bloch_coordinates(state)
    return (
        round(coord["x"], decimals),
        round(coord["y"], decimals),
        round(coord["z"], decimals),
    )


def state_ket_notation(state):
    """
    Return standard Dirac ket string representation, e.g.
    '|0⟩', '|1⟩', '|+⟩', '|−⟩', '|+i⟩', '|-i⟩' or amplitude expansion.
    """
    s = normalize_state(state)
    # Check known standard states
    standard_states = [
        ("|0⟩", zero_state()),
        ("|1⟩", one_state()),
        ("|+⟩", plus_state()),
        ("|−⟩", minus_state()),
        ("|+i⟩", np.array([1 / np.sqrt(2), 1j / np.sqrt(2)], dtype=complex)),
        ("|-i⟩", np.array([1 / np.sqrt(2), -1j / np.sqrt(2)], dtype=complex)),
    ]
    for label, std in standard_states:
        if is_target_reached(s, std):
            return label

    # Format numeric amplitude string
    alpha = s[0]
    beta = s[1]

    def fmt_comp(val):
        re = round(val.real, 3)
        im = round(val.imag, 3)
        if abs(re) < 1e-4 and abs(im) < 1e-4:
            return "0"
        if abs(im) < 1e-4:
            return f"{re:+g}"
        if abs(re) < 1e-4:
            return f"{im:+g}i" if abs(im) != 1 else ("+i" if im > 0 else "-i")
        sign = "+" if im >= 0 else "-"
        im_val = abs(im)
        im_str = "i" if im_val == 1 else f"{im_val:g}i"
        return f"{re:+g}{sign}{im_str}"

    a_str = fmt_comp(alpha).lstrip("+")
    b_str = fmt_comp(beta)
    if b_str.startswith("+"):
        b_str = " + " + b_str[1:]
    elif b_str.startswith("-"):
        b_str = " - " + b_str[1:]
    else:
        b_str = " + " + b_str

    return f"({a_str})|0⟩{b_str}|1⟩"


def serialize_state_payload(state):
    """Serialize state vector and all geometric/probabilistic metadata."""
    norm_state = normalize_state(state)
    coords = bloch_coordinates(norm_state)
    angles = bloch_angles(norm_state)
    probs = probabilities(norm_state).tolist()

    return {
        "vector": [
            {
                "real": float(val.real),
                "imaginary": float(val.imag),
                "probability": float(abs(val) ** 2),
            }
            for val in norm_state
        ],
        "state_dictionary": state_to_dictionary(norm_state),
        "probabilities": probs,
        "bloch_coordinates": coords,
        "bloch_angles": {
            "theta_degrees": float(math.degrees(angles["theta"])),
            "phi_degrees": float(math.degrees(angles["phi"])),
            "theta_rad": float(angles["theta"]),
            "phi_rad": float(angles["phi"]),
        },
        "ket": state_ket_notation(norm_state),
    }


# =========================================================
# SHORTEST PATH & LEAST STEPS SOLVER (BFS)
# =========================================================

def find_shortest_path(initial_state, target_state, max_depth=6, allowed_gates=ALLOWED_GATES):
    """
    Find the shortest sequence of quantum gates that transforms initial_state
    into target_state using Breadth-First Search (BFS).

    Returns:
        tuple: (min_steps, optimal_sequence)
        - min_steps: integer (0 if already equal, or length of optimal_sequence)
        - optimal_sequence: list of gate names, e.g. ['H', 'S', 'H']
        If unreachable within max_depth, returns (None, None).
    """
    initial = normalize_state(initial_state)
    target = normalize_state(target_state)

    if is_target_reached(initial, target):
        return 0, []

    target_key = state_hash_key(target)
    queue = deque([(initial, [])])
    visited = {state_hash_key(initial)}

    while queue:
        state, path = queue.popleft()

        if len(path) >= max_depth:
            continue

        for gate_name in allowed_gates:
            try:
                next_state = apply_named_gate(state, gate_name)
            except Exception:
                continue

            k = state_hash_key(next_state)

            if k == target_key or is_target_reached(next_state, target):
                return len(path) + 1, path + [gate_name]

            if k not in visited:
                visited.add(k)
                queue.append((next_state, path + [gate_name]))

    return None, None


def get_hint(current_state, target_state, allowed_gates=ALLOWED_GATES):
    """
    Provide an intelligent hint for the user's current situation.
    Finds the shortest path from current_state to target_state and suggests
    the optimal next gate to apply.
    """
    curr = normalize_state(current_state)
    target = normalize_state(target_state)

    if is_target_reached(curr, target):
        return {
            "target_reached": True,
            "next_gate": None,
            "remaining_steps": 0,
            "message": "Target already reached! You have completed the challenge.",
        }

    steps, path = find_shortest_path(curr, target, max_depth=6, allowed_gates=allowed_gates)

    if steps is None or not path:
        return {
            "target_reached": False,
            "next_gate": None,
            "remaining_steps": None,
            "message": "Target state is more than 6 steps away from your current state. Try hitting Undo or Reset!",
        }

    next_gate = path[0]
    gate_descriptions = {
        "X": "Pauli-X (Bit-flip: rotates π around X-axis)",
        "Y": "Pauli-Y (Bit-and-phase flip: rotates π around Y-axis)",
        "Z": "Pauli-Z (Phase-flip: rotates π around Z-axis)",
        "H": "Hadamard (Superposition: swaps X and Z axes)",
        "S": "Phase S (rotates π/2 around Z-axis)",
        "T": "Phase T (rotates π/4 around Z-axis)",
        "I": "Identity (leaves state unchanged)",
    }

    desc = gate_descriptions.get(next_gate, f"{next_gate} gate")

    return {
        "target_reached": False,
        "next_gate": next_gate,
        "remaining_steps": steps,
        "optimal_continuation": path,
        "message": f"Try applying the {next_gate} gate next ({desc}). You are {steps} optimal move{'s' if steps > 1 else ''} away.",
    }


# =========================================================
# PRESET CHALLENGES
# =========================================================

def get_preset_challenges():
    """
    Return a curated progression of pedagogical single-qubit challenges.
    Each challenge has a known optimal solution and teaching focus.
    """
    h = apply_named_gate
    s0 = zero_state()
    s1 = one_state()
    sp = plus_state()
    sm = minus_state()
    si = h(h(s0, "H"), "S")   # |+i>
    st = h(h(s0, "H"), "T")   # T state

    presets = [
        {
            "id": "level_1",
            "name": "Level 1: The Bit Flip",
            "difficulty": "Easy",
            "description": "Flip the ground state |0⟩ to the excited state |1⟩.",
            "initial_state": s0,
            "target_state": s1,
            "optimal_steps": 1,
            "optimal_sequence": ["X"],
            "concept": "Pauli-X acts like a quantum NOT gate, rotating the vector 180° around the X-axis.",
        },
        {
            "id": "level_2",
            "name": "Level 2: The Quantum Bridge",
            "difficulty": "Easy",
            "description": "Create an equal superposition state |+⟩ from |0⟩.",
            "initial_state": s0,
            "target_state": sp,
            "optimal_steps": 1,
            "optimal_sequence": ["H"],
            "concept": "The Hadamard (H) gate creates an equal superposition of |0⟩ and |1⟩.",
        },
        {
            "id": "level_3",
            "name": "Level 3: Phase Inversion",
            "difficulty": "Easy",
            "description": "Invert the phase of the superposition |+⟩ to reach |−⟩.",
            "initial_state": sp,
            "target_state": sm,
            "optimal_steps": 1,
            "optimal_sequence": ["Z"],
            "concept": "Pauli-Z flips the phase of |1⟩, converting (|0⟩+|1⟩)/√2 into (|0⟩-|1⟩)/√2.",
        },
        {
            "id": "level_4",
            "name": "Level 4: Superposition Collapse",
            "difficulty": "Easy",
            "description": "Transform the negative superposition |−⟩ back to basis state |1⟩.",
            "initial_state": sm,
            "target_state": s1,
            "optimal_steps": 1,
            "optimal_sequence": ["H"],
            "concept": "Hadamard is its own inverse: H|−⟩ = |1⟩, bringing superposition back to basis.",
        },
        {
            "id": "level_5",
            "name": "Level 5: Enter the Y-Axis",
            "difficulty": "Medium",
            "description": "Navigate from ground state |0⟩ to the imaginary axis state |+i⟩.",
            "initial_state": s0,
            "target_state": si,
            "optimal_steps": 2,
            "optimal_sequence": ["H", "S"],
            "concept": "Applying H enters the equatorial plane, and S rotates by 90° along the Z-axis to the Y-axis.",
        },
        {
            "id": "level_6",
            "name": "Level 6: The Magic T-Gate Shift",
            "difficulty": "Medium",
            "description": "Navigate from ground state |0⟩ to the non-Clifford state (|0⟩ + e^(iπ/4)|1⟩)/√2.",
            "initial_state": s0,
            "target_state": st,
            "optimal_steps": 2,
            "optimal_sequence": ["H", "T"],
            "concept": "The T gate provides a π/4 (45°) phase rotation, essential for universal quantum computing.",
        },
        {
            "id": "level_7",
            "name": "Level 7: Negative Superposition to Y-Axis",
            "difficulty": "Medium",
            "description": "Reach the negative imaginary state |−i⟩ from |0⟩.",
            "initial_state": s0,
            "target_state": h(h(h(s0, "H"), "S"), "Z"),
            "optimal_steps": 3,
            "optimal_sequence": ["H", "S", "Z"],
            "concept": "Combining H, S, and Z gate rotations navigates around the sphere's equator.",
        },
        {
            "id": "level_8",
            "name": "Level 8: Basis Inversion via Conjugation",
            "difficulty": "Medium",
            "description": "Flip |0⟩ to |1⟩ using only Hadamard and Pauli-Z gates.",
            "initial_state": s0,
            "target_state": s1,
            "optimal_steps": 3,
            "optimal_sequence": ["H", "Z", "H"],
            "concept": "Notice that HZH = X. Changing bases allows Z to perform a bit flip.",
        },
        {
            "id": "level_9",
            "name": "Level 9: Clifford Master",
            "difficulty": "Hard",
            "description": "Navigate from |1⟩ to the octant state H T H |0⟩ in least steps.",
            "initial_state": s1,
            "target_state": h(h(h(s0, "H"), "T"), "H"),
            "optimal_steps": 4,
            "optimal_sequence": ["X", "H", "T", "H"],
            "concept": "Synthesizing precise state orientations requires careful multi-axis coordinate rotations.",
        },
        {
            "id": "level_10",
            "name": "Level 10: Grand Quantum Puzzle",
            "difficulty": "Hard",
            "description": "Navigate from |+i⟩ to the complex target state H S H T |0⟩ in least steps.",
            "initial_state": si,
            "target_state": h(h(h(h(s0, "T"), "H"), "S"), "H"),
            "optimal_steps": 4,
            "optimal_sequence": ["S", "H", "T", "H"],
            "concept": "Master level: requires unravelling multiple non-commuting rotation operators.",
        },
    ]

    return presets


# =========================================================
# RANDOM CHALLENGE GENERATOR
# =========================================================

def generate_challenge(difficulty="medium", seed=None):
    """
    Generate an initial qubit state and a final target qubit state.

    Guarantees:
    1. The target state is reachable using gates in gates.py.
    2. The minimum number of steps to reach target from initial is calculated and verified.
    3. Matches the requested difficulty:
       - 'easy': 1 to 2 optimal steps
       - 'medium': 3 to 4 optimal steps
       - 'hard': 5 to 6 optimal steps

    Returns:
        dict: Challenge specification containing initial and target states,
              optimal step count, optimal gate sequence, and description.
    """
    if seed is not None:
        random.seed(seed)
        np.random.seed(seed)

    difficulty = str(difficulty).lower().strip()
    if difficulty not in {"easy", "medium", "hard"}:
        difficulty = "medium"

    target_steps_map = {
        "easy": (1, 2),
        "medium": (3, 4),
        "hard": (5, 6),
    }
    min_desired, max_desired = target_steps_map[difficulty]

    # Candidate initial states
    seed_states = [
        ("Ground State |0⟩", zero_state()),
        ("Excited State |1⟩", one_state()),
        ("Plus State |+⟩", plus_state()),
        ("Minus State |−⟩", minus_state()),
        ("Y-State |+i⟩", np.array([1 / np.sqrt(2), 1j / np.sqrt(2)], dtype=complex)),
        ("Y-State |−i⟩", np.array([1 / np.sqrt(2), -1j / np.sqrt(2)], dtype=complex)),
    ]

    # Attempt to generate a challenge with exact desired steps
    best_challenge = None
    max_attempts = 120

    for _ in range(max_attempts):
        init_name, init_state = random.choice(seed_states)
        sequence_length = random.randint(min_desired, max_desired)

        # Apply random sequence of single-qubit gates
        curr_state = init_state.copy()
        generated_gates = []
        for _ in range(sequence_length):
            gate_choice = random.choice(ALLOWED_GATES)
            curr_state = apply_named_gate(curr_state, gate_choice)
            generated_gates.append(gate_choice)

        target_state = normalize_state(curr_state)

        # Compute TRUE shortest path using BFS
        actual_steps, actual_seq = find_shortest_path(
            init_state, target_state, max_depth=max_desired + 1, allowed_gates=ALLOWED_GATES
        )

        if actual_steps is None or actual_steps == 0:
            continue

        if min_desired <= actual_steps <= max_desired:
            best_challenge = {
                "difficulty": difficulty.capitalize(),
                "initial_name": init_name,
                "initial_state": init_state,
                "target_state": target_state,
                "optimal_steps": actual_steps,
                "optimal_sequence": actual_seq,
                "initial_payload": serialize_state_payload(init_state),
                "target_payload": serialize_state_payload(target_state),
                "description": f"Navigate from {state_ket_notation(init_state)} to {state_ket_notation(target_state)} in the least steps.",
            }
            break

    # Fallback to a preset if random generation didn't converge
    if not best_challenge:
        presets = get_preset_challenges()
        filtered = [p for p in presets if p["difficulty"].lower() == difficulty]
        preset = filtered[0] if filtered else presets[0]
        init_state = preset["initial_state"]
        target_state = preset["target_state"]
        best_challenge = {
            "difficulty": preset["difficulty"],
            "initial_name": preset["name"],
            "initial_state": init_state,
            "target_state": target_state,
            "optimal_steps": preset["optimal_steps"],
            "optimal_sequence": preset["optimal_sequence"],
            "initial_payload": serialize_state_payload(init_state),
            "target_payload": serialize_state_payload(target_state),
            "description": preset["description"],
            "concept": preset.get("concept", ""),
        }

    return best_challenge


# =========================================================
# CUSTOM CHALLENGE CREATION
# =========================================================

def create_custom_challenge(initial_vector, target_vector):
    """
    Create a custom challenge given two 2-component complex vectors.
    Solves for the shortest path and validates reachability with available gates.
    """
    init_state = normalize_state(initial_vector)
    target_state = normalize_state(target_vector)

    steps, sequence = find_shortest_path(
        init_state, target_state, max_depth=6, allowed_gates=ALLOWED_GATES
    )

    is_reachable = steps is not None

    return {
        "difficulty": "Custom",
        "initial_state": init_state,
        "target_state": target_state,
        "optimal_steps": steps if is_reachable else None,
        "optimal_sequence": sequence if is_reachable else None,
        "is_reachable": is_reachable,
        "initial_payload": serialize_state_payload(init_state),
        "target_payload": serialize_state_payload(target_state),
        "description": f"Custom Challenge: {state_ket_notation(init_state)} → {state_ket_notation(target_state)}",
    }


# =========================================================
# GAMEPLAY STEP EVALUATION & SCORING
# =========================================================

def implement_gate(state, gate_name):
    """
    Apply any of the gates previously created in the repository's files.
    Validates and normalizes the resulting state.
    """
    gate_name = str(gate_name).strip().upper()
    if gate_name not in GATES:
        raise ValueError(
            f"Invalid gate '{gate_name}'. Available gates: {', '.join(ALLOWED_GATES)}"
        )
    return apply_named_gate(state, gate_name)


def evaluate_game_state(current_state, target_state, moves_taken, optimal_steps, gate_history):
    """
    Evaluate the user's progress toward the goal:
    - Checks if target state has been reached.
    - Compares user's moves taken with the optimal number of steps.
    - Computes fidelity, Bloch angular distance, and efficiency rating.
    """
    curr = normalize_state(current_state)
    target = normalize_state(target_state)

    fidelity = state_fidelity(curr, target)
    distance = bloch_distance(curr, target)
    angle_deg = bloch_angle_difference(curr, target)
    target_reached = is_target_reached(curr, target)

    # Remaining optimal moves
    rem_steps, rem_path = find_shortest_path(curr, target, max_depth=6, allowed_gates=ALLOWED_GATES)

    # Performance calculation if target reached
    stars = 0
    performance_title = "In Progress"
    is_optimal = False

    if target_reached:
        if moves_taken == optimal_steps:
            stars = 3
            performance_title = "Flawless! Least Steps Achieved (Optimal) ⭐⭐⭐"
            is_optimal = True
        elif moves_taken <= optimal_steps + 2:
            stars = 2
            performance_title = "Target Reached! Near-Optimal ⭐⭐"
            is_optimal = False
        else:
            stars = 1
            performance_title = "Target Reached! (Can be done in fewer steps) ⭐"
            is_optimal = False

    return {
        "target_reached": target_reached,
        "is_optimal": is_optimal,
        "moves_taken": moves_taken,
        "optimal_steps": optimal_steps,
        "difference_from_optimal": moves_taken - optimal_steps,
        "fidelity": round(fidelity, 5),
        "bloch_distance": round(distance, 4),
        "angle_degrees": round(angle_deg, 2),
        "remaining_steps": rem_steps,
        "gate_history": gate_history,
        "stars": stars,
        "performance_title": performance_title,
        "current_payload": serialize_state_payload(curr),
        "target_payload": serialize_state_payload(target),
    }


# =========================================================
# STANDALONE INTERACTIVE CLI GAME
# =========================================================

def run_cli_game():
    """
    Runs an interactive terminal game for the Quantum State Challenge.
    Can be run directly via `python state_challenge.py`.
    """
    print("\n" + "=" * 65)
    print("        ⚛  QUANTUM PLAYGROUND — STATE CHALLENGE  ⚛")
    print("  Navigate from Initial State to Target State in Least Steps!")
    print("=" * 65)

    print("\nSelect Game Mode:")
    print("  [1] Preset Challenge (Levels 1 to 10)")
    print("  [2] Random Challenge (Easy: 1-2 steps)")
    print("  [3] Random Challenge (Medium: 3-4 steps)")
    print("  [4] Random Challenge (Hard: 5-6 steps)")
    print("  [5] Quick Solver / Demonstration")

    choice = input("\nEnter choice (1-5) [default 2]: ").strip() or "2"

    if choice == "1":
        presets = get_preset_challenges()
        print("\nAvailable Levels:")
        for idx, p in enumerate(presets, start=1):
            print(f"  [{idx:2d}] {p['name']} ({p['difficulty']}, Par: {p['optimal_steps']})")
        lvl_idx = int(input("\nChoose level (1-10) [default 1]: ").strip() or "1") - 1
        lvl_idx = max(0, min(len(presets) - 1, lvl_idx))
        preset = presets[lvl_idx]
        init_state = preset["initial_state"]
        target_state = preset["target_state"]
        optimal_steps = preset["optimal_steps"]
        desc = preset["description"]
    elif choice in {"2", "3", "4"}:
        diff_map = {"2": "easy", "3": "medium", "4": "hard"}
        ch = generate_challenge(difficulty=diff_map[choice])
        init_state = ch["initial_state"]
        target_state = ch["target_state"]
        optimal_steps = ch["optimal_steps"]
        desc = ch["description"]
    else:
        # Quick demonstration
        print("\n--- Running Solver Demo ---")
        ch = generate_challenge(difficulty="medium")
        print(f"Initial: {state_ket_notation(ch['initial_state'])}")
        print(f"Target:  {state_ket_notation(ch['target_state'])}")
        print(f"Optimal Steps: {ch['optimal_steps']}")
        print(f"Optimal Sequence: {ch['optimal_sequence']}")
        return

    curr_state = init_state.copy()
    history = []

    print("\n" + "-" * 65)
    print(f"MISSION: {desc}")
    print(f"INITIAL STATE: {state_ket_notation(init_state)}")
    print(f"TARGET STATE:  {state_ket_notation(target_state)}")
    print(f"PAR / OPTIMAL STEPS: {optimal_steps}")
    print("-" * 65)
    print("Available Gates: X, Y, Z, H, S, T")
    print("Commands: [U]ndo, [R]eset, [H]int, [S]olve, [Q]uit\n")

    while True:
        eval_res = evaluate_game_state(
            curr_state, target_state, len(history), optimal_steps, history
        )

        curr_ket = state_ket_notation(curr_state)
        angle = eval_res["angle_degrees"]
        fid = eval_res["fidelity"]

        wire = "—".join([f"[{g}]" for g in history]) if history else "(no gates applied yet)"
        print(f"State: {curr_ket} | Moves: {len(history)}/{optimal_steps} | Bloch Angle: {angle}° | Fidelity: {fid*100:.1f}%")
        print(f"Circuit: q₀: —{wire}—")

        if eval_res["target_reached"]:
            print("\n" + "★" * 50)
            print(f"🎉 GOAL REACHED! {eval_res['performance_title']}")
            print(f"Moves taken: {len(history)} | Optimal: {optimal_steps}")
            if eval_res["is_optimal"]:
                print("🌟 Congratulations! You solved it in the least possible steps!")
            else:
                print(f"💡 You did it, but the optimal path is {optimal_steps} steps.")
                _, opt_path = find_shortest_path(init_state, target_state)
                print(f"   Optimal solution was: {' -> '.join(opt_path)}")
            print("★" * 50 + "\n")
            break

        cmd = input("Enter gate or command > ").strip().upper()

        if cmd in {"Q", "QUIT", "EXIT"}:
            print("Exiting challenge. Good game!")
            break
        elif cmd in {"R", "RESET"}:
            curr_state = init_state.copy()
            history = []
            print("\n↻ Reset to initial state.\n")
        elif cmd in {"U", "UNDO"}:
            if history:
                history.pop()
                curr_state = init_state.copy()
                for g in history:
                    curr_state = apply_named_gate(curr_state, g)
                print(f"\n↶ Undid last move. Remaining moves: {len(history)}\n")
            else:
                print("\nNothing to undo!\n")
        elif cmd in {"H", "HINT"}:
            hint = get_hint(curr_state, target_state)
            print(f"\n💡 HINT: {hint['message']}\n")
        elif cmd in {"S", "SOLVE"}:
            _, opt_path = find_shortest_path(init_state, target_state)
            print(f"\n⚡ OPTIMAL SOLUTION ({len(opt_path)} steps): {' -> '.join(opt_path)}\n")
        elif cmd in ALLOWED_GATES:
            curr_state = implement_gate(curr_state, cmd)
            history.append(cmd)
            print(f"\n▶ Applied [{cmd}] gate.")
        else:
            print(f"Unknown gate '{cmd}'. Choose from X, Y, Z, H, S, T, or commands U, R, H, S, Q.")


if __name__ == "__main__":
    run_cli_game()
