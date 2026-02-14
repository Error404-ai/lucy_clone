// Configuration - CORRECTED for full body view

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
        FRAME_RATE: 24,
        FACING_MODE: 'user'
    },

    SCENE: {
        BACKGROUND_COLOR: 0x000000,
        CAMERA_FOV: 85, // ✅ MUCH WIDER (was 75, now 85)
        CAMERA_NEAR: 0.1,
        CAMERA_FAR: 2000,
        CAMERA_DISTANCE: 12, // ✅ MUCH FURTHER back (was 8, now 12)
        AMBIENT_LIGHT_INTENSITY: 0.6,
        DIRECTIONAL_LIGHT_INTENSITY: 0.7
    },

    JACKET: {
        MODEL_PATH: 'assets/models/jacket.glb',
        SCALE: 1.5, // ✅ LARGER default scale
        POSITION: { x: 0, y: 0, z: 0 },
        ROTATION: { x: 0, y: 0, z: 0 }
    },

    POSE: {
        MODEL_COMPLEXITY: 0,
        SMOOTH_LANDMARKS: false,
        SMOOTH_SEGMENTATION: false,
        MIN_DETECTION_CONFIDENCE: 0.3,
        MIN_TRACKING_CONFIDENCE: 0.3,
        ENABLE_SEGMENTATION: false
    },

    SKELETON: {
        SMOOTHING_FACTOR: 0.2, // ✅ Less smoothing for more responsive
        SCALE_MULTIPLIERS: {
            SHOULDERS: 1.0,
            TORSO: 1.0,
            ARMS: 1.0
        },
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
        ENABLED: false,
        KEYFRAME_INTERVAL: 3000,
        MAX_BLEND_ALPHA: 0.7,
        BLEND_TRANSITION_DURATION: 500,
        JPEG_QUALITY: 0.6,
        MAX_RECONNECT_ATTEMPTS: 3,
        RECONNECT_DELAY: 5000
    },

    FABRIC: {
        DEFAULT_REPEAT: { u: 2, v: 2 },
        THUMBNAIL_SIZE: 80,
        MAX_UPLOAD_SIZE: 10 * 1024 * 1024
    },

    PERFORMANCE: {
        TARGET_FPS: 24,
        LOW_PERFORMANCE_THRESHOLD: 15,
        RENDER_SCALE: 0.8, // ✅ Better quality
        ENABLE_STATS: true,
        ADAPTIVE_QUALITY: true
    },

    UI: {
        POSE_GUIDE_DURATION: 5000,
        HIDE_CONTROLS_DELAY: 5000,
        TOAST_DURATION: 3000
    },

    DEBUG: {
        SHOW_POSE_LANDMARKS: false,
        SHOW_SKELETON_BONES: false,
        LOG_PERFORMANCE: true,
        ENABLE_ORBIT_CONTROLS: false,
        VERBOSE: true // ✅ Enable verbose logging
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}