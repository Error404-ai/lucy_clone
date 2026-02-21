// skeleton-mapper.js — COMBINED RIG VERSION (shoulder-anchored + PoseRetargeter)
// Key fix: uses VIDEO aspect ratio (1.778) not canvas aspect (3.66+) for all
// coordinate conversions. MediaPipe landmarks are normalized to video dimensions.

class SkeletonMapper {
    constructor() {
        this.model          = null;
        this.jacketMeshes   = [];
        this.jacketMaterial = null;

        this.smooth = {
            position: new THREE.Vector3(0, 0, 0),
            scale:    1.0,
            roll:     0,
            lean:     0,
        };

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

        this._modelW        = 1.0;
        this._modelH        = 1.0;
        this._shoulderSeamY = 0.0;

        this._baseEnvIntensity = 0.4;
        this.dynamicLight      = null;

        this._fabricReady = false;
        this.frameCount   = 0;
        this.initialized  = false;

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
    // VIDEO ASPECT — THE KEY FIX
    // MediaPipe gives landmarks normalised to video frame (e.g. 1280×720 = 1.778).
    // The THREE.js canvas can be much wider (aspect 3.66 on a wide monitor with
    // the fabric panel taking vertical space). Using canvas aspect inflates every
    // world-space width calculation by ~2×, making scale=5+ and the jacket huge.
    // Always use VIDEO aspect for MediaPipe → world-space conversions.
    // ═══════════════════════════════════════════════════════════════════════════

    _getVideoAspect() {
        const dims = cameraManager.getDimensions();
        if (dims && dims.width && dims.height) {
            return dims.width / dims.height;
        }
        return 16 / 9; // safe fallback (1.778)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // JACKET SETUP — called by loader.js after GLB is parsed
    // ═══════════════════════════════════════════════════════════════════════════

    setJacket(model) {
        this.model = model;

        // Cache representative material for dynamic shading tweaks
        model.traverse(child => {
            if ((child.isMesh || child.isSkinnedMesh) && child.visible && child.material) {
                this.jacketMaterial = Array.isArray(child.material)
                    ? child.material[0]
                    : child.material;
            }
        });

        // Measure ONLY the visible jacket meshes for bounding box
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
            this._modelW        = 1.0;
            this._modelH        = 1.0;
            this._shoulderSeamY = 0.5;
        } else {
            const size = new THREE.Vector3();
            bbox.getSize(size);
            this._modelW = size.x > 0 ? size.x : 1.0;
            this._modelH = size.y > 0 ? size.y : 1.0;

            const seamRatio     = CONFIG.RIG?.SHOULDER_SEAM_RATIO ?? 0.78;
            this._shoulderSeamY = bbox.min.y + this._modelH * seamRatio;

            console.log(`Jacket bbox: W=${size.x.toFixed(3)} H=${size.y.toFixed(3)}`);
            console.log(`Shoulder seam local Y: ${this._shoulderSeamY.toFixed(3)} (ratio ${seamRatio})`);
            this._warnScaleIfNeeded(size);
        }

        // Initialise bone retargeter with the shared skeleton
        const skeleton = modelLoader.getSkeleton();
        if (skeleton) {
            poseRetargeter.init(skeleton);
        } else {
            console.log('ℹ️  No skeleton found — jacket positioned only, no bone deformation');
        }

        model.visible = false;
    }

    setDynamicLight(light) { this.dynamicLight = light; }

    // ═══════════════════════════════════════════════════════════════════════════
    // FABRIC APPLIED — called by materials.js after material swap
    // ═══════════════════════════════════════════════════════════════════════════

    onFabricApplied() {
        this._fabricReady = true;

        // Refresh material reference (was just replaced by materialsManager)
        this.jacketMeshes.forEach(mesh => {
            if (mesh.material) {
                this.jacketMaterial = Array.isArray(mesh.material)
                    ? mesh.material[0]
                    : mesh.material;
            }
        });

        if (this.model) {
            const pos = this._safeCenterPosition();
            this._applyGroupTransform(pos, this._safeDefaultScale(), 0, 0);
            this.model.visible = true;
            console.log('🧥 Jacket visible — waiting for pose');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MAIN UPDATE — called every frame by app.js → onPoseUpdate
    // ═══════════════════════════════════════════════════════════════════════════

    update(poseData) {
        if (!this.model || !this._fabricReady) return;
        this.frameCount++;

        const cam = sceneManager.getCamera();

        // No pose: hold at safe centre
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

        const LS = lm[L.LEFT_SHOULDER];
        const RS = lm[L.RIGHT_SHOULDER];

        if (!LS || !RS || LS.visibility < 0.35 || RS.visibility < 0.35) {
            this.model.visible = true; // keep last position
            return;
        }

        // Calibration phase
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

        // Mirror X — front-facing camera reverses MediaPipe's left/right
        const mLS_x        = 1 - LS.x;
        const mRS_x        = 1 - RS.x;
        const shoulderMidNX = (mLS_x + mRS_x) * 0.5;
        const shoulderMidNY = (LS.y  + RS.y)  * 0.5;

        const shoulderWidth = Math.hypot(RS.x - LS.x, RS.y - LS.y);
        const ref           = this.cal.ref;

        // Depth scales inversely with apparent shoulder width
        const depth = THREE.MathUtils.clamp(
            ref.depth * (ref.shoulderWidth / Math.max(shoulderWidth, 0.04)),
            0.5, 8.0
        );

        // World-space shoulder midpoint using VIDEO aspect
        const worldShoulderPos = this._normToWorld(shoulderMidNX, shoulderMidNY, depth, cam);

        // Scale: match jacket shoulder span to detected shoulder width
        const unitScale       = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;
        const jacketShoulderW = this._modelW * unitScale * (CONFIG.RIG?.SHOULDER_SPAN_RATIO ?? 0.60);
        const worldShoulderW  = this._normWidthToWorld(shoulderWidth, depth, cam);
        const targetScale     = THREE.MathUtils.clamp(
            worldShoulderW / Math.max(jacketShoulderW, 0.0001),
            0.001, 500.0
        );

        // Pose angles
        const roll = THREE.MathUtils.clamp(
            Math.atan2(RS.y - LS.y, RS.x - LS.x), -0.30, 0.30
        );
        const lean = (LS.z !== undefined && RS.z !== undefined)
            ? THREE.MathUtils.clamp((LS.z + RS.z) * 0.35, -0.25, 0.25)
            : 0;

        // Smooth everything
        this.smooth.position.lerp(worldShoulderPos, 0.15);
        this.smooth.scale += (targetScale - this.smooth.scale) * 0.15;
        this.smooth.roll  += (roll - this.smooth.roll)         * 0.08;
        this.smooth.lean  += (lean - this.smooth.lean)         * 0.08;

        this._applyGroupTransform(
            this.smooth.position, this.smooth.scale,
            this.smooth.lean,     this.smooth.roll
        );

        // Bone retargeting
        if (poseRetargeter.initialized) {
            poseRetargeter.update(lm, depth, cam);
        }

        this._updateDynamicShading(lm, shoulderWidth);
        this.model.visible = true;

        if (this.frameCount % this._DEBUG_INTERVAL === 0) {
            console.log(
                `[f${this.frameCount}] sw=${shoulderWidth.toFixed(3)} ` +
                `depth=${depth.toFixed(2)}m scale=${this.smooth.scale.toFixed(3)}`
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GROUP TRANSFORM
    // Shifts model DOWN by (shoulderSeam × scale) so jacket seam = worldPos.y
    // ═══════════════════════════════════════════════════════════════════════════

    _applyGroupTransform(worldPos, scale, lean, roll) {
        if (!this.model) return;

        const unitScale = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;
        const seam      = this._shoulderSeamY * unitScale;

        const pos = worldPos.clone();
        pos.y -= seam * scale;

        this.model.position.copy(pos);
        this.model.scale.setScalar(scale);
        this.model.rotation.order = 'YXZ';
        this.model.rotation.y = Math.PI; // face camera
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

        const cam         = sceneManager.getCamera();
        const videoAspect = this._getVideoAspect(); // ← VIDEO aspect, not cam.aspect

        ref.depth = THREE.MathUtils.clamp(
            0.45 / (ref.shoulderWidth * 2 *
                Math.tan(cam.fov * Math.PI / 180 / 2) * videoAspect),
            0.5, 7.0
        );

        this.cal.ready = true;
        console.log(
            `✅ Calibration done — sw=${ref.shoulderWidth.toFixed(3)} ` +
            `depth=${ref.depth.toFixed(2)}m`
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SAFE DEFAULTS (pre-calibration / no pose)
    // ═══════════════════════════════════════════════════════════════════════════

    _safeCenterPosition() {
        const depth = 2.5;
        const cam   = sceneManager.getCamera();
        const halfH = Math.tan(cam.fov * Math.PI / 360) * depth;
        return new THREE.Vector3(0, halfH * 0.10, -depth);
    }

    _safeDefaultScale() {
        if (!this.model || this._modelH <= 0) return 1.0;
        const depth     = 2.5;
        const cam       = sceneManager.getCamera();
        const sceneH    = 2 * Math.tan(cam.fov * Math.PI / 360) * depth;
        const targetH   = sceneH * 0.40;
        const unitScale = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;
        return THREE.MathUtils.clamp(targetH / (this._modelH * unitScale), 0.001, 500.0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DYNAMIC SHADING
    // ═══════════════════════════════════════════════════════════════════════════

    _updateDynamicShading(lm, shoulderWidth) {
        const mat = this.jacketMaterial;
        if (!mat) return;

        const L  = CONFIG.SKELETON.LANDMARKS;
        const LS = lm[L.LEFT_SHOULDER];
        const RS = lm[L.RIGHT_SHOULDER];
        if (!LS || !RS) return;

        const turn = THREE.MathUtils.clamp((LS.z - RS.z) * 3.0, -1, 1);

        if (mat.roughness !== undefined && this.cal.ref.shoulderWidth) {
            const stretch = (shoulderWidth - this.cal.ref.shoulderWidth) / this.cal.ref.shoulderWidth;
            const targetR = THREE.MathUtils.clamp(0.75 + stretch * 0.3, 0.35, 1.0);
            mat.roughness += (targetR - mat.roughness) * 0.08;
        }

        if (mat.envMapIntensity !== undefined) {
            const targetE = this._baseEnvIntensity + Math.abs(turn) * 0.7;
            mat.envMapIntensity += (targetE - mat.envMapIntensity) * 0.06;
        }

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
    // COORDINATE UTILITIES — both use VIDEO aspect ratio, not canvas aspect
    // ═══════════════════════════════════════════════════════════════════════════

    _normToWorld(nx, ny, depth, cam) {
        const videoAspect = this._getVideoAspect();
        const halfH = Math.tan(cam.fov * Math.PI / 360) * depth;
        const halfW = halfH * videoAspect;
        return new THREE.Vector3(
            (nx - 0.5) *  2 * halfW,
            (ny - 0.5) * -2 * halfH,
            -depth
        );
    }

    _normWidthToWorld(normWidth, depth, cam) {
        const videoAspect = this._getVideoAspect();
        return normWidth * 2 *
            Math.tan(cam.fov * Math.PI / 360) * depth * videoAspect;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SCALE VALIDATION
    // ═══════════════════════════════════════════════════════════════════════════

    _warnScaleIfNeeded(size) {
        const unitScale = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;
        const scaledW   = size.x * unitScale;

        if (scaledW > 10) {
            console.warn(`⚠️  Jacket very wide (${scaledW.toFixed(2)} m). Try MODEL_UNIT_SCALE = 0.01`);
        } else if (scaledW < 0.05) {
            console.warn(`⚠️  Jacket very narrow (${scaledW.toFixed(4)} m). Try MODEL_UNIT_SCALE = 10`);
        } else {
            console.log(`✅ Jacket scale OK — width ~${scaledW.toFixed(3)} m`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════

    recalibrate() {
        this.cal = {
            ready: false, frames: 0, FRAMES_NEEDED: 20,
            sumShoulderW: 0,
            ref: { shoulderWidth: null, depth: null }
        };
        this.smooth = { position: new THREE.Vector3(), scale: 1, roll: 0, lean: 0 };
        poseRetargeter.resetToRest();
        if (this.model) this.model.visible = false;
        console.log('🔄 Recalibrating…');
    }

    setFabricReflectivity(v) { this._baseEnvIntensity = THREE.MathUtils.clamp(v, 0, 1); }
    isCalibrated()     { return this.cal.ready; }
    reset()            { this.recalibrate(); }
    getShoulderWidth() { return this.cal.ref.shoulderWidth ?? 0; }
    getBodyRotation()  { return this.smooth.lean; }
}

const skeletonMapper = new SkeletonMapper();