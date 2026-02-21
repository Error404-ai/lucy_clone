// pose-retargeter.js — MediaPipe Landmarks → Skeleton Bone Rotations
// Key fix: uses VIDEO aspect ratio (not canvas aspect) for world-space conversion.

class PoseRetargeter {
    constructor() {
        this.skeleton    = null;
        this.bones       = {};
        this.restDirs    = {};
        this.initialized = false;

        this._smoothQ = {};
        this._ALPHA   = CONFIG.SKELETON.BONE_ANIMATION.ROTATION_SMOOTHING ?? 0.18;

        // Front-facing camera: MediaPipe x is mirrored vs screen x
        this._mirrorX = true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════════════════════════════════════

    init(skeleton) {
        if (!skeleton || !skeleton.bones || skeleton.bones.length === 0) {
            console.warn('PoseRetargeter: no skeleton — bone animation disabled');
            return false;
        }

        this.skeleton = skeleton;
        this._mapBones();
        this._cacheRestDirections();

        this.initialized = true;
        console.log('✅ PoseRetargeter ready —', Object.keys(this.bones).length, 'bones mapped');
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIDEO ASPECT — same fix as skeleton-mapper
    // ═══════════════════════════════════════════════════════════════════════════

    _getVideoAspect() {
        const dims = cameraManager.getDimensions();
        if (dims && dims.width && dims.height) {
            return dims.width / dims.height;
        }
        return 16 / 9;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BONE MAPPING
    // ═══════════════════════════════════════════════════════════════════════════

    _mapBones() {
        const overrides = CONFIG.RIG?.BONE_NAME_OVERRIDES ?? {};

        const find = (keywords) => {
            for (const kw of keywords) {
                if (overrides[kw]) {
                    const b = this.skeleton.bones.find(b => b.name === overrides[kw]);
                    if (b) return b;
                }
            }
            for (const kw of keywords) {
                const b = this.skeleton.bones.find(
                    b => b.name.toLowerCase().includes(kw.toLowerCase())
                );
                if (b) return b;
            }
            return null;
        };

        this.bones = {
            pelvis:    find(['pelvis', 'hips', 'root']),
            spine1:    find(['spine_01', 'spine.001', 'spine1', 'spine']),
            spine2:    find(['spine_02', 'spine.002', 'spine2']),
            spine3:    find(['spine_03', 'spine.003', 'spine3']),
            spine4:    find(['spine_04', 'spine.004']),
            spine5:    find(['spine_05', 'spine.005']),
            neck:      find(['neck_01', 'neck.001', 'neck']),
            head:      find(['head']),
            clavicleL: find(['clavicle_l', 'leftshoulder', 'l_clavicle', 'collar_l']),
            upperArmL: find(['upperarm_l', 'leftarm', 'l_upperarm', 'upper arm.l']),
            lowerArmL: find(['lowerarm_l', 'leftforearm', 'l_forearm', 'forearm.l']),
            handL:     find(['hand_l', 'lefthand', 'l_hand']),
            clavicleR: find(['clavicle_r', 'rightshoulder', 'r_clavicle', 'collar_r']),
            upperArmR: find(['upperarm_r', 'rightarm', 'r_upperarm', 'upper arm.r']),
            lowerArmR: find(['lowerarm_r', 'rightforearm', 'r_forearm', 'forearm.r']),
            handR:     find(['hand_r', 'righthand', 'r_hand']),
        };

        const found   = Object.entries(this.bones).filter(([, v]) => v).map(([k]) => k);
        const missing = Object.entries(this.bones).filter(([, v]) => !v).map(([k]) => k);

        console.log('🦴 Bones found   :', found.join(', ') || 'none');
        if (missing.length) {
            console.warn('🦴 Bones missing :', missing.join(', '));
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REST DIRECTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    _cacheRestDirections() {
        this.restDirs = {};

        const _getDir = (bone) => {
            if (!bone || !bone.parent) return null;
            const parentWP = new THREE.Vector3();
            const boneWP   = new THREE.Vector3();
            bone.parent.getWorldPosition(parentWP);
            bone.getWorldPosition(boneWP);
            const dir = boneWP.clone().sub(parentWP);
            if (dir.lengthSq() < 1e-10) return null;
            return dir.normalize();
        };

        Object.entries(this.bones).forEach(([key, bone]) => {
            if (!bone) return;
            const d = _getDir(bone);
            if (d) this.restDirs[key] = d;
        });

        console.log('📐 Rest directions cached for', Object.keys(this.restDirs).length, 'bones');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MAIN UPDATE
    // ═══════════════════════════════════════════════════════════════════════════

    update(landmarks, depth, cam) {
        if (!this.initialized || !landmarks) return;

        const L           = CONFIG.SKELETON.LANDMARKS;
        const videoAspect = this._getVideoAspect(); // ← VIDEO aspect, not cam.aspect

        // Convert normalised MediaPipe landmark → world-space THREE.Vector3
        const toWorld = (lm) => {
            if (!lm) return null;
            const x     = this._mirrorX ? (1 - lm.x) : lm.x;
            const halfH = Math.tan(cam.fov * Math.PI / 360) * depth;
            const halfW = halfH * videoAspect;
            return new THREE.Vector3(
                (x - 0.5)      *  2 * halfW,
                (lm.y - 0.5)   * -2 * halfH,
                -depth + (lm.z ?? 0) * depth * 0.5
            );
        };

        const wLS   = toWorld(landmarks[L.LEFT_SHOULDER]);
        const wRS   = toWorld(landmarks[L.RIGHT_SHOULDER]);
        const wLE   = toWorld(landmarks[L.LEFT_ELBOW]);
        const wRE   = toWorld(landmarks[L.RIGHT_ELBOW]);
        const wLW   = toWorld(landmarks[L.LEFT_WRIST]);
        const wRW   = toWorld(landmarks[L.RIGHT_WRIST]);
        const wLH   = toWorld(landmarks[L.LEFT_HIP]);
        const wRH   = toWorld(landmarks[L.RIGHT_HIP]);
        const wNose = toWorld(landmarks[L.NOSE]);

        if (wLS && wRS && wLH && wRH) this._driveSpine(wLS, wRS, wLH, wRH);
        if (wLS && wLE && wLW)        this._driveArm('left',  wLS, wLE, wLW);
        if (wRS && wRE && wRW)        this._driveArm('right', wRS, wRE, wRW);
        if (wLS && wRS)               this._driveClavicles(wLS, wRS);
        if (wNose && wLS && wRS)      this._driveHead(wNose, wLS, wRS);

        if (this.skeleton) this.skeleton.update();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SPINE
    // ═══════════════════════════════════════════════════════════════════════════

    _driveSpine(wLS, wRS, wLH, wRH) {
        const shoulderMid = wLS.clone().add(wRS).multiplyScalar(0.5);
        const hipMid      = wLH.clone().add(wRH).multiplyScalar(0.5);

        const sideTilt = Math.atan2(wRS.y - wLS.y, wRS.x - wLS.x);
        const fwdLean  = Math.atan2(
            (wLS.z + wRS.z) * 0.5 - (wLH.z + wRH.z) * 0.5,
            Math.abs(shoulderMid.y - hipMid.y) + 0.001
        );

        const spineKeys = ['spine1', 'spine2', 'spine3', 'spine4', 'spine5'];
        const nSpine    = spineKeys.filter(k => this.bones[k]).length;
        let idx = 0;

        spineKeys.forEach(k => {
            const bone = this.bones[k];
            if (!bone) return;

            const t = nSpine > 1 ? idx / (nSpine - 1) : 0.5;
            idx++;

            const targetZ = sideTilt * (0.1 + t * 0.15);
            const targetX = fwdLean  * (0.05 + t * 0.10);

            const sk = `spine_${k}`;
            if (!this._smoothQ[sk]) this._smoothQ[sk] = { x: 0, z: 0 };

            this._smoothQ[sk].z += (targetZ - this._smoothQ[sk].z) * this._ALPHA;
            this._smoothQ[sk].x += (targetX - this._smoothQ[sk].x) * this._ALPHA;

            bone.rotation.order = 'YXZ';
            bone.rotation.z = THREE.MathUtils.clamp(this._smoothQ[sk].z, -0.35, 0.35);
            bone.rotation.x = THREE.MathUtils.clamp(this._smoothQ[sk].x, -0.25, 0.25);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ARMS
    // ═══════════════════════════════════════════════════════════════════════════

    _driveArm(side, shoulder, elbow, wrist) {
        const isLeft   = side === 'left';
        const upperArm = isLeft ? this.bones.upperArmL : this.bones.upperArmR;
        const lowerArm = isLeft ? this.bones.lowerArmL : this.bones.lowerArmR;

        if (!upperArm && !lowerArm) return;

        if (upperArm) {
            const dir = elbow.clone().sub(shoulder).normalize();
            this._rotateBoneToDir(upperArm, dir, `ua_${side}`);
        }

        if (lowerArm) {
            const dir = wrist.clone().sub(elbow).normalize();
            this._rotateBoneToDir(lowerArm, dir, `la_${side}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CLAVICLES
    // ═══════════════════════════════════════════════════════════════════════════

    _driveClavicles(wLS, wRS) {
        const liftL = THREE.MathUtils.clamp(-(wLS.y + 0.1) * 0.4, -0.3, 0.3);
        const liftR = THREE.MathUtils.clamp(-(wRS.y + 0.1) * 0.4, -0.3, 0.3);

        if (this.bones.clavicleL) {
            if (!this._smoothQ['clav_l']) this._smoothQ['clav_l'] = 0;
            this._smoothQ['clav_l'] += (liftL - this._smoothQ['clav_l']) * this._ALPHA;
            this.bones.clavicleL.rotation.z = this._smoothQ['clav_l'];
        }
        if (this.bones.clavicleR) {
            if (!this._smoothQ['clav_r']) this._smoothQ['clav_r'] = 0;
            this._smoothQ['clav_r'] += (liftR - this._smoothQ['clav_r']) * this._ALPHA;
            this.bones.clavicleR.rotation.z = this._smoothQ['clav_r'];
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HEAD
    // ═══════════════════════════════════════════════════════════════════════════

    _driveHead(nose, wLS, wRS) {
        if (!this.bones.head) return;

        const shoulderMidX = (wLS.x + wRS.x) * 0.5;
        const shoulderMidY = (wLS.y + wRS.y) * 0.5;

        const yaw   = THREE.MathUtils.clamp((nose.x - shoulderMidX) * 0.8, -0.4, 0.4);
        const pitch = THREE.MathUtils.clamp((nose.y - shoulderMidY + 0.15) * 1.0, -0.3, 0.3);

        if (!this._smoothQ['head']) this._smoothQ['head'] = { y: 0, x: 0 };
        this._smoothQ['head'].y += (yaw   - this._smoothQ['head'].y) * this._ALPHA;
        this._smoothQ['head'].x += (pitch - this._smoothQ['head'].x) * this._ALPHA;

        this.bones.head.rotation.order = 'YXZ';
        this.bones.head.rotation.y = this._smoothQ['head'].y;
        this.bones.head.rotation.x = this._smoothQ['head'].x;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CORE: rotate bone so rest-direction aligns with targetDir
    // ═══════════════════════════════════════════════════════════════════════════

    _rotateBoneToDir(bone, targetDir, key) {
        if (!bone || targetDir.lengthSq() < 0.0001) return;

        const boneKey = this._boneToKey(bone);
        const restDir = this.restDirs[boneKey];

        let targetQ;

        if (restDir && restDir.lengthSq() > 0.0001) {
            targetQ = new THREE.Quaternion().setFromUnitVectors(
                restDir.clone().normalize(),
                targetDir.clone().normalize()
            );
            const boneWorldQ   = new THREE.Quaternion();
            bone.getWorldQuaternion(boneWorldQ);
            const worldToLocal = boneWorldQ.clone().invert();
            targetQ.premultiply(worldToLocal).multiply(boneWorldQ);
        } else {
            const euler = new THREE.Euler(
                Math.atan2(targetDir.y, targetDir.z),
                Math.atan2(targetDir.x, targetDir.z),
                0, 'XYZ'
            );
            targetQ = new THREE.Quaternion().setFromEuler(euler);
        }

        if (!this._smoothQ[key]) {
            this._smoothQ[key] = bone.quaternion.clone();
        }

        this._smoothQ[key].slerp(targetQ, this._ALPHA);

        // Prevent extreme flips from low-confidence landmarks
        const q = this._smoothQ[key];
        if (q.w < 0.20) {
            q.set(q.x, q.y, q.z, 0.20).normalize();
        }

        bone.quaternion.copy(this._smoothQ[key]);
    }

    _boneToKey(bone) {
        return Object.keys(this.bones).find(k => this.bones[k] === bone) ?? '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REST POSE
    // ═══════════════════════════════════════════════════════════════════════════

    resetToRest() {
        if (!this.skeleton) return;
        this.skeleton.pose(); // THREE.js built-in — resets all bones to bind pose
        this._smoothQ = {};
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONFIG HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    setSmoothing(alpha) { this._ALPHA = THREE.MathUtils.clamp(alpha, 0.01, 1.0); }
    setMirrorX(mirror)  { this._mirrorX = mirror; }
}

const poseRetargeter = new PoseRetargeter();