import numpy as np

from states import normalize_state


def bloch_coordinates(state):
    """
    Convert a single-qubit state into Bloch sphere coordinates.

    For:
        |psi> = alpha|0> + beta|1>

    returns:
        x, y, z
    """

    state = normalize_state(state)

    if len(state) != 2:
        raise ValueError(
            "Bloch sphere coordinates require exactly one qubit."
        )

    alpha = state[0]
    beta = state[1]

    x = 2 * np.real(np.conjugate(alpha) * beta)
    y = 2 * np.imag(np.conjugate(alpha) * beta)
    z = abs(alpha) ** 2 - abs(beta) ** 2

    return {
        "x": float(x),
        "y": float(y),
        "z": float(z)
    }


def bloch_angles(state):
    """
    Return theta and phi angles for the Bloch sphere.
    """

    coordinates = bloch_coordinates(state)

    x = coordinates["x"]
    y = coordinates["y"]
    z = coordinates["z"]

    z = np.clip(z, -1, 1)

    theta = np.arccos(z)
    phi = np.arctan2(y, x)

    return {
        "theta": float(theta),
        "phi": float(phi)
    }