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

    /* ---------- TORSO CENTER ---------- */

    const cx = (LS.x + RS.x + LH.x + RH.x) / 4;
    const cy = (LS.y + RS.y) / 2;

    /* ---------- CORRECT AR DEPTH ---------- */
    // THIS is the real fix
    const DEPTH = 3.8;   // was 2.2 → camera was inside jacket

const worldPos = compositeRenderer.getWorldPositionFromScreen(cx, cy, DEPTH);

// push jacket backward so camera is outside chest
const camera = sceneManager.getCamera();
const viewDir = worldPos.clone().sub(camera.position).normalize();
worldPos.add(viewDir.multiplyScalar(0.45));
    this.smooth.position.lerp(worldPos, 0.25);
    this.model.position.copy(this.smooth.position);

    /* ---------- SCALE ---------- */

    const shoulderDist = Math.sqrt(
        (LS.x - RS.x) ** 2 +
        (LS.y - RS.y) ** 2
    );

    let targetScale = 1.6 / shoulderDist;
    targetScale = THREE.MathUtils.clamp(targetScale, 1.2, 2.8);

    this.smooth.scale += (targetScale - this.smooth.scale) * 0.25;
    this.model.scale.setScalar(this.smooth.scale);

    /* ---------- ROTATION ---------- */

    const dx = RS.x - LS.x;
    const dy = RS.y - LS.y;
    const roll = Math.atan2(dy, dx);

    this.model.rotation.set(0, Math.PI, -roll * 0.7);

    this.model.visible = true;
}
}
const skeletonMapper = new SkeletonMapper();