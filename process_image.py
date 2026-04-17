import pydicom
import numpy as np
import matplotlib.pyplot as plt
from skimage import exposure, morphology, measure, filters, restoration
from scipy.ndimage import distance_transform_edt
import sys, json
import base64
from io import BytesIO
import imageio.v3 as iio
import os
from PIL import Image

def get_user_ranges():
    """Get user input for red and blue value ranges."""
    print("Please enter the range values for tissue segmentation:")
    try:
        red_min = float(input("Enter minimum value for red (fat) [0.0-1.0]: "))
        red_max = float(input("Enter maximum value for red (fat) [0.0-1.0]: "))
        blue_min = float(input("Enter minimum value for blue (muscle) [0.0-1.0]: "))
        blue_max = float(input("Enter maximum value for blue (muscle) [0.0-1.0]: "))
        
        # Validate input ranges
        if not (0 <= red_min <= 1 and 0 <= red_max <= 1 and
                0 <= blue_min <= 1 and 0 <= blue_max <= 1):
            raise ValueError("Values must be between 0.0 and 1.0")
            
        return red_min, red_max, blue_min, blue_max
    except ValueError as e:
        print(f"Invalid input: {e}")
        return get_user_ranges()

def process_belly_mri(dicom_path, red_min, red_max, blue_min, blue_max, edited_fat_mask=None, edited_muscle_mask=None):
    """Process abdominal MRI DICOM to segment fat/muscle, calculate areas and ratio."""
    # Get user-defined ranges
    
    # --- 1. Load and Prepare DICOM ---
    ds = pydicom.dcmread(dicom_path)
    pixel_data = ds.pixel_array.astype(np.float32)
    
    # Apply rescale parameters
    slope = ds.get('RescaleSlope', 1.0)
    intercept = ds.get('RescaleIntercept', 0.0)
    pixel_data = pixel_data * slope + intercept
    
    # Get pixel spacing
    pixel_spacing = ds.PixelSpacing if 'PixelSpacing' in ds else [1.0, 1.0]
    pixel_area = float(pixel_spacing[0]) * float(pixel_spacing[1])  # mm²
    
    # --- 2. Preprocessing ---
    # Create body mask
    body_mask = pixel_data > filters.threshold_otsu(pixel_data)
    body_mask = morphology.binary_closing(body_mask, morphology.disk(5))
    
    # Denoise with Non-Local Means
    denoised = restoration.denoise_nl_means(pixel_data, patch_size=5, patch_distance=3)
    
    # Normalize intensities
    normalized = exposure.rescale_intensity(denoised, in_range='image', out_range=(0, 1))
    
    # --- 3. Tissue Segmentation ---
    # Fat detection using user-defined range
    fat_mask = (normalized >= red_min) & (normalized <= red_max) & body_mask
    
    # Muscle detection using user-defined range
    muscle_mask = (normalized >= blue_min) & (normalized <= blue_max) & body_mask
    
     #Only perform fat detection if fat thresholds are provided
    fat_mask = np.zeros_like(normalized, dtype=bool)
    if red_min > 0 or red_max > 0:
        fat_mask = (normalized >= red_min) & (normalized <= red_max) & body_mask
        if edited_fat_mask and edited_fat_mask.strip():
            try:
                edited_fat_mask = decode_mask(edited_fat_mask)
                if edited_fat_mask.shape == pixel_data.shape:
                    fat_mask = edited_fat_mask
            except Exception as e:
                print(f"Error applying edited fat mask: {e}")

    # Only perform muscle detection if muscle thresholds are provided
    muscle_mask = np.zeros_like(normalized, dtype=bool)
    if blue_min > 0 or blue_max > 0:
        muscle_mask = (normalized >= blue_min) & (normalized <= blue_max) & body_mask
        if edited_muscle_mask and edited_muscle_mask.strip():
            try:
                edited_muscle_mask = decode_mask(edited_muscle_mask)
                if edited_muscle_mask.shape == pixel_data.shape:
                    muscle_mask = edited_muscle_mask
            except Exception as e:
                print(f"Error applying edited muscle mask: {e}")
    
    # --- 4. Exclude Non-Target Tissues ---
    # Remove bones (dark regions)
    bone_mask = normalized < np.percentile(normalized[body_mask], 10)
    fat_mask &= ~bone_mask
    muscle_mask &= ~bone_mask

    # --- 5. Post-processing ---
    # Subcutaneous fat refinement
    distance_from_edge = distance_transform_edt(body_mask)
    fat_mask &= (distance_from_edge <= 30)
    
    # Muscle cleanup
    muscle_mask = morphology.binary_opening(muscle_mask, morphology.disk(3))
    
    # Remove small regions
    def filter_regions(mask):
        labeled = measure.label(mask)
        regions = measure.regionprops(labeled)
        valid_labels = [r.label for r in regions if r.area >= 50]
        return np.isin(labeled, valid_labels)
    
    fat_mask = filter_regions(fat_mask)
    muscle_mask = filter_regions(muscle_mask)
    
    # --- 6. Calculations ---
    fat_area = np.sum(fat_mask) * pixel_area
    muscle_area = np.sum(muscle_mask) * pixel_area
    fat_muscle_ratio = fat_area / muscle_area if muscle_area != 0 else None

    # --- 7. Visualization ---
    # Create base image for visualization
    base = exposure.rescale_intensity(normalized, out_range=(0, 1))
    combined_rgb = np.stack([base, base, base], axis=-1)
    
    # Only apply colors if the corresponding ranges are not zero
    if red_min != 0 or red_max != 0:
        combined_rgb[fat_mask] = [1.0, 0.0, 0.0]
    if blue_min != 0 or blue_max != 0:
        combined_rgb[muscle_mask] = [0.0, 0.0, 1.0]
    
    buffers = []

    # Intensity Histogram (always show)
    fig = plt.figure(figsize=(8, 8))
    plt.hist(normalized[body_mask].flatten(), bins=100, color='gray')
    if red_min != 0 or red_max != 0:
        plt.axvline(red_min, color='red', linestyle='--', label='Fat Min')
        plt.axvline(red_max, color='red', linestyle='--', label='Fat Max')
    if blue_min != 0 or blue_max != 0:
        plt.axvline(blue_min, color='blue', linestyle='--', label='Muscle Min')
        plt.axvline(blue_max, color='blue', linestyle='--', label='Muscle Max')
    plt.title('Intensity Distribution')
    plt.legend()
    buf = BytesIO()
    plt.savefig(buf, format='png', dpi=150)
    buf.seek(0)
    buffers.append(base64.b64encode(buf.read()).decode('utf-8'))
    plt.close()

    # Fat Only (only if fat is analyzed)
    if red_min != 0 or red_max != 0:
        # Fat on original image
        fig = plt.figure(figsize=(8, 8))
        fat_rgb = np.stack([base, base, base], axis=-1).astype(np.float32)
        fat_rgb[fat_mask] = [1, 0, 0]
        plt.imshow(fat_rgb)
        plt.title('Fat Segmentation')
        plt.text(0.05, 0.95, f"Fat Area: {fat_area:.2f} mm²", transform=plt.gca().transAxes,
                fontsize=10, color='white', verticalalignment='top',
                bbox=dict(facecolor='black', alpha=0.5))
        buf = BytesIO()
        plt.savefig(buf, format='png', dpi=150)
        buf.seek(0)
        buffers.append(base64.b64encode(buf.read()).decode('utf-8'))
        plt.close()
        
        # Fat only (no base image)
        fig = plt.figure(figsize=(8, 8))
        fat_only = np.zeros_like(combined_rgb)
        fat_only[fat_mask] = [1, 0, 0]
        plt.imshow(fat_only)
        plt.title('Fat Only')
        buf = BytesIO()
        plt.savefig(buf, format='png', dpi=150)
        buf.seek(0)
        buffers.append(base64.b64encode(buf.read()).decode('utf-8'))
        plt.close()

    # Muscle Only (only if muscle is analyzed)
    if blue_min != 0 or blue_max != 0:
        # Muscle on original image
        fig = plt.figure(figsize=(8, 8))
        muscle_rgb = np.stack([base, base, base], axis=-1).astype(np.float32)
        muscle_rgb[muscle_mask] = [0, 0, 1]
        plt.imshow(muscle_rgb)
        plt.title('Muscle Segmentation')
        plt.text(0.05, 0.95, f"Muscle Area: {muscle_area:.2f} mm²", transform=plt.gca().transAxes,
                fontsize=10, color='white', verticalalignment='top',
                bbox=dict(facecolor='black', alpha=0.5))
        buf = BytesIO()
        plt.savefig(buf, format='png', dpi=150)
        buf.seek(0)
        buffers.append(base64.b64encode(buf.read()).decode('utf-8'))
        plt.close()
        
        # Muscle only (no base image)
        fig = plt.figure(figsize=(8, 8))
        muscle_only = np.zeros_like(combined_rgb)
        muscle_only[muscle_mask] = [0, 0, 1]
        plt.imshow(muscle_only)
        plt.title('Muscle Only')
        buf = BytesIO()
        plt.savefig(buf, format='png', dpi=150)
        buf.seek(0)
        buffers.append(base64.b64encode(buf.read()).decode('utf-8'))
        plt.close()

    # Replace the return statement with this:
    return {
        'images': buffers,
        'fat_area_mm2': round(fat_area, 2),
        'muscle_area_mm2': round(muscle_area, 2),
        'fat_muscle_ratio': round(fat_muscle_ratio, 2) if fat_muscle_ratio is not None else None,
        'red_min': red_min,
        'red_max': red_max,
        'blue_min': blue_min,
        'blue_max': blue_max,
        'warning': 'MEDICAL VALIDATION REQUIRED BEFORE CLINICAL USE'
    }
def decode_mask(mask_data_url):
    """Convert base64 mask data URL to binary mask."""
    # Remove the data URL prefix
    if mask_data_url.startswith('data:image/png;base64,'):
        mask_data_url = mask_data_url[len('data:image/png;base64,'):]
    
    # Decode base64 and open as image
    mask_bytes = base64.b64decode(mask_data_url)
    mask_img = Image.open(BytesIO(mask_bytes))
    
    # Convert to grayscale numpy array
    mask_array = np.array(mask_img.convert('L'))
    
    # Threshold to create binary mask
    return mask_array > 128

if __name__ == "__main__":
    if len(sys.argv) < 6:
        print("Usage: script.py <path> <red_min> <red_max> <blue_min> <blue_max> [<edited_fat_mask> <edited_muscle_mask>]")
        sys.exit(1)

    dicom_path = sys.argv[1]
    red_min = float(sys.argv[2])
    red_max = float(sys.argv[3])
    blue_min = float(sys.argv[4])
    blue_max = float(sys.argv[5])
    
    # Get optional mask arguments if provided
    edited_fat_mask = sys.argv[6] if len(sys.argv) > 6 else None
    edited_muscle_mask = sys.argv[7] if len(sys.argv) > 7 else None

    result = process_belly_mri(dicom_path, red_min, red_max, blue_min, blue_max, 
                             edited_fat_mask, edited_muscle_mask)
    print(json.dumps(result))