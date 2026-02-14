// 3D Model loader for Lucy Virtual Try-On
// FIXED: Proper jacket detection, no body hiding needed

class ModelLoader {
    constructor() {
        this.loader = new THREE.GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();
        this.jacketModel = null;
        this.jacketMeshes = []; // Support multiple jacket meshes
        this.jacketSkeleton = null;
        this.isLoaded = false;
        
        // Setup Meshopt decoder
        this.setupMeshoptDecoder();
    }

    setupMeshoptDecoder() {
        if (typeof MeshoptDecoder !== 'undefined') {
            this.loader.setMeshoptDecoder(MeshoptDecoder);
            console.log('Meshopt decoder initialized');
        }
    }

    async loadJacket(modelPath = CONFIG.JACKET.MODEL_PATH) {
        return new Promise((resolve, reject) => {
            console.log('Loading jacket model:', modelPath);
            Utils.updateLoadingText('Loading 3D jacket model...');

            this.loader.load(
                modelPath,
                (gltf) => {
                    try {
                        this.jacketModel = gltf.scene;
                        
                        // Analyze model
                        console.log('=== ANALYZING MODEL ===');
                        this.analyzeModel(this.jacketModel);
                        
                        // Find ALL meshes as jacket meshes (no body hiding needed)
                        this.findJacketMeshes(this.jacketModel);
                        
                        if (this.jacketMeshes.length === 0) {
                            throw new Error('No jacket meshes found');
                        }

                        console.log(`✅ Found ${this.jacketMeshes.length} jacket mesh(es)`);

                        // Optimize geometry
                        this.optimizeAllMeshes();

                        // Find skeleton
                        this.jacketSkeleton = this.findSkeleton(this.jacketModel);
                        if (this.jacketSkeleton) {
                            console.log(`✓ Skeleton: ${this.jacketSkeleton.bones.length} bones`);
                        }

                        // Apply transforms
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

                        // Hide initially until fabric is selected
                        this.jacketModel.visible = false;

                        // Add to scene
                        sceneManager.add(this.jacketModel);
                        
                        this.isLoaded = true;
                        console.log('✅ Jacket loaded successfully');
                        
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

    analyzeModel(object) {
        const meshes = [];
        object.traverse((child) => {
            if (child.isMesh || child.isSkinnedMesh) {
                meshes.push({
                    name: child.name,
                    type: child.type,
                    verts: child.geometry?.attributes?.position?.count || 0
                });
            }
        });
        
        console.log(`Total meshes: ${meshes.length}`);
        meshes.forEach(m => {
            console.log(`  - "${m.name}" (${m.type}): ${m.verts.toLocaleString()} vertices`);
        });
    }

    findJacketMeshes(object) {
        this.jacketMeshes = [];
        
        object.traverse((child) => {
            // Skip bones
            if (child.type === 'Bone') return;
            
            // Accept ALL meshes as jacket meshes
            if (child.isMesh || child.isSkinnedMesh) {
                this.jacketMeshes.push(child);
                child.visible = true;
                child.frustumCulled = false;
                console.log('✅ Jacket mesh:', child.name);
            }
        });
    }

    optimizeAllMeshes() {
        this.jacketMeshes.forEach(mesh => {
            const geo = mesh.geometry;
            if (!geo) return;
            
            const vertCount = geo.attributes.position.count;
            console.log(`Mesh: ${mesh.name} - ${vertCount.toLocaleString()} verts`);
            
            // Only decimate if extremely high poly
            if (vertCount > 50000) {
                const factor = Math.ceil(vertCount / 25000);
                this.decimateGeometry(geo, factor);
                console.log(`  Decimated to: ${geo.attributes.position.count.toLocaleString()}`);
            }
            
            geo.computeBoundingSphere();
            
            // Optimize material
            if (mesh.material) {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                mats.forEach(mat => {
                    mat.precision = 'mediump';
                    mat.wireframe = false;
                });
            }
        });
    }

    decimateGeometry(geometry, factor) {
        const pos = geometry.attributes.position.array;
        const newPos = [];
        const vertCount = pos.length / 3;
        
        for (let i = 0; i < vertCount; i += factor) {
            newPos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
        geometry.computeVertexNormals();
    }

    findSkeleton(object) {
        let skeleton = null;
        object.traverse((child) => {
            if (child.isSkinnedMesh && child.skeleton) {
                skeleton = child.skeleton;
            }
        });
        return skeleton;
    }

    getMeshes() {
        return this.jacketMeshes;
    }

    getMesh() {
        return this.jacketMeshes[0] || null;
    }

    setVisible(visible) {
        if (this.jacketModel) {
            this.jacketMeshes.forEach(mesh => {
                mesh.visible = visible;
            });
        }
    }

    setPosition(x, y, z) {
        if (this.jacketModel) {
            this.jacketModel.position.set(x, y, z);
        }
    }

    setRotation(x, y, z) {
        if (this.jacketModel) {
            this.jacketModel.rotation.set(x, y, z);
        }
    }

    setScale(scale) {
        if (this.jacketModel) {
            this.jacketModel.scale.set(scale, scale, scale);
        }
    }

    getModel() {
        return this.jacketModel;
    }

    getSkeleton() {
        return this.jacketSkeleton;
    }

    isModelLoaded() {
        return this.isLoaded;
    }

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

    dispose() {
        if (this.jacketModel) {
            this.jacketModel.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        if (mat.map) mat.map.dispose();
                        if (mat.normalMap) mat.normalMap.dispose();
                        mat.dispose();
                    });
                }
            });
            
            sceneManager.remove(this.jacketModel);
            this.jacketModel = null;
        }
        
        this.jacketMeshes = [];
        this.jacketSkeleton = null;
        this.isLoaded = false;
    }
}

const modelLoader = new ModelLoader();