import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ensurePreviewProxy,
  exportProject,
  generateThumbnail,
  generateWaveform,
  probeMedia,
} from './ffmpeg'
import { handleMediaRequest } from './mediaProtocol'
import { readProjectFile, writeProjectFile, type SavedProject } from './projectIo'
import type { ExportPlan } from './types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vidit-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
])

let mainWindow: BrowserWindow | null = null

function preloadPath() {
  const candidates = ['preload.cjs', 'preload.js', 'preload.mjs']
  for (const name of candidates) {
    const full = path.join(__dirname, name)
    if (fs.existsSync(full)) return full
  }
  return path.join(__dirname, 'preload.cjs')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#1a1b1e',
    title: 'Vidit',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  // Byte-range media server — required for scrubbing / random access
  protocol.handle('vidit-media', (request) => handleMediaRequest(request))

  ipcMain.handle('dialog:openMedia', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Media',
          extensions: [
            'mp4',
            'mov',
            'mkv',
            'webm',
            'avi',
            'm4v',
            'mp3',
            'wav',
            'aac',
            'm4a',
            'png',
            'jpg',
            'jpeg',
            'webp',
            'gif',
          ],
        },
      ],
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('dialog:saveExport', async (_e, defaultName: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultName,
      filters: [
        { name: 'MP4', extensions: ['mp4'] },
        { name: 'MOV', extensions: ['mov'] },
      ],
    })
    return result.canceled ? null : result.filePath ?? null
  })

  ipcMain.handle('dialog:saveProject', async (_e, defaultName: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultName,
      filters: [{ name: 'Vidit Project', extensions: ['vidit', 'json'] }],
    })
    return result.canceled ? null : result.filePath ?? null
  })

  ipcMain.handle('dialog:openProject', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [{ name: 'Vidit Project', extensions: ['vidit', 'json'] }],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('project:save', async (_e, filePath: string, project: SavedProject) => {
    await writeProjectFile(filePath, project)
  })

  ipcMain.handle('project:load', async (_e, filePath: string) => readProjectFile(filePath))

  ipcMain.handle('media:probe', async (_e, filePath: string) => probeMedia(filePath))
  ipcMain.handle('media:thumbnail', async (_e, filePath: string) => generateThumbnail(filePath))
  ipcMain.handle('media:waveform', async (_e, filePath: string) => generateWaveform(filePath))
  ipcMain.handle('media:previewProxy', async (_e, filePath: string) => ensurePreviewProxy(filePath))

  ipcMain.handle('export:run', async (event, plan: ExportPlan) => {
    await exportProject(plan, (p) => {
      event.sender.send('export:progress', p)
    })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
