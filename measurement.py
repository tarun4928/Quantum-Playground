import numpy as np

from states import normalize_state


def measurement_probabilities(state):
    """Return normalized computational-basis probabilities."""
    state = normalize_state(state)
    probabilities = np.abs(state) ** 2
    probabilities = np.asarray(probabilities, dtype=float)
    probabilities = np.maximum(probabilities, 0.0)

    total = float(np.sum(probabilities))
    if total <= 0:
        raise ValueError("Measurement probabilities must have a positive total.")

    return probabilities / total


def measure_once(state):
    """Perform one projective measurement and return its basis-state index."""
    probabilities = measurement_probabilities(state)
    outcomes = np.arange(len(probabilities))
    return int(np.random.choice(outcomes, p=probabilities))


def measure_many(state, shots=1000):
    """Perform repeated measurements and return outcome counts."""
    if not isinstance(shots, (int, np.integer)) or shots <= 0:
        raise ValueError("Shots must be greater than zero.")

    probabilities = measurement_probabilities(state)
    outcomes = np.arange(len(probabilities))
    results = np.random.choice(outcomes, size=int(shots), p=probabilities)

    counts = {}
    for result in results:
        key = str(int(result))
        counts[key] = counts.get(key, 0) + 1

    return counts


def measurement_percentages(state):
    """Return measurement probabilities as percentages."""
    return [
        float(probability * 100)
        for probability in measurement_probabilities(state)
    ]
