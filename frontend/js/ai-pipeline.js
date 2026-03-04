// ai-pipeline.js — STUB (Phase 6 is future work)
// This is intentionally empty. The app runs in 3D-only mode.
// When the backend AI server is ready, this file gets replaced.

class AIPipeline {
    constructor() {
        this.failedPermanently = true;
        this.isConnected = false;
    }

    async init()  { console.log('ℹ️ AI pipeline disabled — 3D-only mode'); }
    start()       {}
    stop()        {}
    close()       {}
    isActive()    { return false; }
    hasFailed()   { return true; }
    getBlendAlpha() { return 0; }
    getLatestFrame() { return null; }
    updateBlendIndicator() {}
}

const aiPipeline = new AIPipeline();