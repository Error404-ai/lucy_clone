// skeleton-mapper.js — REWRITTEN FOR WEARABLE JACKET
// Fixes: scale, position, depth, lighting response, bone animation
// Goal: jacket sits ON the body, moves with it, responds to light naturally

class SkeletonMapper {
    constructor() {
        this.model = null;
        this.skeleton = null;
        this.bones = {};
        this.boneMatrices = {};         // rest-pose cache
        this.videoWidth  = 1280;
        this.videoHeight = 720;
        this.initialized = false;

        // ── Smoothing state ──────────────────────────────────────────
        this.smooth = {
            position:      new THREE.Vector3(0, 0, 0),
            scale:         1.0,
            roll:          0,           // shoulder tilt (Z)
            lean:          0,           // body lean (X)
            boneRotations: {}
        };

        // ── Calibration ──────────────────────────────────────────────
        // Set once on first good frame; lets us anchor the jacket
        // to the PERSON's actual proportions instead of guessing.
        this.calibrated       = false;
        this.refShoulderWidth = null;   // normalized, at capture moment
        this.refDepth         = null;

        // ── Lighting ─────────────────────────────────────────────────
        this.jacketMaterial   = null;
        this.dynamicLight     = null;   // set by setDynamicLight()
        this._baseEnvIntensity = 0.4;

        // ── Debug ────────────────────────────────────────────────────
        this.frameCount = 0;
        this.debugMode  = true;         // set false in production
    }

    // ─────────────────────────────────────────────────────────────────
    //  INIT
    // ─────────────────────────────────────────────────────────────────
    async init(videoWidth, videoHeight) {
        this.videoWidth  = videoWidth  || 1280;
        this.videoHeight = videoHeight || 720;
        this.initialized = true;
        console.log('🦴 SkeletonMapper ready');
        return true;
    }

    // ─────────────────────────────────────────────────────────────────
    //  LINK MODEL
    // ─────────────────────────────────────────────────────────────────
    setJacket(model) {
        this.model = model;

        // Find mesh
        let mesh = null;
        model.traverse(c => {
            if (c.isSkinnedMesh && !mesh) mesh = c;
        });
        if (!mesh) {
            model.traverse(c => { if (c.isMesh && !mesh) mesh = c; });
        }
        if (!mesh) { console.error('❌ No mesh in jacket model'); return; }

        // Cache material for dynamic shading
        if (mesh.material) {
            this.jacketMaterial = mesh.material;
            if (this.jacketMaterial.type === 'MeshBasicMaterial') {
                console.warn('⚠️  Jacket uses MeshBasicMaterial — no shadows/shading. ' +
                             'Switch to MeshStandardMaterial in your 3D tool.');
            }
        }

        // Skeleton
        this.skeleton = mesh.skeleton || null;
        if (this.skeleton) {
            console.log(`✅ Skeleton: ${this.skeleton.bones.length} bones`);
            this._mapBones();
            this._cacheRestPose();
        } else {
            console.log('ℹ️  No skeleton — rigid tracking only');
        }

        // Hide until first good pose
        model.visible = false;

        this._logModelBounds(model);
    }

    // Optional: pass a Three.js PointLight or DirectionalLight
    // so the mapper can shift it as the person turns, faking real shading.
    setDynamicLight(light) {
        this.dynamicLight = light;
    }

    // ─────────────────────────────────────────────────────────────────
    //  MAIN UPDATE  (called every frame)
    // ─────────────────────────────────────────────────────────────────
    update(poseData) {
        if (!this.model) return;
        this.frameCount++;

        // No pose — show jacket in neutral position so it's visible
        if (!poseData || !poseData.landmarks) {
            this.model.visible = true;
            this._applyTransform(new THREE.Vector3(0, 0.1, -2.2), 1.0, 0, 0);
            if (this.skeleton) this._resetToRestPose();
            return;
        }

        const lm = poseData.landmarks;
        const L  = CONFIG.SKELETON.LANDMARKS;

        const LS = lm[L.LEFT_SHOULDER];
        const RS = lm[L.RIGHT_SHOULDER];
        const LH = lm[L.LEFT_HIP];
        const RH = lm[L.RIGHT_HIP];
        const LE = lm[L.LEFT_ELBOW];
        const RE = lm[L.RIGHT_ELBOW];
        const LW = lm[L.LEFT_WRIST];
        const RW = lm[L.RIGHT_WRIST];

        if (!LS || !RS || LS.visibility < 0.4 || RS.visibility < 0.4) {
            this.model.visible = true;
            return;
        }

        // ── Shoulder geometry ────────────────────────────────────────
        const shoulderMidX  = (LS.x + RS.x) * 0.5;
        const shoulderMidY  = (LS.y + RS.y) * 0.5;
        const dxS           = RS.x - LS.x;
        const dyS           = RS.y - LS.y;
        const shoulderWidth = Math.sqrt(dxS * dxS + dyS * dyS);

        // ── Calibration ──────────────────────────────────────────────
        if (!this.calibrated && shoulderWidth > 0.10) {
            this.refShoulderWidth = shoulderWidth;
            this.refDepth         = 1.6;
            this.calibrated       = true;
            console.log(`📐 Calibrated — shoulderWidth=${shoulderWidth.toFixed(3)}`);
        }

        // ── Depth ────────────────────────────────────────────────────
        const baseDepth = this.calibrated ? this.refDepth         : 1.8;
        const refWidth  = this.calibrated ? this.refShoulderWidth : 0.18;
        const rawDepth  = baseDepth * (refWidth / Math.max(shoulderWidth, 0.08));
        const depth     = THREE.MathUtils.clamp(rawDepth, 1.2, 2.8);

        // ── Torso Y anchor ───────────────────────────────────────────
        let torsoY = shoulderMidY;
        if (LH && RH && LH.visibility > 0.3) {
            const hipMidY = (LH.y + RH.y) * 0.5;
            torsoY = shoulderMidY + (hipMidY - shoulderMidY) * 0.18;
        }

        const worldTarget = this._normToWorld(shoulderMidX, torsoY, depth);

        // ── Scale ────────────────────────────────────────────────────
        // World-space shoulder width → scale jacket to match
        const wsWidth           = this._normWidthToWorld(shoulderWidth, depth);
        const modelShoulderSpan = this._modelShoulderSpan || 0.5;
        const targetScale       = THREE.MathUtils.clamp(wsWidth / modelShoulderSpan, 0.5, 4.0);

        // ── Rotation ─────────────────────────────────────────────────
        const roll = Math.atan2(dyS, dxS);

        let lean = 0;
        if (LS.z !== undefined && RS.z !== undefined) {
            lean = THREE.MathUtils.clamp(((LS.z + RS.z) * 0.5) * 1.2, -0.4, 0.4);
        }

        // ── Smooth ──────────────────────────────────────────────────
        this.smooth.position.lerp(worldTarget, 0.20);
        this.smooth.scale += (targetScale - this.smooth.scale) * 0.22;
        this.smooth.roll  += (roll        - this.smooth.roll)  * 0.25;
        this.smooth.lean  += (lean        - this.smooth.lean)  * 0.25;

        // ── Apply ────────────────────────────────────────────────────
        this._applyTransform(
            this.smooth.position,
            this.smooth.scale,
            this.smooth.lean,
            this.smooth.roll
        );

        // ── Bones ────────────────────────────────────────────────────
        if (this.skeleton) {
            this._updateSpine(lm);
            this._updateArm('left',  LS, LE, LW);
            this._updateArm('right', RS, RE, RW);
            this._updateNeck(lm);
        }

        // ── Dynamic shading ─────────────────────────────────────────
        this._updateDynamicShading(lm, shoulderWidth);

        this.model.visible = true;

        if (this.debugMode && this.frameCount % 90 === 0) {
            console.log(
                `[Frame ${this.frameCount}]` +
                ` sw=${shoulderWidth.toFixed(3)} depth=${depth.toFixed(2)}` +
                ` wsW=${wsWidth.toFixed(3)} scale=${this.smooth.scale.toFixed(3)}` +
                ` pos=(${this.smooth.position.x.toFixed(2)},` +
                      `${this.smooth.position.y.toFixed(2)},` +
                      `${this.smooth.position.z.toFixed(2)})`
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  DYNAMIC SHADING
    //  Makes the jacket respond to motion like real fabric:
    //  • Turning  → env-map reflection shifts (like fabric sheen)
    //  • Arms up  → fabric stretches → roughness increases
    //  • Closer   → fill light brightens
    // ─────────────────────────────────────────────────────────────────
    _updateDynamicShading(lm, shoulderWidth) {
        const mat = this.jacketMaterial;
        if (!mat) return;

        const L  = CONFIG.SKELETON.LANDMARKS;
        const LS = lm[L.LEFT_SHOULDER];
        const RS = lm[L.RIGHT_SHOULDER];
        if (!LS || !RS) return;

        // Turn estimation: right shoulder going back → turning left
        const zL   = LS.z || 0;
        const zR   = RS.z || 0;
        const turn = THREE.MathUtils.clamp((zR - zL) * 3.0, -1, 1);

        // Roughness: more arm spread → fabric tension → slightly rougher
        if (mat.roughness !== undefined) {
            const baseRoughness   = 0.75;
            const targetRoughness = THREE.MathUtils.clamp(
                baseRoughness + (shoulderWidth - 0.18) * 0.5, 0.4, 1.0
            );
            mat.roughness += (targetRoughness - mat.roughness) * 0.1;
        }

        // Env-map intensity: turning reveals specular highlight
        if (mat.envMapIntensity !== undefined) {
            const targetEnv = this._baseEnvIntensity + Math.abs(turn) * 0.6;
            mat.envMapIntensity += (targetEnv - mat.envMapIntensity) * 0.08;
        }

        // Dynamic fill light position tracks opposite of turn
        if (this.dynamicLight) {
            const lightX = -turn * 2.0;
            this.dynamicLight.position.x +=
                (lightX - this.dynamicLight.position.x) * 0.06;

            const proximity = THREE.MathUtils.clamp(shoulderWidth / 0.25, 0.5, 1.5);
            const targetI   = 1.0 * proximity;
            this.dynamicLight.intensity +=
                (targetI - this.dynamicLight.intensity) * 0.05;
        }

        mat.needsUpdate = true;
    }

    // ─────────────────────────────────────────────────────────────────
    //  TRANSFORM APPLY
    // ─────────────────────────────────────────────────────────────────
    _applyTransform(position, scale, lean, roll) {
        this.model.position.copy(position);
        this.model.scale.setScalar(scale);
        this.model.rotation.order = 'YXZ';
        this.model.rotation.y = Math.PI;   // face camera
        this.model.rotation.x = lean  || 0;
        this.model.rotation.z = roll  || 0;
    }

    // ─────────────────────────────────────────────────────────────────
    //  BONE UPDATES
    // ─────────────────────────────────────────────────────────────────
    _updateSpine(lm) {
        if (!this.skeleton) return;
        const L  = CONFIG.SKELETON.LANDMARKS;
        const LS = lm[L.LEFT_SHOULDER];
        const RS = lm[L.RIGHT_SHOULDER];
        const LH = lm[L.LEFT_HIP];
        const RH = lm[L.RIGHT_HIP];
        if (!LS || !RS || !LH || !RH) return;

        const shMid  = new THREE.Vector3((LS.x+RS.x)/2,(LS.y+RS.y)/2,(LS.z+RS.z)/2);
        const hipMid = new THREE.Vector3((LH.x+RH.x)/2,(LH.y+RH.y)/2,(LH.z+RH.z)/2);
        const spine  = new THREE.Vector3().subVectors(shMid, hipMid).normalize();
        const lateralBend = Math.atan2(spine.x, spine.y) * 0.25;

        ['spine1','spine2','spine3','spine4','spine5'].forEach((key, i, arr) => {
            const bone = this.bones[key];
            if (!bone) return;
            const weight = (i + 1) / arr.length;
            bone.rotation.z += (lateralBend * weight - bone.rotation.z) * 0.15;
        });
    }

    _updateArm(side, shoulder, elbow, wrist) {
        if (!shoulder || !elbow || !wrist || !this.skeleton) return;
        const isLeft   = side === 'left';
        const upperArm = isLeft ? this.bones.upperArmL : this.bones.upperArmR;
        const lowerArm = isLeft ? this.bones.lowerArmL : this.bones.lowerArmR;
        if (!upperArm || !lowerArm) return;

        const alpha  = 0.22;
        const restDir = new THREE.Vector3(isLeft ? 1 : -1, -1, 0).normalize();

        // Upper arm
        const uDir = new THREE.Vector3(
            elbow.x - shoulder.x, elbow.y - shoulder.y, elbow.z - shoulder.z
        ).normalize();
        const uQ = new THREE.Quaternion().setFromUnitVectors(restDir, uDir);
        const uKey = `uArm_${side}`;
        if (!this.smooth.boneRotations[uKey]) this.smooth.boneRotations[uKey] = uQ.clone();
        this.smooth.boneRotations[uKey].slerp(uQ, alpha);
        upperArm.quaternion.copy(this.smooth.boneRotations[uKey]);

        // Lower arm
        const lDir = new THREE.Vector3(
            wrist.x - elbow.x, wrist.y - elbow.y, wrist.z - elbow.z
        ).normalize();
        const lQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,-1,0), lDir);
        const lKey = `lArm_${side}`;
        if (!this.smooth.boneRotations[lKey]) this.smooth.boneRotations[lKey] = lQ.clone();
        this.smooth.boneRotations[lKey].slerp(lQ, alpha);
        lowerArm.quaternion.copy(this.smooth.boneRotations[lKey]);
    }

    _updateNeck(lm) {
        if (!this.bones.head || !this.skeleton) return;
        const L    = CONFIG.SKELETON.LANDMARKS;
        const nose = lm[L.NOSE];
        const LS   = lm[L.LEFT_SHOULDER];
        const RS   = lm[L.RIGHT_SHOULDER];
        if (!nose || !LS || !RS) return;
        const shMidX = (LS.x + RS.x) / 2;
        const shMidY = (LS.y + RS.y) / 2;
        const tiltZ  = Math.atan2(nose.x - shMidX, -(nose.y - shMidY)) * 0.25;
        this.bones.head.rotation.z += (tiltZ - this.bones.head.rotation.z) * 0.2;
    }

    // ─────────────────────────────────────────────────────────────────
    //  COORDINATE HELPERS
    // ─────────────────────────────────────────────────────────────────
    _normToWorld(nx, ny, depth) {
        const cam    = sceneManager.getCamera();
        const fov    = cam.fov * (Math.PI / 180);
        const aspect = cam.aspect;
        const ndcX   = (nx - 0.5) *  2;
        const ndcY   = (ny - 0.5) * -2;
        const halfH  = Math.tan(fov / 2) * depth;
        const halfW  = halfH * aspect;
        return new THREE.Vector3(ndcX * halfW, ndcY * halfH, -depth);
    }

    _normWidthToWorld(normWidth, depth) {
        const cam    = sceneManager.getCamera();
        const fov    = cam.fov * (Math.PI / 180);
        const aspect = cam.aspect;
        const viewH  = 2 * Math.tan(fov / 2) * depth;
        return normWidth * viewH * aspect;
    }

    // ─────────────────────────────────────────────────────────────────
    //  SETUP HELPERS
    // ─────────────────────────────────────────────────────────────────
    _mapBones() {
        const find = name => this.skeleton
            ? (this.skeleton.bones.find(b => b.name.toLowerCase().includes(name)) || null)
            : null;

        this.bones = {
            pelvis:    find('pelvis'),
            spine1:    find('spine_01'),
            spine2:    find('spine_02'),
            spine3:    find('spine_03'),
            spine4:    find('spine_04'),
            spine5:    find('spine_05'),
            neck1:     find('neck_01'),
            neck2:     find('neck_02'),
            head:      find('head'),
            clavicleL: find('clavicle_l'),
            upperArmL: find('upperarm_l'),
            lowerArmL: find('lowerarm_l'),
            handL:     find('hand_l'),
            clavicleR: find('clavicle_r'),
            upperArmR: find('upperarm_r'),
            lowerArmR: find('lowerarm_r'),
            handR:     find('hand_r'),
        };

        const found = Object.entries(this.bones)
            .filter(([,v]) => v).map(([k]) => k).join(', ');
        console.log('🦴 Mapped bones:', found || 'none');
    }

    _cacheRestPose() {
        if (!this.skeleton) return;
        this.skeleton.bones.forEach(b => {
            this.boneMatrices[b.name] = {
                position:   b.position.clone(),
                quaternion: b.quaternion.clone(),
                scale:      b.scale.clone()
            };
        });
    }

    _resetToRestPose() {
        if (!this.skeleton) return;
        this.skeleton.bones.forEach(b => {
            const r = this.boneMatrices[b.name];
            if (!r) return;
            b.position.copy(r.position);
            b.quaternion.copy(r.quaternion);
            b.scale.copy(r.scale);
        });
    }

    _logModelBounds(model) {
        const bbox = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        console.log(`📏 Jacket bounds: W=${size.x.toFixed(3)} H=${size.y.toFixed(3)} D=${size.z.toFixed(3)}`);
        // X extent ≈ shoulder span in model units
        this._modelShoulderSpan = size.x > 0 ? size.x : 0.5;
        console.log(`  ↳ Shoulder span = ${this._modelShoulderSpan.toFixed(3)} model-units`);
        console.log(`  ↳ If scale is wrong, call: skeletonMapper.setModelShoulderSpan(value)`);
    }

    // ─────────────────────────────────────────────────────────────────
    //  PUBLIC TUNING HELPERS  (use from browser console)
    // ─────────────────────────────────────────────────────────────────

    /** skeletonMapper.setModelShoulderSpan(0.45)
     *  Call if jacket is too big or too small width-wise.
     *  Value = width of jacket mesh in its own model units. */
    setModelShoulderSpan(span) {
        this._modelShoulderSpan = span;
        console.log(`🔧 Model shoulder span → ${span}`);
    }

    /** Force recalibration on next good frame. */
    recalibrate() {
        this.calibrated = false;
        console.log('🔄 Recalibrating on next good frame…');
    }

    /** Set base env-map brightness for current fabric.
     *  0 = matte cotton, 0.8 = leather/silk */
    setBaseEnvIntensity(v) {
        this._baseEnvIntensity = v;
        console.log(`💡 Base env intensity → ${v}`);
    }

    reset() {
        this.smooth = { position: new THREE.Vector3(0,0,0), scale:1.0, roll:0, lean:0, boneRotations:{} };
        this.calibrated = false;
        if (this.skeleton) this._resetToRestPose();
        if (this.model)    this.model.visible = false;
        this.frameCount = 0;
        console.log('🔄 SkeletonMapper reset');
    }
}

const skeletonMapper = new SkeletonMapper();