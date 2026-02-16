// Materials Manager - FIXED with proper depth testing

class MaterialsManager {
    constructor() {
        this.materials = new Map();
        this.textures = new Map();
        this.currentFabric = null;
        this.isInitialized = false;
    }

    init() {
        console.log('🎨 Initializing Materials Manager...');
        
        // Create default material
        this.createDefaultMaterial();
        
        this.isInitialized = true;
        console.log('✅ Materials Manager ready');
    }

    createDefaultMaterial() {
        const material = new THREE.MeshStandardMaterial({
            color: 0x2563EB,  // Blue denim color
            metalness: 0.1,
            roughness: 0.8,
            
            // ✅ CRITICAL: Proper depth settings
            depthTest: true,
            depthWrite: true,
            transparent: false,
            opacity: 1.0,
            side: THREE.DoubleSide,
            
            // Rendering
            flatShading: false,
            wireframe: false,
            fog: false
        });
        
        this.materials.set('default', material);
        console.log('✅ Default material created (Blue Denim)');
        
        return material;
    }

    applyFabricToModel(model, fabricData) {
        if (!model) {
            console.warn('⚠️ No model provided');
            return;
        }

        console.log('🎨 Applying fabric:', fabricData?.name || 'default');

        model.traverse((child) => {
            if (!child.isMesh) return;
            
            // Skip helper meshes
            if (child.name.toLowerCase().includes('cube') || 
                child.name.toLowerCase().includes('helper')) {
                child.visible = false;
                return;
            }

            // Apply material
            const material = this.getMaterialForFabric(fabricData);
            child.material = material;
            
            // ✅ CRITICAL: Force proper rendering settings
            child.material.depthTest = true;
            child.material.depthWrite = true;
            child.material.transparent = false;
            child.material.opacity = 1.0;
            child.material.needsUpdate = true;
            
            // Rendering order
            child.renderOrder = 10;  // Render after video (-1000) but before UI (100+)
            child.frustumCulled = false;
            
            console.log(`   Applied to: ${child.name}`);
        });

        this.currentFabric = fabricData;
        console.log('✅ Fabric applied successfully');
    }
    applyFabric(fabricData) {
    const jacket = skeletonMapper.model;
    if (!jacket) {
        console.warn('⚠️ No jacket model to apply fabric to');
        return;
    }
    
    this.applyFabricToModel(jacket, fabricData);
}

    getMaterialForFabric(fabricData) {
        if (!fabricData) {
            return this.materials.get('default');
        }

        // Check if material already exists
        if (this.materials.has(fabricData.id)) {
            return this.materials.get(fabricData.id);
        }

        // Create new material
        const material = new THREE.MeshStandardMaterial({
            color: fabricData.color || 0x2563EB,
            metalness: fabricData.metalness || 0.1,
            roughness: fabricData.roughness || 0.8,
            
            // ✅ CRITICAL: Proper depth settings
            depthTest: true,
            depthWrite: true,
            transparent: false,
            opacity: 1.0,
            side: THREE.DoubleSide
        });

        // Load texture if available
        if (fabricData.textureUrl) {
            const texture = new THREE.TextureLoader().load(
                fabricData.textureUrl,
                (tex) => {
                    tex.wrapS = THREE.RepeatWrapping;
                    tex.wrapT = THREE.RepeatWrapping;
                    tex.repeat.set(2, 2);
                    tex.colorSpace = THREE.SRGBColorSpace;
                    material.map = tex;
                    material.needsUpdate = true;
                    console.log('✅ Texture loaded:', fabricData.name);
                },
                undefined,
                (err) => {
                    console.warn('⚠️ Texture load failed:', err);
                }
            );
            
            this.textures.set(fabricData.id, texture);
        }

        this.materials.set(fabricData.id, material);
        return material;
    }

    updateMaterialColor(color) {
        if (!this.currentFabric) return;

        const material = this.materials.get(this.currentFabric.id);
        if (material) {
            material.color.setHex(color);
            material.needsUpdate = true;
        }
    }

    getCurrentFabric() {
        return this.currentFabric;
    }

    dispose() {
        // Dispose all materials
        this.materials.forEach(material => {
            material.dispose();
        });
        this.materials.clear();

        // Dispose all textures
        this.textures.forEach(texture => {
            texture.dispose();
        });
        this.textures.clear();

        console.log('🗑️ Materials disposed');
    }
}

const materialsManager = new MaterialsManager();