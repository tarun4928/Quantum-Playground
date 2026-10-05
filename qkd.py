import random

from bloch import bloch_coordinates
from measurement import measure_once
from simulator import apply_named_gate, state_to_dictionary
from states import normalize_state, zero_state


BASES = ("Z", "X")
ALLOWED_COUNTS = (4, 8, 16, 32)

# Sifted-key error tolerance: BB84 aborts when the observed error rate
# is clearly above the ideal value of zero.
ERROR_THRESHOLD = 0.15


def _prepare_state(bit, basis):
    """
    Alice prepares one qubit.

    Z basis: |0> for bit 0, X|0> = |1> for bit 1.
    X basis: H|0> = |+> for bit 0, H X|0> = |-> for bit 1.

    Returns (state, gates_used).
    """
    state = zero_state()
    gates = []

    if bit == 1:
        state = apply_named_gate(state, "X")
        gates.append("X")

    if basis == "X":
        state = apply_named_gate(state, "H")
        gates.append("H")

    return state, gates


def _measure_in_basis(state, basis):
    """
    Projectively measure a single qubit in the Z or X basis.

    An X-basis measurement applies H before a computational-basis
    measurement and rotates the post-measurement state back.

    Returns (outcome, post_measurement_state, gates_used).
    """
    gates = []
    working = state

    if basis == "X":
        working = apply_named_gate(working, "H")
        gates.append("H")

    outcome = measure_once(working)

    if outcome == 1:
        post = apply_named_gate(working, "X")
    else:
        post = working

    if basis == "X":
        post = apply_named_gate(post, "H")

    return outcome, normalize_state(post), gates


def _state_payload(state):
    return {
        "dictionary": state_to_dictionary(state),
        "bloch": bloch_coordinates(state),
    }


def _state_symbol(bit, basis):
    """Compact ket symbol for the four BB84 states."""
    if basis == "Z":
        return "|0⟩" if bit == 0 else "|1⟩"
    return "|+⟩" if bit == 0 else "|−⟩"


def run_bb84(count=16, eve_enabled=False):
    """
    Run one full BB84 protocol round and return a complete transcript.

    Every random choice and every measurement outcome is sampled
    physically: wrong-basis measurements are genuinely 50/50, so an
    eavesdropper intercepting every qubit injects ~25% errors into
    the sifted key on average.
    """
    count = int(count)
    if count not in ALLOWED_COUNTS:
        raise ValueError("Qubit count must be one of 4, 8, 16 or 32.")

    qubits = []

    for index in range(count):
        # 1. Alice: random bit and random basis.
        alice_bit = random.randint(0, 1)
        alice_basis = random.choice(BASES)
        state, alice_gates = _prepare_state(alice_bit, alice_basis)
        prepared = _state_payload(state)
        prepared["symbol"] = _state_symbol(alice_bit, alice_basis)

        # 2. Eve: intercept-resend attack (when enabled).
        eve_info = None
        if eve_enabled:
            eve_basis = random.choice(BASES)
            eve_result, state, eve_gates = _measure_in_basis(state, eve_basis)
            resent = _state_payload(state)
            resent["symbol"] = _state_symbol(eve_result, eve_basis)
            eve_info = {
                "basis": eve_basis,
                "gates": eve_gates,
                "result": eve_result,
                "resent": resent,
            }

        # 3. Bob: independent random basis, then measurement.
        bob_basis = random.choice(BASES)
        bob_result, _, bob_gates = _measure_in_basis(state, bob_basis)

        kept = alice_basis == bob_basis

        qubits.append({
            "index": index,
            "alice_bit": alice_bit,
            "alice_basis": alice_basis,
            "alice_gates": alice_gates,
            "prepared": prepared,
            "eve": eve_info,
            "bob_basis": bob_basis,
            "bob_gates": bob_gates,
            "bob_result": bob_result,
            "bases_match": kept,
            "kept": kept,
        })

    # 4. Sifting: keep only the positions where the bases agree.
    sifted_indices = [q["index"] for q in qubits if q["kept"]]
    alice_key = [qubits[i]["alice_bit"] for i in sifted_indices]
    bob_key = [qubits[i]["bob_result"] for i in sifted_indices]

    # 5. Verification: reveal a sample of sifted bits to estimate
    #    the quantum bit error rate (QBER).
    sample_size = max(1, len(sifted_indices) // 2) if sifted_indices else 0
    if sifted_indices:
        sample_positions = sorted(random.sample(range(len(sifted_indices)), sample_size))
    else:
        sample_positions = []

    sample_alice = [alice_key[p] for p in sample_positions]
    sample_bob = [bob_key[p] for p in sample_positions]
    sample_errors = sum(1 for a, b in zip(sample_alice, sample_bob) if a != b)

    if sample_size:
        error_rate = sample_errors / sample_size
        accepted = error_rate <= ERROR_THRESHOLD
    else:
        error_rate = None
        accepted = False

    return {
        "params": {
            "count": count,
            "eve": bool(eve_enabled),
        },
        "qubits": qubits,
        "summary": {
            "sent": count,
            "kept": len(sifted_indices),
            "sifted_indices": sifted_indices,
            "alice_key": alice_key,
            "bob_key": bob_key,
            "sample": {
                "positions": sample_positions,
                "alice": sample_alice,
                "bob": sample_bob,
                "errors": sample_errors,
                "size": sample_size,
                "error_rate": error_rate,
            },
            "threshold": ERROR_THRESHOLD,
            "accepted": accepted,
        },
    }
