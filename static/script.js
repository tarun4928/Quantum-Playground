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
    // Sort dictionary entries numerically: keys like "10"/"11" are valid
    // integer-like JS property names, so Object.entries would otherwise
    // list them before "00"/"01" and scramble the basis order.
    const entries = Array.isArray(state)
        ? state.map((value, index) => [String(index), value])
        : Object.entries(state).sort((a, b) => Number(a[0]) - Number(b[0]));

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

    // Join terms, printing a leading minus as a proper " − " separator.
    let out = "";
    terms.forEach(term => {
        if (!out) {
            out = term;
        } else if (term.startsWith("-")) {
            out += " - " + term.slice(1);
        } else {
            out += " + " + term;
        }
    });

    return out || "0";
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
        x: sx, y: sy, z: sz, type: "surface", opacity: 0.35, showscale: false, hoverinfo: "skip",
        colorscale: [[0, "rgb(244, 237, 223)"], [1, "rgb(206, 188, 156)"]]
    }], {
        margin: { l: 0, r: 0, t: 25, b: 0 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        scene: {
            xaxis: { title: "X", range: [-1.2, 1.2], color: "#8A7A66", gridcolor: "rgba(118,84,56,0.14)", zerolinecolor: "rgba(118,84,56,0.3)", showbackground: false },
            yaxis: { title: "Y", range: [-1.2, 1.2], color: "#8A7A66", gridcolor: "rgba(118,84,56,0.14)", zerolinecolor: "rgba(118,84,56,0.3)", showbackground: false },
            zaxis: { title: "Z", range: [-1.2, 1.2], color: "#8A7A66", gridcolor: "rgba(118,84,56,0.14)", zerolinecolor: "rgba(118,84,56,0.3)", showbackground: false },
            aspectmode: "cube"
        },
        showlegend: false,
        title: { text: title, font: { size: 12, color: "#6B5D4C", family: "IBM Plex Mono, monospace" } }
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
        opacity: 0.35,
        colorscale: [[0, "rgb(244, 237, 223)"], [1, "rgb(206, 188, 156)"]],
        showscale: false,
        hoverinfo: "skip"
    };

    const point = {
        x: [x],
        y: [y],
        z: [z],
        type: "scatter3d",
        mode: "markers",
        marker: { size: 7, color: "#765438" },
        name: "Quantum State",
        hovertemplate: "x=%{x:.3f}<br>y=%{y:.3f}<br>z=%{z:.3f}<extra></extra>"
    };

    const vector = {
        x: [0, x],
        y: [0, y],
        z: [0, z],
        type: "scatter3d",
        mode: "lines",
        line: { width: 6, color: "#765438" },
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
        colorscale: [[0, "#765438"], [1, "#765438"]],
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
                    zeroline: true,
                    color: "#8A7A66",
                    gridcolor: "rgba(118,84,56,0.14)",
                    zerolinecolor: "rgba(118,84,56,0.3)",
                    showbackground: false
                },
                yaxis: {
                    title: "Y",
                    range: [-1.2, 1.2],
                    zeroline: true,
                    color: "#8A7A66",
                    gridcolor: "rgba(118,84,56,0.14)",
                    zerolinecolor: "rgba(118,84,56,0.3)",
                    showbackground: false
                },
                zaxis: {
                    title: "Z",
                    range: [-1.2, 1.2],
                    zeroline: true,
                    color: "#8A7A66",
                    gridcolor: "rgba(118,84,56,0.14)",
                    zerolinecolor: "rgba(118,84,56,0.3)",
                    showbackground: false
                },
                aspectmode: "cube"
            },
            showlegend: false
        },
        { responsive: true }
    );
}

// Generic named renderer (also used for the initial-state preview).
function renderBlochSphere(elementId, coordinates, title) {
    renderOperatorSphere(elementId, coordinates, title);
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
    link.innerHTML = '<span class="nav-index">06</span> Operator Lab';

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
    const axisStyle = {
        range: [-1.2, 1.2],
        zeroline: true,
        color: "#8A7A66",
        gridcolor: "rgba(118,84,56,0.14)",
        zerolinecolor: "rgba(118,84,56,0.3)",
        showbackground: false
    };
    return {
        margin: { l: 0, r: 0, t: 34, b: 0 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        scene: {
            xaxis: { title: "X", ...axisStyle },
            yaxis: { title: "Y", ...axisStyle },
            zaxis: { title: "Z", ...axisStyle },
            aspectmode: "cube"
        },
        showlegend: false,
        title: { text: title, font: { size: 12, color: "#6B5D4C", family: "IBM Plex Mono, monospace" } }
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
        opacity: 0.35,
        colorscale: [[0, "rgb(244, 237, 223)"], [1, "rgb(206, 188, 156)"]],
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
            line: { width: 6, color: "#765438" },
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
            colorscale: [[0, "#765438"], [1, "#765438"]],
            showscale: false,
            hoverinfo: "skip"
        });

        traces.push({
            x: [x],
            y: [y],
            z: [z],
            type: "scatter3d",
            mode: "markers",
            marker: { size: 7, color: "#765438" },
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
    addChallengeNav();

    if (document.getElementById("operatorInputSphere")) {
        initOperatorLab();
    }

    if (document.getElementById("combinedBlochSphere")) {
        initChallengeLab();
    }

    if (document.getElementById("initialReal0")) {
        ["initialReal0", "initialImag0", "initialReal1", "initialImag1"].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.addEventListener("input", updateInitialVectorPreview);
        });
        updateInitialVectorPreview();
    }
});


/* =====================================================
   QUANTUM STATE CHALLENGE ENGINE (FRONTEND)
===================================================== */

let challengeStateData = null;
let challengeStepHistory = [];
let challengeViewMode = "combined"; // 'combined' or 'dual'
let activePresetId = "level_1";
let hasShownVictoryForCurrentState = false;

function addChallengeNav() {
    const nav = document.querySelector(".sidebar nav");
    if (!nav || nav.querySelector('a[href="/challenge"]')) return;

    const link = document.createElement("a");
    link.href = "/challenge";
    link.className = "nav-item challenge-nav-item";
    if (window.location.pathname === "/challenge" || window.location.pathname === "/game") {
        link.classList.add("active");
    }
    link.innerHTML = '<span class="nav-index">07</span> State Challenge';

    const divider = nav.querySelector(".nav-divider");
    if (divider) nav.insertBefore(link, divider);
    else nav.appendChild(link);
}

function challengeSphereLayout(title) {
    const axisStyle = {
        range: [-1.25, 1.25],
        zeroline: true,
        showgrid: true,
        gridcolor: "rgba(118,84,56,0.14)",
        zerolinecolor: "rgba(118,84,56,0.3)",
        showbackground: false,
        color: "#8A7A66"
    };
    return {
        margin: { l: 0, r: 0, t: 28, b: 0 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        scene: {
            xaxis: { title: "X", ...axisStyle },
            yaxis: { title: "Y", ...axisStyle },
            zaxis: { title: "Z", ...axisStyle },
            aspectmode: "cube"
        },
        showlegend: false,
        title: { text: title, font: { size: 12, color: "#6B5D4C", family: "IBM Plex Mono, monospace" } }
    };
}

function renderChallengeBlochSphere(elementId, currentCoords, targetCoords, title) {
    const sphere = document.getElementById(elementId);
    if (!sphere || !window.Plotly) return;

    const theta = Array.from({ length: 36 }, (_, i) => Math.PI * i / 35);
    const phi = Array.from({ length: 36 }, (_, i) => 2 * Math.PI * i / 35);

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
        opacity: 0.35,
        colorscale: [
            [0, "rgb(244, 237, 223)"],
            [1, "rgb(206, 188, 156)"]
        ],
        showscale: false,
        hoverinfo: "skip"
    };

    const traces = [surface];

    // Target State Vector (Brass)
    if (targetCoords) {
        const tx = Number(targetCoords.x);
        const ty = Number(targetCoords.y);
        const tz = Number(targetCoords.z);

        traces.push({
            x: [0, tx],
            y: [0, ty],
            z: [0, tz],
            type: "scatter3d",
            mode: "lines",
            line: { color: "#A2762A", width: 6, dash: "dot" },
            name: "Target State",
            hoverinfo: "skip"
        });

        traces.push({
            type: "cone",
            x: [tx],
            y: [ty],
            z: [tz],
            u: [tx],
            v: [ty],
            w: [tz],
            anchor: "tip",
            sizemode: "absolute",
            sizeref: 0.15,
            colorscale: [[0, "#A2762A"], [1, "#A2762A"]],
            showscale: false,
            hoverinfo: "skip"
        });

        traces.push({
            x: [tx],
            y: [ty],
            z: [tz],
            type: "scatter3d",
            mode: "markers",
            marker: { size: 7, color: "#A2762A" },
            name: "Target State",
            hovertemplate: "Target: x=%{x:.3f}, y=%{y:.3f}, z=%{z:.3f}<extra></extra>"
        });
    }

    // Current State Vector (Deep Brown)
    if (currentCoords) {
        const cx = Number(currentCoords.x);
        const cy = Number(currentCoords.y);
        const cz = Number(currentCoords.z);

        traces.push({
            x: [0, cx],
            y: [0, cy],
            z: [0, cz],
            type: "scatter3d",
            mode: "lines",
            line: { color: "#765438", width: 7 },
            name: "Current State",
            hoverinfo: "skip"
        });

        traces.push({
            type: "cone",
            x: [cx],
            y: [cy],
            z: [cz],
            u: [cx],
            v: [cy],
            w: [cz],
            anchor: "tip",
            sizemode: "absolute",
            sizeref: 0.16,
            colorscale: [[0, "#765438"], [1, "#765438"]],
            showscale: false,
            hoverinfo: "skip"
        });

        traces.push({
            x: [cx],
            y: [cy],
            z: [cz],
            type: "scatter3d",
            mode: "markers",
            marker: { size: 8, color: "#765438" },
            name: "Current State",
            hovertemplate: "Current: x=%{x:.3f}, y=%{y:.3f}, z=%{z:.3f}<extra></extra>"
        });
    }

    Plotly.react(
        sphere,
        traces,
        challengeSphereLayout(title),
        { responsive: true, displayModeBar: false }
    );
}

function updateChallengeUI(data) {
    if (!data) return;
    challengeStateData = data;

    const evaluation = data.evaluation || {};
    const currPayload = data.current_payload || {};
    const tgtPayload = data.target_payload || {};
    const initPayload = data.initial_payload || {};

    // 1. Header & badges
    const titleEl = document.getElementById("challengeTitle");
    if (titleEl) titleEl.textContent = data.name || "Quantum State Challenge";

    const diffBadge = document.getElementById("challengeDifficultyBadge");
    if (diffBadge) diffBadge.textContent = data.difficulty || "Medium";

    const parBadge = document.getElementById("parStepsBadge");
    if (parBadge) {
        parBadge.textContent = `Par: ${data.optimal_steps} step${data.optimal_steps === 1 ? '' : 's'}`;
    }

    const descEl = document.getElementById("challengeDescriptionText");
    if (descEl) descEl.textContent = data.description || "";

    // 2. Scorecard Metrics
    const moves = Number(data.moves_taken || 0);
    const par = Number(data.optimal_steps || 1);

    const movesEl = document.getElementById("metricCurrentMoves");
    if (movesEl) movesEl.textContent = moves;

    const diffEl = document.getElementById("metricMoveDifference");
    if (diffEl) {
        if (moves === 0) {
            diffEl.textContent = `Target: least steps (Par ${par})`;
            diffEl.style.color = "var(--muted)";
        } else if (moves === par) {
            diffEl.textContent = "At Par (Optimal pace!)";
            diffEl.style.color = "#5E7C4B";
        } else if (moves < par) {
            diffEl.textContent = `${par - moves} move(s) remaining for par`;
            diffEl.style.color = "#8F6E4B";
        } else {
            diffEl.textContent = `+${moves - par} over par`;
            diffEl.style.color = "#A65E2E";
        }
    }

    const parEl = document.getElementById("metricOptimalMoves");
    if (parEl) parEl.textContent = par;

    const fid = Number(evaluation.fidelity ?? 0);
    const fidPct = (fid * 100).toFixed(1);
    const fidEl = document.getElementById("metricFidelity");
    if (fidEl) fidEl.textContent = `${fidPct}%`;

    const barEl = document.getElementById("fidelityProgressBar");
    if (barEl) {
        barEl.style.width = `${Math.min(100, Math.max(0, fid * 100))}%`;
        barEl.style.background = fid >= 0.999 ? "#5E7C4B" : (fid > 0.5 ? "#A88968" : "#765438");
    }

    const angle = Number(evaluation.angle_degrees ?? 0);
    const angleEl = document.getElementById("metricBlochAngle");
    if (angleEl) {
        angleEl.textContent = evaluation.target_reached ? "0.0° (Aligned!)" : `${angle.toFixed(1)}°`;
        angleEl.style.color = evaluation.target_reached ? "#5E7C4B" : "#302820";
    }

    const distEl = document.getElementById("metricBlochDistance");
    if (distEl) {
        distEl.textContent = `Bloch Distance: ${Number(evaluation.bloch_distance ?? 0).toFixed(3)}`;
    }

    // 3. State Equation Ket values
    const initKetEl = document.getElementById("initialKetDisplay");
    if (initKetEl) initKetEl.textContent = initPayload.ket || "|0⟩";

    const currKetEl = document.getElementById("currentKetDisplay");
    if (currKetEl) currKetEl.textContent = currPayload.ket || "|0⟩";

    const tgtKetEl = document.getElementById("targetKetDisplay");
    if (tgtKetEl) tgtKetEl.textContent = tgtPayload.ket || "|1⟩";

    // 4. Coordinates
    const currCoords = currPayload.bloch_coordinates || { x: 0, y: 0, z: 1 };
    const tgtCoords = tgtPayload.bloch_coordinates || { x: 0, y: 0, z: -1 };

    const cX = document.getElementById("currX");
    const cY = document.getElementById("currY");
    const cZ = document.getElementById("currZ");
    if (cX) cX.textContent = Number(currCoords.x).toFixed(2);
    if (cY) cY.textContent = Number(currCoords.y).toFixed(2);
    if (cZ) cZ.textContent = Number(currCoords.z).toFixed(2);

    const tX = document.getElementById("tgtX");
    const tY = document.getElementById("tgtY");
    const tZ = document.getElementById("tgtZ");
    if (tX) tX.textContent = Number(tgtCoords.x).toFixed(2);
    if (tY) tY.textContent = Number(tgtCoords.y).toFixed(2);
    if (tZ) tZ.textContent = Number(tgtCoords.z).toFixed(2);

    // 5. Render 3D Spheres
    renderChallengeBlochSphere("combinedBlochSphere", currCoords, tgtCoords, "Current state (brown) vs target state (brass)");
    renderChallengeBlochSphere("currentBlochSphere", currCoords, null, "Current State");
    renderChallengeBlochSphere("targetBlochSphere", null, tgtCoords, "Target State");

    // 6. Circuit Wire Display
    const wireGates = document.getElementById("challengeWireGates");
    const history = data.gate_history || [];
    if (wireGates) {
        if (history.length === 0) {
            wireGates.innerHTML = '<span class="empty-circuit">No gates applied yet. Choose a gate above to begin!</span>';
        } else {
            wireGates.innerHTML = history.map((gate, i) => `
                <div class="circuit-gate-item">
                    <strong>${gate}</strong>
                    <small>Step ${i + 1}</small>
                </div>
            `).join("");
        }
    }

    const badgeStepCount = document.getElementById("circuitStepCountBadge");
    if (badgeStepCount) {
        badgeStepCount.textContent = `${history.length} gate${history.length === 1 ? '' : 's'} executed`;
    }

    // 7. Update History Table
    updateChallengeHistoryTable(history, currPayload.ket, fidPct, angle);

    // 8. MathJax typeset if available
    if (window.MathJax?.typesetPromise) {
        MathJax.typesetPromise();
    }

    // 9. Check Victory Condition
    if (evaluation.target_reached) {
        if (!hasShownVictoryForCurrentState) {
            hasShownVictoryForCurrentState = true;
            showVictoryModal(data);
        }
    } else {
        hasShownVictoryForCurrentState = false;
    }
}

function updateChallengeHistoryTable(history, latestKet, fidPct, angleDeg) {
    const tbody = document.getElementById("challengeHistoryTableBody");
    if (!tbody) return;

    if (!history || history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Initial state ready. Apply your first gate.</td></tr>';
        challengeStepHistory = [];
        return;
    }

    // If step history is shorter than history length, add new step
    if (challengeStepHistory.length < history.length) {
        const stepNum = history.length;
        const gate = history[history.length - 1];
        challengeStepHistory.push({
            step: stepNum,
            gate: gate,
            ket: latestKet,
            fidelity: `${fidPct}%`,
            angle: `${angleDeg.toFixed(1)}°`
        });
    } else if (challengeStepHistory.length > history.length) {
        challengeStepHistory = challengeStepHistory.slice(0, history.length);
    }

    tbody.innerHTML = challengeStepHistory.map(row => `
        <tr>
            <td><strong>#${row.step}</strong></td>
            <td><span class="operator-badge neutral" style="font-weight:700;">${row.gate}</span></td>
            <td><code>${row.ket}</code></td>
            <td>${row.fidelity}</td>
            <td>${row.angle}</td>
        </tr>
    `).join("");
}

function showVictoryModal(data) {
    const modal = document.getElementById("victoryModal");
    if (!modal) return;

    const evaluation = data.evaluation || {};
    const moves = Number(data.moves_taken || 0);
    const optimal = Number(data.optimal_steps || 1);

    const starsEl = document.getElementById("victoryStars");
    const titleEl = document.getElementById("victoryTitle");
    const subEl = document.getElementById("victorySubtitle");
    const userMovesEl = document.getElementById("victoryUserMoves");
    const optMovesEl = document.getElementById("victoryOptimalMoves");
    const effEl = document.getElementById("victoryEfficiency");
    const expEl = document.getElementById("victoryExplanation");

    if (userMovesEl) userMovesEl.textContent = moves;
    if (optMovesEl) optMovesEl.textContent = optimal;

    const eff = Math.min(100, Math.round((optimal / Math.max(1, moves)) * 100));
    if (effEl) effEl.textContent = `${eff}%`;

    if (moves === optimal) {
        if (starsEl) starsEl.textContent = "★★★";
        if (titleEl) titleEl.textContent = "FLAWLESS! LEAST STEPS ACHIEVED!";
        if (subEl) subEl.textContent = `Masterful! You reached the target state in the exact minimum of ${optimal} step${optimal === 1 ? '' : 's'}.`;
    } else if (moves <= optimal + 2) {
        if (starsEl) starsEl.textContent = "★★☆";
        if (titleEl) titleEl.textContent = "GREAT JOB! TARGET REACHED!";
        if (subEl) subEl.textContent = `Completed in ${moves} moves (Par is ${optimal} steps). Try solving it in fewer steps!`;
    } else {
        if (starsEl) starsEl.textContent = "★☆☆";
        if (titleEl) titleEl.textContent = "TARGET REACHED!";
        if (subEl) subEl.textContent = `You reached the target in ${moves} moves, but it can be done in only ${optimal} step${optimal === 1 ? '' : 's'}.`;
    }

    if (expEl) {
        expEl.textContent = data.concept ||
            `The applied quantum gate sequence rotates the state vector along the Bloch sphere into exact alignment with the target state.`;
    }

    modal.style.display = "flex";
}

function closeVictoryModal() {
    const modal = document.getElementById("victoryModal");
    if (modal) modal.style.display = "none";
}

async function applyChallengeGate(gateName) {
    hideHintBox();
    try {
        const response = await fetch("/api/challenge/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gate: gateName })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || "Failed to apply gate.");
        }
        updateChallengeUI(data);
    } catch (err) {
        console.error(err);
        alert(`Gate Error: ${err.message}`);
    }
}

async function undoChallengeGate() {
    hideHintBox();
    try {
        const response = await fetch("/api/challenge/undo", {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || "Undo failed.");
        }
        updateChallengeUI(data);
    } catch (err) {
        console.error(err);
    }
}

async function resetChallengeState() {
    hideHintBox();
    try {
        const response = await fetch("/api/challenge/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || "Reset failed.");
        }
        challengeStepHistory = [];
        hasShownVictoryForCurrentState = false;
        updateChallengeUI(data);
    } catch (err) {
        console.error(err);
    }
}

async function getChallengeHint() {
    try {
        const response = await fetch("/api/challenge/hint", {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || "Hint unavailable.");
        }
        showHintBox(data.message);
    } catch (err) {
        console.error(err);
        alert(`Hint Error: ${err.message}`);
    }
}

async function revealOptimalSolution() {
    try {
        const response = await fetch("/api/challenge/solve", {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || "Solution unavailable.");
        }
        const optSeq = data.optimal_sequence ? data.optimal_sequence.join(" ➔ ") : "Unknown";
        const remSeq = data.remaining_sequence ? data.remaining_sequence.join(" ➔ ") : "None";
        showHintBox(`Optimal sequence from start (${data.optimal_steps} steps): [ ${optSeq} ]. From current state (${data.remaining_steps} steps): [ ${remSeq} ].`);
    } catch (err) {
        console.error(err);
        alert(`Solve Error: ${err.message}`);
    }
}

function showHintBox(msg) {
    const box = document.getElementById("challengeHintBox");
    const text = document.getElementById("challengeHintText");
    if (box && text) {
        text.textContent = msg;
        box.style.display = "flex";
    }
}

function hideHintBox() {
    const box = document.getElementById("challengeHintBox");
    if (box) box.style.display = "none";
}

async function loadChallengePreset(presetId) {
    hideHintBox();
    closeVictoryModal();
    activePresetId = presetId;

    // Highlight active preset pill
    document.querySelectorAll(".preset-pill").forEach(pill => {
        pill.classList.remove("active");
        if (pill.getAttribute("onclick")?.includes(presetId)) {
            pill.classList.add("active");
        }
    });

    try {
        const response = await fetch("/api/challenge/new", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ preset_id: presetId })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || "Failed to load preset.");
        }
        challengeStepHistory = [];
        hasShownVictoryForCurrentState = false;
        updateChallengeUI(data);
    } catch (err) {
        console.error(err);
        alert(`Preset Error: ${err.message}`);
    }
}

async function generateNewRandomChallenge(difficulty) {
    hideHintBox();
    closeVictoryModal();
    document.querySelectorAll(".preset-pill").forEach(pill => pill.classList.remove("active"));

    try {
        const response = await fetch("/api/challenge/new", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ difficulty: difficulty })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || "Failed to generate random challenge.");
        }
        challengeStepHistory = [];
        hasShownVictoryForCurrentState = false;
        updateChallengeUI(data);
    } catch (err) {
        console.error(err);
        alert(`Generator Error: ${err.message}`);
    }
}

function nextLevelOrRandom() {
    closeVictoryModal();
    // Advance to next level if on a preset
    const match = activePresetId.match(/level_(\d+)/);
    if (match) {
        const nextNum = parseInt(match[1], 10) + 1;
        if (nextNum <= 10) {
            loadChallengePreset(`level_${nextNum}`);
            return;
        }
    }
    generateNewRandomChallenge("medium");
}

function toggleSphereView() {
    const combined = document.getElementById("combinedSphereContainer");
    const dual = document.getElementById("dualSphereContainer");
    const btn = document.getElementById("viewToggleBtn");

    if (challengeViewMode === "combined") {
        challengeViewMode = "dual";
        if (combined) combined.style.display = "none";
        if (dual) dual.style.display = "grid";
        if (btn) btn.textContent = "Switch to Single Sphere";
    } else {
        challengeViewMode = "combined";
        if (combined) combined.style.display = "block";
        if (dual) dual.style.display = "none";
        if (btn) btn.textContent = "Switch to Dual Spheres";
    }

    if (challengeStateData) {
        const currCoords = challengeStateData.current_payload?.bloch_coordinates;
        const tgtCoords = challengeStateData.target_payload?.bloch_coordinates;
        if (challengeViewMode === "combined") {
            renderChallengeBlochSphere("combinedBlochSphere", currCoords, tgtCoords, "Current state (brown) vs target state (brass)");
        } else {
            renderChallengeBlochSphere("currentBlochSphere", currCoords, null, "Current State");
            renderChallengeBlochSphere("targetBlochSphere", null, tgtCoords, "Target State");
        }
    }
}

function toggleCustomModal() {
    const modal = document.getElementById("customChallengeModal");
    if (!modal) return;
    modal.style.display = modal.style.display === "flex" ? "none" : "flex";
}

async function submitCustomChallenge() {
    const r0 = parseFloat(document.getElementById("customInitRe0")?.value || 0);
    const i0 = parseFloat(document.getElementById("customInitIm0")?.value || 0);
    const r1 = parseFloat(document.getElementById("customInitRe1")?.value || 0);
    const i1 = parseFloat(document.getElementById("customInitIm1")?.value || 0);

    const tr0 = parseFloat(document.getElementById("customTgtRe0")?.value || 0);
    const ti0 = parseFloat(document.getElementById("customTgtIm0")?.value || 0);
    const tr1 = parseFloat(document.getElementById("customTgtRe1")?.value || 0);
    const ti1 = parseFloat(document.getElementById("customTgtIm1")?.value || 0);

    if (isNaN(r0) || isNaN(i0) || isNaN(r1) || isNaN(i1) || (r0 === 0 && i0 === 0 && r1 === 0 && i1 === 0)) {
        alert("Please enter a valid non-zero initial state vector.");
        return;
    }

    if (isNaN(tr0) || isNaN(ti0) || isNaN(tr1) || isNaN(ti1) || (tr0 === 0 && ti0 === 0 && tr1 === 0 && ti1 === 0)) {
        alert("Please enter a valid non-zero target state vector.");
        return;
    }

    try {
        const response = await fetch("/api/challenge/custom", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                initial: [{ real: r0, imaginary: i0 }, { real: r1, imaginary: i1 }],
                target: [{ real: tr0, imaginary: ti0 }, { real: tr1, imaginary: ti1 }]
            })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || "Custom challenge could not be generated.");
        }

        toggleCustomModal();
        challengeStepHistory = [];
        hasShownVictoryForCurrentState = false;
        document.querySelectorAll(".preset-pill").forEach(p => p.classList.remove("active"));
        updateChallengeUI(data);
    } catch (err) {
        console.error(err);
        alert(`Custom Error: ${err.message}`);
    }
}

async function initChallengeLab() {
    addChallengeNav();
    try {
        const response = await fetch("/api/challenge/current");
        const data = await response.json();
        if (response.ok && data.success) {
            updateChallengeUI(data);
        }
    } catch (err) {
        console.error("Failed to load initial challenge state:", err);
    }
}


/* =====================================================
   ENTANGLEMENT LAB — TWO-QUBIT STATE ANALYZER
===================================================== */

const ENTANGLEMENT_INPUT_IDS = [
    "entRe00", "entIm00",
    "entRe01", "entIm01",
    "entRe10", "entIm10",
    "entRe11", "entIm11"
];

function readEntanglementInputs() {
    const values = ENTANGLEMENT_INPUT_IDS.map(id => {
        const el = document.getElementById(id);
        if (!el || el.value.trim() === "") return null;
        const v = Number(el.value);
        return Number.isFinite(v) ? v : null;
    });

    if (values.some(v => v === null)) return null;
    if (values.every(v => v === 0)) return null;

    const amplitudes = [];
    for (let i = 0; i < 8; i += 2) {
        amplitudes.push({ real: values[i], imaginary: values[i + 1] });
    }
    return amplitudes;
}

function setEntanglementInputs(values) {
    ENTANGLEMENT_INPUT_IDS.forEach((id, index) => {
        const el = document.getElementById(id);
        if (el) el.value = values[index];
    });
}

function setEntanglementPreset(name) {
    const s = 1 / Math.sqrt(2);
    const presets = {
        zero:       [1, 0,  0, 0,  0, 0,  0, 0],
        product:    [s, 0,  s, 0,  0, 0,  0, 0],
        phi_plus:   [s, 0,  0, 0,  0, 0,  s, 0],
        phi_minus:  [s, 0,  0, 0,  0, 0, -s, 0],
        psi_plus:   [0, 0,  s, 0,  s, 0,  0, 0],
        psi_minus:  [0, 0,  s, 0, -s, 0,  0, 0],
    };
    if (!presets[name]) return;

    setEntanglementInputs(presets[name]);

    const msg = document.getElementById("entStateMessage");
    if (msg) msg.textContent = "Preset loaded. Run the analysis to check its entanglement.";
}

function analyzeBellState(name) {
    setEntanglementPreset(name);
    runEntanglementAnalysis();
}

async function runEntanglementAnalysis() {
    const amplitudes = readEntanglementInputs();

    if (!amplitudes) {
        alert("Enter all eight values (real and imaginary parts of each amplitude), with at least one non-zero value.");
        return;
    }

    try {
        const response = await fetch("/api/entanglement/analyze", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({ amplitudes })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || `Analysis request failed (${response.status})`);
        }

        const msg = document.getElementById("entStateMessage");
        if (msg) msg.textContent = "State normalized and analyzed.";

        updateEntanglementAnalysis(data);
    } catch (error) {
        console.error(error);
        alert(`Entanglement Error: ${error.message}`);
    }
}

function updateEntanglementAnalysis(data) {
    const c = Number(data.concurrence ?? 0);

    const value = document.getElementById("entConcurrence");
    if (value) value.textContent = c.toFixed(3);

    const bar = document.getElementById("entConcurrenceBar");
    if (bar) bar.style.width = `${(c * 100).toFixed(1)}%`;

    const badge = document.getElementById("entClassBadge");
    const result = document.getElementById("entClassification");

    let badgeClass = "operator-badge neutral";
    let badgeText = "Awaiting analysis";
    let resultText = "";

    if (data.classification === "maximally_entangled") {
        badgeClass = "operator-badge highlight";
        badgeText = "Maximally entangled";
        resultText = "Maximally Entangled — as entangled as a Bell state (C ≈ 1).";
    } else if (data.classification === "separable") {
        badgeClass = "operator-badge success";
        badgeText = "Separable";
        resultText = "Separable State — not entangled; it factors into a product of two single-qubit states (C ≈ 0).";
    } else if (data.classification === "partially_entangled") {
        badgeClass = "operator-badge warning";
        badgeText = "Partially entangled";
        resultText = `Partially Entangled — between separable and maximal (C = ${c.toFixed(3)}).`;
    }

    if (badge) {
        badge.className = badgeClass;
        badge.textContent = badgeText;
    }
    if (result) result.textContent = resultText;

    // Normalized state, written in ket form.
    const ket = document.getElementById("entKetDisplay");
    if (ket && data.state) ket.textContent = formatQuantumState(data.state);

    // Per-basis amplitudes and measurement probabilities.
    ["00", "01", "10", "11"].forEach(basis => {
        const amp = data.state?.[basis];

        const ampEl = document.getElementById(`entAmp${basis}`);
        if (ampEl && amp) ampEl.textContent = formatComplexCoefficient(amp) || "0";

        const p = Math.max(0, Math.min(1, Number(amp?.probability ?? 0)));
        const pct = p * 100;

        const probEl = document.getElementById(`entProb${basis}`);
        if (probEl) probEl.textContent = `${pct.toFixed(1)}%`;

        const barEl = document.getElementById(`entBar${basis}`);
        if (barEl) barEl.style.width = `${pct}%`;
    });
}


/* =====================================================
   QKD LAB — BB84 PROTOCOL
===================================================== */

let qkdTranscript = null;
let qkdCursor = 0;
let qkdTimer = null;
let qkdCount = 16;
let qkdEveEnabled = false;
let qkdRunToken = 0;
let qkdFinalized = false;

const QKD_STAGE_ORDER = ["prepare", "transmit", "measure", "sift", "verify", "key"];

function setQKDCount(n) {
    qkdCount = n;
    document.querySelectorAll(".qkd-count-btn").forEach(btn => {
        btn.classList.toggle("active", btn.textContent.trim() === String(n));
    });
    resetQKD();
}

function toggleQkdEve() {
    const box = document.getElementById("qkdEveToggle");
    qkdEveEnabled = Boolean(box?.checked);

    const label = document.getElementById("qkdEveLabel");
    if (label) label.textContent = qkdEveEnabled ? "Eve ON" : "Eve OFF";

    const station = document.getElementById("qkdEveStation");
    if (station) station.classList.toggle("off", !qkdEveEnabled);

    const role = document.getElementById("qkdEveStationRole");
    if (role) role.textContent = qkdEveEnabled ? "intercepting" : "offline";

    const card = document.getElementById("qkdEveCard");
    if (card) card.classList.toggle("off", !qkdEveEnabled);

    resetQKD();
}

async function fetchQKDTranscript() {
    const response = await fetch("/api/qkd/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ count: qkdCount, eve: qkdEveEnabled })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
        throw new Error(data.error || `Simulation request failed (${response.status})`);
    }

    return data;
}

function stopQKDTimer() {
    if (qkdTimer) {
        clearInterval(qkdTimer);
        qkdTimer = null;
    }
    const runBtn = document.getElementById("qkdRunBtn");
    if (runBtn) runBtn.disabled = false;
}

async function runQKDSimulation() {
    stopQKDTimer();

    try {
        qkdTranscript = await fetchQKDTranscript();
    } catch (error) {
        console.error(error);
        alert(`QKD Error: ${error.message}`);
        return;
    }

    clearQKDDisplays();
    qkdCursor = 0;

    const runBtn = document.getElementById("qkdRunBtn");
    if (runBtn) runBtn.disabled = true;

    // One interval covers the full physical journey of a single qubit.
    const interval = qkdEveEnabled ? 3400 : 2000;

    // First qubit starts immediately; the interval handles the rest.
    if (advanceQKD()) {
        qkdTimer = setInterval(() => {
            if (!advanceQKD()) stopQKDTimer();
        }, interval);
    }
}

async function stepQKD() {
    stopQKDTimer();

    if (!qkdTranscript) {
        try {
            qkdTranscript = await fetchQKDTranscript();
        } catch (error) {
            console.error(error);
            alert(`QKD Error: ${error.message}`);
            return;
        }
        clearQKDDisplays();
        qkdCursor = 0;
    }

    advanceQKD();
}

function advanceQKD() {
    if (!qkdTranscript || qkdFinalized) return false;

    const items = qkdTranscript.qubits || [];

    if (qkdCursor < items.length) {
        revealQKDItem(items[qkdCursor], items.length);
        qkdCursor += 1;
        return true;
    }

    qkdFinalized = true;
    finalizeQKD();
    return false;
}

function setQKDStage(name) {
    const order = QKD_STAGE_ORDER.indexOf(name);
    document.querySelectorAll("#qkdStages .qkd-stage").forEach(stage => {
        const idx = QKD_STAGE_ORDER.indexOf(stage.dataset.stage);
        stage.classList.toggle("active", idx === order);
        stage.classList.toggle("done", idx < order);
    });
}

function qkdKet(payload) {
    return payload?.dictionary ? formatQuantumState(payload.dictionary) : "—";
}

function qkdGatesText(gates) {
    return gates && gates.length ? gates.join(" → ") : "I";
}

/* Photon travel time — keep in sync with .qkd-photon's CSS transition. */
const QKD_TRAVEL_MS = 1000;

function revealQKDItem(q, total) {
    // Invalidate this item's pending timeouts if a reset or a new
    // run happens before they fire.
    const token = qkdRunToken;
    const stillCurrent = () => token === qkdRunToken;

    const set = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    const status = document.getElementById("qkdChannelStatus");
    if (status) status.textContent = `Qubit ${q.index + 1} of ${total}`;

    // -- Prepare: a fresh photon appears at Alice holding the prepared state.
    setQKDStage("prepare");
    const photon = document.getElementById("qkdPhoton");
    const photonKet = document.getElementById("qkdPhotonKet");

    // Reset to Alice instantly — a backward glide would be a different
    // (wrong) physical journey.
    if (photon) {
        photon.classList.add("no-anim");
        photon.style.left = "8%";
        void photon.offsetWidth; // flush the transition before re-enabling
        photon.classList.remove("no-anim");
    }
    if (photonKet) photonKet.textContent = q.prepared?.symbol || qkdKet(q.prepared);

    set("qkdAliceBasis", q.alice_basis + " basis");
    set("qkdAliceBit", q.alice_bit);
    set("qkdAliceBasisName", q.alice_basis);
    set("qkdAliceGates", qkdGatesText(q.alice_gates));
    set("qkdAliceKet", qkdKet(q.prepared));

    // Timeline: depart → (arrive Eve → Eve intercepts → depart Eve) → arrive Bob → measure.
    const departAt = 500;
    const eveArriveAt = departAt + QKD_TRAVEL_MS;
    const eveDepartAt = eveArriveAt + 350;
    const bobArriveAt = (q.eve ? eveDepartAt : departAt) + QKD_TRAVEL_MS;
    const measureAt = bobArriveAt + 100;

    // -- Transmit: the photon physically travels the channel.
    setTimeout(() => {
        if (!stillCurrent()) return;
        setQKDStage("transmit");
        if (photon) photon.style.left = q.eve ? "50%" : "92%";
    }, departAt);

    if (q.eve) {
        // Eve intercepts exactly when the photon reaches her station.
        setTimeout(() => {
            if (!stillCurrent()) return;
            set("qkdEveBasis", q.eve.basis + " basis");
            set("qkdEveBasisName", q.eve.basis);
            set("qkdEveResult", q.eve.result);
            set("qkdEveGates", qkdGatesText(q.eve.gates));
            set("qkdEveKet", qkdKet(q.eve.resent));
            if (photonKet) photonKet.textContent = q.eve.resent?.symbol || qkdKet(q.eve.resent);
        }, eveArriveAt);

        // ...and resends the collapsed state onward to Bob.
        setTimeout(() => {
            if (!stillCurrent()) return;
            if (photon) photon.style.left = "92%";
        }, eveDepartAt);
    }

    // -- Measure: Bob reads the photon only once it has arrived.
    setTimeout(() => {
        if (!stillCurrent()) return;
        setQKDStage("measure");
        set("qkdBobBasis", q.bob_basis + " basis");
        set("qkdBobBasisName", q.bob_basis);
        set("qkdBobGates", qkdGatesText(q.bob_gates));
        set("qkdBobKet", q.eve ? qkdKet(q.eve.resent) : qkdKet(q.prepared));
        set("qkdBobResult", q.bob_result);

        renderQKDWire(q);
        appendQKDLogRow(q);

        const badge = document.getElementById("qkdLogCount");
        if (badge) badge.textContent = `${q.index + 1} qubit${q.index === 0 ? "" : "s"}`;
    }, measureAt);
}

function renderQKDWire(q) {
    const wire = document.getElementById("qkdCircuitWire");
    if (!wire) return;

    const chips = [];
    const aliceGates = q.alice_gates.length ? q.alice_gates : ["I"];
    aliceGates.forEach(g => chips.push(`<div class="circuit-gate-item"><strong>${g}</strong><small>Kumar</small></div>`));

    if (q.eve) {
        chips.push(`<div class="circuit-gate-item qkd-chip-eve"><strong>${q.eve.basis}</strong><small>Eve</small></div>`);
    }

    const bobGates = q.bob_gates.length ? q.bob_gates : ["I"];
    bobGates.forEach(g => chips.push(`<div class="circuit-gate-item"><strong>${g}</strong><small>Tarun</small></div>`));

    chips.push(`<div class="circuit-gate-item qkd-chip-measure"><strong>&#9634;</strong><small>${q.bob_result}</small></div>`);

    wire.innerHTML = chips.join("");
}

function appendQKDLogRow(q) {
    const body = document.getElementById("qkdLogBody");
    if (!body) return;

    const empty = body.querySelector(".table-empty");
    if (empty) empty.parentElement.remove();

    const tr = document.createElement("tr");
    tr.className = q.kept ? "qkd-row-kept" : "qkd-row-lost";
    tr.innerHTML = `
        <td><strong>#${q.index + 1}</strong></td>
        <td class="qkd-mono">${q.alice_bit}</td>
        <td>${q.alice_basis}</td>
        <td class="qkd-mono">${qkdGatesText(q.alice_gates)}</td>
        <td>${q.eve ? q.eve.basis : "&mdash;"}</td>
        <td class="qkd-mono">${q.eve ? q.eve.result : "&mdash;"}</td>
        <td>${q.bob_basis}</td>
        <td class="qkd-mono">${qkdGatesText(q.bob_gates)}</td>
        <td class="qkd-mono">${q.bob_result}</td>
        <td>${q.kept ? "&#10003; keep" : "&#10007; drop"}</td>
    `;
    body.appendChild(tr);
}

function finalizeQKD() {
    if (!qkdTranscript) return;

    const transcript = qkdTranscript;
    const summary = transcript.summary;
    const sample = summary.sample;
    const kept = summary.kept;
    const sent = summary.sent;

    const set = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    // ---- Stage 04: SIFT — animated public basis comparison.
    setQKDStage("sift");

    const siftSummary = document.getElementById("qkdSiftSummary");
    if (siftSummary) {
        siftSummary.textContent = kept
            ? `Bases compared publicly: ${kept} of ${sent} qubits had matching bases and form the sifted key; the rest are discarded.`
            : `No matching bases in this round — sifted key is empty. Run the simulation again.`;
    }

    const siftAnimTime = animateQKDSift(transcript);

    const samplePositions = new Set(sample.positions || []);
    const samplePosToError = new Set();
    (sample.positions || []).forEach((p, i) => {
        if (sample.alice[i] !== sample.bob[i]) samplePosToError.add(p);
    });

    const chip = (bit, isSample, isError) => {
        let cls = "qkd-bit";
        if (isSample) cls += " sample";
        if (isError) cls += " error";
        return `<span class="${cls}">${bit}</span>`;
    };

    // Reveal the sifted key once the comparison has resolved.
    setTimeout(() => {
        if (qkdTranscript !== transcript) return;

        const aliceBits = document.getElementById("qkdAliceKey");
        const bobBits = document.getElementById("qkdBobKey");

        if (aliceBits && bobBits) {
            if (!kept) {
                aliceBits.innerHTML = '<span class="qkd-key-empty">&mdash;</span>';
                bobBits.innerHTML = '<span class="qkd-key-empty">&mdash;</span>';
            } else {
                aliceBits.innerHTML = summary.alice_key.map((bit, i) =>
                    chip(bit, samplePositions.has(i), samplePosToError.has(i))
                ).join("");
                bobBits.innerHTML = summary.bob_key.map((bit, i) =>
                    chip(bit, samplePositions.has(i), samplePosToError.has(i))
                ).join("");
            }
        }

        set("qkdKeyLength", kept);
    }, siftAnimTime);

    // ---- Stage 05: VERIFY — reveal the sample and compute the error rate.
    setTimeout(() => {
        if (qkdTranscript !== transcript) return;

        setQKDStage("verify");

        set("qkdSampleSize", sample.size || 0);
        set("qkdSampleErrors", sample.size ? sample.errors : "—");

        updateQKDInferences(transcript);

        const thresholdPct = Math.round((summary.threshold ?? 0.15) * 100);
        set("qkdThresholdInfo", `Tolerance ≤ ${thresholdPct}%`);

        const rateEl = document.getElementById("qkdErrorRate");
        if (rateEl) {
            rateEl.textContent = sample.error_rate === null
                ? "—"
                : `${(sample.error_rate * 100).toFixed(1)}%`;
        }

        const sampleInfo = document.getElementById("qkdSampleInfo");
        if (sampleInfo) {
            sampleInfo.textContent = sample.size
                ? `${sample.size} of ${kept} sifted bits revealed`
                : "Nothing to reveal";
        }

        // ---- Stage 06: KEY — verdict.
        setTimeout(() => {
            if (qkdTranscript !== transcript) return;

            setQKDStage("key");

            const verdict = document.getElementById("qkdVerdict");
            const verdictTitle = document.getElementById("qkdVerdictTitle");
            const verdictText = document.getElementById("qkdVerdictText");

            if (verdict && verdictTitle && verdictText) {
                verdict.classList.remove("accepted", "rejected");

                if (!kept) {
                    verdictTitle.textContent = "No key this round";
                    verdictText.textContent = "Kumar and Tarun never chose the same basis, so there is nothing to verify. Run the simulation again.";
                } else if (summary.accepted) {
                    verdict.classList.add("accepted");
                    verdictTitle.textContent = "✓ Key accepted";
                    verdictText.textContent =
                        `Sample error rate ${(sample.error_rate * 100).toFixed(1)}% is within the ${thresholdPct}% tolerance — ` +
                        `the channel looks clean. The unrevealed sifted bits become the shared secret key.`;
                } else {
                    verdict.classList.add("rejected");
                    verdictTitle.textContent = "⚠ Eavesdropping detected — key rejected";
                    verdictText.textContent =
                        `Sample error rate ${(sample.error_rate * 100).toFixed(1)}% exceeds the ${thresholdPct}% tolerance. ` +
                        `Eve's random-basis measurements disturbed the qubits, injecting roughly 25% errors. The key is discarded.`;
                }
            }
        }, 1200);
    }, siftAnimTime + 800);
}

/* Animated public basis comparison used during the SIFT stage. */
function animateQKDSift(transcript) {
    const grid = document.getElementById("qkdCompareGrid");
    if (!grid) return 0;

    const qubits = transcript.qubits || [];
    const count = qubits.length;
    if (!count) return 0;

    // Slow, readable pacing regardless of count.
    const step = Math.max(110, Math.min(320, Math.floor(4500 / count)));
    const resolveDelay = Math.max(90, Math.floor(step * 0.55));

    grid.innerHTML = "";

    const makeRow = (label, labelClass) => {
        const row = document.createElement("div");
        row.className = "qkd-compare-row";

        const lab = document.createElement("span");
        lab.className = `qkd-compare-label ${labelClass}`;
        lab.textContent = label;

        const cells = document.createElement("div");
        cells.className = "qkd-compare-cells";

        row.appendChild(lab);
        row.appendChild(cells);
        grid.appendChild(row);
        return cells;
    };

    const idxCells = makeRow("Qubit", "idx");
    const aliceCells = makeRow("Kumar's basis", "alice");
    const bobCells = makeRow("Tarun's basis", "bob");
    const verdictCells = makeRow("Bases match?", "verdict");

    qubits.forEach((q, i) => {
        const idx = document.createElement("span");
        idx.className = "qkd-bcell idx";
        idx.textContent = i + 1;
        idxCells.appendChild(idx);

        const a = document.createElement("span");
        a.className = "qkd-bcell";
        a.textContent = q.alice_basis;
        aliceCells.appendChild(a);

        const b = document.createElement("span");
        b.className = "qkd-bcell";
        b.textContent = q.bob_basis;
        bobCells.appendChild(b);

        const v = document.createElement("span");
        v.className = "qkd-bcell verdict";
        verdictCells.appendChild(v);
    });

    qubits.forEach((q, i) => {
        // Slide a brass "checking" marker over each column...
        setTimeout(() => {
            if (qkdTranscript !== transcript) return;
            [aliceCells, bobCells, verdictCells].forEach(row =>
                row.children[i].classList.add("checking"));
        }, i * step);

        // ...then resolve it as a match (kept) or a mismatch (dropped).
        setTimeout(() => {
            if (qkdTranscript !== transcript) return;

            const aCell = aliceCells.children[i];
            const bCell = bobCells.children[i];
            const vCell = verdictCells.children[i];

            [aCell, bCell, vCell].forEach(cell => cell.classList.remove("checking"));

            if (q.kept) {
                aCell.classList.add("match");
                bCell.classList.add("match");
                vCell.classList.add("match");
                vCell.textContent = "✓";
            } else {
                aCell.classList.add("drop");
                bCell.classList.add("drop");
                vCell.classList.add("drop");
                vCell.textContent = "✗";
            }
        }, i * step + resolveDelay);
    });

    return count * step + 800;
}

/* Rewrite the inference points with the numbers of the run just completed. */
const qkdNoteDefaultTexts = {};

function captureQKDInferences() {
    for (let n = 1; n <= 5; n++) {
        const el = document.getElementById("qkdNote" + n);
        if (el && !qkdNoteDefaultTexts[n]) {
            qkdNoteDefaultTexts[n] = el.textContent.trim().replace(/\s+/g, " ");
        }
    }
}

function resetQKDInferences() {
    captureQKDInferences();
    for (let n = 1; n <= 5; n++) {
        const el = document.getElementById("qkdNote" + n);
        if (el && qkdNoteDefaultTexts[n]) el.textContent = qkdNoteDefaultTexts[n];
    }
}

function updateQKDInferences(transcript) {
    captureQKDInferences();

    const summary = transcript.summary;
    const sample = summary.sample;
    const eve = Boolean(transcript.params?.eve);
    const sent = summary.sent;
    const kept = summary.kept;
    const qber = sample.error_rate === null
        ? null
        : Number((sample.error_rate * 100).toFixed(1));
    const qberText = qber === null ? "—" : `${qber}%`;
    const keptPct = sent ? Math.round((kept / sent) * 100) : 0;
    const thresholdPct = Math.round((summary.threshold ?? 0.15) * 100);

    const setNote = (n, text) => {
        const el = document.getElementById("qkdNote" + n);
        if (el) el.textContent = text;
    };

    if (!kept) {
        setNote(1, "Observed this run: no matching bases at all — Kumar and Tarun never agreed, so there was nothing to verify. This is rare bad luck; rerun the simulation.");
        setNote(2, "With zero sifted bits, no error rate could be measured this round.");
        setNote(3, `Observed this run: 0 of ${sent} qubits kept (0%) — an unlucky draw far from the expected 50%.`);
        setNote(4, `At only ${sent} qubits, empty rounds like this can happen. More qubits smooth the statistics out.`);
        setNote(5, "Verdict this run: no key — the protocol aborts and simply tries again.");
        return;
    }

    if (eve) {
        setNote(1, summary.accepted
            ? `Observed this run: Eve intercepted all ${sent} qubits, but the small sample (${sample.size} bit${sample.size === 1 ? "" : "s"}) showed ${qberText} errors — she slipped through by luck this time.`
            : `Observed this run: Eve intercepted every one of the ${sent} qubits — and the revealed sample exposed her, with a measured error rate of ${qberText}.`);
        setNote(2, `This run she caused ${sample.errors} error(s) in the ${sample.size}-bit sample (${qberText}) — on average she leaves the ≈25% signature: wrong basis half the time, randomizing Tarun half of that (0.5 × 0.5 = 0.25).`);
    } else {
        setNote(1, `Observed this run: with Eve off, Kumar's and Tarun's sifted keys matched bit-for-bit — measured error rate ${qberText}.`);
        setNote(2, "No interception occurred, so nothing disturbed the qubits. Turn Eve on and rerun — her wrong-basis guesses will inject ≈25% errors.");
    }

    setNote(3, `Observed this run: ${kept} of ${sent} qubits had matching bases (${keptPct}%) — close to the 50% expected from two independent random basis choices.`);

    setNote(4, sent >= 16
        ? `At ${sent} qubits, the measured ${qberText} is a statistically clear signal — short 4-qubit runs can still be fooled by luck.`
        : `At only ${sent} qubits, the measured ${qberText} is noisy — rerun, or raise the count to 32 and watch the value settle.`);

    setNote(5, summary.accepted
        ? `Verdict this run: key accepted — ${qberText} sits within the ${thresholdPct}% tolerance, so the unrevealed sifted bits are safe to use.`
        : `Verdict this run: key rejected — ${qberText} exceeds the ${thresholdPct}% tolerance, exactly the fingerprint of an intercept-resend attack.`);
}

function clearQKDDisplays() {
    // Any timeout captured before this point is now stale.
    qkdRunToken += 1;
    qkdFinalized = false;

    const set = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    ["qkdAliceBasis", "qkdAliceBit", "qkdAliceBasisName", "qkdAliceGates", "qkdAliceKet",
     "qkdEveBasis", "qkdEveBasisName", "qkdEveResult", "qkdEveGates", "qkdEveKet",
     "qkdBobBasis", "qkdBobBasisName", "qkdBobGates", "qkdBobKet", "qkdBobResult",
     "qkdSampleSize", "qkdSampleErrors", "qkdErrorRate", "qkdKeyLength"
    ].forEach(id => set(id, "—"));

    const photon = document.getElementById("qkdPhoton");
    if (photon) photon.style.left = "8%";
    set("qkdPhotonKet", "|0⟩");

    set("qkdChannelStatus", "No transmission yet");

    const wire = document.getElementById("qkdCircuitWire");
    if (wire) wire.innerHTML = '<span class="empty-circuit">Step or run the simulation to inspect each qubit.</span>';

    const body = document.getElementById("qkdLogBody");
    if (body) body.innerHTML = '<tr><td colspan="10" class="table-empty">No qubits transmitted yet.</td></tr>';

    const badge = document.getElementById("qkdLogCount");
    if (badge) badge.textContent = "0 qubits";

    const siftSummary = document.getElementById("qkdSiftSummary");
    if (siftSummary) siftSummary.textContent = "Run the simulation to compare bases and build the sifted key.";

    const compareGrid = document.getElementById("qkdCompareGrid");
    if (compareGrid) compareGrid.innerHTML = '<span class="qkd-compare-empty">The basis comparison will appear here after transmission.</span>';

    resetQKDInferences();

    const aliceBits = document.getElementById("qkdAliceKey");
    if (aliceBits) aliceBits.innerHTML = '<span class="qkd-key-empty">&mdash;</span>';
    const bobBits = document.getElementById("qkdBobKey");
    if (bobBits) bobBits.innerHTML = '<span class="qkd-key-empty">&mdash;</span>';

    const verdict = document.getElementById("qkdVerdict");
    if (verdict) verdict.classList.remove("accepted", "rejected");
    set("qkdVerdictTitle", "Awaiting verification");
    set("qkdVerdictText",
        "After sifting, Kumar and Tarun publicly reveal a sample of their key bits. " +
        "A low error rate means the channel was clean; roughly 25% errors is the signature of Eve measuring every qubit in a random basis.");

    set("qkdSampleInfo", "Half of the sifted key");
    set("qkdThresholdInfo", "Tolerance ≤ 15%");

    document.querySelectorAll("#qkdStages .qkd-stage").forEach(stage => {
        stage.classList.remove("active", "done");
    });
}

function resetQKD() {
    stopQKDTimer();
    qkdTranscript = null;
    qkdCursor = 0;
    clearQKDDisplays();
}

