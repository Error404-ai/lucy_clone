// capture.js — LOCAL SCREENSHOT ONLY (no backend needed)

class CaptureManager {
    constructor() {
        this.captureBtn   = document.getElementById('capture-btn');
        this.modal        = document.getElementById('capture-modal');
        this.modalClose   = document.getElementById('modal-close');
        this.loadingEl    = document.getElementById('capture-loading');
        this.resultEl     = document.getElementById('capture-result');
        this.resultImage  = document.getElementById('result-image');
        this.downloadBtn  = document.getElementById('download-btn');
        this.shareBtn     = document.getElementById('share-btn');
        this.retakeBtn    = document.getElementById('retake-btn');
        this.isCapturing  = false;
        this.lastCapture  = null;
    }

    init() {
        this.setupEventListeners();
        console.log('✓ Capture manager ready');
    }

    setupEventListeners() {
        this.captureBtn?.addEventListener('click', () => this.capture());
        this.modalClose?.addEventListener('click', () => this.closeModal());
        this.downloadBtn?.addEventListener('click', () => this.download());
        this.shareBtn?.addEventListener('click',   () => this.share());
        this.retakeBtn?.addEventListener('click',  () => this.closeModal());
        this.modal?.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
        });
    }

    async capture() {
        if (this.isCapturing) return;
        this.isCapturing = true;

        try {
            this.openModal();
            this.loadingEl.style.display  = 'block';
            this.resultEl.style.display   = 'none';

            // Force one clean render frame
            sceneManager.render();

            // Grab the canvas as a PNG
            const dataURL = compositeRenderer.captureFrame();

            if (!dataURL) throw new Error('Could not capture frame');

            this.lastCapture = dataURL;
            this.resultImage.src = dataURL;
            this.loadingEl.style.display = 'none';
            this.resultEl.style.display  = 'block';

            console.log('📸 Captured!');

        } catch (err) {
            console.error('Capture error:', err);
            Utils.showError(err.message || 'Could not capture photo');
            this.closeModal();
        } finally {
            this.isCapturing = false;
        }
    }

    openModal()  { this.modal?.classList.add('active'); }
    closeModal() {
        this.modal?.classList.remove('active');
        if (this.loadingEl) this.loadingEl.style.display = 'none';
        if (this.resultEl)  this.resultEl.style.display  = 'none';
        if (this.resultImage) this.resultImage.src = '';
    }

    download() {
        if (!this.lastCapture) return;
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        Utils.downloadImage(this.lastCapture, `lucy-tryon-${ts}.png`);
    }

    async share() {
        if (!this.lastCapture) return;
        try {
            await Utils.shareImage(this.lastCapture, 'Lucy Virtual Try-On');
        } catch (err) {
            console.error('Share error:', err);
        }
    }

    getLastCapture() { return this.lastCapture; }
}

const captureManager = new CaptureManager();