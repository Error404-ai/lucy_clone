// AI Pipeline - WebSocket connection for real-time AI enhancement

class AIPipeline {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.keyframeInterval = null;
        this.latestAIFrame = null;
        this.blendAlpha = 0;
        this.isBlending = false;
        this.blendCanvas = null;
        this.blendCtx = null;
    }

    /**
     * Initialize AI pipeline
     */
    async init() {
        if (!CONFIG.AI_PIPELINE.ENABLED) {
            console.log('AI pipeline disabled in config');
            return;
        }

        try {
            console.log('Initializing AI pipeline...');
            
            // Create blend canvas for compositing
            this.blendCanvas = document.createElement('canvas');
            this.blendCtx = this.blendCanvas.getContext('2d');
            
            // Connect to WebSocket
            await this.connect();
            
            console.log('AI pipeline initialized');
            
        } catch (error) {
            console.error('AI pipeline initialization failed:', error);
            Utils.showError('AI enhancement unavailable - using 3D preview only');
        }
    }

    /**
     * Connect to WebSocket server
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                console.log('Connecting to AI server...');
                
                this.ws = new WebSocket(CONFIG.API.WS_URL);
                
                this.ws.onopen = () => {
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    Utils.updateStatus('ai', true);
                    console.log('Connected to AI server');
                    resolve();
                };
                
                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };
                
                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    Utils.updateStatus('ai', false);
                };
                
                this.ws.onclose = () => {
                    this.isConnected = false;
                    Utils.updateStatus('ai', false);
                    console.log('Disconnected from AI server');
                    this.handleDisconnect();
                };
                
                // Timeout after 5 seconds
                setTimeout(() => {
                    if (!this.isConnected) {
                        reject(new Error('Connection timeout'));
                    }
                }, 5000);
                
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Start sending keyframes
     */
    start() {
        if (!this.isConnected) {
            console.warn('Cannot start AI pipeline - not connected');
            return;
        }

        console.log('Starting AI keyframe pipeline...');
        
        // Send keyframes at regular intervals
        this.keyframeInterval = setInterval(() => {
            this.sendKeyframe();
        }, CONFIG.AI_PIPELINE.KEYFRAME_INTERVAL);
    }

    /**
     * Send keyframe to AI server
     */
    async sendKeyframe() {
        if (!this.isConnected || !cameraManager.isReady()) return;

        try {
            // Capture camera frame
            const cameraFrame = await cameraManager.captureFrameBase64('image/jpeg', 
                CONFIG.AI_PIPELINE.JPEG_QUALITY);
            
            // Capture 3D jacket render
            const jacketRender = compositeRenderer.captureFrame();
            
            // Get pose landmarks
            const pose = poseTracker.isPoseDetected() ? {
                landmarks: poseTracker.landmarks,
                shoulderWidth: poseTracker.getShoulderWidth(),
                rotation: poseTracker.getBodyRotation()
            } : null;
            
            // Get current fabric
            const fabric = fabricSelector.getSelectedFabric();
            
            // Prepare payload
            const payload = {
                type: 'keyframe',
                timestamp: Date.now(),
                camera_frame: cameraFrame,
                jacket_render: jacketRender,
                pose: pose,
                fabric_id: fabric ? fabric.id : null
            };
            
            // Send via WebSocket
            this.ws.send(JSON.stringify(payload));
            
        } catch (error) {
            console.error('Error sending keyframe:', error);
        }
    }

    /**
     * Handle incoming message from server
     */
    async handleMessage(data) {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'keyframe_result') {
                // Received AI-enhanced frame
                this.latestAIFrame = message.image;
                
                // Start blending animation
                this.startBlend();
            }
            
            if (message.type === 'error') {
                console.error('AI server error:', message.error);
            }
            
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }

    /**
     * Start blend animation
     */
    startBlend() {
        if (this.isBlending) return;
        
        this.isBlending = true;
        const startTime = performance.now();
        const duration = CONFIG.AI_PIPELINE.BLEND_TRANSITION_DURATION;
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Ease-out cubic
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            
            // Update blend alpha
            this.blendAlpha = easedProgress * CONFIG.AI_PIPELINE.MAX_BLEND_ALPHA;
            
            // Update UI indicator
            this.updateBlendIndicator(this.blendAlpha);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.isBlending = false;
            }
        };
        
        requestAnimationFrame(animate);
    }

    /**
     * Update blend indicator UI
     */
    updateBlendIndicator(alpha) {
        const fillEl = document.getElementById('blend-fill');
        const percentEl = document.getElementById('blend-percentage');
        
        const percent = Math.round(alpha * 100);
        fillEl.style.width = `${percent}%`;
        percentEl.textContent = `${percent}%`;
    }

    /**
     * Get current blend alpha
     */
    getBlendAlpha() {
        return this.blendAlpha;
    }

    /**
     * Get latest AI frame
     */
    getLatestFrame() {
        return this.latestAIFrame;
    }

    /**
     * Handle disconnection
     */
    async handleDisconnect() {
        if (this.reconnectAttempts >= CONFIG.AI_PIPELINE.MAX_RECONNECT_ATTEMPTS) {
            console.log('Max reconnect attempts reached');
            Utils.showError('AI enhancement unavailable - using 3D preview only');
            return;
        }

        console.log(`Attempting to reconnect (${this.reconnectAttempts + 1}/${CONFIG.AI_PIPELINE.MAX_RECONNECT_ATTEMPTS})...`);
        
        this.reconnectAttempts++;
        
        await Utils.wait(CONFIG.AI_PIPELINE.RECONNECT_DELAY);
        
        try {
            await this.connect();
            if (this.isConnected) {
                this.start();
            }
        } catch (error) {
            console.error('Reconnection failed:', error);
        }
    }

    /**
     * Stop pipeline
     */
    stop() {
        if (this.keyframeInterval) {
            clearInterval(this.keyframeInterval);
            this.keyframeInterval = null;
        }
        
        console.log('AI pipeline stopped');
    }

    /**
     * Close connection
     */
    close() {
        this.stop();
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        this.isConnected = false;
        Utils.updateStatus('ai', false);
        console.log('AI pipeline closed');
    }

    /**
     * Check if connected
     */
    isActive() {
        return this.isConnected;
    }
}

// Create global instance
const aiPipeline = new AIPipeline();