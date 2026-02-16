class SkeletonMapper {
    constructor() {
        this.model = null;
        this.videoWidth = 0;
        this.videoHeight = 0;
        this.smooth = {
            position: new THREE.Vector3(),
            scale: 1.0,
            rotation: 0
        };
        this.initialized = false;
        this.hasShownJacket = false;
        this.frameCount = 0;
        this.lastLogTime = 0;
    }

    async init(videoWidth, videoHeight) {
        console.log('🦴 SkeletonMapper initializing...');
        this.videoWidth = videoWidth || 1280;
        this.videoHeight = videoHeight || 720;
        console.log(`📐 Video dimensions: ${this.videoWidth}x${this.videoHeight}`);
        this.initialized = true;
        return true;
    }

    setJacket(model) {
        this.model = model;
        console.log('🔗 Jacket linked to body tracker');
    }

    /**
     * ✅ FIXED: Better coordinate conversion and depth handling
     */
    normalizedToWorld(nx, ny, depth = 2.5) {
        const camera = sceneManager.getCamera();
        if (!camera) {
            console.error('❌ No camera found');
            return new THREE.Vector3(0, 0, -depth);
        }

        // Convert normalized (0-1) to NDC (-1 to 1)
        const ndcX = (nx - 0.5) * 2;
        const ndcY = -(ny - 0.5) * 2;  // Flip Y (screen space is top-down, 3D is bottom-up)

        // Get camera projection parameters
        const fov = camera.fov * (Math.PI / 180);
        const aspect = camera.aspect;
        
        // Calculate world space coordinates
        const viewHeight = 2 * Math.tan(fov / 2) * depth;
        const viewWidth = viewHeight * aspect;
        
        const worldX = ndcX * (viewWidth / 2);
        const worldY = ndcY * (viewHeight / 2);
        const worldZ = -depth;

        return new THREE.Vector3(worldX, worldY, worldZ);
    }

    /**
     * ✅ CRITICAL FIX: Proper body tracking with better visualization
     */
    update(poseData) {
        if (!this.model) {
            return;
        }

        this.frameCount++;

        // No pose detected - hide jacket
        if (!poseData || !poseData.landmarks) {
            this.model.visible = false;
            this.hasShownJacket = false;
            
            // Log every 2 seconds
            const now = performance.now();
            if (now - this.lastLogTime > 2000) {
                console.log('⚠️ No pose landmarks detected');
                this.lastLogTime = now;
            }
            return;
        }

        const landmarks = poseData.landmarks;
        const L = CONFIG.SKELETON.LANDMARKS;

        const LS = landmarks[L.LEFT_SHOULDER];
        const RS = landmarks[L.RIGHT_SHOULDER];
        const LH = landmarks[L.LEFT_HIP];
        const RH = landmarks[L.RIGHT_HIP];
        const nose = landmarks[L.NOSE];

        // Check visibility - be more lenient
        if (!LS || !RS || LS.visibility < 0.3 || RS.visibility < 0.3) {
            this.model.visible = false;
            
            if (this.frameCount % 60 === 0) {
                console.log('⚠️ Shoulders not visible enough:', {
                    left: LS?.visibility.toFixed(2),
                    right: RS?.visibility.toFixed(2)
                });
            }
            return;
        }

        /* ================= POSITION ================= */

        // Use shoulders midpoint for position (more stable than torso center)
        const shoulderCenterX = (LS.x + RS.x) / 2;
        const shoulderCenterY = (LS.y + RS.y) / 2;
        
        // Calculate approximate depth based on shoulder width
        // Smaller shoulder width = farther away, larger = closer
        const dx = RS.x - LS.x;
        const dy = RS.y - LS.y;
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy);
        
        // Adaptive depth: closer when shoulders are wider
        // Reference: 0.2 width = 2.5m depth
        const BASE_DEPTH = 2.5;
        const REFERENCE_WIDTH = 0.2;
        const depth = BASE_DEPTH * (REFERENCE_WIDTH / Math.max(shoulderWidth, 0.1));
        const clampedDepth = THREE.MathUtils.clamp(depth, 1.5, 4.0);

        // Convert to world space with calculated depth
        const worldPos = this.normalizedToWorld(
            shoulderCenterX, 
            shoulderCenterY, 
            clampedDepth
        );

        // Smooth position with adaptive factor
        const positionSmoothing = 0.3;
        this.smooth.position.lerp(worldPos, positionSmoothing);
        this.model.position.copy(this.smooth.position);

        /* ================= SCALE ================= */

        // Calculate scale based on shoulder width
        // The jacket should scale proportionally to the person's size
        const BASE_SCALE_MULTIPLIER = 4.0;  // Increased for better visibility
        const targetScale = shoulderWidth * BASE_SCALE_MULTIPLIER;
        const clampedScale = THREE.MathUtils.clamp(targetScale, 0.3, 1.2);

        // Smooth scale
        const scaleSmoothing = 0.25;
        this.smooth.scale += (clampedScale - this.smooth.scale) * scaleSmoothing;
        this.model.scale.setScalar(this.smooth.scale);

        /* ================= ROTATION ================= */

        // Calculate body roll (shoulder tilt)
        const roll = Math.atan2(dy, dx);

        // Smooth rotation
        const rotationSmoothing = 0.3;
        this.smooth.rotation += (roll - this.smooth.rotation) * rotationSmoothing;

        // Apply rotation
        // The jacket is already flipped in loader.js, so we just apply the roll
        this.model.rotation.set(
            Math.PI,  // Keep the 180° flip from loader
            0,
            this.smooth.rotation  // Apply the roll (shoulder tilt)
        );

        /* ================= VISIBILITY ================= */

        this.model.visible = true;

        // Log first successful track and periodically
        const now = performance.now();
        if (!this.hasShownJacket || now - this.lastLogTime > 3000) {
            console.log('✅ Jacket tracking:', {
                position: `(${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})`,
                scale: this.smooth.scale.toFixed(3),
                shoulderWidth: shoulderWidth.toFixed(3),
                depth: clampedDepth.toFixed(2),
                rotation: (this.smooth.rotation * 180 / Math.PI).toFixed(1) + '°',
                visibility: {
                    leftShoulder: LS.visibility.toFixed(2),
                    rightShoulder: RS.visibility.toFixed(2)
                }
            });
            this.hasShownJacket = true;
            this.lastLogTime = now;
        }
    }

    /**
     * Reset tracking state
     */
    reset() {
        this.smooth.position.set(0, 0, 0);
        this.smooth.scale = 1.0;
        this.smooth.rotation = 0;
        this.hasShownJacket = false;
        this.frameCount = 0;
        if (this.model) {
            this.model.visible = false;
        }
        console.log('🔄 Skeleton mapper reset');
    }

    /**
     * Get current tracking quality
     */
    getTrackingQuality() {
        if (!this.model || !this.model.visible) {
            return 0;
        }
        return 1.0;
    }

    /**
     * Debug: Draw skeleton overlay (optional)
     */
    debugDrawSkeleton(landmarks) {
        if (!CONFIG.DEBUG.SHOW_SKELETON) return;
        
        const L = CONFIG.SKELETON.LANDMARKS;
        const scene = sceneManager.getScene();
        
        // Remove old debug objects
        const oldDebug = scene.getObjectByName('debug_skeleton');
        if (oldDebug) scene.remove(oldDebug);
        
        // Create new debug group
        const debugGroup = new THREE.Group();
        debugGroup.name = 'debug_skeleton';
        
        // Draw key points
        const keyPoints = [
            L.LEFT_SHOULDER, L.RIGHT_SHOULDER,
            L.LEFT_ELBOW, L.RIGHT_ELBOW,
            L.LEFT_HIP, L.RIGHT_HIP,
            L.NOSE
        ];
        
        const sphereGeom = new THREE.SphereGeometry(0.05, 8, 8);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        
        keyPoints.forEach(idx => {
            const lm = landmarks[idx];
            if (lm && lm.visibility > 0.3) {
                const worldPos = this.normalizedToWorld(lm.x, lm.y, 2.5);
                const sphere = new THREE.Mesh(sphereGeom, sphereMat);
                sphere.position.copy(worldPos);
                debugGroup.add(sphere);
            }
        });
        
        scene.add(debugGroup);
    }
}

const skeletonMapper = new SkeletonMapper();