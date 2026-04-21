/**
 * What-If Simulator — Beginner-Friendly Edition
 * Simple sliders with human labels, plain-English risk output, and working factor explanations
 */

// Human-readable labels for common ML features
const FEATURE_LABELS = {
    'age': '🎂 Age (years)',
    'hours-per-week': '⏰ Hours Worked Per Week',
    'education-num': '🎓 Education Level (years)',
    'capital-gain': '💰 Capital Gain ($)',
    'capital-loss': '📉 Capital Loss ($)',
    'fnlwgt': '👥 Population Weight',
    'curricular_units_2nd_sem_grade': '📊 2nd Semester Grade',
    'curricular_units_1st_sem_grade': '📊 1st Semester Grade',
    'curricular_units_2nd_sem_approved': '✅ Subjects Passed (2nd Sem)',
    'curricular_units_1st_sem_approved': '✅ Subjects Passed (1st Sem)',
    'curricular_units_2nd_sem_enrolled': '📚 Subjects Enrolled (2nd Sem)',
    'curricular_units_1st_sem_enrolled': '📚 Subjects Enrolled (1st Sem)',
    'admission_grade': '🏫 Admission Grade',
    'previous_qualification_grade': '📋 Previous Qualification Grade',
    'age_at_enrollment': '🎂 Age at Enrollment',
    'scholarship_holder': '🏅 Scholarship Holder',
    'tuition_fees_up_to_date': '💳 Tuition Fees Up to Date',
    'debtor': '💸 Has Outstanding Debt',
    'displaced': '🏠 Displaced Person',
    'gender': '👤 Gender',
};

function getFriendlyLabel(feat) {
    // Check exact match first
    if (FEATURE_LABELS[feat]) return FEATURE_LABELS[feat];
    // Then try partial match
    const lower = feat.toLowerCase();
    for (const [key, val] of Object.entries(FEATURE_LABELS)) {
        if (lower.includes(key.toLowerCase().replace(/[^a-z]/g, ''))) return val;
    }
    // Fallback: clean underscores/hyphens and title case
    return feat.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

let featureValues = {};
let featureStats = {};
let featureList = [];
let debounceTimer = null;

export async function renderWhatIf(container, api) {
    container.innerHTML = `
        <div class="animate-in">
            <!-- Hero Banner -->
            <div style="background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); border-radius: 24px; padding: 36px; margin-bottom: 28px; color: white;">
                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px;">
                    <div style="font-size: 2.5rem;">🔮</div>
                    <div>
                        <h2 style="font-size: 1.8rem; font-weight: 800; margin: 0; font-family: var(--font-display);">What-If Simulator</h2>
                        <p style="margin: 4px 0 0; opacity: 0.85; font-size: 1rem;">Change any factor below and instantly see how it affects the prediction</p>
                    </div>
                </div>
                <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-top: 16px;">
                    <div style="background: rgba(255,255,255,0.15); border-radius: 12px; padding: 10px 16px; font-size: 0.85rem; font-weight: 600;">🎛️ Move sliders to adjust</div>
                    <div style="background: rgba(255,255,255,0.15); border-radius: 12px; padding: 10px 16px; font-size: 0.85rem; font-weight: 600;">⚡ Results update instantly</div>
                    <div style="background: rgba(255,255,255,0.15); border-radius: 12px; padding: 10px 16px; font-size: 0.85rem; font-weight: 600;">💡 Get plain-English explanations</div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start;">
                <!-- LEFT: Sliders -->
                <div class="card animate-in stagger-1" style="margin-bottom: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <div>
                            <div class="card-title">🎛️ Adjust Factors</div>
                            <div class="card-subtitle">Move a slider to see the risk update</div>
                        </div>
                        <button class="btn btn-secondary" onclick="resetFeatures()" style="font-size: 0.8rem; padding: 8px 16px;">↺ Reset</button>
                    </div>
                    <div id="feature-sliders">
                        <div style="text-align: center; padding: 40px 20px; color: var(--text-tertiary);">
                            <div style="font-size: 3rem; margin-bottom: 12px;">⏳</div>
                            <p style="font-weight: 600; margin-bottom: 8px;">Run the pipeline first</p>
                            <p style="font-size: 0.85rem;">Then come back here to simulate changes</p>
                            <button class="btn btn-primary" style="margin-top: 16px;" onclick="window.fairlensNavigate('pipeline')">▶ Go to Pipeline</button>
                        </div>
                    </div>
                </div>

                <!-- RIGHT: Result + Explanation -->
                <div style="display: flex; flex-direction: column; gap: 20px;">

                    <!-- Risk Gauge -->
                    <div class="card animate-in stagger-2" style="margin-bottom: 0;" id="risk-card">
                        <div class="card-title" style="margin-bottom: 4px;">🎯 Risk Prediction</div>
                        <div class="card-subtitle" style="margin-bottom: 20px;">How likely is this person to need help?</div>
                        <div id="prediction-result" style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
                            <div style="font-size: 4rem; margin-bottom: 4px;">👆</div>
                            <p style="color: var(--text-secondary); font-size: 0.95rem; text-align: center; line-height: 1.5;">
                                Move any slider on the left<br>to get an instant risk prediction
                            </p>
                        </div>
                    </div>

                    <!-- Why this prediction -->
                    <div class="card animate-in stagger-3" style="margin-bottom: 0;">
                        <div class="card-title" style="margin-bottom: 4px;">💡 Why this prediction?</div>
                        <div class="card-subtitle" style="margin-bottom: 20px;">The main factors pushing the result up or down</div>
                        <div id="whatif-shap">
                            <div style="text-align: center; padding: 20px; color: var(--text-tertiary);">
                                <p style="font-size: 0.9rem;">Adjust a slider to see the explanation</p>
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

        const importantFeatures = featureList.filter(f => featureStats[f]);
        const displayFeatures = importantFeatures.slice(0, 10);

        featureValues = {};
        featureList.forEach(f => {
            featureValues[f] = featureStats[f]?.median ?? featureStats[f]?.mean ?? 0;
        });

        renderSliders(displayFeatures);
        // Auto-run prediction with default values
        runPrediction();

    } catch (e) {
        // Pipeline not run yet — empty state already shown
    }
}

function renderSliders(features) {
    const container = document.getElementById('feature-sliders');
    if (!container) return;

    if (features.length === 0) {
        container.innerHTML = '<div style="padding: 20px; color: var(--text-tertiary); text-align: center;">No features available. Run the pipeline first.</div>';
        return;
    }

    let html = '';
    features.forEach((feat, idx) => {
        const stats = featureStats[feat] || {};
        const min = stats.min ?? 0;
        const max = stats.max ?? 100;
        const value = featureValues[feat] ?? stats.median ?? (min + max) / 2;
        const step = max === min ? 1 : (max - min) / 100;
        const label = getFriendlyLabel(feat);
        const pct = max === min ? 50 : ((value - min) / (max - min)) * 100;

        html += `
            <div style="margin-bottom: 20px; animation: slideFadeUp 0.5s ease forwards; animation-delay: ${idx * 0.05}s; opacity: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">${label}</span>
                    <span id="val-${CSS.escape(feat)}" style="font-weight: 700; font-size: 0.95rem; color: var(--accent-blue); min-width: 60px; text-align: right;">${formatValue(feat, value)}</span>
                </div>
                <div style="position: relative;">
                    <input type="range"
                           min="${min}" max="${max}" step="${step}"
                           value="${value}"
                           data-feature="${feat}"
                           oninput="updateFeature(this)"
                           style="width: 100%; height: 6px; border-radius: 3px; appearance: none; background: linear-gradient(to right, #2563eb ${pct}%, #e2e8f0 ${pct}%); cursor: pointer; outline: none;"
                    />
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-tertiary); margin-top: 4px;">
                    <span>${formatValue(feat, min)}</span>
                    <span>${formatValue(feat, max)}</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/** Format a value nicely based on the feature name */
function formatValue(feat, val) {
    const lower = feat.toLowerCase();
    if (lower.includes('gain') || lower.includes('loss') || lower.includes('income')) {
        return `$${Number(val).toFixed(0).toLocaleString()}`;
    }
    if (lower.includes('grade') || lower.includes('score')) {
        return Number(val).toFixed(1);
    }
    if (lower.includes('age')) {
        return `${Number(val).toFixed(0)} yrs`;
    }
    if (lower.includes('hours')) {
        return `${Number(val).toFixed(0)} hrs`;
    }
    // Binary-like fields
    if (val === 0 || val === 1) return val === 1 ? 'Yes' : 'No';
    return Number(val).toFixed(1);
}

window.updateFeature = function(el) {
    const feat = el.dataset.feature;
    const val = parseFloat(el.value);
    featureValues[feat] = val;

    // Update label
    const valEl = document.getElementById(`val-${CSS.escape(feat)}`);
    if (valEl) valEl.textContent = formatValue(feat, val);

    // Update gradient fill on the range
    const stats = featureStats[feat] || {};
    const min = stats.min ?? 0;
    const max = stats.max ?? 100;
    const pct = max === min ? 50 : ((val - min) / (max - min)) * 100;
    el.style.background = `linear-gradient(to right, #2563eb ${pct}%, #e2e8f0 ${pct}%)`;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runPrediction(), 200);
};

window.resetFeatures = function() {
    featureList.forEach(f => {
        const stats = featureStats[f];
        featureValues[f] = stats?.median ?? stats?.mean ?? 0;
    });
    const importantFeatures = featureList.filter(f => featureStats[f]).slice(0, 10);
    renderSliders(importantFeatures);
    runPrediction();
};

async function runPrediction() {
    try {
        const result = await window.fairlensAPI.post('/whatif', {
            feature_values: featureValues
        });
        renderPrediction(result);
        renderFactors(result.shap_explanation);
    } catch (e) {
        console.warn('Prediction failed:', e);
    }
}

function renderPrediction(result) {
    const container = document.getElementById('prediction-result');
    if (!container) return;

    const risk = result.risk_score;
    const tier = result.intervention_tier;
    const riskPct = Math.round(risk * 100);

    const config = {
        High:   { color: '#e11d48', bg: '#fff1f2', emoji: '🚨', msg: 'Needs immediate attention and support', badge: 'badge-high' },
        Medium: { color: '#d97706', bg: '#fffbeb', emoji: '⚠️',  msg: 'Worth monitoring closely',             badge: 'badge-medium' },
        Low:    { color: '#059669', bg: '#ecfdf5', emoji: '✅',  msg: 'Currently doing well — low risk',       badge: 'badge-low' },
    };
    const c = config[tier] || config.Low;

    // Animate the arc
    const circumference = 2 * Math.PI * 54; // r=54
    const fillLength = (risk * circumference).toFixed(1);
    const gapLength  = (circumference - fillLength).toFixed(1);

    container.innerHTML = `
        <div style="position: relative; width: 160px; height: 160px;">
            <svg width="160" height="160" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="54" fill="${c.bg}" stroke="#e2e8f0" stroke-width="12"/>
                <circle cx="80" cy="80" r="54" fill="none" stroke="${c.color}" stroke-width="12"
                        stroke-dasharray="${fillLength} ${gapLength}"
                        stroke-linecap="round"
                        transform="rotate(-90 80 80)"
                        style="transition: stroke-dasharray 0.6s cubic-bezier(0.16,1,0.3,1);"/>
                <text x="80" y="72" text-anchor="middle" fill="${c.color}" font-size="28" font-weight="800" font-family="Outfit,sans-serif">${riskPct}%</text>
                <text x="80" y="91" text-anchor="middle" fill="#94a3b8" font-size="10" font-family="Inter,sans-serif">RISK</text>
            </svg>
        </div>
        <div style="text-align: center;">
            <div style="font-size: 2rem; margin-bottom: 6px;">${c.emoji}</div>
            <span style="display: inline-block; padding: 6px 20px; background: ${c.bg}; color: ${c.color}; border-radius: 20px; font-weight: 700; font-size: 1rem; margin-bottom: 8px;">${tier} Risk</span>
            <p style="font-size: 0.9rem; color: var(--text-secondary); margin: 0; line-height: 1.5;">${c.msg}</p>
        </div>
    `;
}

function renderFactors(shapExplanation) {
    const container = document.getElementById('whatif-shap');
    if (!container) return;

    if (!shapExplanation || shapExplanation.length === 0) {
        container.innerHTML = `
            <div style="padding: 16px; background: #f8fafc; border-radius: 12px; text-align: center;">
                <div style="font-size: 1.5rem; margin-bottom: 8px;">🔄</div>
                <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5;">
                    Explanation not available for this combination.<br>
                    Try changing a slider to refresh.
                </p>
            </div>
        `;
        return;
    }

    const maxAbs = Math.max(...shapExplanation.map(f => Math.abs(f.shap_value)), 0.001);

    let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
    shapExplanation.forEach((factor, i) => {
        const isRisk = factor.shap_value > 0;
        const pct = Math.min((Math.abs(factor.shap_value) / maxAbs) * 100, 100).toFixed(0);
        const color   = isRisk ? '#e11d48' : '#059669';
        const bgColor = isRisk ? '#fff1f2' : '#ecfdf5';
        const arrowIcon = isRisk ? '📈' : '📉';
        const label = getFriendlyLabel(factor.feature);
        const action = isRisk ? 'Pushes risk UP' : 'Pushes risk DOWN';
        const strength = pct > 70 ? 'Strong' : pct > 35 ? 'Moderate' : 'Slight';

        html += `
            <div style="background: ${bgColor}; border-radius: 14px; padding: 14px 16px; border-left: 4px solid ${color}; animation: slideFadeUp 0.4s ease forwards; animation-delay: ${i * 0.08}s; opacity: 0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.2rem;">${arrowIcon}</span>
                        <span style="font-weight: 700; font-size: 0.9rem; color: #0f172a;">${label}</span>
                    </div>
                    <span style="font-size: 0.75rem; font-weight: 700; color: ${color}; white-space: nowrap; margin-left: 8px;">${strength} influence</span>
                </div>
                <div style="height: 6px; background: rgba(0,0,0,0.08); border-radius: 3px; overflow: hidden; margin-bottom: 6px;">
                    <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 3px; transition: width 0.5s ease;"></div>
                </div>
                <p style="margin: 0; font-size: 0.8rem; color: #475569;">${action}</p>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}
