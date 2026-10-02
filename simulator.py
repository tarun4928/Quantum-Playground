import numpy as np

from gates import CNOT, get_gate
from states import normalize_state


def apply_gate(state, gate):
    """Apply a square matrix gate to a quantum state."""
    state = np.asarray(state, dtype=complex)
    gate = np.asarray(gate, dtype=complex)

    if gate.ndim != 2 or gate.shape[0] != gate.shape[1]:
        raise ValueError("A quantum gate must be a square matrix.")

    if gate.shape[1] != len(state):
        raise ValueError(
            f"Gate size {gate.shape} does not match state size {state.shape}."
        )

    new_state = gate @ state
    return normalize_state(new_state)


def apply_named_gate(state, gate_name):
    """Apply a named quantum gate."""
    return apply_gate(state, get_gate(gate_name))


def apply_cnot(state):
    """Apply CNOT to a two-qubit state."""
    return apply_gate(state, CNOT)


def probabilities(state):
    """Calculate computational-basis measurement probabilities."""
    state = normalize_state(state)
    return np.abs(state) ** 2


def basis_labels(num_qubits):
    """Generate computational basis labels."""
    if num_qubits < 1:
        raise ValueError("The number of qubits must be at least 1.")

    return [format(i, f"0{num_qubits}b") for i in range(2 ** num_qubits)]


def state_to_dictionary(state):
    """Convert a state vector into a readable basis-state dictionary."""
    state = normalize_state(state)
    num_states = len(state)
    num_qubits = int(np.log2(num_states))

    if 2 ** num_qubits != num_states:
        raise ValueError("State vector size must be a power of 2.")

    labels = basis_labels(num_qubits)
    return {
        label: {
            "real": float(np.real(amplitude)),
            "imaginary": float(np.imag(amplitude)),
            "probability": float(abs(amplitude) ** 2),
        }
        for label, amplitude in zip(labels, state)
    }
