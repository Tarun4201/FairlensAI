/**
 * What-If Simulator Component
 * Adjust feature sliders, see prediction change in real-time
 */

let featureValues = {};
let featureStats = {};
let featureList = [];
let debounceTimer = null;

export async function renderWhatIf(container, api) {
    container.innerHTML = `
        <div class="animate-in">
            <div class="section-header">
                <div class="section-title">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-amber)" stroke-width="2">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                    </svg>
                    What-If Simulator
                </div>
                <span class="badge badge-info">Interactive Prediction</span>
            </div>

            <div class="whatif-layout">
                <!-- Feature Controls -->
                <div class="card animate-in stagger-1">
                    <div class="card-header">
                        <div>
                            <div class="card-title">Feature Values</div>
                            <div class="card-subtitle">Adjust features and see prediction change</div>
                        </div>
                        <button class="btn btn-secondary" onclick="resetFeatures()" style="font-size: 0.75rem; padding: 6px 12px;">Reset</button>
                    </div>
                    <div id="feature-sliders" class="slider-group">
                        <div class="empty-state" style="padding: 30px;">
                            <p>Run pipeline to load features</p>
                        </div>
                    </div>
                </div>

                <!-- Prediction Result -->
                <div>
                    <div class="card animate-in stagger-2" style="margin-bottom: 20px;">
                        <div class="card-header">
                            <div class="card-title">Prediction Result</div>
                        </div>
                        <div id="prediction-result" style="display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 20px 0;">
                            <div class="empty-state" style="padding: 20px;">
                                <p>Adjust features to get a prediction</p>
                            </div>
                        </div>
                    </div>

                    <div class="card animate-in stagger-3">
                        <div class="card-header">
                            <div class="card-title">SHAP Explanation</div>
                            <div class="card-subtitle">Top factors driving this prediction</div>
                        </div>
                        <div id="whatif-shap">
                            <div class="empty-state" style="padding: 20px;">
                                <p>Adjust features to see explanation</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    loadFeatures(api);
}

async function loadFeatures(api) {
    try {
        const data = await api.get('/features');
        featureList = data.features || [];
        featureStats = data.stats || {};

        // Pick top features for sliders (limit to 12 most important ones with stats)
        const importantFeatures = featureList.filter(f => featureStats[f]);
        const displayFeatures = importantFeatures.slice(0, 12);

        // Initialize feature values to medians
        featureValues = {};
        featureList.forEach(f => {
            featureValues[f] = featureStats[f]?.median || featureStats[f]?.mean || 0;
        });

        renderSliders(displayFeatures);

    } catch (e) {
        // Pipeline not run
    }
}

function renderSliders(features) {
    const container = document.getElementById('feature-sliders');
    if (!container) return;

    if (features.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No features available</p></div>';
        return;
    }

    let html = '';
    features.forEach(feat => {
        const stats = featureStats[feat] || {};
        const min = stats.min ?? 0;
        const max = stats.max ?? 100;
        const value = featureValues[feat] ?? stats.median ?? (min + max) / 2;
        const step = (max - min) / 100;

        // Clean label
        const label = feat.length > 35 ? feat.substring(0, 35) + '…' : feat;

        html += `
            <div class="slider-item">
                <div class="slider-header">
                    <span class="slider-label" title="${feat}">${label}</span>
                    <span class="slider-value" id="val-${CSS.escape(feat)}">${Number(value).toFixed(2)}</span>
                </div>
                <input type="range" 
                       min="${min}" max="${max}" step="${step}" 
                       value="${value}"
                       data-feature="${feat}"
                       oninput="updateFeature(this)"
                />
            </div>
        `;
    });

    container.innerHTML = html;
}

window.updateFeature = function(el) {
    const feat = el.dataset.feature;
    const val = parseFloat(el.value);
    featureValues[feat] = val;

    // Update display value
    const valEl = document.getElementById(`val-${CSS.escape(feat)}`);
    if (valEl) valEl.textContent = val.toFixed(2);

    // Debounced prediction
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runPrediction(), 300);
};

window.resetFeatures = function() {
    featureList.forEach(f => {
        const stats = featureStats[f];
        featureValues[f] = stats?.median ?? stats?.mean ?? 0;
    });

    // Re-render sliders
    const importantFeatures = featureList.filter(f => featureStats[f]).slice(0, 12);
    renderSliders(importantFeatures);

    // Clear prediction
    document.getElementById('prediction-result').innerHTML = `
        <div class="empty-state" style="padding: 20px;">
            <p>Adjust features to get a prediction</p>
        </div>
    `;
    document.getElementById('whatif-shap').innerHTML = `
        <div class="empty-state" style="padding: 20px;">
            <p>Adjust features to see explanation</p>
        </div>
    `;
};

async function runPrediction() {
    try {
        const result = await window.fairlensAPI.post('/whatif', {
            feature_values: featureValues
        });

        renderPrediction(result);
        renderWhatIfShap(result.shap_explanation);

    } catch (e) {
        console.warn('Prediction failed:', e);
    }
}

function renderPrediction(result) {
    const container = document.getElementById('prediction-result');
    if (!container) return;

    const risk = result.risk_score;
    const tier = result.intervention_tier;
    const tierColors = { High: '#f43f5e', Medium: '#f59e0b', Low: '#10b981' };
    const color = tierColors[tier] || '#3b82f6';

    container.innerHTML = `
        <svg width="160" height="160" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="65" stroke="rgba(255,255,255,0.05)" stroke-width="10" fill="none"/>
            <circle cx="80" cy="80" r="65" 
                    stroke="${color}" 
                    stroke-width="10" fill="none"
                    stroke-dasharray="${risk * 408} 408"
                    stroke-linecap="round"
                    transform="rotate(-90 80 80)"
                    style="transition: stroke-dasharray 0.5s ease;"/>
            <text x="80" y="72" text-anchor="middle" fill="var(--text-primary)" font-size="32" font-weight="800" font-family="Inter, sans-serif">${(risk * 100).toFixed(1)}%</text>
            <text x="80" y="92" text-anchor="middle" fill="var(--text-tertiary)" font-size="11" font-family="Inter, sans-serif">RISK SCORE</text>
        </svg>
        <div style="text-align: center;">
            <span class="badge badge-${tier.toLowerCase()}" style="font-size: 0.85rem; padding: 6px 16px;">${tier} Risk</span>
            <p style="font-size: 0.8rem; color: var(--text-tertiary); margin-top: 8px;">
                ${tier === 'High' ? 'Immediate intervention recommended' : tier === 'Medium' ? 'Review within 30 days' : 'No immediate action needed'}
            </p>
        </div>
    `;
}

function renderWhatIfShap(shapExplanation) {
    const container = document.getElementById('whatif-shap');
    if (!container) return;

    if (!shapExplanation || shapExplanation.length === 0) {
        container.innerHTML = '<div style="padding: 12px; color: var(--text-tertiary); font-size: 0.85rem;">SHAP explanation unavailable for this input</div>';
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';

    shapExplanation.forEach((factor, i) => {
        const color = factor.shap_value > 0 ? '#f43f5e' : '#10b981';
        const arrow = factor.shap_value > 0 ? '↑' : '↓';
        const width = Math.min(Math.abs(factor.shap_value) * 200, 100);

        html += `
            <div style="display: flex; align-items: center; gap: 12px; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid var(--border-subtle);">
                <span style="font-size: 1.2rem; min-width: 24px; text-align: center;">${arrow}</span>
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 4px;">${factor.feature}</div>
                    <div style="height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden;">
                        <div style="width: ${width}%; height: 100%; background: ${color}; border-radius: 2px; transition: width 0.3s;"></div>
                    </div>
                </div>
                <div style="text-align: right; min-width: 80px;">
                    <span style="color: ${color}; font-weight: 700; font-size: 0.85rem;">${factor.shap_value.toFixed(4)}</span>
                    <br/>
                    <span style="font-size: 0.7rem; color: var(--text-tertiary);">${factor.direction}</span>
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}
