// fabric-selector.js — OFFLINE MODE ONLY (no backend calls)

class FabricSelector {
    constructor() {
        this.fabrics         = [];
        this.selectedFabric  = null;
        this.container       = document.getElementById('fabric-scroll');
        this.scanBtn         = document.getElementById('scan-fabric-btn');
        this.isLoading       = false;
    }

    async init() {
        console.log('Initializing fabric selector...');

        this.fabrics = this.getOfflineFabrics();
        this.renderFabrics();

        // Auto-select first fabric once model is loaded
        const waitForModel = setInterval(() => {
            if (modelLoader.isModelLoaded()) {
                clearInterval(waitForModel);
                this.selectFabric(this.fabrics[0]);
            }
        }, 200);

        this.setupEventListeners();
        console.log('✓ Fabric selector initialized');
    }

    getOfflineFabrics() {
        return [
            { id: 'black',     name: 'Black Leather',    color: '#1a1a1a', roughness: 0.3,  metalness: 0.2 },
            { id: 'denim',     name: 'Blue Denim',       color: '#4169E1', roughness: 0.85, metalness: 0.0 },
            { id: 'cotton',    name: 'Grey Cotton',      color: '#6B7280', roughness: 0.9,  metalness: 0.0 },
            { id: 'wool',      name: 'Navy Wool',        color: '#1E3A8A', roughness: 0.75, metalness: 0.0 },
            { id: 'silk',      name: 'Champagne Silk',   color: '#F7E7CE', roughness: 0.2,  metalness: 0.3 },
            { id: 'red',       name: 'Red Polyester',    color: '#DC143C', roughness: 0.5,  metalness: 0.1 },
            { id: 'suede',     name: 'Tan Suede',        color: '#D2B48C', roughness: 0.95, metalness: 0.0 },
            { id: 'nylon',     name: 'Olive Nylon',      color: '#556B2F', roughness: 0.4,  metalness: 0.0 }
        ];
    }

    renderFabrics() {
        if (!this.container) return;
        this.container.innerHTML = '';

        this.fabrics.forEach(fabric => {
            const item  = document.createElement('div');
            item.className        = 'fabric-item';
            item.dataset.fabricId = fabric.id;

            const thumb = document.createElement('div');
            thumb.className              = 'fabric-thumbnail';
            thumb.style.backgroundColor  = fabric.color;
            thumb.style.border           = '2px solid transparent';

            const name = document.createElement('span');
            name.textContent = fabric.name;

            item.appendChild(thumb);
            item.appendChild(name);
            item.addEventListener('click', () => this.selectFabric(fabric));
            this.container.appendChild(item);
        });
    }

    async selectFabric(fabric) {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            console.log('🎨 Applying fabric:', fabric.name);

            // Highlight UI
            document.querySelectorAll('.fabric-item').forEach(el => el.classList.remove('selected'));
            const el = document.querySelector(`[data-fabric-id="${fabric.id}"]`);
            if (el) el.classList.add('selected');

            const ok = await materialsManager.applyFabric(fabric);
            if (ok) {
                this.selectedFabric = fabric;
            } else {
                Utils.showError('Could not apply fabric');
            }

        } catch (err) {
            console.error('Fabric select error:', err);
            Utils.showError('Fabric apply failed');
        } finally {
            this.isLoading = false;
        }
    }

    setupEventListeners() {
        // Scan fabric button — placeholder for Phase 4
        this.scanBtn?.addEventListener('click', () => {
            Utils.showError('Fabric scanning coming soon!');
        });
    }

    getSelectedFabric() { return this.selectedFabric; }
}

const fabricSelector = new FabricSelector();