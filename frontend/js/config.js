// Configuration - CORRECTED FOR FACE VISIBILITY

const CONFIG = {
    API: {
        BASE_URL: 'https://lucy-clone-1.onrender.com',
        WS_URL: 'wss://lucy-clone-1.onrender.com/ws',
        REQUEST_TIMEOUT: 10000,
        ENDPOINTS: {
            HEALTH: '/health',
            FABRIC_CATALOG: '/api/fabric/catalog',
            FABRIC_SCAN: '/api/fabric/scan',
            VIRTUAL_TRYON: '/virtual-tryon',
            ROOT: '/'
        }
    },

    OFFLINE_MODE: {
        ENABLED: true,
        USE_MOCK_DATA: true,
        SHOW_INDICATOR: true
    },

    CAMERA: {
        WIDTH: 640,
        HEIGHT: 480,
        FRAME_RATE: 30,
        FACING_MODE: 'user'
    },

    SCENE: {
        BACKGROUND_COLOR: 0x000000,
        CAMERA_FOV: 60,          // ✅ Balanced - see face + torso
        CAMERA_NEAR: 0.1,
        CAMERA_FAR: 2000,
        CAMERA_DISTANCE: 5,      // ✅ Far enough to see both
        AMBIENT_LIGHT_INTENSITY: 0.9,
        DIRECTIONAL_LIGHT_INTENSITY: 0.8
    },

    JACKET: {
        MODEL_PATH: 'assets/models/Jacket (2).glb',
        SCALE: 2.5,              // ✅ FIXED: Smaller - torso only
        POSITION: { x: 0, y: 0.5, z: -1 },  // ✅ FIXED: Upper body
        ROTATION: { x: 0, y: Math.PI, z: 0 }
    },

    POSE: {
        MODEL_COMPLEXITY: 0,
        SMOOTH_LANDMARKS: true,
        SMOOTH_SEGMENTATION: false,
        MIN_DETECTION_CONFIDENCE: 0.5,
        MIN_TRACKING_CONFIDENCE: 0.5,
        ENABLE_SEGMENTATION: false
    },

    SKELETON: {
        SMOOTHING_FACTOR: 0.2,
        SCALE_MULTIPLIERS: {
            SHOULDERS: 1.0,
            TORSO: 1.0,
            ARMS: 1.0
        },
        // ✅ FIXED: Better positioning for face visibility
        BASE_SCALE: 8.0,         // Reduced from 15.0
        DEPTH_OFFSET: -1.0,      // Closer than -2.0
        VERTICAL_OFFSET: 0.5,    // Raised up from 0.0
        HORIZONTAL_OFFSET: 0.0,
        
        // Position multipliers - REDUCED for smaller range
        POSITION_SCALE_X: 4.0,   // Was 6.0 or 16.0
        POSITION_SCALE_Y: 4.0,   // Was 6.0 or 16.0
        
        // Scale range - TIGHTER for torso only
        MIN_SCALE: 2.0,          // Was 8.0
        MAX_SCALE: 4.0,          // Was 20.0
        
        LANDMARKS: {
            NOSE: 0,
            LEFT_EYE: 2,
            RIGHT_EYE: 5,
            LEFT_SHOULDER: 11,
            RIGHT_SHOULDER: 12,
            LEFT_ELBOW: 13,
            RIGHT_ELBOW: 14,
            LEFT_WRIST: 15,
            RIGHT_WRIST: 16,
            LEFT_HIP: 23,
            RIGHT_HIP: 24
        }
    },

    AI_PIPELINE: {
        ENABLED: true,
        KEYFRAME_INTERVAL: 2000,
        MAX_BLEND_ALPHA: 0.7,
        BLEND_TRANSITION_DURATION: 500,
        JPEG_QUALITY: 0.7,
        MAX_RECONNECT_ATTEMPTS: 3,
        RECONNECT_DELAY: 5000
    },

    FABRIC: {
        DEFAULT_REPEAT: { u: 2, v: 2 },
        THUMBNAIL_SIZE: 80,
        MAX_UPLOAD_SIZE: 10 * 1024 * 1024
    },

    PERFORMANCE: {
        TARGET_FPS: 30,
        LOW_PERFORMANCE_THRESHOLD: 20,
        RENDER_SCALE: 1.0,
        ENABLE_STATS: true,
        ADAPTIVE_QUALITY: false
    },

    UI: {
        POSE_GUIDE_DURATION: 2000,
        HIDE_CONTROLS_DELAY: 5000,
        TOAST_DURATION: 3000
    },

    DEBUG: {
        SHOW_POSE_LANDMARKS: false,
        SHOW_SKELETON_BONES: true,
        LOG_PERFORMANCE: true,
        ENABLE_ORBIT_CONTROLS: false,
        VERBOSE: true
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}