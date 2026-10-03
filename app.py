import os

import numpy as np
from flask import Flask, jsonify, render_template, request, session

from bloch import bloch_coordinates
from measurement import measure_many, measurement_percentages
from operator_lab import analyze_operator
from simulator import apply_named_gate, probabilities, state_to_dictionary
from state_challenge import (
    create_custom_challenge,
    evaluate_game_state,
    find_shortest_path,
    generate_challenge,
    get_hint,
    get_preset_challenges,
    implement_gate,
    serialize_state_payload,
)
from states import normalize_state, zero_state


app = Flask(__name__)
app.secret_key = os.environ.get(
    "SECRET_KEY",
    "quantum-playground-dev-secret-key"
)


# =========================================================
# WEBSITE PAGES
# =========================================================

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/explore")
def explore():
    return render_template("explore.html")


@app.route("/circuit")
def circuit():
    return render_template("circuit.html")


@app.route("/measurement")
def measurement():
    return render_template("measurement.html")


@app.route("/entanglement")
def entanglement():
    return render_template("entanglement.html")


@app.route("/learn")
def learn():
    return render_template("learn.html")


@app.route("/about")
def about():
    return render_template("about.html")


@app.route("/help")
def help_page():
    return render_template("help.html")


@app.route("/operator")
def operator_lab_page():
    return render_template("operator.html")


@app.route("/challenge")
@app.route("/game")
def challenge_page():
    return render_template("challenge.html")


# =========================================================
# DEFINE YOUR OWN QUANTUM GATE
# =========================================================

@app.route("/api/operator/analyze", methods=["POST"])
def analyze_operator_api():
    try:
        data = request.get_json(silent=True) or {}
        return jsonify({"success": True, **analyze_operator(data)})
    except Exception as error:
        return jsonify({
            "success": False,
            "error": str(error),
        }), 400


# =========================================================
# QUANTUM STATE CHALLENGE
# =========================================================

def save_challenge_session(ch_dict):
    init = np.asarray(ch_dict["initial_state"], dtype=complex)
    target = np.asarray(ch_dict["target_state"], dtype=complex)
    curr = np.asarray(ch_dict.get("current_state", init), dtype=complex)

    session["challenge_init_real"] = [float(v.real) for v in init]
    session["challenge_init_imag"] = [float(v.imag) for v in init]
    session["challenge_target_real"] = [float(v.real) for v in target]
    session["challenge_target_imag"] = [float(v.imag) for v in target]
    session["challenge_curr_real"] = [float(v.real) for v in curr]
    session["challenge_curr_imag"] = [float(v.imag) for v in curr]
    session["challenge_optimal_steps"] = int(ch_dict["optimal_steps"])
    session["challenge_optimal_seq"] = list(ch_dict.get("optimal_sequence") or [])
    session["challenge_diff"] = str(ch_dict.get("difficulty", "Medium"))
    session["challenge_desc"] = str(ch_dict.get("description", ""))
    session["challenge_name"] = str(ch_dict.get("name", ch_dict.get("initial_name", "Quantum Challenge")))
    session["challenge_concept"] = str(ch_dict.get("concept", ""))
    session["challenge_history"] = list(ch_dict.get("gate_history") or [])


def load_challenge_session():
    init_r = session.get("challenge_init_real")
    init_i = session.get("challenge_init_imag")
    target_r = session.get("challenge_target_real")
    target_i = session.get("challenge_target_imag")
    curr_r = session.get("challenge_curr_real")
    curr_i = session.get("challenge_curr_imag")

    if not (
        isinstance(init_r, list) and isinstance(init_i, list)
        and isinstance(target_r, list) and isinstance(target_i, list)
        and isinstance(curr_r, list) and isinstance(curr_i, list)
        and len(init_r) == 2 and len(target_r) == 2 and len(curr_r) == 2
    ):
        presets = get_preset_challenges()
        p0 = presets[0]
        init_state = p0["initial_state"]
        target_state = p0["target_state"]
        default_ch = {
            "initial_state": init_state,
            "target_state": target_state,
            "current_state": init_state.copy(),
            "optimal_steps": p0["optimal_steps"],
            "optimal_sequence": p0["optimal_sequence"],
            "difficulty": p0["difficulty"],
            "description": p0["description"],
            "name": p0["name"],
            "concept": p0.get("concept", ""),
            "gate_history": [],
        }
        save_challenge_session(default_ch)
        return default_ch

    init = np.array([complex(r, i) for r, i in zip(init_r, init_i)], dtype=complex)
    target = np.array([complex(r, i) for r, i in zip(target_r, target_i)], dtype=complex)
    curr = np.array([complex(r, i) for r, i in zip(curr_r, curr_i)], dtype=complex)

    return {
        "initial_state": init,
        "target_state": target,
        "current_state": curr,
        "optimal_steps": session.get("challenge_optimal_steps", 1),
        "optimal_sequence": session.get("challenge_optimal_seq", []),
        "difficulty": session.get("challenge_diff", "Medium"),
        "description": session.get("challenge_desc", ""),
        "name": session.get("challenge_name", "Quantum Challenge"),
        "concept": session.get("challenge_concept", ""),
        "gate_history": session.get("challenge_history", []),
    }


def make_challenge_payload(ch):
    eval_res = evaluate_game_state(
        ch["current_state"],
        ch["target_state"],
        len(ch["gate_history"]),
        ch["optimal_steps"],
        ch["gate_history"],
    )
    return {
        "success": True,
        "name": ch["name"],
        "difficulty": ch["difficulty"],
        "description": ch["description"],
        "concept": ch.get("concept", ""),
        "optimal_steps": ch["optimal_steps"],
        "gate_history": ch["gate_history"],
        "moves_taken": len(ch["gate_history"]),
        "initial_payload": serialize_state_payload(ch["initial_state"]),
        "target_payload": serialize_state_payload(ch["target_state"]),
        "current_payload": serialize_state_payload(ch["current_state"]),
        "evaluation": eval_res,
    }


@app.route("/api/challenge/current", methods=["GET"])
def challenge_current_api():
    try:
        ch = load_challenge_session()
        return jsonify(make_challenge_payload(ch))
    except Exception as error:
        return jsonify({"success": False, "error": str(error)}), 400


@app.route("/api/challenge/new", methods=["POST"])
def challenge_new_api():
    try:
        data = request.get_json(silent=True) or {}
        preset_id = data.get("preset_id")
        difficulty = str(data.get("difficulty", "medium")).lower()

        if preset_id:
            presets = get_preset_challenges()
            matched = [p for p in presets if p["id"] == preset_id]
            if not matched:
                raise ValueError(f"Unknown preset level: {preset_id}")
            p = matched[0]
            ch = {
                "initial_state": p["initial_state"],
                "target_state": p["target_state"],
                "current_state": p["initial_state"].copy(),
                "optimal_steps": p["optimal_steps"],
                "optimal_sequence": p["optimal_sequence"],
                "difficulty": p["difficulty"],
                "description": p["description"],
                "name": p["name"],
                "concept": p.get("concept", ""),
                "gate_history": [],
            }
        else:
            raw_ch = generate_challenge(difficulty=difficulty)
            ch = {
                "initial_state": raw_ch["initial_state"],
                "target_state": raw_ch["target_state"],
                "current_state": raw_ch["initial_state"].copy(),
                "optimal_steps": raw_ch["optimal_steps"],
                "optimal_sequence": raw_ch["optimal_sequence"],
                "difficulty": raw_ch["difficulty"],
                "description": raw_ch["description"],
                "name": f"Random Challenge ({raw_ch['difficulty']})",
                "concept": raw_ch.get("concept", ""),
                "gate_history": [],
            }

        save_challenge_session(ch)
        return jsonify(make_challenge_payload(ch))
    except Exception as error:
        return jsonify({"success": False, "error": str(error)}), 400


@app.route("/api/challenge/apply", methods=["POST"])
def challenge_apply_api():
    try:
        data = request.get_json(silent=True) or {}
        gate_name = data.get("gate", "").strip().upper()
        ch = load_challenge_session()

        new_state = implement_gate(ch["current_state"], gate_name)
        ch["current_state"] = new_state
        ch["gate_history"].append(gate_name)
        save_challenge_session(ch)

        return jsonify(make_challenge_payload(ch))
    except Exception as error:
        return jsonify({"success": False, "error": str(error)}), 400


@app.route("/api/challenge/undo", methods=["POST"])
def challenge_undo_api():
    try:
        ch = load_challenge_session()
        if ch["gate_history"]:
            ch["gate_history"].pop()
            curr = ch["initial_state"].copy()
            for g in ch["gate_history"]:
                curr = implement_gate(curr, g)
            ch["current_state"] = curr
            save_challenge_session(ch)

        return jsonify(make_challenge_payload(ch))
    except Exception as error:
        return jsonify({"success": False, "error": str(error)}), 400


@app.route("/api/challenge/reset", methods=["POST"])
def challenge_reset_api():
    try:
        ch = load_challenge_session()
        ch["current_state"] = ch["initial_state"].copy()
        ch["gate_history"] = []
        save_challenge_session(ch)

        return jsonify(make_challenge_payload(ch))
    except Exception as error:
        return jsonify({"success": False, "error": str(error)}), 400


@app.route("/api/challenge/hint", methods=["POST"])
def challenge_hint_api():
    try:
        ch = load_challenge_session()
        hint = get_hint(ch["current_state"], ch["target_state"])
        return jsonify({"success": True, **hint})
    except Exception as error:
        return jsonify({"success": False, "error": str(error)}), 400


@app.route("/api/challenge/solve", methods=["POST"])
def challenge_solve_api():
    try:
        ch = load_challenge_session()
        steps, seq = find_shortest_path(ch["initial_state"], ch["target_state"])
        rem_steps, rem_seq = find_shortest_path(ch["current_state"], ch["target_state"])
        return jsonify({
            "success": True,
            "optimal_steps": steps,
            "optimal_sequence": seq,
            "remaining_steps": rem_steps,
            "remaining_sequence": rem_seq,
        })
    except Exception as error:
        return jsonify({"success": False, "error": str(error)}), 400


@app.route("/api/challenge/presets", methods=["GET"])
def challenge_presets_api():
    try:
        presets = get_preset_challenges()
        out = [
            {
                "id": p["id"],
                "name": p["name"],
                "difficulty": p["difficulty"],
                "description": p["description"],
                "optimal_steps": p["optimal_steps"],
                "concept": p.get("concept", ""),
            }
            for p in presets
        ]
        return jsonify({"success": True, "presets": out})
    except Exception as error:
        return jsonify({"success": False, "error": str(error)}), 400


@app.route("/api/challenge/custom", methods=["POST"])
def challenge_custom_api():
    try:
        data = request.get_json(silent=True) or {}
        init_raw = data.get("initial", [{"real": 1, "imaginary": 0}, {"real": 0, "imaginary": 0}])
        target_raw = data.get("target", [{"real": 0, "imaginary": 0}, {"real": 1, "imaginary": 0}])

        def parse_vec(raw):
            if not isinstance(raw, list) or len(raw) != 2:
                raise ValueError("Must provide 2 amplitude components.")
            vals = []
            for item in raw:
                if isinstance(item, dict):
                    vals.append(complex(float(item.get("real", 0)), float(item.get("imaginary", 0))))
                else:
                    vals.append(complex(item))
            return np.array(vals, dtype=complex)

        init_vec = parse_vec(init_raw)
        target_vec = parse_vec(target_raw)

        res = create_custom_challenge(init_vec, target_vec)
        if not res["is_reachable"]:
            return jsonify({
                "success": False,
                "error": "Target state is not reachable within 6 steps using standard gates.",
            }), 400

        ch = {
            "initial_state": res["initial_state"],
            "target_state": res["target_state"],
            "current_state": res["initial_state"].copy(),
            "optimal_steps": res["optimal_steps"],
            "optimal_sequence": res["optimal_sequence"],
            "difficulty": "Custom",
            "description": res["description"],
            "name": "Custom Challenge",
            "concept": "Custom user-defined qubit transition",
            "gate_history": [],
        }
        save_challenge_session(ch)
        return jsonify(make_challenge_payload(ch))
    except Exception as error:
        return jsonify({"success": False, "error": str(error)}), 400


# =========================================================
# STATE HELPERS
# =========================================================

def save_state(state):
    """Save a normalized complex single-qubit state in the Flask session."""
    state = normalize_state(state)
    session["quantum_state_real"] = [float(value.real) for value in state]
    session["quantum_state_imag"] = [float(value.imag) for value in state]


def load_state():
    """Load the current single-qubit state, defaulting to |0⟩."""
    real = session.get("quantum_state_real")
    imag = session.get("quantum_state_imag")

    if real is None or imag is None:
        return zero_state()

    if not isinstance(real, list) or not isinstance(imag, list) or len(real) != len(imag):
        session.pop("quantum_state_real", None)
        session.pop("quantum_state_imag", None)
        return zero_state()

    state = np.array(
        [complex(r, i) for r, i in zip(real, imag)],
        dtype=complex
    )

    return normalize_state(state)


def state_payload(state):
    """Return the state in both machine-friendly and readable forms."""
    state = normalize_state(state)
    return {
        "state": [
            {
                "real": float(value.real),
                "imaginary": float(value.imag),
                "probability": float(abs(value) ** 2),
            }
            for value in state
        ],
        "state_dictionary": state_to_dictionary(state),
        "probabilities": probabilities(state).tolist(),
        "bloch_coordinates": bloch_coordinates(state),
    }


# =========================================================
# GET CURRENT QUBIT STATE
# =========================================================

@app.route("/api/state")
def get_state():
    state_defined = session.get("initial_state_defined", False)
    return jsonify({
        "success": True,
        "state_defined": bool(state_defined),
        **state_payload(load_state()),
    })


@app.route("/api/state/set", methods=["POST"])
def set_initial_state():
    try:
        data = request.get_json(silent=True) or {}
        raw_state = data.get("state")

        if not isinstance(raw_state, list) or len(raw_state) != 2:
            raise ValueError("A single-qubit state must contain exactly two amplitudes.")

        values = []
        for item in raw_state:
            if not isinstance(item, dict):
                raise ValueError("Each amplitude must contain real and imaginary values.")
            real = float(item.get("real", 0))
            imaginary = float(item.get("imaginary", 0))
            if not np.isfinite(real) or not np.isfinite(imaginary):
                raise ValueError("State amplitudes must be finite numbers.")
            values.append(complex(real, imaginary))

        state = normalize_state(np.array(values, dtype=complex))
        save_state(state)
        session["initial_state_real"] = [float(value.real) for value in state]
        session["initial_state_imag"] = [float(value.imag) for value in state]
        session["initial_state_defined"] = True

        return jsonify({
            "success": True,
            "state_defined": True,
            **state_payload(state),
            "message": "Initial qubit state set and normalized.",
        })
    except Exception as error:
        return jsonify({
            "success": False,
            "error": str(error),
        }), 400


# =========================================================
# SINGLE QUBIT GATE
# =========================================================

@app.route("/api/gate/<gate_name>", methods=["POST"])
def apply_gate_api(gate_name):
    try:
        if not session.get("initial_state_defined", False):
            raise ValueError("Define an initial qubit state before applying a gate.")

        current_state = load_state()
        final_state = apply_named_gate(current_state, gate_name)
        save_state(final_state)

        payload = state_payload(final_state)
        return jsonify({
            "success": True,
            "gate": gate_name.upper(),
            "before_state": state_payload(current_state)["state"],
            "before_state_dictionary": state_to_dictionary(current_state),
            "after_state": payload["state"],
            "after_state_dictionary": payload["state_dictionary"],
            "state": payload["state"],
            "state_dictionary": payload["state_dictionary"],
            "probabilities": payload["probabilities"],
            "bloch_coordinates": payload["bloch_coordinates"],
        })
    except Exception as error:
        return jsonify({
            "success": False,
            "error": str(error),
        }), 400


# =========================================================
# RESET QUBIT
# =========================================================

@app.route("/api/reset", methods=["POST"])
def reset():
    real = session.get("initial_state_real")
    imag = session.get("initial_state_imag")

    if (
        session.get("initial_state_defined", False)
        and isinstance(real, list)
        and isinstance(imag, list)
        and len(real) == 2
        and len(imag) == 2
    ):
        state = normalize_state(
            np.array([complex(r, i) for r, i in zip(real, imag)], dtype=complex)
        )
    else:
        state = zero_state()

    save_state(state)
    return jsonify({
        "success": True,
        "state_defined": bool(session.get("initial_state_defined", False)),
        **state_payload(state),
    })


# =========================================================
# CIRCUIT API
# =========================================================

@app.route("/api/circuit", methods=["POST"])
def run_circuit_api():
    try:
        data = request.get_json(silent=True) or {}
        gates = data.get("gates", [])

        if not isinstance(gates, list):
            raise ValueError("gates must be a list.")

        state = zero_state()
        steps = []

        for gate_name in gates:
            if not isinstance(gate_name, str):
                raise ValueError("Every circuit gate must be a string.")

            state = apply_named_gate(state, gate_name)
            payload = state_payload(state)
            steps.append({
                "gate": gate_name.upper(),
                "state": payload["state"],
                "state_dictionary": payload["state_dictionary"],
                "probabilities": payload["probabilities"],
            })

        final_payload = state_payload(state)
        return jsonify({
            "success": True,
            "gates": gates,
            "final_state": final_payload["state"],
            "final_state_dictionary": final_payload["state_dictionary"],
            "probabilities": final_payload["probabilities"],
            "steps": steps,
        })
    except Exception as error:
        return jsonify({
            "success": False,
            "error": str(error),
        }), 400


# =========================================================
# MEASUREMENT API
# =========================================================

@app.route("/api/measurement", methods=["POST"])
def measurement_api():
    try:
        data = request.get_json(silent=True) or {}
        shots = int(data.get("shots", 1000))

        if shots < 1 or shots > 10000:
            raise ValueError("Shots must be between 1 and 10000.")

        state = load_state()
        counts = measure_many(state, shots)
        percentages = measurement_percentages(state)

        return jsonify({
            "success": True,
            "shots": shots,
            "counts": counts,
            "probabilities": percentages,
            "state": state_payload(state)["state"],
        })
    except Exception as error:
        return jsonify({
            "success": False,
            "error": str(error),
        }), 400


# =========================================================
# ENTANGLEMENT API
# =========================================================

@app.route("/api/entanglement", methods=["POST"])
def entanglement_api():
    try:
        # Start with |00⟩.
        state = np.array([1, 0, 0, 0], dtype=complex)

        # Apply H to qubit 1.
        h = (1 / np.sqrt(2)) * np.array([
            [1, 1],
            [1, -1],
        ], dtype=complex)
        state = np.kron(h, np.eye(2, dtype=complex)) @ state

        # Apply CNOT (qubit 1 controls qubit 2).
        cnot = np.array([
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 0, 1],
            [0, 0, 1, 0],
        ], dtype=complex)
        state = cnot @ state
        state = normalize_state(state)

        basis_states = ["00", "01", "10", "11"]
        amplitudes = {}

        for basis, amplitude in zip(basis_states, state):
            amplitudes[basis] = {
                "real": float(amplitude.real),
                "imaginary": float(amplitude.imag),
                "probability": float(abs(amplitude) ** 2),
            }

        return jsonify({
            "success": True,
            "state": amplitudes,
            "probabilities": (np.abs(state) ** 2).tolist(),
            "entangled": True,
        })
    except Exception as error:
        return jsonify({
            "success": False,
            "error": str(error),
        }), 400


# =========================================================
# ENGINE TEST
# =========================================================

@app.route("/test")
def test():
    initial_state = zero_state()
    final_state = apply_named_gate(initial_state, "H")

    return jsonify({
        "success": True,
        "initial_state": state_to_dictionary(initial_state),
        "after_H_gate": state_to_dictionary(final_state),
        "probabilities": probabilities(final_state).tolist(),
        "bloch_coordinates": bloch_coordinates(final_state),
        "measurement_100_shots": measure_many(final_state, shots=100),
    })


# =========================================================
# START APPLICATION
# =========================================================

if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug)
