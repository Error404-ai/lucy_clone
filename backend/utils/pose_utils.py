"""
Pose Utilities
Helper functions for processing MediaPipe pose landmarks
"""

import numpy as np
from typing import Optional, Dict, List, Tuple


class PoseUtils:
    """Utility functions for pose processing"""
    
    # MediaPipe landmark indices
    LANDMARKS = {
        'NOSE': 0,
        'LEFT_EYE': 2,
        'RIGHT_EYE': 5,
        'LEFT_EAR': 7,
        'RIGHT_EAR': 8,
        'LEFT_SHOULDER': 11,
        'RIGHT_SHOULDER': 12,
        'LEFT_ELBOW': 13,
        'RIGHT_ELBOW': 14,
        'LEFT_WRIST': 15,
        'RIGHT_WRIST': 16,
        'LEFT_HIP': 23,
        'RIGHT_HIP': 24,
        'LEFT_KNEE': 25,
        'RIGHT_KNEE': 26,
        'LEFT_ANKLE': 27,
        'RIGHT_ANKLE': 28
    }
    
    @staticmethod
    def parse_pose_data(pose_dict: Dict) -> Dict:
        """
        Parse pose data from frontend format
        
        Args:
            pose_dict: Dictionary containing pose landmarks and metadata
            
        Returns:
            Processed pose data dictionary
        """
        if not pose_dict:
            return None
        
        landmarks = pose_dict.get('landmarks', [])
        shoulder_width = pose_dict.get('shoulderWidth', 0)
        rotation = pose_dict.get('rotation', 0)
        
        return {
            'landmarks': landmarks,
            'shoulder_width': shoulder_width,
            'rotation': rotation,
            'keypoints': PoseUtils.landmarks_to_keypoints(landmarks)
        }
    
    @staticmethod
    def landmarks_to_keypoints(landmarks: List) -> np.ndarray:
        """
        Convert MediaPipe landmarks to numpy array of keypoints
        
        Args:
            landmarks: List of landmark dictionaries with x, y, z, visibility
            
        Returns:
            Numpy array of shape (N, 3) with x, y, z coordinates
        """
        if not landmarks:
            return np.zeros((33, 3))
        
        keypoints = []
        for landmark in landmarks:
            x = landmark.get('x', 0)
            y = landmark.get('y', 0)
            z = landmark.get('z', 0)
            keypoints.append([x, y, z])
        
        return np.array(keypoints)
    
    @staticmethod
    def get_shoulder_width(landmarks: List) -> float:
        """
        Calculate shoulder width from landmarks
        
        Args:
            landmarks: List of landmark dictionaries
            
        Returns:
            Shoulder width as Euclidean distance
        """
        if not landmarks or len(landmarks) < 13:
            return 0.0
        
        left_shoulder = landmarks[PoseUtils.LANDMARKS['LEFT_SHOULDER']]
        right_shoulder = landmarks[PoseUtils.LANDMARKS['RIGHT_SHOULDER']]
        
        # Calculate Euclidean distance
        dx = left_shoulder['x'] - right_shoulder['x']
        dy = left_shoulder['y'] - right_shoulder['y']
        
        width = np.sqrt(dx**2 + dy**2)
        return float(width)
    
    @staticmethod
    def get_body_center(landmarks: List) -> Tuple[float, float]:
        """
        Get center point of the body (midpoint between shoulders and hips)
        
        Args:
            landmarks: List of landmark dictionaries
            
        Returns:
            (x, y) coordinates of body center
        """
        if not landmarks or len(landmarks) < 25:
            return (0.5, 0.5)  # Center of frame
        
        # Get shoulder midpoint
        left_shoulder = landmarks[PoseUtils.LANDMARKS['LEFT_SHOULDER']]
        right_shoulder = landmarks[PoseUtils.LANDMARKS['RIGHT_SHOULDER']]
        shoulder_x = (left_shoulder['x'] + right_shoulder['x']) / 2
        shoulder_y = (left_shoulder['y'] + right_shoulder['y']) / 2
        
        # Get hip midpoint
        left_hip = landmarks[PoseUtils.LANDMARKS['LEFT_HIP']]
        right_hip = landmarks[PoseUtils.LANDMARKS['RIGHT_HIP']]
        hip_x = (left_hip['x'] + right_hip['x']) / 2
        hip_y = (left_hip['y'] + right_hip['y']) / 2
        
        # Body center is midpoint between shoulders and hips
        center_x = (shoulder_x + hip_x) / 2
        center_y = (shoulder_y + hip_y) / 2
        
        return (center_x, center_y)
    
    @staticmethod
    def get_body_rotation(landmarks: List) -> float:
        """
        Estimate body rotation angle from shoulder orientation
        
        Args:
            landmarks: List of landmark dictionaries
            
        Returns:
            Rotation angle in degrees (-90 to 90)
        """
        if not landmarks or len(landmarks) < 13:
            return 0.0
        
        left_shoulder = landmarks[PoseUtils.LANDMARKS['LEFT_SHOULDER']]
        right_shoulder = landmarks[PoseUtils.LANDMARKS['RIGHT_SHOULDER']]
        
        # Calculate angle
        dx = right_shoulder['x'] - left_shoulder['x']
        dy = right_shoulder['y'] - left_shoulder['y']
        
        angle = np.arctan2(dy, dx) * 180 / np.pi
        
        return float(angle)
    
    @staticmethod
    def is_frontal_pose(landmarks: List, threshold: float = 0.3) -> bool:
        """
        Check if person is facing the camera (frontal pose)
        
        Args:
            landmarks: List of landmark dictionaries
            threshold: Z-coordinate threshold for frontal detection
            
        Returns:
            True if frontal pose, False otherwise
        """
        if not landmarks or len(landmarks) < 13:
            return True  # Assume frontal if no data
        
        left_shoulder = landmarks[PoseUtils.LANDMARKS['LEFT_SHOULDER']]
        right_shoulder = landmarks[PoseUtils.LANDMARKS['RIGHT_SHOULDER']]
        
        # Check z-coordinates (depth)
        # In frontal pose, shoulders should be at similar depth
        z_diff = abs(left_shoulder.get('z', 0) - right_shoulder.get('z', 0))
        
        return z_diff < threshold
    
    @staticmethod
    def get_pose_confidence(landmarks: List) -> float:
        """
        Calculate average visibility/confidence of key landmarks
        
        Args:
            landmarks: List of landmark dictionaries
            
        Returns:
            Average confidence score (0-1)
        """
        if not landmarks:
            return 0.0
        
        # Key landmarks for upper body
        key_indices = [
            PoseUtils.LANDMARKS['LEFT_SHOULDER'],
            PoseUtils.LANDMARKS['RIGHT_SHOULDER'],
            PoseUtils.LANDMARKS['LEFT_ELBOW'],
            PoseUtils.LANDMARKS['RIGHT_ELBOW'],
            PoseUtils.LANDMARKS['LEFT_HIP'],
            PoseUtils.LANDMARKS['RIGHT_HIP']
        ]
        
        confidences = []
        for idx in key_indices:
            if idx < len(landmarks):
                visibility = landmarks[idx].get('visibility', 0)
                confidences.append(visibility)
        
        if not confidences:
            return 0.0
        
        return sum(confidences) / len(confidences)
    
    @staticmethod
    def create_pose_heatmap(landmarks: List, image_size: Tuple[int, int]) -> np.ndarray:
        """
        Create a heatmap visualization of pose landmarks
        
        Args:
            landmarks: List of landmark dictionaries
            image_size: (width, height) of output heatmap
            
        Returns:
            Numpy array of shape (height, width) with heatmap
        """
        width, height = image_size
        heatmap = np.zeros((height, width), dtype=np.float32)
        
        if not landmarks:
            return heatmap
        
        # Gaussian kernel size
        sigma = min(width, height) // 20
        
        for landmark in landmarks:
            x = int(landmark.get('x', 0) * width)
            y = int(landmark.get('y', 0) * height)
            visibility = landmark.get('visibility', 1.0)
            
            # Bounds check
            if 0 <= x < width and 0 <= y < height:
                # Add Gaussian blob
                for dy in range(-sigma, sigma + 1):
                    for dx in range(-sigma, sigma + 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < width and 0 <= ny < height:
                            dist = np.sqrt(dx**2 + dy**2)
                            value = visibility * np.exp(-(dist**2) / (2 * (sigma/3)**2))
                            heatmap[ny, nx] = max(heatmap[ny, nx], value)
        
        return heatmap
