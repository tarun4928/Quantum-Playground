import numpy as np


# Pauli-X gate
X = np.array([
    [0, 1],
    [1, 0]
], dtype=complex)


# Pauli-Y gate
Y = np.array([
    [0, -1j],
    [1j, 0]
], dtype=complex)


# Pauli-Z gate
Z = np.array([
    [1, 0],
    [0, -1]
], dtype=complex)


# Hadamard gate
H = (1 / np.sqrt(2)) * np.array([
    [1, 1],
    [1, -1]
], dtype=complex)


# Phase gate S
S = np.array([
    [1, 0],
    [0, 1j]
], dtype=complex)


# Phase gate T
T = np.array([
    [1, 0],
    [0, np.exp(1j * np.pi / 4)]
], dtype=complex)


# Identity gate
I = np.eye(2, dtype=complex)


# Controlled-NOT gate
CNOT = np.array([
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 0, 1],
    [0, 0, 1, 0]
], dtype=complex)


GATES = {
    "X": X,
    "Y": Y,
    "Z": Z,
    "H": H,
    "S": S,
    "T": T,
}


def get_gate(name):
    """Return a gate matrix by name."""
    name = name.upper()

    if name == "CNOT":
        return CNOT

    if name not in GATES:
        raise ValueError(f"Unknown gate: {name}")

    return GATES[name]