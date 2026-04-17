const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: () => ipcRenderer.invoke('select-file'),
  runPython: (imagePath, fatMin, fatMax, muscleMin, muscleMax, editedFatMask, editedMuscleMask) =>
    ipcRenderer.invoke('run-python', { imagePath, fatMin, fatMax, muscleMin, muscleMax, editedFatMask, editedMuscleMask }),
  previewDicom: (dicomPath) => ipcRenderer.invoke('preview-dicom', dicomPath),
  saveResult: (resultData) => ipcRenderer.invoke('save-result', resultData),
  getResults: () => ipcRenderer.invoke('get-results'),
  getResult: (id) => ipcRenderer.invoke('get-result', id),
  deleteResult: (id) => ipcRenderer.invoke('delete-result', id),
  updateResultName: (id, newName) => ipcRenderer.invoke('update-result-name', {id, newName}),
  reanalyzeImage: (base64, fatMin, fatMax, muscleMin, muscleMax) =>
    ipcRenderer.invoke('reanalyze-image', { base64, fatMin, fatMax, muscleMin, muscleMax }),
  saveTempFile: (file) => ipcRenderer.invoke('save-temp-file', file),
  saveTempImage: (base64Data) => ipcRenderer.invoke('save-temp-image', base64Data),
  reanalyzeWithMask: (params) => ipcRenderer.invoke('reanalyze-with-mask', params),
  updateResult: (id, resultData) => ipcRenderer.invoke('update-result', {id, resultData}),
  getScriptPath: () => ipcRenderer.invoke('get-script-path'),
  splitDicom: (dicomPath) => ipcRenderer.invoke('split-dicom', dicomPath) // Add this line
});