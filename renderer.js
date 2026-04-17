
console.log('window.electronAPI =', window.electronAPI);
let currentResultId = null;
let currentResult = null;

let undoBtn = document.getElementById('undoBtn');
let redoBtn = document.getElementById('redoBtn');

let currentMaskImage = null;
let currentOriginalImage = null;
let currentMaskType = null; // 'fat' or 'muscle'
let currentEnlargedImage = null;
let isEditing = false;
let editHistory = [];
let historyIndex = -1;
let brushSize = 10; // Default eraser size

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

async function splitImageWithPolygon(imagePath, type) {
  try {
    showToast(`Preparing to split ${type} image...`);
    
    const result = await window.electronAPI.splitDicom(imagePath);
    
    if (!result || !result.success) {
      const errorMsg = result?.error || 'Invalid response from splitting script';
      throw new Error(errorMsg);
    }
    
    if (!result.selectedPath || !result.unselectedPath) {
      throw new Error('Missing output paths in response');
    }
    
    const previewElement = type === 'fat' ? fatPreview : musclePreview;
    const container = type === 'fat' ? fatPreviewContainer : musclePreviewContainer;
    
    // Update the image path to point to the selected image by default
    if (type === 'fat') {
      fatImagePath = result.selectedPath;
    } else {
      muscleImagePath = result.selectedPath;
    }
    
    // Show loading state
    previewElement.src = '';
    container.querySelector('.preview-loading')?.remove();
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'preview-loading';
    loadingDiv.innerHTML = '<div class="spinner"></div><p>Loading split images...</p>';
    container.appendChild(loadingDiv);
    
    try {
      const selectedPreviewData = await window.electronAPI.previewDicom(result.selectedPath);
      const unselectedPreviewData = await window.electronAPI.previewDicom(result.unselectedPath);
      
      const splitPreviewContainer = document.createElement('div');
      splitPreviewContainer.className = 'split-preview';
      splitPreviewContainer.style.display = 'flex';
      splitPreviewContainer.style.flexDirection = 'column';
      splitPreviewContainer.style.gap = '10px';
      splitPreviewContainer.style.marginBottom = '15px';
      
      // Create selected image preview
      const selectedImg = document.createElement('img');
      selectedImg.src = `data:image/png;base64,${selectedPreviewData}`;
      selectedImg.style.maxWidth = '100%';
      selectedImg.style.borderRadius = '6px';
      selectedImg.alt = 'Selected Area';
      
      // Create unselected image preview
      const unselectedImg = document.createElement('img');
      unselectedImg.src = `data:image/png;base64,${unselectedPreviewData}`;
      unselectedImg.style.maxWidth = '100%';
      unselectedImg.style.borderRadius = '6px';
      unselectedImg.alt = 'Unselected Area';
      
      // Add labels
      const selectedLabel = document.createElement('div');
      selectedLabel.textContent = 'Inner Area';
      selectedLabel.style.color = '#fff';
      selectedLabel.style.textAlign = 'center';
      
      const unselectedLabel = document.createElement('div');
      unselectedLabel.textContent = 'Outer Area';
      unselectedLabel.style.color = '#fff';
      unselectedLabel.style.textAlign = 'center';
      
      // Create containers for each image
      const selectedContainer = document.createElement('div');
      selectedContainer.className = 'split-image-container';
      selectedContainer.appendChild(selectedLabel);
      selectedContainer.appendChild(selectedImg);
      
      const unselectedContainer = document.createElement('div');
      unselectedContainer.className = 'split-image-container';
      unselectedContainer.appendChild(unselectedLabel);
      unselectedContainer.appendChild(unselectedImg);
      
      splitPreviewContainer.appendChild(selectedContainer);
      splitPreviewContainer.appendChild(unselectedContainer);
      
      // Replace the existing preview with our new container
      const existingPreview = container.querySelector('img');
      if (existingPreview) {
        existingPreview.replaceWith(splitPreviewContainer);
      } else {
        container.insertBefore(splitPreviewContainer, container.querySelector('.controls'));
      }
      
      // Update the image path to the selected area
      if (type === 'fat') {
        fatImagePath = result.selectedPath;
      } else {
        muscleImagePath = result.selectedPath;
      }
      
      showToast(`${type} image split successfully`);
      
      // Set up controls for the new split images
      setupImageControls(container, previewElement, type, updateSubmitButton);
    } catch (error) {
      console.error('Preview error:', error);
      previewElement.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23252525"/><text x="50" y="50" font-family="Arial" font-size="10" fill="white" text-anchor="middle">Split successful - preview unavailable</text></svg>';
    } finally {
      loadingDiv.remove();
    }
    
    return result;
  } catch (error) {
    showToast(`Failed to split ${type} image: ${error.message}`);
    console.error(`Split ${type} image error:`, error);
    throw error;
  }
}


document.addEventListener('DOMContentLoaded', () => {
  setupImageModal();

  
  
  document.addEventListener('click', function(e) {
    if (e.target && e.target.id === 'reanalyzeResultsBtn') {
      reanalyzeWithEditedMask();
    }
  });
  // Only set up these listeners if the elements exist
  const saveEditBtn = document.getElementById('saveEditBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');

    if (saveEditBtn && cancelEditBtn) {
        saveEditBtn.addEventListener('click', async function() {
          console.log('Save button clicked');
            if (!currentMaskImage || !currentResult) return;
            try {
    // Show loading state
    saveEditBtn.disabled = true;
    saveEditBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    // Convert mask to base64
    const maskDataUrl = currentMaskImage.toDataURL('image/png');
    const base64Data = maskDataUrl.split(',')[1];
    
    // Determine which image index to update based on mask type and analysis type
    let imageIndex;
    const isCombinedAnalysis = currentResult.red_min > 0 && currentResult.blue_min > 0;
    
    if (currentMaskType === 'fat') {
      imageIndex = isCombinedAnalysis ? 2 : 1; // Fat segmentation image
    } else {
      imageIndex = isCombinedAnalysis ? 4 : 
                  (currentResult.blue_min > 0 ? 1 : -1); // Muscle segmentation image
    }
    
    if (imageIndex === -1 || imageIndex >= currentResult.images.length) {
      throw new Error('Invalid image index for saving');
    }
    
    // Update the current result with the new mask
    const updatedImages = [...currentResult.images];
    updatedImages[imageIndex] = base64Data;
    
    // If this is a saved result, update it in the database
    if (currentResultId) {
      await window.electronAPI.updateResult(currentResultId, {
        ...currentResult,
        images: updatedImages
      });
    } else {
      // For unsaved results, just update the local state
      currentResult.images = updatedImages;
    }
    
    // Update the displayed image
    const imgElements = document.querySelectorAll('.result-container img');
    for (const img of imgElements) {
      if (img.alt.includes(currentMaskType === 'fat' ? 'Fat' : 'Muscle')) {
        img.src = maskDataUrl;
        break;
      }
    }
    
    showToast('Mask saved successfully');
    document.getElementById('imageModal').style.display = 'none';
    exitEditMode();
  } catch (error) {
    console.error('Error saving mask:', error);
    showToast('Failed to save mask: ' + error.message);
  } finally {
    saveEditBtn.disabled = false;
    saveEditBtn.innerHTML = '<i class="fas fa-save"></i> Save';
  }
        });

        cancelEditBtn.addEventListener('click', function() {
          console.log('Cancel button clicked');
            console.log('Canceling edit, restoring original mask');
            document.getElementById('imageModal').style.display = 'none';
            exitEditMode();
        });
    }
});

//Reanalysebtn
async function reanalyzeWithEditedMask() {
  console.log('Reanalyze button clicked');
  
  if (!currentResult) {
    showToast('No result to reanalyze');
    return;
  }

  try {
    document.getElementById('loading').style.display = 'block';
    
    // Get current thresholds from sliders
    const fatMin = parseFloat(document.getElementById('fatMinSlider').value);
    const fatMax = parseFloat(document.getElementById('fatMaxSlider').value);
    const muscleMin = parseFloat(document.getElementById('muscleMinSlider').value);
    const muscleMax = parseFloat(document.getElementById('muscleMaxSlider').value);
    
    // Get the edited masks if they exist
    let editedFatMask = null;
    let editedMuscleMask = null;
    
    // Always include the current edited masks in the reanalysis
    if (currentResult.images) {
      // For fat analysis, use the edited fat mask if available (image index 2 for combined, 1 for fat-only)
      const fatMaskIndex = (currentResult.red_min > 0 && currentResult.blue_min > 0) ? 2 : 1;
      if (currentResult.images.length > fatMaskIndex) {
        editedFatMask = `data:image/png;base64,${currentResult.images[fatMaskIndex]}`;
      }
      
      // For muscle analysis, use the edited muscle mask if available (image index 4 for combined, 1 for muscle-only)
      const muscleMaskIndex = (currentResult.red_min > 0 && currentResult.blue_min > 0) ? 4 : 1;
      if (currentResult.images.length > muscleMaskIndex) {
        editedMuscleMask = `data:image/png;base64,${currentResult.images[muscleMaskIndex]}`;
      }
    }
    
    // Determine if we're analyzing fat, muscle, or both
    const isFatAnalysis = fatMin > 0 || fatMax > 0;
    const isMuscleAnalysis = muscleMin > 0 || muscleMax > 0;
    
    // Get the original image path (either fat or muscle path)
    const imagePath = fatImagePath || muscleImagePath;
    
    // Re-run the analysis with current thresholds and edited masks
    const result = await window.electronAPI.runPython(
      imagePath,
      isFatAnalysis ? fatMin : 0,
      isFatAnalysis ? fatMax : 0,
      isMuscleAnalysis ? muscleMin : 0,
      isMuscleAnalysis ? muscleMax : 0,
      editedFatMask,
      editedMuscleMask
    );

    if (result) {
      // Create a new result object that preserves the existing images
      const updatedResult = {
        ...currentResult,
        fat_min: fatMin,
        fat_max: fatMax,
        muscle_min: muscleMin,
        muscle_max: muscleMax
      };
      
      // Only update the areas that were actually reanalyzed
      if (isFatAnalysis) {
        updatedResult.fat_area_mm2 = result.fat_area_mm2;
      }
      if (isMuscleAnalysis) {
        updatedResult.muscle_area_mm2 = result.muscle_area_mm2;
      }
      
      // Calculate ratio only if both fat and muscle were analyzed
      if (isFatAnalysis && isMuscleAnalysis) {
        updatedResult.fat_muscle_ratio = result.fat_muscle_ratio;
      }
      
      // Preserve all existing images - we don't want to overwrite edited ones
      updatedResult.images = [...currentResult.images];
      
      // Only update the histogram (index 0) and segmentation images if they exist
      if (result.images && result.images.length > 0) {
        // Always update histogram
        updatedResult.images[0] = result.images[0];
        
        // Update fat segmentation if fat was analyzed
        if (isFatAnalysis) {
          const fatSegIndex = (isFatAnalysis && isMuscleAnalysis) ? 2 : 1;
          if (result.images.length > fatSegIndex) {
            updatedResult.images[fatSegIndex] = result.images[fatSegIndex];
          }
        }
        
        // Update muscle segmentation if muscle was analyzed
        if (isMuscleAnalysis) {
          const muscleSegIndex = (isFatAnalysis && isMuscleAnalysis) ? 4 : 1;
          if (result.images.length > muscleSegIndex) {
            updatedResult.images[muscleSegIndex] = result.images[muscleSegIndex];
          }
        }
      }
      
      // Update the current result
      currentResult = updatedResult;
      
      // Update the display with new results
      updateResultsDisplay(currentResult);
      showToast('Reanalysis completed');
    }
  } catch (error) {
    console.error('Reanalysis error:', error);
    showToast('Reanalysis failed: ' + error.message);
  } finally {
    document.getElementById('loading').style.display = 'none';
  }
}


function exitEditMode() {
  isEditing = false;
  currentMaskImage = null;
  currentOriginalImage = null;
  editHistory = [];
  historyIndex = -1;
  
  const editCanvas = document.getElementById('editCanvas');
  const ctx = editCanvas.getContext('2d');
  ctx.clearRect(0, 0, editCanvas.width, editCanvas.height);
  editCanvas.style.display = 'none';
  
  const editorControls = document.getElementById('editorControls');
  editorControls.style.display = 'none';
  
  const modalImg = document.getElementById('modalImage');
  modalImg.style.display = 'block';
}
  
  // Tab switching between fat/muscle tabs
  const fatTabBtn = document.getElementById('fatTabBtn');
  const muscleTabBtn = document.getElementById('muscleTabBtn');
  const fatTab = document.getElementById('fatTab');
  const muscleTab = document.getElementById('muscleTab');

  fatTabBtn.addEventListener('click', () => {
    fatTabBtn.classList.add('active');
    muscleTabBtn.classList.remove('active');
    fatTab.classList.add('active');
    muscleTab.classList.remove('active');
  });

  muscleTabBtn.addEventListener('click', () => {
    muscleTabBtn.classList.add('active');
    fatTabBtn.classList.remove('active');
    muscleTab.classList.add('active');
    fatTab.classList.remove('active');
  });

  // File selection
  const selectFatFileBtn = document.getElementById('selectFatFileBtn');
  const selectMuscleFileBtn = document.getElementById('selectMuscleFileBtn');
  const fatPreview = document.getElementById('fatPreview');
  const musclePreview = document.getElementById('musclePreview');
  const fatPreviewContainer = document.getElementById('fatPreviewContainer');
  const musclePreviewContainer = document.getElementById('musclePreviewContainer');
  const submitBtn = document.getElementById('submitBtn');

  let fatImagePath = null;
  let muscleImagePath = null;

  async function handleFileSelection(type) {
  try {
    const path = await window.electronAPI.selectFile();
    if (!path) return;

    const previewElement = type === 'fat' ? fatPreview : musclePreview;
    const container = type === 'fat' ? fatPreviewContainer : musclePreviewContainer;

    if (type === 'fat') {
      fatImagePath = path;
    } else {
      muscleImagePath = path;
    }

    // Show loading state
    previewElement.src = '';
    container.style.display = 'block';
    container.querySelector('.preview-loading')?.remove();
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'preview-loading';
    loadingDiv.innerHTML = '<div class="spinner"></div><p>Loading preview...</p>';
    container.appendChild(loadingDiv);

    try {
      showToast(`Loading ${type} image...`);
      
      if (path.toLowerCase().endsWith('.dcm')) {
        const previewData = await window.electronAPI.previewDicom(path);
        previewElement.src = `data:image/png;base64,${previewData}`;
      } else {
        previewElement.src = `file://${path}`;
      }
      showToast(`${type} image loaded successfully`);
    } catch (error) {
      showToast(`Failed to load ${type} image preview`);
      console.error(`${type} preview error:`, error);
      previewElement.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23252525"/><text x="50" y="50" font-family="Arial" font-size="10" fill="white" text-anchor="middle">Preview Unavailable</text></svg>';
    }

    loadingDiv.remove();
    
    // Add split button along with remove button
    setupImageControls(container, previewElement, type, updateSubmitButton);
    updateSubmitButton();
  } catch (error) {
    showToast('File selection failed: ' + error.message);
    console.error('File selection error:', error);
  }
}

// Update the setupImageControls function (previously setupRemoveButton)
function setupImageControls(container, preview, type, callback) {
  // Clear existing controls
  container.querySelectorAll('.remove-btn, .split-btn, .remove-split-btn').forEach(btn => btn.remove());

  // Add remove button (top right)
  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.innerHTML = '<i class="fas fa-times"></i>';
  removeBtn.title = 'Remove all images';
  removeBtn.addEventListener('click', () => {
    if (type === 'fat') {
      fatImagePath = null;
    } else {
      muscleImagePath = null;
    }
    // Remove all preview images
    container.querySelectorAll('img').forEach(img => img.src = '');
    container.querySelector('.split-preview')?.remove();
    container.style.display = 'none';
    callback();
    clearResultsIfNeeded();
  });
  container.appendChild(removeBtn);

  // Add split button (only for DICOM images)
  if ((preview.src.includes('.dcm') || preview.src.includes('data:image/png;base64'))) {
    const splitBtn = document.createElement('button');
    splitBtn.className = 'split-btn';
    splitBtn.innerHTML = '<i class="fas fa-crop-alt"></i> Split Image';
    splitBtn.title = 'Split image into regions';
    splitBtn.style.background = '#ff9800';
    splitBtn.style.margin = '15px auto';
    splitBtn.style.display = 'block';

    splitBtn.addEventListener('click', async () => {
      try {
        splitBtn.disabled = true;
        splitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Splitting...';
        
        const imagePath = type === 'fat' ? fatImagePath : muscleImagePath;
        await splitImageWithPolygon(imagePath, type);
      } catch (error) {
        console.error('Split error:', error);
        showToast('Split failed: ' + error.message);
      } finally {
        splitBtn.disabled = false;
        splitBtn.innerHTML = '<i class="fas fa-crop-alt"></i> Split Image';
      }
    });
    
    // Insert the split button after the preview but before the sliders
    const controls = container.querySelector('.controls');
    if (controls) {
      container.insertBefore(splitBtn, controls);
    } else {
      container.appendChild(splitBtn);
    }
  }
  
 // Add individual remove buttons for split images if they exist
  const splitPreviews = container.querySelectorAll('.split-preview img');
  splitPreviews.forEach((img, index) => {
    const removeSplitBtn = document.createElement('button');
    removeSplitBtn.className = 'remove-split-btn';
    removeSplitBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeSplitBtn.title = 'Remove this image';
    removeSplitBtn.style.position = 'absolute';
    removeSplitBtn.style.top = '15px';
    removeSplitBtn.style.right = '15px';
    removeSplitBtn.style.background = '#f44336';
    removeSplitBtn.style.padding = '6px 12px';
    
    const imgContainer = img.parentNode;
    imgContainer.style.position = 'relative';
    imgContainer.appendChild(removeSplitBtn);
    
    removeSplitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Determine if this is the selected or unselected image
      const isSelected = img.alt.includes('Selected');
      
      // Get the path of the image we're keeping
      const keepingPath = isSelected ? 
        imgContainer.nextElementSibling?.querySelector('img')?.src.replace('data:image/png;base64,', '') : 
        imgContainer.previousElementSibling?.querySelector('img')?.src.replace('data:image/png;base64,', '');
      
      // Update the image path to point to the remaining image
      if (type === 'fat') {
        fatImagePath = keepingPath ? 
          fatImagePath.replace('_selected.dcm', '_unselected.dcm') : 
          null;
      } else {
        muscleImagePath = keepingPath ? 
          muscleImagePath.replace('_selected.dcm', '_unselected.dcm') : 
          null;
      }
      
      img.src = '';
      imgContainer.remove();
      
      // If this was the last split image, hide the container
      if (container.querySelectorAll('.split-preview img').length === 0) {
        container.style.display = 'none';
        if (type === 'fat') {
          fatImagePath = null;
        } else {
          muscleImagePath = null;
        }
        callback();
        clearResultsIfNeeded();
      } else {
        // If we still have one image left, update the submit button
        callback();
      }
    });
  });
}

  function setupRemoveButton(container, preview, type, callback) {
    const existingBtn = container.querySelector('.remove-btn');
    if (existingBtn) existingBtn.remove();

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeBtn.title = 'Remove image';
    removeBtn.addEventListener('click', () => {
      if (type === 'fat') {
        fatImagePath = null;
      } else {
        muscleImagePath = null;
      }

      preview.src = '';
      container.style.display = 'none';
      callback();
      clearResultsIfNeeded();
    });
    
    container.appendChild(removeBtn);
  }

  selectFatFileBtn.addEventListener('click', () => handleFileSelection('fat'));
  selectMuscleFileBtn.addEventListener('click', () => handleFileSelection('muscle'));

  function clearResultsIfNeeded() {
    const outputTab = document.getElementById('outputTab');
    if (outputTab.classList.contains('active')) {
      document.getElementById('homeTab').classList.add('active');
      document.getElementById('outputTab').classList.remove('active');
      document.getElementById('homeTabBtn').classList.add('active');
      document.getElementById('outputTabBtn').classList.remove('active');
      document.getElementById('outputImages').innerHTML = '';
      
      if (fatImagePath || muscleImagePath) {
        submitBtn.click();
      }
    }
  }

  function updateSubmitButton() {
    submitBtn.disabled = !(fatImagePath || muscleImagePath);
  }

  // Slider updates
  const fatMinSlider = document.getElementById('fatMinSlider');
  const fatMaxSlider = document.getElementById('fatMaxSlider');
  const muscleMinSlider = document.getElementById('muscleMinSlider');
  const muscleMaxSlider = document.getElementById('muscleMaxSlider');
  const fatMinValue = document.getElementById('fatMinValue');
  const fatMaxValue = document.getElementById('fatMaxValue');
  const muscleMinValue = document.getElementById('muscleMinValue');
  const muscleMaxValue = document.getElementById('muscleMaxValue');

  fatMinSlider.addEventListener('input', () => {
    const minValue = parseFloat(fatMinSlider.value);
    const maxValue = parseFloat(fatMaxSlider.value);
    
    if (minValue > maxValue) {
      fatMinSlider.value = maxValue;
    }
    
    fatMinValue.textContent = fatMinSlider.value;
  });

  fatMaxSlider.addEventListener('input', () => {
    const minValue = parseFloat(fatMinSlider.value);
    const maxValue = parseFloat(fatMaxSlider.value);
    
    if (maxValue < minValue) {
      fatMaxSlider.value = minValue;
    }
    
    fatMaxValue.textContent = fatMaxSlider.value;
  });

  muscleMinSlider.addEventListener('input', () => {
    const minValue = parseFloat(muscleMinSlider.value);
    const maxValue = parseFloat(muscleMaxSlider.value);
    
    if (minValue > maxValue) {
      muscleMinSlider.value = maxValue;
    }
    
    muscleMinValue.textContent = muscleMinSlider.value;
  });

  muscleMaxSlider.addEventListener('input', () => {
    const minValue = parseFloat(muscleMinSlider.value);
    const maxValue = parseFloat(muscleMaxSlider.value);
    
    if (maxValue < minValue) {
      muscleMaxSlider.value = minValue;
    }
    
    muscleMaxValue.textContent = muscleMaxSlider.value;
  });

  // Analysis submission
submitBtn.addEventListener('click', async () => {
  const loading = document.getElementById('loading');
  loading.style.display = 'block';
  submitBtn.disabled = true;

  try {
    let combinedResult = null;
    
    // Check if we have split images (both selected and unselected)
    const hasSplitFat = fatImagePath && fatImagePath.includes('_selected.dcm') && 
                      document.querySelector('#fatPreviewContainer .split-preview');
    const hasSplitMuscle = muscleImagePath && muscleImagePath.includes('_selected.dcm') && 
                          document.querySelector('#musclePreviewContainer .split-preview');

    if (hasSplitFat || hasSplitMuscle) {
      // Handle split images case
      const fatPaths = [];
      const musclePaths = [];
      
      if (hasSplitFat) {
        const selectedPath = fatImagePath;
        const unselectedPath = fatImagePath.replace('_selected.dcm', '_unselected.dcm');
        fatPaths.push(selectedPath, unselectedPath);
      }
      
      if (hasSplitMuscle) {
        const selectedPath = muscleImagePath;
        const unselectedPath = muscleImagePath.replace('_selected.dcm', '_unselected.dcm');
        musclePaths.push(selectedPath, unselectedPath);
      }
      
      // Run analysis on all paths
      const fatResults = await Promise.all(fatPaths.map(path => 
        window.electronAPI.runPython(
          path,
          parseFloat(fatMinSlider.value),
          parseFloat(fatMaxSlider.value),
          0, 0
        )
      ));
      
      const muscleResults = await Promise.all(musclePaths.map(path => 
        window.electronAPI.runPython(
          path,
          0, 0,
          parseFloat(muscleMinSlider.value),
          parseFloat(muscleMaxSlider.value)
        )
      ));
      
      // Combine results
      combinedResult = combineResults(fatResults, muscleResults);
    } else {
      // Original handling for non-split images
      if (fatImagePath && muscleImagePath && fatImagePath === muscleImagePath) {
        combinedResult = await window.electronAPI.runPython(
          fatImagePath,
          parseFloat(fatMinSlider.value),
          parseFloat(fatMaxSlider.value),
          parseFloat(muscleMinSlider.value),
          parseFloat(muscleMaxSlider.value)
        );
      } else {
        const fatResult = fatImagePath ? await window.electronAPI.runPython(
          fatImagePath,
          parseFloat(fatMinSlider.value),
          parseFloat(fatMaxSlider.value),
          0, 0
        ) : null;

        const muscleResult = muscleImagePath ? await window.electronAPI.runPython(
          muscleImagePath,
          0, 0,
          parseFloat(muscleMinSlider.value),
          parseFloat(muscleMaxSlider.value)
        ) : null;

        combinedResult = combineResults(fatResult ? [fatResult] : [], muscleResult ? [muscleResult] : []);
      }
    }

    if (combinedResult) {
      currentResultId = null;
      showResults(combinedResult);
    }
  } catch (error) {
    showToast('Analysis failed: ' + error.message);
    console.error('Analysis error:', error);
  } finally {
    loading.style.display = 'none';
    submitBtn.disabled = !(fatImagePath || muscleImagePath);
  }
});

// Helper function to combine multiple fat and muscle results
function combineResults(fatResults, muscleResults) {
  if (fatResults.length === 0 && muscleResults.length === 0) return null;
  
  const combined = {
    images: [],
    fat_area_mm2: 0,
    muscle_area_mm2: 0,
    fat_muscle_ratio: 0,
    red_min: parseFloat(fatMinSlider.value),
    red_max: parseFloat(fatMaxSlider.value),
    blue_min: parseFloat(muscleMinSlider.value),
    blue_max: parseFloat(muscleMaxSlider.value),
    warning: 'MEDICAL VALIDATION REQUIRED BEFORE CLINICAL USE'
  };
  
  // Process fat results
  fatResults.forEach(result => {
    if (result) {
      combined.fat_area_mm2 += result.fat_area_mm2 || 0;
      if (result.images) {
        // For the first fat result, add all its images
        if (fatResults.indexOf(result) === 0) {
          combined.images.push(...result.images);
        } else {
          // For subsequent fat results, only update the segmentation images
          if (result.images.length > 1) {
            // Update fat segmentation (index 1 for fat-only, index 2 for combined)
            const segIndex = muscleResults.length > 0 ? 2 : 1;
            if (combined.images.length > segIndex) {
              combined.images[segIndex] = result.images[1];
            }
          }
        }
      }
    }
  });
  
  // Process muscle results
  muscleResults.forEach(result => {
    if (result) {
      combined.muscle_area_mm2 += result.muscle_area_mm2 || 0;
      if (result.images) {
        // For the first muscle result, add all its images if no fat results exist
        if (muscleResults.indexOf(result) === 0 && fatResults.length === 0) {
          combined.images.push(...result.images);
        } else if (muscleResults.indexOf(result) === 0) {
          // For combined analysis, add muscle segmentation images at correct positions
          if (result.images.length > 1) {
            // Muscle segmentation is index 3 (histogram at 0, fat seg at 1-2)
            if (combined.images.length > 3) {
              combined.images[3] = result.images[1]; // Segmentation
              if (result.images.length > 2) {
                combined.images[4] = result.images[2]; // Muscle only
              }
            } else {
              // Add muscle images at correct positions
              while (combined.images.length < 3) {
                combined.images.push(null); // Pad if needed
              }
              combined.images.push(result.images[1]); // Segmentation
              if (result.images.length > 2) {
                combined.images.push(result.images[2]); // Muscle only
              }
            }
          }
        }
      }
    }
  });
  
  // Calculate ratio if both fat and muscle were analyzed
  if (combined.fat_area_mm2 > 0 && combined.muscle_area_mm2 > 0) {
    combined.fat_muscle_ratio = combined.fat_area_mm2 / combined.muscle_area_mm2;
  }
  
  // Clean up any null entries
  combined.images = combined.images.filter(img => img !== null);
  
  return combined;
}

  // Main tab switching
  document.getElementById('homeTabBtn').addEventListener('click', () => {
    document.getElementById('homeTab').classList.add('active');
    document.getElementById('outputTab').classList.remove('active');
    document.getElementById('historyTab').classList.remove('active');
    document.getElementById('homeTabBtn').classList.add('active');
    document.getElementById('outputTabBtn').classList.remove('active');
    document.getElementById('historyTabBtn').classList.remove('active');
  });

  document.getElementById('outputTabBtn').addEventListener('click', () => {
    document.getElementById('outputTab').classList.add('active');
    document.getElementById('homeTab').classList.remove('active');
    document.getElementById('historyTab').classList.remove('active');
    document.getElementById('outputTabBtn').classList.add('active');
    document.getElementById('homeTabBtn').classList.remove('active');
    document.getElementById('historyTabBtn').classList.remove('active');
  });

  document.getElementById('historyTabBtn').addEventListener('click', () => {
    document.getElementById('historyTab').classList.add('active');
    document.getElementById('homeTab').classList.remove('active');
    document.getElementById('outputTab').classList.remove('active');
    document.getElementById('historyTabBtn').classList.add('active');
    document.getElementById('homeTabBtn').classList.remove('active');
    document.getElementById('outputTabBtn').classList.remove('active');
    loadHistory();
  });


function showResults(result) {
  currentResult = result;
  const outputImages = document.getElementById('outputImages');
  outputImages.innerHTML = '';
  
  // Map database fields to expected names if this is a saved result
  if (result.fat_area !== undefined) {
    result = {
      ...result,
      fat_area_mm2: result.fat_area,
      muscle_area_mm2: result.muscle_area,
      fat_muscle_ratio: result.fat_muscle_ratio,
      red_min: result.fat_min,
      red_max: result.fat_max,
      blue_min: result.muscle_min,
      blue_max: result.muscle_max,
      warning: 'MEDICAL VALIDATION REQUIRED BEFORE CLINICAL USE'
    };
  }
  
  let title = 'Analysis Results';
  let analysisType = '';
  if (result.red_min > 0 && result.blue_min > 0) {
    title = 'Combined Fat & Muscle Analysis';
    analysisType = 'combined';
  } else if (result.red_min > 0) {
    title = 'Fat Analysis Results';
    analysisType = 'fat';
  } else if (result.blue_min > 0) {
    title = 'Muscle Analysis Results';
    analysisType = 'muscle';
  }
  
  // Add title
  const titleElement = document.createElement('h2');
  titleElement.textContent = title;
  titleElement.style.gridColumn = '1 / -1';
  outputImages.appendChild(titleElement);

  // Add quantitative results first
  const summary = document.createElement('div');
  summary.className = 'results-summary';
  summary.id = 'resultsSummary';
  
  let summaryText = '';
  if (analysisType === 'combined') {
    summaryText = `
      Fat Area: ${result.fat_area_mm2} mm²
      Muscle Area: ${result.muscle_area_mm2} mm²
      Fat/Muscle Ratio: ${result.fat_muscle_ratio}
    `;
  } else if (analysisType === 'fat') {
    summaryText = `Fat Area: ${result.fat_area_mm2} mm²`;
  } else if (analysisType === 'muscle') {
    summaryText = `Muscle Area: ${result.muscle_area_mm2} mm²`;
  }
  
  summary.innerHTML = `
    <h3>Quantitative Results</h3>
    <pre>${summaryText}</pre>
    <p style="color: #ff9800;">${result.warning}</p>
  `;
  outputImages.appendChild(summary);

  // Always show histogram first if available
  if (result.images && result.images.length > 0 && result.images[0]) {
    createImageResult(outputImages, 'Intensity Distribution', result.images[0]);
  }

  // Show fat results if available
  if (result.red_min > 0 && result.images && result.images.length > 1) {
    createImageResult(outputImages, 'Fat Segmentation', result.images[1]);
    if (result.images.length > 2) {
      createImageResult(outputImages, 'Fat Only', result.images[2]);
    }
  }

  // Show muscle results if available
  if (result.blue_min > 0) {
    const muscleStartIndex = (analysisType === 'combined') ? 3 : 1;
    if (result.images && result.images.length > muscleStartIndex) {
      createImageResult(outputImages, 'Muscle Segmentation', result.images[muscleStartIndex]);
      if (result.images.length > muscleStartIndex + 1) {
        createImageResult(outputImages, 'Muscle Only', result.images[muscleStartIndex + 1]);
      }
    }
  }

  // Only show save button for new results (not saved ones)
  if (!currentResultId) {
    const saveBtn = document.createElement('button');
    saveBtn.id = 'saveResultBtn';
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Results';
    saveBtn.addEventListener('click', () => saveCurrentResult());
    outputImages.appendChild(saveBtn);
  }

  // Add delete button only for saved results
  if (currentResultId) {
    const deleteBtn = document.createElement('button');
    deleteBtn.id = 'deleteResultBtn';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete Saved Result';
    deleteBtn.style.background = '#f44336';
    deleteBtn.addEventListener('click', () => {
      deleteResult(currentResultId);
      document.getElementById('homeTabBtn').click();
    });
    outputImages.appendChild(deleteBtn);
  }
  
  // Add download buttons
  addDownloadButtons();

  // Show output tab
  document.getElementById('outputTabBtn').style.display = 'block';
  document.getElementById('homeTab').classList.remove('active');
  document.getElementById('outputTab').classList.add('active');
  document.getElementById('homeTabBtn').classList.remove('active');
  document.getElementById('outputTabBtn').classList.add('active');
}

function createImageResult(container, title, imgData) {
    const resultDiv = document.createElement('div');
    resultDiv.className = 'result-container';
    
    const titleElement = document.createElement('h4');
    titleElement.textContent = title;
    resultDiv.appendChild(titleElement);
    
    const img = document.createElement('img');
    img.src = `data:image/png;base64,${imgData}`;
    img.alt = title;  // This is important for the update function to find the right image
    resultDiv.appendChild(img);
  
  // Add edit button for segmentation images
  if (title.includes('Segmentation')) {
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit Mask';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentEnlargedImage = img;
      const modal = document.getElementById('imageModal');
      const modalImg = document.getElementById('modalImage');
      modal.style.display = 'block';
      
      // Determine if this is fat or muscle segmentation
      currentMaskType = title.includes('Fat') ? 'fat' : 'muscle';
      
      // Load the original image and mask
      loadImageForEditing(img.src, currentMaskType);
    });
    resultDiv.appendChild(editBtn);
  }
  
  container.appendChild(resultDiv);
}

// Add this new function to load images for editing
async function loadImageForEditing(maskSrc, maskType) {
  const modal = document.getElementById('imageModal');
  const editorControls = document.getElementById('editorControls');
  const editCanvas = document.getElementById('editCanvas');
  
  // Show loading state
  editorControls.style.display = 'none';
  modal.querySelector('.modal-content').style.display = 'none';
  
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'preview-loading';
  loadingDiv.innerHTML = '<div class="spinner"></div><p>Preparing editor...</p>';
  modal.appendChild(loadingDiv);
  
  try {
    currentMaskType = maskType;
    
    // Create a canvas for editing
    currentMaskImage = document.createElement('canvas');
    const maskImg = new Image();
    maskImg.src = maskSrc;
    await new Promise((resolve) => {
      maskImg.onload = resolve;
    });
    
    currentMaskImage.width = maskImg.width;
    currentMaskImage.height = maskImg.height;
    const maskCtx = currentMaskImage.getContext('2d');
    maskCtx.drawImage(maskImg, 0, 0);
    
    // Set up edit canvas
    editCanvas.width = maskImg.width;
    editCanvas.height = maskImg.height;
    const ctx = editCanvas.getContext('2d');
    ctx.drawImage(maskImg, 0, 0);
    
    // Show editor controls
    loadingDiv.remove();
    editorControls.style.display = 'flex';
    editCanvas.style.display = 'block';
    
    // Initialize editing tools
    setupMaskEditing();
  } catch (error) {
    console.error('Error loading image for editing:', error);
    loadingDiv.remove();
    showToast(`Failed to prepare editor: ${error.message}`);
    modal.style.display = 'none';
    currentMaskImage = null;
  }
}

// Helper function to load an image
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

  // Main tab switching
document.getElementById('homeTabBtn').addEventListener('click', () => {
    document.getElementById('homeTab').classList.add('active');
    document.getElementById('outputTab').classList.remove('active');
    document.getElementById('historyTab').classList.remove('active');
    document.getElementById('homeTabBtn').classList.add('active');
    document.getElementById('outputTabBtn').classList.remove('active');
    document.getElementById('historyTabBtn').classList.remove('active');
  });

  document.getElementById('outputTabBtn').addEventListener('click', () => {
    document.getElementById('outputTab').classList.add('active');
    document.getElementById('homeTab').classList.remove('active');
    document.getElementById('historyTab').classList.remove('active');
    document.getElementById('outputTabBtn').classList.add('active');
    document.getElementById('homeTabBtn').classList.remove('active');
    document.getElementById('historyTabBtn').classList.remove('active');
  });

  document.getElementById('historyTabBtn').addEventListener('click', () => {
    document.getElementById('historyTab').classList.add('active');
    document.getElementById('homeTab').classList.remove('active');
    document.getElementById('outputTab').classList.remove('active');
    document.getElementById('historyTabBtn').classList.add('active');
    document.getElementById('homeTabBtn').classList.remove('active');
    document.getElementById('outputTabBtn').classList.remove('active');
    loadHistory();
  });

async function saveCurrentResult() {
  if (!currentResult) {
    showToast('No result to save');
    console.error('No currentResult available to save');
    return;
  }

  // Create or find the name input container
  let nameContainer = document.getElementById('saveNameContainer');
  if (!nameContainer) {
    nameContainer = document.createElement('div');
    nameContainer.id = 'saveNameContainer';
    nameContainer.style.margin = '20px auto';
    nameContainer.style.maxWidth = '500px';
    
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Result Name: ';
    nameLabel.style.marginRight = '10px';
    
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'resultNameInput';
    nameInput.style.flexGrow = '1';
    nameInput.style.padding = '8px';
    nameInput.style.borderRadius = '4px';
    nameInput.style.border = '1px solid #444';
    nameInput.style.backgroundColor = '#252525';
    nameInput.style.color = 'white';
    
    const defaultName = `Analysis_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
    nameInput.value = defaultName;
    nameInput.placeholder = 'Enter result name';
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Confirm Save';
    saveBtn.style.marginLeft = '10px';
    saveBtn.addEventListener('click', async () => {
      await performSave(nameInput.value || defaultName);
      nameContainer.remove();
    });
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.marginLeft = '10px';
    cancelBtn.style.background = '#f44336';
    cancelBtn.addEventListener('click', () => nameContainer.remove());
    
    nameContainer.appendChild(nameLabel);
    nameContainer.appendChild(nameInput);
    nameContainer.appendChild(saveBtn);
    nameContainer.appendChild(cancelBtn);
    
    // Insert after the save button
    const saveResultBtn = document.getElementById('saveResultBtn');
    saveResultBtn.insertAdjacentElement('afterend', nameContainer);
  }
  
  // Focus the input field
  document.getElementById('resultNameInput')?.focus();
}

async function performSave(name) {
  try {
    console.log('Preparing to save result:', currentResult);
    
    const resultData = {
      name,
      fat_area: currentResult.fat_area_mm2,
      muscle_area: currentResult.muscle_area_mm2,
      fat_muscle_ratio: currentResult.fat_muscle_ratio,
      fat_min: currentResult.red_min,
      fat_max: currentResult.red_max,
      muscle_min: currentResult.blue_min,
      muscle_max: currentResult.blue_max,
      images: currentResult.images
    };
    
    console.log('Saving result data:', resultData);
    
    currentResultId = await window.electronAPI.saveResult(resultData);
    showToast('Result saved successfully');
    
    loadHistory();
  } catch (error) {
    showToast('Failed to save result: ' + error.message);
    console.error('Save error details:', error);
  }
}

async function loadHistory() {
  const historyTab = document.getElementById('historyTab');
  const resultsList = historyTab.querySelector('.results-list');
  
  try {
    // Show loading state
    resultsList.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="spinner"></div><p>Loading results...</p></div>';
    
    const results = await window.electronAPI.getResults();
    
    if (!results) {
      throw new Error('No results returned from database');
    }
    
    if (results.length === 0) {
      resultsList.innerHTML = '<p style="text-align: center; color: #888;">No saved results yet</p>';
      return;
    }
    
    // Clear the list but keep the template
    const template = resultsList.querySelector('.result-item.template') || 
      document.createElement('div');
    resultsList.innerHTML = '';
    template.style.display = 'none';
    template.className = 'result-item template';
    resultsList.appendChild(template);
    
    // Sort by date (newest first) and create items
    results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
           .forEach(result => {
      const item = template.cloneNode(true);
      item.style.display = 'flex';
      item.dataset.id = result.id;
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'result-name';
      nameSpan.textContent = result.name;
      
      const dateSpan = document.createElement('span');
      dateSpan.className = 'result-date';
      dateSpan.textContent = new Date(result.created_at).toLocaleString();
      
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'result-actions';
      
      const renameBtn = document.createElement('button');
      renameBtn.className = 'rename-btn';
      renameBtn.innerHTML = '<i class="fas fa-edit"></i>';
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
      
      const viewBtn = document.createElement('button');
      viewBtn.className = 'view-btn';
      viewBtn.innerHTML = '<i class="fas fa-eye"></i> View';
      
      // Clear existing content and append new elements
      item.innerHTML = '';
      item.appendChild(nameSpan);
      item.appendChild(dateSpan);
      item.appendChild(actionsDiv);
      actionsDiv.appendChild(renameBtn);
      actionsDiv.appendChild(deleteBtn);
      actionsDiv.appendChild(viewBtn);
      
      // Set up event listeners
      viewBtn.addEventListener('click', () => viewSavedResult(result.id));
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteResult(result.id);
      });
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        renameResult(result.id, item);
      });
      
      resultsList.appendChild(item);
    });
  } catch (error) {
    console.error('History load error:', error);
    resultsList.innerHTML = `
      <div style="text-align: center; padding: 20px; color: #f44336;">
        <p>Error loading history</p>
        <p style="font-size: 0.8em; color: #888;">${error.message}</p>
      </div>
    `;
  }
}
async function viewSavedResult(id) {
  try {
    const result = await window.electronAPI.getResult(id);
    if (!result) {
      showToast('Result not found');
      return;
    }
    
    currentResultId = id;
    currentResult = result;
    showResults(result);
    
    document.getElementById('outputTab').classList.add('active');
    document.getElementById('homeTab').classList.remove('active');
    document.getElementById('outputTabBtn').classList.add('active');
    document.getElementById('homeTabBtn').classList.remove('active');
  } catch (error) {
    showToast('Error loading result: ' + error.message);
    console.error('View result error:', error);
  }
}

async function deleteResult(id) {
  if (!confirm('Are you sure you want to permanently delete this result?')) {
    return;
  }
  
  try {
    await window.electronAPI.deleteResult(id);
    showToast('Result deleted');
    
    if (currentResultId === id) {
      currentResultId = null;
      currentResult = null;
    }
    
    loadHistory();
    
    // If we're currently viewing the deleted result, go back to home
    if (document.getElementById('outputTab').classList.contains('active') && 
        currentResultId === null) {
      document.getElementById('homeTabBtn').click();
    }
  } catch (error) {
    showToast('Failed to delete result: ' + error.message);
    console.error('Delete error:', error);
  }
}

async function renameResult(id, item) {
  const nameElement = item.querySelector('.result-name');
  const currentName = nameElement.textContent;
  
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'editable-name';
  input.value = currentName;
  
  nameElement.textContent = '';
  nameElement.appendChild(input);
  input.focus();
  
  const saveName = async () => {
    const newName = input.value.trim();
    if (!newName || newName === currentName) {
      nameElement.textContent = currentName;
      return;
    }
    
    try {
      await window.electronAPI.updateResultName(id, newName);
      nameElement.textContent = newName;
      loadHistory();
      
      if (currentResultId === id) {
        currentResult.name = newName;
      }
    } catch (error) {
      console.error('Rename error:', error);
      nameElement.textContent = currentName;
      showToast('Failed to rename: ' + error.message);
    }
  };
  
  input.addEventListener('blur', saveName);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveName();
    if (e.key === 'Escape') nameElement.textContent = currentName;
  });
}

function addDownloadButtons() {
  const outputImages = document.getElementById('outputImages');
  if (!outputImages) return;
  
  const resultContainers = outputImages.querySelectorAll('.result-container');
  resultContainers.forEach(container => {
    // Skip if already has download button
    if (container.querySelector('.download-btn')) return;
    
    const img = container.querySelector('img');
    if (!img) return;
    
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'download-btn';
    downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download';
    
    downloadBtn.addEventListener('click', () => {
      const title = container.querySelector('h4')?.textContent || 'result';
      const filename = `${title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.png`;
      
      const link = document.createElement('a');
      link.href = img.src;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
    
    container.appendChild(downloadBtn);
  });
}
function setupImageModal() {
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImage');
  const closeBtn = document.querySelector('.close');

  // Click on image to enlarge
  document.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG' && !e.target.classList.contains('modal-content')) {
      currentEnlargedImage = e.target;
      modal.style.display = 'block';
      modalImg.src = e.target.src;
      
      // Hide editor controls for preview mode
      document.getElementById('editorControls').style.display = 'none';
      document.getElementById('editCanvas').style.display = 'none';
      isEditing = false;
    }
  });

  // Close modal
  closeBtn.onclick = function() {
    modal.style.display = 'none';
    if (isEditing) {
      exitEditMode();
    }
  };

  const eraserBtn = document.getElementById('eraserBtn');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const reanalyzeBtn = document.getElementById('reanalyzeBtn');
  const editCanvas = document.getElementById('editCanvas');
  const editorControls = document.getElementById('editorControls');

   // Brush size slider
  const brushSizeInput = document.getElementById('brushSize');
  const brushSizeValue = document.getElementById('brushSizeValue');
  
  brushSizeInput.addEventListener('input', function() {
    brushSize = parseInt(this.value);
    brushSizeValue.textContent = brushSize;
    updateCursor();
    
    if (currentMaskImage) {
      const maskCtx = currentMaskImage.getContext('2d');
      maskCtx.lineWidth = brushSize;
    }
  });

  // Undo button - reverts to previous state in edit history
undoBtn.onclick = function() {
  if (historyIndex > 0) {
    console.log('Undoing action, history index:', historyIndex);
    historyIndex--;
    const maskCtx = currentMaskImage.getContext('2d');
    maskCtx.putImageData(editHistory[historyIndex], 0, 0);
    redrawCanvas();
    updateButtonStates();
  }
};

redoBtn.onclick = function() {
  if (historyIndex < editHistory.length - 1) {
    console.log('Redoing action, history index:', historyIndex);
    historyIndex++;
    const maskCtx = currentMaskImage.getContext('2d');
    maskCtx.putImageData(editHistory[historyIndex], 0, 0);
    redrawCanvas();
    updateButtonStates();
  }
};
};


function setupMaskEditing() {
  const editCanvas = document.getElementById('editCanvas');
  const ctx = editCanvas.getContext('2d');
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  
  // Clear any existing event listeners
  editCanvas.onmousedown = null;
  editCanvas.onmousemove = null;
  editCanvas.onmouseup = null;
  editCanvas.onmouseleave = null;
  
  // Reset edit history
  editHistory = [];
  historyIndex = -1;
  
  // Save initial state
  saveState();
  
  // Update cursor immediately
  updateCursor();
  
  editCanvas.onmousedown = function(e) {
    isDrawing = true;
    const pos = getCanvasPosition(e);
    lastX = pos.x;
    lastY = pos.y;
    draw(pos.x, pos.y, true);
    saveState();
  };
  
  editCanvas.onmousemove = function(e) {
    if (!isDrawing) return;
    const pos = getCanvasPosition(e);
    draw(pos.x, pos.y, false);
    lastX = pos.x;
    lastY = pos.y;
  };
  
  editCanvas.onmouseup = function() {
    isDrawing = false;
    saveState();
  };
  
  editCanvas.onmouseleave = function() {
    isDrawing = false;
  };
  
  function getCanvasPosition(e) {
    const rect = editCanvas.getBoundingClientRect();
    const scaleX = editCanvas.width / rect.width;
    const scaleY = editCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }
  
  function draw(x, y, isStart) {
    const maskCtx = currentMaskImage.getContext('2d');
    maskCtx.lineJoin = 'round';
    maskCtx.lineCap = 'round';
    maskCtx.lineWidth = brushSize;
    maskCtx.globalCompositeOperation = 'destination-out';
    maskCtx.strokeStyle = 'rgba(0, 0, 0, 1)';
    
    if (isStart) {
      maskCtx.beginPath();
      maskCtx.moveTo(x, y);
      maskCtx.lineTo(x, y);
      maskCtx.stroke();
    } else {
      maskCtx.beginPath();
      maskCtx.moveTo(lastX, lastY);
      maskCtx.lineTo(x, y);
      maskCtx.stroke();
    }
    
    // Redraw the canvas to show changes
    redrawCanvas();
  }
}

function redrawCanvas() {
  const editCanvas = document.getElementById('editCanvas');
  const ctx = editCanvas.getContext('2d');
  
  // Clear canvas
  ctx.clearRect(0, 0, editCanvas.width, editCanvas.height);
  
  // Draw current mask
  ctx.drawImage(currentMaskImage, 0, 0, editCanvas.width, editCanvas.height);
  
  // Draw semi-transparent overlay
  ctx.globalAlpha = 0.4;
  if (currentMaskType === 'fat') {
    ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
  } else {
    ctx.fillStyle = 'rgba(0, 0, 255, 0.4)';
  }
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillRect(0, 0, editCanvas.width, editCanvas.height);
  
  // Reset composite operation for future drawing
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1.0;
}

// Update brush size in real-time
document.getElementById('brushSize').addEventListener('input', function() {
  brushSize = parseInt(this.value);
  document.getElementById('brushSizeValue').textContent = brushSize;
  updateCursor();
  
  // Update the mask context line width if currently drawing
  if (currentMaskImage) {
    const maskCtx = currentMaskImage.getContext('2d');
    maskCtx.lineWidth = brushSize;
  }
});

function updateCursor() {
  const editCanvas = document.getElementById('editCanvas');
  if (!editCanvas) return;
  
  // Calculate the actual size that will be visible (minimum 10px for visibility)
  const visibleSize = Math.max(10, brushSize * 2);
  
  // Create a more visible cursor with a circle that matches brush size
  editCanvas.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="${visibleSize}" height="${visibleSize}" viewBox="0 0 ${visibleSize} ${visibleSize}"><circle cx="${visibleSize/2}" cy="${visibleSize/2}" r="${brushSize}" fill="none" stroke="red" stroke-width="2"/></svg>') ${visibleSize/2} ${visibleSize/2}, crosshair`;
}


  
  function draw(e) {
    if (!isDrawing) return;
    
    const rect = editCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Draw on the mask image
    const maskCtx = currentMaskImage.getContext('2d');
    maskCtx.lineJoin = 'round';
    maskCtx.lineCap = 'round';
    maskCtx.lineWidth = brushSize;
    maskCtx.globalCompositeOperation = 'destination-out';
    maskCtx.strokeStyle = 'white';
    
    maskCtx.lineTo(x, y);
    maskCtx.stroke();
    maskCtx.beginPath();
    maskCtx.moveTo(x, y);
    
    // Redraw the canvas to show changes
    redrawCanvas();
  }
  
  function saveState() {
    // Save the current mask state for undo/redo
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = currentMaskImage.width;
    maskCanvas.height = currentMaskImage.height;
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.drawImage(currentMaskImage, 0, 0);
    
    // Only keep history up to current index
    if (historyIndex < editHistory.length - 1) {
      editHistory = editHistory.slice(0, historyIndex + 1);
    }
    
    editHistory.push(maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
    historyIndex = editHistory.length - 1;
    updateButtonStates();
  }
  
  function updateButtonStates() {
    // Disable undo when at beginning of history
    undoBtn.disabled = historyIndex <= 0;
    
    // Disable redo when at end of history
    redoBtn.disabled = historyIndex >= editHistory.length - 1;
  }
function updateResultsDisplay(result) {
  // Update quantitative results
  const summary = document.querySelector('.results-summary pre');
  if (summary) {
    let summaryText = '';
    if (result.fat_area_mm2 !== undefined) {
      summaryText += `Fat Area: ${result.fat_area_mm2} mm²\n`;
    }
    if (result.muscle_area_mm2 !== undefined) {
      summaryText += `Muscle Area: ${result.muscle_area_mm2} mm²\n`;
    }
    if (result.fat_muscle_ratio !== undefined) {
      summaryText += `Fat/Muscle Ratio: ${result.fat_muscle_ratio}`;
    }
    summary.textContent = summaryText.trim();
  }

  // Update histogram if available
  if (result.images && result.images[0]) {
    const histogramImg = document.querySelector('.result-container img[alt="Intensity Distribution"]');
    if (histogramImg) {
      histogramImg.src = `data:image/png;base64,${result.images[0]}`;
    }
  }

  // Update fat segmentation image if available and relevant
  if (result.fat_area_mm2 !== undefined && result.images) {
    const fatSegIndex = (result.muscle_area_mm2 !== undefined) ? 2 : 1;
    const fatSegImg = document.querySelector('.result-container img[alt="Fat Segmentation"]');
    if (fatSegImg && result.images.length > fatSegIndex) {
      fatSegImg.src = `data:image/png;base64,${result.images[fatSegIndex]}`;
    }
  }

  // Update muscle segmentation image if available and relevant
  if (result.muscle_area_mm2 !== undefined && result.images) {
    const muscleSegIndex = (result.fat_area_mm2 !== undefined) ? 4 : 1;
    const muscleSegImg = document.querySelector('.result-container img[alt="Muscle Segmentation"]');
    if (muscleSegImg && result.images.length > muscleSegIndex) {
      muscleSegImg.src = `data:image/png;base64,${result.images[muscleSegIndex]}`;
    }
  }
}