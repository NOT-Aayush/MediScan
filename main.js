const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const database = require('./database');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

ipcMain.handle('select-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Medical Images', extensions: ['dcm', 'jpg', 'jpeg', 'png', 'bmp'] }
    ]
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const { execFile } = require('child_process');

ipcMain.handle('run-python', async (event, { imagePath, fatMin, fatMax, muscleMin, muscleMax, editedFatMask, editedMuscleMask }) => {
  const pythonPath = 'python3';
  const scriptPath = path.join(__dirname, 'process_image.py');

  // Validate and clean mask parameters
  const cleanFatMask = editedFatMask && editedFatMask.trim() !== '' ? editedFatMask : '';
  const cleanMuscleMask = editedMuscleMask && editedMuscleMask.trim() !== '' ? editedMuscleMask : '';

  return new Promise((resolve, reject) => {
    execFile(
      pythonPath, 
      [
        scriptPath, 
        imagePath, 
        fatMin.toString(), 
        fatMax.toString(), 
        muscleMin.toString(), 
        muscleMax.toString(),
        cleanFatMask,
        cleanMuscleMask
      ], 
      { maxBuffer: 1024 * 1024 * 10 }, 
      (error, stdout, stderr) => {
        if (error) {
          console.error('Python error:', error);
          reject(new Error('Python script failed'));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          console.error('JSON parse error:', e);
          reject(new Error('Invalid JSON from Python script'));
        }
      }
    );
  });
});

ipcMain.handle('preview-dicom', async (event, dicomPath) => {
  const pythonPath = 'python3';
  const scriptPath = path.join(__dirname, 'dicom_preview.py');
    
  return new Promise((resolve, reject) => {
    execFile(pythonPath, [scriptPath, dicomPath], (error, stdout) => {
      if (error) {
        console.error('Preview error:', error);
        reject(new Error('DICOM preview failed'));
        return;
      }
      resolve(stdout.trim());
    });
  });
});

ipcMain.handle('get-results', async () => {
  return await database.getResults();
});

ipcMain.handle('get-result', async (event, id) => {
  return await database.getResultById(id);
});

ipcMain.handle('delete-result', async (event, id) => {
  return await database.deleteResult(id);
});

ipcMain.handle('update-result-name', async (event, {id, newName}) => {
  return await database.updateResultName(id, newName);
});

ipcMain.handle('save-result', async (event, resultData) => {
  console.log('Received save request with data:', resultData);
  try {
    const id = await database.saveResult(resultData);
    console.log('Saved result with ID:', id);
    return id;
  } catch (error) {
    console.error('Error saving result:', error);
    throw error;
  }
});

const fs = require('fs');
const os = require('os');

// Temporary files directory
const tempDir = path.join(os.tmpdir(), 'MediScanTemp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Clean up temp files on app exit
app.on('will-quit', () => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.error('Error cleaning temp files:', error);
  }
});

ipcMain.handle('save-temp-file', async (event, file) => {
  const tempPath = path.join(tempDir, `temp_${Date.now()}_${file.name}`);
  await fs.promises.writeFile(tempPath, Buffer.from(await file.arrayBuffer()));
  return tempPath;
});

ipcMain.handle('get-script-path', () => {
  return path.join(__dirname, 'one_dicom_into_2.py');
});

ipcMain.handle('split-dicom', async (event, dicomPath) => {
  const pythonPath = 'python3';
  const scriptPath = path.join(__dirname, 'one_dicom_into_2.py');
  
  return new Promise((resolve, reject) => {
    execFile(
      pythonPath, 
      [scriptPath, dicomPath], 
      { maxBuffer: 1024 * 1024 * 10 }, 
      (error, stdout, stderr) => {
        if (error) {
          console.error('Split error:', error, stderr);
          reject(new Error(stderr || 'DICOM split failed'));
          return;
        }
        
        try {
          const result = JSON.parse(stdout);
          if (result.success) {
            resolve(result);
          } else {
            reject(new Error(result.error || 'DICOM split failed'));
          }
        } catch (e) {
          console.error('JSON parse error:', e);
          reject(new Error('Invalid JSON from DICOM split script'));
        }
      }
    );
  });
});