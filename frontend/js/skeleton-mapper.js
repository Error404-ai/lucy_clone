// skeleton-mapper.js — SHOULDER-ANCHORED VERSION
// Root fix: world target is placed AT the shoulder line (not at torso).
// The jacket model is then shifted DOWN so its OWN shoulder seams land
// on that same point. This makes the jacket sit on the body, not float above.

class SkeletonMapper {
    constructor() {
        this.model         = null;
        this.skeleton      = null;
        this.bones         = {};
        this.boneMatrices  = {};
        this.initialized   = false;

        this.smooth = {
            position:      new THREE.Vector3(0, 0, 0),
            scale:         1.0,
            roll:          0,
            lean:          0,
            boneRotations: {}
        };

        this.cal = {
            ready:         false,
            frames:        0,
            FRAMES_NEEDED: 15,
            sum:  { shoulderWidth: 0, torsoHeight: 0 },
            ref:  { shoulderWidth: null, torsoHeight: null, depth: null }
        };

        this.jacketMaterial    = null;
        this.dynamicLight      = null;
        this._baseEnvIntensity = 0.4;

        this._modelW = 1.0;
        this._modelH = 1.0;

        // How far the jacket shoulder seam is above the model local origin.
        // We subtract (this * unitScale * scale) from world Y in _applyTransform
        // so the seam lands exactly on the detected shoulder position.
        this._shoulderSeamY = 0;

        this.frameCount   = 0;
        this.debugMode    = true;
        this._fabricReady = false;
    }

    async init(videoWidth, videoHeight) {
        this.initialized = true;
        console.log('🦴 SkeletonMapper ready (shoulder-anchored)');
        return true;
    }

    // ── Called by materials.js once fabric applied ───────────────────────────
    onFabricApplied() {
        this._fabricReady = true;
        if (this.model) {
            const pos = this._safeCenterPosition();
            this._applyTransform(pos, this._safeDefaultScale(), 0, 0);
            this.model.visible = true;
            console.log('🧥 Jacket visible at center (waiting for pose)');
        }
    }

    // ── Safe center position: chest height, always on screen ────────────────
    _safeCenterPosition() {
        const depth = 2.5;
        const cam   = sceneManager.getCamera();
        const halfH = Math.tan(cam.fov * Math.PI / 360) * depth;
        return new THREE.Vector3(0, halfH * 0.10, -depth);
    }

    _safeDefaultScale() {
        if (!this.model || this._modelH <= 0) return 1.0;
        const depth   = 2.5;
        const cam     = sceneManager.getCamera();
        const sceneH  = 2 * Math.tan(cam.fov * Math.PI / 360) * depth;
        const targetH = sceneH * 0.40;
        return THREE.MathUtils.clamp(targetH / this._modelH, 0.001, 500.0);
    }

    // ── Attach model ─────────────────────────────────────────────────────────
    setJacket(model) {
        this.model = model;

        let mesh = null;
        model.traverse(c => { if (c.isSkinnedMesh && !mesh) mesh = c; });
        if (!mesh) model.traverse(c => { if (c.isMesh && !mesh) mesh = c; });
        if (!mesh) { console.error('No mesh found'); return; }

        if (mesh.material) this.jacketMaterial = mesh.material;

        this.skeleton = mesh.skeleton || null;
        if (this.skeleton) {
            console.log(`Skeleton: ${this.skeleton.bones.length} bones`);
            this._mapBones();
            this._cacheRestPose();
        }

        model.visible = false;

        // Measure jacket geometry
        const bbox = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        bbox.getSize(size);

        this._modelW = size.x > 0 ? size.x : 1.0;
        this._modelH = size.y > 0 ? size.y : 1.0;

        // Shoulder seam is ~78% up from hem (bottom of jacket).
        // bbox.min.y is the hem in model-local space.
        this._shoulderSeamY = bbox.min.y + this._modelH * 0.78;

        console.log(`Jacket: W=${size.x.toFixed(3)} H=${size.y.toFixed(3)}`);
        console.log(`Shoulder seam local Y: ${this._shoulderSeamY.toFixed(3)}`);

        if (size.x > 10)   console.warn('Model W > 10 — try MODEL_UNIT_SCALE=0.01');
        else if (size.x < 0.05) console.warn('Model W < 0.05 — try MODEL_UNIT_SCALE=10');
        else console.log('Model unit scale looks correct');
    }

    setDynamicLight(light) { this.dynamicLight = light; }

    // ── Calibration ──────────────────────────────────────────────────────────
    _accumulate(LS, RS, LH, RH) {
        this.cal.sum.shoulderWidth += Math.hypot(RS.x - LS.x, RS.y - LS.y);

        const hipsOK = LH && RH && LH.visibility > 0.3 && RH.visibility > 0.3;
        if (hipsOK)
            this.cal.sum.torsoHeight += Math.abs(((LH.y + RH.y) / 2) - ((LS.y + RS.y) / 2));

        this.cal.frames++;
        if (this.cal.frames >= this.cal.FRAMES_NEEDED) this._lockCalibration(hipsOK);
    }

    _lockCalibration(hasHips) {
        const n = this.cal.frames;
        const r = this.cal.ref;

        r.shoulderWidth = this.cal.sum.shoulderWidth / n;
        r.torsoHeight   = hasHips ? this.cal.sum.torsoHeight / n : r.shoulderWidth * 1.4;

        const cam = sceneManager.getCamera();
        r.depth = THREE.MathUtils.clamp(
            0.45 / (r.shoulderWidth * 2 * Math.tan(cam.fov * Math.PI / 180 / 2) * cam.aspect),
            0.3, 6.0
        );

        this.cal.ready = true;
        console.log(`Calibration done: sw=${r.shoulderWidth.toFixed(3)} depth=${r.depth.toFixed(2)}m`);
    }

    // ── Main update ───────────────────────────────────────────────────────────
    update(poseData) {
        if (!this.model || !this._fabricReady) return;
        this.frameCount++;

        // No pose: keep jacket at safe center
        if (!poseData || !poseData.landmarks) {
            const pos = this._safeCenterPosition();
            this.smooth.position.lerp(pos, 0.05);
            this.smooth.scale += (this._safeDefaultScale() - this.smooth.scale) * 0.05;
            this._applyTransform(this.smooth.position, this.smooth.scale, 0, 0);
            if (this.skeleton) this._resetToRestPose();
            this.model.visible = true;
            return;
        }

        const lm = poseData.landmarks;
        const L  = CONFIG.SKELETON.LANDMARKS;

        const LS = lm[L.LEFT_SHOULDER],  RS = lm[L.RIGHT_SHOULDER];
        const LH = lm[L.LEFT_HIP],       RH = lm[L.RIGHT_HIP];
        const LE = lm[L.LEFT_ELBOW],     RE = lm[L.RIGHT_ELBOW];
        const LW = lm[L.LEFT_WRIST],     RW = lm[L.RIGHT_WRIST];

        if (!LS || !RS || LS.visibility < 0.35 || RS.visibility < 0.35) {
            this.model.visible = true; // keep last position
            return;
        }

        // Calibration phase: show at center meanwhile
        if (!this.cal.ready) {
            this._accumulate(LS, RS, LH, RH);
            const pos = this._safeCenterPosition();
            this.smooth.position.lerp(pos, 0.05);
            this.smooth.scale += (this._safeDefaultScale() - this.smooth.scale) * 0.05;
            this._applyTransform(this.smooth.position, this.smooth.scale, 0, 0);
            this.model.visible = true;
            if (this.frameCount % 5 === 0)
                console.log(`Calibrating ${Math.round(this.cal.frames / this.cal.FRAMES_NEEDED * 100)}%`);
            return;
        }

        const ref = this.cal.ref;

        // Mirror X (front camera is flipped vs MediaPipe coords)
        const shoulderMidX = ((1 - LS.x) + (1 - RS.x)) * 0.5;
        const shoulderMidY = (LS.y + RS.y) * 0.5;  // anchor at actual shoulders

        const shoulderWidth = Math.hypot(RS.x - LS.x, RS.y - LS.y);

        // Depth: scales with how big shoulders appear vs calibrated size
        const depth = THREE.MathUtils.clamp(
            ref.depth * (ref.shoulderWidth / Math.max(shoulderWidth, 0.05)),
            0.3, 7.0
        );

        // ─────────────────────────────────────────────────────────────────────
        // ANCHOR = person's actual shoulder line in 3D world space
        // _applyTransform will shift jacket DOWN so its seam lands here
        // ─────────────────────────────────────────────────────────────────────
        const worldShoulderPos = this._normToWorld(shoulderMidX, shoulderMidY, depth);

        // Scale: jacket shoulder width matches person shoulder width
        const wsWidth          = this._normWidthToWorld(shoulderWidth, depth);
        const unitScale        = CONFIG.JACKET.MODEL_UNIT_SCALE || 1.0;
        const jacketShoulderW = this._modelW * unitScale * 0.60;  // ~85% of bbox is shoulder span
        const targetScale      = THREE.MathUtils.clamp(
            wsWidth / Math.max(jacketShoulderW, 0.0001),
            0.001, 500.0
        );

        // Roll (shoulder tilt) and lean (depth rotation)
        const roll = THREE.MathUtils.clamp(
            Math.atan2(RS.y - LS.y, RS.x - LS.x), -0.26, 0.26
        );
        const lean = (LS.z !== undefined && RS.z !== undefined)
            ? THREE.MathUtils.clamp((LS.z + RS.z) * 0.4, -0.3, 0.3)
            : 0;

        // Smooth everything
        this.smooth.position.lerp(worldShoulderPos, 0.15);
        this.smooth.scale += (targetScale - this.smooth.scale) * 0.15;
        this.smooth.roll  += (roll - this.smooth.roll) * 0.08;
        this.smooth.lean  += (lean - this.smooth.lean) * 0.08;

        this._applyTransform(
            this.smooth.position, this.smooth.scale,
            this.smooth.lean, this.smooth.roll
        );

        if (this.skeleton) {
            this._updateSpine(lm);
            this._updateArm('left',  LS, LE, LW);
            this._updateArm('right', RS, RE, RW);
            this._updateNeck(lm);
        }

        this._updateDynamicShading(lm, shoulderWidth);
        this.model.visible = true;

        if (this.debugMode && this.frameCount % 90 === 0)
            console.log(`[f${this.frameCount}] sw=${shoulderWidth.toFixed(3)} depth=${depth.toFixed(2)}m scale=${this.smooth.scale.toFixed(3)}`);
    }

    // ─── _applyTransform ─────────────────────────────────────────────────────
    // worldPos = person's shoulder line in world space.
    // We shift model DOWN by (shoulderSeamY * unitScale * scale) so the
    // jacket's seam lands at worldPos.y instead of the model origin landing there.
    _applyTransform(worldPos, scale, lean, roll) {
        const unitScale = CONFIG.JACKET.MODEL_UNIT_SCALE || 1.0;
        const seam      = this._shoulderSeamY * unitScale;

        const pos = worldPos.clone();
        pos.y -= seam * scale;  // shift jacket down so shoulder seam = worldPos

        this.model.position.copy(pos);
        this.model.scale.setScalar(scale);
        this.model.rotation.order = 'YXZ';
        this.model.rotation.y = Math.PI; // face camera
        this.model.rotation.x = lean || 0;
        this.model.rotation.z = roll || 0;
    }

    // ─── Dynamic shading ─────────────────────────────────────────────────────
    _updateDynamicShading(lm, shoulderWidth) {
        const mat = this.jacketMaterial;
        if (!mat) return;
        const L  = CONFIG.SKELETON.LANDMARKS;
        const LS = lm[L.LEFT_SHOULDER], RS = lm[L.RIGHT_SHOULDER];
        if (!LS || !RS) return;

        const turn = THREE.MathUtils.clamp((LS.z - RS.z) * 3.0, -1, 1);

        if (mat.roughness !== undefined) {
            const calSW   = this.cal.ref.shoulderWidth || shoulderWidth;
            const stretch = (shoulderWidth - calSW) / calSW;
            mat.roughness += (THREE.MathUtils.clamp(0.75 + stretch * 0.3, 0.4, 1.0) - mat.roughness) * 0.08;
        }
        if (mat.envMapIntensity !== undefined)
            mat.envMapIntensity += (this._baseEnvIntensity + Math.abs(turn) * 0.7 - mat.envMapIntensity) * 0.06;

        if (this.dynamicLight) {
            this.dynamicLight.position.x += (-turn * 2.5 - this.dynamicLight.position.x) * 0.05;
            const proxR = THREE.MathUtils.clamp(shoulderWidth / (this.cal.ref.shoulderWidth || 0.2), 0.4, 2.0);
            this.dynamicLight.intensity += (proxR - this.dynamicLight.intensity) * 0.04;
        }
        mat.needsUpdate = true;
    }

    // ─── Bone updates ────────────────────────────────────────────────────────
    _updateSpine(lm) {
        if (!this.skeleton) return;
        const L  = CONFIG.SKELETON.LANDMARKS;
        const LS = lm[L.LEFT_SHOULDER], RS = lm[L.RIGHT_SHOULDER];
        const LH = lm[L.LEFT_HIP],     RH = lm[L.RIGHT_HIP];
        if (!LS || !RS || !LH || !RH) return;

        const shMid  = new THREE.Vector3((LS.x+RS.x)/2, (LS.y+RS.y)/2, (LS.z+RS.z)/2);
        const hipMid = new THREE.Vector3((LH.x+RH.x)/2, (LH.y+RH.y)/2, (LH.z+RH.z)/2);
        const bend   = Math.atan2(new THREE.Vector3().subVectors(shMid,hipMid).normalize().x, 1) * 0.25;

        ['spine1','spine2','spine3','spine4','spine5'].forEach((k,i,a) => {
            const b = this.bones[k]; if (!b) return;
            b.rotation.z += (bend * (i+1)/a.length - b.rotation.z) * 0.12;
        });
    }

    _updateArm(side, shoulder, elbow, wrist) {
        if (!shoulder || !elbow || !wrist || !this.skeleton) return;
        const isLeft   = side === 'left';
        const upperArm = isLeft ? this.bones.upperArmL : this.bones.upperArmR;
        const lowerArm = isLeft ? this.bones.lowerArmL : this.bones.lowerArmR;
        if (!upperArm || !lowerArm) return;

        const a    = 0.18;
        const rest = new THREE.Vector3(isLeft ? 1 : -1, -1, 0).normalize();

        const uDir = new THREE.Vector3(elbow.x-shoulder.x, elbow.y-shoulder.y, elbow.z-shoulder.z).normalize();
        const uQ   = new THREE.Quaternion().setFromUnitVectors(rest, uDir);
        const uk   = `u_${side}`;
        if (!this.smooth.boneRotations[uk]) this.smooth.boneRotations[uk] = uQ.clone();
        this.smooth.boneRotations[uk].slerp(uQ, a);
        upperArm.quaternion.copy(this.smooth.boneRotations[uk]);

        const lDir = new THREE.Vector3(wrist.x-elbow.x, wrist.y-elbow.y, wrist.z-elbow.z).normalize();
        const lQ   = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,-1,0), lDir);
        const lk   = `l_${side}`;
        if (!this.smooth.boneRotations[lk]) this.smooth.boneRotations[lk] = lQ.clone();
        this.smooth.boneRotations[lk].slerp(lQ, a);
        lowerArm.quaternion.copy(this.smooth.boneRotations[lk]);
    }

    _updateNeck(lm) {
        if (!this.bones.head || !this.skeleton) return;
        const L    = CONFIG.SKELETON.LANDMARKS;
        const nose = lm[L.NOSE], LS = lm[L.LEFT_SHOULDER], RS = lm[L.RIGHT_SHOULDER];
        if (!nose || !LS || !RS) return;
        const tilt = Math.atan2(nose.x - (LS.x+RS.x)/2, -((nose.y - (LS.y+RS.y)/2))) * 0.2;
        this.bones.head.rotation.z += (tilt - this.bones.head.rotation.z) * 0.15;
    }

    // ─── Coordinate helpers ───────────────────────────────────────────────────
    _normToWorld(nx, ny, depth) {
        const cam   = sceneManager.getCamera();
        const halfH = Math.tan(cam.fov * Math.PI / 360) * depth;
        const halfW = halfH * cam.aspect;
        return new THREE.Vector3(
            (nx - 0.5) *  2 * halfW,
            (ny - 0.5) * -2 * halfH,  // screen Y down → world Y up, so negate
            -depth
        );
    }

    _normWidthToWorld(normWidth, depth) {
        const cam = sceneManager.getCamera();
        return normWidth * 2 * Math.tan(cam.fov * Math.PI / 360) * depth * cam.aspect;
    }

    // ─── Bone mapping ─────────────────────────────────────────────────────────
    _mapBones() {
        const f = n => this.skeleton
            ? (this.skeleton.bones.find(b => b.name.toLowerCase().includes(n)) || null)
            : null;

        this.bones = {
            pelvis: f('pelvis'),
            spine1: f('spine_01'), spine2: f('spine_02'), spine3: f('spine_03'),
            spine4: f('spine_04'), spine5: f('spine_05'),
            neck1: f('neck_01'), neck2: f('neck_02'), head: f('head'),
            clavicleL: f('clavicle_l'), upperArmL: f('upperarm_l'),
            lowerArmL: f('lowerarm_l'), handL: f('hand_l'),
            clavicleR: f('clavicle_r'), upperArmR: f('upperarm_r'),
            lowerArmR: f('lowerarm_r'), handR: f('hand_r'),
        };
        console.log('Bones:', Object.entries(this.bones).filter(([,v])=>v).map(([k])=>k).join(', ') || 'none');
    }

    _cacheRestPose() {
        if (!this.skeleton) return;
        this.skeleton.bones.forEach(b => {
            this.boneMatrices[b.name] = {
                position: b.position.clone(), quaternion: b.quaternion.clone(), scale: b.scale.clone()
            };
        });
    }

    _resetToRestPose() {
        if (!this.skeleton) return;
        this.skeleton.bones.forEach(b => {
            const r = this.boneMatrices[b.name]; if (!r) return;
            b.position.copy(r.position); b.quaternion.copy(r.quaternion); b.scale.copy(r.scale);
        });
    }

    // ─── Public API ───────────────────────────────────────────────────────────
    recalibrate() {
        this.cal = {
            ready: false, frames: 0, FRAMES_NEEDED: 15,
            sum: { shoulderWidth: 0, torsoHeight: 0 },
            ref: { shoulderWidth: null, torsoHeight: null, depth: null }
        };
        this.smooth = { position: new THREE.Vector3(), scale: 1, roll: 0, lean: 0, boneRotations: {} };
        if (this.model) this.model.visible = false;
        console.log('Recalibrating…');
    }

    setFabricReflectivity(v) { this._baseEnvIntensity = THREE.MathUtils.clamp(v, 0, 1); }
    isCalibrated() { return this.cal.ready; }
    reset() { this.recalibrate(); }
}

const skeletonMapper = new SkeletonMapper();