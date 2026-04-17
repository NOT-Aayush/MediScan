import pydicom
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.path import Path
from pydicom.uid import generate_uid
import os
import sys
import json
import tempfile

def dicom_polygon_selector(input_dcm_path):
    try:
        # Load DICOM file
        ds = pydicom.dcmread(input_dcm_path)
        img = ds.pixel_array
        
        # Setup interactive plot
        fig, ax = plt.subplots(figsize=(10, 10))
        ax.imshow(img, cmap='gray')
        plt.title("Click to add polygon points. Right-click to finish.")
        
        # Store clicked points
        points = []
        
        def onclick(event):
            if event.button == 1:  # Left click
                points.append((event.xdata, event.ydata))
                ax.plot(event.xdata, event.ydata, 'ro')  # Mark the point
                if len(points) > 1:
                    # Draw line between points
                    x = [p[0] for p in points[-2:]]
                    y = [p[1] for p in points[-2:]]
                    ax.plot(x, y, 'r-')
                plt.draw()
            elif event.button == 3 and len(points) > 2:  # Right click to finish
                # Close the polygon
                ax.plot([points[-1][0], points[0][0]], 
                        [points[-1][1], points[0][1]], 'r-')
                plt.draw()
                plt.close()
        
        cid = fig.canvas.mpl_connect('button_press_event', onclick)
        plt.show()
        
        if len(points) < 3:
            return {"error": "At least 3 points needed to create a polygon"}
        
        # Create mask from polygon
        x, y = np.meshgrid(np.arange(img.shape[1]), np.arange(img.shape[0]))
        coords = np.vstack((x.flatten(), y.flatten())).T
        
        polygon_path = Path(points)
        mask = polygon_path.contains_points(coords)
        mask = mask.reshape(img.shape)
        
        # Create selected and unselected images
        selected_img = img.copy()
        selected_img[~mask] = 0  # Set outside to black
        
        unselected_img = img.copy()
        unselected_img[mask] = 0  # Set inside to black
        
        # Create new DICOM datasets
        def create_new_dataset(original_ds, new_pixel_array):
            new_ds = original_ds.copy()
            new_ds.SOPInstanceUID = generate_uid()
            new_ds.PixelData = new_pixel_array.tobytes()
            
            # Update relevant tags
            if 'WindowCenter' in new_ds:
                if isinstance(new_ds.WindowCenter, pydicom.multival.MultiValue):
                    new_ds.WindowCenter = str(new_ds.WindowCenter[0])
                else:
                    new_ds.WindowCenter = str(new_ds.WindowCenter)
            
            if 'WindowWidth' in new_ds:
                if isinstance(new_ds.WindowWidth, pydicom.multival.MultiValue):
                    new_ds.WindowWidth = str(new_ds.WindowWidth[0])
                else:
                    new_ds.WindowWidth = str(new_ds.WindowWidth)
            
            return new_ds
        
        # Create temp directory if it doesn't exist
        temp_dir = os.path.join(tempfile.gettempdir(), 'MediScanTemp')
        os.makedirs(temp_dir, exist_ok=True)
        
        # Generate output filenames
        base_name = os.path.splitext(os.path.basename(input_dcm_path))[0]
        selected_output = os.path.join(temp_dir, f"{base_name}_selected.dcm")
        unselected_output = os.path.join(temp_dir, f"{base_name}_unselected.dcm")
        
        # Save new DICOM files
        pydicom.dcmwrite(selected_output, create_new_dataset(ds, selected_img))
        pydicom.dcmwrite(unselected_output, create_new_dataset(ds, unselected_img))
        
        return {
            "selectedPath": selected_output,
            "unselectedPath": unselected_output,
            "success": True
        }
    except Exception as e:
        return {
            "error": str(e),
            "success": False
        }

if __name__ == "__main__":
    try:
        if len(sys.argv) < 2:
            print(json.dumps({"error": "Usage: python one_dicom_into_2.py <dicom_path>", "success": False}))
            sys.exit(1)
        
        input_file = sys.argv[1]
        result = dicom_polygon_selector(input_file)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "success": False
        }))
        sys.exit(1)