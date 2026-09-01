let circuit = [];


/* =====================================================
   INITIALIZATION
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        loadCurrentState();

        initializeBlochSphere();

    }
);


/* =====================================================
   LOAD CURRENT STATE
===================================================== */

async function loadCurrentState() {

    try {

        const response =
            await fetch("/api/state");


        const data =
            await response.json();


        if (!data.success) {
            return;
        }


        updateQubitDisplay(data);

    }

    catch (error) {

        console.error(
            "State loading error:",
            error
        );

    }

}


/* =====================================================
   SINGLE QUBIT GATES
===================================================== */

async function applyGate(gate) {

    try {

        const response =
            await fetch(
                `/api/gate/${gate}`,
                {
                    method: "POST"
                }
            );


        const data =
            await response.json();


        if (!data.success) {

            alert(
                "Quantum Engine Error: " +
                data.error
            );

            return;

        }


        updateQubitDisplay({

            state:
                data.after_state,

            after_state:
                data.after_state,

            probabilities:
                data.probabilities,

            bloch_coordinates:
                data.bloch_coordinates,

            success: true

        });


    }

    catch (error) {

        console.error(error);

        alert(
            "Could not connect to Quantum Engine."
        );

    }

}


/* =====================================================
   UPDATE QUBIT DISPLAY
===================================================== */

function updateQubitDisplay(data) {

    const state =
        data.after_state ||
        data.state;


    const stateDisplay =
        document.getElementById(
            "stateDisplay"
        );


    if (stateDisplay && state) {

        stateDisplay.textContent =
            formatQuantumState(state);

    }


    if (data.probabilities) {

        updateProbabilities(
            data.probabilities[0] * 100,
            data.probabilities[1] * 100
        );

    }


    if (data.bloch_coordinates) {

        updateCoordinates(
            data.bloch_coordinates
        );

        updateBlochPoint(
            data.bloch_coordinates
        );

    }

}


/* =====================================================
   FORMAT QUANTUM STATE
===================================================== */

function formatQuantumState(state) {

    if (!state) {
        return "|0⟩";
    }


    const terms = [];


    for (const basis in state) {

        const item =
            state[basis];


        const real =
            item.real;


        const imaginary =
            item.imaginary;


        if (
            Math.abs(real) < 0.0001 &&
            Math.abs(imaginary) < 0.0001
        ) {

            continue;

        }


        const magnitude =
            Math.sqrt(
                real * real +
                imaginary * imaginary
            );


        if (
            Math.abs(real - 1) < 0.0001 &&
            Math.abs(imaginary) < 0.0001
        ) {

            terms.push(
                `|${basis}⟩`
            );

        }

        else if (
            Math.abs(real + 1) < 0.0001 &&
            Math.abs(imaginary) < 0.0001
        ) {

            terms.push(
                `-|${basis}⟩`
            );

        }

        else {

            terms.push(
                `${magnitude.toFixed(3)}|${basis}⟩`
            );

        }

    }


    return terms.join(" + ")
        || "|0⟩";

}


/* =====================================================
   PROBABILITIES
===================================================== */

function updateProbabilities(
    probability0,
    probability1
) {

    const prob0 =
        document.getElementById(
            "prob0"
        );

    const prob1 =
        document.getElementById(
            "prob1"
        );

    const bar0 =
        document.getElementById(
            "bar0"
        );

    const bar1 =
        document.getElementById(
            "bar1"
        );


    if (prob0) {

        prob0.textContent =
            `${probability0.toFixed(1)}%`;

    }


    if (prob1) {

        prob1.textContent =
            `${probability1.toFixed(1)}%`;

    }


    if (bar0) {

        bar0.style.width =
            `${probability0}%`;

    }


    if (bar1) {

        bar1.style.width =
            `${probability1}%`;

    }

}


/* =====================================================
   BLOCH COORDINATES
===================================================== */

function updateCoordinates(coords) {

    const x =
        document.getElementById(
            "coordX"
        );

    const y =
        document.getElementById(
            "coordY"
        );

    const z =
        document.getElementById(
            "coordZ"
        );


    if (x) {

        x.textContent =
            coords.x.toFixed(2);

    }


    if (y) {

        y.textContent =
            coords.y.toFixed(2);

    }


    if (z) {

        z.textContent =
            coords.z.toFixed(2);

    }

}


/* =====================================================
   3D BLOCH SPHERE
===================================================== */

let blochInitialized = false;


function initializeBlochSphere() {

    const container =
        document.getElementById(
            "blochSphere"
        );


    if (!container) {
        return;
    }


    if (
        typeof Plotly ===
        "undefined"
    ) {

        console.error(
            "Plotly could not be loaded."
        );

        return;

    }


    /*
    Create sphere coordinates.
    */

    const u = [];

    const v = [];

    const sphereX = [];

    const sphereY = [];

    const sphereZ = [];


    const segments = 30;


    for (
        let i = 0;
        i <= segments;
        i++
    ) {

        const phi =
            Math.PI * i / segments;


        const rowX = [];

        const rowY = [];

        const rowZ = [];


        for (
            let j = 0;
            j <= segments;
            j++
        ) {

            const theta =
                2 * Math.PI *
                j / segments;


            rowX.push(
                Math.sin(phi) *
                Math.cos(theta)
            );


            rowY.push(
                Math.sin(phi) *
                Math.sin(theta)
            );


            rowZ.push(
                Math.cos(phi)
            );

        }


        sphereX.push(rowX);

        sphereY.push(rowY);

        sphereZ.push(rowZ);

    }


    const sphere = {

        type: "surface",

        x: sphereX,

        y: sphereY,

        z: sphereZ,

        opacity: 0.18,

        showscale: false,

        hoverinfo: "skip"

    };


    /*
    Equator
    */

    const equatorX = [];

    const equatorY = [];

    const equatorZ = [];


    for (
        let i = 0;
        i <= 100;
        i++
    ) {

        const angle =
            2 * Math.PI *
            i / 100;


        equatorX.push(
            Math.cos(angle)
        );

        equatorY.push(
            Math.sin(angle)
        );

        equatorZ.push(0);

    }


    const equator = {

        type: "scatter3d",

        mode: "lines",

        x: equatorX,

        y: equatorY,

        z: equatorZ,

        line: {
            width: 2
        },

        hoverinfo: "skip"

    };


    /*
    X axis
    */

    const xAxis = {

        type: "scatter3d",

        mode: "lines",

        x: [-1, 1],

        y: [0, 0],

        z: [0, 0],

        line: {
            width: 2
        },

        hoverinfo: "skip"

    };


    /*
    Y axis
    */

    const yAxis = {

        type: "scatter3d",

        mode: "lines",

        x: [0, 0],

        y: [-1, 1],

        z: [0, 0],

        line: {
            width: 2
        },

        hoverinfo: "skip"

    };


    /*
    Z axis
    */

    const zAxis = {

        type: "scatter3d",

        mode: "lines",

        x: [0, 0],

        y: [0, 0],

        z: [-1, 1],

        line: {
            width: 3
        },

        hoverinfo: "skip"

    };


    /*
    Qubit state vector.
    */

    const stateVector = {

        type: "scatter3d",

        mode: "lines+markers",

        x: [0, 0],

        y: [0, 0],

        z: [0, 1],

        line: {
            width: 6
        },

        marker: {
            size: 8
        },

        name: "Qubit State"

    };


    const layout = {

        margin: {
            l: 0,
            r: 0,
            b: 0,
            t: 0
        },

        paper_bgcolor:
            "rgba(0,0,0,0)",

        plot_bgcolor:
            "rgba(0,0,0,0)",

        showlegend: false,

        scene: {

            xaxis: {
                range: [-1.2, 1.2],
                visible: false
            },

            yaxis: {
                range: [-1.2, 1.2],
                visible: false
            },

            zaxis: {
                range: [-1.2, 1.2],
                visible: false
            },

            aspectmode: "cube",

            camera: {

                eye: {
                    x: 1.5,
                    y: 1.5,
                    z: 1.2
                }

            }

        }

    };


    Plotly.newPlot(

        "blochSphere",

        [
            sphere,
            equator,
            xAxis,
            yAxis,
            zAxis,
            stateVector
        ],

        layout,

        {
            responsive: true,
            displayModeBar: false
        }

    );


    blochInitialized = true;

}


/* =====================================================
   UPDATE BLOCH POINT
===================================================== */

function updateBlochPoint(coords) {

    if (!blochInitialized) {

        initializeBlochSphere();

    }


    const container =
        document.getElementById(
            "blochSphere"
        );


    if (!container) {
        return;
    }


    if (
        typeof Plotly ===
        "undefined"
    ) {

        return;

    }


    Plotly.restyle(

        "blochSphere",

        {

            x: [[
                0,
                coords.x
            ]],

            y: [[
                0,
                coords.y
            ]],

            z: [[
                0,
                coords.z
            ]]

        },

        [5]

    );

}


/* =====================================================
   RESET
===================================================== */

async function resetQubit() {

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

            return;

        }


        updateQubitDisplay(data);

    }

    catch (error) {

        console.error(error);

    }

}


/* =====================================================
   CIRCUIT LAB
===================================================== */

function addCircuitGate(gate) {

    circuit.push(gate);

    renderCircuit();

}


function renderCircuit() {

    const container =
        document.getElementById(
            "circuitGates"
        );


    if (!container) {
        return;
    }


    if (circuit.length === 0) {

        container.innerHTML = `
            <span class="empty-circuit">
                Add quantum gates above
            </span>
        `;

        return;

    }


    container.innerHTML = "";


    circuit.forEach(
        (gate, index) => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "circuit-gate";


            element.textContent =
                gate;


            element.title =
                "Click × to remove this gate";


            /*
            Remove button
            */

            const remove =
                document.createElement(
                    "button"
                );


            remove.className =
                "gate-remove";


            remove.textContent =
                "×";


            remove.onclick =
                function(event) {

                    event.stopPropagation();

                    removeCircuitGate(
                        index
                    );

                };


            element.appendChild(
                remove
            );


            container.appendChild(
                element
            );

        }
    );

}


function removeCircuitGate(index) {

    circuit.splice(
        index,
        1
    );

    renderCircuit();

}


function clearCircuit() {

    circuit = [];

    renderCircuit();


    /*
    Reset output
    */

    const output =
        document.getElementById(
            "circuitOutput"
        );


    if (output) {

        output.textContent =
            "|0⟩";

    }


    /*
    Reset probabilities
    */

    const p0 =
        document.getElementById(
            "circuitProb0"
        );

    const p1 =
        document.getElementById(
            "circuitProb1"
        );


    if (p0)
        p0.textContent =
            "100%";


    if (p1)
        p1.textContent =
            "0%";


    /*
    Reset bars
    */

    const bar0 =
        document.getElementById(
            "circuitBar0"
        );

    const bar1 =
        document.getElementById(
            "circuitBar1"
        );


    if (bar0)
        bar0.style.width =
            "100%";


    if (bar1)
        bar1.style.width =
            "0%";


    /*
    Reset execution steps
    */

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

                            gates:
                                circuit

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


        /*
        FINAL STATE
        */

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


        /*
        PROBABILITIES
        */

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


        /*
        PROBABILITY BARS
        */

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


        /*
        EXECUTION STEPS
        */

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


    if (!steps ||
        steps.length === 0) {

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


            /*
            Step number
            */

            const number =
                document.createElement(
                    "div"
                );


            number.className =
                "step-number";


            number.textContent =
                `STEP ${index + 1}`;


            /*
            Gate
            */

            const gate =
                document.createElement(
                    "div"
                );


            gate.className =
                "step-gate";


            gate.textContent =
                step.gate;


            /*
            State
            */

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


            row.appendChild(
                number
            );


            row.appendChild(
                gate
            );


            row.appendChild(
                state
            );


            container.appendChild(
                row
            );

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

                    body: JSON.stringify({
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
   ENTANGLEMENT
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