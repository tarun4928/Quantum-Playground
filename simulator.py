import numpy as np

from states import normalize_state
from gates import get_gate, CNOT


def apply_gate(state, gate):
    """
    Apply a quantum gate to a state.
    """
    state = np.asarray(state, dtype=complex)
    gate = np.asarray(gate, dtype=complex)

    if gate.shape[1] != len(state):
        raise ValueError(
            f"Gate size {gate.shape} does not match "
            f"state size {state.shape}."
        )

    new_state = gate @ state

    return normalize_state(new_state)


def apply_named_gate(state, gate_name):
    """
    Apply a named single-qubit gate.
    """
    gate = get_gate(gate_name)
    return apply_gate(state, gate)


def apply_cnot(state):
    """
    Apply a CNOT gate to a two-qubit state.
    """
    return apply_gate(state, CNOT)


def probabilities(state):
    """
    Calculate measurement probabilities.
    """
    state = normalize_state(state)

    return np.abs(state) ** 2


def basis_labels(num_qubits):
    """
    Generate computational basis labels.

    Example:
    1 qubit -> ['0', '1']
    2 qubits -> ['00', '01', '10', '11']
    """
    return [
        format(i, f"0{num_qubits}b")
        for i in range(2 ** num_qubits)
    ]


def state_to_dictionary(state):
    """
    Convert a state vector into a readable dictionary.
    """
    state = normalize_state(state)

    num_states = len(state)
    num_qubits = int(np.log2(num_states))

    if 2 ** num_qubits != num_states:
        raise ValueError("State vector size must be a power of 2.")

    labels = basis_labels(num_qubits)

    result = {}

    for label, amplitude in zip(labels, state):
        result[label] = {
            "real": float(np.real(amplitude)),
            "imaginary": float(np.imag(amplitude)),
            "probability": float(abs(amplitude) ** 2)
        }

    return result