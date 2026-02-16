const CONFIG = {

    /* ---------------- CAMERA ---------------- */

    CAMERA: {
        WIDTH: 640,
        HEIGHT: 480,
        FRAME_RATE: 30,
        FACING_MODE: 'user'
    },

    /* ---------------- SCENE ---------------- */

    SCENE: {
        CAMERA_FOV: 60,
        CAMERA_NEAR: 0.01,
        CAMERA_FAR: 100,
        AMBIENT_LIGHT_INTENSITY: 0.9,
        DIRECTIONAL_LIGHT_INTENSITY: 0.8
    },

    /* ---------------- JACKET ---------------- */

    // AR system controls position now (SkeletonMapper)
    JACKET: {
        MODEL_PATH: 'assets/models/Jacket.glb',
        ROTATION: { x: 0, y: Math.PI, z: 0 },
        SCALE: 1.6,
        POSITION: { x: 0, y: 0, z: -2.2 }
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
        SMOOTHING_FACTOR: 0.25,
        BASE_SCALE: 1.6,
        MIN_SCALE: 1.2,
        MAX_SCALE: 2.5,
        DEPTH_OFFSET: 2.2,

        LANDMARKS: {
            LEFT_SHOULDER: 11,
            RIGHT_SHOULDER: 12,
            LEFT_HIP: 23,
            RIGHT_HIP: 24
        }
    },

    /* ---------------- PERFORMANCE ---------------- */

    PERFORMANCE: {
        TARGET_FPS: 30,
        RENDER_SCALE: 1.0
    },

    /* ---------------- UI (REQUIRED BY UTILS) ---------------- */

    UI: {
        TOAST_DURATION: 3000,
        POSE_GUIDE_DURATION: 3000
    },

    /* ---------------- OFFLINE MODE (REQUIRED BY FABRIC SELECTOR) ---------------- */

    OFFLINE_MODE: {
        ENABLED: true
    },

    /* ---------------- API (REQUIRED BY CAPTURE + AI) ---------------- */

    API: {
        BASE_URL: '',
        WS_URL: '',
        ENDPOINTS: {}
    },

    /* ---------------- AI PIPELINE (SAFE DISABLED) ---------------- */

    AI_PIPELINE: {
        ENABLED: false
    },

    /* ---------------- DEBUG ---------------- */

    DEBUG: {
        VERBOSE: true
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}