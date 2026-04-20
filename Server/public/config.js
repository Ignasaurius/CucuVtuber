const userSelect = document.getElementById('userSelect');
const userIdInput = document.getElementById('userId');
const form = document.getElementById('configForm');
const socket = io();

// ====== GESTIÓN DE DISCORD BOT DINÁMICO ======
const botStatusText = document.getElementById('botStatusText');
const botLoginOverlay = document.getElementById('botLoginOverlay');
const mainContainer = document.getElementById('mainContainer');
const botTagDisplay = document.getElementById('botTagDisplay');
const botFixedStatus = document.getElementById('botFixedStatus');

async function fetchBotStatus() {
    try {
        const res = await fetch('/api/bot/status');
        const data = await res.json();
        updateBotUI(data.status, data.botTag);
    } catch(e) {}
}

function updateBotUI(status, tag) {
    if (status === 'online') {
        botStatusText.innerHTML = 'Online 🟢';
        botStatusText.style.color = '#43b581';
        botLoginOverlay.style.display = 'none';
        mainContainer.style.display = 'block';
        botFixedStatus.style.display = 'flex';
        botTagDisplay.textContent = tag || '';
    } else if (status === 'connecting') {
        botLoginOverlay.style.display = 'flex';
        mainContainer.style.display = 'none';
        botFixedStatus.style.display = 'none';
        document.getElementById('discordLoginBtn').textContent = 'Conectando...';
    } else {
        botLoginOverlay.style.display = 'flex';
        mainContainer.style.display = 'none';
        botFixedStatus.style.display = 'none';
        document.getElementById('discordLoginBtn').textContent = 'Conectar e Iniciar Motor 🟢';
    }
}

document.getElementById('discordLoginBtn').addEventListener('click', async () => {
    const btn = document.getElementById('discordLoginBtn');
    const token = document.getElementById('discordTokenInput').value.trim();
    if (!token) return alert('Debes insertar el Token de Discord Application');
    
    btn.disabled = true;
    btn.textContent = 'Conectando...';
    try {
        const res = await fetch('/api/bot/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({token})
        });
        const data = await res.json();
        if(!res.ok) alert("Error de Discord: " + data.error);
        else document.getElementById('discordTokenInput').value = '';
        fetchBotStatus();
    } finally {
        btn.disabled = false;
        btn.textContent = 'Conectar Bot a Discord';
    }
});

document.getElementById('discordLogoutBtn').addEventListener('click', async () => {
    if(!confirm('¿Seguro que quieres desconectar el Bot de Discord?\nEsto detendrá la comunicación de las salas de voz inmediatamente.')) return;
    await fetch('/api/bot/logout', {method:'POST'});
    fetchBotStatus();
});

const discordReloadBtn = document.getElementById('discordReloadBtn');
if (discordReloadBtn) {
    discordReloadBtn.addEventListener('click', async () => {
        discordReloadBtn.disabled = true;
        discordReloadBtn.textContent = 'Recargando...';
        try {
            await fetch('/api/bot/reload', { method: 'POST' });
        } catch(e) {
            console.error(e);
        }
        setTimeout(() => {
            discordReloadBtn.disabled = false;
            discordReloadBtn.textContent = 'Recargar Bot';
        }, 2000);
    });
}

socket.on('bot_status_change', (data) => updateBotUI(data.status, data.botTag));
fetchBotStatus();
// =============================================

let userConfigs = {};
let pendingDeletions = [];
let currentProfileId = 'default';

// Load Active Users
async function fetchUsers() {
    try {
        const res = await fetch('/api/voice-users');
        const users = await res.json();
        
        const prevVal = userSelect.value;
        userSelect.innerHTML = '<option value="">-- Selecciona un usuario --</option>';
        users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `${u.username} ${u.deaf ? '(Cascos apagados)' : (u.mute ? '(Mic apagado)' : '(Activo)')}`;
            userSelect.appendChild(opt);
        });
        if (users.find(u => u.id === prevVal)) {
            userSelect.value = prevVal;
        }

        if (typeof populatePermSelect === 'function') populatePermSelect(users);

    } catch (e) {
        if(userSelect.options.length <= 1 && document.getElementById('botStatusText').textContent.includes('Online')) {
            userSelect.innerHTML = '<option value="">Nadie conectado...</option>';
        }
    }
}
fetchUsers();
setInterval(fetchUsers, 5000); // refresh every 5s

// Load Configs
async function fetchConfig() {
    try {
        const res = await fetch('/api/config');
        if (res.ok) {
            userConfigs = await res.json();
        }
    } catch(e) {}
}
fetchConfig();

// --- PERMISOS DE COMANDOS ---
const permUsersSelect = document.getElementById('permUsersSelect');
const permUserIdInput = document.getElementById('permUserIdInput');
const addPermBtn = document.getElementById('addPermBtn');
const permList = document.getElementById('permList');

let allowedUsersCache = [];

async function fetchPermissions() {
    try {
        const res = await fetch('/api/permissions');
        if(res.ok) {
            const data = await res.json();
            allowedUsersCache = data.allowedUsers || [];
            renderPermissions();
        }
    } catch(e){}
}
fetchPermissions();

function renderPermissions() {
    if (!permList) return;
    permList.innerHTML = '';
    if (allowedUsersCache.length === 0) {
        permList.innerHTML = '<li style="padding: 10px; color: #949ba4; text-align: center;">Vacia (Todos los usuarios permitidos)</li>';
        return;
    }
    
    allowedUsersCache.forEach(id => {
        const li = document.createElement('li');
        li.style = "padding: 10px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333;";
        // Intentar encontrar alias en userSelect
        let alias = id;
        Array.from(userSelect.options).forEach(opt => {
            if (opt.value === id) alias = opt.textContent.split(' ')[0];
        });
        
        li.innerHTML = `<span style="color:#dbdee1; font-weight:bold;">${alias} <small style="color:#949ba4; font-family:monospace;">(${id})</small></span>
                        <button type="button" onclick="removePerm('${id}')" style="background:#da373c; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:12px; cursor:pointer;">Eliminar</button>`;
        permList.appendChild(li);
    });
}

window.populatePermSelect = function(activeUsers) {
    if (!permUsersSelect) return;
    const prev = permUsersSelect.value;
    permUsersSelect.innerHTML = '<option value="">O selecciona un usuario conectado...</option>';
    activeUsers.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.username} (${u.id})`;
        permUsersSelect.appendChild(opt);
    });
    if (activeUsers.find(u => u.id === prev)) permUsersSelect.value = prev;
}

permUsersSelect?.addEventListener('change', (e) => {
    if (e.target.value) permUserIdInput.value = e.target.value;
});

addPermBtn?.addEventListener('click', async () => {
    const id = permUserIdInput.value.trim();
    if (!id) return alert('Debes especificar un ID');
    
    try {
        const res = await fetch('/api/permissions', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userId: id })
        });
        if (res.ok) {
            const data = await res.json();
            allowedUsersCache = data.allowedUsers;
            renderPermissions();
            permUserIdInput.value = '';
            permUsersSelect.value = '';
        }
    } catch(e) { alert('Error al añadir permiso') }
});

window.removePerm = async function(id) {
    if(!confirm('¿Eliminar permiso para ' + id + '?')) return;
    try {
        const res = await fetch('/api/permissions/delete', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userId: id })
        });
        if (res.ok) {
            const data = await res.json();
            allowedUsersCache = data.allowedUsers;
            renderPermissions();
        }
    } catch(e) {}
}
// ----------------------------

userSelect.addEventListener('change', () => {
    const id = userSelect.value;
    userIdInput.value = id;
    pendingDeletions = [];
    
    // **Bug Fix - DOM Contamination**: Limpiar todos los inputs tipo "file" cada que se cambia de usuario
    ['idle', 'speaking', 'idleBlink', 'speakingBlink', 'shouting', 'muted', 'deafened'].forEach(type => {
        document.getElementById(`${type}File`).value = '';
    });
    
    // Ocultar permanentemente token cuando se cambia de usuario (One-Time-View)
    document.getElementById('apiTokenInput').value = '';
    document.getElementById('apiTokenInput').type = 'password';
    
    document.getElementById('obsLink').value = `${window.location.origin}/obs.html?user=${id}`;
    if (!id) {
        document.getElementById('profileContainer').style.display = 'none';
        return;
    }

    if (!userConfigs[id]) userConfigs[id] = {};
    const usr = userConfigs[id];
    if (!usr.profiles) usr.profiles = { 'default': { name: 'Principal' } };
    if (!usr.activeProfile) usr.activeProfile = 'default';

    currentProfileId = usr.activeProfile;
    renderProfilesList(usr);
    loadProfileIntoUI(usr.profiles[currentProfileId]);
    
    document.getElementById('profileContainer').style.display = 'block';
});

function renderProfilesList(usr) {
    const sel = document.getElementById('profileSelect');
    sel.innerHTML = '';
    for (const [pId, pData] of Object.entries(usr.profiles)) {
        const isAct = usr.activeProfile === pId;
        sel.innerHTML += `<option value="${pId}">${pData.name || pId} ${isAct ? '✅' : ''}</option>`;
    }
    sel.value = currentProfileId;
    
    const actBtn = document.getElementById('makeActiveBtn');
    if (usr.activeProfile === currentProfileId) {
        actBtn.style.opacity = '0.5';
        actBtn.textContent = 'En directo OBS';
        actBtn.dataset.active = 'false';
    } else {
        actBtn.style.opacity = '1';
        actBtn.textContent = 'Modo Edición - Aplicar ✅';
        actBtn.dataset.active = 'true';
    }
}

function loadProfileIntoUI(conf = {}) {
    setPreviewBg('idlePreview', conf.idle);
    setPreviewBg('speakingPreview', conf.speaking);
    setPreviewBg('shoutingPreview', conf.shouting);
    setPreviewBg('mutedPreview', conf.muted);
    setPreviewBg('deafenedPreview', conf.deafened);
    setPreviewBg('idleBlinkPreview', conf.idleBlink);
    setPreviewBg('speakingBlinkPreview', conf.speakingBlink);

    if (conf.idle) document.getElementById('previewAvatar').style.backgroundImage = `url('${conf.idle}')`;
    else document.getElementById('previewAvatar').style.backgroundImage = 'none';

    document.getElementById('animIntro').value = conf.animIntro || 'pop';
    document.getElementById('animIntroDir').value = conf.animIntroDir || 'up';
    document.getElementById('animOutro').value = conf.animOutro || 'popOut';
    document.getElementById('animOutroDir').value = conf.animOutroDir || 'down';
    refreshAnimDirs();
    document.getElementById('animSpeaking').value = conf.animSpeaking || 'bounce_talk';
    document.getElementById('animUseDb').checked = conf.animUseDb !== false; 
    document.getElementById('animDbStretch').checked = conf.animDbStretch !== false; 
    
    // Toggles por defecto apagados
    document.getElementById('enableBlinkCheckbox').checked = conf.enableBlink === true;
    document.getElementById('enableShoutCheckbox').checked = conf.enableShout === true;
    document.getElementById('enableMuteCheckbox').checked = conf.enableMute === true;
    document.getElementById('enableDeafenCheckbox').checked = conf.enableDeafen === true;
    document.getElementById('animPivot').value = conf.animPivot || '50% 100%';
    document.getElementById('animDirection').value = conf.animDirection || 'vertical';
    document.getElementById('animSafeZone').value = conf.animSafeZone !== undefined ? conf.animSafeZone : 50;
    document.getElementById('animSafeZoneLabel').textContent = `${document.getElementById('animSafeZone').value} px`;
    refreshPreviewLayout();

    document.getElementById('maxExaggerationInput').value = conf.maxExaggeration !== undefined ? conf.maxExaggeration : 1.0;
    document.getElementById('maxExaggerationLabel').textContent = `${parseFloat(document.getElementById('maxExaggerationInput').value).toFixed(1)}x`;
    
    const rStretch = document.getElementById('maxDbStretchInput');
    rStretch.value = conf.maxDbStretch !== undefined ? conf.maxDbStretch : -22;
    document.getElementById('maxDbStretchLabel').textContent = `${rStretch.value} dB`;
    
    const rShout = document.getElementById('maxDbShoutInput');
    rShout.value = conf.maxDbShout !== undefined ? conf.maxDbShout : -15;
    document.getElementById('maxDbShoutLabel').textContent = `${rShout.value} dB`;
    
    const rGate = document.getElementById('minDbGateInput');
    rGate.value = conf.minDbGate !== undefined ? conf.minDbGate : -40;
    document.getElementById('minDbGateLabel').textContent = `${rGate.value} dB`;
    
    document.getElementById('blinkIntervalInput').value = conf.blinkInterval !== undefined ? conf.blinkInterval : 4;
    document.getElementById('blinkIntervalLabel').textContent = `${document.getElementById('blinkIntervalInput').value} s`;
    
    document.getElementById('blinkDurationInput').value = conf.blinkDuration !== undefined ? conf.blinkDuration : 0.15;
    document.getElementById('blinkDurationLabel').textContent = `${document.getElementById('blinkDurationInput').value} s`;
}

// Interacciones con Perfiles
document.getElementById('profileSelect').addEventListener('change', (e) => {
    currentProfileId = e.target.value;
    const usr = userConfigs[userIdInput.value];
    renderProfilesList(usr);
    loadProfileIntoUI(usr.profiles[currentProfileId]);
});

document.getElementById('newProfileBtn').addEventListener('click', () => {
    const profName = prompt("Nombre del nuevo perfil (Ej: Enojado, Llorando):");
    if (!profName) return;
    const pId = 'prof_' + Date.now();
    const usr = userConfigs[userIdInput.value];
    usr.profiles[pId] = { name: profName, enableBlink: false, enableShout: false };
    currentProfileId = pId;
    renderProfilesList(usr);
    loadProfileIntoUI(usr.profiles[currentProfileId]);
});

document.getElementById('dupProfileBtn').addEventListener('click', () => {
    const profName = prompt("Nombre del perfil duplicado:");
    if (!profName) return;
    const pId = 'prof_' + Date.now();
    const usr = userConfigs[userIdInput.value];
    const backup = JSON.parse(JSON.stringify(usr.profiles[currentProfileId]));
    backup.name = profName;
    backup.enableBlink = false;
    backup.enableShout = false;
    usr.profiles[pId] = backup;
    currentProfileId = pId;
    renderProfilesList(usr);
    loadProfileIntoUI(usr.profiles[currentProfileId]);
});

document.getElementById('renameProfileBtn').addEventListener('click', () => {
    const usr = userConfigs[userIdInput.value];
    const oldName = usr.profiles[currentProfileId].name;
    const profName = prompt("Renombrar Perfil:", oldName);
    if (profName && profName !== oldName) {
        usr.profiles[currentProfileId].name = profName;
        renderProfilesList(usr);
    }
});

document.getElementById('makeActiveBtn').addEventListener('click', (e) => {
    if (e.target.dataset.active !== 'true') return;
    e.target.textContent = "Aplicando Guardado...";
    e.target.dataset.active = 'marked';
    document.getElementById('saveBtn').click();
});

document.getElementById('delProfileBtn').addEventListener('click', async () => {
    const usr = userConfigs[userIdInput.value];
    if (Object.keys(usr.profiles).length <= 1) return alert("¡No puedes eliminar tu único perfil!");
    if (usr.activeProfile === currentProfileId) return alert("¡No puedes eliminar el perfil que está activo en OBS! Primero haz activo a otro perfil.");
    if (confirm("¿Estás seguro que quieres eliminar la configuración de esta Emoción?")) {
        try {
            const res = await fetch('/api/config/delete-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userIdInput.value, profileId: currentProfileId })
            });
            const data = await res.json();
            if (data.success) {
                userConfigs[userIdInput.value] = data.config;
                currentProfileId = data.config.activeProfile;
                renderProfilesList(userConfigs[userIdInput.value]);
                loadProfileIntoUI(userConfigs[userIdInput.value].profiles[currentProfileId]);
            }
        } catch (e) { alert('Error eliminando perfil'); }
    }
});

document.getElementById('maxDbStretchInput').addEventListener('input', (e) => {
    document.getElementById('maxDbStretchLabel').textContent = `${e.target.value} dB`;
});
document.getElementById('maxDbShoutInput').addEventListener('input', (e) => {
    document.getElementById('maxDbShoutLabel').textContent = `${e.target.value} dB`;
});
document.getElementById('minDbGateInput').addEventListener('input', (e) => {
    document.getElementById('minDbGateLabel').textContent = `${e.target.value} dB`;
});
document.getElementById('animSafeZone').addEventListener('input', (e) => {
    document.getElementById('animSafeZoneLabel').textContent = `${e.target.value} px`;
    refreshPreviewLayout();
});

document.getElementById('maxExaggerationInput').addEventListener('input', (e) => {
    document.getElementById('maxExaggerationLabel').textContent = `${parseFloat(e.target.value).toFixed(1)}x`;
});

document.getElementById('animPivot').addEventListener('change', refreshPreviewLayout);
document.getElementById('blinkIntervalInput').addEventListener('input', (e) => {
    document.getElementById('blinkIntervalLabel').textContent = `${e.target.value} s`;
});
document.getElementById('blinkDurationInput').addEventListener('input', (e) => {
    document.getElementById('blinkDurationLabel').textContent = `${e.target.value} s`;
});
document.getElementById('enableBlinkCheckbox').addEventListener('change', (e) => {
    if (isMicPreviewActive) {
        clearTimeout(blinkTimerLocal);
        isBlinkingLocal = false;
        if (e.target.checked) scheduleLocalBlink();
        else updateLocalImageBlink();
    }
});

document.getElementById('resetBlinkBtn').addEventListener('click', () => {
    document.getElementById('blinkIntervalInput').value = 4;
    document.getElementById('blinkIntervalLabel').textContent = `4 s`;

    document.getElementById('blinkDurationInput').value = 0.15;
    document.getElementById('blinkDurationLabel').textContent = `0.15 s`;
    
    document.getElementById('enableBlinkCheckbox').checked = true;
    if (isMicPreviewActive) {
        clearTimeout(blinkTimerLocal);
        scheduleLocalBlink();
    }
});

document.getElementById('resetDbBtn').addEventListener('click', () => {
    document.getElementById('maxDbStretchInput').value = -22;
    document.getElementById('maxDbStretchLabel').textContent = `-22 dB`;

    document.getElementById('maxDbShoutInput').value = -15;
    document.getElementById('maxDbShoutLabel').textContent = `-15 dB`;

    document.getElementById('minDbGateInput').value = -40;
    document.getElementById('minDbGateLabel').textContent = `-40 dB`;
});

// === SEGURIDAD Y API TOKEN ===
document.getElementById('toggleTokenBtn').addEventListener('click', () => {
    const input = document.getElementById('apiTokenInput');
    input.type = input.type === 'password' ? 'text' : 'password';
});

document.getElementById('copyTokenBtn').addEventListener('click', () => {
    const input = document.getElementById('apiTokenInput');
    if (input.value) {
        navigator.clipboard.writeText(input.value);
        alert('API Token copiado al portapapeles ✅');
    } else {
        alert('No hay ningún token generado aún. Presiona "Reset Token".');
    }
});

document.getElementById('resetTokenBtn').addEventListener('click', async () => {
    const uid = document.getElementById('userId').value;
    if (!uid) return alert("Selecciona un usuario primero");
    
    if (!confirm('¿Estás SEGURO de querer regenerar el Token?\n\nLa aplicación Macro de Windows dejará de funcionar y deberás iniciar sesión de nuevo con la nueva contraseña.')) return;
    
    try {
        const res = await fetch('/api/config/token', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ userId: uid }) 
        });
        const data = await res.json();
        
        if (data.success) {
            document.getElementById('apiTokenInput').value = data.token;
            document.getElementById('apiTokenInput').type = 'text'; // Mostrar en texto claro para que lo copien rápido
            alert('¡Token Secreto Regenerado Exitosamente!');
        } else {
            alert('Error generando token: ' + data.error);
        }
    } catch(e) {
        console.error(e);
        alert('Error conectando con el backend para el token');
    }
});

function setPreviewBg(id, url) {
    const el = document.getElementById(id);
    if (url) {
        el.style.backgroundImage = `url('${url}')`;
        el.textContent = '';
        el.classList.remove('placeholder');
    } else {
        el.style.backgroundImage = 'none';
        el.textContent = 'Sube un archivo';
        el.classList.add('placeholder');
    }
}

// Previews triggers & deletions
['idle', 'speaking', 'idleBlink', 'speakingBlink', 'shouting', 'muted', 'deafened'].forEach(type => {
    document.getElementById(`${type}Preview`).addEventListener('click', () => document.getElementById(`${type}File`).click());
    document.getElementById(`${type}File`).addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(evt) {
                setPreviewBg(`${type}Preview`, evt.target.result);
                if(type === 'idle') {
                    document.getElementById('previewAvatar').style.backgroundImage = `url('${evt.target.result}')`;
                }
            }
            reader.readAsDataURL(file);
        }
    });
});

document.querySelectorAll('.clear-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = e.target.getAttribute('data-clear');
        pendingDeletions.push(type);
        setPreviewBg(`${type}Preview`, null);
        document.getElementById(`${type}File`).value = "";
    });
});

// Save
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    const formData = new FormData();
    formData.append('userId', userIdInput.value);
    formData.append('profileId', currentProfileId);
    formData.append('profileName', userConfigs[userIdInput.value].profiles[currentProfileId].name);
    
    const makeActBtn = document.getElementById('makeActiveBtn');
    if (makeActBtn.dataset.active === 'marked') {
        formData.append('makeActive', 'true');
    } else {
        formData.append('makeActive', 'false');
    }
    
    // Anexar banderas de eliminación al backend
    pendingDeletions.forEach(type => formData.append(`delete_${type}`, 'true'));
    
    ['idle', 'speaking', 'idleBlink', 'speakingBlink', 'shouting', 'muted', 'deafened'].forEach(type => {
        const file = document.getElementById(`${type}File`).files[0];
        if (file) formData.append(type, file);
    });

    formData.append('animIntro', document.getElementById('animIntro').value);
    formData.append('animIntroDir', document.getElementById('animIntroDir').value);
    formData.append('animOutro', document.getElementById('animOutro').value);
    formData.append('animOutroDir', document.getElementById('animOutroDir').value);
    formData.append('animSpeaking', document.getElementById('animSpeaking').value);
    formData.append('animPivot', document.getElementById('animPivot').value);
    formData.append('animDirection', document.getElementById('animDirection').value);
    formData.append('animSafeZone', document.getElementById('animSafeZone').value);
    formData.append('animUseDb', document.getElementById('animUseDb').checked);
    formData.append('animDbStretch', document.getElementById('animDbStretch').checked);
    formData.append('enableBlink', document.getElementById('enableBlinkCheckbox').checked);
    formData.append('enableShout', document.getElementById('enableShoutCheckbox').checked);
    formData.append('enableMute', document.getElementById('enableMuteCheckbox').checked);
    formData.append('enableDeafen', document.getElementById('enableDeafenCheckbox').checked);
    formData.append('maxExaggeration', document.getElementById('maxExaggerationInput').value);
    
    formData.append('maxDbStretch', document.getElementById('maxDbStretchInput').value);
    formData.append('maxDbShout', document.getElementById('maxDbShoutInput').value);
    formData.append('minDbGate', document.getElementById('minDbGateInput').value);
    formData.append('blinkInterval', document.getElementById('blinkIntervalInput').value);
    formData.append('blinkDuration', document.getElementById('blinkDurationInput').value);

    try {
        const res = await fetch('/api/config', { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.success) {
            userConfigs[userIdInput.value] = data.config;
            const obsUrl = `${window.location.origin}/obs.html?user=${userIdInput.value}`;
            document.getElementById('obsLink').value = obsUrl;
            document.getElementById('link-section').classList.remove('hidden');
            
            alert('¡Configuración guardada!');
            pendingDeletions = [];
            
            // Recargar interfaces locales
            renderProfilesList(userConfigs[userIdInput.value]);
        }
    } catch (err) {
        console.error(err);
        alert('Error al guardar.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar Configuración';
    }
});
function copyLink() {
    const linkInput = document.getElementById('obsLink');
    linkInput.select();
    document.execCommand('copy');
    alert('Enlace copiado al portapapeles');
}

// ==== SISTEMA DE PREVISUALIZACION SAFE ZONE ====
function refreshPreviewLayout() {
    const pivot = document.getElementById('animPivot').value || '50% 100%';
    const safeZone = parseInt(document.getElementById('animSafeZone').value) || 0;
    const stage = document.getElementById('previewStage');
    const boundary = document.getElementById('previewBoundary');
    const avatar = document.getElementById('previewAvatar');
    
    const [px, py] = pivot.split(' ');
    
    let flexAlign = 'center';
    let flexJustify = 'center';

    stage.style.alignItems = flexAlign;
    stage.style.justifyContent = flexJustify;

    // SIMULADOR OBS: El PreviewBoundary será nuestro "Lienzo de OBS" simulado a 300px
    const OBS_BASELINE_RES = 512; // Resolución promedio base asumida para los cálculos de OBS (Nativa a la imagen)
    const PREVIEW_RES = 300;      // Resolución estática de nuestro panel de pruebas
    
    const SIMULATOR_RATIO = PREVIEW_RES / OBS_BASELINE_RES;
    
    // El padding simulado es estrictamente relativo a cómo se escala el safeZone físico en OBS
    let s = safeZone * SIMULATOR_RATIO; 
    let pt=0, pb=0, pl=0, pr=0;

    if (px === '0%') { pr = s; flexJustify = 'flex-start'; } 
    else if (px === '100%') { pl = s; flexJustify = 'flex-end'; } 
    else { pl = s; pr = s; flexJustify = 'center'; } 

    if (py === '0%') { pb = s; flexAlign = 'flex-start'; } 
    else if (py === '100%') { pt = s; flexAlign = 'flex-end'; } 
    else { pt = s; pb = s; flexAlign = 'center'; } 

    // Configurar el lienzo de OBS simulado
    boundary.style.width = `${PREVIEW_RES}px`;
    boundary.style.height = `${PREVIEW_RES}px`;
    boundary.style.boxSizing = 'border-box';
    boundary.style.padding = `${pt}px ${pr}px ${pb}px ${pl}px`;
    
    // Limpiamos transformaciones antiguas (Auto-Zoom removido en favor de simulador 1:1)
    boundary.style.transform = 'none';

    if(safeZone > 0) {
        boundary.style.border = '2px dashed rgba(242, 63, 66, 0.6)';
        boundary.style.backgroundColor = 'rgba(242, 63, 66, 0.1)';
    } else {
        boundary.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        boundary.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
    }

    // Configurar el avatar visual independiente de la frontera exterior
    avatar.style.width = '100%';
    avatar.style.height = '100%';
    avatar.style.backgroundOrigin = 'content-box';
    avatar.style.backgroundClip = 'content-box';
    avatar.style.transformOrigin = pivot;
    avatar.style.backgroundPosition = pivot;
}
function refreshAnimDirs() {
    const introVal = document.getElementById('animIntro').value;
    const outroVal = document.getElementById('animOutro').value;
    
    const introDirEl = document.getElementById('animIntroDir');
    if(introDirEl) introDirEl.style.display = ['slide', 'bounce', 'back', 'slingshot'].includes(introVal) ? 'block' : 'none';
    
    const outroDirEl = document.getElementById('animOutroDir');
    if(outroDirEl) outroDirEl.style.display = ['slide', 'bounce', 'back', 'slingshot'].includes(outroVal) ? 'block' : 'none';
}
document.getElementById('animIntro').addEventListener('change', refreshAnimDirs);
document.getElementById('animOutro').addEventListener('change', refreshAnimDirs);

// GSAP TESTER
function testAnim(type) {
    const avatar = document.getElementById('previewAvatar');
    gsap.killTweensOf(avatar);
    
    // reset
    const pivot = document.getElementById('animPivot').value || '50% 100%';
    gsap.set(avatar, { scale: 1, scaleX: 1, scaleY: 1, x: 0, y: 0, opacity: 1, rotation: 0, rotationY: 0, transformOrigin: pivot });

    refreshPreviewLayout();

    const idleBg = document.getElementById('idlePreview').style.backgroundImage;
    const speakingBg = document.getElementById('speakingPreview').style.backgroundImage;

    const maxEx = parseFloat(document.getElementById('maxExaggerationInput').value) || 1.0;

    // Helper for directional math
    const getDirVals = (dir, dist) => {
        if (dir === 'up') return { y: dist, x: 0 };
        if (dir === 'down') return { y: -dist, x: 0 };
        if (dir === 'left') return { x: dist, y: 0 };
        if (dir === 'right') return { x: -dist, y: 0 };
        return { y: dist, x: 0 };
    };

    if (type === 'intro') {
        const anim = document.getElementById('animIntro').value;
        const dir = document.getElementById('animIntroDir') ? document.getElementById('animIntroDir').value : 'up';
        avatar.style.backgroundImage = idleBg;
        
        let p = getDirVals(dir, 300);

        if (anim === 'pop') gsap.fromTo(avatar, { scale: 0 }, { scale: 1, duration: 0.5, ease: "back.out(1.7)" });
        else if (anim === 'fade') gsap.fromTo(avatar, { opacity: 0 }, { opacity: 1, duration: 0.5 });
        else if (anim === 'zoomIn') gsap.fromTo(avatar, { scale: 3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "power2.out" });
        else if (anim === 'spin') gsap.fromTo(avatar, { scale: 0, rotation: -360 }, { scale: 1, rotation: 0, duration: 0.6, ease: "power2.out" });
        else if (anim === 'flip') gsap.fromTo(avatar, { rotationY: 90, opacity: 0 }, { rotationY: 0, opacity: 1, duration: 0.6, ease: "back.out(1.4)" });
        else if (anim === 'rollIn') gsap.fromTo(avatar, { x: -300, rotation: -200, opacity: 0 }, { x: 0, rotation: 0, opacity: 1, duration: 0.6, ease: "power2.out" });
        else if (anim === 'slide') gsap.fromTo(avatar, { x: p.x, y: p.y, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.5, ease: "power2.out" });
        else if (anim === 'bounce') gsap.fromTo(avatar, { x: p.x, y: p.y }, { x: 0, y: 0, duration: 0.8, ease: "bounce.out" });
        else if (anim === 'back') gsap.fromTo(avatar, { x: p.x, y: p.y, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.6, ease: "back.out(1.7)" });
        else if (anim === 'slingshot') {
            gsap.fromTo(avatar, { x: p.x * -0.2, y: p.y * -0.2, scale: 1.2 }, { x: 0, y: 0, scale: 1, duration: 0.7, ease: "elastic.out(1, 0.4)" });
        }
    } else if (type === 'speaking') {
        const anim = document.getElementById('animSpeaking').value;
        const dir = document.getElementById('animDirection').value || 'vertical';
        avatar.style.backgroundImage = speakingBg !== 'none' ? speakingBg : idleBg;
        
        let tl = gsap.timeline();
        let p = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
        let d = 0.15;

        // Apply maxExaggeration math internally for the preview translation
        const ex = (val, base = 0) => base + ((val - base) * maxEx);
        const exScale = (val) => 1 + ((val - 1) * maxEx);

        if (anim === 'bounce_talk') {
            tl.to(avatar, dir === 'horizontal' ? { x: ex(20), duration: 0.15, yoyo: true, repeat: 3 } : { y: ex(-20), duration: 0.15, yoyo: true, repeat: 3 });
        } else if (anim === 'shake') {
            tl.to(avatar, { rotation: ex(5), duration: 0.05, yoyo: true, repeat: 3 })
              .to(avatar, { rotation: ex(-5), duration: 0.05, yoyo: true, repeat: 3 });
        } else if (anim === 'float') {
            tl.to(avatar, dir === 'horizontal' ? { x: ex(15), duration: 0.4, yoyo: true, repeat: 1 } : { y: ex(-15), duration: 0.4, yoyo: true, repeat: 1 });
        } else if (anim === 'pulse') {
            tl.to(avatar, { scale: exScale(1.05), duration: 0.2, yoyo: true, repeat: 3 });
        } else if (anim === 'wiggle') {
            tl.to(avatar, { rotation: ex(6), duration: 0.08, yoyo: true, repeat: 5 })
               .to(avatar, { rotation: ex(-6), duration: 0.08, yoyo: true, repeat: 5 });
        } else if (anim === 'jump') {
            tl.to(avatar, dir === 'horizontal' ? { x: ex(-30), duration: 0.2, yoyo: true, repeat: 3, ease: "power1.inOut" } : { y: ex(-30), duration: 0.2, yoyo: true, repeat: 3, ease: "power1.inOut" });
        } else if (anim === 'stretch') {
            tl.to(avatar, dir === 'horizontal' ? { scaleX: exScale(1.15), scaleY: exScale(0.95), duration: 0.15, yoyo: true, repeat: 3 } : { scaleY: exScale(1.15), scaleX: exScale(0.95), duration: 0.15, yoyo: true, repeat: 3 });
        } else if (anim === 'tada') {
            tl.to(avatar, { scale: exScale(1.1), rotation: ex(5), duration: 0.15, yoyo: true, repeat: 3 });
        } else if (anim === 'rubberband') {
            tl.to(avatar, dir === 'horizontal' ? { scaleX: exScale(1.25), scaleY: exScale(0.75), duration: 0.15, yoyo: true, repeat: 2 } : { scaleY: exScale(1.25), scaleX: exScale(0.75), duration: 0.15, yoyo: true, repeat: 2 });
        } else if (anim === 'heartbeat') {
            tl.to(avatar, { scale: exScale(1.15), duration: 0.1, yoyo: true, repeat: 3 });
        } else if (anim === 'jello') {
            tl.to(avatar, { rotation: ex(10), duration: 0.1, yoyo: true, repeat: 3 });
        } else if (anim === 'swing_hablando') {
            tl.to(avatar, { rotation: ex(15), duration: 0.2, yoyo: true, repeat: 3 });
        } 
        // NEW Anime.js Inspired
        else if (anim === 'sine_wave') {
            tl.to(avatar, dir === 'horizontal' ? { x: ex(25), ease: "sine.inOut", duration: 0.3, yoyo: true, repeat: 3 } : { y: ex(-25), ease: "sine.inOut", duration: 0.3, yoyo: true, repeat: 3 });
        } else if (anim === 'pendulum') {
            tl.to(avatar, { rotation: ex(20), ease: "sine.inOut", duration: 0.25, yoyo: true, repeat: 3 })
              .to(avatar, { rotation: ex(-20), ease: "sine.inOut", duration: 0.25, yoyo: true, repeat: 3 });
        } else if (anim === 'tremble') {
            tl.to(avatar, { x: ex(3), y: ex(-3), rotation: ex(2), duration: 0.03, yoyo: true, repeat: 15 });
        } else if (anim === 'squish') {
            tl.to(avatar, { scaleX: exScale(1.3), scaleY: exScale(0.7), y: ex(10), duration: 0.08, yoyo: true, repeat: 5 });
        } else if (anim === 'orbit') {
            tl.to(avatar, { rotation: ex(15), x: ex(10), y: ex(-10), ease: "none", duration: 0.1, yoyo: true, repeat: 5 });
        } else if (anim === 'breathe') {
            tl.to(avatar, { scaleX: exScale(1.05), scaleY: exScale(1.05), ease: "sine.inOut", duration: 0.5, yoyo: true, repeat: 1 });
        } else if (anim === 'glitch') {
            tl.to(avatar, { x: ex(15), skewX: ex(10), ease: "steps(2)", duration: 0.1, yoyo: true, repeat: 5 })
              .to(avatar, { x: ex(-15), skewX: ex(-10), ease: "steps(2)", duration: 0.1, yoyo: true, repeat: 5 });
        }
        
        tl.call(() => { avatar.style.backgroundImage = idleBg; gsap.to(avatar, {x:0, y:0, rotation:0, skewX:0, scaleX:1, scaleY:1}); });
    } else if (type === 'outro') {
        const anim = document.getElementById('animOutro').value;
        const dir = document.getElementById('animOutroDir') ? document.getElementById('animOutroDir').value : 'down';
        avatar.style.backgroundImage = idleBg;

        let p = getDirVals(dir, 300);
        
        if (anim === 'popOut') gsap.to(avatar, { scale: 0, duration: 0.4, ease: "back.in(1.7)" });
        else if (anim === 'fade') gsap.to(avatar, { opacity: 0, duration: 0.4 });
        else if (anim === 'spinOut') gsap.to(avatar, { scale: 0, rotation: 360, duration: 0.4, ease: "power2.in" });
        else if (anim === 'zoomOut') gsap.to(avatar, { scale: 3, opacity: 0, duration: 0.4, ease: "power2.in" });
        else if (anim === 'flipOut') gsap.to(avatar, { rotationY: 90, opacity: 0, duration: 0.4, ease: "back.in(1.4)" });
        else if (anim === 'rollOut') gsap.to(avatar, { x: 300, rotation: 200, opacity: 0, duration: 0.4, ease: "power2.in" });
        else if (anim === 'slide') gsap.to(avatar, { x: p.x * -1, y: p.y * -1, opacity: 0, duration: 0.5, ease: "power2.in" });
        else if (anim === 'bounce') gsap.to(avatar, { x: p.x * -1, y: p.y * -1, opacity: 0, duration: 0.8, ease: "bounce.in" });
        else if (anim === 'back') gsap.to(avatar, { x: p.x * -1, y: p.y * -1, opacity: 0, duration: 0.6, ease: "back.in(1.7)" });
        else if (anim === 'slingshot') {
            gsap.to(avatar, { x: p.x * -1, y: p.y * -1, scale: 0.5, opacity: 0, duration: 0.7, ease: "elastic.in(1, 0.4)" });
        }
        
        setTimeout(() => gsap.set(avatar, { scale: 1, x: 0, y: 0, opacity: 1, rotation: 0, rotationY: 0 }), 1000);
    }
}


// Live local browser Mic preview mechanics for UI isolation 
let audioContext, analyser, microphone, micStream, isMicPreviewActive = false;
let rafId;

let currentLocalDb = -100;
let isBlinkingLocal = false;
let blinkTimerLocal = null;

function scheduleLocalBlink() {
    clearTimeout(blinkTimerLocal);
    if (!document.getElementById('enableBlinkCheckbox').checked) return;
    
    const interval = parseFloat(document.getElementById('blinkIntervalInput').value) || 4;
    const baseMs = interval * 1000;
    const variation = (Math.random() * 0.6 - 0.3) * baseMs;
    let nextBlink = baseMs + variation;
    if (nextBlink < 1000) nextBlink = 1000;
    
    blinkTimerLocal = setTimeout(() => {
        executeLocalBlink();
    }, nextBlink);
}

function executeLocalBlink() {
    if (isMicPreviewActive) {
        isBlinkingLocal = true;
        updateLocalImageBlink();
        
        const blinkDurMs = (parseFloat(document.getElementById('blinkDurationInput').value) || 0.15) * 1000;
        setTimeout(() => {
            isBlinkingLocal = false;
            updateLocalImageBlink();
            scheduleLocalBlink();
        }, blinkDurMs);
        return;
    }
    scheduleLocalBlink();
}

function updateLocalImageBlink() {
    const avatar = document.getElementById('previewAvatar');
    const db = currentLocalDb;
    const maxDbShout = parseInt(document.getElementById('maxDbShoutInput').value) || -15;
    const isSpeaking = db > -100;
    
    let targetImg = document.getElementById('idlePreview').style.backgroundImage;
    let shoutingEnabled = document.getElementById('enableShoutCheckbox').checked;
    let isShoutingLocal = (shoutingEnabled && isSpeaking && db >= maxDbShout && document.getElementById('shoutingPreview').style.backgroundImage !== 'none');
    
    if (isSpeaking) {
        if (isShoutingLocal) {
            targetImg = document.getElementById('shoutingPreview').style.backgroundImage;
        } else {
            targetImg = document.getElementById('speakingPreview').style.backgroundImage;
        }
    }
    
    if (isBlinkingLocal && !isShoutingLocal) {
        if (isSpeaking && document.getElementById('speakingBlinkPreview').style.backgroundImage !== 'none') {
            targetImg = document.getElementById('speakingBlinkPreview').style.backgroundImage;
        } else if (!isSpeaking && document.getElementById('idleBlinkPreview').style.backgroundImage !== 'none') {
            targetImg = document.getElementById('idleBlinkPreview').style.backgroundImage;
        }
    }
    avatar.style.backgroundImage = targetImg;
}

document.getElementById('micPreviewToggle').addEventListener('change', async (e) => {
    isMicPreviewActive = e.target.checked;
    
    if (isMicPreviewActive) {
        try {
            micStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true }, 
                video: false 
            });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.5;
            microphone = audioContext.createMediaStreamSource(micStream);
            microphone.connect(analyser);
            scheduleLocalBlink();
            loopMicPreview();
        } catch (err) {
            console.error(err);
            alert("No se pudo acceder al micrófono.");
            e.target.checked = false;
            isMicPreviewActive = false;
        }
    } else {
        if (micStream) micStream.getTracks().forEach(t => t.stop());
        if (audioContext) audioContext.close();
        clearTimeout(blinkTimerLocal);
        cancelAnimationFrame(rafId);
        gsap.set(document.getElementById('previewAvatar'), { clearProps: "all" });
    }
});

let lastMicEmit = 0;
let lastMicSpeakingState = false;

function loopMicPreview() {
    if (!isMicPreviewActive) return;
    rafId = requestAnimationFrame(loopMicPreview);
    
    const now = Date.now();
    if (now - lastMicEmit < 50) return;
    lastMicEmit = now;

    const array = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(array);
    let sum = 0;
    for (let i = 0; i < array.length; i++) {
        const val = (array[i] - 128) / 128;
        sum += val * val;
    }
    const rms = Math.sqrt(sum / array.length);
    const dbRaw = rms > 0 ? 20 * Math.log10(rms) : -100;
    
    // Activar compuerta de ruido (Noise Gate) local para cortar ruidos de fondo
    const noiseGate = parseInt(document.getElementById('minDbGateInput').value) || -40;
    const db = dbRaw < noiseGate ? -100 : dbRaw;
    
    currentLocalDb = db;
    
    const maxDbStretch = parseInt(document.getElementById('maxDbStretchInput').value) || -22;
    const maxDbShout = parseInt(document.getElementById('maxDbShoutInput').value) || -15;
    const minDb = -60;
    
    let dividerLocal = (maxDbStretch - minDb);
    if (dividerLocal <= 0) dividerLocal = 0.1;
    let p = ((db - minDb) / dividerLocal) * 100;
    p = Math.max(0, Math.min(100, p));
    document.getElementById('liveMeterBar').style.width = `${p}%`;
    document.getElementById('liveRmsText').textContent = `${db === -100 ? -60 : db.toFixed(1)} dB (Local)`;

    const avatar = document.getElementById('previewAvatar');
    const isSpeaking = db > -100; 
    
    updateLocalImageBlink();

    if (document.getElementById('animUseDb').checked && isSpeaking && document.getElementById('animSpeaking').value !== 'none') {
        const anim = document.getElementById('animSpeaking').value;
        const stretchEnabled = document.getElementById('animDbStretch').checked;
        const dir = document.getElementById('animDirection').value || 'vertical';
        
        let dividerIntensity = (maxDbStretch - minDb);
        if (dividerIntensity <= 0) dividerIntensity = 0.1;
        let intensity = (db - minDb) / dividerIntensity;
        intensity = Math.max(0, Math.min(1, intensity));

        let p = { y: 0, x: 0, rotation: 0, scaleX: 1, scaleY: stretchEnabled ? 1.0 + (0.25 * intensity) : 1 };
        let d = 0.1;

        if (anim === 'bounce_talk') {
            if (dir === 'horizontal') p.x = 40 * intensity; else p.y = -40 * intensity;
            d = Math.max(0.04, 0.12 - (0.08 * intensity));
        } else if (anim === 'shake') {
            p.rotation = (Math.random() > 0.5 ? 1 : -1) * (15 * intensity); 
            if (dir === 'horizontal') p.x = (Math.random() > 0.5 ? 1 : -1) * (10 * intensity);
            else p.y = (Math.random() > 0.5 ? 1 : -1) * (10 * intensity);
            d = Math.max(0.02, 0.08 - (0.05 * intensity));
        } else if (anim === 'float') {
            if (dir === 'horizontal') p.x = 25 * intensity; else p.y = -25 * intensity;
            p.scaleX = 1.0 + (0.1 * intensity);
            if (!stretchEnabled) p.scaleY = 1.0 + (0.1 * intensity);
            d = 0.1;
        } else if (anim === 'pulse') {
            p.scaleX = 1.0 + (0.25 * intensity);
            if (!stretchEnabled) p.scaleY = 1.0 + (0.25 * intensity);
            d = 0.1;
        } else if (anim === 'wiggle') {
            p.rotation = Math.sin(Date.now() / 50) * (20 * intensity); 
            if (dir === 'horizontal') p.x = Math.cos(Date.now() / 50) * (15 * intensity);
            d = Math.max(0.02, 0.08 - (0.05 * intensity));
        } else if (anim === 'jump') {
            if (dir === 'horizontal') p.x = -80 * intensity; else p.y = -80 * intensity;
            p.scaleX = 1.0 - (0.15 * intensity); 
            if (!stretchEnabled) p.scaleY = 1.0 + (0.2 * intensity);
            d = Math.max(0.05, 0.12 - (0.06 * intensity));
        } else if (anim === 'stretch') {
            if (dir === 'horizontal') { p.scaleX = 1.0 + (0.35 * intensity); p.scaleY = 1.0 - (0.1 * intensity); } 
            else { p.scaleX = 1.0 - (0.1 * intensity); p.scaleY = 1.0 + (0.35 * intensity); }
            d = 0.05;
        } else if (anim === 'tada') {
            p.scaleX = 1.0 + (0.2 * intensity); p.scaleY = 1.0 + (0.2 * intensity);
            p.rotation = Math.sin(Date.now() / 40) * (10 * intensity); d = 0.1;
        } else if (anim === 'rubberband') {
            if (dir === 'horizontal') { p.scaleX = 1.0 + (0.4 * intensity); p.scaleY = 1.0 - (0.2 * intensity); }
            else { p.scaleX = 1.0 - (0.2 * intensity); p.scaleY = 1.0 + (0.4 * intensity); }
            d = Math.max(0.06, 0.15 - (0.08 * intensity));
        } else if (anim === 'heartbeat') {
            p.scaleX = 1.0 + (0.3 * intensity);
            if (!stretchEnabled) p.scaleY = 1.0 + (0.3 * intensity);
            d = Math.max(0.05, 0.18 - (0.1 * intensity));
        } else if (anim === 'jello') {
            p.rotation = Math.sin(Date.now() / 30) * (25 * intensity);
            d = Math.max(0.03, 0.1 - (0.06 * intensity));
        } else if (anim === 'swing_hablando') {
            p.rotation = Math.sin(Date.now() / 60) * (30 * intensity);
            if (dir === 'horizontal') p.x = Math.sin(Date.now() / 60) * (20 * intensity);
            d = 0.12;
        } else if (anim === 'sine_wave') {
            if (dir === 'horizontal') p.x = Math.sin(Date.now() / 100) * (40 * intensity); 
            else p.y = Math.sin(Date.now() / 100) * (-40 * intensity);
            d = 0.1;
        } else if (anim === 'pendulum') {
            p.rotation = Math.sin(Date.now() / 120) * (45 * intensity);
            d = 0.1;
        } else if (anim === 'tremble') {
            p.x = (Math.random() > 0.5 ? 1 : -1) * (5 * intensity);
            p.y = (Math.random() > 0.5 ? 1 : -1) * (5 * intensity);
            p.rotation = (Math.random() > 0.5 ? 1 : -1) * (3 * intensity);
            d = 0.03;
        } else if (anim === 'squish') {
            p.scaleX = 1.0 + (0.6 * intensity);
            p.scaleY = 1.0 - (0.5 * intensity);
            p.y = 15 * intensity;
            d = Math.max(0.04, 0.1 - (0.05 * intensity));
        } else if (anim === 'orbit') {
            p.x = Math.cos(Date.now() / 80) * (25 * intensity);
            p.y = Math.sin(Date.now() / 80) * (25 * intensity);
            p.rotation = Math.cos(Date.now() / 100) * (15 * intensity);
            d = 0.08;
        } else if (anim === 'breathe') {
            p.scaleX = 1.0 + (0.15 * intensity);
            p.scaleY = 1.0 + (0.15 * intensity);
            d = 0.15;
        } else if (anim === 'glitch') {
            p.x = (Math.random() > 0.5 ? 1 : -1) * (20 * intensity);
            p.skewX = (Math.random() > 0.5 ? 1 : -1) * (20 * intensity);
            d = 0.05;
        }

        const maxEx = parseFloat(document.getElementById('maxExaggerationInput').value) || 1.0;
        if (maxEx !== 1.0) {
            p.x *= maxEx;
            p.y *= maxEx;
            p.rotation *= maxEx;
            if (p.scaleX !== 1) p.scaleX = 1 + ((p.scaleX - 1) * maxEx);
            if (p.scaleY !== 1) p.scaleY = 1 + ((p.scaleY - 1) * maxEx);
        }
        
        gsap.to(avatar, { ...p, duration: d, ease: "power1.out", overwrite: "auto" });
        lastMicSpeakingState = true;
    } else if (!isSpeaking && lastMicSpeakingState) {
        gsap.to(avatar, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, duration: 0.2, overwrite: "auto" });
        lastMicSpeakingState = false;
    }
}

// Websocket Live Meter Listener
socket.on('user_volume', (data) => {
    if (isMicPreviewActive || data.userId !== userIdInput.value) return;
    
    const maxDbStretch = parseInt(document.getElementById('maxDbStretchInput').value) || -22;
    const noiseGate = parseInt(document.getElementById('minDbGateInput').value) || -40;
    const minDb = -60;

    let dbRaw = -100;
    if (data.rms > 0) {
        dbRaw = 20 * Math.log10(data.rms / 32768);
    }
    const db = dbRaw < noiseGate ? -100 : dbRaw;
    
    let p = ((db - minDb) / (maxDbStretch - minDb)) * 100;
    p = Math.max(0, Math.min(100, p));
    
    document.getElementById('liveMeterBar').style.width = `${p}%`;
    document.getElementById('liveRmsText').textContent = `${db === -100 ? -60 : db.toFixed(1)} dB (Discord)`;
});
