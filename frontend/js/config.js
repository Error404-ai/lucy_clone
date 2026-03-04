// config.js — CLEAN VERSION (no backend, no AI pipeline)

const CONFIG = {

    /* ─────────────────────────── CAMERA ─────────────────────────────── */
    CAMERA: {
        WIDTH:       1280,
        HEIGHT:      720,
        FRAME_RATE:  30,
        FACING_MODE: 'user'
    },

    /* ─────────────────────────── SCENE ──────────────────────────────── */
    SCENE: {
        CAMERA_FOV:                   75,
        CAMERA_NEAR:                  0.1,
        CAMERA_FAR:                   100,
        AMBIENT_LIGHT_INTENSITY:      0.8,
        DIRECTIONAL_LIGHT_INTENSITY:  0.5
    },

    /* ─────────────────────────── JACKET ─────────────────────────────── */
    JACKET: {
        MODEL_PATH: 'assets/models/20_Jacket.glb',

        // GLB is authored in CENTIMETRES → multiply by 0.01 to get metres
        MODEL_UNIT_SCALE: 0.01,

        // Fine-tune jacket size without touching the math.
        // > 1.0 = bigger,  < 1.0 = smaller
        // Start at 1.0 and adjust if jacket looks too large/small after calibration
        SCALE_MULTIPLIER: 1.0,

        ROTATION: { x: 0, y: Math.PI, z: 0 },
        SCALE:    1.0,
        POSITION: { x: 0, y: 0, z: -2.5 }
    },

    /* ─────────────────────────── RIG ────────────────────────────────── */
    RIG: {

        // Body mesh names to HIDE (deformation only)
        BODY_MESH_NAMES: [
            'man_med_nrw_body',
            'man_med_nrw_hair',
            'Mesh035',
            'Mesh035_1',
            'Mesh035_2',
            'Mesh035_3',
            'Mesh035_4',
            'Mesh035_5',
            'Mesh035_6',
            'Cube'
        ],

        SHOULDER_SEAM_RATIO: 0.88,
        // What fraction of the jacket's total width = the shoulder span
        // Increase → jacket appears smaller.  Decrease → jacket appears larger.
        // 0.85 works for most standard jacket models.
        SHOULDER_SPAN_RATIO: 0.85,

        // Bone name overrides — match your actual GLB bone names
        BONE_NAME_OVERRIDES: {
            pelvis:    'pelvis',
            spine1:    'spine_01',
            spine2:    'spine_02',
            spine3:    'spine_03',
            spine4:    'spine_04',
            spine5:    'spine_05',
            neck:      'neck_01',
            head:      'head',
            clavicleL: 'clavicle_l',
            upperArmL: 'upperarm_l',
            lowerArmL: 'lowerarm_l',
            handL:     'hand_l',
            clavicleR: 'clavicle_r',
            upperArmR: 'upperarm_r',
            lowerArmR: 'lowerarm_r',
            handR:     'hand_r',
        },
    },

    /* ─────────────────────────── POSE ───────────────────────────────── */
    POSE: {
        MODEL_COMPLEXITY:         1,
        SMOOTH_LANDMARKS:         true,
        MIN_DETECTION_CONFIDENCE: 0.5,
        MIN_TRACKING_CONFIDENCE:  0.5
    },

    /* ─────────────────────────── SKELETON ───────────────────────────── */
    SKELETON: {
        SMOOTHING_FACTOR: 0.3,
        BASE_SCALE:       2.5,
        MIN_SCALE:        0.3,
        MAX_SCALE:        1.0,
        DEPTH_OFFSET:     2.5,

        LANDMARKS: {
            NOSE:           0,
            LEFT_EYE:       2,
            RIGHT_EYE:      5,
            LEFT_EAR:       7,
            RIGHT_EAR:      8,
            LEFT_SHOULDER:  11,
            RIGHT_SHOULDER: 12,
            LEFT_ELBOW:     13,
            RIGHT_ELBOW:    14,
            LEFT_WRIST:     15,
            RIGHT_WRIST:    16,
            LEFT_HIP:       23,
            RIGHT_HIP:      24
        },

        BONE_ANIMATION: {
            ENABLED:              true,
            ROTATION_SMOOTHING:   0.18,
            POSITION_SMOOTHING:   0.15,
            USE_QUATERNION_SLERP: true
        }
    },

    /* ─────────────────────────── PERFORMANCE ────────────────────────── */
    PERFORMANCE: {
        TARGET_FPS:   30,
        RENDER_SCALE: 1.0
    },

    /* ─────────────────────────── UI ─────────────────────────────────── */
    UI: {
        TOAST_DURATION:       3000,
        POSE_GUIDE_DURATION:  5000
    },

    /* ─────────────────────────── DEBUG ──────────────────────────────── */
    DEBUG: {
        VERBOSE:         true,
        SHOW_LANDMARKS:  false,
        SHOW_SKELETON:   false,
        SHOW_BONE_NAMES: false,
        SHOW_BODY_MESH:  false
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}