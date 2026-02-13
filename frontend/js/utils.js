// Utility functions for Lucy Virtual Try-On

const Utils = {
    /**
     * Show error toast message
     */
    showError(message) {
        const toast = document.getElementById('error-toast');
        const messageEl = document.getElementById('error-message');
        messageEl.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, CONFIG.UI.TOAST_DURATION);
    },

    /**
     * Update status indicator
     */
    updateStatus(type, active) {
        const statusEl = document.getElementById(`${type}-status`);
        if (statusEl) {
            if (active) {
                statusEl.classList.add('active');
            } else {
                statusEl.classList.remove('active');
            }
        }
    },

    /**
     * Update FPS counter
     */
    updateFPS(fps) {
        const fpsEl = document.getElementById('fps-counter');
        if (fpsEl) {
            fpsEl.textContent = `${Math.round(fps)} FPS`;
        }
    },

    /**
     * Update loading text
     */
    updateLoadingText(text) {
        const loadingText = document.getElementById('loading-text');
        if (loadingText) {
            loadingText.textContent = text;
        }
    },

    /**
     * Hide loading screen
     */
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        const appContainer = document.getElementById('app-container');
        
        if (loadingScreen && appContainer) {
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.style.display = 'none';
                appContainer.style.display = 'block';
            }, 500);
        }
    },

    /**
     * Convert canvas to blob
     */
    async canvasToBlob(canvas, mimeType = 'image/jpeg', quality = 0.95) {
        return new Promise((resolve) => {
            canvas.toBlob(resolve, mimeType, quality);
        });
    },

    /**
     * Convert blob to base64
     */
    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },

    /**
     * Download image
     */
    downloadImage(dataUrl, filename = 'lucy-tryon.png') {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    /**
     * Share image using Web Share API
     */
    async shareImage(dataUrl, title = 'Lucy Virtual Try-On') {
        try {
            // Convert data URL to blob
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            const file = new File([blob], 'lucy-tryon.png', { type: 'image/png' });

            if (navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: title,
                    text: 'Check out my virtual try-on!',
                    files: [file]
                });
                return true;
            } else {
                // Fallback: copy to clipboard
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
                Utils.showError('Image copied to clipboard!');
                return false;
            }
        } catch (error) {
            console.error('Error sharing:', error);
            Utils.showError('Could not share image');
            return false;
        }
    },

    /**
     * Clamp value between min and max
     */
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },

    /**
     * Linear interpolation
     */
    lerp(start, end, t) {
        return start + (end - start) * t;
    },

    /**
     * Exponential moving average for smoothing
     */
    ema(current, previous, alpha) {
        return alpha * current + (1 - alpha) * previous;
    },

    /**
     * Calculate distance between two 2D points
     */
    distance2D(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    },

    /**
     * Calculate distance between two 3D points
     */
    distance3D(x1, y1, z1, x2, y2, z2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
    },

    /**
     * Normalize value between 0 and 1
     */
    normalize(value, min, max) {
        return (value - min) / (max - min);
    },

    /**
     * Check if device is mobile
     */
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    /**
     * Check if browser supports required features
     */
    checkBrowserSupport() {
        const required = {
            webgl: !!document.createElement('canvas').getContext('webgl2') || 
                   !!document.createElement('canvas').getContext('webgl'),
            mediaDevices: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            webassembly: typeof WebAssembly !== 'undefined'
        };

        const missing = Object.keys(required).filter(key => !required[key]);
        
        if (missing.length > 0) {
            throw new Error(`Browser missing required features: ${missing.join(', ')}`);
        }

        return true;
    },

    /**
     * Request fullscreen
     */
    requestFullscreen() {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
        }
    },

    /**
     * Exit fullscreen
     */
    exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    },

    /**
     * Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    },

    /**
     * Generate unique ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    /**
     * Deep clone object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Wait for specified time
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Retry function with exponential backoff
     */
    async retry(fn, maxAttempts = 3, delay = 1000) {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                return await fn();
            } catch (error) {
                if (i === maxAttempts - 1) throw error;
                await this.wait(delay * Math.pow(2, i));
            }
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}