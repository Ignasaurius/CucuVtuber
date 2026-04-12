const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, nativeImage } = require('electron');
const path = require('path');

let mainWindow;
let tray = null;

// Mapa de Macros guardados { "Shift+A": "profileId_123" }
let registeredMacros = {};

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 600,
        height: 700,
        backgroundColor: '#1e1f22',
        autoHideMenuBar: true,
        title: "Cucu Macro Desktop",
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');

    // Minimizar a la bandeja del sistema en vez de cerrar
    mainWindow.on('close', function (event) {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

function processMacroPress(shortcut) {
    if (mainWindow) {
        mainWindow.webContents.send('macro-triggered', shortcut);
    }
}

app.whenReady().then(() => {
    createWindow();

    // Configurar Bandeja de Sistema (System Tray) con icono estricto en disco local
    tray = new Tray(path.join(__dirname, 'icon.png'));
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Mostrar Aplicación', click: () => { mainWindow.show(); } },
        { label: 'Salir Totalmente', click: () => { 
            app.isQuitting = true; 
            app.quit(); 
        } }
    ]);
    
    tray.setToolTip('Cucu Macro Controller Activo');
    tray.setContextMenu(contextMenu);
    
    tray.on('double-click', () => { mainWindow.show(); });
});

// Registrar atajos que envía el HTML por IPC
ipcMain.on('register-macros', (event, macrosList) => {
    // macrosList -> array de strings formato Electron ["CommandOrControl+X", "Shift+Num1"]
    globalShortcut.unregisterAll(); 
    
    macrosList.forEach(shortcut => {
        try {
            globalShortcut.register(shortcut, () => {
                processMacroPress(shortcut);
            });
        } catch(e) {
            console.error("Fallo registrando macro:", shortcut);
        }
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
