// Configuration file for Lucy Virtual Try-On
// UPDATED VERSION - Optimized skeleton tracking

const CONFIG = {
    // Backend API configuration
    API: {
        BASE_URL: 'https://lucy-clone-vvd7.onrender.com',
        WS_URL: 'wss://lucy-clone-vvd7.onrender.com/ws',
        REQUEST_TIMEOUT: 10000,
        
        ENDPOINTS: {
            HEALTH: '/health',
            FABRIC_CATALOG: '/api/fabric/catalog',
            FABRIC_SCAN: '/api/fabric/scan',
            VIRTUAL_TRYON: '/virtual-tryon',
            ROOT: '/'
        }
    },

    // Offline mode configuration
    OFFLINE_MODE: {
        ENABLED: true,
        USE_MOCK_DATA: true,
        SHOW_INDICATOR: true
    },

    // Camera configuration
    CAMERA: {
        WIDTH: 1280,
        HEIGHT: 720,
        FRAME_RATE: 30,
        FACING_MODE: 'user'
    },

    // Three.js scene configuration
    SCENE: {
        BACKGROUND_COLOR: 0x000000,
        CAMERA_FOV: 50,
        CAMERA_NEAR: 0.1,
        CAMERA_FAR: 2000,
        AMBIENT_LIGHT_INTENSITY: 0.3, // ✅ Reduced
        DIRECTIONAL_LIGHT_INTENSITY: 0.4 // ✅ Reduced
    },

    // Jacket model configuration
    JACKET: {
        MODEL_PATH: 'assets/models/jacket_optimized.glb', 
        SCALE: 1.0,
        POSITION: { x: 0, y: 0, z: 0 }, 
        ROTATION: { x: 0, y: 0, z: 0 }
    },

    // MediaPipe Pose configuration
    POSE: {
        MODEL_COMPLEXITY: 0, // ✅ Lite model for performance
        SMOOTH_LANDMARKS: true,
        SMOOTH_SEGMENTATION: false,
        MIN_DETECTION_CONFIDENCE: 0.5,
        MIN_TRACKING_CONFIDENCE: 0.5,
        ENABLE_SEGMENTATION: false
    },

    // Skeleton mapping configuration
    SKELETON: {
        SMOOTHING_FACTOR: 0.5, // ✅ Increased for smoother motion
        SCALE_MULTIPLIERS: {
            SHOULDERS: 1.2,
            TORSO: 1.0,
            ARMS: 1.0
        },
        LANDMARKS: {
            NOSE: 0,
            LEFT_EYE: 2,
            RIGHT_EYE: 5,
            LEFT_EAR: 7,
            RIGHT_EAR: 8,
            LEFT_SHOULDER: 11,
            RIGHT_SHOULDER: 12,
            LEFT_ELBOW: 13,
            RIGHT_ELBOW: 14,
            LEFT_WRIST: 15,
            RIGHT_WRIST: 16,
            LEFT_HIP: 23,
            RIGHT_HIP: 24,
            LEFT_KNEE: 25,
            RIGHT_KNEE: 26,
            LEFT_ANKLE: 27,
            RIGHT_ANKLE: 28
        }
    },

    // AI Pipeline configuration
    AI_PIPELINE: {
        ENABLED: false,
        KEYFRAME_INTERVAL: 2000,
        MAX_BLEND_ALPHA: 0.7,
        BLEND_TRANSITION_DURATION: 500,
        JPEG_QUALITY: 0.7,
        MAX_RECONNECT_ATTEMPTS: 3,
        RECONNECT_DELAY: 5000
    },

    // Fabric texture configuration
    FABRIC: {
        DEFAULT_REPEAT: { u: 2, v: 2 },
        THUMBNAIL_SIZE: 80,
        MAX_UPLOAD_SIZE: 10 * 1024 * 1024
    },

    // Performance settings
    PERFORMANCE: {
        TARGET_FPS: 30,
        LOW_PERFORMANCE_THRESHOLD: 20,
        RENDER_SCALE: 0.8,
        ENABLE_STATS: true,
        ADAPTIVE_QUALITY: true
    },

    // UI configuration
    UI: {
        POSE_GUIDE_DURATION: 5000,
        HIDE_CONTROLS_DELAY: 5000,
        TOAST_DURATION: 3000
    },

    // Development/Debug settings
    DEBUG: {
        SHOW_POSE_LANDMARKS: false,
        SHOW_SKELETON_BONES: false,
        LOG_PERFORMANCE: true,
        ENABLE_ORBIT_CONTROLS: false,
        VERBOSE: false
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}