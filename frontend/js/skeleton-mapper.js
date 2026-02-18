// skeleton-mapper.js - FIXED VERSION WITH PROPER SCALING
// This version includes extensive debugging and proper scale calculations

class SkeletonMapper {
    constructor() {
        this.model = null;
        this.skeleton = null;
        this.bones = {};
        this.boneMatrices = {};
        this.videoWidth = 1280;
        this.videoHeight = 720;
        this.initialized = false;
        this.smooth = {
            position: new THREE.Vector3(0, 0, -1.8), // CLOSER to camera
            scale: 1.0,
            rotation: 0,
            boneRotations: {}
        };
        
        // 🔧 DEBUGGING FLAGS
        this.debugMode = true;
        this.frameCount = 0;
        this.lastDebugLog = 0;
    }

    async init(videoWidth, videoHeight) {
        console.log('🦴 Initializing SkeletonMapper for rigged jacket...');
        this.videoWidth = videoWidth || 1280;
        this.videoHeight = videoHeight || 720;
        this.initialized = true;
        return true;
    }

    setJacket(model) {
        this.model = model;
        console.log('🔗 Linking rigged jacket to body tracker...');
        
        // Find the SkinnedMesh
        let jacketMesh = null;
        model.traverse(child => {
            if (child.isSkinnedMesh) {
                jacketMesh = child;
                console.log(`✅ Found SkinnedMesh: ${child.name}`);
            }
        });

        if (!jacketMesh) {
            console.warn('⚠️ No SkinnedMesh found - trying regular Mesh');
            model.traverse(child => {
                if (child.isMesh && !jacketMesh) {
                    jacketMesh = child;
                    console.log(`✅ Using regular Mesh: ${child.name}`);
                }
            });
        }

        if (!jacketMesh) {
            console.error('❌ No mesh found in jacket model!');
            return;
        }

        this.skeleton = jacketMesh.skeleton;

        if (this.skeleton) {
            console.log(`✅ Skeleton found with ${this.skeleton.bones.length} bones`);
            this.extractBones();
            this.storeOriginalBoneMatrices();
        } else {
            console.log('ℹ️ No skeleton - will do rigid body tracking only');
        }

        // 🔧 DEBUG: Log model's initial transform
        console.log('📊 Model initial state:');
        console.log('  Position:', model.position);
        console.log('  Scale:', model.scale);
        console.log('  Rotation:', model.rotation);

        // 🔧 Calculate model bounding box
        const bbox = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        console.log('📏 Model bounding box size:', size);
        console.log('  This is your jacket\'s actual size in 3D units');
    }

    extractBones() {
        if (!this.skeleton) return;

        this.bones = {
            pelvis: this.findBone('pelvis'),
            spine1: this.findBone('spine_01'),
            spine2: this.findBone('spine_02'),
            spine3: this.findBone('spine_03'),
            spine4: this.findBone('spine_04'),
            spine5: this.findBone('spine_05'),
            neck1: this.findBone('neck_01'),
            neck2: this.findBone('neck_02'),
            head: this.findBone('head'),
            clavicleL: this.findBone('clavicle_l'),
            upperArmL: this.findBone('upperarm_l'),
            lowerArmL: this.findBone('lowerarm_l'),
            handL: this.findBone('hand_l'),
            clavicleR: this.findBone('clavicle_r'),
            upperArmR: this.findBone('upperarm_r'),
            lowerArmR: this.findBone('lowerarm_r'),
            handR: this.findBone('hand_r')
        };

        console.log('📋 Bone mapping:');
        Object.entries(this.bones).forEach(([key, bone]) => {
            if (bone) {
                console.log(`  ✅ ${key}: ${bone.name}`);
            }
        });
    }

    findBone(name) {
        if (!this.skeleton) return null;
        return this.skeleton.bones.find(bone => 
            bone.name.toLowerCase().includes(name.toLowerCase())
        );
    }

    storeOriginalBoneMatrices() {
        if (!this.skeleton) return;
        this.skeleton.bones.forEach(bone => {
            this.boneMatrices[bone.name] = {
                position: bone.position.clone(),
                quaternion: bone.quaternion.clone(),
                scale: bone.scale.clone()
            };
        });
    }

    update(poseData) {
        if (!this.model) {
            if (this.debugMode && this.frameCount === 0) {
                console.error('❌ No model set in SkeletonMapper');
            }
            return;
        }

        this.frameCount++;

        // No pose detected
        if (!poseData || !poseData.landmarks) {
            // Show jacket at center in default pose
            this.model.visible = true;
            this.model.position.set(0, 0, -1.8);
            
            // 🔧 FIX: Much larger default scale
            this.model.scale.setScalar(1.5);
            
            this.model.rotation.set(0, Math.PI, 0);
            if (this.skeleton) {
                this.resetToTPose();
            }
            return;
        }

        const landmarks = poseData.landmarks;
        const L = CONFIG.SKELETON.LANDMARKS;

        const LS = landmarks[L.LEFT_SHOULDER];
        const RS = landmarks[L.RIGHT_SHOULDER];
        const LE = landmarks[L.LEFT_ELBOW];
        const RE = landmarks[L.RIGHT_ELBOW];
        const LW = landmarks[L.LEFT_WRIST];
        const RW = landmarks[L.RIGHT_WRIST];
        const LH = landmarks[L.LEFT_HIP];
        const RH = landmarks[L.RIGHT_HIP];

        // Minimum visibility check
        if (!LS || !RS || LS.visibility < 0.3 || RS.visibility < 0.3) {
            this.model.visible = true; // Keep visible even with poor tracking
            return;
        }

        /* ==================== POSITION ==================== */
        
        // Torso center (between shoulders and hips)
        const centerX = (LS.x + RS.x) * 0.5;
const centerY = (LS.y + RS.y) * 0.5 + 0.05; 

        // Calculate shoulder width
        const dx = RS.x - LS.x;
        const dy = RS.y - LS.y;
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy);

        // 🔧 DEBUG: Log every 60 frames (2 seconds at 30fps)
        if (this.debugMode && this.frameCount % 60 === 0) {
            console.log('📊 TRACKING DATA:');
            console.log(`  Shoulder width (normalized): ${shoulderWidth.toFixed(4)}`);
            console.log(`  Center X: ${centerX.toFixed(3)}, Y: ${centerY.toFixed(3)}`);
            console.log(`  Left shoulder visibility: ${LS.visibility.toFixed(2)}`);
            console.log(`  Right shoulder visibility: ${RS.visibility.toFixed(2)}`);
        }

        // 🔧 FIX: Adaptive depth based on shoulder width
        // Typical shoulder width in MediaPipe normalized coords: 0.15 - 0.25
        // If shoulders appear wider (closer to camera), depth should be smaller
        const REFERENCE_WIDTH = 0.20;  // Typical shoulder width at ideal distance
        const BASE_DEPTH = 1.8;         // Closer to camera than before (was 2.5)
        
        // Calculate depth inversely proportional to shoulder width
        const depth = BASE_DEPTH * (REFERENCE_WIDTH / Math.max(shoulderWidth, 0.12));
        const clampedDepth = THREE.MathUtils.clamp(depth, 1.4, 2.2);

        // Convert to world space
        const worldPos = this.normalizedToWorld(centerX, centerY, clampedDepth);

        // Smooth position
        this.smooth.position.lerp(worldPos, 0.18);
        this.model.position.copy(this.smooth.position);

        /* ==================== SCALE ==================== */
        
        // 🔧 FIX: Much more aggressive scaling
        // The jacket needs to be MUCH bigger than before
        const BASE_SCALE = 6.5;
        const targetScale = shoulderWidth * BASE_SCALE;
        
        // Allow much larger range
        const clampedScale = THREE.MathUtils.clamp(targetScale, 1.2, 3.2);

        // Smooth scale changes
        this.smooth.scale += (clampedScale - this.smooth.scale) * 0.25;
        this.model.scale.setScalar(this.smooth.scale);

        // 🔧 DEBUG: Log scale every 60 frames
        if (this.debugMode && this.frameCount % 60 === 0) {
            console.log(`📏 SCALE CALCULATION:`);
            console.log(`  Shoulder width: ${shoulderWidth.toFixed(4)}`);
            console.log(`  Target scale: ${targetScale.toFixed(3)}`);
            console.log(`  Clamped scale: ${clampedScale.toFixed(3)}`);
            console.log(`  Smooth scale: ${this.smooth.scale.toFixed(3)}`);
            console.log(`  Depth: ${clampedDepth.toFixed(2)}`);
        }

        /* ==================== ROTATION ==================== */
        
        // Body roll (shoulder tilt)
        const roll = Math.atan2(dy, dx);
        this.smooth.rotation += (roll - this.smooth.rotation) * 0.3;
        
        // Face camera + apply roll
        this.model.rotation.set(0, Math.PI, this.smooth.rotation);

        /* ==================== BONE ANIMATION ==================== */
        
        if (this.skeleton) {
            this.updateSpine(landmarks);
            this.updateArm('left', LS, LE, LW);
            this.updateArm('right', RS, RE, RW);
            this.updateNeck(landmarks);
        }

        this.model.visible = true;
    }

    normalizedToWorld(nx, ny, depth) {
        const camera = sceneManager.getCamera();
        const fov = camera.fov * (Math.PI / 180);
        const aspect = camera.aspect;
        
        // Convert normalized (0-1) to NDC (-1 to 1)
        const ndcX = (nx - 0.5) * 2;
        const ndcY = -(ny - 0.5) * 2;  // Flip Y
        
        // Calculate view dimensions at depth
        const viewHeight = 2 * Math.tan(fov / 2) * depth;
        const viewWidth = viewHeight * aspect;
        
        const worldX = ndcX * (viewWidth / 2);
        const worldY = ndcY * (viewHeight / 2);
        const worldZ = -depth;

        return new THREE.Vector3(worldX, worldY, worldZ);
    }

    updateSpine(landmarks) {
        if (!this.skeleton) return;

        const L = CONFIG.SKELETON.LANDMARKS;
        const LS = landmarks[L.LEFT_SHOULDER];
        const RS = landmarks[L.RIGHT_SHOULDER];
        const LH = landmarks[L.LEFT_HIP];
        const RH = landmarks[L.RIGHT_HIP];

        if (!LS || !RS || !LH || !RH) return;

        const shoulderCenter = new THREE.Vector3(
            (LS.x + RS.x) / 2,
            (LS.y + RS.y) / 2,
            (LS.z + RS.z) / 2
        );

        const hipCenter = new THREE.Vector3(
            (LH.x + RH.x) / 2,
            (LH.y + RH.y) / 2,
            (LH.z + RH.z) / 2
        );

        const spineDirection = new THREE.Vector3()
            .subVectors(shoulderCenter, hipCenter)
            .normalize();

        if (this.bones.spine3) {
            const targetRot = Math.atan2(spineDirection.x, spineDirection.y);
            this.bones.spine3.rotation.z = targetRot * 0.2;
        }
    }

    updateArm(side, shoulder, elbow, wrist) {
        if (!shoulder || !elbow || !wrist || !this.skeleton) return;

        const upperArm = side === 'left' ? this.bones.upperArmL : this.bones.upperArmR;
        const lowerArm = side === 'left' ? this.bones.lowerArmL : this.bones.lowerArmR;

        if (!upperArm || !lowerArm) return;

        /* UPPER ARM (Shoulder to Elbow) */
        const upperArmDir = new THREE.Vector3(
            elbow.x - shoulder.x,
            elbow.y - shoulder.y,
            elbow.z - shoulder.z
        ).normalize();

        const upperArmRotation = new THREE.Quaternion();
        upperArmRotation.setFromUnitVectors(
            new THREE.Vector3(0, -1, 0),
            upperArmDir
        );

        const key = `upperArm${side}`;
        if (!this.smooth.boneRotations[key]) {
            this.smooth.boneRotations[key] = upperArmRotation.clone();
        }
        this.smooth.boneRotations[key].slerp(upperArmRotation, 0.3);
        upperArm.quaternion.copy(this.smooth.boneRotations[key]);

        /* LOWER ARM (Elbow to Wrist) */
        const lowerArmDir = new THREE.Vector3(
            wrist.x - elbow.x,
            wrist.y - elbow.y,
            wrist.z - elbow.z
        ).normalize();

        const lowerArmRotation = new THREE.Quaternion();
        lowerArmRotation.setFromUnitVectors(
            new THREE.Vector3(0, -1, 0),
            lowerArmDir
        );

        const lowerKey = `lowerArm${side}`;
        if (!this.smooth.boneRotations[lowerKey]) {
            this.smooth.boneRotations[lowerKey] = lowerArmRotation.clone();
        }
        this.smooth.boneRotations[lowerKey].slerp(lowerArmRotation, 0.3);
        lowerArm.quaternion.copy(this.smooth.boneRotations[lowerKey]);
    }

    updateNeck(landmarks) {
        if (!this.skeleton) return;

        const L = CONFIG.SKELETON.LANDMARKS;
        const nose = landmarks[L.NOSE];
        const LS = landmarks[L.LEFT_SHOULDER];
        const RS = landmarks[L.RIGHT_SHOULDER];

        if (!nose || !LS || !RS || !this.bones.head) return;

        const shoulderCenter = new THREE.Vector3(
            (LS.x + RS.x) / 2,
            (LS.y + RS.y) / 2,
            (LS.z + RS.z) / 2
        );

        const headDir = new THREE.Vector3(
            nose.x - shoulderCenter.x,
            nose.y - shoulderCenter.y,
            nose.z - shoulderCenter.z
        ).normalize();

        const headRotation = Math.atan2(headDir.x, headDir.y);
        if (this.bones.head) {
            this.bones.head.rotation.z = headRotation * 0.3;
        }
    }

    resetToTPose() {
        if (!this.skeleton) return;

        this.skeleton.bones.forEach(bone => {
            if (this.boneMatrices[bone.name]) {
                const original = this.boneMatrices[bone.name];
                bone.position.copy(original.position);
                bone.quaternion.copy(original.quaternion);
                bone.scale.copy(original.scale);
            }
        });
    }

    reset() {
        this.smooth = {
            position: new THREE.Vector3(0, 0, -1.8),
            scale: 1.0,
            rotation: 0,
            boneRotations: {}
        };
        if (this.skeleton) {
            this.resetToTPose();
        }
        if (this.model) {
            this.model.visible = false;
        }
        this.frameCount = 0;
        console.log('🔄 Skeleton mapper reset');
    }

    // 🔧 NEW: Manual scale override for testing
    setManualScale(scale) {
        console.log(`🔧 Manual scale override: ${scale}`);
        if (this.model) {
            this.model.scale.setScalar(scale);
            this.smooth.scale = scale;
        }
    }

    // 🔧 NEW: Manual position override for testing
    setManualPosition(x, y, z) {
        console.log(`🔧 Manual position override: (${x}, ${y}, ${z})`);
        if (this.model) {
            this.model.position.set(x, y, z);
            this.smooth.position.set(x, y, z);
        }
    }
}

const skeletonMapper = new SkeletonMapper();