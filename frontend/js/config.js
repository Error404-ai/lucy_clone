// config.js - UPDATED: MODEL_UNIT_SCALE added for jacket unit correction

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
        MODEL_PATH: 'assets/models/18_Jacket.glb',

        // ─── MODEL_UNIT_SCALE ───────────────────────────────────────────────
        // Fix if jacket appears massively too big or too small.
        // Check your browser console — skeleton-mapper.js logs a warning if
        // the bounding box looks suspicious.
        //
        //   Model authored in METERS (default): 1.0   ← try this first
        //   Model authored in CENTIMETERS:       0.01
        //   Model authored in MILLIMETERS:       0.001
        //   Model authored in INCHES (rare):     0.0254
        //
        // Tip: if the jacket covers your entire screen, try 0.01.
        //      if the jacket is a tiny dot, try 100.
        MODEL_UNIT_SCALE: 1.0,

        ROTATION: { x: 0, y: Math.PI, z: 0 },
        SCALE: 0.5,
        POSITION: { x: 0, y: 0, z: -2.5 }
    },

    /* ---------------- POSE ---------------- */
    POSE: {
        MODEL_COMPLEXITY: 1,
        SMOOTH_LANDMARKS: true,
        MIN_DETECTION_CONFIDENCE: 0.5,
        MIN_TRACKING_CONFIDENCE: 0.5
    },

    /* ---------------- SKELETON ---------------- */
    SKELETON: {
        SMOOTHING_FACTOR: 0.3,
        BASE_SCALE: 2.5,
        MIN_SCALE: 0.3,
        MAX_SCALE: 1.0,
        DEPTH_OFFSET: 2.5,

        LANDMARKS: {
            NOSE:            0,
            LEFT_EYE:        2,
            RIGHT_EYE:       5,
            LEFT_EAR:        7,
            RIGHT_EAR:       8,
            LEFT_SHOULDER:   11,
            RIGHT_SHOULDER:  12,
            LEFT_ELBOW:      13,
            RIGHT_ELBOW:     14,
            LEFT_WRIST:      15,
            RIGHT_WRIST:     16,
            LEFT_HIP:        23,
            RIGHT_HIP:       24
        },

        BONE_ANIMATION: {
            ENABLED:              true,
            ROTATION_SMOOTHING:   0.3,
            POSITION_SMOOTHING:   0.3,
            USE_QUATERNION_SLERP: true
        }
    },

    /* ---------------- PERFORMANCE ---------------- */
    PERFORMANCE: {
        TARGET_FPS:   30,
        RENDER_SCALE: 1.0
    },

    /* ---------------- UI ---------------- */
    UI: {
        TOAST_DURATION:     3000,
        POSE_GUIDE_DURATION: 5000
    },

    /* ---------------- OFFLINE MODE ---------------- */
    OFFLINE_MODE: {
        ENABLED: true
    },

    /* ---------------- API ---------------- */
    API: {
        BASE_URL: '',
        WS_URL:   '',
        ENDPOINTS: {
            VIRTUAL_TRYON:  '/api/virtual-tryon',
            FABRIC_SCAN:    '/api/fabric/scan',
            FABRIC_CATALOG: '/api/fabric/catalog'
        }
    },

    /* ---------------- AI PIPELINE ---------------- */
    AI_PIPELINE: {
        ENABLED:                   false,
        KEYFRAME_INTERVAL:         2000,
        JPEG_QUALITY:              0.8,
        BLEND_TRANSITION_DURATION: 500,
        MAX_BLEND_ALPHA:           0.7,
        MAX_RECONNECT_ATTEMPTS:    3,
        RECONNECT_DELAY:           2000
    },

    /* ---------------- DEBUG ---------------- */
    DEBUG: {
        VERBOSE:         true,
        SHOW_LANDMARKS:  false,
        SHOW_SKELETON:   false,
        SHOW_BONE_NAMES: false
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}