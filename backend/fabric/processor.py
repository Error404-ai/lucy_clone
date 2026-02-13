"""
Fabric Processor
Processes fabric photos to generate PBR textures (diffuse, normal, roughness)
"""

import cv2
import numpy as np
from PIL import Image
from pathlib import Path
from typing import Dict, Tuple
import base64
import io


class FabricProcessor:
    """
    Process fabric photographs to create PBR texture maps
    - Perspective correction
    - Lighting normalization
    - Tiling/seamless generation
    - Normal map generation
    - Roughness map generation
    """
    
    def __init__(self, output_dir: str = "data/fabrics"):
        """
        Initialize fabric processor
        
        Args:
            output_dir: Directory to save processed textures
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Texture resolution
        self.texture_size = (1024, 1024)
    
    async def process_fabric(self, image: Image.Image, fabric_id: str) -> Dict[str, str]:
        """
        Process a fabric photograph and generate PBR textures
        
        Args:
            image: Input fabric photo
            fabric_id: Unique identifier for this fabric
            
        Returns:
            Dictionary with URLs to generated textures
        """
        
        # Convert PIL to OpenCV
        img_array = np.array(image.convert('RGB'))
        img_cv = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
        
        # Step 1: Perspective correction
        corrected = self._perspective_correction(img_cv)
        
        # Step 2: Lighting normalization
        normalized = self._normalize_lighting(corrected)
        
        # Step 3: Crop to square and resize
        square = self._crop_to_square(normalized)
        resized = cv2.resize(square, self.texture_size, interpolation=cv2.INTER_LANCZOS4)
        
        # Step 4: Make tileable
        diffuse = self._make_tileable(resized)
        
        # Step 5: Generate normal map
        normal = self._generate_normal_map(diffuse)
        
        # Step 6: Generate roughness map
        roughness = self._generate_roughness_map(diffuse)
        
        # Save textures
        fabric_dir = self.output_dir / fabric_id
        fabric_dir.mkdir(exist_ok=True)
        
        diffuse_path = fabric_dir / "diffuse.jpg"
        normal_path = fabric_dir / "normal.jpg"
        roughness_path = fabric_dir / "roughness.jpg"
        thumb_path = fabric_dir / "thumb.jpg"
        
        # Save images
        cv2.imwrite(str(diffuse_path), diffuse, [cv2.IMWRITE_JPEG_QUALITY, 90])
        cv2.imwrite(str(normal_path), normal, [cv2.IMWRITE_JPEG_QUALITY, 90])
        cv2.imwrite(str(roughness_path), roughness, [cv2.IMWRITE_JPEG_QUALITY, 90])
        
        # Create thumbnail (256x256)
        thumb = cv2.resize(diffuse, (256, 256), interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(thumb_path), thumb, [cv2.IMWRITE_JPEG_QUALITY, 85])
        
        # Convert to base64 for immediate use
        diffuse_b64 = self._image_to_base64(diffuse)
        normal_b64 = self._image_to_base64(normal)
        roughness_b64 = self._image_to_base64(roughness)
        
        return {
            "diffuse_url": f"data:image/jpeg;base64,{diffuse_b64}",
            "normal_url": f"data:image/jpeg;base64,{normal_b64}",
            "roughness_url": f"data:image/jpeg;base64,{roughness_b64}",
            "diffuse_path": str(diffuse_path),
            "normal_path": str(normal_path),
            "roughness_path": str(roughness_path),
            "thumbnail_path": str(thumb_path),
            "roughness": self._estimate_roughness(diffuse),
            "metalness": 0.0  # Fabrics are typically non-metallic
        }
    
    def _perspective_correction(self, img: np.ndarray) -> np.ndarray:
        """
        Attempt to correct perspective distortion
        For MVP, this is simplified - in production, use edge detection
        """
        # For now, just return the image
        # TODO: Implement full perspective correction with corner detection
        return img
    
    def _normalize_lighting(self, img: np.ndarray) -> np.ndarray:
        """
        Normalize lighting using CLAHE (Contrast Limited Adaptive Histogram Equalization)
        """
        # Convert to LAB color space
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        
        # Apply CLAHE to L channel
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_clahe = clahe.apply(l)
        
        # Merge back
        lab_clahe = cv2.merge([l_clahe, a, b])
        normalized = cv2.cvtColor(lab_clahe, cv2.COLOR_LAB2BGR)
        
        return normalized
    
    def _crop_to_square(self, img: np.ndarray) -> np.ndarray:
        """
        Crop image to square, taking the center region
        """
        h, w = img.shape[:2]
        size = min(h, w)
        
        # Calculate crop coordinates
        start_y = (h - size) // 2
        start_x = (w - size) // 2
        
        cropped = img[start_y:start_y + size, start_x:start_x + size]
        return cropped
    
    def _make_tileable(self, img: np.ndarray) -> np.ndarray:
        """
        Make texture seamlessly tileable by blending edges
        """
        h, w = img.shape[:2]
        
        # Create edge blend masks
        blend_size = w // 8  # Blend 12.5% on each edge
        
        # Horizontal blending
        for y in range(h):
            for x in range(blend_size):
                alpha = x / blend_size
                img[y, x] = (alpha * img[y, x] + (1 - alpha) * img[y, w - blend_size + x]).astype(np.uint8)
                img[y, w - blend_size + x] = ((1 - alpha) * img[y, w - blend_size + x] + alpha * img[y, x]).astype(np.uint8)
        
        # Vertical blending
        for x in range(w):
            for y in range(blend_size):
                alpha = y / blend_size
                img[y, x] = (alpha * img[y, x] + (1 - alpha) * img[h - blend_size + y, x]).astype(np.uint8)
                img[h - blend_size + y, x] = ((1 - alpha) * img[h - blend_size + y, x] + alpha * img[y, x]).astype(np.uint8)
        
        return img
    
    def _generate_normal_map(self, img: np.ndarray) -> np.ndarray:
        """
        Generate normal map from diffuse texture using Sobel filters
        """
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
        
        # Apply Sobel filters
        sobel_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        sobel_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        
        # Normalize and create normal map
        # Normal map: R=X, G=Y, B=Z (pointing up)
        normal = np.zeros((*gray.shape, 3), dtype=np.float32)
        
        # Scale factor for normal strength
        strength = 2.0
        
        normal[:, :, 0] = -sobel_x * strength  # R channel (X)
        normal[:, :, 1] = -sobel_y * strength  # G channel (Y)
        normal[:, :, 2] = 255  # B channel (Z - always pointing up)
        
        # Normalize vectors
        length = np.sqrt(normal[:, :, 0]**2 + normal[:, :, 1]**2 + normal[:, :, 2]**2)
        length = np.maximum(length, 1e-6)  # Avoid division by zero
        
        normal[:, :, 0] /= length
        normal[:, :, 1] /= length
        normal[:, :, 2] /= length
        
        # Convert to 0-255 range
        # Normal maps store normalized vectors as (normal + 1) * 127.5
        normal = ((normal + 1.0) * 127.5).astype(np.uint8)
        
        # Convert to BGR for OpenCV
        normal = cv2.cvtColor(normal, cv2.COLOR_RGB2BGR)
        
        return normal
    
    def _generate_roughness_map(self, img: np.ndarray) -> np.ndarray:
        """
        Generate roughness map from high-frequency texture detail
        More texture detail = lower roughness (shinier)
        Less texture detail = higher roughness (matte)
        """
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Extract high-frequency details using Laplacian
        laplacian = cv2.Laplacian(gray, cv2.CV_32F)
        laplacian = np.abs(laplacian)
        
        # Normalize to 0-255
        roughness = cv2.normalize(laplacian, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
        
        # Invert: high detail = low roughness
        roughness = 255 - roughness
        
        # Apply slight blur to avoid noise
        roughness = cv2.GaussianBlur(roughness, (5, 5), 0)
        
        # Convert to BGR (grayscale in all channels)
        roughness = cv2.cvtColor(roughness, cv2.COLOR_GRAY2BGR)
        
        return roughness
    
    def _estimate_roughness(self, img: np.ndarray) -> float:
        """
        Estimate average roughness value (0-1) from texture
        """
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Calculate texture variance
        variance = np.var(gray)
        
        # More variance = more texture = lower roughness
        # Normalize variance to 0-1 range (empirical values)
        roughness = max(0.0, min(1.0, 1.0 - (variance / 2000.0)))
        
        return roughness
    
    def _image_to_base64(self, img: np.ndarray) -> str:
        """
        Convert OpenCV image to base64 string
        """
        # Encode to JPEG
        success, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        
        if not success:
            raise ValueError("Failed to encode image")
        
        # Convert to base64
        img_bytes = buffer.tobytes()
        img_base64 = base64.b64encode(img_bytes).decode('utf-8')
        
        return img_base64
