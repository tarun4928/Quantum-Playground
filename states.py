import numpy as np


def zero_state():
    """Return the |0> state."""
    return np.array([1 + 0j, 0 + 0j], dtype=complex)


def one_state():
    """Return the |1> state."""
    return np.array([0 + 0j, 1 + 0j], dtype=complex)


def plus_state():
    """Return the |+> state."""
    return np.array([1 / np.sqrt(2), 1 / np.sqrt(2)], dtype=complex)


def minus_state():
    """Return the |-> state."""
    return np.array([1 / np.sqrt(2), -1 / np.sqrt(2)], dtype=complex)


def normalize_state(state):
    """Normalize a quantum state."""
    state = np.asarray(state, dtype=complex)
    norm = np.linalg.norm(state)

    if norm == 0:
        raise ValueError("A quantum state cannot have zero magnitude.")

    return state / norm


def state_probabilities(state):
    """Return measurement probabilities for a state."""
    state = normalize_state(state)
    return np.abs(state) ** 2