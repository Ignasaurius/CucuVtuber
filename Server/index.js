require('dotenv').config();
const { Client, GatewayIntentBits, MessageFlags } = require('discord.js');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const sharp = require('sharp');
const crypto = require('crypto');
const { setupVoiceConnection, destroyVoiceConnection } = require('./audioProcessor.js');

const app = express();
app.set('trust proxy', true); // Compatibilidad con Nginx / Cloudflare
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Redirigir el index (raíz) al panel de control automáticamente
app.get('/', (req, res) => res.redirect('/config.html'));

// Middleware para servir archivos estáticos (frontend)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Configuración de multer usando RAM, para pre-procesar imágenes antes de guardarlas a disco
const upload = multer({ storage: multer.memoryStorage() });

const DB_FILE = path.join(__dirname, 'database.json');
let userConfigs = {};
if (fs.existsSync(DB_FILE)) {
    try {
        userConfigs = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        // Migración automática a V6 (Multi-Perfiles)
        for (const [uid, cfg] of Object.entries(userConfigs)) {
            if (!cfg.profiles) {
                const backup = { ...cfg };
                for (let k in userConfigs[uid]) delete userConfigs[uid][k];
                userConfigs[uid].activeProfile = "default";
                userConfigs[uid].profiles = {
                    "default": { name: "Principal", ...backup }
                };
            }
        }
    } catch {
        userConfigs = {};
    }
}

let currentVoiceChannel = null;

// [Endpoint reescrito más abajo para Sanitización de Tokens]

// API: Obtener usuarios conectados al canal actual
app.get('/api/voice-users', async (req, res) => {
    if (!currentVoiceChannel) return res.json([]);
    try {
        const channel = await client.channels.fetch(currentVoiceChannel.id);
        const users = channel.members.filter(m => !m.user.bot).map(m => ({
            id: m.id,
            username: m.user.globalName || m.user.username,
            mute: m.voice.selfMute || m.voice.serverMute,
            deaf: m.voice.selfDeaf || m.voice.serverDeaf
        }));
        res.json(users);
    } catch (e) {
        res.json([]);
    }
});

// API: Configuración de Perfiles
app.get('/api/config', (req, res) => {
    // Sanitizar base de datos ocultando tokens en modo lista
    const safeConf = JSON.parse(JSON.stringify(userConfigs));
    for (const id in safeConf) delete safeConf[id].apiToken;
    res.json(safeConf);
});

app.get('/api/config/:userId', (req, res) => {
    const usr = JSON.parse(JSON.stringify(userConfigs[req.params.userId] || {}));
    delete usr.apiToken;
    res.json(usr);
});

// API: Guardar imágenes y config de un usuario o de uno de sus perfiles
app.post('/api/config', upload.fields([
    { name: 'idle', maxCount: 1 }, 
    { name: 'speaking', maxCount: 1 },
    { name: 'idleBlink', maxCount: 1 },
    { name: 'speakingBlink', maxCount: 1 },
    { name: 'shouting', maxCount: 1 },
    { name: 'muted', maxCount: 1 },
    { name: 'deafened', maxCount: 1 }
]), async (req, res) => {
    const { userId, profileId, profileName, makeActive } = req.body;
    if (!userId || !profileId) return res.status(400).json({ error: 'Faltan credenciales (userId / profileId)' });

    if (!userConfigs[userId]) userConfigs[userId] = { activeProfile: profileId, profiles: {} };
    if (!userConfigs[userId].profiles) userConfigs[userId].profiles = {};
    if (!userConfigs[userId].profiles[profileId]) userConfigs[userId].profiles[profileId] = { name: profileName || 'Nuevo Perfil' };

    const prof = userConfigs[userId].profiles[profileId];
    if (profileName) prof.name = profileName;

    const fields = ['idle', 'speaking', 'idleBlink', 'speakingBlink', 'shouting', 'muted', 'deafened'];
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    for (const field of fields) {
        if (req.body[`delete_${field}`] === 'true') {
            delete prof[field];
        }

        if (req.files[field] && req.files[field][0]) {
            const buffer = req.files[field][0].buffer;
            const filename = `${userId}_${profileId}_${field}.webp`;
            const filepath = path.join(uploadDir, filename);

            try {
                await sharp(buffer, { animated: true })
                    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
                    .webp({ effort: 4, quality: 80 })
                    .toFile(filepath);

                prof[field] = `/uploads/${filename}?t=${Date.now()}`;
            } catch (err) {
                console.error(`Error procesando subida de [${field}]:`, err.message);
            }
        }
    }

    // Save GSAP Anim Settings inside correct Profile
    if (req.body.animIntro !== undefined) prof.animIntro = req.body.animIntro;
    if (req.body.animOutro !== undefined) prof.animOutro = req.body.animOutro;
    if (req.body.animSpeaking !== undefined) prof.animSpeaking = req.body.animSpeaking;
    if (req.body.animPivot !== undefined) prof.animPivot = req.body.animPivot;
    if (req.body.animDirection !== undefined) prof.animDirection = req.body.animDirection;
    if (req.body.animSafeZone !== undefined) prof.animSafeZone = parseInt(req.body.animSafeZone);
    if (req.body.maxDbStretch !== undefined) prof.maxDbStretch = parseInt(req.body.maxDbStretch);
    if (req.body.maxDbShout !== undefined) prof.maxDbShout = parseInt(req.body.maxDbShout);
    if (req.body.minDbGate !== undefined) prof.minDbGate = parseInt(req.body.minDbGate);
    if (req.body.blinkInterval !== undefined) prof.blinkInterval = parseFloat(req.body.blinkInterval);
    if (req.body.blinkDuration !== undefined) prof.blinkDuration = parseFloat(req.body.blinkDuration);
    if (req.body.enableBlink !== undefined) prof.enableBlink = req.body.enableBlink === 'true';
    if (req.body.enableShout !== undefined) prof.enableShout = req.body.enableShout === 'true';
    if (req.body.animUseDb !== undefined) prof.animUseDb = req.body.animUseDb === 'true';
    if (req.body.animDbStretch !== undefined) prof.animDbStretch = req.body.animDbStretch === 'true';

    if (makeActive === 'true') {
        userConfigs[userId].activeProfile = profileId;
    }

    fs.writeFileSync(DB_FILE, JSON.stringify(userConfigs, null, 2));
    res.json({ success: true, config: userConfigs[userId] });

    // Emitir señal a los OBS conectados para que se recarguen visualmente al vuelo
    io.emit('config_update', { userId });
});

// API: Configuración de Perfiles
app.post('/api/config/delete-profile', express.json(), (req, res) => {
    const { userId, profileId } = req.body;
    if (!userConfigs[userId] || !userConfigs[userId].profiles[profileId]) return res.status(400).json({ error: 'Perfil no existe' });
    
    delete userConfigs[userId].profiles[profileId];
    fs.writeFileSync(DB_FILE, JSON.stringify(userConfigs, null, 2));
    res.json({ success: true, config: userConfigs[userId] });
});

// API: Generar Token Secreto para Macro
app.post('/api/config/token', express.json(), (req, res) => {
    const { userId } = req.body;
    if (!userConfigs[userId]) return res.status(400).json({ error: 'Usuario inexistente' });

    const token = crypto.randomBytes(8).toString('hex');
    userConfigs[userId].apiToken = token;
    fs.writeFileSync(DB_FILE, JSON.stringify(userConfigs, null, 2));

    res.json({ success: true, token });
});

// API: Login desde App de Escritorio usando solo Token
app.post('/api/config/login-token', express.json(), (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token missing' });

    for (const [uid, cfg] of Object.entries(userConfigs)) {
        if (cfg.apiToken === token) {
            const safeCfg = JSON.parse(JSON.stringify(cfg));
            delete safeCfg.apiToken;
            return res.json({ success: true, userId: uid, config: safeCfg });
        }
    }
    res.status(401).json({ error: 'Token no encontrado' });
});

// API: Instador de Macro (Escritorio Electron) SECURE
app.post('/api/macro/swap', express.json(), (req, res) => {
    const { profileId, token } = req.body;
    
    let foundUserId = null;
    for (const [uid, cfg] of Object.entries(userConfigs)) {
        if (cfg.apiToken && cfg.apiToken === token) {
            foundUserId = uid;
            break;
        }
    }
    
    if (!foundUserId) return res.status(401).json({ error: 'Acceso Denegado: API Token Inválido o Revocado' });
    if (!userConfigs[foundUserId].profiles[profileId]) return res.status(400).json({ error: 'Perfil inválido' });

    userConfigs[foundUserId].activeProfile = profileId;
    fs.writeFileSync(DB_FILE, JSON.stringify(userConfigs, null, 2));
    io.emit('config_update', { userId: foundUserId }); // Fuerza reload visual masivo
    res.json({ success: true, userId: foundUserId });
});

// === MÓDULO DE CLIENTE DISCORD DINÁMICO ===

const SYS_DB_FILE = path.join(__dirname, 'systemConfig.json');
let systemConfig = { discordToken: null };
if (fs.existsSync(SYS_DB_FILE)) {
    try { systemConfig = JSON.parse(fs.readFileSync(SYS_DB_FILE, 'utf8')); } catch(e) {}
}

let client = null;
let botStatus = 'offline';
let botTag = null;

// API: Check status
app.get('/api/bot/status', (req, res) => {
    res.json({ status: botStatus, botTag: botTag });
});

// API: Iniciar Login dinámico
app.post('/api/bot/login', express.json(), async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Falta Token' });
    
    if (botStatus === 'online' || botStatus === 'connecting') {
        return res.status(400).json({ error: 'El bot ya está corriendo' });
    }

    try {
        await initDiscordClient(token);
        
        // Guardar token por si se reinicia (Docker)
        systemConfig.discordToken = token;
        fs.writeFileSync(SYS_DB_FILE, JSON.stringify(systemConfig, null, 2));
        
        res.json({ success: true, botTag: botTag });
    } catch (e) {
        res.status(401).json({ error: 'Token inválido o cuenta baneada' });
    }
});

// API: Cerrar sesión
app.post('/api/bot/logout', express.json(), (req, res) => {
    if (client) {
        client.destroy();
        client = null;
    }
    botStatus = 'offline';
    botTag = null;
    systemConfig.discordToken = null;
    
    if (fs.existsSync(SYS_DB_FILE)) {
        fs.writeFileSync(SYS_DB_FILE, JSON.stringify(systemConfig, null, 2));
    }
    
    io.emit('bot_status_change', { status: 'offline' });
    res.json({ success: true });
});

// Envoltura de inicialización
async function initDiscordClient(token) {
    botStatus = 'connecting';
    io.emit('bot_status_change', { status: 'connecting' });
    
    if (client) { client.destroy(); }
    
    client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates
        ]
    });

    client.once('clientReady', async () => {
        botStatus = 'online';
        botTag = client.user.tag;
        console.log(`[Discord] Bot conectado como: ${botTag}`);
        
        io.emit('bot_status_change', { status: 'online', botTag: botTag });

        const data = [{ name: 'join', description: 'Únete a tu canal de voz actual' }];
        try {
            for (const guild of client.guilds.cache.values()) {
                await guild.commands.set(data).catch(() => {});
            }
        } catch (e) {}
    });

    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;
        if (interaction.commandName === 'join') {
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) return interaction.reply({ content: 'Debes unirte a un canal de voz primero para que yo pueda seguirte.', flags: [MessageFlags.Ephemeral] });
            
            try {
                destroyVoiceConnection(voiceChannel.guild.id);
                currentVoiceChannel = voiceChannel;
                setupVoiceConnection(client, voiceChannel, io);
                io.emit('bot_joined_channel');
                await interaction.reply({ content: `Unido al canal de voz: ${voiceChannel.name} 🎙️`, flags: [MessageFlags.Ephemeral] });
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'Error al intentar unirme al canal.', flags: [MessageFlags.Ephemeral] });
            }
        }
    });

    client.on('voiceStateUpdate', (oldState, newState) => {
        if (!currentVoiceChannel) return;
        if (newState.id === client.user.id && !newState.channelId) {
            currentVoiceChannel = null;
            return;
        }

        const isOurChannel = (newState.channelId === currentVoiceChannel.id) || (oldState.channelId === currentVoiceChannel.id);
        if (!isOurChannel) return;

        io.emit('voice_state_update', {
            userId: newState.id,
            channelId: newState.channelId,
            mute: newState.selfMute || newState.serverMute,
            deaf: newState.selfDeaf || newState.serverDeaf,
            isConnecting: newState.channelId === currentVoiceChannel.id && oldState.channelId !== currentVoiceChannel.id,
            isDisconnecting: newState.channelId !== currentVoiceChannel.id && oldState.channelId === currentVoiceChannel.id
        });
    });

    await client.login(token); // Dispara errores si el token es falso
}

// Iniciar Servidor
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================`);
    console.log(` Servidor web iniciado en el puerto ${PORT}`);
    console.log(` > Panel Config : http://localhost:${PORT}/config.html`);
    console.log(`========================================\n`);
    
    // Autostart from previous saved configuration or .env fallback
    const initToken = systemConfig.discordToken || process.env.DISCORD_TOKEN;
    if (initToken) {
        initDiscordClient(initToken).catch(err => {
            console.error("[Discord] Error auto-iniciando sesión (Token revocado o caducado).");
            systemConfig.discordToken = null;
            botStatus = 'offline';
        });
    } else {
        console.log("[Advertencia] Bot Fuera de Línea. Inserta tu Token desde el Panel Web.\n");
    }
});
