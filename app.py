import os

import numpy as np
from flask import Flask, jsonify, render_template, request, session

from bloch import bloch_coordinates
from measurement import measure_many, measurement_percentages
from operator_lab import analyze_operator
from simulator import apply_named_gate, probabilities, state_to_dictionary
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
