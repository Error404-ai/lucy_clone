const CONFIG = {

    CAMERA: {
        WIDTH: 640,
        HEIGHT: 480,
        FRAME_RATE: 30,
        FACING_MODE: 'user'
    },

    SCENE: {
        CAMERA_FOV: 60,      // realistic webcam FOV
        CAMERA_NEAR: 0.01,
        CAMERA_FAR: 100,
        AMBIENT_LIGHT_INTENSITY: 0.9,
        DIRECTIONAL_LIGHT_INTENSITY: 0.8
    },

    // ⚠️ NO POSITION OR SCALE HERE ANYMORE
    JACKET: {
        MODEL_PATH: 'assets/models/Jacket.glb',
        ROTATION: { x: 0, y: Math.PI, z: 0 }
    },

    SKELETON: {
        SMOOTHING_FACTOR: 0.25,

        BASE_SCALE: 1.6,      // matches normalized torso
        MIN_SCALE: 1.2,
        MAX_SCALE: 2.5,

        DEPTH_OFFSET: -2.2,   // distance from camera (AR space)

        LANDMARKS: {
            LEFT_SHOULDER: 11,
            RIGHT_SHOULDER: 12,
            LEFT_HIP: 23,
            RIGHT_HIP: 24
        }
    },

    PERFORMANCE: {
        TARGET_FPS: 30,
        RENDER_SCALE: 1.0
    },

    DEBUG: {
        VERBOSE: true
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}