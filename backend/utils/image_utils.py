"""
Image Utilities
Helper functions for image processing and conversion
"""

import base64
import io
from PIL import Image
import numpy as np
from typing import Union


class ImageUtils:
    """Utility functions for image processing"""
    
    @staticmethod
    def base64_to_image(base64_string: str) -> Image.Image:
        """
        Convert base64 string to PIL Image
        
        Args:
            base64_string: Base64 encoded image (with or without data URI prefix)
            
        Returns:
            PIL Image object
        """
        # Remove data URI prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        # Decode base64
        image_data = base64.b64decode(base64_string)
        
        # Convert to PIL Image
        image = Image.open(io.BytesIO(image_data))
        
        return image
    
    @staticmethod
    def image_to_base64(image: Image.Image, format: str = 'JPEG', quality: int = 85) -> str:
        """
        Convert PIL Image to base64 string
        
        Args:
            image: PIL Image object
            format: Output format ('JPEG' or 'PNG')
            quality: JPEG quality (1-100), ignored for PNG
            
        Returns:
            Base64 encoded string with data URI prefix
        """
        # Create bytes buffer
        buffer = io.BytesIO()
        
        # Save image to buffer
        if format.upper() == 'PNG':
            image.save(buffer, format='PNG', optimize=True)
            mime_type = 'image/png'
        else:
            # Convert RGBA to RGB for JPEG
            if image.mode == 'RGBA':
                rgb_image = Image.new('RGB', image.size, (255, 255, 255))
                rgb_image.paste(image, mask=image.split()[3])
                image = rgb_image
            
            image.save(buffer, format='JPEG', quality=quality, optimize=True)
            mime_type = 'image/jpeg'
        
        # Get bytes and encode to base64
        img_bytes = buffer.getvalue()
        img_base64 = base64.b64encode(img_bytes).decode('utf-8')
        
        # Return with data URI prefix
        return f"data:{mime_type};base64,{img_base64}"
    
    @staticmethod
    def numpy_to_image(array: np.ndarray) -> Image.Image:
        """
        Convert numpy array to PIL Image
        
        Args:
            array: Numpy array (H, W, C) in range [0, 255] or [0, 1]
            
        Returns:
            PIL Image object
        """
        # Normalize to 0-255 if needed
        if array.max() <= 1.0:
            array = (array * 255).astype(np.uint8)
        else:
            array = array.astype(np.uint8)
        
        # Convert to PIL Image
        image = Image.fromarray(array)
        
        return image
    
    @staticmethod
    def image_to_numpy(image: Image.Image) -> np.ndarray:
        """
        Convert PIL Image to numpy array
        
        Args:
            image: PIL Image object
            
        Returns:
            Numpy array (H, W, C)
        """
        return np.array(image)
    
    @staticmethod
    def resize_image(
        image: Image.Image,
        target_size: tuple,
        maintain_aspect: bool = True
    ) -> Image.Image:
        """
        Resize image to target size
        
        Args:
            image: PIL Image object
            target_size: (width, height) tuple
            maintain_aspect: If True, maintain aspect ratio and pad
            
        Returns:
            Resized PIL Image
        """
        if maintain_aspect:
            # Calculate aspect-preserving size
            aspect = image.width / image.height
            target_aspect = target_size[0] / target_size[1]
            
            if aspect > target_aspect:
                # Image is wider than target
                new_width = target_size[0]
                new_height = int(target_size[0] / aspect)
            else:
                # Image is taller than target
                new_height = target_size[1]
                new_width = int(target_size[1] * aspect)
            
            # Resize
            resized = image.resize((new_width, new_height), Image.LANCZOS)
            
            # Pad to target size
            result = Image.new('RGB', target_size, (0, 0, 0))
            paste_x = (target_size[0] - new_width) // 2
            paste_y = (target_size[1] - new_height) // 2
            result.paste(resized, (paste_x, paste_y))
            
            return result
        else:
            # Direct resize
            return image.resize(target_size, Image.LANCZOS)
    
    @staticmethod
    def create_mask_from_alpha(image: Image.Image) -> Image.Image:
        """
        Extract alpha channel as grayscale mask
        
        Args:
            image: PIL Image with alpha channel
            
        Returns:
            Grayscale PIL Image (mask)
        """
        if image.mode != 'RGBA':
            # Create white mask if no alpha
            return Image.new('L', image.size, 255)
        
        # Extract alpha channel
        return image.split()[3]
    
    @staticmethod
    def composite_images(
        background: Image.Image,
        foreground: Image.Image,
        alpha: float = 1.0
    ) -> Image.Image:
        """
        Composite two images together
        
        Args:
            background: Background image
            foreground: Foreground image (with or without alpha)
            alpha: Global alpha multiplier (0-1)
            
        Returns:
            Composited image
        """
        # Ensure same size
        if background.size != foreground.size:
            foreground = foreground.resize(background.size, Image.LANCZOS)
        
        # Convert to RGBA
        if background.mode != 'RGBA':
            background = background.convert('RGBA')
        if foreground.mode != 'RGBA':
            foreground = foreground.convert('RGBA')
        
        # Apply global alpha
        if alpha < 1.0:
            # Multiply alpha channel
            r, g, b, a = foreground.split()
            a = a.point(lambda x: int(x * alpha))
            foreground = Image.merge('RGBA', (r, g, b, a))
        
        # Composite
        result = Image.alpha_composite(background, foreground)
        
        return result
