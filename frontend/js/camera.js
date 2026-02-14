// Camera Manager - FIXED with better permission handling

class CameraManager {
    constructor() {
        this.video = document.getElementById('camera-video');
        this.stream = null;
        this.isActive = false;
        this.devices = [];
        this.currentDeviceId = null;
    }

    async init() {
        try {
            console.log('🎥 Initializing camera...');
            
            // Check if mediaDevices is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera API not supported in this browser');
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
            
            // Better error messages
            if (error.name === 'NotAllowedError') {
                throw new Error('Camera access denied. Please allow camera permissions and refresh the page.');
            } else if (error.name === 'NotFoundError') {
                throw new Error('No camera found. Please connect a camera or use a device with a camera.');
            } else if (error.name === 'NotReadableError') {
                throw new Error('Camera is being used by another application. Please close other apps and refresh.');
            } else if (error.name === 'OverconstrainedError') {
                // Try again with minimal constraints
                console.log('⚠️ Trying with minimal constraints...');
                return await this.initWithMinimalConstraints();
            } else {
                throw new Error(`Camera error: ${error.message}`);
            }
        }
    }

    async initWithMinimalConstraints() {
        try {
            // Fallback: minimal constraints
            const constraints = {
                video: true,
                audio: false
            };

            console.log('📸 Requesting camera with minimal constraints...');
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    resolve();
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
            throw new Error(`Camera fallback failed: ${error.message}`);
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
        if (!deviceId || deviceId === this.currentDeviceId) return;
        
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
            this.currentDeviceId = deviceId;
            
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    resolve();
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
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);
        
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    getFrameCanvas() {
        if (!this.isActive) return null;

        const canvas = document.createElement('canvas');
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        
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
            width: this.video.videoWidth,
            height: this.video.videoHeight
        };
    }

    isReady() {
        return this.isActive && this.video.readyState === this.video.HAVE_ENOUGH_DATA;
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.isActive = false;
        Utils.updateStatus('camera', false);
        console.log('Camera stopped');
    }

    pause() {
        if (this.video) {
            this.video.pause();
        }
    }

    resume() {
        if (this.video && this.isActive) {
            this.video.play();
        }
    }
}

const cameraManager = new CameraManager();