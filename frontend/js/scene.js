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
            this.scene.background = null; // Transparent for overlay

            // ✅ FIXED: Create camera with better positioning
            const viewWidth = this.canvas.clientWidth || window.innerWidth;
            const viewHeight = this.canvas.clientHeight || window.innerHeight;
            const aspect = viewWidth / viewHeight;
            
            this.camera = new THREE.PerspectiveCamera(
                CONFIG.SCENE.CAMERA_FOV, // Wider FOV for full body
                aspect,
                CONFIG.SCENE.CAMERA_NEAR,
                CONFIG.SCENE.CAMERA_FAR
            );
            
            // ✅ FIXED: Position camera further back for full body view
            this.camera.position.set(0, 0, CONFIG.SCENE.CAMERA_DISTANCE);
            this.camera.lookAt(0, 0, 0);

            // Create renderer
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: true,
                alpha: true,
                preserveDrawingBuffer: true
            });
            
            this.renderer.setSize(viewWidth, viewHeight);
            this.renderer.setPixelRatio(window.devicePixelRatio * CONFIG.PERFORMANCE.RENDER_SCALE);
            
            // Rendering settings
            this.renderer.toneMapping = THREE.NoToneMapping;
            this.renderer.toneMappingExposure = 1.0;
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.physicallyCorrectLights = false;
            this.renderer.setClearColor(0x000000, 0); // Transparent

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
            console.log('✅ Scene initialized successfully');

        } catch (error) {
            console.error('Scene initialization failed:', error);
            throw new Error(`Scene initialization failed: ${error.message}`);
        }
    }

    /**
     * Setup scene lighting
     */
    setupLights() {
        // Ambient light
        this.lights.ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(this.lights.ambient);

        // Directional light
        this.lights.directional = new THREE.DirectionalLight(0xffffff, 0.5);
        this.lights.directional.position.set(2, 3, 2);
        this.lights.directional.castShadow = false;
        this.scene.add(this.lights.directional);

        // Hemisphere light
        this.lights.hemisphere = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
        this.lights.hemisphere.position.set(0, 20, 0);
        this.scene.add(this.lights.hemisphere);

        console.log('✓ Lighting setup complete');
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
        
        console.log(`✓ Camera updated: ${videoWidth}x${videoHeight}, aspect: ${aspect.toFixed(2)}`);
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
            this.lights.ambient.intensity = 0.4 * intensity;
        }
        if (this.lights.directional) {
            this.lights.directional.intensity = 0.5 * intensity;
        }
        if (this.lights.hemisphere) {
            this.lights.hemisphere.intensity = 0.3 * intensity;
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