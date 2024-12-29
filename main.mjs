// main.mjs
import { fileURLToPath } from 'url';
import fs from 'fs';
import scraperManager from './scrapers/scraperManager.js'; // 스크래퍼 매니저 (직접 구현/제공된 모듈)
import Store from 'electron-store';
import path from 'path';
import pkg from 'electron';
const { app, BrowserWindow, ipcMain, screen, globalShortcut, powerMonitor } =
  pkg;

const store = new Store();

// IPC: 렌더러가 토큰 저장을 요청
ipcMain.on('store-set-token', (event, token) => {
  console.log('[Main] store-set-token:', token);
  store.set('accessToken', token);
});

// IPC: 렌더러가 토큰 읽기를 요청
ipcMain.handle('store-get-token', (event) => {
  return store.get('accessToken');
});

//
// ──────────────────────────────────────────────────────────────────────────────
//  경로/환경 설정
// ──────────────────────────────────────────────────────────────────────────────
//
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEV_MODE = false; // 개발 모드 여부

// 로그 파일 경로
const logFilePath = path.join(app.getPath('userData'), 'app.log');

// 로그를 파일에 쓰는 함수
function writeLog(message) {
  const timestamp = new Date().toISOString();
  fs.appendFile(logFilePath, `[${timestamp}] ${message}\n`, (err) => {
    if (err) console.error('Failed to write log:', err);
  });
}

//
// ──────────────────────────────────────────────────────────────────────────────
//  메인 윈도우 생성 함수
// ──────────────────────────────────────────────────────────────────────────────
//
async function createWindow() {
  // 아래 스크래퍼 초기화 등은 기존 코드 유지

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // BrowserWindow 설정
  const mainWindow = new BrowserWindow({
    width,
    height,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // 스크래퍼 매니저 초기화 (Puppeteer나 Playwright 등 크롤링 툴 초기화)
  await scraperManager.initialize();

  if (DEV_MODE) {
    //   // 개발 모드: React Dev Server (localhost:3000)
    mainWindow.loadURL('http://localhost:3001');
  } else {
    // 프로덕션 모드: 빌드된 파일
    const indexPath = path.join(__dirname, 'build', 'index.html');
    console.log(indexPath);
    mainWindow.loadURL(`file://${indexPath}`);
    mainWindow.webContents.openDevTools(); //배포에서는 삭제
  }

  // 글로벌 단축키 (예: Ctrl+Shift+I) 등록 -> DevTools 토글
  const shortcut =
    process.platform === 'darwin' ? 'Cmd+Option+I' : 'Ctrl+Shift+I';
  globalShortcut.register(shortcut, () => {
    mainWindow.webContents.toggleDevTools();
  });

  // ──────────────────────────────────────────────
  //  [8] powerMonitor 이벤트 등록 (추가 부분)
  // ──────────────────────────────────────────────
  powerMonitor.on('resume', () => {
    console.log('[Main] System resumed from sleep');
    writeLog('[Main] System resumed from sleep');

    if (mainWindow && !mainWindow.isDestroyed()) {
      // 아직 mainWindow가 살아있다면 이벤트를 보냄
      mainWindow.webContents.send('system-resumed');
    } else {
      console.log('[Main] mainWindow was destroyed, cannot send event.');
    }
  });
}
//
// ──────────────────────────────────────────────────────────────────────────────
//  IPC 설정
// ──────────────────────────────────────────────────────────────────────────────
//

// preload.js에서 ipcRenderer.send('preload-loaded', ...) 시 수신
ipcMain.on('preload-loaded', (_event, message) => {
  console.log(`[Preload]: ${message}`);
  writeLog(`[Preload]: ${message}`);
});

// 렌더러에서 ipcRenderer.send('renderer-log', ...) 시 수신
ipcMain.on('renderer-log', (_event, message) => {
  console.log(`[Renderer Log]: ${message}`);
  writeLog(`[Renderer Log]: ${message}`);
});

// 스크래핑 호출을 받는 IPC 핸들러
ipcMain.handle('scrapeNow', async (_event, { hotelId, otaNames }) => {
  console.log('[Main] Received scrapeNow request:', hotelId, otaNames);
  writeLog(
    `[Main] Received scrapeNow request: hotelId=${hotelId}, otaNames=${otaNames}`
  );

  if (!otaNames || otaNames.length === 0) {
    writeLog('[Main] No OTA to scrape.');
    return { success: false, message: 'No OTA to scrape.' };
  }

  // 실제 크롤링/스크래핑 로직
  for (const ota of otaNames) {
    await scraperManager.scrapeNow(hotelId, ota);
    writeLog(`[Main] Scraped OTA: ${ota} for hotelId: ${hotelId}`);
  }

  return { success: true };
});

// ──────────────────────────────────────────────────────────────
// [추가] 브라우저 인스턴스 보장 IPC 핸들러 (scraperManager.ensureBrowser)
ipcMain.handle('scraperManagerEnsureBrowser', async () => {
  try {
    await scraperManager.ensureBrowser();
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// ──────────────────────────────────────────────────────────────────────────────
//  앱 실행 및 종료 핸들러
// ──────────────────────────────────────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', async () => {
  await scraperManager.stopAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});
