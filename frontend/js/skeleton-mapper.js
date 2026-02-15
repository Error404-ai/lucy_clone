// Skeleton Mapper - FIXED for proper face + torso visibility

class SkeletonMapper {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.initialized = false;

        // Jacket reference
        this.jacket = null;

        this.smooth = {
            pos: { x: 0, y: 0, z: -2 },
            rot: { x: 0, y: Math.PI, z: 0 },
            scale: 1.5                    // ✅ FIXED: Start smaller
        };
    }

    init(w, h) {
        this.width = w;
        this.height = h;
        this.initialized = true;
        console.log('✅ SkeletonMapper initialized:', w, 'x', h);
    }

    setJacket(jacket) {
        this.jacket = jacket;
        console.log('🔗 Jacket linked to SkeletonMapper');
    }

    forceShowJacket() {
        if (this.jacket) {
            this.jacket.visible = true;
            console.log('👁 Jacket forced visible');
        }
    }

   update(poseData) {
    if (!poseData?.landmarks) return;

    const jacket = this.jacket || modelLoader.getModel();
    if (!jacket) return;

    const camera = sceneManager.getCamera();
    if (!camera) return;

    const L = CONFIG.SKELETON.LANDMARKS;
    const lm = poseData.landmarks;

    const LS = lm[L.LEFT_SHOULDER];
    const RS = lm[L.RIGHT_SHOULDER];

    if (!LS || !RS) return;

    // ===== SCREEN POSITION =====
    const cx = (LS.x + RS.x) / 2;
    const cy = (LS.y + RS.y) / 2;

    // normalized screen -> clip space
    const nx = (cx - 0.5) * 2;
    const ny = -(cy - 0.5) * 2;

    // project onto camera plane
    const distance = 2.2; // fixed AR plane distance
    const fov = camera.fov * Math.PI / 180;

    const viewHeight = 2 * Math.tan(fov / 2) * distance;
    const viewWidth = viewHeight * (this.width / this.height);

    const x = nx * viewWidth / 2;
    const y = ny * viewHeight / 2 - viewHeight * 0.08; // chest offset
    const z = -distance; // FIXED DEPTH (critical)

    // ===== SCALE FROM SHOULDER WIDTH =====
    const dx = RS.x - LS.x;
    const dy = RS.y - LS.y;
    const shoulderWidth = Math.sqrt(dx * dx + dy * dy);

    // convert screen % → world units
    const worldShoulderWidth = shoulderWidth * viewWidth;
    const scale = Utils.clamp(worldShoulderWidth * 2.4, 0.9, 2.2);

    // ===== ROTATION (only tilt) =====
    const tilt = Math.atan2(dy, dx);

    // ===== SMOOTHING =====
    this.smooth.pos = this.lerp3(this.smooth.pos, { x, y, z }, 0.25);
    this.smooth.rot = this.lerp3(this.smooth.rot, { x: 0, y: Math.PI, z: -tilt * 0.5 }, 0.3);
    this.smooth.scale = Utils.ema(scale, this.smooth.scale, 0.25);

    // ===== APPLY =====
    jacket.position.set(this.smooth.pos.x, this.smooth.pos.y, this.smooth.pos.z);
    jacket.rotation.set(this.smooth.rot.x, this.smooth.rot.y, this.smooth.rot.z);
    jacket.scale.setScalar(this.smooth.scale);

    jacket.visible = true;
}
    // Helper method for 3D lerp
    lerp3(start, end, t) {
        return {
            x: Utils.lerp(start.x, end.x, t),
            y: Utils.lerp(start.y, end.y, t),
            z: Utils.lerp(start.z, end.z, t)
        };
    }
}

// Global instance
const skeletonMapper = new SkeletonMapper();