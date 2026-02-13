// Three.js scene setup for Lucy Virtual Try-On

class SceneManager {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.canvas = null;
        this.lights = {
            ambient: null,
            directional: null,
            hemisphere: null
        };
        this.isInitialized = false;
    }

    /**
     * Initialize Three.js scene
     */
    init() {
        try {
            console.log('Initializing Three.js scene...');
            
            // Get canvas
            this.canvas = document.getElementById('main-canvas');
            
            // Create scene
            this.scene = new THREE.Scene();
            // ✅ FIX: Remove black background for transparency
            this.scene.background = null;

            // Create camera
            const viewWidth = this.canvas.clientWidth || window.innerWidth;
            const viewHeight = this.canvas.clientHeight || window.innerHeight;
            const aspect = viewWidth / viewHeight;
            this.camera = new THREE.PerspectiveCamera(
                CONFIG.SCENE.CAMERA_FOV,
                aspect,
                CONFIG.SCENE.CAMERA_NEAR,
                CONFIG.SCENE.CAMERA_FAR
            );
            this.camera.position.set(0, 0, 5);
            this.camera.lookAt(0, 0, 0);

            // Create renderer
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: true,
                alpha: true, // ✅ Enable transparency
                preserveDrawingBuffer: true // Required for screenshots
            });
            
            this.renderer.setSize(viewWidth, viewHeight);
            this.renderer.setPixelRatio(window.devicePixelRatio * CONFIG.PERFORMANCE.RENDER_SCALE);
            
            // ✅ FIX: Disable tone mapping to prevent color washing
            this.renderer.toneMapping = THREE.NoToneMapping;
            this.renderer.toneMappingExposure = 1.0;
            
            // ✅ Keep color encoding
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            
            // ✅ Disable physically correct lights (too bright for video overlay)
            this.renderer.physicallyCorrectLights = false;
            
            // ✅ Enable proper alpha blending
            this.renderer.setClearColor(0x000000, 0); // Transparent black

            // Setup lighting
            this.setupLights();

            // Handle window resize
            window.addEventListener('resize', () => this.onWindowResize());

            // Optional: Add orbit controls for debugging
            if (CONFIG.DEBUG.ENABLE_ORBIT_CONTROLS) {
                this.controls = new THREE.OrbitControls(this.camera, this.canvas);
                this.controls.enableDamping = true;
            }

            this.isInitialized = true;
            console.log('Scene initialized successfully');

        } catch (error) {
            console.error('Scene initialization failed:', error);
            throw new Error(`Scene initialization failed: ${error.message}`);
        }
    }

    /**
     * Setup scene lighting - REDUCED to prevent washing out video
     */
    setupLights() {
        // ✅ Reduced ambient light (was 0.8, now 0.3)
        this.lights.ambient = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(this.lights.ambient);

        // ✅ Reduced directional light (was 0.6, now 0.4)
        this.lights.directional = new THREE.DirectionalLight(0xffffff, 0.4);
        this.lights.directional.position.set(2, 3, 2);
        this.lights.directional.castShadow = false; // Disable for performance
        this.scene.add(this.lights.directional);

        // ✅ Reduced hemisphere light (was 0.4, now 0.2)
        this.lights.hemisphere = new THREE.HemisphereLight(0xffffff, 0x444444, 0.2);
        this.lights.hemisphere.position.set(0, 20, 0);
        this.scene.add(this.lights.hemisphere);

        console.log('Lighting setup complete (optimized for video overlay)');
    }

    /**
     * Add object to scene
     */
    add(object) {
        this.scene.add(object);
    }

    /**
     * Remove object from scene
     */
    remove(object) {
        this.scene.remove(object);
    }

    /**
     * Update camera aspect ratio
     */
    updateCamera(videoWidth, videoHeight) {
        if (!this.camera) return;
        
        const aspect = videoWidth / videoHeight;
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        
        console.log(`Camera updated: ${videoWidth}x${videoHeight}, aspect: ${aspect}`);
    }

    /**
     * Handle window resize
     */
    onWindowResize() {
        if (!this.camera || !this.renderer) return;

        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        
        console.log(`Window resized: ${width}x${height}`);
    }

    /**
     * Render scene
     */
    render() {
        if (!this.isInitialized) return;
        
        // Update orbit controls if enabled
        if (this.controls) {
            this.controls.update();
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Get renderer
     */
    getRenderer() {
        return this.renderer;
    }

    /**
     * Get scene
     */
    getScene() {
        return this.scene;
    }

    /**
     * Get camera
     */
    getCamera() {
        return this.camera;
    }

    /**
     * Update lighting intensity dynamically
     */
    updateLighting(intensity = 1.0) {
        if (this.lights.ambient) {
            this.lights.ambient.intensity = 0.3 * intensity;
        }
        if (this.lights.directional) {
            this.lights.directional.intensity = 0.4 * intensity;
        }
        if (this.lights.hemisphere) {
            this.lights.hemisphere.intensity = 0.2 * intensity;
        }
    }

    /**
     * Capture scene as image
     */
    capture() {
        if (!this.renderer) return null;
        
        this.render();
        return this.canvas.toDataURL('image/png');
    }

    /**
     * Clear scene
     */
    clear() {
        while (this.scene.children.length > 0) {
            const object = this.scene.children[0];
            this.scene.remove(object);
            
            // Dispose of geometries and materials
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        }
    }

    /**
     * Dispose of resources
     */
    dispose() {
        this.clear();
        
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        if (this.controls) {
            this.controls.dispose();
        }
        
        this.isInitialized = false;
        console.log('Scene disposed');
    }
}

// Create global instance
const sceneManager = new SceneManager();