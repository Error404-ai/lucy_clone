// config.js — UPDATED: RIG section added for combined body+jacket GLB

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

        // ── MODEL_UNIT_SCALE ────────────────────────────────────────────
        // Fix if jacket appears massively too big or too small.
        // Check your browser console — skeleton-mapper.js logs a warning.
        //
        //   Model authored in METERS (default):      1.0
        //   Model authored in CENTIMETERS:            0.01
        //   Model authored in MILLIMETERS:            0.001
        //   Model authored in INCHES (rare):          0.0254
       MODEL_UNIT_SCALE: 0.01,
        ROTATION: { x: 0, y: Math.PI, z: 0 },
        SCALE:    0.5,
        POSITION: { x: 0, y: 0, z: -2.5 }
    },

    /* ─────────────────────────── RIG ────────────────────────────────── */
    // Settings for the combined body + jacket GLB (rigged asset).
    RIG: {

        // ── Body mesh identification ─────────────────────────────────────
        // List mesh names (or partial names) that should be HIDDEN at runtime.
        // These are the body/skin meshes that drive the skeleton but should
        // not be visible — only the jacket mesh should show.
        //
        // ✅ HOW TO FIND YOUR MESH NAMES:
        //   1. Open your GLB in https://gltf.report/ or Blender
        //   2. Note the exact mesh object names
        //   3. Paste them here (substring matching is fine)
        //
        // Examples:
        //   ['Body', 'Skin', 'Human']  ← matches "Body.001", "SkinMesh" etc.
        //   []  ← leave empty to use automatic keyword/size detection
       BODY_MESH_NAMES: ['man_med_nrw_body', 'man_med_nrw_hair', 'Mesh035'],

        // ── Shoulder seam position ───────────────────────────────────────
        // How far up the jacket's bounding box (0=bottom hem, 1=top collar)
        // the shoulder seam sits. Used to anchor the jacket to the detected
        // shoulder position so it doesn't float above the body.
        //
        // 0.78 = seam is 78% of the way up from hem → typical jacket
        // If jacket sits too HIGH on the body: decrease this value (e.g. 0.70)
        // If jacket sits too LOW on the body:  increase this value (e.g. 0.85)
        SHOULDER_SEAM_RATIO: 0.78,

        // ── Shoulder span ratio ──────────────────────────────────────────
        // What fraction of the jacket bounding-box width is the shoulder span.
        // Used to match jacket scale to detected shoulder width.
        //
        // 0.60 = 60% of bounding box is shoulder-to-shoulder (typical jacket)
        // If jacket is too wide: decrease (e.g. 0.50)
        // If jacket is too narrow: increase (e.g. 0.70)
        SHOULDER_SPAN_RATIO: 0.60,

        // ── Bone name overrides ──────────────────────────────────────────
        // If auto-detection misses bones, provide EXACT bone names here.
        // Key = internal bone alias, value = exact name from your GLB.
        //
        // Example for a Mixamo rig:
        // BONE_NAME_OVERRIDES: {
        //     pelvis:    'mixamorig:Hips',
        //     spine1:    'mixamorig:Spine',
        //     spine2:    'mixamorig:Spine1',
        //     spine3:    'mixamorig:Spine2',
        //     upperArmL: 'mixamorig:LeftArm',
        //     upperArmR: 'mixamorig:RightArm',
        //     lowerArmL: 'mixamorig:LeftForeArm',
        //     lowerArmR: 'mixamorig:RightForeArm',
        //     neck:      'mixamorig:Neck',
        //     head:      'mixamorig:Head',
        // },
        //
        // Example for standard Blender humanoid rig:
        // BONE_NAME_OVERRIDES: {
        //     pelvis:    'pelvis',
        //     spine1:    'spine_01',
        //     upperArmL: 'upperarm_l',
        //     upperArmR: 'upperarm_r',
        //     lowerArmL: 'lowerarm_l',
        //     lowerArmR: 'lowerarm_r',
        // },
        BONE_NAME_OVERRIDES: {},
    },

    /* ─────────────────────────── POSE ───────────────────────────────── */
    POSE: {
        MODEL_COMPLEXITY:        1,
        SMOOTH_LANDMARKS:        true,
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
            ROTATION_SMOOTHING:   0.18,   // EMA alpha — lower = smoother but laggier
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

    /* ─────────────────────────── OFFLINE MODE ───────────────────────── */
    OFFLINE_MODE: {
        ENABLED: true
    },

    /* ─────────────────────────── API ────────────────────────────────── */
    API: {
        BASE_URL: '',
        WS_URL:   '',
        ENDPOINTS: {
            VIRTUAL_TRYON:  '/api/virtual-tryon',
            FABRIC_SCAN:    '/api/fabric/scan',
            FABRIC_CATALOG: '/api/fabric/catalog'
        }
    },

    /* ─────────────────────────── AI PIPELINE ────────────────────────── */
    AI_PIPELINE: {
        ENABLED:                    false,
        KEYFRAME_INTERVAL:          2000,
        JPEG_QUALITY:               0.8,
        BLEND_TRANSITION_DURATION:  500,
        MAX_BLEND_ALPHA:            0.7,
        MAX_RECONNECT_ATTEMPTS:     3,
        RECONNECT_DELAY:            2000
    },

    /* ─────────────────────────── DEBUG ──────────────────────────────── */
    DEBUG: {
        VERBOSE:         true,
        SHOW_LANDMARKS:  false,
        SHOW_SKELETON:   false,
        SHOW_BONE_NAMES: false,
        // Set true to see body mesh during development to verify skeleton
        SHOW_BODY_MESH:  false
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}