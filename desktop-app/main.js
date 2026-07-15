const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');

// Geolocation: grant the permission when the web app requests it. NOTE: for coordinates to
// actually be returned in the packaged desktop app, Chromium's geolocation network service needs
// a Google API key — set it via the GOOGLE_API_KEY environment variable before launching. Without
// it, navigator.geolocation fails and (since login requires location) users can't sign in on desktop.
function enableGeolocation() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(true); // trusted local app — allow geolocation (and other) requests
  });
  session.defaultSession.setPermissionCheckHandler(() => true);
}

// Keep reference to prevent GC
let mainWindow;

// In dev, point ELECTRON_START_URL at the Vite dev server (http://localhost:5173) for hot reload.
// In production, load the built apps/web/dist/index.html directly from disk.
const devServerUrl = process.env.ELECTRON_START_URL;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: 'Surani and Sons',
    icon: path.join(__dirname, 'icons', 'icon-512.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // The app is loaded from file:// and talks to the local API at http://localhost:4000.
      // Disabling webSecurity lets those cross-origin (incl. credentialed) requests through — safe
      // here because the app only loads its own bundled files and calls the local API, nothing remote.
      webSecurity: false,
    },
    backgroundColor: '#134e4a',
    show: false, // show after ready-to-show
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    // In dev, apps/web/dist sits next to this file (see main.js's own dir); packaged builds place it
    // under resources/web via the "extraResources" config in package.json since electron-builder's
    // "files" option can't pull in a directory from outside the desktop-app project root.
    const webDistIndex = app.isPackaged
      ? path.join(process.resourcesPath, 'web', 'index.html')
      : path.join(__dirname, '..', 'apps', 'web', 'dist', 'index.html');
    mainWindow.loadFile(webDistIndex);
  }

  // Show only when fully loaded (avoids white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---- Application menu ----
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [
      { role: 'about' }, { type: 'separator' }, { role: 'quit' }
    ]}] : []),
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        ...(isMac ? [{ role: 'zoom' }] : [{ role: 'maximize' }]),
        { role: 'close' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  enableGeolocation();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
