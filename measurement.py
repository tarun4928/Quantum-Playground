import numpy as np

from states import normalize_state


def measurement_probabilities(state):
    """
    Return probabilities of measuring each basis state.
    """
    state = normalize_state(state)
    probabilities = np.abs(state) ** 2

    # Remove tiny floating-point errors.
    probabilities = np.real_if_close(probabilities)
    probabilities = np.maximum(probabilities, 0)

    # Make sure probabilities add up to exactly 1.
    probabilities = probabilities / np.sum(probabilities)

    return probabilities


def measure_once(state):
    """
    Perform one quantum measurement.

    Returns the measured basis-state index.
    """
    probabilities = measurement_probabilities(state)

    outcomes = np.arange(len(probabilities))

    return int(
        np.random.choice(
            outcomes,
            p=probabilities
        )
    )


def measure_many(state, shots=1000):
    """
    Perform repeated measurements.

    Returns a dictionary containing the count
    for each possible result.
    """
    if shots <= 0:
        raise ValueError("Shots must be greater than zero.")

    probabilities = measurement_probabilities(state)

    outcomes = np.arange(len(probabilities))

    results = np.random.choice(
        outcomes,
        size=shots,
        p=probabilities
    )

    counts = {}

    for result in results:
        result = str(int(result))

        if result not in counts:
            counts[result] = 0

        counts[result] += 1

    return counts


def measurement_percentages(state):
    """
    Return measurement probabilities as percentages.
    """
    probabilities = measurement_probabilities(state)

    return [
        float(probability * 100)
        for probability in probabilities
    ]