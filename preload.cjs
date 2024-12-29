// preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] preload.js loaded');

// ─────────────────────────────────────────────────────────────
//  window.Electron 객체로 노출
// ─────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('Electron', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  // 1) Scrape 함수
  scrapeNow: (hotelId, otaNames) =>
    ipcRenderer.invoke('scrapeNow', { hotelId, otaNames }),

  // 2) 로그 함수
  log: (message) => ipcRenderer.send('renderer-log', message),

  // 3) 간단한 테스트 함수
  test: () => 'Test 성공',

  // 4) 환경 변수
  env: {
    NODE_ENV: process.env.NODE_ENV || 'production',
  },

  ensureBrowser: () => ipcRenderer.invoke('scraperManagerEnsureBrowser'),
});

contextBridge.exposeInMainWorld('electronStore', {
  setToken: (token) => ipcRenderer.send('store-set-token', token),
  getToken: async () => {
    const val = await ipcRenderer.invoke('store-get-token');
    return val;
  },
});

// 안전하게 필요한 API들만 노출
contextBridge.exposeInMainWorld('electronAPI', {
  sendLog: (msg) => ipcRenderer.send('renderer-log', msg),
  onSystemResumed: (callback) => {
    ipcRenderer.on('system-resumed', callback);
  },
  // ... etc
});

// preload가 로드됐음을 알리는 이벤트 (main.js가 이걸 받고 로그)
ipcRenderer.send('preload-loaded', 'Preload script loaded');
