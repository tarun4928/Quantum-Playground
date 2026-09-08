/* =====================================================
   QUANTUM PLAYGROUND
   Main JavaScript
===================================================== */


/* =====================================================
   GLOBAL STATE
===================================================== */

let currentState = null;


/* =====================================================
   QUANTUM STATE FORMATTING
===================================================== */

function formatQuantumState(state) {

    if (!state || state.length === 0) {
        return "|0⟩";
    }

    const terms = [];

    state.forEach((amplitude, index) => {

        let real = 0;
        let imag = 0;

        if (typeof amplitude === "object") {
            real = amplitude.real ?? amplitude.re ?? 0;
            imag = amplitude.imag ?? amplitude.im ?? 0;
        }
        else if (typeof amplitude === "number") {
            real = amplitude;
        }

        if (Math.abs(real) < 0.0001) real = 0;
        if (Math.abs(imag) < 0.0001) imag = 0;

        if (real === 0 && imag === 0) {
            return;
        }

        const basis = `|${index}⟩`;

        if (imag === 0) {

            if (real === 1) {
                terms.push(basis);
            }
            else if (real === -1) {
                terms.push(`-${basis}`);
            }
            else {
                terms.push(`${real.toFixed(3)}${basis}`);
            }

        }
        else {

            let value = `${real.toFixed(3)}`;

            if (imag >= 0) {
                value += ` + ${imag.toFixed(3)}i`;
            }
            else {
                value += ` - ${Math.abs(imag).toFixed(3)}i`;
            }

            terms.push(`(${value})${basis}`);
        }
    });

    return terms.join(" + ") || "0";
}


/* =====================================================
   LOAD SINGLE-QUBIT STATE
===================================================== */

async function loadState() {

    try {

        const response = await fetch("/api/state");

        const data = await response.json();

        if (!data.success) {
            console.error(data.error);
            return;
        }

        currentState = data.state;

        updateSingleQubitDisplay(data);

    }
    catch (error) {

        console.error(
            "Could not connect to Quantum Engine.",
            error
        );

    }
}


/* =====================================================
   SINGLE-QUBIT DISPLAY
===================================================== */

function updateSingleQubitDisplay(data) {

    const stateElement =
        document.getElementById("currentState");

    const outputElement =
        document.getElementById("stateOutput");

    const probability0 =
        document.getElementById("prob0");

    const probability1 =
        document.getElementById("prob1");

    const bar0 =
        document.getElementById("bar0");

    const bar1 =
        document.getElementById("bar1");


    if (stateElement) {

        stateElement.textContent =
            formatQuantumState(data.state);

    }


    if (outputElement) {

        outputElement.textContent =
            formatQuantumState(data.state);

    }


    if (data.probabilities) {

        const p0 =
            data.probabilities[0] ?? 0;

        const p1 =
            data.probabilities[1] ?? 0;


        if (probability0) {

            probability0.textContent =
                `${(p0 * 100).toFixed(1)}%`;

        }


        if (probability1) {

            probability1.textContent =
                `${(p1 * 100).toFixed(1)}%`;

        }


        if (bar0) {

            bar0.style.width =
                `${p0 * 100}%`;

        }


        if (bar1) {

            bar1.style.width =
                `${p1 * 100}%`;

        }
    }


    updateBlochSphere(data);

}


/* =====================================================
   APPLY SINGLE-QUBIT GATE
===================================================== */

async function applyGate(gateName) {

    try {

        const response =
            await fetch(
                `/api/gate/${gateName}`,
                {
                    method: "POST"
                }
            );

        const data =
            await response.json();


        if (!data.success) {

            alert(
                "Gate Error: " +
                data.error
            );

            return;
        }


        currentState = data.state;

        updateSingleQubitDisplay(data);

    }
    catch (error) {

        console.error(error);

        alert(
            "Could not connect to Quantum Engine."
        );

    }
}


/* =====================================================
   RESET SINGLE QUBIT
===================================================== */

async function resetState() {

    try {

        const response =
            await fetch(
                "/api/reset",
                {
                    method: "POST"
                }
            );

        const data =
            await response.json();


        if (!data.success) {

            alert(
                "Reset Error: " +
                data.error
            );

            return;
        }


        currentState = data.state;

        updateSingleQubitDisplay(data);

    }
    catch (error) {

        console.error(error);

    }
}


/* =====================================================
   BLOCH SPHERE
===================================================== */

function updateBlochSphere(data) {

    const sphere =
        document.getElementById(
            "blochSphere"
        );

    if (!sphere || !window.Plotly) {
        return;
    }


    let state = data.state;

    if (!state || state.length < 2) {
        return;
    }


    function getComplex(value) {

        if (typeof value === "object") {

            return {
                re: value.real ?? value.re ?? 0,
                im: value.imag ?? value.im ?? 0
            };

        }

        return {
            re: value,
            im: 0
        };
    }


    const alpha =
        getComplex(state[0]);

    const beta =
        getComplex(state[1]);


    /*
       Bloch coordinates

       x = 2 Re(alpha* beta)
       y = 2 Im(alpha* beta)
       z = |alpha|² - |beta|²
    */

    const conjugateAlphaBeta = {

        re:
            alpha.re * beta.re +
            alpha.im * beta.im,

        im:
            alpha.re * beta.im -
            alpha.im * beta.re
    };


    const x =
        2 * conjugateAlphaBeta.re;

    const y =
        2 * conjugateAlphaBeta.im;

    const z =
        alpha.re * alpha.re +
        alpha.im * alpha.im -
        beta.re * beta.re -
        beta.im * beta.im;


    const theta =
        Array.from(
            { length: 50 },
            (_, i) =>
                Math.PI * i / 49
        );

    const phi =
        Array.from(
            { length: 50 },
            (_, i) =>
                2 * Math.PI * i / 49
        );


    const sphereX = [];
    const sphereY = [];
    const sphereZ = [];


    theta.forEach(t => {

        const rowX = [];
        const rowY = [];
        const rowZ = [];


        phi.forEach(p => {

            rowX.push(
                Math.sin(t) * Math.cos(p)
            );

            rowY.push(
                Math.sin(t) * Math.sin(p)
            );

            rowZ.push(
                Math.cos(t)
            );

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

        marker: {

            size: 7

        },

        name: "Quantum State"
    };


    const vector = {

        x: [0, x],
        y: [0, y],
        z: [0, z],

        type: "scatter3d",

        mode: "lines",

        line: {

            width: 6

        },

        name: "State Vector"
    };


    Plotly.react(
        sphere,
        [surface, vector, point],
        {

            margin: {
                l: 0,
                r: 0,
                t: 0,
                b: 0
            },

            paper_bgcolor:
                "rgba(0,0,0,0)",

            plot_bgcolor:
                "rgba(0,0,0,0)",

            scene: {

                xaxis: {
                    title: "X",
                    range: [-1.2, 1.2]
                },

                yaxis: {
                    title: "Y",
                    range: [-1.2, 1.2]
                },

                zaxis: {
                    title: "Z",
                    range: [-1.2, 1.2]
                },

                aspectmode: "cube"
            },

            showlegend: false

        },

        {
            responsive: true
        }
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


/* =====================================================
   MEASUREMENT LAB
===================================================== */

async function runMeasurement() {

    const shotsElement =
        document.getElementById(
            "shots"
        );


    if (!shotsElement) {
        return;
    }


    const shots =
        parseInt(
            shotsElement.value
        );


    if (
        isNaN(shots) ||
        shots < 1
    ) {

        alert(
            "Enter a valid number of shots."
        );

        return;
    }


    try {

        const response =
            await fetch(
                "/api/measurement",
                {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            shots: shots
                        })

                }
            );


        const data =
            await response.json();


        if (!data.success) {

            alert(
                "Measurement Error: " +
                data.error
            );

            return;
        }


        const count0 =
            data.counts["0"] || 0;

        const count1 =
            data.counts["1"] || 0;


        displayMeasurement(
            count0,
            count1
        );

    }
    catch (error) {

        console.error(error);

    }

}


/* -----------------------------------------------------
   DISPLAY MEASUREMENT
----------------------------------------------------- */

function displayMeasurement(
    count0,
    count1
) {

    const result0 =
        document.getElementById(
            "measurement0"
        );

    const result1 =
        document.getElementById(
            "measurement1"
        );


    const value0 =
        document.getElementById(
            "histValue0"
        );

    const value1 =
        document.getElementById(
            "histValue1"
        );


    const bar0 =
        document.getElementById(
            "hist0"
        );

    const bar1 =
        document.getElementById(
            "hist1"
        );


    if (result0)
        result0.textContent =
            count0;


    if (result1)
        result1.textContent =
            count1;


    if (value0)
        value0.textContent =
            count0;


    if (value1)
        value1.textContent =
            count1;


    const total =
        count0 + count1;


    if (total === 0) {
        return;
    }


    if (bar0) {

        bar0.style.height =
            `${Math.max(
                10,
                count0 / total * 100
            )}%`;

    }


    if (bar1) {

        bar1.style.height =
            `${Math.max(
                10,
                count1 / total * 100
            )}%`;

    }

}


/* =====================================================
   ENTANGLEMENT LAB
===================================================== */

async function createBellState() {

    const status =
        document.getElementById(
            "entanglementStatus"
        );


    try {

        const response =
            await fetch(
                "/api/entanglement",
                {
                    method: "POST"
                }
            );


        const data =
            await response.json();


        if (!data.success) {

            alert(
                "Entanglement Error: " +
                data.error
            );

            return;
        }


        const amp00 =
            document.getElementById(
                "amp00"
            );

        const amp11 =
            document.getElementById(
                "amp11"
            );


        if (amp00) {

            amp00.textContent =
                "0.707";

        }


        if (amp11) {

            amp11.textContent =
                "0.707";

        }


        if (status) {

            status.innerHTML = `

                <span>✓</span>

                <strong>
                    Bell State Created
                </strong>

                <p>
                    The two qubits are
                    entangled in the Bell state
                    (|00⟩ + |11⟩)/√2.
                </p>

            `;

        }

    }
    catch (error) {

        console.error(error);

        alert(
            "Could not connect to Quantum Engine."
        );

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

    }
);