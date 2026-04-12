const { joinVoiceChannel, EndBehaviorType, getVoiceConnection } = require('@discordjs/voice');
const prism = require('prism-media');

const subscriptions = new Map();

function setupVoiceConnection(client, channel, io) {
    // Unirse al canal de voz de Discord
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: true,
    });

    // Detectar cuando alguien comienza a hablar
    connection.receiver.speaking.on('start', (userId) => {
        io.emit('user_state', { userId, speaking: true });

        // Si ya nos suscribimos a su audio, no lo duplicamos
        if (subscriptions.has(userId)) return;

        // Suscribirse a los paquetes de audio Opus del usuario de forma continua
        // Mantiene el stream vivo para prevenir cortes (clipping) al iniciar a hablar tras un largo silencio
        const opusStream = connection.receiver.subscribe(userId, {
            end: {
                behavior: EndBehaviorType.Manual,
            },
        });

        // Decodificar el paquet Opus en PCM para calcular el volumen analizando las ondas
        const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
        
        // Evita que la app crashee si llega un paquete de audio corrupto (muy común si entra/sale alguien)
        decoder.on('error', (err) => {
            // Ignorar en silencio paquetes Opus mal formados
        });

        opusStream.pipe(decoder);

        let lastEmit = 0;
        let inactivityTimer = null;

        decoder.on('data', (pcmChunk) => {
            // Si pasan 150ms sin recibir volumen (un silencio muy muy corto), reseteamos la escala del avatar a 1
            // Esto da el efecto de que el avatar "aterriza" entre palabras o al tomar aire.
            clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => {
                io.emit('user_volume', { userId, rms: 0 });
            }, 150);

            // Transformar la data en enteros de 16bits para leer la amplitud de la onda
            const data = new Int16Array(pcmChunk.buffer, pcmChunk.byteOffset, pcmChunk.byteLength / Int16Array.BYTES_PER_ELEMENT);
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
                sum += data[i] * data[i];
            }
            // Calcular el volumen actual (RMS)
            const rms = Math.sqrt(sum / data.length);
            
            // Limitamos a 20 FPS (1 envío / 50ms) para no sobrecargar el websocket
            const now = Date.now();
            if (now - lastEmit > 50) {
                io.emit('user_volume', { userId, rms });
                lastEmit = now;
            }
        });

        opusStream.on('error', err => {
            console.error(`[Error] Stream de audio (User ${userId}):`, err.message);
            subscriptions.delete(userId);
        });

        opusStream.on('end', () => {
            // El usuario hizo silencio por el tiempo definido, limpiamos variables
            subscriptions.delete(userId);
            io.emit('user_state', { userId, speaking: false });
            io.emit('user_volume', { userId, rms: 0 }); // resetear el volumen en pantalla
        });

        subscriptions.set(userId, opusStream);
    });

    // Detectar si Discord informa forzosamente que el usuario paró de hablar
    connection.receiver.speaking.on('end', (userId) => {
        io.emit('user_state', { userId, speaking: false });
        io.emit('user_volume', { userId, rms: 0 });
        // NOTE: No destruimos el stream aquí para mantener las cañas Opus calientes y no clippear la voz.
    });

    return connection;
}

function destroyVoiceConnection(guildId) {
    const connection = getVoiceConnection(guildId);
    if (connection) {
        connection.destroy();
    }
    // Purgar todos los receptores oxidados para evitar el leak de memoria del stream
    subscriptions.clear();
}

module.exports = { setupVoiceConnection, destroyVoiceConnection };
