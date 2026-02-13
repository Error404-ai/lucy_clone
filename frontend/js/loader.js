// 3D Model loader for Lucy Virtual Try-On
// FIXED: Hide skeleton helpers, only show actual mesh

class ModelLoader {
    constructor() {
        this.loader = new THREE.GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();
        this.jacketModel = null;
        this.jacketMesh = null;
        this.jacketSkeleton = null;
        this.isLoaded = false;
        
        // Setup Meshopt decoder
        this.setupMeshoptDecoder();
    }

    /**
     * Setup Meshopt decoder
     */
    setupMeshoptDecoder() {
        if (typeof MeshoptDecoder !== 'undefined') {
            this.loader.setMeshoptDecoder(MeshoptDecoder);
            console.log('Meshopt decoder initialized');
        }
    }

    /**
     * Load jacket GLB model with optimization
     */
    async loadJacket(modelPath = CONFIG.JACKET.MODEL_PATH) {
        return new Promise((resolve, reject) => {
            console.log('Loading jacket model:', modelPath);
            Utils.updateLoadingText('Loading 3D jacket model...');

            this.loader.load(
                modelPath,
                (gltf) => {
                    try {
                        this.jacketModel = gltf.scene;
                        
                        // ✅ CRITICAL FIX: Hide all bones first
                        this.hideAllBones(this.jacketModel);
                        
                        // Find the main mesh
                        this.jacketMesh = this.findMesh(this.jacketModel);
                        
                        if (!this.jacketMesh) {
                            throw new Error('No mesh found in jacket model');
                        }

                        console.log('Found jacket mesh:', this.jacketMesh.name, this.jacketMesh.type);

                        // ✅ CRITICAL: Force mesh to be visible and solid
                        this.jacketMesh.visible = true;
                        this.jacketMesh.frustumCulled = false; // Always render
                        
                        if (this.jacketMesh.material) {
                            if (Array.isArray(this.jacketMesh.material)) {
                                this.jacketMesh.material.forEach(mat => {
                                    mat.wireframe = false;
                                    mat.visible = true;
                                    mat.side = THREE.DoubleSide;
                                });
                            } else {
                                this.jacketMesh.material.wireframe = false;
                                this.jacketMesh.material.visible = true;
                                this.jacketMesh.material.side = THREE.DoubleSide;
                            }
                        }

                        // Optimize geometry
                        this.optimizeGeometry(this.jacketMesh);

                        // Find skeleton
                        this.jacketSkeleton = this.findSkeleton(this.jacketModel);
                        
                        if (this.jacketSkeleton) {
                            console.log('Skeleton found with', this.jacketSkeleton.bones.length, 'bones (HIDDEN)');
                        }

                        // Apply initial transforms
                        this.jacketModel.scale.set(
                            CONFIG.JACKET.SCALE,
                            CONFIG.JACKET.SCALE,
                            CONFIG.JACKET.SCALE
                        );
                        
                        this.jacketModel.position.set(
                            CONFIG.JACKET.POSITION.x,
                            CONFIG.JACKET.POSITION.y,
                            CONFIG.JACKET.POSITION.z
                        );
                        
                        this.jacketModel.rotation.set(
                            CONFIG.JACKET.ROTATION.x,
                            CONFIG.JACKET.ROTATION.y,
                            CONFIG.JACKET.ROTATION.z
                        );

                        // Initially hide entire model
                        this.jacketModel.visible = false;

                        // Add to scene
                        sceneManager.add(this.jacketModel);
                        
                        this.isLoaded = true;
                        console.log('✅ Jacket loaded - Mesh visible, Bones hidden');
                        
                        resolve(this.jacketModel);

                    } catch (error) {
                        reject(error);
                    }
                },
                (progress) => {
                    const percent = (progress.loaded / progress.total * 100).toFixed(0);
                    Utils.updateLoadingText(`Loading jacket... ${percent}%`);
                },
                (error) => {
                    console.error('Error loading jacket:', error);
                    reject(new Error(`Failed to load jacket: ${error.message}`));
                }
            );
        });
    }

    /**
     * ✅ CRITICAL FIX: Hide ALL bones completely
     */
    hideAllBones(object) {
        object.traverse((child) => {
            // Hide ANYTHING that is a bone
            if (child.type === 'Bone') {
                child.visible = false;
                
                // Also remove from rendering
                if (child.material) {
                    child.material.visible = false;
                }
                
                console.log('🚫 Hidden bone:', child.name);
            }
            
            // Force meshes to be visible
            if (child.isMesh || child.isSkinnedMesh) {
                child.visible = true;
                console.log('✅ Showing mesh:', child.name);
            }
        });
    }

    /**
     * ✅ Optimize geometry for better performance
     */
    optimizeGeometry(mesh) {
        if (!mesh.geometry) return;

        const geometry = mesh.geometry;
        
        // Compute bounding sphere for frustum culling
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();

        // ✅ Simplify material
        if (mesh.material) {
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(mat => this.optimizeMaterial(mat));
            } else {
                this.optimizeMaterial(mesh.material);
            }
        }

        console.log(`Geometry optimized: ${geometry.attributes.position.count} vertices`);
    }

    /**
     * ✅ Optimize material settings
     */
    optimizeMaterial(material) {
        material.flatShading = false;
        material.wireframe = false; // ✅ NEVER wireframe
        material.precision = 'mediump';
        material.shadowSide = THREE.FrontSide;
    }

    /**
     * Find the main mesh (prioritize SkinnedMesh)
     */
    findMesh(object) {
        let skinnedMesh = null;
        let regularMesh = null;
        
        object.traverse((child) => {
            if (child.isSkinnedMesh && !skinnedMesh) {
                skinnedMesh = child;
            } else if (child.isMesh && !child.isSkinnedMesh && !regularMesh) {
                regularMesh = child;
            }
        });
        
        return skinnedMesh || regularMesh;
    }

    /**
     * Find skeleton
     */
    findSkeleton(object) {
        let skeleton = null;
        
        object.traverse((child) => {
            if (child.isSkinnedMesh && child.skeleton) {
                skeleton = child.skeleton;
            }
        });
        
        return skeleton;
    }

    /**
     * Get all bones
     */
    getBones() {
        if (!this.jacketSkeleton) return [];
        return this.jacketSkeleton.bones;
    }

    /**
     * Find bone by name
     */
    findBone(name) {
        if (!this.jacketSkeleton) return null;
        
        return this.jacketSkeleton.bones.find(bone => 
            bone.name.toLowerCase().includes(name.toLowerCase())
        );
    }

    /**
     * Show/hide jacket
     */
    setVisible(visible) {
        if (this.jacketModel) {
            this.jacketModel.visible = visible;
            
            // ✅ CRITICAL: Ensure mesh stays visible when showing
            if (visible && this.jacketMesh) {
                this.jacketMesh.visible = true;
                
                // Double-check bones are still hidden
                this.jacketModel.traverse((child) => {
                    if (child.type === 'Bone') {
                        child.visible = false;
                    }
                });
            }
        }
    }

    /**
     * Update jacket position
     */
    setPosition(x, y, z) {
        if (this.jacketModel) {
            this.jacketModel.position.set(x, y, z);
        }
    }

    /**
     * Update jacket rotation
     */
    setRotation(x, y, z) {
        if (this.jacketModel) {
            this.jacketModel.rotation.set(x, y, z);
        }
    }

    /**
     * Update jacket scale
     */
    setScale(scale) {
        if (this.jacketModel) {
            this.jacketModel.scale.set(scale, scale, scale);
        }
    }

    /**
     * Get jacket mesh
     */
    getMesh() {
        return this.jacketMesh;
    }

    /**
     * Get jacket model
     */
    getModel() {
        return this.jacketModel;
    }

    /**
     * Get skeleton
     */
    getSkeleton() {
        return this.jacketSkeleton;
    }

    /**
     * Check if loaded
     */
    isModelLoaded() {
        return this.isLoaded;
    }

    /**
     * Load texture
     */
    async loadTexture(url) {
        return new Promise((resolve, reject) => {
            this.textureLoader.load(
                url,
                (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.flipY = false;
                    resolve(texture);
                },
                undefined,
                reject
            );
        });
    }

    /**
     * Dispose resources
     */
    dispose() {
        if (this.jacketModel) {
            this.jacketModel.traverse((child) => {
                if (child.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(material => {
                            this.disposeMaterial(material);
                        });
                    } else {
                        this.disposeMaterial(child.material);
                    }
                }
            });
            
            sceneManager.remove(this.jacketModel);
            this.jacketModel = null;
        }
        
        this.jacketMesh = null;
        this.jacketSkeleton = null;
        this.isLoaded = false;
        console.log('Model disposed');
    }

    /**
     * Dispose material
     */
    disposeMaterial(material) {
        if (material.map) material.map.dispose();
        if (material.normalMap) material.normalMap.dispose();
        if (material.roughnessMap) material.roughnessMap.dispose();
        if (material.metalnessMap) material.metalnessMap.dispose();
        if (material.aoMap) material.aoMap.dispose();
        material.dispose();
    }
}

// Create global instance
const modelLoader = new ModelLoader();