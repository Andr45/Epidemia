// Lógica del Simulador de Propagación de Virus Informático (Modelo SIR)
// Implementa solucionador RK4, animación de propagación en red y narrativa histórica.

let chartInstance = null;
let networkNodesCount = 100;
let simulationDays = 30;
let dtSIR = 0.1; // Paso fino para RK4

// Base de datos de virus y sus hitos históricos
const virusPresets = {
    wannacry: {
        name: "WannaCry (2017)",
        desc: "Ransomware autopropagado de impacto global. Utilizó el exploit 'EternalBlue' filtrado de la NSA para infectar computadoras Windows sin parchear a través de puertos de red abiertos (SMB), infectando más de 200,000 sistemas en 150 países.",
        beta: 0.006,
        gamma: 0.09,
        milestones: {
            0: "Día 0: El ransomware WannaCry es liberado. Explota puertos SMB abiertos usando EternalBlue. Rápido incremento de contagios en Europa y Asia.",
            3: "Día 3: Pico de la epidemia. Hospitales del NHS en el Reino Unido, Telefónica en España y sistemas ferroviarios de Alemania quedan paralizados.",
            7: "Día 7: El analista Marcus Hutchins descubre y activa el 'Kill Switch' (un dominio no registrado en el código). La tasa de nuevos contagios se frena.",
            15: "Día 15: Microsoft lanza parches de emergencia incluso para sistemas obsoletos (XP). El número de equipos recuperados (R) supera a los infectados.",
            30: "Día 30: Estabilización global. La mayoría de redes vulnerables han sido aisladas o parcheadas. Fin del brote masivo."
        }
    },
    melissa: {
        name: "Melissa (1999)",
        desc: "Uno de los primeros macrovirus de correo masivo. Se propagaba enviando un documento Word malicioso ('list.doc') a los primeros 50 contactos de la libreta de direcciones de Microsoft Outlook del usuario infectado.",
        beta: 0.004,
        gamma: 0.16,
        milestones: {
            0: "Día 0: El virus es subido a un foro Usenet disfrazado de contraseñas para sitios de adultos. Los usuarios abren el adjunto e inician la propagación.",
            2: "Día 2: Inundación masiva de servidores de correo corporativos. Microsoft, Intel y Lockheed Martin apagan sus servidores de email debido al tráfico.",
            5: "Día 5: Detención del autor David L. Smith por el FBI. La concientización pública frena la apertura de correos sospechosos.",
            10: "Día 10: Proveedores de correo y antivirus despliegan reglas de filtrado de firmas. Comienza la desinfección masiva.",
            30: "Día 30: Melissa es erradicado casi por completo de redes comerciales. Deja precedentes clave de seguridad en emails."
        }
    },
    iloveyou: {
        name: "ILOVEYOU (2000)",
        desc: "Gusano escrito en VBScript que se propagaba vía email con el asunto 'ILOVEYOU' y un archivo adjunto 'LOVE-LETTER-FOR-YOU.TXT.vbs'. Al abrirse, sobrescribía archivos multimedia y se reenviaba a todos los contactos.",
        beta: 0.005,
        gamma: 0.11,
        milestones: {
            0: "Día 0: Comienza la propagación desde Manila, Filipinas. Atractivo de ingeniería social causa una tasa de apertura masiva.",
            2: "Día 2: Infección en el Pentágono, el Parlamento Británico y la CIA. Millones de archivos JPEG, MP3 y scripts son destruidos en discos locales.",
            6: "Día 6: Se difunden instrucciones globales para eliminar el script y no abrir el adjunto. Los administradores bloquean correos con esa cabecera.",
            12: "Día 12: Despliegue de parches de seguridad y herramientas automáticas de limpieza. Crecimiento de recuperados (R).",
            30: "Día 30: Mitigación de daños. Pérdidas estimadas en $10 mil millones de dólares. Cambios permanentes en la gestión de adjuntos ejecutables."
        }
    }
};

let simulationData = {
    days: [],
    S: [],
    I: [],
    R: []
};

// Estructura de Nodos para representación espacial estable
let nodesArray = [];
let nodeInfectOrder = []; // Orden de infección ordenado espacialmente

// Control de Animación
let animationInterval = null;
let currentDay = 0;
let isPlaying = false;


// 2. Cargar parámetros del virus seleccionado
function loadVirusPreset() {
    const selected = document.getElementById("virus-preset").value;
    const preset = virusPresets[selected];
    
    if (preset) {
        document.getElementById("virus-desc-text").textContent = preset.desc;
        document.getElementById("param-beta").value = preset.beta;
        document.getElementById("param-gamma").value = preset.gamma;
        
        // Sincronizar displays
        document.getElementById("val-beta").textContent = preset.beta.toFixed(4);
        document.getElementById("val-gamma").textContent = preset.gamma.toFixed(3);
        
        updateSimulation();
    }
}

// 3. Inicializar Red de Nodos Espacialmente Ordenados (Onda de propagación)
function initializeNetwork() {
    const gridContainer = document.getElementById("network-grid-element");
    gridContainer.innerHTML = "";
    nodesArray = [];
    
    const rows = 10;
    const cols = Math.ceil(networkNodesCount / rows);
    
    // Crear nodos y asignarles una posición en la cuadrícula
    let index = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (index >= networkNodesCount) break;
            
            const nodeEl = document.createElement("div");
            nodeEl.className = "net-node node-s";
            nodeEl.id = `node-${index}`;
            gridContainer.appendChild(nodeEl);
            
            nodesArray.push({
                index: index,
                r: r,
                c: c,
                el: nodeEl
            });
            index++;
        }
    }
    
    // Calcular distancia de cada nodo al centro de la cuadrícula
    const centerR = (rows - 1) / 2;
    const centerC = (cols - 1) / 2;
    
    nodesArray.forEach(node => {
        node.distToCenter = Math.sqrt(Math.pow(node.r - centerR, 2) + Math.pow(node.c - centerC, 2));
    });
    
    // Generar el orden de infección ordenando los nodos por distancia al centro (onda circular)
    const sortedNodes = [...nodesArray].sort((a, b) => a.distToCenter - b.distToCenter);
    nodeInfectOrder = sortedNodes.map(n => n.index);
}

// 4. Cambiar Tamaño de Red
function changeNetworkSize() {
    const count = parseInt(document.getElementById("param-nodes").value);
    document.getElementById("val-nodes").textContent = count;
    networkNodesCount = count;
    
    initializeNetwork();
    updateSimulation();
}

// 5. Solucionador de EDO SIR mediante RK4
function solveSIR(beta, gamma, N) {
    const days = [];
    const S_vals = [];
    const I_vals = [];
    const R_vals = [];
    
    // Condiciones iniciales
    let t = 0;
    let S = N - 1;
    let I = 1;
    let R = 0;
    
    // Funciones diferenciales
    // dS/dt = -beta * S * I
    // dI/dt = beta * S * I - gamma * I
    // dR/dt = gamma * I
    const dS = (valS, valI) => -beta * valS * valI;
    const dI = (valS, valI) => beta * valS * valI - gamma * valI;
    const dR = (valI) => gamma * valI;
    
    // Resolveremos con un dt fino (0.1 días) para precisión de RK4
    const stepsPerDay = Math.round(1 / dtSIR);
    
    for (let day = 0; day <= simulationDays; day++) {
        days.push(day);
        S_vals.push(Math.round(S));
        I_vals.push(Math.round(I));
        R_vals.push(Math.round(R));
        
        // Simular un día completo realizando pasos finos de RK4
        for (let step = 0; step < stepsPerDay; step++) {
            // RK4 para S
            let ks1 = dS(S, I);
            let ki1 = dI(S, I);
            
            let ks2 = dS(S + 0.5 * ks1 * dtSIR, I + 0.5 * ki1 * dtSIR);
            let ki2 = dI(S + 0.5 * ks1 * dtSIR, I + 0.5 * ki1 * dtSIR);
            
            let ks3 = dS(S + 0.5 * ks2 * dtSIR, I + 0.5 * ki2 * dtSIR);
            let ki3 = dI(S + 0.5 * ks2 * dtSIR, I + 0.5 * ki2 * dtSIR);
            
            let ks4 = dS(S + ks3 * dtSIR, I + ki3 * dtSIR);
            let ki4 = dI(S + ks3 * dtSIR, I + ki3 * dtSIR);
            
            let nextS = S + (dtSIR / 6) * (ks1 + 2 * ks2 + 2 * ks3 + ks4);
            let nextI = I + (dtSIR / 6) * (ki1 + 2 * ki2 + 2 * ki3 + ki4);
            
            // Garantizar la conservación y evitar negativos
            if (nextS < 0) nextS = 0;
            if (nextI < 0) nextI = 0;
            
            let nextR = N - nextS - nextI;
            if (nextR < 0) nextR = 0;
            
            S = nextS;
            I = nextI;
            R = nextR;
        }
    }
    
    return { days, S: S_vals, I: I_vals, R: R_vals };
}

// 6. Actualizar Simulación y Gráfico
function updateSimulation() {
    const beta = parseFloat(document.getElementById("param-beta").value);
    const gamma = parseFloat(document.getElementById("param-gamma").value);
    
    document.getElementById("val-beta").textContent = beta.toFixed(4);
    document.getElementById("val-gamma").textContent = gamma.toFixed(3);
    
    // Resolver el modelo SIR
    simulationData = solveSIR(beta, gamma, networkNodesCount);
    
    resetAnimation();
    renderChart();
}

// 7. Renderizar Gráfico SIR con Chart.js
function renderChart() {
    const ctx = document.getElementById('sirChart').getContext('2d');
    
    const datasets = [
        {
            label: 'Susceptibles (S)',
            data: simulationData.S,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            borderWidth: 2,
            tension: 0.15,
            fill: true
        },
        {
            label: 'Infectados (I)',
            data: simulationData.I,
            borderColor: '#f43f5e',
            backgroundColor: 'rgba(244, 63, 94, 0.05)',
            borderWidth: 2,
            tension: 0.15,
            fill: true
        },
        {
            label: 'Recuperados (R)',
            data: simulationData.R,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.05)',
            borderWidth: 2,
            tension: 0.15,
            fill: true
        }
    ];
    
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: simulationData.days,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Tiempo (Días)', color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#94a3b8' }
                },
                y: {
                    title: { display: true, text: 'Computadoras', color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#94a3b8' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#f8fafc', font: { family: 'Inter' } }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });
}

// 8. Sincronizar Nodos de Red y Storytelling
function scrubTime(dayVal) {
    currentDay = parseInt(dayVal);
    document.getElementById("animation-scrubber").value = currentDay;
    document.getElementById("scrubber-current-time").textContent = `Día Seleccionado: ${currentDay}`;
    document.getElementById("narrative-day-label").textContent = `Día ${currentDay}`;
    
    // Obtener valores numéricos del día
    const S = simulationData.S[currentDay];
    const I = simulationData.I[currentDay];
    const R = simulationData.R[currentDay];
    
    // Actualizar tarjetas de estadísticas
    document.getElementById("stat-s").textContent = S;
    document.getElementById("stat-i").textContent = I;
    document.getElementById("stat-r").textContent = R;
    
    // Sincronizar estados visuales de los nodos de red de forma estable
    // Utilizaremos la distribución de la onda: infectamos del centro hacia afuera
    // Ever-infected = I + R. Esos son los primeros infectados del listado.
    // De esos ever-infected, los primeros R son Recuperados/Parcheados (se infectaron antes y ya sanaron),
    // y los siguientes I son Infectados Activos. Los demás son Susceptibles.
    const everInfectedCount = I + R;
    
    for (let index = 0; index < networkNodesCount; index++) {
        const nodeIndex = nodeInfectOrder[index];
        const nodeEl = document.getElementById(`node-${nodeIndex}`);
        
        if (nodeEl) {
            nodeEl.className = "net-node"; // reset classes
            
            if (index < R) {
                nodeEl.classList.add("node-r");
            } else if (index < everInfectedCount) {
                nodeEl.classList.add("node-i");
            } else {
                nodeEl.classList.add("node-s");
            }
        }
    }
    
    // Actualizar Cronología Narrativa (Storytelling)
    const selectedVirus = document.getElementById("virus-preset").value;
    const milestones = virusPresets[selectedVirus].milestones;
    
    // Buscar el hito más cercano (menor o igual al día actual)
    let activeMilestone = "";
    let closestDay = -1;
    
    Object.keys(milestones).forEach(key => {
        const milestoneDay = parseInt(key);
        if (milestoneDay <= currentDay && milestoneDay > closestDay) {
            closestDay = milestoneDay;
            activeMilestone = milestones[key];
        }
    });
    
    document.getElementById("narrative-day-desc").textContent = activeMilestone;
    
    // Actualizar badge de estado del virus
    const badge = document.getElementById("virus-status-badge");
    if (badge) {
        if (I > 0) {
            badge.innerHTML = 'Brote Activo 🔥';
            badge.style.background = '#ffe4e6';
            badge.style.color = '#e11d48';
        } else if (R > 0) {
            badge.innerHTML = 'Brote Controlado ✅';
            badge.style.background = '#e6f7f0';
            badge.style.color = '#059669';
        } else {
            badge.innerHTML = 'Red Limpia 🛡️';
            badge.style.background = '#ebf8ff';
            badge.style.color = '#3182ce';
        }
    }
    
    // Resaltar en gráfico
    if (chartInstance) {
        chartInstance.setActiveElements([{
            datasetIndex: 1, // Enfocado en infectados
            index: currentDay
        }]);
        chartInstance.tooltip.setActiveElements([{
            datasetIndex: 1,
            index: currentDay
        }], {x: 0, y: 0});
        chartInstance.update();
    }
}

let animationSpeed = 1;

function setSpeed(multiplier) {
    animationSpeed = multiplier;
    document.querySelectorAll('.speed-btn').forEach(btn => btn.classList.remove('active'));
    
    const speedBtn = document.getElementById(`speed-${multiplier}x`);
    if (speedBtn) {
        speedBtn.classList.add('active');
    }
    
    if (isPlaying) {
        clearInterval(animationInterval);
        startPlayInterval();
    }
}

function startPlayInterval() {
    animationInterval = setInterval(() => {
        currentDay += 1;
        if (currentDay > 30) {
            currentDay = 30;
            clearInterval(animationInterval);
            document.getElementById("btn-play").innerHTML = '<i class="fa-solid fa-play"></i> <span id="play-text">Iniciar Tiempo</span>';
            isPlaying = false;
        }
        scrubTime(currentDay);
    }, 300 / animationSpeed); // Velocidad ajustable
}

// 9. Animación y Reproducción
function togglePlay() {
    const playBtn = document.getElementById("btn-play");
    
    if (isPlaying) {
        clearInterval(animationInterval);
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i> <span id="play-text">Iniciar Tiempo</span>';
        isPlaying = false;
    } else {
        if (currentDay >= 30) {
            currentDay = 0;
        }
        playBtn.innerHTML = '<i class="fa-solid fa-pause"></i> <span id="play-text">Pausar Tiempo</span>';
        isPlaying = true;
        startPlayInterval();
    }
}

function resetAnimation() {
    clearInterval(animationInterval);
    currentDay = 0;
    isPlaying = false;
    document.getElementById("btn-play").innerHTML = '<i class="fa-solid fa-play"></i> <span id="play-text">Iniciar Tiempo</span>';
    scrubTime(0);
}

// 10. Inicialización al cargar la página
window.onload = function() {
    initializeNetwork();
    loadVirusPreset();
};
