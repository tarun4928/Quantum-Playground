import cmath
import math

import numpy as np


TOLERANCE = 1e-8


def parse_complex(value, name="value"):
    """Parse a real/complex number such as 2, -1.5, i, 1+i, or 2-3i."""
    if value is None:
        raise ValueError(f"{name} is required.")

    text = str(value).strip().replace(" ", "").replace("I", "i").replace("j", "i")
    if not text:
        raise ValueError(f"{name} is required.")

    if text in {"i", "+i"}:
        return 1j
    if text == "-i":
        return -1j

    try:
        number = complex(text.replace("i", "j"))
    except ValueError as error:
        raise ValueError(
            f"Invalid {name}: '{value}'. Use numbers such as 2, -0.5, i, 1+i or 2-3i."
        ) from error

    if not math.isfinite(number.real) or not math.isfinite(number.imag):
        raise ValueError(f"{name} must be finite.")

    return number


def parse_matrix(raw_matrix):
    if not isinstance(raw_matrix, list) or len(raw_matrix) != 2:
        raise ValueError("Matrix A must contain exactly 2 rows.")

    matrix = []
    for row_index, row in enumerate(raw_matrix, start=1):
        if not isinstance(row, list) or len(row) != 2:
            raise ValueError("Matrix A must be exactly 2 × 2.")
        matrix.append([
            parse_complex(value, f"A[{row_index},{column_index}]")
            for column_index, value in enumerate(row, start=1)
        ])

    return np.array(matrix, dtype=complex)


def parse_vector(raw_vector):
    if not isinstance(raw_vector, list) or len(raw_vector) != 2:
        raise ValueError("Column vector X must contain exactly 2 entries.")

    vector = np.array(
        [parse_complex(value, f"X[{index}]") for index, value in enumerate(raw_vector, start=1)],
        dtype=complex,
    )

    if np.linalg.norm(vector) <= TOLERANCE:
        raise ValueError("Column vector X cannot be the zero vector.")

    return vector


def clean_number(value):
    value = float(value)
    if abs(value) < 5e-10:
        return 0.0
    return value


def serialize_complex(value):
    value = complex(value)
    return {
        "real": clean_number(value.real),
        "imaginary": clean_number(value.imag),
        "magnitude": float(abs(value)),
        "phase_degrees": float(math.degrees(cmath.phase(value))) if abs(value) > TOLERANCE else 0.0,
    }


def serialize_vector(vector):
    return [serialize_complex(value) for value in vector]


def vector_magnitude(vector):
    return float(np.linalg.norm(np.asarray(vector, dtype=complex)))


def vector_is_real(vector):
    vector = np.asarray(vector, dtype=complex)
    return bool(np.all(np.abs(vector.imag) <= TOLERANCE))


def real_component_geometry(vector):
    """Return x/y component geometry for a real two-component vector."""
    vector = np.asarray(vector, dtype=complex)
    if not vector_is_real(vector):
        return None
    return {
        "x": clean_number(vector[0].real),
        "y": clean_number(vector[1].real),
        "magnitude": vector_magnitude(vector),
    }


def bloch_coordinates_from_vector(vector):
    """Return Bloch coordinates of the normalized 2-component vector."""
    vector = np.asarray(vector, dtype=complex)
    norm = np.linalg.norm(vector)
    if norm <= TOLERANCE:
        return None

    alpha, beta = vector / norm
    x = 2 * np.real(np.conjugate(alpha) * beta)
    y = 2 * np.imag(np.conjugate(alpha) * beta)
    z = abs(alpha) ** 2 - abs(beta) ** 2

    return {
        "x": float(x),
        "y": float(y),
        "z": float(z),
    }


def is_unitary(matrix):
    identity = np.eye(2, dtype=complex)
    return bool(np.allclose(matrix.conj().T @ matrix, identity, atol=TOLERANCE, rtol=TOLERANCE))


def characteristic_data(matrix):
    trace = np.trace(matrix)
    determinant = np.linalg.det(matrix)

    # det(A - λI) = λ² - tr(A)λ + det(A)
    return {
        "trace": serialize_complex(trace),
        "determinant": serialize_complex(determinant),
        "lambda_squared_coefficient": serialize_complex(1),
        "lambda_coefficient": serialize_complex(-trace),
        "constant_coefficient": serialize_complex(determinant),
    }


def eigen_data(matrix):
    eigenvalues, eigenvectors = np.linalg.eig(matrix)
    results = []

    for index, eigenvalue in enumerate(eigenvalues):
        vector = eigenvectors[:, index]
        norm = np.linalg.norm(vector)
        if norm <= TOLERANCE:
            continue
        vector = vector / norm

        # Fix a deterministic global phase where possible.
        nonzero_indices = np.where(np.abs(vector) > TOLERANCE)[0]
        if len(nonzero_indices) > 0:
            pivot = nonzero_indices[0]
            phase = cmath.phase(vector[pivot])
            vector = vector * np.exp(-1j * phase)
            if vector[pivot].real < 0 and abs(vector[pivot].imag) < TOLERANCE:
                vector = -vector

        results.append({
            "eigenvalue": serialize_complex(eigenvalue),
            "vector": serialize_vector(vector),
            "bloch_coordinates": bloch_coordinates_from_vector(vector),
        })

    return results


def find_scalar_and_residual(vector, transformed):
    denominator = np.vdot(vector, vector)
    scalar = np.vdot(vector, transformed) / denominator
    residual = transformed - scalar * vector
    residual_norm = float(np.linalg.norm(residual))
    return scalar, residual, residual_norm


def test_eigenvector(matrix, vector):
    transformed = matrix @ vector
    scalar, residual, residual_norm = find_scalar_and_residual(vector, transformed)

    eigenvalues, _ = np.linalg.eig(matrix)
    matching_eigenvalue = None
    for eigenvalue in eigenvalues:
        if abs(eigenvalue - scalar) <= 1e-7:
            matching_eigenvalue = eigenvalue
            break

    is_eigen = residual_norm <= 1e-7
    scalar_for_test = matching_eigenvalue if is_eigen and matching_eigenvalue is not None else scalar
    lambda_vector = scalar_for_test * vector if is_eigen else None

    magnitude = abs(scalar_for_test) if is_eigen else None
    phase = (
        math.degrees(cmath.phase(scalar_for_test))
        if is_eigen and abs(scalar_for_test) > TOLERANCE
        else None
    )

    if not is_eigen:
        behavior = "Not a scalar multiple"
    elif abs(magnitude - 1) <= 1e-7:
        behavior = "Same magnitude"
    elif magnitude > 1:
        behavior = "Expanded / stretched"
    else:
        behavior = "Compressed"

    input_bloch = bloch_coordinates_from_vector(vector)
    output_bloch = bloch_coordinates_from_vector(transformed)
    same_bloch_direction = False
    if is_eigen and input_bloch is not None and output_bloch is not None:
        same_bloch_direction = all(
            abs(input_bloch[key] - output_bloch[key]) <= 1e-7
            for key in ("x", "y", "z")
        )

    return {
        "is_eigenvector": is_eigen,
        "matching_eigenvalue": serialize_complex(scalar_for_test) if is_eigen else None,
        "ax": serialize_vector(transformed),
        "lambda_x": serialize_vector(lambda_vector) if lambda_vector is not None else None,
        "residual": serialize_vector(residual),
        "residual_norm": residual_norm,
        "scale_magnitude": float(magnitude) if magnitude is not None else None,
        "phase_degrees": float(phase) if phase is not None else None,
        "behavior": behavior,
        "bloch_input": input_bloch,
        "bloch_output": output_bloch,
        "same_bloch_direction": same_bloch_direction,
        "input_magnitude": vector_magnitude(vector),
        "output_magnitude": vector_magnitude(transformed),
        "magnitude_ratio": (
            vector_magnitude(transformed) / vector_magnitude(vector)
            if vector_magnitude(vector) > TOLERANCE
            else None
        ),
        "input_geometry": real_component_geometry(vector),
        "output_geometry": real_component_geometry(transformed),
    }


def analyze_operator(payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")

    matrix = parse_matrix(payload.get("matrix"))
    vector = parse_vector(payload.get("vector"))

    transformed = matrix @ vector
    characteristic = characteristic_data(matrix)
    eigenpairs = eigen_data(matrix)
    test = test_eigenvector(matrix, vector)
    unitary = is_unitary(matrix)

    return {
        "matrix": [[serialize_complex(value) for value in row] for row in matrix],
        "vector": serialize_vector(vector),
        "transformed_vector": serialize_vector(transformed),
        "input_bloch": bloch_coordinates_from_vector(vector),
        "output_bloch": bloch_coordinates_from_vector(transformed),
        "input_magnitude": vector_magnitude(vector),
        "output_magnitude": vector_magnitude(transformed),
        "input_geometry": real_component_geometry(vector),
        "output_geometry": real_component_geometry(transformed),
        "characteristic": characteristic,
        "eigenvalues": [item["eigenvalue"] for item in eigenpairs],
        "eigenvectors": eigenpairs,
        "test": test,
        "is_unitary": unitary,
        "operator_type": "Quantum Gate" if unitary else "Mathematical Operator",
    }
