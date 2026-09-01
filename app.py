from flask import Flask, render_template, jsonify, request, session

from states import zero_state
from simulator import (
    apply_named_gate,
    probabilities,
    state_to_dictionary
)
from measurement import (
    measure_many,
    measurement_percentages
)
from bloch import bloch_coordinates


app = Flask(__name__)

# Used to keep the qubit state during the current browser session.
app.secret_key = "quantum-playground-secret-key"


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


# =========================================================
# STATE HELPERS
# =========================================================

def save_state(state):
    """
    Save a complex quantum state in the browser session.
    """
    session["quantum_state_real"] = [
        float(value.real)
        for value in state
    ]

    session["quantum_state_imag"] = [
        float(value.imag)
        for value in state
    ]


def load_state():
    """
    Load the current quantum state.
    If no state exists, start with |0>.
    """

    real = session.get("quantum_state_real")
    imag = session.get("quantum_state_imag")

    if real is None or imag is None:
        return zero_state()

    import numpy as np

    return np.array(
        [
            complex(r, i)
            for r, i in zip(real, imag)
        ],
        dtype=complex
    )


# =========================================================
# GET CURRENT QUBIT STATE
# =========================================================

@app.route("/api/state")
def get_state():

    state = load_state()

    return jsonify({

        "success": True,

        "state":
            state_to_dictionary(state),

        "probabilities":
            probabilities(state).tolist(),

        "bloch_coordinates":
            bloch_coordinates(state)

    })


# =========================================================
# SINGLE QUBIT GATE
# =========================================================

@app.route("/api/gate/<gate_name>", methods=["POST"])
def apply_gate_api(gate_name):

    try:

        # Load current state
        current_state = load_state()

        # Apply selected gate
        final_state = apply_named_gate(
            current_state,
            gate_name
        )

        # Save new state
        save_state(final_state)

        return jsonify({

            "success": True,

            "gate":
                gate_name.upper(),

            "before_state":
                state_to_dictionary(current_state),

            "after_state":
                state_to_dictionary(final_state),

            "probabilities":
                probabilities(final_state).tolist(),

            "bloch_coordinates":
                bloch_coordinates(final_state)

        })

    except Exception as error:

        return jsonify({

            "success": False,

            "error": str(error)

        }), 400


# =========================================================
# RESET QUBIT
# =========================================================

@app.route("/api/reset", methods=["POST"])
def reset():

    state = zero_state()

    save_state(state)

    return jsonify({

        "success": True,

        "state":
            state_to_dictionary(state),

        "probabilities":
            probabilities(state).tolist(),

        "bloch_coordinates":
            bloch_coordinates(state)

    })


# =========================================================
# CIRCUIT API
# =========================================================

@app.route("/api/circuit", methods=["POST"])
def run_circuit_api():

    try:

        data = request.get_json()

        gates = data.get("gates", [])

        state = zero_state()

        steps = []

        for gate_name in gates:

            state = apply_named_gate(
                state,
                gate_name
            )

            steps.append({

                "gate":
                    gate_name.upper(),

                "state":
                    state_to_dictionary(state)

            })

        return jsonify({

            "success": True,

            "gates": gates,

            "final_state":
                state_to_dictionary(state),

            "probabilities":
                probabilities(state).tolist(),

            "steps": steps

        })

    except Exception as error:

        return jsonify({

            "success": False,

            "error": str(error)

        }), 400


# =========================================================
# MEASUREMENT API
# =========================================================

@app.route("/api/measurement", methods=["POST"])
def measurement_api():

    try:

        data = request.get_json()

        shots = int(
            data.get("shots", 1000)
        )

        state = load_state()

        counts = measure_many(
            state,
            shots
        )

        percentages = (
            measurement_percentages(state)
        )

        return jsonify({

            "success": True,

            "shots": shots,

            "counts": counts,

            "probabilities":
                percentages

        })

    except Exception as error:

        return jsonify({

            "success": False,

            "error": str(error)

        }), 400

# =========================================================
# ENTANGLEMENT API
# =========================================================

@app.route("/api/entanglement", methods=["POST"])
def entanglement_api():

    try:

        import numpy as np

        # |00>
        state = np.array(
            [1, 0, 0, 0],
            dtype=complex
        )

        # H on first qubit
        h = (1 / np.sqrt(2)) * np.array([
            [1, 1],
            [1, -1]
        ], dtype=complex)

        identity = np.eye(2)

        h_first = np.kron(h, identity)

        state = h_first @ state

        # CNOT
        cnot = np.array([
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 0, 1],
            [0, 0, 1, 0]
        ], dtype=complex)

        state = cnot @ state

        amplitudes = {}

        basis_states = [
            "00",
            "01",
            "10",
            "11"
        ]

        for basis, amplitude in zip(
            basis_states,
            state
        ):

            amplitudes[basis] = {
                "real": float(amplitude.real),
                "imaginary": float(amplitude.imag)
            }

        probabilities_list = (
            np.abs(state) ** 2
        )

        return jsonify({

            "success": True,

            "state": amplitudes,

            "probabilities":
                probabilities_list.tolist(),

            "entangled": True

        })

    except Exception as error:

        return jsonify({

            "success": False,
            "error": str(error)

        }), 400
# =========================================================
# ENGINE TEST
# =========================================================

@app.route("/test")
def test():

    initial_state = zero_state()

    final_state = apply_named_gate(
        initial_state,
        "H"
    )

    return jsonify({

        "initial_state":
            state_to_dictionary(initial_state),

        "after_H_gate":
            state_to_dictionary(final_state),

        "probabilities":
            probabilities(final_state).tolist(),

        "bloch_coordinates":
            bloch_coordinates(final_state),

        "measurement_100_shots":
            measure_many(
                final_state,
                shots=100
            )

    })


# =========================================================
# START APPLICATION
# =========================================================

if __name__ == "__main__":

    app.run(
        debug=True
    )