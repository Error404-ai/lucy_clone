// Skeleton Mapper - MOBILE-OPTIMIZED with aggressive visibility

class EnhancedSkeletonMapper {
    constructor() {
        this.width = 0;
        this.height = 0;
        this.initialized = false;
        this.lastPose = null;
        this.hasShownJacket = false;
        this.updateCount = 0;
        this.forceShowAttempts = 0;
        this.visibilityCheckInterval = null;
        
        this.smoothBuffer = {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: 1
        };
        
        // 🔴 MOBILE-OPTIMIZED - More prominent positioning
        this.calibration = {
            scaleMultiplier: 18.0,  // Bigger on mobile
            depthOffset: -2.0,      // Much closer to camera
            depthMultiplier: 2.0,
            verticalOffset: -1.5,   // Lower on screen
            horizontalOffset: 0.0,
            smoothingAlpha: 0.15    // Less smoothing for responsiveness
        };
        
        this.isTracking = false;
        this.minConfidence = 0.3;
    }

    init(width, height) {
        this.width = width;
        this.height = height;
        this.initialized = true;
        console.log("✅ Skeleton Mapper initialized:", width, "x", height);
        
        // 🔴 CRITICAL: Aggressive visibility enforcement
        this.startVisibilityEnforcement();
        
        // 🔴 Force show after very short delay
        setTimeout(() => {
            console.log('🔴 INITIAL FORCE SHOW (1 second)');
            this.forceShowJacketNow();
        }, 1000);
        
        // 🔴 Backup force show
        setTimeout(() => {
            console.log('🔴 BACKUP FORCE SHOW (3 seconds)');
            this.forceShowJacketNow();
        }, 3000);
    }

    startVisibilityEnforcement() {
        // 🔴 Check visibility every 100ms and force if needed
        this.visibilityCheckInterval = setInterval(() => {
            const jacket = modelLoader.getModel();
            if (jacket && !jacket.visible && this.initialized) {
                console.warn('⚠️ Jacket became invisible - forcing visible');
                jacket.visible = true;
                
                // Also ensure meshes are visible
                const meshes = modelLoader.getMeshes();
                meshes.forEach(mesh => {
                    if (!mesh.visible) {
                        mesh.visible = true;
                        console.warn('⚠️ Mesh became invisible - forcing visible:', mesh.name);
                    }
                });
            }
        }, 100);  // Check 10 times per second
        
        console.log('✅ Visibility enforcement started');
    }

    update(poseData) {
        if (!this.initialized) return;

        this.updateCount++;

        const jacket = modelLoader.getModel();
        if (!jacket) {
            console.warn('⚠️ No jacket model at frame', this.updateCount);
            return;
        }

        // 🔴 FORCE visibility every 30 frames (1 second at 30fps)
        if (this.updateCount % 30 === 0) {
            if (!jacket.visible) {
                console.log(`🔴 FORCING jacket visible at frame ${this.updateCount}`);
                jacket.visible = true;
            }
            this.hasShownJacket = true;
        }

        // 🔴 Initial aggressive showing
        if (!this.hasShownJacket && this.updateCount > 3) {
            jacket.visible = true;
            this.hasShownJacket = true;
            console.log('🔴 Initial show at frame', this.updateCount);
        }

        // If we have pose data, use it; otherwise use default position
        if (poseData && poseData.landmarks && poseData.landmarks.length >= 33) {
            try {
                const landmarks = poseData.landmarks;
                
                const position = this.calculateShoulderPosition(landmarks);
                const rotation = this.calculateBodyRotation(landmarks);
                const scale = this.calculateShoulderScale(landmarks);

                const smoothPos = this.applySmoothing(position, 'position');
                const smoothRot = this.applySmoothing(rotation, 'rotation');
                const smoothScale = this.applySmoothing({ x: scale, y: scale, z: scale }, 'scale').x;

                jacket.position.set(smoothPos.x, smoothPos.y, smoothPos.z);
                jacket.rotation.set(smoothRot.x, smoothRot.y, smoothRot.z);
                jacket.scale.set(smoothScale, smoothScale, smoothScale);

                this.isTracking = true;
                this.lastPose = poseData;

                if (this.updateCount % 120 === 0) {
                    console.log(`📍 TRACKING: pos(${smoothPos.x.toFixed(1)}, ${smoothPos.y.toFixed(1)}, ${smoothPos.z.toFixed(1)}), scale: ${smoothScale.toFixed(1)}, visible: ${jacket.visible}`);
                }

            } catch (error) {
                console.error('❌ Update error:', error);
            }
        } else {
            // 🔴 NO POSE: Show jacket in center of screen with good size
            if (this.updateCount % 30 === 0) {
                jacket.position.set(0, -1.5, -2.0);
                jacket.scale.set(12, 12, 12);
                jacket.rotation.set(Math.PI, Math.PI, 0);
                console.log('📍 NO POSE: Showing jacket in center');
            }
        }

        // 🔴 ALWAYS ensure visibility
        if (!jacket.visible) {
            jacket.visible = true;
        }
    }

    calculateShoulderPosition(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];
        
        if (!leftShoulder || !rightShoulder) {
            // Default center position
            return { x: 0, y: -1.5, z: -2.0 };
        }

        const shoulderCenter = {
            x: (leftShoulder.x + rightShoulder.x) / 2,
            y: (leftShoulder.y + rightShoulder.y) / 2,
            z: (leftShoulder.z + rightShoulder.z) / 2
        };

        const nose = landmarks[L.NOSE];
        const avgDepth = nose ? (leftShoulder.z + rightShoulder.z + nose.z) / 3 : shoulderCenter.z;

        const x = (shoulderCenter.x - 0.5) * 16 + this.calibration.horizontalOffset;
        const y = -(shoulderCenter.y - 0.5) * 16 + this.calibration.verticalOffset;
        const z = this.calibration.depthOffset + (avgDepth * this.calibration.depthMultiplier);

        return { x, y, z };
    }

    calculateBodyRotation(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];
        
        if (!leftShoulder || !rightShoulder) {
            return { x: Math.PI, y: Math.PI, z: 0 };
        }

        const dx = rightShoulder.x - leftShoulder.x;
        const dy = rightShoulder.y - leftShoulder.y;
        const rollAngle = Math.atan2(dy, dx);
        
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy);
        const depthDiff = rightShoulder.z - leftShoulder.z;
        const yawAngle = Math.atan2(depthDiff, shoulderWidth) * 1.5;
        
        return {
            x: Math.PI,
            y: Math.PI + yawAngle,
            z: -rollAngle
        };
    }

    calculateShoulderScale(landmarks) {
        const L = CONFIG.SKELETON.LANDMARKS;
        const leftShoulder = landmarks[L.LEFT_SHOULDER];
        const rightShoulder = landmarks[L.RIGHT_SHOULDER];
        
        if (!leftShoulder || !rightShoulder) {
            return 12.0;  // Default size
        }

        const dx = rightShoulder.x - leftShoulder.x;
        const dy = rightShoulder.y - leftShoulder.y;
        const dz = rightShoulder.z - leftShoulder.z;
        const shoulderWidth = Math.sqrt(dx * dx + dy * dy + dz * dz);

        let scale = shoulderWidth * this.calibration.scaleMultiplier;
        return Utils.clamp(scale, 8.0, 20.0);  // Bigger range for mobile
    }

    applySmoothing(current, key) {
        const alpha = this.calibration.smoothingAlpha;
        const prev = this.smoothBuffer[key];

        const smoothed = {
            x: Utils.ema(current.x, prev.x, alpha),
            y: Utils.ema(current.y, prev.y, alpha),
            z: Utils.ema(current.z, prev.z, alpha)
        };

        this.smoothBuffer[key] = smoothed;
        return smoothed;
    }

    forceShowJacket() {
        this.forceShowJacketNow();
    }

    forceShowJacketNow() {
        this.forceShowAttempts++;
        const jacket = modelLoader.getModel();
        
        if (jacket) {
            jacket.visible = true;
            this.hasShownJacket = true;
            
            // 🔴 Set prominent default position for mobile
            jacket.position.set(0, -1.5, -2.0);
            jacket.scale.set(12, 12, 12);
            jacket.rotation.set(Math.PI, Math.PI, 0);
            
            // 🔴 Force ALL meshes visible
            const meshes = modelLoader.getMeshes();
            meshes.forEach(mesh => {
                mesh.visible = true;
                mesh.frustumCulled = false;  // Don't cull
            });
            
            console.log(`🔴 FORCE SHOW JACKET (attempt ${this.forceShowAttempts})`);
            console.log('   Position:', jacket.position.toArray());
            console.log('   Scale:', jacket.scale.toArray());
            console.log('   Visible:', jacket.visible);
            console.log('   Meshes:', meshes.length, 'all forced visible');
        } else {
            console.error('❌ Jacket model not loaded at force attempt', this.forceShowAttempts);
        }
    }

    reset() {
        this.smoothBuffer = { 
            position: { x: 0, y: 0, z: 0 }, 
            rotation: { x: 0, y: 0, z: 0 }, 
            scale: 1 
        };
        this.lastPose = null;
        this.isTracking = false;
        this.hasShownJacket = false;
        this.updateCount = 0;
        this.forceShowAttempts = 0;
        
        if (this.visibilityCheckInterval) {
            clearInterval(this.visibilityCheckInterval);
            this.visibilityCheckInterval = null;
        }
    }

    getTrackingStatus() {
        return {
            isTracking: this.isTracking,
            hasShownJacket: this.hasShownJacket,
            updateCount: this.updateCount,
            forceShowAttempts: this.forceShowAttempts
        };
    }

    updateCalibration(params) {
        Object.assign(this.calibration, params);
        console.log('📐 Calibration updated:', params);
    }
    
    dispose() {
        if (this.visibilityCheckInterval) {
            clearInterval(this.visibilityCheckInterval);
            this.visibilityCheckInterval = null;
        }
        console.log('Skeleton mapper disposed');
    }
}

const skeletonMapper = new EnhancedSkeletonMapper();