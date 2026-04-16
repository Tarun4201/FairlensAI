/**
 * Explainability Component
 * SHAP visualizations, global feature importance, per-entity explanations
 */

export async function renderExplainability(container, api) {
    container.innerHTML = `
        <div class="animate-in">
            <div class="section-header">
                <div class="section-title">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" stroke-width="2">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                    </svg>
                    SHAP Explainability
                </div>
            </div>

            <!-- Global Feature Importance -->
            <div class="card animate-in stagger-1" style="margin-bottom: 24px;">
                <div class="card-header">
                    <div>
                        <div class="card-title">Global Feature Importance</div>
                        <div class="card-subtitle">Mean absolute SHAP values across all predictions</div>
                    </div>
                </div>
                <div id="global-importance" class="chart-container" style="min-height: 300px;">
                    <div class="empty-state" style="padding: 40px;">
                        <p>Run pipeline to see SHAP feature importance</p>
                    </div>
                </div>
            </div>

            <!-- Entity Search + Explanation -->
            <div class="card animate-in stagger-2" style="margin-bottom: 24px;">
                <div class="card-header">
                    <div>
                        <div class="card-title">Entity Explanation Lookup</div>
                        <div class="card-subtitle">Search for a specific entity to view their prediction explanation</div>
                    </div>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                    <input type="text" id="entity-search" placeholder="Enter entity ID (e.g., STU-00042)" 
                           style="flex: 1; padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); background: var(--bg-tertiary); color: var(--text-primary); font-family: inherit; font-size: 0.9rem; outline: none;"
                    />
                    <button class="btn btn-primary" onclick="searchEntity()">Search</button>
                </div>
                <div id="entity-detail">
                    <div class="empty-state" style="padding: 20px;">
                        <p>Enter an entity ID to view their SHAP explanation</p>
                    </div>
                </div>
            </div>

            <!-- Paginated Entity List -->
            <div class="card animate-in stagger-3">
                <div class="card-header">
                    <div>
                        <div class="card-title">Entity Explanations</div>
                        <div class="card-subtitle">Top 3 SHAP factors per prediction</div>
                    </div>
                </div>
                <div id="entity-list">
                    <div class="empty-state" style="padding: 20px;">
                        <p>Run pipeline to generate SHAP explanations</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    loadExplainabilityData(api);
}

async function loadExplainabilityData(api) {
    try {
        const data = await api.get('/explainability?page=1&page_size=20');

        if (data.global_importance && data.global_importance.length > 0) {
            renderGlobalImportance(data.global_importance);
        }

        if (data.entities && data.entities.length > 0) {
            renderEntityList(data.entities, data.pagination);
        }
    } catch (e) {
        // Pipeline not run
    }
}

function renderGlobalImportance(importance) {
    const container = document.getElementById('global-importance');
    if (!container || importance.length === 0) return;

    const top = importance.slice(0, 15);
    const maxVal = top[0]?.importance || 1;
    const barH = 26;
    const gap = 6;
    const labelW = 220;
    const chartW = 350;
    const svgH = top.length * (barH + gap) + 10;

    let svg = `<svg viewBox="0 0 ${labelW + chartW + 80} ${svgH}" width="100%" preserveAspectRatio="xMinYMin meet">`;

    // Gradient definition
    svg += `
        <defs>
            <linearGradient id="impGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#3b82f6"/>
                <stop offset="100%" stop-color="#8b5cf6"/>
            </linearGradient>
        </defs>
    `;

    top.forEach((feat, i) => {
        const y = i * (barH + gap) + 5;
        const barW = (feat.importance / maxVal) * chartW;

        // Label
        const label = feat.feature.length > 28 ? feat.feature.substring(0, 28) + '…' : feat.feature;
        svg += `<text x="${labelW - 10}" y="${y + barH/2 + 4}" text-anchor="end" fill="var(--text-secondary)" font-size="11" font-family="Inter, sans-serif">${label}</text>`;

        // Bar
        const opacity = 1 - (i * 0.04);
        svg += `<rect x="${labelW}" y="${y}" width="${Math.max(barW, 3)}" height="${barH}" rx="4" fill="url(#impGrad)" opacity="${opacity}"/>`;

        // Value
        svg += `<text x="${labelW + barW + 8}" y="${y + barH/2 + 4}" fill="var(--text-primary)" font-size="11" font-weight="600" font-family="Inter, sans-serif">${feat.importance.toFixed(4)}</text>`;

        // Rank
        svg += `<text x="8" y="${y + barH/2 + 4}" fill="var(--text-tertiary)" font-size="10" font-family="Inter, sans-serif">#${i+1}</text>`;
    });

    svg += '</svg>';
    container.innerHTML = svg;
}

function renderEntityList(entities, pagination) {
    const container = document.getElementById('entity-list');
    if (!container) return;

    let html = '<div class="table-container"><table><thead><tr><th>Entity</th><th>Factor 1</th><th>Factor 2</th><th>Factor 3</th></tr></thead><tbody>';

    entities.forEach(entity => {
        const factors = entity.top_features || [];

        html += `<tr>`;
        html += `<td><strong>STU-${String(entity.entity_index).padStart(5, '0')}</strong></td>`;

        for (let i = 0; i < 3; i++) {
            if (factors[i]) {
                const f = factors[i];
                const color = f.shap_value > 0 ? 'var(--accent-coral)' : 'var(--accent-emerald)';
                const arrow = f.shap_value > 0 ? '↑' : '↓';
                html += `<td>
                    <span style="color: ${color}; font-weight: 600; font-size: 0.78rem;">
                        ${arrow} ${f.feature}
                    </span>
                    <br/>
                    <span style="font-size: 0.7rem; color: var(--text-tertiary);">SHAP: ${f.shap_value.toFixed(4)}</span>
                </td>`;
            } else {
                html += '<td>—</td>';
            }
        }

        html += '</tr>';
    });

    html += '</tbody></table></div>';

    // Pagination
    if (pagination) {
        html += `
            <div class="pagination">
                <button ${pagination.page <= 1 ? 'disabled' : ''} onclick="loadEntityPage(${pagination.page - 1})">← Prev</button>
                <span class="page-info">Page ${pagination.page} of ${pagination.total_pages}</span>
                <button ${pagination.page >= pagination.total_pages ? 'disabled' : ''} onclick="loadEntityPage(${pagination.page + 1})">Next →</button>
            </div>
        `;
    }

    container.innerHTML = html;
}

window.loadEntityPage = async function(page) {
    try {
        const data = await window.fairlensAPI.get(`/explainability?page=${page}&page_size=20`);
        renderEntityList(data.entities, data.pagination);
    } catch (e) {}
};

window.searchEntity = async function() {
    const input = document.getElementById('entity-search');
    const container = document.getElementById('entity-detail');
    if (!input || !container) return;

    const id = input.value.trim();
    if (!id) return;

    try {
        const data = await window.fairlensAPI.get(`/explainability/${id}`);

        const riskClass = data.risk_score > 0.7 ? 'risk-high' : data.risk_score >= 0.4 ? 'risk-medium' : 'risk-low';
        const tierBadge = `badge-${(data.intervention_tier || 'low').toLowerCase()}`;

        let html = `
            <div style="display: grid; grid-template-columns: 200px 1fr; gap: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md);">
                <div style="text-align: center;">
                    <div style="margin-bottom: 8px;">
                        <svg width="120" height="120" viewBox="0 0 120 120">
                            <circle cx="60" cy="60" r="50" stroke="rgba(255,255,255,0.05)" stroke-width="8" fill="none"/>
                            <circle cx="60" cy="60" r="50" 
                                    stroke="${data.risk_score > 0.7 ? '#f43f5e' : data.risk_score >= 0.4 ? '#f59e0b' : '#10b981'}" 
                                    stroke-width="8" fill="none"
                                    stroke-dasharray="${data.risk_score * 314} 314"
                                    stroke-linecap="round"
                                    transform="rotate(-90 60 60)"/>
                            <text x="60" y="56" text-anchor="middle" fill="var(--text-primary)" font-size="24" font-weight="800" font-family="Inter, sans-serif">${(data.risk_score * 100).toFixed(0)}%</text>
                            <text x="60" y="72" text-anchor="middle" fill="var(--text-tertiary)" font-size="10" font-family="Inter, sans-serif">RISK</text>
                        </svg>
                    </div>
                    <span class="badge ${tierBadge}">${data.intervention_tier || 'Unknown'}</span>
                </div>
                <div>
                    <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 4px;">${data.entity_id}</h3>
                    <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px;">${data.reason_text || 'No explanation available'}</p>
                    <div style="font-size: 0.78rem; color: var(--text-tertiary);">
                        <span>Bias Flag: ${data.bias_flag ? '<span class="badge badge-bias">Flagged</span>' : '<span class="badge badge-ok">OK</span>'}</span>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;

    } catch (e) {
        container.innerHTML = `<div style="padding: 12px; color: var(--accent-coral); font-size: 0.85rem;">Entity not found: ${id}</div>`;
    }
};
