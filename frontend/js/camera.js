// Camera capture module for Lucy Virtual Try-On

class CameraManager {
    constructor() {
        this.video = document.getElementById('camera-video');
        this.stream = null;
        this.isActive = false;
        this.devices = [];
        this.currentDeviceId = null;
    }

    /**
     * Initialize and start camera
     */
    async init() {
        try {
            console.log('Initializing camera...');
            
            // Get available devices
            await this.getDevices();
            
            // Request camera access
            const constraints = {
                video: {
                    width: { ideal: CONFIG.CAMERA.WIDTH },
                    height: { ideal: CONFIG.CAMERA.HEIGHT },
                    frameRate: { ideal: CONFIG.CAMERA.FRAME_RATE },
                    facingMode: CONFIG.CAMERA.FACING_MODE
                },
                audio: false
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            
            // Wait for video to be ready
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    resolve();
                };
            });

            this.isActive = true;
            Utils.updateStatus('camera', true);
            console.log('Camera initialized successfully');
            
            return {
                width: this.video.videoWidth,
                height: this.video.videoHeight
            };
            
        } catch (error) {
            console.error('Camera initialization failed:', error);
            Utils.updateStatus('camera', false);
            
            if (error.name === 'NotAllowedError') {
                throw new Error('Camera access denied. Please allow camera permissions.');
            } else if (error.name === 'NotFoundError') {
                throw new Error('No camera found on this device.');
            } else {
                throw new Error(`Camera error: ${error.message}`);
            }
        }
    }

    /**
     * Get list of available camera devices
     */
    async getDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.devices = devices.filter(device => device.kind === 'videoinput');
            console.log(`Found ${this.devices.length} camera(s)`);
            return this.devices;
        } catch (error) {
            console.error('Error getting devices:', error);
            return [];
        }
    }

    /**
     * Switch to different camera
     */
    async switchCamera(deviceId) {
        if (!deviceId || deviceId === this.currentDeviceId) return;
        
        try {
            // Stop current stream
            this.stop();
            
            // Start new stream with specified device
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
            this.currentDeviceId = deviceId;
            
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    resolve();
                };
            });

            this.isActive = true;
            Utils.updateStatus('camera', true);
            console.log('Switched to camera:', deviceId);
            
        } catch (error) {
            console.error('Error switching camera:', error);
            Utils.showError('Could not switch camera');
        }
    }

    /**
     * Get current video frame as ImageData
     */
    getFrame() {
        if (!this.isActive) return null;

        const canvas = document.createElement('canvas');
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);
        
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    /**
     * Get current video frame as canvas
     */
    getFrameCanvas() {
        if (!this.isActive) return null;

        const canvas = document.createElement('canvas');
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);
        
        return canvas;
    }

    /**
     * Capture current frame as blob
     */
    async captureFrame(format = 'image/jpeg', quality = 0.95) {
        if (!this.isActive) return null;

        const canvas = this.getFrameCanvas();
        return await Utils.canvasToBlob(canvas, format, quality);
    }

    /**
     * Capture current frame as base64
     */
    async captureFrameBase64(format = 'image/jpeg', quality = 0.95) {
        const blob = await this.captureFrame(format, quality);
        if (!blob) return null;
        return await Utils.blobToBase64(blob);
    }

    /**
     * Get video dimensions
     */
    getDimensions() {
        return {
            width: this.video.videoWidth,
            height: this.video.videoHeight
        };
    }

    /**
     * Check if camera is active
     */
    isReady() {
        return this.isActive && this.video.readyState === this.video.HAVE_ENOUGH_DATA;
    }

    /**
     * Stop camera
     */
    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.isActive = false;
        Utils.updateStatus('camera', false);
        console.log('Camera stopped');
    }

    /**
     * Pause camera
     */
    pause() {
        if (this.video) {
            this.video.pause();
        }
    }

    /**
     * Resume camera
     */
    resume() {
        if (this.video && this.isActive) {
            this.video.play();
        }
    }
}

// Create global instance
const cameraManager = new CameraManager();