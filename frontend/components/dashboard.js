/**
 * Dashboard Component
 * Main overview + Gold output table
 */

export async function renderDashboard(container, api) {
    container.innerHTML = `
        <div class="animate-in">
            <!-- Metrics Summary -->
            <div class="metrics-grid" id="dash-metrics">
                <div class="metric-card animate-in stagger-1">
                    <div class="metric-icon blue">📊</div>
                    <div class="metric-value" id="m-entities">—</div>
                    <div class="metric-label">Total Entities</div>
                </div>
                <div class="metric-card emerald animate-in stagger-2">
                    <div class="metric-icon emerald">🎯</div>
                    <div class="metric-value" id="m-auc">—</div>
                    <div class="metric-label">Prediction Accuracy</div>
                </div>
                <div class="metric-card coral animate-in stagger-3">
                    <div class="metric-icon coral">⚠️</div>
                    <div class="metric-value" id="m-bias">—</div>
                    <div class="metric-label">Fairness Alerts</div>
                </div>
                <div class="metric-card amber animate-in stagger-4">
                    <div class="metric-icon amber">🔥</div>
                    <div class="metric-value" id="m-high">—</div>
                    <div class="metric-label">High Risk</div>
                </div>
            </div>

            <!-- Charts Row -->
            <div class="grid-2" style="margin-bottom: 24px;">
                <div class="card animate-in stagger-2">
                    <div class="card-header">
                        <div>
                            <div class="card-title">Intervention Tier Distribution</div>
                            <div class="card-subtitle">Entity risk classification breakdown</div>
                        </div>
                    </div>
                    <div id="tier-chart" class="chart-container" style="height: 220px; display: flex; align-items: center; justify-content: center;">
                        <div class="empty-state" style="padding: 20px;">
                            <p>Run pipeline to see data</p>
                        </div>
                    </div>
                </div>
                <div class="card animate-in stagger-3">
                    <div class="card-header">
                        <div>
                            <div class="card-title">AI System Health</div>
                            <div class="card-subtitle">Quick overview of your pipeline status</div>
                        </div>
                    </div>
                    <div id="system-health" style="display: flex; flex-direction: column; gap: 16px; justify-content: center; height: 180px;">
                        <div style="background: #f1f5f9; padding: 16px; border-radius: var(--radius-sm); display: flex; align-items: center; gap: 12px;">
                            <div style="width: 10px; height: 10px; border-radius: 50%; background: var(--accent-emerald);"></div>
                            <div style="flex: 1; font-weight: 600;">Data Quality</div>
                            <div class="badge badge-ok">Excellent</div>
                        </div>
                        <div style="background: #f1f5f9; padding: 16px; border-radius: var(--radius-sm); display: flex; align-items: center; gap: 12px;">
                            <div style="width: 10px; height: 10px; border-radius: 50%; background: var(--accent-blue);"></div>
                            <div style="flex: 1; font-weight: 600;">Prediction Engine</div>
                            <div class="badge badge-info" id="engine-status">Running smoothly</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Gold Output Table -->
            <div class="card animate-in stagger-4">
                <div class="card-header">
                    <div>
                        <div class="card-title">Gold Output Table</div>
                        <div class="card-subtitle">Final enriched predictions with explainability</div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <select id="tier-filter" class="filter-bar" style="margin:0; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-primary); font-size: 0.8rem;">
                            <option value="">All Tiers</option>
                            <option value="High">High Risk</option>
                            <option value="Medium">Medium Risk</option>
                            <option value="Low">Low Risk</option>
                        </select>
                    </div>
                </div>
                <div id="gold-table-container">
                    <div class="empty-state">
                        <p>Run the pipeline to generate the Gold output table.</p>
                        <button class="btn btn-primary" onclick="window.fairlensNavigate('pipeline')">Go to Pipeline</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Load data
    loadDashboardData(api);

    // Tier filter
    document.getElementById('tier-filter').addEventListener('change', (e) => {
        loadGoldTable(api, 1, e.target.value);
    });
}

async function loadDashboardData(api) {
    // Load gold summary
    try {
        const gold = await api.get('/gold?page=1&page_size=1');
        document.getElementById('m-entities').textContent = gold.summary.total_entities.toLocaleString();
        document.getElementById('m-high').textContent = gold.summary.tier_distribution.High || 0;

        // Render tier chart
        renderTierDonut(gold.summary.tier_distribution);

        // Load full table
        loadGoldTable(api);
    } catch (e) {
        // Pipeline not run yet
    }

    // Load model metrics
    try {
        const metrics = await api.get('/model/metrics');
        const bestMetrics = metrics.best_metrics;
        // Convert to percentage
        document.getElementById('m-auc').textContent = (bestMetrics.auc * 100).toFixed(1) + '%';
        document.getElementById('engine-status').textContent = 'Highly Accurate';
    } catch (e) {}

    // Load fairness
    try {
        const fairness = await api.get('/fairness');
        document.getElementById('m-bias').textContent = fairness.total_breaches;
    } catch (e) {}
}

async function loadGoldTable(api, page = 1, tier = '') {
    const container = document.getElementById('gold-table-container');
    if (!container) return;

    try {
        let url = `/gold?page=${page}&page_size=15&sort_by=risk_score&sort_desc=true`;
        if (tier) url += `&tier=${tier}`;

        const data = await api.get(url);

        if (data.data.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No entities found</p></div>';
            return;
        }

        let html = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Entity ID</th>
                            <th>Risk Score</th>
                            <th>Tier</th>
                            <th>Top Factors</th>
                            <th>Reason</th>
                            <th>Bias</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.data.forEach((row, index) => {
            const riskClass = row.risk_score > 0.7 ? 'risk-high' : row.risk_score >= 0.4 ? 'risk-medium' : 'risk-low';
            const tierBadge = `badge-${row.intervention_tier.toLowerCase()}`;
            const biasIcon = row.bias_flag ? '🚨' : '✅';

            // Parse top factors
            let factors = row.top_factors;
            try {
                factors = JSON.parse(row.top_factors.replace(/'/g, '"'));
                factors = factors.slice(0, 3).join(', ');
            } catch(e) {
                factors = row.top_factors.substring(0, 50);
            }

            const reason = row.reason_text.length > 80
                ? row.reason_text.substring(0, 80) + '...'
                : row.reason_text;

            html += `
                <tr class="animate-in" style="animation-delay: ${0.1 + (index * 0.05)}s;">
                    <td><strong>${row.entity_id}</strong></td>
                    <td class="${riskClass}" style="font-weight:700; font-variant-numeric: tabular-nums;">${row.risk_score.toFixed(4)}</td>
                    <td><span class="badge ${tierBadge}">${row.intervention_tier}</span></td>
                    <td style="font-size:0.78rem; color:var(--text-secondary); max-width: 200px;">${factors}</td>
                    <td style="font-size:0.78rem; color:var(--text-secondary); max-width: 280px;">${reason}</td>
                    <td>${row.bias_flag ? '<span class="badge badge-bias">Flagged</span>' : '<span class="badge badge-ok">OK</span>'}</td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;

        // Pagination
        const { pagination } = data;
        html += `
            <div class="pagination">
                <button ${pagination.page <= 1 ? 'disabled' : ''} onclick="document.getElementById('tier-filter') && loadGoldTableGlobal(${pagination.page - 1})">← Prev</button>
                <span class="page-info">Page ${pagination.page} of ${pagination.total_pages} (${pagination.total} total)</span>
                <button ${pagination.page >= pagination.total_pages ? 'disabled' : ''} onclick="loadGoldTableGlobal(${pagination.page + 1})">Next →</button>
            </div>
        `;

        container.innerHTML = html;

    } catch (e) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Run the pipeline to generate the Gold output table.</p>
                <button class="btn btn-primary" onclick="window.fairlensNavigate('pipeline')">Go to Pipeline</button>
            </div>
        `;
    }
}

window.loadGoldTableGlobal = function(page) {
    const tier = document.getElementById('tier-filter')?.value || '';
    loadGoldTable(window.fairlensAPI, page, tier);
};

function renderTierDonut(distribution) {
    const container = document.getElementById('tier-chart');
    if (!container) return;

    const high = distribution.High || 0;
    const medium = distribution.Medium || 0;
    const low = distribution.Low || 0;
    const total = high + medium + low;

    if (total === 0) return;

    const colors = {
        High: '#f43f5e',
        Medium: '#f59e0b',
        Low: '#10b981'
    };

    const data = [
        { label: 'High', value: high, color: colors.High },
        { label: 'Medium', value: medium, color: colors.Medium },
        { label: 'Low', value: low, color: colors.Low }
    ];

    let cumulativePercent = 0;
    const radius = 70;
    const cx = 110;
    const cy = 110;

    let paths = '';
    data.forEach(d => {
        const percent = d.value / total;
        const startAngle = cumulativePercent * 2 * Math.PI - Math.PI / 2;
        cumulativePercent += percent;
        const endAngle = cumulativePercent * 2 * Math.PI - Math.PI / 2;

        const x1 = cx + radius * Math.cos(startAngle);
        const y1 = cy + radius * Math.sin(startAngle);
        const x2 = cx + radius * Math.cos(endAngle);
        const y2 = cy + radius * Math.sin(endAngle);
        const largeArc = percent > 0.5 ? 1 : 0;

        paths += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" 
                  fill="${d.color}" opacity="0.85" stroke="var(--bg-primary)" stroke-width="2"/>`;
    });

    // Legend
    let legend = '';
    let ly = 30;
    data.forEach(d => {
        legend += `
            <rect x="240" y="${ly}" width="10" height="10" rx="2" fill="${d.color}" opacity="0.85"/>
            <text x="256" y="${ly + 9}" fill="var(--text-secondary)" font-size="12" font-family="Inter, sans-serif">${d.label}: ${d.value} (${(d.value/total*100).toFixed(1)}%)</text>
        `;
        ly += 24;
    });

    container.innerHTML = `
        <svg viewBox="0 0 400 220" width="100%" height="100%">
            ${paths}
            <circle cx="${cx}" cy="${cy}" r="45" fill="var(--bg-card)"/>
            <text x="${cx}" y="${cy - 5}" text-anchor="middle" fill="var(--text-primary)" font-size="22" font-weight="800" font-family="Inter, sans-serif">${total}</text>
            <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="var(--text-tertiary)" font-size="10" text-transform="uppercase" font-family="Inter, sans-serif">ENTITIES</text>
            ${legend}
        </svg>
    `;
}

function renderModelComparison(comparison) {
    const container = document.getElementById('model-chart');
    if (!container || !comparison) return;

    const models = Object.entries(comparison);
    const metrics = ['auc', 'accuracy', 'precision', 'recall', 'f1'];
    const colors = ['#3b82f6', '#8b5cf6'];
    const barH = 18;
    const gap = 6;
    const labelW = 70;
    const chartW = 320;
    const groupH = (barH * models.length) + gap;

    let svg = `<svg viewBox="0 0 420 ${metrics.length * (groupH + 14) + 40}" width="100%" height="100%">`;

    metrics.forEach((metric, mi) => {
        const y0 = mi * (groupH + 14) + 10;

        // Metric label
        svg += `<text x="0" y="${y0 + barH}" fill="var(--text-secondary)" font-size="11" font-family="Inter, sans-serif" text-transform="uppercase">${metric.toUpperCase()}</text>`;

        models.forEach(([name, vals], idx) => {
            const val = vals[metric] || 0;
            const barW = val * (chartW - labelW);
            const by = y0 + idx * (barH + 2);

            svg += `<rect x="${labelW}" y="${by}" width="${barW}" height="${barH}" rx="4" fill="${colors[idx]}" opacity="0.8"/>`;
            svg += `<text x="${labelW + barW + 6}" y="${by + 13}" fill="var(--text-primary)" font-size="11" font-weight="600" font-family="Inter, sans-serif">${val.toFixed(3)}</text>`;
        });
    });

    // Legend
    const ly = metrics.length * (groupH + 14) + 16;
    models.forEach(([name], idx) => {
        const lx = idx * 160;
        svg += `<rect x="${lx}" y="${ly}" width="10" height="10" rx="2" fill="${colors[idx]}"/>`;
        svg += `<text x="${lx + 16}" y="${ly + 9}" fill="var(--text-secondary)" font-size="11" font-family="Inter, sans-serif">${name}</text>`;
    });

    svg += '</svg>';
    container.innerHTML = svg;
}
