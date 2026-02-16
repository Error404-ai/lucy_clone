const CONFIG = {

    /* ---------------- CAMERA ---------------- */

    CAMERA: {
        WIDTH: 1280,  // Higher resolution for better quality
        HEIGHT: 720,
        FRAME_RATE: 30,
        FACING_MODE: 'user'
    },

    /* ---------------- SCENE ---------------- */

    SCENE: {
        CAMERA_FOV: 75,  // Wider FOV to show upper body
        CAMERA_NEAR: 0.1,
        CAMERA_FAR: 100,
        AMBIENT_LIGHT_INTENSITY: 0.8,
        DIRECTIONAL_LIGHT_INTENSITY: 0.5
    },

    /* ---------------- JACKET ---------------- */

    JACKET: {
        MODEL_PATH: 'assets/models/Jacket.glb',
        ROTATION: { x: 0, y: Math.PI, z: 0 },
        SCALE: 1.0,
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
    SMOOTHING_FACTOR: 0.25,    // Slightly lower for more stability
    BASE_SCALE: 1.4,           // ✅ MUCH LARGER - for normal jacket size
    MIN_SCALE: 0.4,            // ✅ Increased minimum
    MAX_SCALE: 2.0,            // ✅ Increased maximum
    DEPTH_OFFSET: 2.5,         // Base depth (will be dynamic now)

    LANDMARKS: {
        LEFT_SHOULDER: 11,
        RIGHT_SHOULDER: 12,
        LEFT_HIP: 23,
        RIGHT_HIP: 24,
        LEFT_ELBOW: 13,
        RIGHT_ELBOW: 14,
        NOSE: 0
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
        BASE_URL: '',
        WS_URL: '',
        ENDPOINTS: {
            VIRTUAL_TRYON: '/api/virtual-tryon',
            FABRIC_SCAN: '/api/fabric/scan',
            FABRIC_CATALOG: '/api/fabric/catalog'
        }
    },

    /* ---------------- AI PIPELINE ---------------- */

    AI_PIPELINE: {
        ENABLED: false,
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
        SHOW_SKELETON: false
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}