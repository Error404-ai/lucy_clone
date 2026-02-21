// skeleton-mapper.js — COMBINED RIG VERSION (shoulder-anchored + PoseRetargeter)
//
// Responsibilities:
//   1. Receive MediaPipe pose landmarks from app.js → update()
//   2. Compute where the jacket group ROOT should be positioned (skeleton root = hips)
//   3. Compute overall scale from shoulder width vs calibration
//   4. Delegate per-bone rotation to PoseRetargeter
//   5. Apply dynamic shading (roughness / env map tweaks per pose)
//
// COORDINATE SYSTEM
// ──────────────────
// MediaPipe:  x[0→1] left→right, y[0→1] top→bottom, z rough depth
// THREE.js:   x left→right, y bottom→top, z toward viewer
// Camera:     front-facing → MediaPipe x is MIRRORED (poseRetargeter handles this)

class SkeletonMapper {
    constructor() {
        this.model         = null;
        this.jacketMeshes  = [];
        this.jacketMaterial = null;

        // Smooth state (all values lerp each frame)
        this.smooth = {
            position: new THREE.Vector3(0, 0, 0),
            scale:    1.0,
            roll:     0,    // shoulder tilt Z
            lean:     0,    // forward lean X
        };

        // Calibration: measure the person's proportions over N frames
        this.cal = {
            ready:         false,
            frames:        0,
            FRAMES_NEEDED: 20,
            sumShoulderW:  0,
            ref: {
                shoulderWidth: null,
                depth:         null
            }
        };

        // Jacket geometry measurements (set in setJacket)
        this._modelW          = 1.0;   // jacket bounding-box width  (model units)
        this._modelH          = 1.0;   // jacket bounding-box height (model units)
        this._shoulderSeamY   = 0.0;   // local-space Y of shoulder seam

        // Dynamic shading
        this._baseEnvIntensity = 0.4;
        this.dynamicLight      = null;

        // Flags
        this._fabricReady = false;
        this.frameCount   = 0;
        this.initialized  = false;

        // Debug: log pose data every N frames
        this._DEBUG_INTERVAL = 90;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════════════════════════════════════

    async init(videoWidth, videoHeight) {
        this.initialized = true;
        console.log('🦴 SkeletonMapper ready (combined-rig, shoulder-anchored)');
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // JACKET SETUP — called by loader.js after GLB is parsed
    // ═══════════════════════════════════════════════════════════════════════════

    setJacket(model) {
        this.model = model;

        // Cache a representative material for dynamic shading
        model.traverse(child => {
            if ((child.isMesh || child.isSkinnedMesh) && child.visible && child.material) {
                this.jacketMaterial = Array.isArray(child.material)
                    ? child.material[0]
                    : child.material;
            }
        });

        // Measure the VISIBLE jacket geometry (not body mesh)
        // We build a bounding box from jacket meshes only
        const jacketMeshes = modelLoader.getMeshes();
        this.jacketMeshes  = jacketMeshes;

        let bbox = new THREE.Box3();
        if (jacketMeshes.length > 0) {
            jacketMeshes.forEach(m => bbox.expandByObject(m));
        } else {
            bbox.setFromObject(model);
        }

        if (bbox.isEmpty()) {
            console.warn('⚠️  Jacket bounding box is empty — using defaults');
            this._modelW = 1.0;
            this._modelH = 1.0;
            this._shoulderSeamY = 0.5;
        } else {
            const size = new THREE.Vector3();
            bbox.getSize(size);
            this._modelW = size.x > 0 ? size.x : 1.0;
            this._modelH = size.y > 0 ? size.y : 1.0;

            // Shoulder seam is empirically ~75–80% up from the hem.
            // Adjust this value in CONFIG.RIG.SHOULDER_SEAM_RATIO if the jacket
            // sits too high or too low on the person.
            const seamRatio = CONFIG.RIG?.SHOULDER_SEAM_RATIO ?? 0.78;
            this._shoulderSeamY = bbox.min.y + this._modelH * seamRatio;

            console.log(`Jacket bbox: W=${size.x.toFixed(3)} H=${size.y.toFixed(3)}`);
            console.log(`Shoulder seam local Y: ${this._shoulderSeamY.toFixed(3)} (ratio ${seamRatio})`);

            this._warnScaleIfNeeded(size);
        }

        // Initialise poseRetargeter with the skeleton
        const skeleton = modelLoader.getSkeleton();
        if (skeleton) {
            poseRetargeter.init(skeleton);
        } else {
            console.log('ℹ️  No skeleton — jacket will be positioned but not deformed by bones');
        }

        model.visible = false;
    }

    setDynamicLight(light) {
        this.dynamicLight = light;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FABRIC APPLIED — called by materials.js after material swap
    // ═══════════════════════════════════════════════════════════════════════════

    onFabricApplied() {
        this._fabricReady = true;

        // Refresh the cached material reference (it was just replaced)
        this.jacketMeshes.forEach(mesh => {
            if (mesh.material) {
                this.jacketMaterial = Array.isArray(mesh.material)
                    ? mesh.material[0]
                    : mesh.material;
            }
        });

        if (this.model) {
            // Show at a safe centre position while waiting for first pose
            const pos = this._safeCenterPosition();
            this._applyGroupTransform(pos, this._safeDefaultScale(), 0, 0);
            this.model.visible = true;
            console.log('🧥 Jacket visible — waiting for pose');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MAIN UPDATE — called every frame by app.js / onPoseUpdate
    // ═══════════════════════════════════════════════════════════════════════════

    update(poseData) {
        if (!this.model || !this._fabricReady) return;
        this.frameCount++;

        const cam = sceneManager.getCamera();

        // ── No pose detected: keep jacket at safe centre ──────────────────────
        if (!poseData || !poseData.landmarks) {
            this.smooth.position.lerp(this._safeCenterPosition(), 0.05);
            this.smooth.scale += (this._safeDefaultScale() - this.smooth.scale) * 0.05;
            this._applyGroupTransform(this.smooth.position, this.smooth.scale, 0, 0);
            poseRetargeter.resetToRest();
            this.model.visible = true;
            return;
        }

        const lm = poseData.landmarks;
        const L  = CONFIG.SKELETON.LANDMARKS;

        const LS  = lm[L.LEFT_SHOULDER];
        const RS  = lm[L.RIGHT_SHOULDER];
        const LH  = lm[L.LEFT_HIP];
        const RH  = lm[L.RIGHT_HIP];

        // Require both shoulders to be reasonably visible
        if (!LS || !RS || LS.visibility < 0.35 || RS.visibility < 0.35) {
            this.model.visible = true; // keep last pose
            return;
        }

        // ── Calibration phase ─────────────────────────────────────────────────
        if (!this.cal.ready) {
            this._accumulate(LS, RS);
            this.smooth.position.lerp(this._safeCenterPosition(), 0.05);
            this.smooth.scale += (this._safeDefaultScale() - this.smooth.scale) * 0.05;
            this._applyGroupTransform(this.smooth.position, this.smooth.scale, 0, 0);
            this.model.visible = true;

            if (this.frameCount % 5 === 0) {
                const pct = Math.round(this.cal.frames / this.cal.FRAMES_NEEDED * 100);
                console.log(`🔧 Calibrating… ${pct}%`);
            }
            return;
        }

        // ── Compute world-space shoulder position ─────────────────────────────
        // Mirror X for front-facing camera (MediaPipe left ↔ screen left are swapped)
        const mLS_x = 1 - LS.x, mRS_x = 1 - RS.x;
        const shoulderMidNX = (mLS_x + mRS_x) * 0.5;
        const shoulderMidNY = (LS.y  + RS.y)  * 0.5;

        const shoulderWidth  = Math.hypot(RS.x - LS.x, RS.y - LS.y);
        const ref            = this.cal.ref;

        // Depth from calibrated shoulder width (person moves closer → width grows)
        const depth = THREE.MathUtils.clamp(
            ref.depth * (ref.shoulderWidth / Math.max(shoulderWidth, 0.04)),
            0.3, 8.0
        );

        // World-space shoulder-line midpoint
        const worldShoulderPos = this._normToWorld(shoulderMidNX, shoulderMidNY, depth, cam);

        // ── Scale: match jacket shoulder width to person's shoulder width ──────
        const unitScale       = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;
        const jacketShoulderW = this._modelW * unitScale * (CONFIG.RIG?.SHOULDER_SPAN_RATIO ?? 0.60);
        const worldShoulderW  = this._normWidthToWorld(shoulderWidth, depth, cam);
        const targetScale     = THREE.MathUtils.clamp(
            worldShoulderW / Math.max(jacketShoulderW, 0.0001),
            0.001, 500.0
        );

        // ── Pose angles ──────────────────────────────────────────────────────
        const roll = THREE.MathUtils.clamp(
            Math.atan2(RS.y - LS.y, RS.x - LS.x), -0.30, 0.30
        );
        const lean = (LS.z !== undefined && RS.z !== undefined)
            ? THREE.MathUtils.clamp((LS.z + RS.z) * 0.35, -0.25, 0.25)
            : 0;

        // ── Smooth and apply ──────────────────────────────────────────────────
        const SMOOTH_POS   = 0.15;
        const SMOOTH_SCALE = 0.15;
        const SMOOTH_ROT   = 0.08;

        this.smooth.position.lerp(worldShoulderPos, SMOOTH_POS);
        this.smooth.scale += (targetScale - this.smooth.scale) * SMOOTH_SCALE;
        this.smooth.roll  += (roll - this.smooth.roll)         * SMOOTH_ROT;
        this.smooth.lean  += (lean - this.smooth.lean)         * SMOOTH_ROT;

        this._applyGroupTransform(
            this.smooth.position, this.smooth.scale,
            this.smooth.lean,     this.smooth.roll
        );

        // ── Bone retargeting (delegates to PoseRetargeter) ────────────────────
        if (poseRetargeter.initialized) {
            poseRetargeter.update(lm, depth, cam);
        }

        // ── Dynamic shading ───────────────────────────────────────────────────
        this._updateDynamicShading(lm, shoulderWidth);

        this.model.visible = true;

        // ── Debug log ─────────────────────────────────────────────────────────
        if (this.frameCount % this._DEBUG_INTERVAL === 0) {
            console.log(
                `[f${this.frameCount}] sw=${shoulderWidth.toFixed(3)} ` +
                `depth=${depth.toFixed(2)}m scale=${this.smooth.scale.toFixed(3)}`
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GROUP TRANSFORM
    // Positions the model GROUP so the jacket's shoulder seam lands at worldPos.
    // ═══════════════════════════════════════════════════════════════════════════

    _applyGroupTransform(worldPos, scale, lean, roll) {
        if (!this.model) return;

        const unitScale = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;
        const seam      = this._shoulderSeamY * unitScale;

        // Shift the group DOWN by (seam × scale) so the jacket's shoulder seam
        // lands at worldPos instead of the model origin landing there.
        const pos = worldPos.clone();
        pos.y -= seam * scale;

        this.model.position.copy(pos);
        this.model.scale.setScalar(scale);
        this.model.rotation.order = 'YXZ';
        this.model.rotation.y = Math.PI;   // face camera (Blender -Z forward → THREE +Z)
        this.model.rotation.x = lean ?? 0;
        this.model.rotation.z = roll ?? 0;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CALIBRATION
    // ═══════════════════════════════════════════════════════════════════════════

    _accumulate(LS, RS) {
        this.cal.sumShoulderW += Math.hypot(RS.x - LS.x, RS.y - LS.y);
        this.cal.frames++;

        if (this.cal.frames >= this.cal.FRAMES_NEEDED) {
            this._lockCalibration();
        }
    }

    _lockCalibration() {
        const n   = this.cal.frames;
        const ref = this.cal.ref;

        ref.shoulderWidth = this.cal.sumShoulderW / n;

        const cam = sceneManager.getCamera();
       ref.depth = THREE.MathUtils.clamp(
    0.45 / (ref.shoulderWidth * 2 *
        Math.tan(cam.fov * Math.PI / 180 / 2) * cam.aspect),
    1.5, 7.0   // was 0.3
);

        this.cal.ready = true;
        console.log(
            `✅ Calibration done — sw=${ref.shoulderWidth.toFixed(3)} ` +
            `depth=${ref.depth.toFixed(2)}m`
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SAFE DEFAULTS (no pose / pre-calibration)
    // ═══════════════════════════════════════════════════════════════════════════

    _safeCenterPosition() {
        const depth = 2.5;
        const cam   = sceneManager.getCamera();
        const halfH = Math.tan(cam.fov * Math.PI / 360) * depth;
        // Place slightly above centre (chest area)
        return new THREE.Vector3(0, halfH * 0.10, -depth);
    }

    _safeDefaultScale() {
        if (!this.model || this._modelH <= 0) return 1.0;
        const depth   = 2.5;
        const cam     = sceneManager.getCamera();
        const sceneH  = 2 * Math.tan(cam.fov * Math.PI / 360) * depth;
        const targetH = sceneH * 0.40;   // jacket fills 40% of view height
        const unitScale = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;
        return THREE.MathUtils.clamp(targetH / (this._modelH * unitScale), 0.001, 500.0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DYNAMIC SHADING — roughness & env map shift with body rotation
    // ═══════════════════════════════════════════════════════════════════════════

    _updateDynamicShading(lm, shoulderWidth) {
        const mat = this.jacketMaterial;
        if (!mat) return;

        const L  = CONFIG.SKELETON.LANDMARKS;
        const LS = lm[L.LEFT_SHOULDER];
        const RS = lm[L.RIGHT_SHOULDER];
        if (!LS || !RS) return;

        // Body rotation (side-on vs frontal)
        const turn = THREE.MathUtils.clamp((LS.z - RS.z) * 3.0, -1, 1);

        // Roughness increases when jacket stretches (person's shoulders wider than calibration)
        if (mat.roughness !== undefined && this.cal.ref.shoulderWidth) {
            const stretch = (shoulderWidth - this.cal.ref.shoulderWidth) / this.cal.ref.shoulderWidth;
            const targetR = THREE.MathUtils.clamp(0.75 + stretch * 0.3, 0.35, 1.0);
            mat.roughness += (targetR - mat.roughness) * 0.08;
        }

        // Env map intensity increases when turning side-on (more specular hit)
        if (mat.envMapIntensity !== undefined) {
            const targetE = this._baseEnvIntensity + Math.abs(turn) * 0.7;
            mat.envMapIntensity += (targetE - mat.envMapIntensity) * 0.06;
        }

        // Move dynamic fill light to simulate turn lighting
        if (this.dynamicLight) {
            this.dynamicLight.position.x +=
                (-turn * 2.5 - this.dynamicLight.position.x) * 0.05;

            if (this.cal.ref.shoulderWidth) {
                const proxR = THREE.MathUtils.clamp(
                    shoulderWidth / this.cal.ref.shoulderWidth, 0.4, 2.0
                );
                this.dynamicLight.intensity +=
                    (proxR - this.dynamicLight.intensity) * 0.04;
            }
        }

        mat.needsUpdate = true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COORDINATE UTILITIES
    // ═══════════════════════════════════════════════════════════════════════════

    _normToWorld(nx, ny, depth, cam) {
        const halfH = Math.tan(cam.fov * Math.PI / 360) * depth;
        const halfW = halfH * cam.aspect;
        return new THREE.Vector3(
            (nx - 0.5) *  2 * halfW,
            (ny - 0.5) * -2 * halfH,
            -depth
        );
    }

    _normWidthToWorld(normWidth, depth, cam) {
        return normWidth * 2 *
            Math.tan(cam.fov * Math.PI / 360) * depth * cam.aspect;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SCALE VALIDATION (warning only, fired at load time)
    // ═══════════════════════════════════════════════════════════════════════════

    _warnScaleIfNeeded(size) {
        const unitScale = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;
        const scaledW   = size.x * unitScale;

        if (scaledW > 10) {
            console.warn(
                `⚠️  Jacket is very wide (${scaledW.toFixed(2)} m after scale). ` +
                `Try CONFIG.JACKET.MODEL_UNIT_SCALE = 0.01`
            );
        } else if (scaledW < 0.05) {
            console.warn(
                `⚠️  Jacket is very narrow (${scaledW.toFixed(4)} m after scale). ` +
                `Try CONFIG.JACKET.MODEL_UNIT_SCALE = 10`
            );
        } else {
            console.log(`✅ Jacket scale OK — width ~${scaledW.toFixed(3)} m`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════

    /** Force fresh calibration (e.g. after camera switch) */
    recalibrate() {
        this.cal = {
            ready: false, frames: 0, FRAMES_NEEDED: 20,
            sumShoulderW: 0,
            ref: { shoulderWidth: null, depth: null }
        };
        this.smooth = {
            position: new THREE.Vector3(),
            scale: 1, roll: 0, lean: 0
        };
        poseRetargeter.resetToRest();
        if (this.model) this.model.visible = false;
        console.log('🔄 Recalibrating…');
    }

    setFabricReflectivity(v) {
        this._baseEnvIntensity = THREE.MathUtils.clamp(v, 0, 1);
    }

    isCalibrated() { return this.cal.ready; }
    reset()        { this.recalibrate(); }

    // Legacy helpers kept for compatibility with pose-tracker / materials
    getShoulderWidth()  {
        return this.cal.ref.shoulderWidth ?? 0;
    }

    getBodyRotation() {
        // Returns approximate left-right rotation of body (0 = frontal)
        return this.smooth.lean;
    }
}

const skeletonMapper = new SkeletonMapper();