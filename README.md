# 🩺 MediScan

MediScan is a desktop medical imaging application built with Electron.js and Python that processes DICOM CT scans to estimate muscle and fat composition using classical image processing techniques.

The application provides an intuitive interface for loading CT images, segmenting anatomical regions, and visualizing body composition metrics.

---

## 📷 Screenshot

<p align="center">
  <img width="1913" height="1016" alt="image" src="https://github.com/user-attachments/assets/d8ab20d5-01e8-4279-9860-36425ffcf79f" />
</p>

---

## ✨ Features

- 📂 Import DICOM CT scans
- 🩻 Automatic DICOM image rendering
- 🧠 Muscle segmentation
- 🟡 Fat tissue segmentation
- 📊 Body composition analysis
- 🎨 Segmentation mask visualization
- ⚡ Desktop application built with Electron
- 💾 Local SQLite database support

---

## 🛠️ Tech Stack

### Desktop
- Electron.js
- HTML
- CSS
- JavaScript

### Image Processing
- Python
- OpenCV
- NumPy
- SciPy
- scikit-image
- pydicom
- Pillow

### Database
- SQLite

---

## Image Processing Pipeline

```
DICOM CT Scan
      │
      ▼
Load Image (pydicom)
      │
      ▼
Preprocessing
(Windowing & Normalization)
      │
      ▼
Noise Reduction
      │
      ▼
Thresholding
      │
      ▼
Morphological Operations
      │
      ▼
Connected Component Analysis
      │
      ▼
Muscle & Fat Segmentation
      │
      ▼
Area Calculation
      │
      ▼
Visualization
```

---

## Project Structure

```
MediScan
├── electron/
├── python/
│   ├── segmentation.py
│   ├── dicom_preview.py
│   └── utils.py
├── database/
└── README.md
```

---

## Core Libraries

- OpenCV
- pydicom
- NumPy
- SciPy
- scikit-image
- Pillow
- Electron.js

---

## What I Learned

This project helped me gain experience with:

- Medical image processing
- DICOM file handling
- Computer vision techniques
- Morphological image operations
- Electron desktop application development
- Python integration with Electron
- SQLite database management

---

## Future Improvements

- Deep Learning–based segmentation
- 3D CT volume visualization
- Automatic report generation
- PACS integration
- Multi-patient management
- Cross-platform installer

---

## Author

**Aayush Pandey**

Portfolio: https://aayushpandey.in
