import pydicom
import numpy as np
import matplotlib.pyplot as plt
from skimage import exposure 
from io import BytesIO
import base64
import sys

def create_dicom_preview(dicom_path):
    ds = pydicom.dcmread(dicom_path)
    pixel_data = ds.pixel_array
    
    # Apply rescale parameters if they exist
    if 'RescaleSlope' in ds:
        pixel_data = pixel_data * ds.RescaleSlope
    if 'RescaleIntercept' in ds:
        pixel_data = pixel_data + ds.RescaleIntercept
    
    # Normalize and convert to uint8
    pixel_data = exposure.rescale_intensity(pixel_data, out_range=(0, 255)).astype(np.uint8)
    
    # Create preview
    fig = plt.figure(figsize=(6, 6))
    plt.imshow(pixel_data, cmap='gray')
    plt.axis('off')
    
    buf = BytesIO()
    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight', pad_inches=0)
    buf.seek(0)
    plt.close()
    
    return base64.b64encode(buf.read()).decode('utf-8')

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: script.py <dicom_path>")
        sys.exit(1)
    
    print(create_dicom_preview(sys.argv[1]))