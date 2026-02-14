// AI Pipeline - FIXED - Graceful failure, doesn't block core features

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
        this.failedPermanently = false;
    }

    /**
     * Initialize AI pipeline - NON-BLOCKING
     */
    async init() {
        if (!CONFIG.AI_PIPELINE.ENABLED) {
            console.log('ℹ️ AI pipeline disabled in config');
            this.failedPermanently = true;
            return;
        }

        try {
            console.log('🤖 Attempting to connect to AI server...');
            
            // Create blend canvas
            this.blendCanvas = document.createElement('canvas');
            this.blendCtx = this.blendCanvas.getContext('2d');
            
            // ✅ CRITICAL: Try to connect but don't block startup
            await Promise.race([
                this.connect(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Connection timeout')), 5000)
                )
            ]);
            
            console.log('✅ AI pipeline connected');
            
        } catch (error) {
            // ✅ CRITICAL: Fail gracefully - don't throw
            console.warn('⚠️ AI server unavailable:', error.message);
            console.log('ℹ️ Continuing with 3D-only mode (no AI enhancement)');
            this.failedPermanently = true;
            
            // Hide AI indicator
            const aiIndicator = document.getElementById('ai-blend-indicator');
            if (aiIndicator) {
                aiIndicator.style.display = 'none';
            }
            
            // Don't throw - let app continue
        }
    }

    /**
     * Connect to WebSocket server
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(CONFIG.API.WS_URL);
                
                this.ws.onopen = () => {
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.failedPermanently = false;
                    Utils.updateStatus('ai', true);
                    console.log('✅ Connected to AI server');
                    resolve();
                };
                
                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };
                
                this.ws.onerror = (error) => {
                    console.warn('⚠️ WebSocket error:', error.message || 'Connection failed');
                    Utils.updateStatus('ai', false);
                    reject(error);
                };
                
                this.ws.onclose = () => {
                    this.isConnected = false;
                    Utils.updateStatus('ai', false);
                    console.log('ℹ️ Disconnected from AI server');
                    
                    // ✅ Only attempt reconnect if not permanently failed
                    if (!this.failedPermanently) {
                        this.handleDisconnect();
                    }
                };
                
                // Timeout
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
     * Start sending keyframes (only if connected)
     */
    start() {
        if (!this.isConnected || this.failedPermanently) {
            console.log('ℹ️ AI pipeline not started (not connected)');
            return;
        }

        console.log('🚀 Starting AI keyframe pipeline...');
        
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
            const cameraFrame = await cameraManager.captureFrameBase64('image/jpeg', 
                CONFIG.AI_PIPELINE.JPEG_QUALITY);
            
            const jacketRender = compositeRenderer.captureFrame();
            
            const pose = poseTracker.isPoseDetected() ? {
                landmarks: poseTracker.landmarks,
                shoulderWidth: poseTracker.getShoulderWidth(),
                rotation: poseTracker.getBodyRotation()
            } : null;
            
            const fabric = fabricSelector.getSelectedFabric();
            
            const payload = {
                type: 'keyframe',
                timestamp: Date.now(),
                camera_frame: cameraFrame,
                jacket_render: jacketRender,
                pose: pose,
                fabric_id: fabric ? fabric.id : null
            };
            
            this.ws.send(JSON.stringify(payload));
            
        } catch (error) {
            console.warn('⚠️ Error sending keyframe:', error.message);
        }
    }

    /**
     * Handle incoming message from server
     */
    async handleMessage(data) {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'keyframe_result') {
                this.latestAIFrame = message.image;
                this.startBlend();
            }
            
            if (message.type === 'error') {
                console.warn('⚠️ AI server error:', message.error);
            }
            
        } catch (error) {
            console.warn('⚠️ Error handling message:', error.message);
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
            
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            
            this.blendAlpha = easedProgress * CONFIG.AI_PIPELINE.MAX_BLEND_ALPHA;
            
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
        
        if (fillEl && percentEl) {
            const percent = Math.round(alpha * 100);
            fillEl.style.width = `${percent}%`;
            percentEl.textContent = `${percent}%`;
        }
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
     * Handle disconnection - with exponential backoff
     */
    async handleDisconnect() {
        if (this.reconnectAttempts >= CONFIG.AI_PIPELINE.MAX_RECONNECT_ATTEMPTS) {
            console.log('ℹ️ Max reconnect attempts reached - giving up');
            this.failedPermanently = true;
            
            // Hide AI indicator
            const aiIndicator = document.getElementById('ai-blend-indicator');
            if (aiIndicator) {
                aiIndicator.style.display = 'none';
            }
            return;
        }

        this.reconnectAttempts++;
        const delay = CONFIG.AI_PIPELINE.RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`⏳ Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${CONFIG.AI_PIPELINE.MAX_RECONNECT_ATTEMPTS})...`);
        
        await Utils.wait(delay);
        
        try {
            await this.connect();
            if (this.isConnected) {
                this.start();
            }
        } catch (error) {
            console.warn('⚠️ Reconnection failed:', error.message);
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
        console.log('⏹️ AI pipeline stopped');
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
        console.log('🔌 AI pipeline closed');
    }

    /**
     * Check if connected
     */
    isActive() {
        return this.isConnected && !this.failedPermanently;
    }
    
    /**
     * Check if permanently failed
     */
    hasFailed() {
        return this.failedPermanently;
    }
}

const aiPipeline = new AIPipeline();