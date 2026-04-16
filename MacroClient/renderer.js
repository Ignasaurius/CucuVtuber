const { ipcRenderer } = require('electron');

let activeUrl = localStorage.getItem('cucu_macro_url') || 'http://localhost:3000';
let activeUserId = localStorage.getItem('cucu_macro_userId') || '';
let activeToken = localStorage.getItem('cucu_macro_token') || '';

let userProfiles = {};
let macroMap = JSON.parse(localStorage.getItem('cucu_macro_map') || '{}');
let lastActiveProfile = null;

let recordingProfileId = null;

// UI Elements
const connectBtn = document.getElementById('connectBtn');
const logoutBtn = document.getElementById('logoutBtn');
const refreshBtn = document.getElementById('refreshBtn');
const setupForm = document.getElementById('setupForm');
const statusBox = document.getElementById('statusBox');
const macrosGrid = document.getElementById('macros');

const urlInput = document.getElementById('serverUrl');
const tokenInput = document.getElementById('apiToken');

// Initiation
if (activeUrl && activeToken) {
    autoLogin();
} else {
    urlInput.value = activeUrl; // Localhost by default
}

function autoLogin() {
    setupForm.style.display = 'none';
    statusBox.style.display = 'block';
    logoutBtn.style.display = 'inline-block';
    refreshBtn.style.display = 'inline-block';
    fetchProfiles();
}

refreshBtn.addEventListener('click', () => {
    fetchProfiles();
});

connectBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    const token = tokenInput.value.trim();
    
    if (!url || !token) {
        alert("Rellena la URL y el Token para conectar.");
        return;
    }
    
    activeUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    activeToken = token;
    
    localStorage.setItem('cucu_macro_url', activeUrl);
    localStorage.setItem('cucu_macro_token', activeToken);
    
    autoLogin();
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('cucu_macro_userId');
    localStorage.removeItem('cucu_macro_token');
    window.location.reload();
});

async function fetchProfiles() {
    statusBox.textContent = "⏳ Autorizando Token...";
    statusBox.className = "status";
    
    try {
        const res = await fetch(`${activeUrl}/api/config/login-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: activeToken })
        });
        
        if (!res.ok) {
            statusBox.textContent = `❌ Token Revocado o Inexistente en esta URL`;
            macrosGrid.innerHTML = '';
            logoutBtn.style.display = 'inline-block';
            refreshBtn.style.display = 'none';
            return;
        }

        const data = await res.json();
        
        // Guardamos internamente el ID del usuario resuelto
        activeUserId = data.userId;
        userProfiles = data.config.profiles;
        lastActiveProfile = data.config.activeProfile;
        
        // Limpiar atajos de perfiles que ya no existen en este servidor/usuario
        let mapChanged = false;
        for (const pId in macroMap) {
            if (!userProfiles[pId]) {
                delete macroMap[pId];
                mapChanged = true;
            }
        }
        if (mapChanged) localStorage.setItem('cucu_macro_map', JSON.stringify(macroMap));

        statusBox.textContent = "✅ Micros Globales Activos. ¡Puedes cerrar esta ventana!";
        statusBox.className = "status connected";
        
        renderMacroList();
        syncElectronShortcuts();
    } catch (err) {
        statusBox.textContent = "🚨 Falla en Servidor: Comprueba que el Node esté corriendo y la URL sea exacta.";
        macrosGrid.innerHTML = '';
        console.error(err);
    }
}

function renderMacroList() {
    macrosGrid.innerHTML = '';
    
    for (const [profId, profData] of Object.entries(userProfiles)) {
        const row = document.createElement('div');
        row.className = 'macro-row';
        
        const isAct = lastActiveProfile === profId;
        const nameDiv = document.createElement('div');
        nameDiv.className = `prof-name ${isAct ? 'active' : ''}`;
        nameDiv.innerHTML = `<span>🎭</span> ${profData.name || profId} ${isAct ? '(En Vivo)' : ''}`;
        
        const bindBtn = document.createElement('div');
        bindBtn.className = 'macro-bind';
        bindBtn.textContent = macroMap[profId] || 'Sin Tecla (Asignar)';
        
        bindBtn.onclick = () => {
            if (recordingProfileId) return; // Ya estamos grabando algo
            bindBtn.textContent = 'Presiona teclas...';
            bindBtn.classList.add('recording');
            recordingProfileId = profId;
        };
        
        row.appendChild(nameDiv);
        row.appendChild(bindBtn);
        macrosGrid.appendChild(row);
    }
}

// Escuchador Global del Teclado para atrapar la Macro
document.addEventListener('keydown', (e) => {
    if (!recordingProfileId) return;
    e.preventDefault();
    
    // Ignorar teclas modificadoras solitarias
    if (['Alt', 'Shift', 'Control', 'Meta', 'AltGraph'].includes(e.key)) return;

    let keys = [];
    if (e.ctrlKey || e.metaKey) keys.push('CommandOrControl');
    if (e.altKey) keys.push('Alt');
    if (e.shiftKey) keys.push('Shift');
    
    let key = e.key;
    if (key.length === 1) key = key.toUpperCase();
    if (key.startsWith('Arrow')) key = key.replace('Arrow', ''); // ArrowUp -> Up
    if (key === ' ') key = 'Space';
    if (e.code.startsWith('Numpad')) key = e.code.replace('Numpad', 'num'); // Numpad1 -> num1

    keys.push(key);
    const accelerator = keys.join('+');
    
    // Guardar memoria
    macroMap[recordingProfileId] = accelerator;
    localStorage.setItem('cucu_macro_map', JSON.stringify(macroMap));
    
    recordingProfileId = null;
    renderMacroList();
    syncElectronShortcuts();
});

// Envia la lista exacta al main.js (Bandeja del sistema)
function syncElectronShortcuts() {
    const list = Object.values(macroMap).filter(v => v);
    ipcRenderer.send('register-macros', list);
}

// Receptor de IPC del main.js (Cuando pulsar un atajo oculto)
ipcRenderer.on('macro-triggered', (event, acceleratorString) => {
    // Buscar qué profileId tiene ese atajo
    let hitProfile = null;
    for (const [pId, acc] of Object.entries(macroMap)) {
        if (acc === acceleratorString) hitProfile = pId;
    }
    if (hitProfile) sendSwapCommand(hitProfile);
});

// Enviar la mutación a la BD usando SOLO token (el server resolverá de quién es)
async function sendSwapCommand(profileId) {
    try {
        const res = await fetch(`${activeUrl}/api/macro/swap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId: profileId, token: activeToken })
        });
        
        const data = await res.json();
        if (res.status === 401) {
            statusBox.className = "status";
            statusBox.textContent = "🚨 ALERTA: Token Rechazado o Inválido. Cerrando sesión...";
            setTimeout(() => logoutBtn.click(), 3000);
            return;
        }
        
        if (!data.success) {
            statusBox.className = "status";
            statusBox.textContent = `⚠️ Error de atajo: ${data.error || 'Desconocido'}`;
            return;
        }

        lastActiveProfile = profileId;
        activeUserId = data.userId; // Sync just in case
        
        statusBox.textContent = "✅ Micros Globales Activos. ¡Puedes cerrar esta ventana!";
        statusBox.className = "status connected";
        
        renderMacroList();
        
    } catch (e) {
        console.error("Fallo enviando comando de Swap", e);
        statusBox.textContent = "🚨 Falla en el Swap: Servidor Node apagado o caído";
        statusBox.className = "status";
    }
}
