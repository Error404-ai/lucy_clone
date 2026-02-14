// Camera Manager - FIXED with demo mode that handles autoplay restrictions

class CameraManager {
    constructor() {
        this.video = document.getElementById('camera-video');
        this.stream = null;
        this.isActive = false;
        this.devices = [];
        this.currentDeviceId = null;
        this.isDemoMode = false;
        this.demoCanvas = null;
        this.demoCtx = null;
        this.demoAnimationId = null;
    }

    async init() {
        try {
            console.log('🎥 Initializing camera...');
            
            // Check if mediaDevices is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                console.warn('⚠️ Camera API not supported - entering demo mode');
                return await this.initDemoMode();
            }
            
            // First, enumerate devices to see what's available
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = devices.filter(d => d.kind === 'videoinput');
                console.log(`📹 Found ${videoDevices.length} video input device(s)`);
                
                if (videoDevices.length === 0) {
                    console.warn('⚠️ No camera devices found - entering demo mode');
                    return await this.initDemoMode();
                }
            } catch (enumError) {
                console.warn('⚠️ Could not enumerate devices:', enumError);
                // Continue to try camera access anyway
            }
            
            // Request camera access with better constraints
            const constraints = {
                video: {
                    width: { ideal: CONFIG.CAMERA.WIDTH },
                    height: { ideal: CONFIG.CAMERA.HEIGHT },
                    frameRate: { ideal: CONFIG.CAMERA.FRAME_RATE },
                    facingMode: CONFIG.CAMERA.FACING_MODE
                },
                audio: false
            };

            console.log('📸 Requesting camera access...');
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            console.log('✅ Camera access granted');
            this.video.srcObject = this.stream;
            
            // Wait for video to be ready
            await new Promise((resolve, reject) => {
                this.video.onloadedmetadata = () => {
                    this.video.play()
                        .then(() => {
                            console.log('✅ Video playing');
                            resolve();
                        })
                        .catch(reject);
                };
                
                // Timeout after 10 seconds
                setTimeout(() => reject(new Error('Video load timeout')), 10000);
            });

            // Get available devices AFTER getting permission
            await this.getDevices();

            this.isActive = true;
            Utils.updateStatus('camera', true);
            console.log('✅ Camera initialized:', this.video.videoWidth, 'x', this.video.videoHeight);
            
            return {
                width: this.video.videoWidth,
                height: this.video.videoHeight
            };
            
        } catch (error) {
            console.error('❌ Camera initialization failed:', error);
            Utils.updateStatus('camera', false);
            
            // Better error messages and fallbacks
            if (error.name === 'NotAllowedError') {
                // Don't throw - go to demo mode instead
                console.warn('⚠️ Camera permission denied - entering demo mode');
                return await this.initDemoMode();
            } else if (error.name === 'NotFoundError') {
                console.warn('⚠️ No camera found - entering demo mode');
                return await this.initDemoMode();
            } else if (error.name === 'NotReadableError') {
                console.warn('⚠️ Camera in use - entering demo mode');
                return await this.initDemoMode();
            } else if (error.name === 'OverconstrainedError') {
                console.log('⚠️ Trying with minimal constraints...');
                return await this.initWithMinimalConstraints();
            } else {
                console.warn('⚠️ Camera error - entering demo mode');
                return await this.initDemoMode();
            }
        }
    }

    async initDemoMode() {
        console.log('🎬 Initializing DEMO MODE (no camera)');
        
        // Create a canvas as fake video feed
        const canvas = document.createElement('canvas');
        canvas.width = CONFIG.CAMERA.WIDTH || 640;
        canvas.height = CONFIG.CAMERA.HEIGHT || 480;
        
        const ctx = canvas.getContext('2d');
        
        // Draw a gradient background with text
        const drawDemoFrame = () => {
            // Gradient background
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            gradient.addColorStop(0, '#1E293B');
            gradient.addColorStop(1, '#0F172A');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Add text
            ctx.fillStyle = '#64748B';
            ctx.font = 'bold 24px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('DEMO MODE', canvas.width / 2, canvas.height / 2 - 40);
            
            ctx.font = '16px Inter, sans-serif';
            ctx.fillStyle = '#94A3B8';
            ctx.fillText('No camera detected', canvas.width / 2, canvas.height / 2);
            ctx.fillText('Jacket will appear in center', canvas.width / 2, canvas.height / 2 + 30);
            
            // Add a simple silhouette
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 3;
            ctx.beginPath();
            // Head
            ctx.arc(canvas.width / 2, canvas.height / 2 - 80, 30, 0, Math.PI * 2);
            ctx.stroke();
            // Body
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2, canvas.height / 2 - 50);
            ctx.lineTo(canvas.width / 2, canvas.height / 2 + 60);
            ctx.stroke();
            // Arms
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2, canvas.height / 2 - 30);
            ctx.lineTo(canvas.width / 2 - 60, canvas.height / 2 + 20);
            ctx.moveTo(canvas.width / 2, canvas.height / 2 - 30);
            ctx.lineTo(canvas.width / 2 + 60, canvas.height / 2 + 20);
            ctx.stroke();
        };
        
        try {
            // Draw initial frame
            drawDemoFrame();
            
            // 🔥 FIX: Use captureStream without trying to play it
            this.stream = canvas.captureStream(30);
            this.video.srcObject = this.stream;
            this.video.muted = true; // Ensure muted for autoplay
            this.video.playsInline = true; // Important for mobile
            
            this.demoCanvas = canvas;
            this.demoCtx = ctx;
            this.isDemoMode = true;
            
            // 🔥 FIX: Don't await play() - handle the promise
            const playPromise = this.video.play();
            
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log('✅ Demo video playing');
                    })
                    .catch(error => {
                        // Autoplay blocked - that's OK in demo mode
                        console.log('⚠️ Autoplay blocked (expected):', error.message);
                        // Video will be "playing" from stream perspective even if blocked
                    });
            }
            
            // Animate demo mode - use requestAnimationFrame instead of setInterval
            const animate = () => {
                if (this.isDemoMode) {
                    drawDemoFrame();
                    this.demoAnimationId = requestAnimationFrame(animate);
                }
            };
            animate();
            
            // Give it a moment to initialize
            await new Promise(resolve => setTimeout(resolve, 100));
            
            this.isActive = true;
            Utils.updateStatus('camera', true);
            console.log('✅ Demo mode initialized:', canvas.width, 'x', canvas.height);
            
            // Show user-friendly message
            setTimeout(() => {
                Utils.showError('Running in demo mode - jacket will appear in center');
            }, 500);
            
            return {
                width: canvas.width,
                height: canvas.height
            };
            
        } catch (error) {
            console.error('❌ Demo mode failed:', error);
            // Even if demo mode fails, return dimensions so app can continue
            this.isActive = true;
            Utils.updateStatus('camera', true);
            return {
                width: canvas.width,
                height: canvas.height
            };
        }
    }

    async initWithMinimalConstraints() {
        try {
            const constraints = {
                video: true,
                audio: false
            };

            console.log('📸 Requesting camera with minimal constraints...');
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            this.video.muted = true;
            this.video.playsInline = true;
            
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play().then(resolve).catch(() => resolve());
                };
            });

            await this.getDevices();

            this.isActive = true;
            Utils.updateStatus('camera', true);
            console.log('✅ Camera initialized (minimal constraints)');
            
            return {
                width: this.video.videoWidth,
                height: this.video.videoHeight
            };
        } catch (error) {
            console.warn('⚠️ Minimal constraints also failed - entering demo mode');
            return await this.initDemoMode();
        }
    }

    async getDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.devices = devices.filter(device => device.kind === 'videoinput');
            console.log(`✅ Found ${this.devices.length} camera(s):`);
            this.devices.forEach((device, i) => {
                console.log(`  ${i + 1}. ${device.label || 'Camera ' + (i + 1)}`);
            });
            return this.devices;
        } catch (error) {
            console.error('Error getting devices:', error);
            return [];
        }
    }

    async switchCamera(deviceId) {
        if (!deviceId || deviceId === this.currentDeviceId || this.isDemoMode) return;
        
        try {
            this.stop();
            
            const constraints = {
                video: {
                    deviceId: { exact: deviceId },
                    width: { ideal: CONFIG.CAMERA.WIDTH },
                    height: { ideal: CONFIG.CAMERA.HEIGHT },
                    frameRate: { ideal: CONFIG.CAMERA.FRAME_RATE }
                },
                audio: false
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            this.video.muted = true;
            this.video.playsInline = true;
            this.currentDeviceId = deviceId;
            
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play().then(resolve).catch(() => resolve());
                };
            });

            this.isActive = true;
            Utils.updateStatus('camera', true);
            console.log('✅ Switched to camera:', deviceId);
            
        } catch (error) {
            console.error('Error switching camera:', error);
            Utils.showError('Could not switch camera');
        }
    }

    getFrame() {
        if (!this.isActive) return null;

        const canvas = document.createElement('canvas');
        canvas.width = this.video.videoWidth || CONFIG.CAMERA.WIDTH || 640;
        canvas.height = this.video.videoHeight || CONFIG.CAMERA.HEIGHT || 480;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);
        
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    getFrameCanvas() {
        if (!this.isActive) return null;

        const canvas = document.createElement('canvas');
        canvas.width = this.video.videoWidth || CONFIG.CAMERA.WIDTH || 640;
        canvas.height = this.video.videoHeight || CONFIG.CAMERA.HEIGHT || 480;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);
        
        return canvas;
    }

    async captureFrame(format = 'image/jpeg', quality = 0.95) {
        if (!this.isActive) return null;

        const canvas = this.getFrameCanvas();
        return await Utils.canvasToBlob(canvas, format, quality);
    }

    async captureFrameBase64(format = 'image/jpeg', quality = 0.95) {
        const blob = await this.captureFrame(format, quality);
        if (!blob) return null;
        return await Utils.blobToBase64(blob);
    }

    getDimensions() {
        return {
            width: this.video.videoWidth || CONFIG.CAMERA.WIDTH || 640,
            height: this.video.videoHeight || CONFIG.CAMERA.HEIGHT || 480
        };
    }

    isReady() {
        // In demo mode, we're always "ready"
        if (this.isDemoMode) return this.isActive;
        return this.isActive && this.video.readyState === this.video.HAVE_ENOUGH_DATA;
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        if (this.demoAnimationId) {
            cancelAnimationFrame(this.demoAnimationId);
            this.demoAnimationId = null;
        }
        
        this.isActive = false;
        this.isDemoMode = false;
        Utils.updateStatus('camera', false);
        console.log('Camera stopped');
    }

    pause() {
        if (this.video && !this.isDemoMode) {
            this.video.pause();
        }
    }

    resume() {
        if (this.video && this.isActive && !this.isDemoMode) {
            this.video.play().catch(err => {
                console.warn('Resume failed:', err);
            });
        }
    }
}

const cameraManager = new CameraManager();