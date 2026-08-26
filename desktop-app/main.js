const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');

// Turn a WhatsApp web link (wa.me / *.whatsapp.com) into the desktop-app protocol, so the installed
// WhatsApp application opens instead of a browser tab. Returns null for any non-WhatsApp URL.
function toWhatsappProtocol(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    if (host === 'wa.me' || host === 'whatsapp.com' || host.endsWith('.whatsapp.com')) {
      let phone = u.pathname.replace(/\D/g, '');
      if (!phone) phone = (u.searchParams.get('phone') || '').replace(/\D/g, '');
      const text = u.searchParams.get('text') || '';
      const params = [];
      if (phone) params.push('phone=' + phone);
      if (text) params.push('text=' + encodeURIComponent(text));
      return 'whatsapp://send' + (params.length ? '?' + params.join('&') : '');
    }
  } catch (_) {
    /* not a parseable URL — fall through */
  }
  return null;
}

// Open a link OUTSIDE the app: WhatsApp links launch the installed WhatsApp app; everything else
// goes to the system default handler (browser, mail client, phone dialer).
function routeExternal(rawUrl) {
  if (!rawUrl) return;
  shell.openExternal(toWhatsappProtocol(rawUrl) || rawUrl);
}

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

// Applies to every window, including the child windows the app opens for PDFs and previews.
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    // Internal windows the app fills itself must open as real Electron windows so Chromium renders
    // them: the "Export PDF" print window (window.open('','_blank')) and the blob:/data: previews of
    // attached invoices, bills and TDS sheets. Everything else is a genuine external link.
    if (url === '' || url === 'about:blank' || url.startsWith('blob:') || url.startsWith('data:')) {
      return { action: 'allow' };
    }
    routeExternal(url);
    return { action: 'deny' };
  });
  // A helper window heading to an http(s) link (e.g. a pre-opened WhatsApp tab navigating to wa.me)
  // should leave the app too, then close itself. The main app lives on file:// and never navigates.
  contents.on('will-navigate', (event, url) => {
    if (/^https?:\/\//i.test(url)) {
      event.preventDefault();
      routeExternal(url);
      const win = BrowserWindow.fromWebContents(contents);
      if (win && win !== mainWindow) win.close();
    }
  });
});

app.whenReady().then(() => {
  // Windows needs a stable App User Model ID for the web page's Notifications to appear as toasts
  // (and to group the app on the taskbar). Must match the electron-builder appId.
  if (process.platform === 'win32') app.setAppUserModelId('com.suraniandsons.stockmanager');
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
