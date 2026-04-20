const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('user');
const avatarElement = document.getElementById('avatar');
const socket = io();

// Cache y Estado
let conf = {};
let isSpeaking = false;
let isConnected = false;
let isMuted = false;
let isDeafened = false;
let isShouting = false;

let isBlinking = false;
let blinkTimer = null;

function scheduleBlink() {
    clearTimeout(blinkTimer);
    if (conf.enableBlink === false) {
        isBlinking = false;
        return;
    }
    
    if (!conf.blinkInterval) conf.blinkInterval = 4;
    const baseMs = conf.blinkInterval * 1000;
    const variation = (Math.random() * 0.6 - 0.3) * baseMs; 
    let nextBlink = baseMs + variation;
    if (nextBlink < 1000) nextBlink = 1000;
    
    blinkTimer = setTimeout(() => {
        executeBlink();
    }, nextBlink);
}

function executeBlink() {
    const isVisuallyDeaf = isDeafened && conf.enableDeafen === true;
    const isVisuallyMuted = isMuted && conf.enableMute === true;

    if (isConnected && !isVisuallyMuted && !isVisuallyDeaf) {
        isBlinking = true;
        updateImage();
        
        const blinkDurMs = (conf.blinkDuration !== undefined ? conf.blinkDuration : 0.15) * 1000;
        
        setTimeout(() => {
            isBlinking = false;
            updateImage();
            scheduleBlink();
        }, blinkDurMs);
        return;
    }
    scheduleBlink();
}

let currentBg = '';
function setBackgroundImage(url) {
    if (url && currentBg !== url) {
        avatarElement.style.backgroundImage = `url('${url}')`;
        currentBg = url;
    }
}

// GSAP estado constante
let speakingTween = null;

async function loadConfig() {
    if (!userId) {
        console.error("No hay ?user= en la URL");
        return;
    }
    try {
        const res = await fetch(`/api/config/${userId}`);
        const data = await res.json();
        // V6 Backward compatible unwrapper: Encontrar el perfil Activo
        if (data.profiles && data.activeProfile) {
            conf = data.profiles[data.activeProfile] || {};
        } else {
            conf = data || {};
        }
    } catch (err) {}
}

async function checkInitialState() {
    try {
        const res = await fetch('/api/voice-users');
        const users = await res.json();
        const me = users.find(u => u.id === userId);
        if (me) {
            isMuted = me.mute;
            isDeafened = me.deaf;
            handleConnect(); // Si el usuario está activo, asegurar despliegue
        } else {
            handleDisconnect(); // Si ya no está, ocultar preventivamente
        }
    } catch (e) {}
}

// Auto-reconectores de desincronización (Si NodeJS se reinicia o OBS se estanca)
socket.on('connect', () => {
    checkInitialState();
});

socket.on('bot_joined_channel', () => {
    checkInitialState();
});

async function initialize() {
    await loadConfig();
    await checkInitialState();
}
initialize();

// Actualizar Imagen según prioridad interactiva y estados parpadeantes
function updateImage() {
    if (!isConnected) return;
    
    let targetImg = conf.idle;
    
    if (isDeafened && conf.enableDeafen === true) {
        targetImg = conf.deafened || conf.idle;
    } else if (isMuted && conf.enableMute === true) {
        targetImg = conf.muted || conf.idle;
    } else if (isShouting && conf.shouting) {
        targetImg = conf.shouting;
    } else if (isSpeaking && conf.speaking) {
        targetImg = conf.speaking;
    }
    
    // Si estamos tapados por un mute/deafen HABILITADO, no pestañear si el dibujo base ya está ahí (a menos que quieran animar sobre eso, lo default es detener pestañeo en mute si está habilitado)
    const isVisuallyDeaf = isDeafened && conf.enableDeafen === true;
    const isVisuallyMuted = isMuted && conf.enableMute === true;

    if (isBlinking && !isVisuallyMuted && !isVisuallyDeaf && !isShouting) {
        if (isSpeaking && conf.speakingBlink) targetImg = conf.speakingBlink;
        else if (!isSpeaking && conf.idleBlink) targetImg = conf.idleBlink;
    }
    
    setBackgroundImage(targetImg);
}

// Entradas y Salidas
function handleConnect() {
    if (isConnected) return;
    isConnected = true;
    avatarElement.style.display = 'block';
    
    loadConfig().then(() => {
        updateImage();
        scheduleBlink();
        applyDOMPaddingLayout();
        
        const anim = conf.animIntro || 'pop';
        const dir = conf.animIntroDir || 'up';
        
        const getDirVals = (direction, distance) => {
            if (direction === 'up') return { y: distance, x: 0 };
            if (direction === 'down') return { y: -distance, x: 0 };
            if (direction === 'left') return { x: distance, y: 0 };
            if (direction === 'right') return { x: -distance, y: 0 };
            return { y: distance, x: 0 };
        };
        
        let p = getDirVals(dir, 300);

        if (anim === 'pop') gsap.fromTo(avatarElement, { scale: 0, opacity:1 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.7)" });
        else if (anim === 'fade') gsap.fromTo(avatarElement, { opacity: 0 }, { opacity: 1, duration: 0.5 });
        else if (anim === 'zoomIn') gsap.fromTo(avatarElement, { scale: 3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "power2.out" });
        else if (anim === 'spin') gsap.fromTo(avatarElement, { scale: 0, rotation: -360, opacity:1 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.6, ease: "power2.out" });
        else if (anim === 'flip') gsap.fromTo(avatarElement, { rotationY: 90, opacity: 0 }, { rotationY: 0, opacity: 1, duration: 0.6, ease: "back.out(1.4)" });
        else if (anim === 'rollIn') gsap.fromTo(avatarElement, { x: -300, rotation: -200, opacity: 0 }, { x: 0, rotation: 0, opacity: 1, duration: 0.6, ease: "power2.out" });
        else if (anim === 'slide') gsap.fromTo(avatarElement, { x: p.x, y: p.y, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.5, ease: "power2.out" });
        else if (anim === 'bounce') gsap.fromTo(avatarElement, { x: p.x, y: p.y, opacity:1 }, { x: 0, y: 0, duration: 0.8, ease: "bounce.out" });
        else if (anim === 'back') gsap.fromTo(avatarElement, { x: p.x, y: p.y, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.6, ease: "back.out(1.7)" });
        else if (anim === 'slingshot') {
            gsap.fromTo(avatarElement, { x: p.x * -0.2, y: p.y * -0.2, scale: 1.2 }, { x: 0, y: 0, scale: 1, duration: 0.7, ease: "elastic.out(1, 0.4)" });
        }
        else gsap.set(avatarElement, { opacity: 1, scale: 1, x: 0, y: 0, rotation: 0, rotationY: 0 });
    });
}

function handleDisconnect() {
    if (!isConnected) return;
    isConnected = false;
    isSpeaking = false;
    isShouting = false;
    clearTimeout(blinkTimer);
    
    if (speakingTween) speakingTween.kill();
    gsap.killTweensOf(avatarElement);

    const anim = conf.animOutro || 'popOut';
    const dir = conf.animOutroDir || 'down';
    
    const getDirVals = (direction, distance) => {
        if (direction === 'up') return { y: distance, x: 0 };
        if (direction === 'down') return { y: -distance, x: 0 };
        if (direction === 'left') return { x: distance, y: 0 };
        if (direction === 'right') return { x: -distance, y: 0 };
        return { y: distance, x: 0 };
    };
    
    let p = getDirVals(dir, 300);

    if (anim === 'popOut') gsap.to(avatarElement, { scale: 0, duration: 0.4, ease: "back.in(1.7)", onComplete: hide });
    else if (anim === 'fade') gsap.to(avatarElement, { opacity: 0, duration: 0.4, onComplete: hide });
    else if (anim === 'spinOut') gsap.to(avatarElement, { scale: 0, rotation: 360, duration: 0.4, ease: "power2.in", onComplete: hide });
    else if (anim === 'zoomOut') gsap.to(avatarElement, { scale: 3, opacity: 0, duration: 0.4, ease: "power2.in", onComplete: hide });
    else if (anim === 'flipOut') gsap.to(avatarElement, { rotationY: 90, opacity: 0, duration: 0.4, ease: "back.in(1.4)", onComplete: hide });
    else if (anim === 'rollOut') gsap.to(avatarElement, { x: 300, rotation: 200, opacity: 0, duration: 0.4, ease: "power2.in", onComplete: hide });
    else if (anim === 'slide') gsap.to(avatarElement, { x: p.x * -1, y: p.y * -1, opacity: 0, duration: 0.5, ease: "power2.in", onComplete: hide });
    else if (anim === 'bounce') gsap.to(avatarElement, { x: p.x * -1, y: p.y * -1, opacity: 0, duration: 0.8, ease: "bounce.in", onComplete: hide });
    else if (anim === 'back') gsap.to(avatarElement, { x: p.x * -1, y: p.y * -1, opacity: 0, duration: 0.6, ease: "back.in(1.7)", onComplete: hide });
    else if (anim === 'slingshot') {
        gsap.to(avatarElement, { x: p.x * -1, y: p.y * -1, scale: 0.5, opacity: 0, duration: 0.7, ease: "elastic.in(1, 0.4)", onComplete: hide });
    }
    else hide();

    function hide() {
        avatarElement.style.display = 'none';
        avatarElement.style.opacity = '0';
        gsap.set(avatarElement, { scale: 1, x: 0, y: 0, scaleY: 1, rotation: 0, rotationY: 0 });
    }
}

// Animaciones loop GSAP
function triggerSpeakingGsap() {
    const anim = conf.animSpeaking || 'bounce_talk';
    const dir = conf.animDirection || 'vertical';
    if (speakingTween) speakingTween.kill();
    gsap.set(avatarElement, { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0 }); 

    const maxEx = conf.maxExaggeration !== undefined ? parseFloat(conf.maxExaggeration) : 1.0;
    const ex = (val, base = 0) => base + ((val - base) * maxEx);
    const exScale = (val) => 1 + ((val - 1) * maxEx);
    
    if (anim === 'bounce_talk') {
        speakingTween = gsap.to(avatarElement, dir === 'horizontal' ? { x: ex(20), duration: 0.15, yoyo: true, repeat: -1 } : { y: ex(-20), duration: 0.15, yoyo: true, repeat: -1 });
    } else if (anim === 'shake') {
        speakingTween = gsap.to(avatarElement, { rotation: ex(5), duration: 0.05, yoyo: true, repeat: -1 });
    } else if (anim === 'float') {
        speakingTween = gsap.to(avatarElement, dir === 'horizontal' ? { x: ex(15), duration: 0.4, yoyo: true, repeat: -1 } : { y: ex(-15), duration: 0.4, yoyo: true, repeat: -1 });
    } else if (anim === 'pulse') {
        speakingTween = gsap.to(avatarElement, { scale: exScale(1.05), duration: 0.2, yoyo: true, repeat: -1 });
    } else if (anim === 'wiggle') {
        speakingTween = gsap.to(avatarElement, { rotation: ex(6), duration: 0.08, yoyo: true, repeat: -1 });
    } else if (anim === 'jump') {
        speakingTween = gsap.to(avatarElement, dir === 'horizontal' ? { x: ex(-30), duration: 0.2, yoyo: true, repeat: -1, ease: "power1.inOut" } : { y: ex(-30), duration: 0.2, yoyo: true, repeat: -1, ease: "power1.inOut" });
    } else if (anim === 'stretch') {
        speakingTween = gsap.to(avatarElement, dir === 'horizontal' ? { scaleX: exScale(1.15), scaleY: exScale(0.95), duration: 0.15, yoyo: true, repeat: -1 } : { scaleY: exScale(1.15), scaleX: exScale(0.95), duration: 0.15, yoyo: true, repeat: -1 });
    } else if (anim === 'tada') {
        speakingTween = gsap.to(avatarElement, { scale: exScale(1.1), rotation: ex(5), duration: 0.15, yoyo: true, repeat: -1 });
    } else if (anim === 'rubberband') {
        speakingTween = gsap.to(avatarElement, dir === 'horizontal' ? { scaleX: exScale(1.25), scaleY: exScale(0.75), duration: 0.15, yoyo: true, repeat: -1 } : { scaleY: exScale(1.25), scaleX: exScale(0.75), duration: 0.15, yoyo: true, repeat: -1 });
    } else if (anim === 'heartbeat') {
        speakingTween = gsap.to(avatarElement, { scale: exScale(1.15), duration: 0.1, yoyo: true, repeat: -1 });
    } else if (anim === 'jello') {
        speakingTween = gsap.to(avatarElement, { rotation: ex(10), duration: 0.1, yoyo: true, repeat: -1 });
    } else if (anim === 'swing_hablando') {
        speakingTween = gsap.to(avatarElement, { rotation: ex(15), duration: 0.2, yoyo: true, repeat: -1 });
    } else if (anim === 'sine_wave') {
        speakingTween = gsap.to(avatarElement, dir === 'horizontal' ? { x: ex(25), ease: "sine.inOut", duration: 0.3, yoyo: true, repeat: -1 } : { y: ex(-25), ease: "sine.inOut", duration: 0.3, yoyo: true, repeat: -1 });
    } else if (anim === 'pendulum') {
        speakingTween = gsap.to(avatarElement, { rotation: ex(20), ease: "sine.inOut", duration: 0.25, yoyo: true, repeat: -1 });
    } else if (anim === 'tremble') {
        speakingTween = gsap.to(avatarElement, { x: ex(3), y: ex(-3), rotation: ex(2), duration: 0.03, yoyo: true, repeat: -1 });
    } else if (anim === 'squish') {
        speakingTween = gsap.to(avatarElement, { scaleX: exScale(1.3), scaleY: exScale(0.7), y: ex(10), duration: 0.08, yoyo: true, repeat: -1 });
    } else if (anim === 'orbit') {
        speakingTween = gsap.to(avatarElement, { rotation: ex(15), x: ex(10), y: ex(-10), ease: "none", duration: 0.1, yoyo: true, repeat: -1 });
    } else if (anim === 'breathe') {
        speakingTween = gsap.to(avatarElement, { scaleX: exScale(1.05), scaleY: exScale(1.05), ease: "sine.inOut", duration: 0.5, yoyo: true, repeat: -1 });
    } else if (anim === 'glitch') {
        speakingTween = gsap.to(avatarElement, { x: ex(15), skewX: ex(10), ease: "steps(2)", duration: 0.1, yoyo: true, repeat: -1 });
    }
}

function stopSpeakingGsap() {
    if (speakingTween) {
        speakingTween.kill();
        speakingTween = null;
    }
    gsap.to(avatarElement, { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, duration: 0.1 });
}

// Escuchar cambios de estado en discord (conectó, desconectó, mute, se muteó al servidor, etc)
socket.on('voice_state_update', (data) => {
    if (data.userId !== userId) return;
    
    if (data.isConnecting) {
        isMuted = data.mute;
        isDeafened = data.deaf;
        handleConnect();
    } else if (data.isDisconnecting) {
        isMuted = false;
        isDeafened = false;
        handleDisconnect();
    } else {
        isMuted = data.mute;
        isDeafened = data.deaf;
        updateImage();
        // Fallback: si de milagro el OBS cargó después, lo conectamos visualmente
        if (!isConnected) handleConnect();
    }
});

// Actualiza base state visual (Cuando Discord dice que comenzó a hablar de una)
socket.on('user_state', (data) => {
    if (data.userId !== userId || !isConnected) return;
    isSpeaking = data.speaking;
    if (!isSpeaking) isShouting = false;
    updateImage(); // pone cara Speaking o Muted (si está hablando pero muteado por servidor etc)

    // Si la física de Volumen (DB) está DESACTIVADA, usamos animaciones GSAP automáticas repetitivas
    if (conf.animUseDb === false) {
        if (isSpeaking) triggerSpeakingGsap();
        else stopSpeakingGsap();
    } else {
        // En caso que sí esté activada (Dinámico), el motor de físicas lo controla user_volume
        if (!isSpeaking) {
            gsap.to(avatarElement, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, duration: 0.2, overwrite: "auto" });
        }
    }
});

// Reactivo físico puro mezclado con propiedades de GSAP en tiempo real
socket.on('user_volume', (data) => {
    if (data.userId !== userId || !isConnected) return;
    
    const rms = data.rms; 
    const currentDbRaw = rms > 0 ? 20 * Math.log10(rms / 32768) : -100;
    
    const minDbGate = conf.minDbGate !== undefined ? conf.minDbGate : -40;
    const currentDb = currentDbRaw < minDbGate ? -100 : currentDbRaw;
    
    const maxDbStretch = conf.maxDbStretch !== undefined ? conf.maxDbStretch : -22;
    const maxDbShout = conf.maxDbShout !== undefined ? conf.maxDbShout : -15;
    const minDb = -60;
    
    let divider = (maxDbStretch - minDb);
    if (divider <= 0) divider = 0.1; // Seguridad matemática si el límite y el piso chocan
    let intensity = (currentDb - minDb) / divider;
    intensity = Math.max(0, Math.min(1, intensity)); // valor limitante de 0 a 1

    // Reemplazo visual a "Gritando" si se rebasa el umbral
    if (conf.enableShout !== false && isSpeaking && !isMuted && !isDeafened) {
        let shoutingNow = (currentDb >= maxDbShout);
        if (isShouting !== shoutingNow) {
            isShouting = shoutingNow;
            updateImage();
        }
    } else if (isShouting) {
        isShouting = false;
        updateImage();
    }

    // Solo aplicar físicas css si animUseDb está activo
    if (conf.animUseDb !== false && isSpeaking) {
        const anim = conf.animSpeaking || 'bounce_talk';
        const dir = conf.animDirection || 'vertical';
        const stretchEnabled = conf.animDbStretch !== false;
        
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

        const maxEx = conf.maxExaggeration !== undefined ? parseFloat(conf.maxExaggeration) : 1.0;
        if (maxEx !== 1.0) {
            p.x *= maxEx;
            p.y *= maxEx;
            p.rotation *= maxEx;
            if (p.scaleX !== 1) p.scaleX = 1 + ((p.scaleX - 1) * maxEx);
            if (p.scaleY !== 1) p.scaleY = 1 + ((p.scaleY - 1) * maxEx);
        }

        // Aplicamos la metamorfosis procedimental inmediatamente interponiéndonos sobre cualquier animación
        gsap.to(avatarElement, {
            ...p,
            duration: d,
            ease: "power1.out",
            overwrite: "auto"
        });
    }
    
    // Normalizador al silencio visual para suavizar aterrizajes en pausas cortas
    if (data.rms === 0 && conf.animUseDb !== false) {
        gsap.to(avatarElement, {
            x: 0,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            duration: 0.2, // suave regreso a piso con físicas
            ease: "power2.out",
            overwrite: "auto"
        });
    }
});

// Auto-Actualizar Configuración al guardar sin reiniciar OBS
socket.on('config_update', async (data) => {
    if (data.userId !== userId) return;
    
    await loadConfig();
    
    if (isConnected) {
        scheduleBlink();
        updateImage();
        applyDOMPaddingLayout();
        
        if (!isSpeaking) {
            gsap.to(avatarElement, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, duration: 0.2, overwrite: "auto" });
            stopSpeakingGsap(); 
        }
    }
});

// ==== MOTOR DE ANCLAJES Y MÁRGENES (SAFE ZONE) ====
function applyDOMPaddingLayout() {
    const pivot = conf.animPivot || '50% 100%';
    const safeZone = conf.animSafeZone !== undefined ? parseInt(conf.animSafeZone) : 0;
    
    const container = document.getElementById('avatar-container');
    const avatar = document.getElementById('avatar');
    
    let flexAlign = 'center';
    let flexJustify = 'center';
    const [px, py] = pivot.split(' ');
    
    let mx = safeZone, my = safeZone;
    if (px === '0%') { flexJustify = 'flex-start'; } 
    else if (px === '100%') { flexJustify = 'flex-end'; } 
    else { flexJustify = 'center'; mx = safeZone * 2; } 

    if (py === '0%') { flexAlign = 'flex-start'; } 
    else if (py === '100%') { flexAlign = 'flex-end'; } 
    else { flexAlign = 'center'; my = safeZone * 2; } 

    if (container) {
        container.style.alignItems = flexAlign;
        container.style.justifyContent = flexJustify;
    }

    // OBS Main Layout is completely natively driven by `calc` offsets resolving perfect bounding box logic
    avatar.style.boxSizing = 'border-box';
    avatar.style.padding = '0'; // Clean slate
    
    avatar.style.width = `calc(100% - ${mx}px)`;
    avatar.style.height = `calc(100% - ${my}px)`;
    
    avatar.style.backgroundOrigin = 'content-box';
    avatar.style.backgroundClip = 'content-box';
    avatar.style.backgroundPosition = pivot;
    avatar.style.transformOrigin = pivot;
    
    gsap.set(avatar, { transformOrigin: pivot });
}

window.addEventListener('resize', applyDOMPaddingLayout);
