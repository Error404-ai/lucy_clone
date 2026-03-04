// skeleton-mapper.js — FIXED POSITIONING
//
// ROOT CAUSE OF OFF-BODY JACKET:
//   The old code computed targetScale as a raw multiplier before unitScale,
//   then _applyGroupTransform multiplied by unitScale again — but the
//   pelvis Y offset also needed to use effectiveScale.  When unitScale=0.01
//   and the model is authored in cm (e.g. pelvis at y=91), the mismatch
//   pushed the group 88 metres off-screen.
//
// THIS VERSION:
//   1. All scale math uses effectiveScale = rawScale × unitScale from the start
//   2. Pelvis offset uses the same effectiveScale
//   3. Video-aspect ratio is used throughout (not camera.aspect)
//   4. Simpler calibration: lock after 15 stable frames
//   5. Hip anchor is preferred; shoulder estimate is the fallback

class SkeletonMapper {
    constructor() {
        this.model          = null;
        this.jacketMeshes   = [];
        this.jacketMaterial = null;

        // Smooth tracking state
        this.smooth = {
            pos:   new THREE.Vector3(0, 0, 0),
            scale: 1.0,
            roll:  0,
            lean:  0,
        };

        // Calibration — collect a few frames to estimate stable depth
        this.cal = {
            ready:         false,
            frames:        0,
            FRAMES_NEEDED: 15,
            sumShoulderW:  0,
            shoulderWidth: null,
            depth:         null,
        };

        // Model geometry info (in model-local units, e.g. cm)
        this._modelW       = 1.0;   // jacket bbox width  in model units
        this._modelH       = 1.0;   // jacket bbox height in model units
        this._pelvisLocalY = 0.0;   // pelvis bone Y in model units

        this._fabricReady   = false;
        this.frameCount     = 0;
        this.initialized    = false;
    }

    // ─── INIT ─────────────────────────────────────────────────────────────────
    async init(videoWidth, videoHeight) {
        this.initialized = true;
        console.log('🦴 SkeletonMapper initialized');
        return true;
    }

    // ─── VIDEO ASPECT (always use video dims, not renderer dims) ──────────────
    _videoAspect() {
        const d = cameraManager.getDimensions();
        return (d && d.width && d.height) ? d.width / d.height : 16 / 9;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // JACKET SETUP — called by loader.js
    // ═══════════════════════════════════════════════════════════════════════════
    setJacket(model) {
        this.model        = model;
        this.jacketMeshes = modelLoader.getMeshes();

        // Measure jacket bounding box (jacket meshes only, not body)
        const bbox = new THREE.Box3();
        if (this.jacketMeshes.length > 0) {
            this.jacketMeshes.forEach(m => bbox.expandByObject(m));
        } else {
            bbox.setFromObject(model);
        }

        if (!bbox.isEmpty()) {
            const sz     = new THREE.Vector3();
            bbox.getSize(sz);
            this._modelW = sz.x > 0 ? sz.x : 1.0;
            this._modelH = sz.y > 0 ? sz.y : 1.0;
            console.log(`📐 Jacket bbox — W:${sz.x.toFixed(2)}  H:${sz.y.toFixed(2)}  (model units)`);
        }

        // Find pelvis Y in model units
        this._pelvisLocalY = this._findPelvisLocalY(model, bbox);
        console.log(`🦴 Pelvis anchor local Y: ${this._pelvisLocalY.toFixed(2)} model-units`);

        // Init bone animation
        const skeleton = modelLoader.getSkeleton();
        if (skeleton) {
            poseRetargeter.init(skeleton);
        }

        // Park jacket at safe centre while waiting for pose
        this._parkAtCenter();
        model.visible = true;
        console.log('🧥 Jacket visible — waiting for pose calibration');
    }

    // ─── Find pelvis bone Y in model-local space ──────────────────────────────
    _findPelvisLocalY(model, bbox) {
        const skeleton = modelLoader.getSkeleton();
        if (skeleton) {
            const bone = skeleton.bones.find(b => {
                const n = b.name.toLowerCase();
                return n === 'pelvis' || n === 'hips' ||
                       (n.includes('pelvis') && !n.includes('_l') && !n.includes('_r'));
            });
            if (bone) {
                model.updateWorldMatrix(true, true);
                const wPos = new THREE.Vector3();
                bone.getWorldPosition(wPos);
                const inv  = new THREE.Matrix4().copy(model.matrixWorld).invert();
                const lPos = wPos.clone().applyMatrix4(inv);
                console.log(`  pelvis world Y=${wPos.y.toFixed(3)} → local Y=${lPos.y.toFixed(3)}`);
                return lPos.y;
            }
        }
        // Fallback: bottom 8% of jacket height (rough hem position)
        if (!bbox.isEmpty()) {
            const sz = new THREE.Vector3();
            bbox.getSize(sz);
            return bbox.min.y + sz.y * 0.08;
        }
        return 0;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FABRIC APPLIED
    // ═══════════════════════════════════════════════════════════════════════════
    onFabricApplied() {
        this._fabricReady = true;
        if (this.model) this.model.visible = true;
        this.jacketMeshes = modelLoader.getMeshes();
        this.jacketMeshes.forEach(m => {
            if (m.material) {
                this.jacketMaterial = Array.isArray(m.material) ? m.material[0] : m.material;
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MAIN UPDATE — called every pose frame
    // ═══════════════════════════════════════════════════════════════════════════
    update(poseData) {
        if (!this.model) return;
        this.model.visible = true;
        this.frameCount++;

        const cam = sceneManager.getCamera();

        // ── No pose: park at centre ────────────────────────────────────────────
        if (!poseData || !poseData.landmarks) {
            const cp = this._centerPos(cam);
            const cs = this._centerScale(cam);
            this.smooth.pos.lerp(cp, 0.05);
            this.smooth.scale += (cs - this.smooth.scale) * 0.05;
            this._applyTransform(this.smooth.pos, this.smooth.scale, 0, 0);
            if (poseRetargeter.initialized) poseRetargeter.resetToRest();
            return;
        }

        const lm  = poseData.landmarks;
        const L   = CONFIG.SKELETON.LANDMARKS;
        const LS  = lm[L.LEFT_SHOULDER];
        const RS  = lm[L.RIGHT_SHOULDER];

        if (!LS || !RS || LS.visibility < 0.25 || RS.visibility < 0.25) {
            return; // hold last frame
        }

        // ── Calibration ───────────────────────────────────────────────────────
        if (!this.cal.ready) {
            this._calibrate(LS, RS, cam);
            this._parkAtCenter();
            return;
        }

        // ── Mirror X for front-facing camera ──────────────────────────────────
        //    MediaPipe x=0 is LEFT of the *mirror* image = user's RIGHT
        //    We flip so the jacket doesn't appear on the wrong side
        const mLSx = 1 - LS.x;
        const mRSx = 1 - RS.x;

        // Current shoulder width (normalised)
        const sw = Math.hypot(RS.x - LS.x, RS.y - LS.y);

        // Depth: inversely proportional to shoulder width
        const depth = THREE.MathUtils.clamp(
            this.cal.depth * (this.cal.shoulderWidth / Math.max(sw, 0.03)),
            0.4, 9.0
        );

        // ── Anchor point = mid-hip (or estimated from shoulders) ──────────────
        const LH = lm[L.LEFT_HIP];
        const RH = lm[L.RIGHT_HIP];
        let anchorNX, anchorNY;

        if (LH && RH && LH.visibility > 0.20 && RH.visibility > 0.20) {
            anchorNX = ((1 - LH.x) + (1 - RH.x)) * 0.5;
            anchorNY = (LH.y + RH.y) * 0.5;
        } else {
            // Estimate hips: midpoint of shoulders + 20% of frame height down
            anchorNX = (mLSx + mRSx) * 0.5;
            anchorNY = (LS.y + RS.y) * 0.5 + 0.20;
        }

        const worldAnchor = this._normToWorld(anchorNX, anchorNY, depth, cam);

        // ── Scale ─────────────────────────────────────────────────────────────
        // effectiveScale is the final THREE.js group scale (includes unitScale).
        // We want: jacket shoulder width in world space = detected shoulder width
        const unitScale       = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;
        const spanRatio       = CONFIG.RIG?.SHOULDER_SPAN_RATIO ?? 0.60;
        const jacketShouldWU  = this._modelW * spanRatio;          // in model units
        const jacketShouldWm  = jacketShouldWU * unitScale;        // in metres
        const worldShouldW    = this._normWidthToWorld(sw, depth, cam);
        const rawScale        = worldShouldW / Math.max(jacketShouldWm, 0.0001);
        const effectiveScale  = THREE.MathUtils.clamp(rawScale, 0.0001, 50.0);

        // ── Body roll & lean ──────────────────────────────────────────────────
        const roll = THREE.MathUtils.clamp(Math.atan2(RS.y - LS.y, RS.x - LS.x), -0.30, 0.30);
        const lean = (LS.z !== undefined && RS.z !== undefined)
            ? THREE.MathUtils.clamp((LS.z + RS.z) * 0.35, -0.25, 0.25) : 0;

        // ── Smooth ────────────────────────────────────────────────────────────
        this.smooth.pos.lerp(worldAnchor, 0.15);
        this.smooth.scale += (effectiveScale - this.smooth.scale) * 0.15;
        this.smooth.roll  += (roll  - this.smooth.roll)  * 0.08;
        this.smooth.lean  += (lean  - this.smooth.lean)  * 0.08;

        this._applyTransform(
            this.smooth.pos,
            this.smooth.scale,
            this.smooth.lean,
            this.smooth.roll
        );

        // Bone animation
        if (poseRetargeter.initialized) {
            poseRetargeter.update(lm, depth, cam);
        }

        // Debug log
        if (this.frameCount % 90 === 1) {
            console.log(
                `[f${this.frameCount}] sw=${sw.toFixed(3)} depth=${depth.toFixed(2)}m ` +
                `scale=${effectiveScale.toFixed(5)} anchor=(${worldAnchor.x.toFixed(2)},${worldAnchor.y.toFixed(2)})`
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // APPLY TRANSFORM
    //
    // worldPos  = where the PELVIS BONE should be in world space.
    // scale     = effectiveScale (already includes unitScale).
    //
    // Because group.position is the group ORIGIN (which is NOT the pelvis),
    // we shift:
    //   group.position.y = worldPos.y − pelvisLocalY × effectiveScale
    // ═══════════════════════════════════════════════════════════════════════════
    _applyTransform(worldPos, effectiveScale, lean, roll) {
        if (!this.model) return;

        const unitScale = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;
        const pos       = worldPos.clone();

        // Shift group origin so the pelvis bone lands on worldPos.y
        pos.y -= this._pelvisLocalY * effectiveScale;

        this.model.position.copy(pos);
        this.model.scale.setScalar(effectiveScale);
        this.model.rotation.order = 'YXZ';
        this.model.rotation.y = Math.PI;   // face the camera
        this.model.rotation.x = lean ?? 0;
        this.model.rotation.z = roll ?? 0;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CALIBRATION — 15 stable frames → estimate stable shoulder width & depth
    // ═══════════════════════════════════════════════════════════════════════════
    _calibrate(LS, RS, cam) {
        const sw = Math.hypot(RS.x - LS.x, RS.y - LS.y);
        this.cal.sumShoulderW += sw;
        this.cal.frames++;

        if (this.cal.frames >= this.cal.FRAMES_NEEDED) {
            this.cal.shoulderWidth = this.cal.sumShoulderW / this.cal.frames;

            // Estimate depth: assume real shoulder width ≈ 0.45 m
            const va    = this._videoAspect();
            const vFOV  = cam.fov * Math.PI / 180;
            const halfW = Math.tan(vFOV / 2) * va; // half-width at depth=1
            this.cal.depth = THREE.MathUtils.clamp(
                0.45 / (this.cal.shoulderWidth * 2 * halfW),
                0.5, 7.0
            );

            this.cal.ready = true;
            console.log(
                `✅ Calibrated — shoulderW=${this.cal.shoulderWidth.toFixed(3)} ` +
                `depth=${this.cal.depth.toFixed(2)}m`
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COORDINATE UTILITIES
    // ═══════════════════════════════════════════════════════════════════════════

    // Normalised screen coords → world-space THREE.Vector3
    _normToWorld(nx, ny, depth, cam) {
        const va    = this._videoAspect();
        const halfH = Math.tan(cam.fov * Math.PI / 360) * depth;
        const halfW = halfH * va;
        return new THREE.Vector3(
            (nx - 0.5) *  2 * halfW,
            (ny - 0.5) * -2 * halfH,
            -depth
        );
    }

    // Normalised width → world-space metres
    _normWidthToWorld(normW, depth, cam) {
        const va = this._videoAspect();
        return normW * 2 * Math.tan(cam.fov * Math.PI / 360) * depth * va;
    }

    // ─── Default position when no pose ───────────────────────────────────────
    _centerPos(cam) {
        const depth = 2.5;
        const halfH = Math.tan(cam.fov * Math.PI / 360) * depth;
        // Slightly below centre — typical upper-body camera framing
        return new THREE.Vector3(0, -halfH * 0.15, -depth);
    }

    _centerScale(cam) {
        if (!this.model || this._modelH <= 0) return 1.0;
        const depth      = 2.5;
        const unitScale  = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;
        const sceneH     = 2 * Math.tan(cam.fov * Math.PI / 360) * depth;
        const targetH    = sceneH * 0.40;   // jacket fills 40% of screen height
        // effectiveScale directly (includes unitScale)
        return THREE.MathUtils.clamp(targetH / (this._modelH * unitScale), 0.0001, 500.0);
    }

    _parkAtCenter() {
        const cam = sceneManager.getCamera();
        if (!cam || !this.model) return;
        const pos   = this._centerPos(cam);
        const scale = this._centerScale(cam);
        this._applyTransform(pos, scale, 0, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════
    recalibrate() {
        this.cal = { ready: false, frames: 0, FRAMES_NEEDED: 15,
                     sumShoulderW: 0, shoulderWidth: null, depth: null };
        this.smooth = { pos: new THREE.Vector3(), scale: 1, roll: 0, lean: 0 };
        if (poseRetargeter.initialized) poseRetargeter.resetToRest();
        console.log('🔄 Recalibrating...');
    }

    isCalibrated()     { return this.cal.ready; }
    reset()            { this.recalibrate(); }
    getShoulderWidth() { return this.cal.shoulderWidth ?? 0; }
    getBodyRotation()  { return this.smooth.lean; }
}

const skeletonMapper = new SkeletonMapper();