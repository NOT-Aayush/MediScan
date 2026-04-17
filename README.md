🧠 MediScan – Medical Imaging Analysis Tool
📌 Overview

MediScan is a cross-platform desktop application that processes medical images (DICOM and standard formats) to perform automated fat and muscle tissue segmentation using a multi-stage image processing pipeline.

It combines computer vision, medical imaging standards, and an interactive UI to enable efficient analysis and visualization of clinical data.

🚀 Features
📂 Multi-format Support
Handles DICOM, JPG, PNG, and BMP images
🧪 7-Stage Image Processing Pipeline
Includes:
DICOM parsing with rescale slope/intercept
Noise reduction (Non-Local Means denoising)
Thresholding (Otsu’s method)
Intensity-based segmentation
Bone exclusion & tissue isolation
📊 Automated Tissue Analysis
Extracts key metrics:
Fat area
Muscle area
Fat-to-muscle ratio
Intensity ranges
🖼️ Interactive Editing Tool
Region of Interest (ROI) selection
Canvas-based editing
Undo/Redo functionality
💾 Structured Data Storage
SQLite database storing:
10+ clinical parameters per scan
Associated processed images
📈 Visualization Outputs
Generates multiple processed views to improve interpretability
🛠️ Tech Stack
Frontend / Desktop UI: Electron.js
Backend Processing: Python
Computer Vision: OpenCV
Medical Imaging: pydicom
Data Handling: NumPy, scikit-image
Database: SQLite
🧩 System Architecture
[ User Interface (Electron) ]
            ↓
   Image Upload / Selection
            ↓
[ Python Processing Pipeline ]
   → Preprocessing
   → Segmentation
   → Feature Extraction
            ↓
[ SQLite Database ]
            ↓
   Results + Visualizations
            ↓
[ UI Display & Editing ]
📸 How It Works
User uploads a medical image (DICOM or standard format)
Image is passed to the Python processing pipeline
Segmentation identifies fat and muscle regions
Clinical metrics are calculated and stored
Results are displayed with interactive visualization tools
⚙️ Setup & Run
# Clone repository
git clone https://github.com/your-username/mediscan

# Install dependencies (frontend)
cd mediscan
npm install

# Run Electron app
npm start
# Install Python dependencies
pip install -r requirements.txt

# Run processing module (if separate)
python process_image.py
🎯 Use Cases
Medical imaging research
Educational tools for radiology
Prototype clinical analysis systems
Image segmentation experimentation
📌 Future Improvements
Real-time processing optimization
Cloud-based deployment
Advanced ML-based segmentation
Multi-user data management
⚠️ Disclaimer

This project is for educational and research purposes only and is not intended for clinical diagnosis.