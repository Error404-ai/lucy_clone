// loader.js — COMBINED RIG VERSION
// Handles a GLB that contains:
//   • A full humanoid body mesh  (hidden at runtime — drives skinning only via skeleton)
//   • A jacket mesh              (visible — deforms with the shared skeleton)
//   • A shared armature skeleton (drives both, we only show the jacket)
//
// Detection strategy (in priority order):
//   1. CONFIG.RIG.BODY_MESH_NAMES  — exact mesh name list from your Blender export
//   2. Keyword heuristic           — 'body', 'skin', 'human', 'torso', etc.
//   3. Largest-mesh fallback       — the mesh with the most vertices is the body
//
// VISIBILITY FIX:
//   The jacket group is left VISIBLE after loading. skeleton-mapper.setJacket()
//   positions it at the safe centre and keeps it visible. Previously setting
//   jacketModel.visible = false here created a hidden-by-default state that
//   only cleared if onFabricApplied() was successfully called — any failure in
//   that chain caused the jacket to stay invisible permanently.

class ModelLoader {
    constructor() {
        // ── DRACOLoader ───────────────────────────────────────────────────────
        this.dracoLoader = new THREE.DRACOLoader();
        this.dracoLoader.setDecoderPath(
            'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/'
        );
        this.dracoLoader.preload();

        // ── GLTFLoader ───────────────────────────────────────────────────────
        this.loader = new THREE.GLTFLoader();
        this.loader.setDRACOLoader(this.dracoLoader);

        // ── State ─────────────────────────────────────────────────────────────
        this.jacketModel    = null;   // root THREE.Group from gltf.scene
        this.jacketMeshes   = [];     // clothing meshes → visible, rendered
        this.bodyMeshes     = [];     // body meshes     → hidden, deformation-only
        this.allMeshes      = [];     // every mesh found (for diagnostics)
        this.jacketSkeleton = null;   // shared THREE.Skeleton
        this.isLoaded       = false;
        this.hasSharedSkeleton = false;

        // ── Internal diagnostics ──────────────────────────────────────────────
        this._loadLog = [];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════

    async loadJacket(modelPath = CONFIG.JACKET.MODEL_PATH) {
        return new Promise((resolve, reject) => {
            console.log('📦 Loading combined GLB:', modelPath);
            this._loadLog = [];

            this.loader.load(
                modelPath,
                (gltf) => {
                    try {
                        this._processGLTF(gltf);
                        resolve(this.jacketModel);
                    } catch (err) {
                        console.error('❌ Error processing GLB:', err);
                        reject(err);
                    }
                },
                (progress) => {
                    if (progress.total > 0) {
                        const pct = Math.round((progress.loaded / progress.total) * 100);
                        Utils.updateLoadingText(`Loading model… ${pct}%`);
                    }
                },
                (err) => {
                    console.error('❌ Failed to load GLB:', err);
                    reject(err);
                }
            );
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROCESSING
    // ═══════════════════════════════════════════════════════════════════════════

    _processGLTF(gltf) {
        this.jacketModel = gltf.scene;

        // 1. Collect every mesh/skinnedMesh in the scene graph
        this._collectAllMeshes(this.jacketModel);

        if (this.allMeshes.length === 0) {
            throw new Error('GLB contains no meshes — check the export.');
        }

        // 2. Classify meshes: body vs clothing
        this._classifyMeshes();

        // 3. Validate we have something to show
        if (this.jacketMeshes.length === 0) {
            console.warn('⚠️ Classifier found no jacket meshes — making ALL meshes visible');
            this.jacketMeshes = [...this.allMeshes];
            this.bodyMeshes   = [];
        }

        // 4. Apply visibility
        this._applyVisibility();

        // 5. Extract skeleton (from the first SkinnedMesh we can find)
        this._extractSkeleton();

        // 6. Validate geometry scale
        this._validateScale();

        // 7. Set initial transform — no Y rotation here, skeleton-mapper handles it
        this.jacketModel.scale.setScalar(1.0);
        this.jacketModel.position.set(0, 0, 0);
        this.jacketModel.rotation.set(0, Math.PI, 0);

        // ── VISIBILITY FIX ────────────────────────────────────────────────────
        // Do NOT set visible = false here. The jacket starts visible with whatever
        // material the GLB has. skeleton-mapper.setJacket() will position it
        // correctly at the screen centre immediately.
        // Previously: this.jacketModel.visible = false;  ← THIS WAS THE BUG
        this.jacketModel.visible = true;

        // 8. Register with scene + mapper
        sceneManager.add(this.jacketModel);
        skeletonMapper.setJacket(this.jacketModel);

        this.isLoaded = true;

        // Summary
        console.log('✅ Combined GLB loaded');
        console.log(`   All meshes   : ${this.allMeshes.length}`);
        console.log(`   Jacket meshes: ${this.jacketMeshes.length} (visible)`);
        console.log(`   Body meshes  : ${this.bodyMeshes.length}  (hidden)`);
        console.log(`   Has skeleton : ${this.hasSharedSkeleton}`);
        if (this._loadLog.length) {
            console.log('   Detection log:');
            this._loadLog.forEach(l => console.log('    ', l));
        }
    }

    // ─── Step 1: collect every renderable mesh ────────────────────────────────
    _collectAllMeshes(root) {
        this.allMeshes = [];

        root.traverse(child => {
            if (!child.isMesh && !child.isSkinnedMesh) return;

            const verts = child.geometry?.attributes?.position?.count ?? 0;
            const name  = child.name.toLowerCase();

            // Skip tiny debug helpers (bounding boxes, empties exported as meshes)
            const isHelper = ['cube', 'plane', 'helper', 'collider',
                              'bound', 'reference', 'guide', 'proxy']
                              .some(kw => name.includes(kw));
            if (isHelper || verts < 50) {
                child.visible = false;
                return;
            }

            child.frustumCulled = false;   // prevent pop-in on mobile
            child.castShadow    = false;
            child.receiveShadow = false;

            this.allMeshes.push(child);
            this._loadLog.push(`  mesh "${child.name}" — ${verts} verts ${child.isSkinnedMesh ? '[SKINNED]' : '[STATIC]'}`);
        });
    }

    // ─── Step 2: classify body vs jacket meshes ───────────────────────────────
    _classifyMeshes() {
        this.bodyMeshes   = [];
        this.jacketMeshes = [];

        // Priority 1: explicit name list from config
        const explicitBodyNames = (CONFIG.RIG?.BODY_MESH_NAMES ?? [])
            .map(n => n.toLowerCase());

        if (explicitBodyNames.length > 0) {
            this.allMeshes.forEach(mesh => {
                const n = mesh.name.toLowerCase();
                if (explicitBodyNames.some(en => n.includes(en))) {
                    this.bodyMeshes.push(mesh);
                    this._loadLog.push(`  → BODY (explicit): "${mesh.name}"`);
                } else {
                    this.jacketMeshes.push(mesh);
                    this._loadLog.push(`  → JACKET (explicit): "${mesh.name}"`);
                }
            });
            return;
        }

        // Priority 2: keyword heuristic
        const BODY_KW    = ['body', 'skin', 'human', 'avatar', 'character',
                             'mannequin', 'torso', 'flesh', 'nude', 'base'];
        const JACKET_KW  = ['jacket', 'coat', 'cloth', 'wear', 'garment',
                             'shirt', 'top', 'fabric', 'textile', 'material',
                             'apparel', 'outfit', 'clothing', 'hoodie', 'blazer'];

        const heuristicBody   = [];
        const heuristicJacket = [];
        const ambiguous       = [];

        this.allMeshes.forEach(mesh => {
            const n = mesh.name.toLowerCase();
            const isBody   = BODY_KW.some(kw => n.includes(kw));
            const isJacket = JACKET_KW.some(kw => n.includes(kw));

            if (isBody && !isJacket) {
                heuristicBody.push(mesh);
                this._loadLog.push(`  → BODY (keyword): "${mesh.name}"`);
            } else if (isJacket && !isBody) {
                heuristicJacket.push(mesh);
                this._loadLog.push(`  → JACKET (keyword): "${mesh.name}"`);
            } else {
                ambiguous.push(mesh);
                this._loadLog.push(`  → AMBIGUOUS: "${mesh.name}"`);
            }
        });

        if (heuristicBody.length > 0 || heuristicJacket.length > 0) {
            this.bodyMeshes   = heuristicBody;
            // Ambiguous meshes are treated as jacket (safer — user sees them)
            this.jacketMeshes = [...heuristicJacket, ...ambiguous];
            return;
        }

        // Priority 3: fallback — largest mesh is body (body has most vertices)
        if (this.allMeshes.length >= 2) {
            const sorted = [...this.allMeshes].sort((a, b) => {
                const va = a.geometry?.attributes?.position?.count ?? 0;
                const vb = b.geometry?.attributes?.position?.count ?? 0;
                return vb - va; // descending
            });

            this.bodyMeshes   = [sorted[0]];
            this.jacketMeshes = sorted.slice(1);
            this._loadLog.push(`  → BODY (largest-mesh fallback): "${sorted[0].name}"`);
            this._loadLog.push(`  → JACKET (remaining): ${sorted.slice(1).map(m => `"${m.name}"`).join(', ')}`);
        } else {
            // Only one mesh — treat as jacket (this shouldn't happen with combined rig)
            this.jacketMeshes = [...this.allMeshes];
            this._loadLog.push('  → Single mesh detected — treating as JACKET');
        }
    }

    // ─── Step 3: apply visibility ─────────────────────────────────────────────
    _applyVisibility() {
        this.bodyMeshes.forEach(mesh => {
            mesh.visible = false;
            // Keep SkinnedMesh in the scene graph so its skeleton stays active.
            // THREE.js needs the SkinnedMesh to exist for bone world-matrix updates,
            // even if invisible. We only hide it visually.
        });

        this.jacketMeshes.forEach(mesh => {
            mesh.visible    = true;
            mesh.renderOrder = 1; // draw on top of video plane (renderOrder -1000)

            // Ensure skinning is enabled
            if (mesh.isSkinnedMesh) {
                mesh.frustumCulled = false;
            }
        });
    }

    // ─── Step 4: extract the shared skeleton ──────────────────────────────────
    _extractSkeleton() {
        // Try jacket meshes first, then body meshes
        const allSkinned = [...this.jacketMeshes, ...this.bodyMeshes]
            .filter(m => m.isSkinnedMesh && m.skeleton);

        if (allSkinned.length > 0) {
            this.jacketSkeleton    = allSkinned[0].skeleton;
            this.hasSharedSkeleton = true;

            console.log(`✅ Shared skeleton: ${this.jacketSkeleton.bones.length} bones`);

            // Log bone hierarchy (first 20 to keep console clean)
            const names = this.jacketSkeleton.bones.slice(0, 20).map(b => b.name);
            console.log('   Bones (first 20):', names.join(', '));
            if (this.jacketSkeleton.bones.length > 20) {
                console.log(`   … and ${this.jacketSkeleton.bones.length - 20} more`);
            }

            // Enable frustumCulled=false for all skinned meshes so
            // the jacket doesn't disappear when bones push verts off-screen
            allSkinned.forEach(m => { m.frustumCulled = false; });
        } else {
            console.log('ℹ️  No SkinnedMesh found — static jacket (no bone animation)');
        }
    }

    // ─── Step 5: validate geometry scale ─────────────────────────────────────
    _validateScale() {
        const bbox = new THREE.Box3().setFromObject(this.jacketModel);
        if (bbox.isEmpty()) return;

        const size = new THREE.Vector3();
        bbox.getSize(size);

        const maxDim = Math.max(size.x, size.y, size.z);
        const unitScale = CONFIG.JACKET.MODEL_UNIT_SCALE ?? 1.0;

        const scaledMax = maxDim * unitScale;

        if (scaledMax > 15) {
            console.warn(`⚠️  Model very large (${maxDim.toFixed(2)} units × scale ${unitScale} = ${scaledMax.toFixed(2)}).`);
            console.warn('   If the jacket fills the screen, try CONFIG.JACKET.MODEL_UNIT_SCALE = 0.01');
        } else if (scaledMax < 0.05) {
            console.warn(`⚠️  Model very small (${maxDim.toFixed(2)} units × scale ${unitScale} = ${scaledMax.toFixed(2)}).`);
            console.warn('   If the jacket is a dot, try CONFIG.JACKET.MODEL_UNIT_SCALE = 10');
        } else {
            console.log(`✅ Model scale OK — max dimension ${scaledMax.toFixed(3)} m after unit scale`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC GETTERS
    // ═══════════════════════════════════════════════════════════════════════════

    getModel()            { return this.jacketModel; }
    getMeshes()           { return this.jacketMeshes; }   // visible jacket meshes
    getBodyMeshes()       { return this.bodyMeshes; }     // hidden body meshes
    getAllMeshes()        { return this.allMeshes; }
    getSkeleton()         { return this.jacketSkeleton; }
    isModelLoaded()       { return this.isLoaded; }

    setVisible(visible) {
        if (this.jacketModel) {
            this.jacketModel.visible = visible;
        }
    }

    // Force-show/hide body mesh (useful for debugging)
    debugShowBody(show) {
        this.bodyMeshes.forEach(m => { m.visible = show; });
        console.log(`🔍 Body mesh visibility: ${show}`);
    }

    dispose() {
        if (this.dracoLoader) this.dracoLoader.dispose();
        console.log('🗑️  ModelLoader disposed');
    }
}

const modelLoader = new ModelLoader();