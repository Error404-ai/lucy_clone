// skeleton-mapper.js - Maps MediaPipe pose landmarks to 3D jacket model

class SkeletonMapper {
    constructor() {
        this.model = null;
        this.hasValidPose = false;
        this.framesWithoutPose = 0;
        this.smoothedPositions = new Map();
        this.lastLogTime = 0;
        
        console.log('🦴 SkeletonMapper initialized');
    }

    /**
     * Set the jacket model
     */
    setJacket(model) {
        this.model = model;
        console.log('🔗 Jacket linked to SkeletonMapper');
    }

    /**
     * Show jacket in center of view when no pose is detected
     */
    showInCenter() {
        if (!this.model) return;

        // Use config values for positioning
        this.model.position.set(
            CONFIG.JACKET.POSITION.x,
            CONFIG.JACKET.POSITION.y,
            CONFIG.JACKET.POSITION.z
        );
        
        this.model.scale.setScalar(CONFIG.JACKET.SCALE);
        this.model.visible = true;
        
        // Only log occasionally to avoid spam (every 5 seconds)
        const now = Date.now();
        if (!this.lastLogTime || now - this.lastLogTime > 5000) {
            console.log('📍 Jacket in center (no pose) - Position:', 
                `[${CONFIG.JACKET.POSITION.x}, ${CONFIG.JACKET.POSITION.y}, ${CONFIG.JACKET.POSITION.z}]`,
                `Scale: ${CONFIG.JACKET.SCALE}`);
            this.lastLogTime = now;
        }
    }

    /**
     * Force jacket to be visible
     */
    forceVisible() {
        if (this.model) {
            this.model.visible = true;
        }
    }

    /**
     * Update jacket position and scale based on pose landmarks
     */
    update(poseLandmarks) {
        if (!this.model) return;

        // If no pose, show in center
        if (!poseLandmarks || poseLandmarks.length === 0) {
            this.hasValidPose = false;
            this.framesWithoutPose++;
            this.showInCenter();
            return;
        }

        // We have a valid pose!
        this.hasValidPose = true;
        this.framesWithoutPose = 0;

        // Get key shoulder landmarks
        const leftShoulder = poseLandmarks[11];
        const rightShoulder = poseLandmarks[12];

        if (!leftShoulder || !rightShoulder) {
            this.showInCenter();
            return;
        }

        // Calculate center position between shoulders
        const centerX = (leftShoulder.x + rightShoulder.x) / 2;
        const centerY = (leftShoulder.y + rightShoulder.y) / 2;
        const centerZ = (leftShoulder.z + rightShoulder.z) / 2;

        // Calculate shoulder width for scaling
        const shoulderWidth = Math.sqrt(
            Math.pow(rightShoulder.x - leftShoulder.x, 2) +
            Math.pow(rightShoulder.y - leftShoulder.y, 2) +
            Math.pow(rightShoulder.z - leftShoulder.z, 2)
        );

        // Convert normalized coordinates to 3D space
        const x = (centerX - 0.5) * 2;  // Convert to [-1, 1]
        const y = -(centerY - 0.5) * 2; // Invert Y and convert to [-1, 1]
        const z = CONFIG.SKELETON.DEPTH_OFFSET + (centerZ * -2);

        // Calculate scale based on shoulder width
        let scale = shoulderWidth * CONFIG.SKELETON.BASE_SCALE;
        scale = Math.max(CONFIG.SKELETON.MIN_SCALE, Math.min(CONFIG.SKELETON.MAX_SCALE, scale));

        // Apply smoothing if enabled
        if (CONFIG.SKELETON.SMOOTHING_FACTOR) {
            const smoothX = this.smoothValue('x', x, CONFIG.SKELETON.SMOOTHING_FACTOR);
            const smoothY = this.smoothValue('y', y, CONFIG.SKELETON.SMOOTHING_FACTOR);
            const smoothZ = this.smoothValue('z', z, CONFIG.SKELETON.SMOOTHING_FACTOR);
            const smoothScale = this.smoothValue('scale', scale, CONFIG.SKELETON.SMOOTHING_FACTOR);

            this.model.position.set(smoothX, smoothY, smoothZ);
            this.model.scale.setScalar(smoothScale);
        } else {
            this.model.position.set(x, y, z);
            this.model.scale.setScalar(scale);
        }

        this.model.visible = true;
        
        // Log occasionally (every 60 frames = ~2 seconds at 30fps)
        if (this.framesWithoutPose % 60 === 0) {
            console.log(`✅ Pose tracked - Position: [${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}], Scale: ${scale.toFixed(2)}`);
        }
    }

    /**
     * Smooth a value over time using exponential moving average
     */
    smoothValue(key, newValue, factor) {
        const oldValue = this.smoothedPositions.get(key);
        if (oldValue === undefined) {
            this.smoothedPositions.set(key, newValue);
            return newValue;
        }
        
        const smoothed = oldValue + (newValue - oldValue) * factor;
        this.smoothedPositions.set(key, smoothed);
        return smoothed;
    }

    /**
     * Get current status for debugging
     */
    getStatus() {
        return {
            hasValidPose: this.hasValidPose,
            framesWithoutPose: this.framesWithoutPose,
            position: this.model ? {
                x: this.model.position.x,
                y: this.model.position.y,
                z: this.model.position.z
            } : null,
            scale: this.model ? this.model.scale.x : null,
            visible: this.model ? this.model.visible : false
        };
    }
}

// Initialize global instance
const skeletonMapper = new SkeletonMapper();