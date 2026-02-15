class SkeletonMapper {
    constructor() {
        this.model = null;
        this.smooth = {
            position: new THREE.Vector3(),
            scale: 1.6
        };
        this.initialized = false;
    }

    async init() {
        console.log('🦴 SkeletonMapper ready (3D mode)');
        this.initialized = true;
        return true;
    }

    setJacket(model) {
        this.model = model;
        console.log('🔗 Jacket attached to body tracking');
    }

    showInCenter() {
        if (!this.model) return;

        this.model.position.set(0, 0, -2.5);
        this.model.scale.setScalar(1.6);
        this.model.visible = true;
    }

 update(landmarks) {
    if (!this.model || !landmarks) {
        this.showInCenter();
        return;
    }

    const LS = landmarks[11];
    const RS = landmarks[12];
    const LH = landmarks[23];
    const RH = landmarks[24];

    if (!LS || !RS || !LH || !RH) {
        this.showInCenter();
        return;
    }

    /* ---------- POSITION (torso center in real 3D) ---------- */

    const cx = (LS.x + RS.x + LH.x + RH.x) / 4;
    const cy = (LS.y + RS.y) / 2;

    const worldCenter = compositeRenderer.getWorldPositionFromScreen(cx, cy, 2.2);

    this.smooth.position.lerp(worldCenter, 0.25);
    this.model.position.copy(this.smooth.position);

    /* ---------- SCALE (REAL body width, not pixels) ---------- */

    const leftWorld  = compositeRenderer.getWorldPositionFromScreen(LS.x, LS.y, 2.2);
    const rightWorld = compositeRenderer.getWorldPositionFromScreen(RS.x, RS.y, 2.2);

    const shoulderWorldDist = leftWorld.distanceTo(rightWorld);

    let targetScale = shoulderWorldDist * 3.2;
    targetScale = THREE.MathUtils.clamp(targetScale, 0.9, 3.0);

    this.smooth.scale += (targetScale - this.smooth.scale) * 0.25;
    this.model.scale.setScalar(this.smooth.scale);

    /* ---------- ROTATION (true body yaw) ---------- */

    const dx = rightWorld.x - leftWorld.x;
    const dz = rightWorld.z - leftWorld.z;

    const bodyYaw = Math.atan2(dz, dx);

    this.model.rotation.set(0, -bodyYaw + Math.PI / 2, 0);

    this.model.visible = true;
}
}

const skeletonMapper = new SkeletonMapper();