/**
 * Pipeline Component
 * 9-layer pipeline visualization with dataset upload & status indicators
 */

const LAYERS = [
    { id: 0, name: 'AI Schema Analyzer', desc: 'Auto-detect target, sensitive attributes, and feature groups', tag: 'LLM + Rule-based', key: 'schema_analyzer' },
    { id: 1, name: 'Bronze — Raw Ingestion', desc: 'Ingest raw dataset, enforce schema integrity', tag: 'Delta Lake', key: 'bronze' },
    { id: 2, name: 'Silver — Feature Engineering', desc: 'Null handling, categorical encoding, trend features', tag: 'PySpark', key: 'silver' },
    { id: 3, name: 'Model Training', desc: 'XGBoost + Logistic Regression, MLflow tracking', tag: 'MLflow', key: 'model_training' },
    { id: 4, name: 'Calibration', desc: 'Platt Scaling for meaningful probabilities', tag: 'CalibratedCV', key: 'calibration' },
    { id: 5, name: 'Fairness Audit', desc: 'DPD + EOD across sensitive attributes', tag: 'CORE', key: 'fairness_audit' },
    { id: 6, name: 'SHAP Explainability', desc: 'TreeExplainer, top-3 features per prediction', tag: 'SHAP', key: 'shap' },
    { id: 7, name: 'Text Generation', desc: 'SHAP → plain-language explanations', tag: 'NLG', key: 'text_generation' },
    { id: 8, name: 'Gold Output', desc: 'Final enriched table with all signals', tag: 'Output', key: 'gold_output' }
];

let pipelinePolling = null;

export async function renderPipeline(container, api) {
    container.innerHTML = `
        <div class="animate-in">

            <!-- Dataset Source Selection -->
            <div class="card" style="margin-bottom: 24px;">
                <div class="card-header" style="margin-bottom: 16px;">
                    <div class="card-title" style="display: flex; align-items: center; gap: 8px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/>
                            <line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        Dataset Source
                    </div>
                    <span class="badge badge-info" id="upload-status-badge">No dataset selected</span>
                </div>

                <!-- Source Tabs -->
                <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                    <button class="btn dataset-tab active" id="tab-demo" onclick="switchDatasetTab('demo')">
                        📦 Demo Presets
                    </button>
                    <button class="btn dataset-tab" id="tab-upload" onclick="switchDatasetTab('upload')">
                        📁 Upload CSV
                    </button>
                </div>

                <!-- Demo Preset Panel -->
                <div id="panel-demo" class="dataset-panel">
                    <div id="demo-datasets-list" style="display: flex; gap: 12px; flex-wrap: wrap;">
                        <div class="demo-dataset-card selected" data-key="student_dropout" onclick="selectDemoDataset('student_dropout', this)">
                            <div class="demo-dataset-icon">🎓</div>
                            <div class="demo-dataset-name">Student Dropout</div>
                            <div class="demo-dataset-desc">UCI · 4,424 records · 36 features</div>
                        </div>
                        <div class="demo-dataset-card" data-key="adult_income" onclick="selectDemoDataset('adult_income', this)">
                            <div class="demo-dataset-icon">💰</div>
                            <div class="demo-dataset-name">Adult Income</div>
                            <div class="demo-dataset-desc">UCI · 48,842 records · 14 features</div>
                        </div>
                    </div>
                </div>

                <!-- Upload Panel -->
                <div id="panel-upload" class="dataset-panel" style="display: none;">
                    <div class="upload-zone" id="upload-zone">
                        <div class="upload-zone-content" id="upload-zone-content">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5" style="opacity: 0.5;">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="17 8 12 3 7 8"/>
                                <line x1="12" y1="3" x2="12" y2="15"/>
                            </svg>
                            <p style="margin-top: 12px; color: var(--text-secondary); font-weight: 600;">
                                Drag & drop your CSV file here
                            </p>
                            <p style="font-size: 0.78rem; color: var(--text-tertiary); margin-top: 4px;">
                                or click to browse · CSV format only · Binary classification
                            </p>
                            <input type="file" id="csv-file-input" accept=".csv" style="display: none;" />
                        </div>
                    </div>

                    <!-- Upload Preview (hidden until file uploaded) -->
                    <div id="upload-preview" style="display: none;"></div>
                </div>

                <!-- Advanced Options (collapsible) -->
                <details style="margin-top: 16px;">
                    <summary style="cursor: pointer; font-size: 0.82rem; color: var(--text-tertiary); user-select: none;">
                        ⚙️ Advanced Options
                    </summary>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
                        <div>
                            <label style="font-size: 0.75rem; color: var(--text-tertiary); display: block; margin-bottom: 4px;">
                                Positive Class (auto-detect if empty)
                            </label>
                            <input type="text" id="positive-class-input"
                                   placeholder="e.g. Dropout, Yes, 1"
                                   style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font-size: 0.82rem;" />
                        </div>
                        <div>
                            <label style="font-size: 0.75rem; color: var(--text-tertiary); display: block; margin-bottom: 4px;">
                                Entity Prefix (auto-detect if empty)
                            </label>
                            <input type="text" id="entity-prefix-input"
                                   placeholder="e.g. STU, APP, PAT"
                                   maxlength="5"
                                   style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font-size: 0.82rem;" />
                        </div>
                    </div>
                </details>
            </div>

            <!-- Control Bar -->
            <div class="card" style="margin-bottom: 24px;">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
                    <div>
                        <h2 style="font-size: 1.2rem; font-weight: 800; margin-bottom: 4px;">9-Layer Pipeline</h2>
                        <p style="font-size: 0.8rem; color: var(--text-tertiary);">Execute the complete fairness & explainability pipeline</p>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <span id="pipeline-elapsed" style="font-size: 0.8rem; color: var(--text-tertiary); font-variant-numeric: tabular-nums;"></span>
                        <button id="run-pipeline-btn" class="btn btn-primary" onclick="startPipeline()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            Run Pipeline
                        </button>
                    </div>
                </div>
                <div class="progress-bar" style="margin-top: 16px;">
                    <div class="progress-fill" id="pipeline-progress" style="width: 0%;"></div>
                </div>
            </div>

            <!-- Layer Cards -->
            <div class="pipeline-layers" id="pipeline-layers">
                ${LAYERS.map((layer, i) => `
                    <div class="pipeline-layer animate-in stagger-${Math.min(i+1, 5)}" id="layer-${layer.id}" data-key="${layer.key}">
                        <div class="layer-number">${layer.id}</div>
                        <div class="layer-info">
                            <div class="layer-name">
                                ${layer.name}
                                ${layer.id === 5 ? '<span class="badge badge-bias" style="margin-left: 8px; font-size: 0.65rem;">CORE</span>' : ''}
                            </div>
                            <div class="layer-desc">${layer.desc}</div>
                        </div>
                        <div class="badge badge-info" style="font-size: 0.65rem;">${layer.tag}</div>
                        <div class="layer-status pending" id="layer-status-${layer.id}">Pending</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // Setup upload zone interactions
    setupUploadZone(api);

    // Check current status
    refreshPipelineUI(api);
}

// ── Dataset Source Management ──────────────────────────────────

let selectedDataset = 'student_dropout';
let uploadedFilePath = null;

window.switchDatasetTab = function(tab) {
    document.querySelectorAll('.dataset-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dataset-panel').forEach(p => p.style.display = 'none');

    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById(`panel-${tab}`).style.display = 'block';

    if (tab === 'upload' && uploadedFilePath) {
        selectedDataset = 'uploaded';
    } else if (tab === 'demo') {
        // Keep current demo selection
        const activeCard = document.querySelector('.demo-dataset-card.selected');
        if (activeCard) selectedDataset = activeCard.dataset.key;
    }
};

window.selectDemoDataset = function(key, el) {
    document.querySelectorAll('.demo-dataset-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedDataset = key;

    const badge = document.getElementById('upload-status-badge');
    if (badge) {
        badge.textContent = `Dataset: ${key}`;
        badge.className = 'badge badge-info';
    }
};

function setupUploadZone(api) {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('csv-file-input');
    if (!zone || !input) return;

    // Click to browse
    zone.addEventListener('click', () => input.click());

    // Drag & Drop
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.csv')) {
            handleFileUpload(files[0], api);
        } else {
            showUploadError('Please upload a .csv file');
        }
    });

    // File input change
    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0], api);
        }
    });
}

async function handleFileUpload(file, api) {
    const zone = document.getElementById('upload-zone-content');
    const badge = document.getElementById('upload-status-badge');

    // Show uploading state
    zone.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <div class="pulse-dot" style="width: 12px; height: 12px; border-radius: 50%; background: var(--accent-cyan); animation: pulse 1.5s infinite;"></div>
            <span style="color: var(--text-secondary); font-weight: 600;">Uploading ${file.name}...</span>
        </div>
    `;

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Upload failed');
        }

        const result = await response.json();
        uploadedFilePath = result.path;
        selectedDataset = 'uploaded';

        // Show success + preview
        showUploadSuccess(result, file.name);

        if (badge) {
            badge.textContent = `Uploaded: ${file.name}`;
            badge.className = 'badge badge-success';
            badge.style.cssText = 'background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);';
        }

    } catch (e) {
        showUploadError(e.message);
    }
}

function showUploadSuccess(result, filename) {
    const zone = document.getElementById('upload-zone');
    const preview = document.getElementById('upload-preview');

    // Update zone to show file info
    zone.innerHTML = `
        <div class="upload-zone-content" style="text-align: left; padding: 12px 0;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <div>
                    <div style="font-weight: 700; color: var(--text-primary);">${filename}</div>
                    <div style="font-size: 0.75rem; color: var(--text-tertiary);">
                        ${result.rows.toLocaleString()} rows · ${result.columns.length} columns
                    </div>
                </div>
                <button class="btn" style="margin-left: auto; font-size: 0.75rem; padding: 4px 12px;" onclick="resetUpload()">
                    Change File
                </button>
            </div>
        </div>
    `;

    // Show preview table
    if (preview && result.preview && result.preview.length > 0) {
        const cols = result.columns.slice(0, 8);
        const hasMore = result.columns.length > 8;

        let html = `
            <div style="margin-top: 12px; max-height: 220px; overflow: auto; border-radius: 8px; border: 1px solid var(--border);">
                <table style="width: 100%; font-size: 0.72rem;">
                    <thead>
                        <tr>
                            ${cols.map(c => `<th style="padding: 6px 10px; white-space: nowrap;">${c}</th>`).join('')}
                            ${hasMore ? `<th style="padding: 6px 10px; color: var(--text-tertiary);">+${result.columns.length - 8} more</th>` : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${result.preview.slice(0, 5).map(row => `
                            <tr>
                                ${cols.map(c => `<td style="padding: 4px 10px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${row[c] ?? '—'}</td>`).join('')}
                                ${hasMore ? '<td></td>' : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div style="margin-top: 8px; font-size: 0.72rem; color: var(--text-tertiary);">
                Detected columns: ${result.columns.join(', ')}
            </div>
        `;
        preview.innerHTML = html;
        preview.style.display = 'block';
    }
}

function showUploadError(message) {
    const zone = document.getElementById('upload-zone-content');
    if (zone) {
        zone.innerHTML = `
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" stroke-width="1.5" style="opacity: 0.7;">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <p style="margin-top: 12px; color: var(--accent-coral); font-weight: 600;">${message}</p>
            <p style="font-size: 0.78rem; color: var(--text-tertiary); margin-top: 4px;">Click to try again</p>
        `;
    }
}

window.resetUpload = function() {
    uploadedFilePath = null;
    const zone = document.getElementById('upload-zone');
    const preview = document.getElementById('upload-preview');

    if (zone) {
        zone.innerHTML = `
            <div class="upload-zone-content" id="upload-zone-content">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5" style="opacity: 0.5;">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <p style="margin-top: 12px; color: var(--text-secondary); font-weight: 600;">
                    Drag & drop your CSV file here
                </p>
                <p style="font-size: 0.78rem; color: var(--text-tertiary); margin-top: 4px;">
                    or click to browse · CSV format only · Binary classification
                </p>
                <input type="file" id="csv-file-input" accept=".csv" style="display: none;" />
            </div>
        `;
        // Re-bind events
        setupUploadZone(window.fairlensAPI);
    }
    if (preview) {
        preview.innerHTML = '';
        preview.style.display = 'none';
    }

    const badge = document.getElementById('upload-status-badge');
    if (badge) {
        badge.textContent = 'No dataset selected';
        badge.className = 'badge badge-info';
        badge.style.cssText = '';
    }
};

// ── Pipeline Execution ─────────────────────────────────────────

async function refreshPipelineUI(api) {
    try {
        const status = await api.get('/pipeline/status');
        updatePipelineView(status);
    } catch (e) {}
}

function updatePipelineView(status) {
    // Progress bar
    const progressEl = document.getElementById('pipeline-progress');
    if (progressEl) {
        progressEl.style.width = `${status.progress}%`;
    }

    // Elapsed time
    const elapsedEl = document.getElementById('pipeline-elapsed');
    if (elapsedEl && status.elapsed) {
        elapsedEl.textContent = `${status.elapsed.toFixed(1)}s`;
    }

    // Button state
    const btn = document.getElementById('run-pipeline-btn');
    if (btn) {
        if (status.status === 'running') {
            btn.disabled = true;
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                </svg>
                Running...
            `;
        } else {
            btn.disabled = false;
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                ${status.status === 'complete' ? 'Re-run Pipeline' : 'Run Pipeline'}
            `;
        }
    }

    // Layer statuses
    const completed = status.layers_completed || [];

    LAYERS.forEach(layer => {
        const el = document.getElementById(`layer-${layer.id}`);
        const statusEl = document.getElementById(`layer-status-${layer.id}`);
        if (!el || !statusEl) return;

        el.classList.remove('active', 'completed', 'error');

        if (completed.includes(layer.key)) {
            el.classList.add('completed');
            statusEl.className = 'layer-status done';
            statusEl.textContent = '✓ Done';
        } else if (status.current_layer && status.current_layer.includes(layer.name.split('—')[0].trim())) {
            el.classList.add('active');
            statusEl.className = 'layer-status running';
            statusEl.textContent = '⟳ Running';
        } else {
            statusEl.className = 'layer-status pending';
            statusEl.textContent = 'Pending';
        }
    });

    // Check for errors
    if (status.errors && status.errors.length > 0) {
        const lastError = status.errors[status.errors.length - 1];
        LAYERS.forEach(layer => {
            if (lastError.layer && lastError.layer.includes(layer.name.split('—')[0].trim())) {
                const el = document.getElementById(`layer-${layer.id}`);
                const statusEl = document.getElementById(`layer-status-${layer.id}`);
                if (el) el.classList.add('error');
                if (statusEl) {
                    statusEl.className = 'layer-status';
                    statusEl.style.color = 'var(--accent-coral)';
                    statusEl.textContent = '✕ Error';
                }
            }
        });
    }
}

window.startPipeline = async function() {
    const api = window.fairlensAPI;

    // Build request body
    const body = {
        force_refresh: false,
        dataset: selectedDataset
    };

    const positiveClass = document.getElementById('positive-class-input')?.value?.trim();
    const entityPrefix = document.getElementById('entity-prefix-input')?.value?.trim();

    if (positiveClass) body.positive_class = positiveClass;
    if (entityPrefix) body.entity_prefix = entityPrefix;

    try {
        await api.post('/pipeline/run', body);

        // Start polling
        window.fairlensStartPolling();

        // Local polling for this view
        if (pipelinePolling) clearInterval(pipelinePolling);
        pipelinePolling = setInterval(async () => {
            try {
                const status = await api.get('/pipeline/status');
                updatePipelineView(status);

                if (status.status === 'complete' || status.status === 'error') {
                    clearInterval(pipelinePolling);
                    pipelinePolling = null;
                }
            } catch (e) {}
        }, 1000);

    } catch (e) {
        alert('Failed to start pipeline: ' + e.message);
    }
};
