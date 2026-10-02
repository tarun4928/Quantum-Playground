/* =====================================================
   QUANTUM PLAYGROUND
   Main JavaScript
===================================================== */

let currentState = null;


/* =====================================================
   STATE HELPERS
===================================================== */

function getStatePayload(data) {
    return data?.state ?? data?.after_state ?? data?.final_state ?? null;
}

function getComplexValue(value) {
    if (value === null || value === undefined) {
        return { re: 0, im: 0 };
    }

    if (typeof value === "object") {
        return {
            re: Number(value.real ?? value.re ?? 0),
            im: Number(value.imaginary ?? value.imag ?? value.im ?? 0)
        };
    }

    if (typeof value === "number") {
        return { re: value, im: 0 };
    }

    return { re: 0, im: 0 };
}

function cleanDisplayNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || Math.abs(n) < 0.0005) return 0;
    return Number(n.toFixed(3));
}

function formatComplexCoefficient(value) {
    const { re: rawRe, im: rawIm } = getComplexValue(value);
    const re = cleanDisplayNumber(rawRe);
    const im = cleanDisplayNumber(rawIm);

    if (re === 0 && im === 0) return "";
    if (im === 0) return String(re);
    if (re === 0) {
        if (im === 1) return "i";
        if (im === -1) return "-i";
        return `${im}i`;
    }

    const sign = im >= 0 ? "+" : "-";
    const imag = Math.abs(im) === 1 ? "i" : `${Math.abs(im)}i`;
    return `${re}${sign}${imag}`;
}

function formatQuantumState(state) {
    if (!state) return "|0⟩";

    // The backend uses a dictionary: {"0": {real, imaginary, ...}, ...}
    // Arrays are also accepted for compatibility with older frontend data.
    const entries = Array.isArray(state)
        ? state.map((value, index) => [String(index), value])
        : Object.entries(state);

    if (entries.length === 0) return "0";

    const terms = [];

    entries.forEach(([basis, amplitude]) => {
        const { re: rawRe, im: rawIm } = getComplexValue(amplitude);
        const re = cleanDisplayNumber(rawRe);
        const im = cleanDisplayNumber(rawIm);

        if (re === 0 && im === 0) return;

        const ket = `|${basis}⟩`;

        if (im === 0) {
            if (re === 1) terms.push(ket);
            else if (re === -1) terms.push(`-${ket}`);
            else terms.push(`${re}${ket}`);
        } else {
            terms.push(`(${formatComplexCoefficient({ re, im })})${ket}`);
        }
    });

    return terms.join(" + ") || "0";
}


/* =====================================================
   LOAD CURRENT STATE
===================================================== */

async function loadState() {
    try {
        const response = await fetch("/api/state", { cache: "no-store" });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || `Request failed (${response.status})`);
        }

        currentState = data.state_defined ? getStatePayload(data) : null;
        updateSingleQubitDisplay(data);
        updateMeasurementState(data);
        updateStateControls(Boolean(data.state_defined));
    } catch (error) {
        console.error("Could not connect to Quantum Engine.", error);
    }
}


/* =====================================================
   SINGLE-QUBIT DISPLAY
===================================================== */

function updateSingleQubitDisplay(data) {
    const defined = Boolean(data?.state_defined ?? true);
    const state = getStatePayload(data);
    const stateElement = document.getElementById("stateDisplay");
    const probability0 = document.getElementById("prob0");
    const probability1 = document.getElementById("prob1");
    const bar0 = document.getElementById("bar0");
    const bar1 = document.getElementById("bar1");

    if (stateElement) {
        stateElement.textContent = defined ? formatQuantumState(state) : "Not defined";
    }

    if (Array.isArray(data.probabilities) && defined) {
        const p0 = Number(data.probabilities[0] ?? 0);
        const p1 = Number(data.probabilities[1] ?? 0);

        if (probability0) probability0.textContent = `${(p0 * 100).toFixed(1)}%`;
        if (probability1) probability1.textContent = `${(p1 * 100).toFixed(1)}%`;
        if (bar0) bar0.style.width = `${Math.max(0, Math.min(100, p0 * 100))}%`;
        if (bar1) bar1.style.width = `${Math.max(0, Math.min(100, p1 * 100))}%`;
    } else {
        if (probability0) probability0.textContent = "—";
        if (probability1) probability1.textContent = "—";
        if (bar0) bar0.style.width = "0%";
        if (bar1) bar1.style.width = "0%";
    }

    if (defined) {
        updateBlochSphere(data);
    } else {
        renderBlochSpherePlaceholder();
    }
}

function updateMeasurementState(data) {
    const element = document.getElementById("measurementState");
    if (!element) return;

    element.textContent = formatQuantumState(getStatePayload(data));
}


function updateStateControls(enabled) {
    document.querySelectorAll(".single-gate-control").forEach(button => {
        button.disabled = !enabled;
    });

    const resetButton = document.getElementById("resetQubitButton");
    if (resetButton) resetButton.disabled = !enabled;
}

function setInitialInputValues(values) {
    const ids = ["initialReal0", "initialImag0", "initialReal1", "initialImag1"];
    ids.forEach((id, index) => {
        const element = document.getElementById(id);
        if (element) element.value = values[index];
    });
    updateInitialVectorPreview();
}

function setPresetState(name) {
    const s = 1 / Math.sqrt(2);
    const presets = {
        zero: [1, 0, 0, 0],
        one: [0, 0, 1, 0],
        plus: [s, 0, s, 0],
        minus: [s, 0, -s, 0],
    };
    if (presets[name]) setInitialInputValues(presets[name]);
}

function getInitialStateFromInputs() {
    const read = id => {
        const element = document.getElementById(id);
        if (!element || element.value.trim() === "") return null;
        const value = Number(element.value);
        return Number.isFinite(value) ? value : null;
    };

    const values = [
        read("initialReal0"),
        read("initialImag0"),
        read("initialReal1"),
        read("initialImag1"),
    ];

    if (values.some(value => value === null)) return null;
    if (Math.hypot(...values) === 0) return null;

    return [
        { real: values[0], imaginary: values[1] },
        { real: values[2], imaginary: values[3] },
    ];
}

function previewBlochCoordinates(vector) {
    if (!vector) return null;
    const magnitude = Math.hypot(
        vector[0].real, vector[0].imaginary,
        vector[1].real, vector[1].imaginary
    );
    if (magnitude === 0) return null;

    const a = { real: vector[0].real / magnitude, imaginary: vector[0].imaginary / magnitude };
    const b = { real: vector[1].real / magnitude, imaginary: vector[1].imaginary / magnitude };
    return {
        x: 2 * (a.real * b.real + a.imaginary * b.imaginary),
        y: 2 * (a.real * b.imaginary - a.imaginary * b.real),
        z: a.real * a.real + a.imaginary * a.imaginary - b.real * b.real - b.imaginary * b.imaginary,
    };
}

function updateInitialVectorPreview() {
    const vector = getInitialStateFromInputs();
    const preview = document.getElementById("initialVectorPreview");
    const message = document.getElementById("initialStateMessage");

    if (!vector) {
        if (preview) preview.textContent = "Enter a non-zero vector to preview it.";
        if (message) message.textContent = "Enter all four values to define your initial state.";
        updatePreviewCoordinates(null);
        renderBlochSpherePlaceholder();
        return;
    }

    if (preview) {
        const a = formatComplexCoefficient(vector[0]) || "0";
        const b = formatComplexCoefficient(vector[1]) || "0";
        preview.innerHTML = String.raw`\[\lvert\psi\rangle = \begin{bmatrix} ${a} \\ ${b} \end{bmatrix}\]`;
        if (window.MathJax?.typesetPromise) MathJax.typesetPromise([preview]);
    }

    if (message) message.textContent = "Ready to set this state. The simulator will normalize it.";
    const coords = previewBlochCoordinates(vector);
    updatePreviewCoordinates(coords);
    renderBlochSphere("blochSphere", coords, "Preview");
}

function updatePreviewCoordinates(coords) {
    const cx = document.getElementById("coordX");
    const cy = document.getElementById("coordY");
    const cz = document.getElementById("coordZ");
    if (!coords) {
        if (cx) cx.textContent = "—";
        if (cy) cy.textContent = "—";
        if (cz) cz.textContent = "—";
        return;
    }
    if (cx) cx.textContent = Number(coords.x).toFixed(2);
    if (cy) cy.textContent = Number(coords.y).toFixed(2);
    if (cz) cz.textContent = Number(coords.z).toFixed(2);
}

async function setInitialState() {
    const state = getInitialStateFromInputs();
    if (!state) {
        alert("Please enter a valid non-zero two-component column vector.");
        return;
    }

    const button = document.querySelector('.state-definition-panel .primary-btn');
    if (button) {
        button.disabled = true;
        button.textContent = "Setting...";
    }

    try {
        const response = await fetch("/api/state/set", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ state })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || `State request failed (${response.status})`);
        }

        currentState = getStatePayload(data);
        updateSingleQubitDisplay(data);
        updateMeasurementState(data);
        updateStateControls(true);

        const message = document.getElementById("initialStateMessage");
        if (message) message.textContent = "Initial state set. You can now apply quantum gates.";
    } catch (error) {
        console.error(error);
        alert(`State Error: ${error.message}`);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Set Initial State";
        }
    }
}


/* =====================================================
   APPLY SINGLE-QUBIT GATE
===================================================== */

async function applyGate(gateName) {
    try {
        const response = await fetch(`/api/gate/${encodeURIComponent(gateName)}`, {
            method: "POST",
            headers: { "Accept": "application/json" }
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || `Gate request failed (${response.status})`);
        }

        currentState = getStatePayload(data);
        updateSingleQubitDisplay(data);
    } catch (error) {
        console.error(error);
        alert(`Gate Error: ${error.message}`);
    }
}


/* =====================================================
   RESET SINGLE QUBIT
===================================================== */

async function resetState() {
    try {
        const response = await fetch("/api/reset", {
            method: "POST",
            headers: { "Accept": "application/json" }
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || `Reset request failed (${response.status})`);
        }

        currentState = data.state_defined ? getStatePayload(data) : null;
        updateSingleQubitDisplay(data);
        updateMeasurementState(data);
        updateStateControls(Boolean(data.state_defined));
    } catch (error) {
        console.error(error);
        alert(`Reset Error: ${error.message}`);
    }
}

// Compatibility with the names used by the current HTML.
function resetQubit() {
    return resetState();
}


function renderBlochSpherePlaceholder(targetId = "blochSphere", title = "Input State") {
    const sphere = document.getElementById(targetId);
    if (!sphere || !window.Plotly) return;

    const theta = Array.from({ length: 35 }, (_, i) => Math.PI * i / 34);
    const phi = Array.from({ length: 35 }, (_, i) => 2 * Math.PI * i / 34);
    const sx = [], sy = [], sz = [];

    theta.forEach(t => {
        const rx = [], ry = [], rz = [];
        phi.forEach(p => {
            rx.push(Math.sin(t) * Math.cos(p));
            ry.push(Math.sin(t) * Math.sin(p));
            rz.push(Math.cos(t));
        });
        sx.push(rx);
        sy.push(ry);
        sz.push(rz);
    });

    Plotly.react(sphere, [{
        x: sx, y: sy, z: sz, type: "surface", opacity: 0.10, showscale: false, hoverinfo: "skip"
    }], {
        margin: { l: 0, r: 0, t: 25, b: 0 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        scene: {
            xaxis: { title: "X", range: [-1.2, 1.2] },
            yaxis: { title: "Y", range: [-1.2, 1.2] },
            zaxis: { title: "Z", range: [-1.2, 1.2] },
            aspectmode: "cube"
        },
        showlegend: false,
        title: { text: title, font: { size: 13 } }
    }, { responsive: true });
}


/* =====================================================
   BLOCH SPHERE
===================================================== */

function updateBlochSphere(data) {
    const sphere = document.getElementById("blochSphere");
    if (!sphere || !window.Plotly) return;

    // Prefer the coordinates calculated by the Python engine.
    // Fall back to computing them from the state when necessary.
    let coordinates = data?.bloch_coordinates;

    if (!coordinates) {
        const state = getStatePayload(data);
        if (!state) {
            renderBlochSpherePlaceholder();
            return;
        }
        const entries = Array.isArray(state)
            ? state
            : Object.keys(state || {}).sort((a, b) => Number(a) - Number(b)).map(k => state[k]);

        if (!entries || entries.length < 2) return;

        const alpha = getComplexValue(entries[0]);
        const beta = getComplexValue(entries[1]);
        const productRe = alpha.re * beta.re + alpha.im * beta.im;
        const productIm = alpha.re * beta.im - alpha.im * beta.re;

        coordinates = {
            x: 2 * productRe,
            y: 2 * productIm,
            z:
                alpha.re * alpha.re + alpha.im * alpha.im -
                beta.re * beta.re - beta.im * beta.im
        };
    }

    const x = Number(coordinates.x ?? 0);
    const y = Number(coordinates.y ?? 0);
    const z = Number(coordinates.z ?? 1);

    const coordX = document.getElementById("coordX");
    const coordY = document.getElementById("coordY");
    const coordZ = document.getElementById("coordZ");

    if (coordX) coordX.textContent = x.toFixed(2);
    if (coordY) coordY.textContent = y.toFixed(2);
    if (coordZ) coordZ.textContent = z.toFixed(2);

    const theta = Array.from({ length: 50 }, (_, i) => Math.PI * i / 49);
    const phi = Array.from({ length: 50 }, (_, i) => 2 * Math.PI * i / 49);
    const sphereX = [];
    const sphereY = [];
    const sphereZ = [];

    theta.forEach(t => {
        const rowX = [];
        const rowY = [];
        const rowZ = [];

        phi.forEach(p => {
            rowX.push(Math.sin(t) * Math.cos(p));
            rowY.push(Math.sin(t) * Math.sin(p));
            rowZ.push(Math.cos(t));
        });

        sphereX.push(rowX);
        sphereY.push(rowY);
        sphereZ.push(rowZ);
    });

    const surface = {
        x: sphereX,
        y: sphereY,
        z: sphereZ,
        type: "surface",
        opacity: 0.15,
        showscale: false,
        hoverinfo: "skip"
    };

    const point = {
        x: [x],
        y: [y],
        z: [z],
        type: "scatter3d",
        mode: "markers",
        marker: { size: 7 },
        name: "Quantum State",
        hovertemplate: "x=%{x:.3f}<br>y=%{y:.3f}<br>z=%{z:.3f}<extra></extra>"
    };

    const vector = {
        x: [0, x],
        y: [0, y],
        z: [0, z],
        type: "scatter3d",
        mode: "lines",
        line: { width: 6 },
        name: "State Vector",
        hoverinfo: "skip"
    };

    // A real cone at the tip makes the state vector an arrow rather than a line.
    const arrow = {
        type: "cone",
        x: [x],
        y: [y],
        z: [z],
        u: [x],
        v: [y],
        w: [z],
        anchor: "tip",
        sizemode: "absolute",
        sizeref: 0.18,
        showscale: false,
        hoverinfo: "skip",
        name: "State Direction"
    };

    Plotly.react(
        sphere,
        [surface, vector, arrow, point],
        {
            margin: { l: 0, r: 0, t: 0, b: 0 },
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            scene: {
                xaxis: {
                    title: "X",
                    range: [-1.2, 1.2],
                    zeroline: true
                },
                yaxis: {
                    title: "Y",
                    range: [-1.2, 1.2],
                    zeroline: true
                },
                zaxis: {
                    title: "Z",
                    range: [-1.2, 1.2],
                    zeroline: true
                },
                aspectmode: "cube"
            },
            showlegend: false
        },
        { responsive: true }
    );
}


/* =====================================================
   CIRCUIT LAB
===================================================== */

let circuit = [];


/* -----------------------------------------------------
   ADD GATE
----------------------------------------------------- */

function addGate(gate) {

    circuit.push(gate);

    renderCircuit();

}


/* -----------------------------------------------------
   REMOVE GATE
----------------------------------------------------- */

function removeGate(index) {

    circuit.splice(index, 1);

    renderCircuit();

}


/* -----------------------------------------------------
   RENDER CIRCUIT
----------------------------------------------------- */

function renderCircuit() {

    const container =
        document.getElementById(
            "circuitGates"
        );

    if (!container) {
        return;
    }


    container.innerHTML = "";


    if (circuit.length === 0) {

        container.innerHTML = `
            <div class="empty-circuit">
                Add gates from the library.
            </div>
        `;

        return;
    }


    circuit.forEach(
        (gate, index) => {

            const gateElement =
                document.createElement(
                    "div"
                );


            gateElement.className =
                "circuit-gate";


            gateElement.innerHTML = `

                <span>
                    ${gate}
                </span>

                <button
                    class="gate-remove"
                    onclick="removeGate(${index})"
                >
                    ×
                </button>

            `;


            container.appendChild(
                gateElement
            );

        }
    );

}


/* -----------------------------------------------------
   RESET CIRCUIT
----------------------------------------------------- */

function resetCircuit() {

    circuit = [];

    renderCircuit();


    const output =
        document.getElementById(
            "circuitOutput"
        );

    if (output) {

        output.textContent =
            "|0⟩";

    }


    const p0 =
        document.getElementById(
            "circuitProb0"
        );

    const p1 =
        document.getElementById(
            "circuitProb1"
        );


    if (p0) {

        p0.textContent =
            "100%";

    }


    if (p1) {

        p1.textContent =
            "0%";

    }


    const bar0 =
        document.getElementById(
            "circuitBar0"
        );

    const bar1 =
        document.getElementById(
            "circuitBar1"
        );


    if (bar0) {

        bar0.style.width =
            "100%";

    }


    if (bar1) {

        bar1.style.width =
            "0%";

    }


    const steps =
        document.getElementById(
            "circuitSteps"
        );


    if (steps) {

        steps.innerHTML = `

            <div class="empty-steps">
                Run your circuit to see
                each quantum operation.
            </div>

        `;

    }

}


/* -----------------------------------------------------
   RUN CIRCUIT
----------------------------------------------------- */

async function runCircuit() {

    if (circuit.length === 0) {

        alert(
            "Please add at least one gate."
        );

        return;
    }


    try {

        const response =
            await fetch(
                "/api/circuit",
                {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            gates: circuit
                        })

                }
            );


        const data =
            await response.json();


        if (!data.success) {

            alert(
                "Circuit Error: " +
                data.error
            );

            return;
        }


        const output =
            document.getElementById(
                "circuitOutput"
            );


        if (output) {

            output.textContent =
                formatQuantumState(
                    data.final_state
                );

        }


        const probability0 =
            data.probabilities[0] * 100;

        const probability1 =
            data.probabilities[1] * 100;


        const p0 =
            document.getElementById(
                "circuitProb0"
            );

        const p1 =
            document.getElementById(
                "circuitProb1"
            );


        if (p0) {

            p0.textContent =
                `${probability0.toFixed(1)}%`;

        }


        if (p1) {

            p1.textContent =
                `${probability1.toFixed(1)}%`;

        }


        const bar0 =
            document.getElementById(
                "circuitBar0"
            );

        const bar1 =
            document.getElementById(
                "circuitBar1"
            );


        if (bar0) {

            bar0.style.width =
                `${probability0}%`;

        }


        if (bar1) {

            bar1.style.width =
                `${probability1}%`;

        }


        displayCircuitSteps(
            data.steps
        );

    }
    catch (error) {

        console.error(error);

        alert(
            "Could not connect to Quantum Engine."
        );

    }

}


/* =====================================================
   DISPLAY CIRCUIT EXECUTION
===================================================== */

function displayCircuitSteps(steps) {

    const container =
        document.getElementById(
            "circuitSteps"
        );


    if (!container) {
        return;
    }


    if (
        !steps ||
        steps.length === 0
    ) {

        container.innerHTML = `

            <div class="empty-steps">
                No execution steps available.
            </div>

        `;

        return;
    }


    container.innerHTML = "";


    steps.forEach(
        (step, index) => {

            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "execution-step";


            const number =
                document.createElement(
                    "div"
                );


            number.className =
                "step-number";


            number.textContent =
                `STEP ${index + 1}`;


            const gate =
                document.createElement(
                    "div"
                );


            gate.className =
                "step-gate";


            gate.textContent =
                step.gate;


            const state =
                document.createElement(
                    "div"
                );


            state.className =
                "step-state";


            state.textContent =
                formatQuantumState(
                    step.state
                );


            row.appendChild(number);

            row.appendChild(gate);

            row.appendChild(state);


            container.appendChild(row);

        }
    );

}


/* Compatibility names used by the Circuit Lab HTML. */
function addCircuitGate(gate) {
    addGate(gate);
}

function clearCircuit() {
    resetCircuit();
}


/* =====================================================
   MEASUREMENT LAB
===================================================== */

async function runMeasurement() {
    const shotsElement = document.getElementById("shots");
    if (!shotsElement) return;

    const shots = Number.parseInt(shotsElement.value, 10);

    if (!Number.isInteger(shots) || shots < 1 || shots > 10000) {
        alert("Enter a valid number of shots (1–10000).");
        return;
    }

    try {
        const response = await fetch("/api/measurement", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({ shots })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || `Measurement request failed (${response.status})`);
        }

        displayMeasurement(
            Number(data.counts?.["0"] ?? 0),
            Number(data.counts?.["1"] ?? 0)
        );
    } catch (error) {
        console.error(error);
        alert(`Measurement Error: ${error.message}`);
    }
}

function displayMeasurement(count0, count1) {
    const result0 = document.getElementById("measurement0");
    const result1 = document.getElementById("measurement1");
    const value0 = document.getElementById("histValue0");
    const value1 = document.getElementById("histValue1");
    const bar0 = document.getElementById("hist0");
    const bar1 = document.getElementById("hist1");

    if (result0) result0.textContent = count0;
    if (result1) result1.textContent = count1;
    if (value0) value0.textContent = count0;
    if (value1) value1.textContent = count1;

    const total = count0 + count1;
    if (total <= 0) {
        if (bar0) bar0.style.height = "0%";
        if (bar1) bar1.style.height = "0%";
        return;
    }

    if (bar0) bar0.style.height = `${count0 / total * 100}%`;
    if (bar1) bar1.style.height = `${count1 / total * 100}%`;
}


/* =====================================================
   ENTANGLEMENT LAB
===================================================== */

async function createBellState() {
    const status = document.getElementById("entanglementStatus");

    try {
        const response = await fetch("/api/entanglement", {
            method: "POST",
            headers: { "Accept": "application/json" }
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || `Entanglement request failed (${response.status})`);
        }

        const amp00 = document.getElementById("amp00");
        const amp11 = document.getElementById("amp11");

        const state = data.state || {};
        const a00 = getComplexValue(state["00"]);
        const a11 = getComplexValue(state["11"]);
        const a00Text = Math.abs(a00.im) < 1e-9 ? Math.abs(a00.re).toFixed(3) : formatComplexCoefficient(a00);
        const a11Text = Math.abs(a11.im) < 1e-9 ? Math.abs(a11.re).toFixed(3) : formatComplexCoefficient(a11);

        if (amp00) amp00.textContent = a00Text;
        if (amp11) amp11.textContent = a11Text;

        if (status) {
            status.innerHTML = `
                <span>✓</span>
                <strong>Bell State Created</strong>
                <p>
                    The two qubits are entangled in the Bell state
                    (|00⟩ + |11⟩)/√2.
                </p>
            `;
        }
    } catch (error) {
        console.error(error);
        alert(`Entanglement Error: ${error.message}`);
    }
}


/* =====================================================
   TWO-QUBIT EXPLORER
===================================================== */


/*
    Two-qubit state order:

    |00⟩
    |01⟩
    |10⟩
    |11⟩
*/


let twoQState = [

    { re: 1, im: 0 },

    { re: 0, im: 0 },

    { re: 0, im: 0 },

    { re: 0, im: 0 }

];


const twoQBases = [
    "00",
    "01",
    "10",
    "11"
];


/* =====================================================
   EXPLORER SWITCH
===================================================== */

function showExplorer(mode) {

    const single =
        document.getElementById(
            "singleExplorer"
        );

    const double =
        document.getElementById(
            "doubleExplorer"
        );


    const singleTab =
        document.getElementById(
            "singleExplorerTab"
        );

    const doubleTab =
        document.getElementById(
            "doubleExplorerTab"
        );


    if (!single || !double) {
        return;
    }


    if (mode === "double") {

        single.classList.remove(
            "active-view"
        );

        double.classList.add(
            "active-view"
        );


        if (singleTab) {

            singleTab.classList.remove(
                "active"
            );

        }


        if (doubleTab) {

            doubleTab.classList.add(
                "active"
            );

        }


        updateTwoQDisplay();

    }
    else {

        double.classList.remove(
            "active-view"
        );

        single.classList.add(
            "active-view"
        );


        if (doubleTab) {

            doubleTab.classList.remove(
                "active"
            );

        }


        if (singleTab) {

            singleTab.classList.add(
                "active"
            );

        }

    }

}


/* =====================================================
   COMPLEX NUMBER HELPERS
===================================================== */

function complex(
    re = 0,
    im = 0
) {

    return {
        re: re,
        im: im
    };

}


function complexAdd(a, b) {

    return {

        re:
            a.re + b.re,

        im:
            a.im + b.im

    };

}


function complexMultiplyReal(
    a,
    value
) {

    return {

        re:
            a.re * value,

        im:
            a.im * value

    };

}


function complexAbsSquared(a) {

    return (
        a.re * a.re +
        a.im * a.im
    );

}


/* =====================================================
   NORMALIZE TWO-QUBIT STATE
===================================================== */

function normalizeTwoQState(
    state
) {

    const norm =
        Math.sqrt(
            state.reduce(
                (
                    sum,
                    amplitude
                ) =>
                    sum +
                    complexAbsSquared(
                        amplitude
                    ),
                0
            )
        );


    if (norm === 0) {

        return [

            complex(1),

            complex(0),

            complex(0),

            complex(0)

        ];

    }


    return state.map(
        amplitude =>
            complex(
                amplitude.re / norm,
                amplitude.im / norm
            )
    );

}


/* =====================================================
   NUMBER FORMATTING
===================================================== */

function cleanNumber(value) {

    if (Math.abs(value) < 0.0005) {
        return 0;
    }

    return Number(
        value.toFixed(3)
    );

}


/* =====================================================
   AMPLITUDE FORMATTING
===================================================== */

function formatAmplitude(
    amplitude
) {

    const re =
        cleanNumber(
            amplitude.re
        );

    const im =
        cleanNumber(
            amplitude.im
        );


    if (
        re === 0 &&
        im === 0
    ) {

        return "0";

    }


    if (im === 0) {

        return String(re);

    }


    if (re === 0) {

        if (im === 1)
            return "i";

        if (im === -1)
            return "-i";

        return `${im}i`;

    }


    const sign =
        im >= 0
            ? "+"
            : "-";


    const imaginary =
        Math.abs(im) === 1
            ? "i"
            : `${Math.abs(im)}i`;


    return `${re}${sign}${imaginary}`;

}


/* =====================================================
   TWO-QUBIT STATE EQUATION
===================================================== */

function formatTwoQState() {

    const terms = [];


    twoQState.forEach(
        (amplitude, index) => {

            const magnitude =
                Math.sqrt(
                    complexAbsSquared(
                        amplitude
                    )
                );


            if (
                magnitude < 0.0005
            ) {
                return;
            }


            const basis =
                twoQBases[index];


            const re =
                cleanNumber(
                    amplitude.re
                );

            const im =
                cleanNumber(
                    amplitude.im
                );


            if (
                re === 1 &&
                im === 0
            ) {

                terms.push(
                    `|${basis}⟩`
                );

            }

            else if (
                re === -1 &&
                im === 0
            ) {

                terms.push(
                    `-|${basis}⟩`
                );

            }

            else {

                terms.push(
                    `${formatAmplitude(
                        amplitude
                    )}|${basis}⟩`
                );

            }

        }
    );


    return (
        terms.join(" + ") ||
        "0"
    );

}


/* =====================================================
   SET TWO-QUBIT BASIS STATE
===================================================== */

function setTwoQBasisState(
    q1,
    q2
) {

    const index =
        q1 * 2 + q2;


    twoQState = [

        complex(
            index === 0 ? 1 : 0
        ),

        complex(
            index === 1 ? 1 : 0
        ),

        complex(
            index === 2 ? 1 : 0
        ),

        complex(
            index === 3 ? 1 : 0
        )

    ];


    updateTwoQDisplay();

}


/* =====================================================
   SELECT QUBIT BASIS
===================================================== */

function setTwoQubitBasis(
    qubit,
    value
) {

    let currentQ1 = 0;
    let currentQ2 = 0;


    const activeQ1 =
        document.querySelector(
            '.basis-btn[data-q="1"].active'
        );


    const activeQ2 =
        document.querySelector(
            '.basis-btn[data-q="2"].active'
        );


    if (activeQ1) {

        currentQ1 =
            Number(
                activeQ1.dataset.value
            );

    }


    if (activeQ2) {

        currentQ2 =
            Number(
                activeQ2.dataset.value
            );

    }


    if (qubit === 1) {

        currentQ1 = value;

    }


    if (qubit === 2) {

        currentQ2 = value;

    }


    document
        .querySelectorAll(
            `.basis-btn[data-q="${qubit}"]`
        )
        .forEach(
            button =>
                button.classList.remove(
                    "active"
                )
        );


    const selected =
        document.querySelector(
            `.basis-btn[data-q="${qubit}"][data-value="${value}"]`
        );


    if (selected) {

        selected.classList.add(
            "active"
        );

    }


    setTwoQBasisState(
        currentQ1,
        currentQ2
    );


    updateTwoQStatus(
        `Basis state selected: |${currentQ1}${currentQ2}⟩`
    );

}


/* =====================================================
   HADAMARD
===================================================== */

function applyHToQubit(
    state,
    qubit
) {

    const result =
        state.map(
            () => complex(0)
        );


    const inverseSqrt2 =
        1 / Math.sqrt(2);


    if (qubit === 1) {

        result[0] =
            complexMultiplyReal(
                complexAdd(
                    state[0],
                    state[2]
                ),
                inverseSqrt2
            );


        result[2] =
            complexMultiplyReal(
                complexAdd(
                    state[0],
                    complexMultiplyReal(
                        state[2],
                        -1
                    )
                ),
                inverseSqrt2
            );


        result[1] =
            complexMultiplyReal(
                complexAdd(
                    state[1],
                    state[3]
                ),
                inverseSqrt2
            );


        result[3] =
            complexMultiplyReal(
                complexAdd(
                    state[1],
                    complexMultiplyReal(
                        state[3],
                        -1
                    )
                ),
                inverseSqrt2
            );

    }

    else {

        result[0] =
            complexMultiplyReal(
                complexAdd(
                    state[0],
                    state[1]
                ),
                inverseSqrt2
            );


        result[1] =
            complexMultiplyReal(
                complexAdd(
                    state[0],
                    complexMultiplyReal(
                        state[1],
                        -1
                    )
                ),
                inverseSqrt2
            );


        result[2] =
            complexMultiplyReal(
                complexAdd(
                    state[2],
                    state[3]
                ),
                inverseSqrt2
            );


        result[3] =
            complexMultiplyReal(
                complexAdd(
                    state[2],
                    complexMultiplyReal(
                        state[3],
                        -1
                    )
                ),
                inverseSqrt2
            );

    }


    return result;

}


/* =====================================================
   PAULI-X
===================================================== */

function applyXToQubit(
    state,
    qubit
) {

    const result =
        state.map(
            amplitude =>
                complex(
                    amplitude.re,
                    amplitude.im
                )
        );


    if (qubit === 1) {

        result[0] = state[2];
        result[2] = state[0];

        result[1] = state[3];
        result[3] = state[1];

    }

    else {

        result[0] = state[1];
        result[1] = state[0];

        result[2] = state[3];
        result[3] = state[2];

    }


    return result;

}


/* =====================================================
   PAULI-Z
===================================================== */

function applyZToQubit(
    state,
    qubit
) {

    return state.map(
        (amplitude, index) => {

            const q1 =
                Math.floor(
                    index / 2
                );

            const q2 =
                index % 2;


            const bit =
                qubit === 1
                    ? q1
                    : q2;


            if (bit === 1) {

                return complexMultiplyReal(
                    amplitude,
                    -1
                );

            }


            return complex(
                amplitude.re,
                amplitude.im
            );

        }
    );

}


/* =====================================================
   CNOT
===================================================== */

function applyCNOT(
    state
) {

    const result =
        state.map(
            amplitude =>
                complex(
                    amplitude.re,
                    amplitude.im
                )
        );


    /*
        q1 = control
        q2 = target

        |10⟩ ↔ |11⟩
    */

    result[2] = state[3];

    result[3] = state[2];


    return result;

}


/* =====================================================
   CONTROLLED-Z
===================================================== */

function applyCZ(
    state
) {

    const result =
        state.map(
            amplitude =>
                complex(
                    amplitude.re,
                    amplitude.im
                )
        );


    /*
        Only |11⟩ receives
        a phase flip.
    */

    result[3] =
        complexMultiplyReal(
            state[3],
            -1
        );


    return result;

}


/* =====================================================
   SWAP
===================================================== */

function applySWAP(
    state
) {

    const result =
        state.map(
            amplitude =>
                complex(
                    amplitude.re,
                    amplitude.im
                )
        );


    /*
        |01⟩ ↔ |10⟩
    */

    result[1] = state[2];

    result[2] = state[1];


    return result;

}


/* =====================================================
   EXECUTE TWO-QUBIT GATE
===================================================== */

function twoQGate(
    gate
) {

    switch (gate) {

        case "H1":

            twoQState =
                applyHToQubit(
                    twoQState,
                    1
                );

            updateTwoQStatus(
                "Applied Hadamard gate to qubit 1."
            );

            break;


        case "H2":

            twoQState =
                applyHToQubit(
                    twoQState,
                    2
                );

            updateTwoQStatus(
                "Applied Hadamard gate to qubit 2."
            );

            break;


        case "X1":

            twoQState =
                applyXToQubit(
                    twoQState,
                    1
                );

            updateTwoQStatus(
                "Applied Pauli-X to qubit 1."
            );

            break;


        case "X2":

            twoQState =
                applyXToQubit(
                    twoQState,
                    2
                );

            updateTwoQStatus(
                "Applied Pauli-X to qubit 2."
            );

            break;


        case "Z1":

            twoQState =
                applyZToQubit(
                    twoQState,
                    1
                );

            updateTwoQStatus(
                "Applied Pauli-Z to qubit 1."
            );

            break;


        case "Z2":

            twoQState =
                applyZToQubit(
                    twoQState,
                    2
                );

            updateTwoQStatus(
                "Applied Pauli-Z to qubit 2."
            );

            break;


        case "CNOT":

            twoQState =
                applyCNOT(
                    twoQState
                );

            updateTwoQStatus(
                "CNOT applied: qubit 1 controls qubit 2."
            );

            break;


        case "CZ":

            twoQState =
                applyCZ(
                    twoQState
                );

            updateTwoQStatus(
                "Controlled-Z applied: |11⟩ receives a phase flip."
            );

            break;


        case "SWAP":

            twoQState =
                applySWAP(
                    twoQState
                );

            updateTwoQStatus(
                "SWAP exchanged the two qubit states."
            );

            break;

    }


    twoQState =
        normalizeTwoQState(
            twoQState
        );


    updateTwoQDisplay();

}


/* =====================================================
   CREATE BELL STATE
===================================================== */

function createTwoQBellState() {

    const value =
        1 / Math.sqrt(2);


    twoQState = [

        complex(value),

        complex(0),

        complex(0),

        complex(value)

    ];


    document
        .querySelectorAll(
            ".basis-btn"
        )
        .forEach(
            button =>
                button.classList.remove(
                    "active"
                )
        );


    updateTwoQStatus(
        "Bell state created: (|00⟩ + |11⟩) / √2"
    );


    updateTwoQDisplay();

}


/* =====================================================
   RESET TWO QUBITS
===================================================== */

function resetTwoQubit() {

    twoQState = [

        complex(1),

        complex(0),

        complex(0),

        complex(0)

    ];


    document
        .querySelectorAll(
            '.basis-btn[data-q="1"]'
        )
        .forEach(
            button =>
                button.classList.toggle(
                    "active",
                    button.dataset.value === "0"
                )
        );


    document
        .querySelectorAll(
            '.basis-btn[data-q="2"]'
        )
        .forEach(
            button =>
                button.classList.toggle(
                    "active",
                    button.dataset.value === "0"
                )
        );


    updateTwoQStatus(
        "Two-qubit system reset to |00⟩."
    );


    updateTwoQDisplay();

}


/* =====================================================
   TWO-QUBIT STATUS
===================================================== */

function updateTwoQStatus(
    message
) {

    const status =
        document.getElementById(
            "twoQStatus"
        );


    if (status) {

        status.textContent =
            message;

    }

}


/* =====================================================
   UPDATE TWO-QUBIT DISPLAY
===================================================== */

function updateTwoQDisplay() {

    const stateText =
        formatTwoQState();


    const stateDisplay =
        document.getElementById(
            "twoQState"
        );


    const equation =
        document.getElementById(
            "twoQEquation"
        );


    const vector =
        document.getElementById(
            "twoQVector"
        );


    if (stateDisplay) {

        stateDisplay.textContent =
            stateText;

    }


    if (equation) {

        equation.textContent =
            stateText;

    }


    if (vector) {

        vector.innerHTML =
            twoQState
                .map(
                    amplitude =>
                        `<div>[ ${formatAmplitude(
                            amplitude
                        )} ]</div>`
                )
                .join("");

    }


    updateTwoQProbabilities();

    updateConcurrence();

}


/* =====================================================
   TWO-QUBIT PROBABILITIES
===================================================== */

function updateTwoQProbabilities() {

    twoQState.forEach(
        (amplitude, index) => {

            const probability =
                Math.max(
                    0,
                    Math.min(
                        1,
                        complexAbsSquared(
                            amplitude
                        )
                    )
                );


            const percent =
                probability * 100;


            const basis =
                twoQBases[index];


            const value =
                document.getElementById(
                    `prob${basis}`
                );


            const bar =
                document.getElementById(
                    `bar${basis}`
                );


            if (value) {

                value.textContent =
                    `${percent.toFixed(1)}%`;

            }


            if (bar) {

                bar.style.width =
                    `${percent}%`;

            }

        }
    );

}


/* =====================================================
   CONCURRENCE
===================================================== */

/*
    For a pure two-qubit state:

    C = 2 |ad - bc|

    C = 0  → separable
    C = 1  → maximally entangled
*/

function calculateConcurrence() {

    const a =
        twoQState[0];

    const b =
        twoQState[1];

    const cAmp =
        twoQState[2];

    const d =
        twoQState[3];


    const ad = {

        re:
            a.re * d.re -
            a.im * d.im,

        im:
            a.re * d.im +
            a.im * d.re

    };


    const bc = {

        re:
            b.re * cAmp.re -
            b.im * cAmp.im,

        im:
            b.re * cAmp.im +
            b.im * cAmp.re

    };


    const difference = {

        re:
            ad.re - bc.re,

        im:
            ad.im - bc.im

    };


    return Math.min(
        1,
        2 *
        Math.sqrt(
            complexAbsSquared(
                difference
            )
        )
    );

}


/* =====================================================
   UPDATE CONCURRENCE DISPLAY
===================================================== */

function updateConcurrence() {

    const value =
        calculateConcurrence();


    const valueElement =
        document.getElementById(
            "concurrenceValue"
        );


    const bar =
        document.getElementById(
            "concurrenceBar"
        );


    const result =
        document.getElementById(
            "entanglementResult"
        );


    if (valueElement) {

        valueElement.textContent =
            value.toFixed(2);

    }


    if (bar) {

        bar.style.width =
            `${value * 100}%`;

    }


    if (result) {

        if (value > 0.999) {

            result.textContent =
                "Maximally Entangled";

        }

        else if (value > 0.001) {

            result.textContent =
                "Entangled State";

        }

        else {

            result.textContent =
                "Separable State";

        }

    }

}


/* =====================================================
   PAGE INITIALIZATION
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        /*
            Only load the Python state if the
            current page contains the relevant
            single-qubit elements.
        */

        if (
            document.getElementById(
                "blochSphere"
            ) ||
            document.getElementById(
                "currentState"
            )
        ) {

            loadState();

        }


        /*
            Initialize the two-qubit explorer.
        */

        if (
            document.getElementById(
                "doubleExplorer"
            )
        ) {

            updateTwoQDisplay();

        }

        if (document.getElementById("circuitGates")) {
            renderCircuit();
        }

        if (document.getElementById("measurementState")) {
            loadState();
        }

    }
);


/* =====================================================
   DEFINE YOUR OWN QUANTUM GATE / OPERATOR LAB
===================================================== */

function addOperatorLabNav() {
    const nav = document.querySelector(".sidebar nav");
    if (!nav || nav.querySelector('a[href="/operator"]')) return;

    const link = document.createElement("a");
    link.href = "/operator";
    link.className = "nav-item operator-nav-item";
    if (window.location.pathname === "/operator") {
        link.classList.add("active");
    }
    link.innerHTML = "<span>λ</span> Define Your Own Quantum Gate";

    const divider = nav.querySelector(".nav-divider");
    if (divider) nav.insertBefore(link, divider);
    else nav.appendChild(link);
}

function parseOperatorComplexInput(value) {
    if (value === null || value === undefined) return null;

    let s = String(value)
        .trim()
        .replace(/\s+/g, "")
        .replace(/j/gi, "i")
        .toLowerCase();

    if (!s) return null;

    if (s === "i" || s === "+i") return { re: 0, im: 1 };
    if (s === "-i") return { re: 0, im: -1 };

    if (!s.includes("i")) {
        const re = Number(s);
        return Number.isFinite(re) ? { re, im: 0 } : null;
    }

    if (!s.endsWith("i") || (s.match(/i/g) || []).length !== 1) return null;

    let body = s.slice(0, -1);
    if (body === "" || body === "+") return { re: 0, im: 1 };
    if (body === "-") return { re: 0, im: -1 };

    let split = -1;
    for (let i = 1; i < body.length; i++) {
        if (body[i] === "+" || body[i] === "-") split = i;
    }

    if (split === -1) {
        const im = Number(body);
        return Number.isFinite(im) ? { re: 0, im } : null;
    }

    const re = Number(body.slice(0, split));
    const im = Number(body.slice(split));
    if (!Number.isFinite(re) || !Number.isFinite(im)) return null;

    return { re, im };
}

function getOperatorInputMatrix() {
    return [
        [
            document.getElementById("a11")?.value ?? "",
            document.getElementById("a12")?.value ?? ""
        ],
        [
            document.getElementById("a21")?.value ?? "",
            document.getElementById("a22")?.value ?? ""
        ]
    ];
}

function getOperatorInputVector() {
    return [
        document.getElementById("x1")?.value ?? "",
        document.getElementById("x2")?.value ?? ""
    ];
}

function getOperatorVectorFromInputs() {
    const raw = getOperatorInputVector();
    const vector = raw.map(parseOperatorComplexInput);

    if (vector.some(value => value === null)) return null;

    const magnitude = Math.hypot(
        vector[0].re,
        vector[0].im,
        vector[1].re,
        vector[1].im
    );

    if (magnitude < 1e-12) return null;

    return vector;
}

function formatOperatorComplex(value, precision = 4) {
    const re = Number(value?.real ?? value?.re ?? 0);
    const im = Number(value?.imaginary ?? value?.im ?? 0);

    const clean = number => {
        if (Math.abs(number) < 5e-10) return 0;
        return Number(number.toFixed(precision));
    };

    const r = clean(re);
    const i = clean(im);

    if (i === 0) return String(r);

    if (r === 0) {
        if (i === 1) return "i";
        if (i === -1) return "-i";
        return `${i}i`;
    }

    const sign = i >= 0 ? "+" : "-";
    const imag = Math.abs(i) === 1 ? "i" : `${Math.abs(i)}i`;
    return `${r}${sign}${imag}`;
}

function formatOperatorComplexLatex(value, precision = 4) {
    const text = formatOperatorComplex(value, precision);
    return text.replace(/-/g, "-").replace(/\+/g, "+");
}

function formatOperatorVector(vector, latex = false) {
    if (!vector) return latex ? String.raw`\begin{bmatrix} - \\ - \end{bmatrix}` : "[ — ]<br>[ — ]";

    const format = latex
        ? value => formatOperatorComplexLatex(value)
        : value => formatOperatorComplex(value);

    if (latex) {
        return String.raw`\begin{bmatrix} ${format(vector[0])} \\ ${format(vector[1])} \end{bmatrix}`;
    }

    return `[ ${format(vector[0])} ]<br>[ ${format(vector[1])} ]`;
}

function setMathJaxHtml(element, latex) {
    if (!element) return;
    element.innerHTML = latex;
    if (window.MathJax?.typesetPromise) {
        MathJax.typesetPromise([element]).catch(error => console.error("MathJax error:", error));
    }
}

function setOperatorCoordinates(prefix, coordinates) {
    const ids = [
        `${prefix}CoordX`,
        `${prefix}CoordY`,
        `${prefix}CoordZ`
    ];

    if (!coordinates) {
        ids.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = "—";
        });
        return;
    }

    [coordinates.x, coordinates.y, coordinates.z].forEach((value, index) => {
        const element = document.getElementById(ids[index]);
        if (element) element.textContent = Number(value).toFixed(2);
    });
}

function operatorSphereLayout(title) {
    return {
        margin: { l: 0, r: 0, t: 34, b: 0 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        scene: {
            xaxis: { title: "X", range: [-1.2, 1.2], zeroline: true },
            yaxis: { title: "Y", range: [-1.2, 1.2], zeroline: true },
            zaxis: { title: "Z", range: [-1.2, 1.2], zeroline: true },
            aspectmode: "cube"
        },
        showlegend: false,
        title: { text: title, font: { size: 12 } }
    };
}

function renderOperatorSphere(elementId, coordinates, title) {
    const sphere = document.getElementById(elementId);
    if (!sphere || !window.Plotly) return;

    const theta = Array.from({ length: 40 }, (_, i) => Math.PI * i / 39);
    const phi = Array.from({ length: 40 }, (_, i) => 2 * Math.PI * i / 39);

    const sphereX = [];
    const sphereY = [];
    const sphereZ = [];

    theta.forEach(t => {
        const rowX = [];
        const rowY = [];
        const rowZ = [];

        phi.forEach(p => {
            rowX.push(Math.sin(t) * Math.cos(p));
            rowY.push(Math.sin(t) * Math.sin(p));
            rowZ.push(Math.cos(t));
        });

        sphereX.push(rowX);
        sphereY.push(rowY);
        sphereZ.push(rowZ);
    });

    const surface = {
        x: sphereX,
        y: sphereY,
        z: sphereZ,
        type: "surface",
        opacity: 0.15,
        showscale: false,
        hoverinfo: "skip"
    };

    const traces = [surface];

    if (coordinates) {
        const x = Number(coordinates.x);
        const y = Number(coordinates.y);
        const z = Number(coordinates.z);

        traces.push({
            x: [0, x],
            y: [0, y],
            z: [0, z],
            type: "scatter3d",
            mode: "lines",
            line: { width: 6 },
            hoverinfo: "skip"
        });

        traces.push({
            type: "cone",
            x: [x],
            y: [y],
            z: [z],
            u: [x],
            v: [y],
            w: [z],
            anchor: "tip",
            sizemode: "absolute",
            sizeref: 0.16,
            showscale: false,
            hoverinfo: "skip"
        });

        traces.push({
            x: [x],
            y: [y],
            z: [z],
            type: "scatter3d",
            mode: "markers",
            marker: { size: 7 },
            hovertemplate: "x=%{x:.3f}<br>y=%{y:.3f}<br>z=%{z:.3f}<extra></extra>"
        });
    }

    Plotly.react(
        sphere,
        traces,
        operatorSphereLayout(title),
        { responsive: true, displayModeBar: false }
    );
}

function realVectorFromSerialized(vector) {
    if (!vector || vector.length !== 2) return null;
    const first = vector[0];
    const second = vector[1];
    if (Math.abs(Number(first.imaginary ?? 0)) > 1e-8) return null;
    if (Math.abs(Number(second.imaginary ?? 0)) > 1e-8) return null;

    return {
        x: Number(first.real ?? 0),
        y: Number(second.real ?? 0),
        magnitude: Math.hypot(
            Number(first.real ?? 0),
            Number(second.real ?? 0)
        )
    };
}

function drawVectorDiagram(svgId, geometry, label, colorClass) {
    const svg = document.getElementById(svgId);
    if (!svg) return;

    const ns = "http://www.w3.org/2000/svg";
    svg.innerHTML = "";

    if (!geometry) {
        const message = document.createElementNS(ns, "text");
        message.setAttribute("x", "260");
        message.setAttribute("y", "180");
        message.setAttribute("text-anchor", "middle");
        message.setAttribute("class", "diagram-empty-text");
        message.textContent = "Real-component vector diagram appears here after valid real inputs.";
        svg.appendChild(message);
        return;
    }

    const width = 520;
    const height = 360;
    const origin = { x: 90, y: 270 };

    const maxComponent = Math.max(1, Math.abs(geometry.x), Math.abs(geometry.y));
    let bound = Math.ceil(maxComponent * 1.25);
    bound = Math.max(bound, 2);

    const pixelsPerUnit = Math.min(
        (width - origin.x - 35) / bound,
        (origin.y - 30) / bound,
        70
    );

    const toSvg = (x, y) => ({
        x: origin.x + x * pixelsPerUnit,
        y: origin.y - y * pixelsPerUnit
    });

    const group = document.createElementNS(ns, "g");
    svg.appendChild(group);

    let step = 1;
    if (bound > 12) step = 2;
    if (bound > 25) step = 5;
    if (bound > 60) step = 10;

    for (let value = -bound; value <= bound; value += step) {
        if (value === 0) continue;

        const vertical = document.createElementNS(ns, "line");
        const p1 = toSvg(value, -bound);
        const p2 = toSvg(value, bound);
        vertical.setAttribute("x1", p1.x);
        vertical.setAttribute("y1", p1.y);
        vertical.setAttribute("x2", p2.x);
        vertical.setAttribute("y2", p2.y);
        vertical.setAttribute("class", "vector-grid-line");
        group.appendChild(vertical);

        const horizontal = document.createElementNS(ns, "line");
        const q1 = toSvg(-bound, value);
        const q2 = toSvg(bound, value);
        horizontal.setAttribute("x1", q1.x);
        horizontal.setAttribute("y1", q1.y);
        horizontal.setAttribute("x2", q2.x);
        horizontal.setAttribute("y2", q2.y);
        horizontal.setAttribute("class", "vector-grid-line");
        group.appendChild(horizontal);
    }

    const xAxis = document.createElementNS(ns, "line");
    xAxis.setAttribute("x1", 30);
    xAxis.setAttribute("y1", origin.y);
    xAxis.setAttribute("x2", width - 20);
    xAxis.setAttribute("y2", origin.y);
    xAxis.setAttribute("class", "vector-axis");
    xAxis.setAttribute("marker-end", "url(#axisArrow)");
    group.appendChild(xAxis);

    const yAxis = document.createElementNS(ns, "line");
    yAxis.setAttribute("x1", origin.x);
    yAxis.setAttribute("y1", height - 15);
    yAxis.setAttribute("x2", origin.x);
    yAxis.setAttribute("y2", 20);
    yAxis.setAttribute("class", "vector-axis");
    yAxis.setAttribute("marker-end", "url(#axisArrow)");
    group.appendChild(yAxis);

    const defs = document.createElementNS(ns, "defs");
    const axisMarker = document.createElementNS(ns, "marker");
    axisMarker.setAttribute("id", "axisArrow");
    axisMarker.setAttribute("markerWidth", "8");
    axisMarker.setAttribute("markerHeight", "8");
    axisMarker.setAttribute("refX", "6");
    axisMarker.setAttribute("refY", "3");
    axisMarker.setAttribute("orient", "auto");
    const axisPath = document.createElementNS(ns, "path");
    axisPath.setAttribute("d", "M0,0 L0,6 L6,3 z");
    axisPath.setAttribute("class", "axis-arrow-head");
    axisMarker.appendChild(axisPath);
    defs.appendChild(axisMarker);

    const vectorMarker = document.createElementNS(ns, "marker");
    vectorMarker.setAttribute("id", "vectorArrow");
    vectorMarker.setAttribute("markerWidth", "12");
    vectorMarker.setAttribute("markerHeight", "12");
    vectorMarker.setAttribute("refX", "9");
    vectorMarker.setAttribute("refY", "5");
    vectorMarker.setAttribute("orient", "auto");
    const vectorPath = document.createElementNS(ns, "path");
    vectorPath.setAttribute("d", "M0,0 L0,10 L10,5 z");
    vectorPath.setAttribute("class", colorClass);
    vectorMarker.appendChild(vectorPath);
    defs.appendChild(vectorMarker);
    svg.appendChild(defs);

    const end = toSvg(geometry.x, geometry.y);

    const vectorLine = document.createElementNS(ns, "line");
    vectorLine.setAttribute("x1", origin.x);
    vectorLine.setAttribute("y1", origin.y);
    vectorLine.setAttribute("x2", end.x);
    vectorLine.setAttribute("y2", end.y);
    vectorLine.setAttribute("class", `vector-result-line ${colorClass}`);
    vectorLine.setAttribute("marker-end", "url(#vectorArrow)");
    svg.appendChild(vectorLine);

    const point = document.createElementNS(ns, "circle");
    point.setAttribute("cx", end.x);
    point.setAttribute("cy", end.y);
    point.setAttribute("r", "6");
    point.setAttribute("class", `vector-result-point ${colorClass}`);
    svg.appendChild(point);

    const axisLabelX = document.createElementNS(ns, "text");
    axisLabelX.setAttribute("x", width - 30);
    axisLabelX.setAttribute("y", origin.y - 10);
    axisLabelX.setAttribute("class", "vector-axis-label");
    axisLabelX.textContent = "x₁";
    svg.appendChild(axisLabelX);

    const axisLabelY = document.createElementNS(ns, "text");
    axisLabelY.setAttribute("x", origin.x + 10);
    axisLabelY.setAttribute("y", 28);
    axisLabelY.setAttribute("class", "vector-axis-label");
    axisLabelY.textContent = "x₂";
    svg.appendChild(axisLabelY);

    const valueLabel = document.createElementNS(ns, "text");
    valueLabel.setAttribute("x", end.x + 10);
    valueLabel.setAttribute("y", end.y - 10);
    valueLabel.setAttribute("class", "vector-value-label");
    valueLabel.textContent = `${label} = [${geometry.x}, ${geometry.y}]`;
    svg.appendChild(valueLabel);
}

function updateVectorGeometry(result = null) {
    const vector = result?.vector ?? null;
    const output = result?.transformed_vector ?? null;

    const inputGeometry = result?.input_geometry ?? realVectorFromSerialized(vector);
    const outputGeometry = result?.output_geometry ?? realVectorFromSerialized(output);

    const inputMagnitude = document.getElementById("inputVectorMagnitude");
    const outputMagnitude = document.getElementById("outputVectorMagnitude");

    const inputCaption = document.getElementById("inputVectorGeometryCaption");
    const outputCaption = document.getElementById("outputVectorGeometryCaption");

    if (inputGeometry) {
        drawVectorDiagram("inputVectorDiagram", inputGeometry, "X", "vector-input-arrow");
        if (inputMagnitude) inputMagnitude.textContent = `|X| = ${inputGeometry.magnitude.toFixed(3)}`;
        if (inputCaption) inputCaption.textContent = `X = [${inputGeometry.x}, ${inputGeometry.y}] with actual magnitude ${inputGeometry.magnitude.toFixed(3)}.`;
    } else {
        drawVectorDiagram("inputVectorDiagram", null, "X", "vector-input-arrow");
        if (inputMagnitude) inputMagnitude.textContent = "Complex vector";
        if (inputCaption) inputCaption.textContent = "The vector is complex, so the real 2D magnitude diagram is not shown. Its magnitude remains available numerically, and its normalized direction is shown on the Bloch sphere.";
    }

    if (outputGeometry) {
        drawVectorDiagram("outputVectorDiagram", outputGeometry, "AX", "vector-output-arrow");
        if (outputMagnitude) outputMagnitude.textContent = `|AX| = ${outputGeometry.magnitude.toFixed(3)}`;
        if (outputCaption) outputCaption.textContent = `AX = [${outputGeometry.x}, ${outputGeometry.y}] with actual magnitude ${outputGeometry.magnitude.toFixed(3)}.`;
    } else {
        drawVectorDiagram("outputVectorDiagram", null, "AX", "vector-output-arrow");
        if (outputMagnitude) outputMagnitude.textContent = "Waiting";
        if (outputCaption) outputCaption.textContent = "Calculate the operator to display the transformed vector.";
    }

    const comparison = document.getElementById("magnitudeComparison");
    if (!comparison) return;

    if (!result) {
        comparison.className = "magnitude-comparison neutral";
        comparison.textContent = "Enter the matrix and vector, then calculate AX to compare the actual magnitudes.";
        return;
    }

    const inMag = Number(result.input_magnitude);
    const outMag = Number(result.output_magnitude);

    if (!Number.isFinite(inMag) || !Number.isFinite(outMag)) {
        comparison.className = "magnitude-comparison neutral";
        comparison.textContent = "Magnitude information is unavailable for this input.";
        return;
    }

    const ratio = inMag > 1e-12 ? outMag / inMag : 0;
    comparison.className = "magnitude-comparison success";

    let behavior = "The magnitude is unchanged.";
    if (ratio > 1 + 1e-7) behavior = `The output is ${ratio.toFixed(3)}× as long as the input — an expansion/stretch.`;
    if (ratio < 1 - 1e-7) behavior = `The output is ${ratio.toFixed(3)}× as long as the input — a compression.`;

    comparison.innerHTML = `<strong>|X| = ${inMag.toFixed(3)}</strong> &nbsp; → &nbsp; <strong>|AX| = ${outMag.toFixed(3)}</strong><br>${behavior}`;
}

function updateOperatorInputSphere() {
    const vector = getOperatorVectorFromInputs();
    const status = document.getElementById("vectorStatus");

    if (!vector) {
        setOperatorCoordinates("input", null);
        renderOperatorSphere("operatorInputSphere", null, "Input State");
        updateVectorGeometry(null);
        if (status) {
            status.className = "operator-status neutral";
            status.innerHTML = String.raw`Enter two valid components for a non-zero column vector \(X\).`;
            if (window.MathJax?.typesetPromise) MathJax.typesetPromise([status]);
        }
        return;
    }

    const norm = Math.hypot(
        vector[0].re,
        vector[0].im,
        vector[1].re,
        vector[1].im
    );

    const alpha = {
        re: vector[0].re / norm,
        im: vector[0].im / norm
    };

    const beta = {
        re: vector[1].re / norm,
        im: vector[1].im / norm
    };

    const productRe = alpha.re * beta.re + alpha.im * beta.im;
    const productIm = alpha.re * beta.im - alpha.im * beta.re;

    const coordinates = {
        x: 2 * productRe,
        y: 2 * productIm,
        z: alpha.re * alpha.re + alpha.im * alpha.im - beta.re * beta.re - beta.im * beta.im
    };

    setOperatorCoordinates("input", coordinates);
    renderOperatorSphere("operatorInputSphere", coordinates, "Input State X");

    if (status) {
        const magnitude = norm.toFixed(3);
        status.className = "operator-status success";
        status.innerHTML = String.raw`Vector \(X\) is valid. Magnitude \(\|X\|=${magnitude}\). The Bloch sphere shows its normalized direction.`;
        if (window.MathJax?.typesetPromise) MathJax.typesetPromise([status]);
    }

    const inputGeometry = realVectorFromSerialized([
        { real: vector[0].re, imaginary: vector[0].im },
        { real: vector[1].re, imaginary: vector[1].im }
    ]);

    updateVectorGeometry({ input_geometry: inputGeometry, input_magnitude: norm, output_magnitude: NaN });
}

function clearOperatorResults() {
    const badge = document.getElementById("operatorTypeBadge");
    if (badge) {
        badge.className = "operator-badge neutral";
        badge.textContent = "Waiting for calculation";
    }

    const status = document.getElementById("eigenStatusBadge");
    if (status) {
        status.className = "operator-badge neutral";
        status.textContent = "Not tested";
    }

    const characteristic = document.getElementById("characteristicEquation");
    if (characteristic) setMathJaxHtml(characteristic, String.raw`\[
        \det(A-\lambda I)=0
    \]`);

    const eigenvalueList = document.getElementById("eigenvalueList");
    if (eigenvalueList) eigenvalueList.innerHTML = '<div class="operator-placeholder">Eigenvalues will appear here.</div>';

    const eigenvectorList = document.getElementById("eigenvectorList");
    if (eigenvectorList) eigenvectorList.innerHTML = '<div class="operator-placeholder">Corresponding eigenvectors will appear here.</div>';

    const calculation = document.getElementById("matrixCalculation");
    if (calculation) calculation.innerHTML = String.raw`Enter \(A\) and \(X\), then calculate the transformation.`;

    const verificationX = document.getElementById("verificationX");
    const verificationAX = document.getElementById("verificationAX");
    const verificationLambdaX = document.getElementById("verificationLambdaX");
    const verificationEquation = document.getElementById("verificationEquation");
    const verificationDetails = document.getElementById("verificationDetails");

    if (verificationX) verificationX.innerHTML = "[ — ]<br>[ — ]";
    if (verificationAX) verificationAX.innerHTML = "[ — ]<br>[ — ]";
    if (verificationLambdaX) verificationLambdaX.innerHTML = "[ — ]<br>[ — ]";

    if (verificationEquation) {
        verificationEquation.innerHTML = String.raw`The site will compare \(AX\) with \(\lambda X\) for your input vector.`;
    }

    if (verificationDetails) {
        verificationDetails.className = "verification-details neutral";
        verificationDetails.textContent = "Enter the matrix and vector, then run the calculation.";
    }

    setOperatorCoordinates("output", null);
    renderOperatorSphere("operatorOutputSphere", null, "Output State");
    updateVectorGeometry(null);
}

function formatMatrixCalculation(result) {
    const a = result.matrix;
    const x = result.vector;
    const y = result.transformed_vector;

    const a11 = formatOperatorComplexLatex(a[0][0]);
    const a12 = formatOperatorComplexLatex(a[0][1]);
    const a21 = formatOperatorComplexLatex(a[1][0]);
    const a22 = formatOperatorComplexLatex(a[1][1]);

    const x1 = formatOperatorComplexLatex(x[0]);
    const x2 = formatOperatorComplexLatex(x[1]);

    const y1 = formatOperatorComplexLatex(y[0]);
    const y2 = formatOperatorComplexLatex(y[1]);

    const row1 = `(${a11})(${x1}) ${a12.startsWith("-") ? "-" : "+"} (${a12.startsWith("-") ? a12.slice(1) : a12})(${x2})`;
    const row2 = `(${a21})(${x1}) ${a22.startsWith("-") ? "-" : "+"} (${a22.startsWith("-") ? a22.slice(1) : a22})(${x2})`;

    return String.raw`
        <div class="operator-calculation-title">Matrix multiplication</div>
        <div class="operator-formula operator-formula-large">
            \[
            \begin{bmatrix}
            ${a11} & ${a12}\\
            ${a21} & ${a22}
            \end{bmatrix}
            \begin{bmatrix}
            ${x1}\\
            ${x2}
            \end{bmatrix}
            =
            \begin{bmatrix}
            ${row1}\\
            ${row2}
            \end{bmatrix}
            =
            \begin{bmatrix}
            ${y1}\\
            ${y2}
            \end{bmatrix}
            \]
        </div>
        <div class="equation-secondary">
            The vector on the right is \(AX\). Its actual magnitude is \(${Number(result.output_magnitude).toFixed(4)}\).
        </div>
    `;
}

function renderCharacteristic(result) {
    const c = result.characteristic;
    const a = result.matrix;

    const trace = formatOperatorComplexLatex(c.trace);
    const determinant = formatOperatorComplexLatex(c.determinant);
    const a11 = formatOperatorComplexLatex(a[0][0]);
    const a12 = formatOperatorComplexLatex(a[0][1]);
    const a21 = formatOperatorComplexLatex(a[1][0]);
    const a22 = formatOperatorComplexLatex(a[1][1]);

    const bCoeff = formatOperatorComplexLatex(c.lambda_coefficient);
    const dCoeff = formatOperatorComplexLatex(c.constant_coefficient);

    const container = document.getElementById("characteristicEquation");
    if (!container) return;

    const coefficientTerm = (() => {
        if (bCoeff === "0") return "";
        if (bCoeff.startsWith("-")) return `${bCoeff}\\lambda`;
        if (/^[0-9.]+$/.test(bCoeff)) return `+${bCoeff}\\lambda`;
        return `+(${bCoeff})\\lambda`;
    })();

    const constantTerm = (() => {
        if (dCoeff === "0") return "";
        if (dCoeff.startsWith("-")) return dCoeff;
        if (/^[0-9.]+$/.test(dCoeff)) return `+${dCoeff}`;
        return `+(${dCoeff})`;
    })();

    container.innerHTML = String.raw`
        <div class="operator-calculation-title">Characteristic equation</div>
        <div class="operator-formula">
            \[
            \det(A-\lambda I)=0
            \]
        </div>
        <div class="equation-secondary">
            \[
            \det\begin{bmatrix}
            ${a11}-\lambda & ${a12}\\
            ${a21} & ${a22}-\lambda
            \end{bmatrix}=0
            \]
        </div>
        <div class="equation-secondary">
            \[
            \lambda^2 ${coefficientTerm} ${constantTerm} = 0
            \]
        </div>
        <div class="equation-secondary equation-readable">
            \(\operatorname{tr}(A)=${trace}\) &nbsp; | &nbsp; \(\det(A)=${determinant}\)
        </div>
    `;

    if (window.MathJax?.typesetPromise) MathJax.typesetPromise([container]);
}

function renderEigenvalues(result) {
    const container = document.getElementById("eigenvalueList");
    if (!container) return;

    container.innerHTML = result.eigenvalues.map((value, index) => `
        <div class="eigenvalue-card">
            <span class="label">Eigenvalue λ${index + 1}</span>
            <div class="eigenvalue-formula">\\(${formatOperatorComplexLatex(value)}\\)</div>
            <div class="equation-readable">Magnitude: ${Number(value.magnitude).toFixed(4)} &nbsp; | &nbsp; Phase: ${Number(value.phase_degrees).toFixed(2)}°</div>
        </div>
    `).join("");

    if (window.MathJax?.typesetPromise) MathJax.typesetPromise([container]);
}

function renderEigenvectors(result) {
    const container = document.getElementById("eigenvectorList");
    if (!container) return;

    container.innerHTML = result.eigenvectors.map((item, index) => {
        const eigenvalue = formatOperatorComplexLatex(item.eigenvalue);
        const v1 = formatOperatorComplexLatex(item.vector[0]);
        const v2 = formatOperatorComplexLatex(item.vector[1]);
        const bx = Number(item.bloch_coordinates?.x ?? 0).toFixed(3);
        const by = Number(item.bloch_coordinates?.y ?? 0).toFixed(3);
        const bz = Number(item.bloch_coordinates?.z ?? 0).toFixed(3);

        return String.raw`
            <div class="eigenvector-card">
                <span class="label">Eigenvector for λ${index + 1}</span>
                <div class="eigenvalue-formula eigenvector-math">
                    \[
                    \begin{bmatrix}
                    ${v1}\\
                    ${v2}
                    \end{bmatrix}
                    \]
                </div>
                <div class="equation-readable">
                    Eigenvalue: \(${eigenvalue}\)<br>
                    Bloch direction: (${bx}, ${by}, ${bz})
                </div>
            </div>
        `;
    }).join("");

    if (window.MathJax?.typesetPromise) {
        MathJax.typesetPromise([container]).catch(error => {
            console.error("MathJax eigenvector rendering error:", error);
        });
    }
}

function renderVerification(result) {
    const test = result.test;
    const badge = document.getElementById("eigenStatusBadge");
    const verificationX = document.getElementById("verificationX");
    const verificationAX = document.getElementById("verificationAX");
    const verificationLambdaX = document.getElementById("verificationLambdaX");
    const equation = document.getElementById("verificationEquation");
    const details = document.getElementById("verificationDetails");

    if (verificationX) setMathJaxHtml(verificationX, `\\(${formatOperatorVector(result.vector, true)}\\)`);
    if (verificationAX) setMathJaxHtml(verificationAX, `\\(${formatOperatorVector(test.ax, true)}\\)`);

    if (test.is_eigenvector) {
        if (verificationLambdaX) {
            setMathJaxHtml(verificationLambdaX, `\\(${formatOperatorVector(test.lambda_x, true)}\\)`);
        }

        const lambda = formatOperatorComplexLatex(test.matching_eigenvalue);

        if (equation) {
            setMathJaxHtml(equation, String.raw`
                <div class="operator-formula">\[AX=\lambda X\]</div>
                <div class="equation-secondary">\[AX=${lambda}X\]</div>
                <div class="equation-secondary">\[AX=\begin{bmatrix}${formatOperatorComplexLatex(test.ax[0])}\\${formatOperatorComplexLatex(test.ax[1])}\end{bmatrix}=\begin{bmatrix}${formatOperatorComplexLatex(test.lambda_x[0])}\\${formatOperatorComplexLatex(test.lambda_x[1])}\end{bmatrix}=\lambda X\]</div>
            `);
        }

        if (badge) {
            badge.className = "operator-badge success";
            badge.textContent = "EIGENVECTOR ✓";
        }

        if (details) {
            details.className = "verification-details success";
            const scale = Number(test.scale_magnitude ?? 0).toFixed(4);
            const phase = Number(test.phase_degrees ?? 0).toFixed(2);

            let text = `YES. AX is a scalar multiple of X. Scale factor |λ| = ${scale}. Phase change = ${phase}°. ${test.behavior}.`;
            if (test.same_bloch_direction) {
                text += " The normalized Bloch direction is unchanged, so both Bloch spheres point in the same direction.";
            }
            details.textContent = text;
        }
    } else {
        if (verificationLambdaX) verificationLambdaX.innerHTML = "No single scalar λ makes AX = λX.";

        if (equation) {
            setMathJaxHtml(equation, String.raw`
                <div class="operator-formula">\[AX\ne\lambda X\]</div>
                <div>Your entered vector is not an eigenvector of this operator because the transformed vector is not parallel to the original vector.</div>
            `);
        }

        if (badge) {
            badge.className = "operator-badge warning";
            badge.textContent = "NOT AN EIGENVECTOR";
        }

        if (details) {
            details.className = "verification-details error";
            details.textContent = `NO. AX is not parallel to X. Residual norm = ${Number(test.residual_norm).toExponential(3)}. The direction changes under the operator.`;
        }
    }
}

async function analyzeOperator() {
    const matrix = getOperatorInputMatrix();
    const vector = getOperatorInputVector();
    const parsedVector = getOperatorVectorFromInputs();

    if (!matrix.flat().every(value => parseOperatorComplexInput(value) !== null)) {
        alert("Please enter four valid matrix values for the 2 × 2 matrix A.");
        return;
    }

    if (!parsedVector) {
        alert("Please enter a valid non-zero column vector X.");
        return;
    }

    const button = document.querySelector('.operator-action-row .primary-btn');
    if (button) {
        button.disabled = true;
        button.textContent = "Calculating...";
    }

    try {
        const response = await fetch("/api/operator/analyze", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({ matrix, vector })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || `Operator analysis failed (${response.status})`);
        }

        const badge = document.getElementById("operatorTypeBadge");
        if (badge) {
            badge.className = data.is_unitary ? "operator-badge success" : "operator-badge warning";
            badge.textContent = data.is_unitary ? "VALID QUANTUM GATE" : "MATHEMATICAL OPERATOR";
        }

        const calculation = document.getElementById("matrixCalculation");
        if (calculation) calculation.innerHTML = formatMatrixCalculation(data);

        renderCharacteristic(data);
        renderEigenvalues(data);
        renderEigenvectors(data);
        renderVerification(data);
        updateVectorGeometry(data);

        setOperatorCoordinates("input", data.input_bloch);
        setOperatorCoordinates("output", data.output_bloch);
        renderOperatorSphere("operatorInputSphere", data.input_bloch, "Input State X");
        renderOperatorSphere("operatorOutputSphere", data.output_bloch, "Transformed State AX");

        const outputCaption = document.getElementById("outputSphereCaption");
        if (outputCaption) {
            outputCaption.textContent = data.output_bloch
                ? "AX is normalized only for Bloch-sphere visualization; the vector diagram preserves its actual magnitude."
                : "AX is the zero vector, so it has no Bloch-sphere direction.";
        }

        if (window.MathJax?.typesetPromise) {
            await MathJax.typesetPromise();
        }
    } catch (error) {
        console.error(error);
        alert(`Operator Error: ${error.message}`);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Calculate Operator";
        }
    }
}

function resetOperatorLab() {
    ["a11", "a12", "a21", "a22", "x1", "x2"].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = "";
    });

    clearOperatorResults();
    updateOperatorInputSphere();
}

function initOperatorLab() {
    addOperatorLabNav();
    renderOperatorSphere("operatorInputSphere", null, "Input State");
    renderOperatorSphere("operatorOutputSphere", null, "Output State");

    ["x1", "x2"].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.addEventListener("input", updateOperatorInputSphere);
    });

    ["a11", "a12", "a21", "a22"].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.addEventListener("input", clearOperatorResults);
    });

    updateOperatorInputSphere();
}

document.addEventListener("DOMContentLoaded", () => {
    addOperatorLabNav();

    if (document.getElementById("operatorInputSphere")) {
        initOperatorLab();
    }

    if (document.getElementById("initialReal0")) {
        ["initialReal0", "initialImag0", "initialReal1", "initialImag1"].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.addEventListener("input", updateInitialVectorPreview);
        });
        updateInitialVectorPreview();
    }
});
