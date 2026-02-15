// Skeleton Mapper - Modular + Stable

class SkeletonMapper {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.initialized = false;

        // Jacket reference
        this.jacket = null;

        this.smooth = {
            pos: { x: 0, y: 0, z: -3 },
            rot: { x: 0, y: Math.PI, z: 0 },
            scale: 1.5
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

    /* ================= POSITION ================= */

    calculatePosition(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;

        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];

        if (!leftShoulder || !rightShoulder) {
            return { x: 0, y: 0, z: -3 };
        }

        const cx = (leftShoulder.x + rightShoulder.x) / 2;
        const cy = (leftShoulder.y + rightShoulder.y) / 2;

        const aspect = this.width / this.height;

        const x = (cx - 0.5) * aspect * 2.2;
        const y = -(cy - 0.45) * 2.8;

        const z = -3; // fixed depth for stability

        return { x, y, z };
    }

    /* ================= ROTATION ================= */

    calculateRotation(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;

        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];

        if (!leftShoulder || !rightShoulder) {
            return { x: 0, y: Math.PI, z: 0 };
        }

        const dx = rightShoulder.x - leftShoulder.x;
        const dy = rightShoulder.y - leftShoulder.y;

        const bodyAngle = Math.atan2(dy, dx);

        return {
            x: 0,
            y: Math.PI,
            z: -bodyAngle * 0.6
        };
    }

    /* ================= SCALE ================= */

    calculateScale(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;

        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];

        if (!leftShoulder || !rightShoulder) return 1.4;

        const dx = rightShoulder.x - leftShoulder.x;
        const dy = rightShoulder.y - leftShoulder.y;

        const shoulderWidth = Math.sqrt(dx * dx + dy * dy);

        const scale = shoulderWidth * 7.5;

        return Utils.clamp(scale, 1.2, 2.2);
    }

    /* ================= UPDATE ================= */

    update(poseData) {
        if (!poseData?.landmarks) return;

        const jacket = this.jacket || modelLoader.getModel();
        if (!jacket) return;

        const landmarks = poseData.landmarks;

        const pos = this.calculatePosition(landmarks);
        const rot = this.calculateRotation(landmarks);
        const scale = this.calculateScale(landmarks);

        // smoothing
        this.smooth.pos = this.lerp3(this.smooth.pos, pos, 0.25);
        this.smooth.rot = this.lerp3(this.smooth.rot, rot, 0.3);
        this.smooth.scale = Utils.ema(scale, this.smooth.scale, 0.25);

        jacket.position.set(
            this.smooth.pos.x,
            this.smooth.pos.y,
            this.smooth.pos.z
        );

        jacket.rotation.set(
            this.smooth.rot.x,
            this.smooth.rot.y,
            this.smooth.rot.z
        );

        jacket.scale.setScalar(this.smooth.scale);

        jacket.visible = true;
    }

    /* ================= HELPERS ================= */

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
