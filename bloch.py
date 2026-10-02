import numpy as np

from states import normalize_state


def bloch_coordinates(state):
    """
    Convert a single-qubit state alpha|0⟩ + beta|1⟩ to Bloch coordinates.
    """
    state = normalize_state(state)

    if len(state) != 2:
        raise ValueError("Bloch sphere coordinates require exactly one qubit.")

    alpha = state[0]
    beta = state[1]

    x = 2 * np.real(np.conjugate(alpha) * beta)
    y = 2 * np.imag(np.conjugate(alpha) * beta)
    z = abs(alpha) ** 2 - abs(beta) ** 2

    return {
        "x": float(x),
        "y": float(y),
        "z": float(z),
    }


def bloch_angles(state):
    """Return polar and azimuthal Bloch-sphere angles in radians."""
    coordinates = bloch_coordinates(state)
    z = np.clip(coordinates["z"], -1, 1)
    theta = np.arccos(z)
    phi = np.arctan2(coordinates["y"], coordinates["x"])

    return {
        "theta": float(theta),
        "phi": float(phi),
    }
