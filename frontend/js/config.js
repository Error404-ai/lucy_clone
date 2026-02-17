// config.js - UPDATED FOR RIGGED JACKET

const CONFIG = {

    /* ---------------- CAMERA ---------------- */

    CAMERA: {
        WIDTH: 1280,
        HEIGHT: 720,
        FRAME_RATE: 30,
        FACING_MODE: 'user'
    },

    /* ---------------- SCENE ---------------- */

    SCENE: {
        CAMERA_FOV: 75,
        CAMERA_NEAR: 0.1,
        CAMERA_FAR: 100,
        AMBIENT_LIGHT_INTENSITY: 0.8,
        DIRECTIONAL_LIGHT_INTENSITY: 0.5
    },

    /* ---------------- JACKET ---------------- */

    JACKET: {
        // ✅ UPDATED: Use the rigged jacket model
        MODEL_PATH: 'assets/models/16_Jacket.glb',  // Or wherever you export it
        ROTATION: { x: 0, y: Math.PI, z: 0 },
        SCALE: 0.5,  // Adjusted for rigged model
        POSITION: { x: 0, y: 0, z: -2.5 }
    },

    /* ---------------- POSE ---------------- */

    POSE: {
        MODEL_COMPLEXITY: 0,
        SMOOTH_LANDMARKS: true,
        MIN_DETECTION_CONFIDENCE: 0.5,
        MIN_TRACKING_CONFIDENCE: 0.5
    },

    /* ---------------- SKELETON ---------------- */

    SKELETON: {
        SMOOTHING_FACTOR: 0.3,
        BASE_SCALE: 2.5,           // ✅ UPDATED for rigged model
        MIN_SCALE: 0.3,
        MAX_SCALE: 1.0,
        DEPTH_OFFSET: 2.5,

        // ✅ UPDATED: MediaPipe landmark indices
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
            RIGHT_HIP: 24
        },

        // ✅ NEW: Bone animation settings
        BONE_ANIMATION: {
            ENABLED: true,
            ROTATION_SMOOTHING: 0.3,
            POSITION_SMOOTHING: 0.3,
            USE_QUATERNION_SLERP: true
        }
    },

    /* ---------------- PERFORMANCE ---------------- */

    PERFORMANCE: {
        TARGET_FPS: 30,
        RENDER_SCALE: 1.0
    },

    /* ---------------- UI ---------------- */

    UI: {
        TOAST_DURATION: 3000,
        POSE_GUIDE_DURATION: 5000
    },

    /* ---------------- OFFLINE MODE ---------------- */

    OFFLINE_MODE: {
        ENABLED: true
    },

    /* ---------------- API ---------------- */

    API: {
        BASE_URL: '',  // Update when backend is deployed
        WS_URL: '',    // Update when backend is deployed
        ENDPOINTS: {
            VIRTUAL_TRYON: '/api/virtual-tryon',
            FABRIC_SCAN: '/api/fabric/scan',
            FABRIC_CATALOG: '/api/fabric/catalog'
        }
    },

    /* ---------------- AI PIPELINE ---------------- */

    AI_PIPELINE: {
        ENABLED: false,  // Enable when backend is ready
        KEYFRAME_INTERVAL: 2000,
        JPEG_QUALITY: 0.8,
        BLEND_TRANSITION_DURATION: 500,
        MAX_BLEND_ALPHA: 0.7,
        MAX_RECONNECT_ATTEMPTS: 3,
        RECONNECT_DELAY: 2000
    },

    /* ---------------- DEBUG ---------------- */

    DEBUG: {
        VERBOSE: true,
        SHOW_LANDMARKS: false,
        SHOW_SKELETON: false,
        SHOW_BONE_NAMES: false  // ✅ NEW: Show bone names in 3D
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}