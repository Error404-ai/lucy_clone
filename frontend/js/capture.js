// Capture module for premium AI-enhanced photos

class CaptureManager {
    constructor() {
        this.captureBtn = document.getElementById('capture-btn');
        this.modal = document.getElementById('capture-modal');
        this.modalClose = document.getElementById('modal-close');
        this.loadingEl = document.getElementById('capture-loading');
        this.resultEl = document.getElementById('capture-result');
        this.resultImage = document.getElementById('result-image');
        this.downloadBtn = document.getElementById('download-btn');
        this.shareBtn = document.getElementById('share-btn');
        this.retakeBtn = document.getElementById('retake-btn');
        this.isCapturing = false;
    }

    /**
     * Initialize capture manager
     */
    init() {
        console.log('Initializing capture manager...');
        this.setupEventListeners();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Capture button
        this.captureBtn.addEventListener('click', () => {
            this.capture();
        });

        // Modal close
        this.modalClose.addEventListener('click', () => {
            this.closeModal();
        });

        // Download button
        this.downloadBtn.addEventListener('click', () => {
            this.download();
        });

        // Share button
        this.shareBtn.addEventListener('click', () => {
            this.share();
        });

        // Retake button
        this.retakeBtn.addEventListener('click', () => {
            this.closeModal();
        });

        // Close modal on background click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal();
            }
        });
    }

    /**
     * Capture premium photo
     */
    async capture() {
        if (this.isCapturing) return;

        try {
            this.isCapturing = true;
            console.log('Capturing premium photo...');

            // Open modal with loading state
            this.openModal();
            this.loadingEl.style.display = 'block';
            this.resultEl.style.display = 'none';

            // Capture camera frame
            const cameraFrame = await cameraManager.captureFrameBase64('image/jpeg', 0.95);
            
            // Capture 3D jacket render
            const jacketRender = compositeRenderer.captureFrame();
            
            // Get pose data
            const pose = poseTracker.isPoseDetected() ? {
                landmarks: poseTracker.landmarks,
                shoulderWidth: poseTracker.getShoulderWidth(),
                rotation: poseTracker.getBodyRotation()
            } : null;
            
            // Get current fabric
            const fabric = fabricSelector.getSelectedFabric();

            if (!fabric) {
                throw new Error('Please select a fabric first');
            }

            // Prepare payload
            const payload = {
                user_image: cameraFrame,
                jacket_render: jacketRender,
                pose: pose,
                fabric_id: fabric.id
            };

            // Send to backend for AI enhancement
            const response = await fetch(
                `${CONFIG.API.BASE_URL}${CONFIG.API.ENDPOINTS.VIRTUAL_TRYON}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Capture failed');
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'AI processing failed');
            }

            // Display result
            this.resultImage.src = data.result_image;
            this.loadingEl.style.display = 'none';
            this.resultEl.style.display = 'block';

            console.log('Premium capture complete!');

        } catch (error) {
            console.error('Capture error:', error);
            Utils.showError(error.message || 'Could not capture photo');
            this.closeModal();
        } finally {
            this.isCapturing = false;
        }
    }

    /**
     * Open capture modal
     */
    openModal() {
        this.modal.classList.add('active');
    }

    /**
     * Close capture modal
     */
    closeModal() {
        this.modal.classList.remove('active');
        this.loadingEl.style.display = 'none';
        this.resultEl.style.display = 'none';
        this.resultImage.src = '';
    }

    /**
     * Download captured image
     */
    download() {
        if (!this.resultImage.src) return;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `lucy-tryon-${timestamp}.png`;
        
        Utils.downloadImage(this.resultImage.src, filename);
        console.log('Image downloaded:', filename);
    }

    /**
     * Share captured image
     */
    async share() {
        if (!this.resultImage.src) return;

        try {
            await Utils.shareImage(this.resultImage.src, 'Lucy Virtual Try-On');
        } catch (error) {
            console.error('Share error:', error);
        }
    }

    /**
     * Get last captured image
     */
    getLastCapture() {
        return this.resultImage.src || null;
    }
}

// Create global instance
const captureManager = new CaptureManager();