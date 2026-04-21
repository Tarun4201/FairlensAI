/**
 * Fairness Audit Component
 * DPD/EOD visualizations, bias flag distribution, detailed metrics
 */

export async function renderFairness(container, api) {
    container.innerHTML = `
        <div class="animate-in">
            <div class="section-header">
                <div class="section-title">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" stroke-width="2">
                        <path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17"/>
                        <path d="M12 21V9"/>
                        <path d="M1 9l11 6 11-6"/>
                    </svg>
                    Fairness Audit
                </div>
                <span class="badge badge-bias">CORE REQUIREMENT</span>
            </div>

            <!-- Summary Metrics -->
            <div class="metrics-grid" id="fairness-metrics">
                <div class="metric-card coral animate-in stagger-1">
                    <div class="metric-icon coral">⚖️</div>
                    <div class="metric-value" id="f-threshold">0.05</div>
                    <div class="metric-label">Bias Threshold</div>
                </div>
                <div class="metric-card coral animate-in stagger-2">
                    <div class="metric-icon coral">🚨</div>
                    <div class="metric-value" id="f-breaches">—</div>
                    <div class="metric-label">Total Breaches</div>
                </div>
                <div class="metric-card amber animate-in stagger-3">
                    <div class="metric-icon amber">👥</div>
                    <div class="metric-value" id="f-flagged">—</div>
                    <div class="metric-label">Entities Flagged</div>
                </div>
                <div class="metric-card animate-in stagger-4">
                    <div class="metric-icon blue">📊</div>
                    <div class="metric-value" id="f-total">—</div>
                    <div class="metric-label">Entities Total</div>
                </div>
            </div>

            <!-- Simplified Fairness Overview -->
            <div class="grid-2" style="margin-bottom: 24px;">
                <div class="card animate-in stagger-2">
                    <div class="card-header">
                        <div>
                            <div class="card-title">Prediction Fairness</div>
                            <div class="card-subtitle">Are all groups treated equally by the AI?</div>
                        </div>
                    </div>
                    <div id="dpd-chart" class="chart-container" style="min-height: 200px;">
                        <div class="empty-state" style="padding: 20px;"><p>Run pipeline to check fairness</p></div>
                    </div>
                </div>
                <div class="card animate-in stagger-3">
                    <div class="card-header">
                        <div>
                            <div class="card-title">Identification Fairness</div>
                            <div class="card-subtitle">Are all at-risk students found at the same rate?</div>
                        </div>
                    </div>
                    <div id="eod-chart" class="chart-container" style="min-height: 200px;">
                        <div class="empty-state" style="padding: 20px;"><p>Run pipeline to check fairness</p></div>
                    </div>
                </div>
            </div>

            <!-- Detailed Audit Table -->
            <div class="card animate-in stagger-4">
                <div class="card-header">
                    <div>
                        <div class="card-title">Detailed Audit Results</div>
                        <div class="card-subtitle">All disparities reported — findings are NEVER suppressed</div>
                    </div>
                    <span class="badge badge-ok">All Findings Reported ✓</span>
                </div>
                <div id="audit-table">
                    <div class="empty-state" style="padding: 20px;">
                        <p>Run pipeline to generate audit results</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    loadFairnessData(api);
}

async function loadFairnessData(api) {
    try {
        const data = await api.get('/fairness');

        // Metrics
        document.getElementById('f-breaches').textContent = data.total_breaches;
        document.getElementById('f-flagged').textContent = data.entities_flagged?.toLocaleString() || '0';
        document.getElementById('f-total').textContent = data.entities_total?.toLocaleString() || '0';

        const auditResults = data.audit_results || {};
        const attributes = Object.keys(auditResults);

        if (attributes.length > 0) {
            renderDPDChart(auditResults, data.threshold);
            renderEODChart(auditResults, data.threshold);
            renderAuditTable(auditResults, data.threshold);
        }

    } catch (e) {
        // Pipeline not run
    }
}

function renderDPDChart(auditResults, threshold) {
    renderSimpleChart('dpd-chart', auditResults, 'dpd', threshold);
}

function renderEODChart(auditResults, threshold) {
    renderSimpleChart('eod-chart', auditResults, 'eod', threshold);
}

function renderSimpleChart(containerId, auditResults, type, threshold) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
    Object.entries(auditResults).forEach(([attr, result]) => {
        const val = result[type][type];
        const isFlagged = val >= threshold;
        const color = isFlagged ? 'var(--accent-coral)' : 'var(--accent-emerald)';
        const icon = isFlagged ? '🚨' : '✅';
        const msg = isFlagged ? 'Bias Warning' : 'Fair and Equal';
        
        html += `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px; background: #f8fafc; border-radius: var(--radius-sm); border-left: 4px solid ${color}; transition: transform 0.2s ease;">
                <div style="display: flex; flex-direction: column;">
                    <strong style="font-size:1.1rem;">${attr}</strong>
                    <span style="font-size:0.85rem; color:var(--text-secondary);">Disparity: <span style="font-weight:600;">${(val * 100).toFixed(1)}%</span></span>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="color: ${color}; font-weight:700; font-family:var(--font-display);">${msg}</span>
                    <span style="font-size:1.4rem;">${icon}</span>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function renderAuditTable(auditResults, threshold) {
    const container = document.getElementById('audit-table');
    if (!container) return;

    let html = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Attribute</th>
                        <th>Type</th>
                        <th>Groups</th>
                        <th>Prediction Disparity</th>
                        <th>Identification Disparity</th>
                        <th>Prediction Health</th>
                        <th>Identification Health</th>
                    </tr>
                </thead>
                <tbody>
    `;

    Object.entries(auditResults).forEach(([attr, result]) => {
        const dpdFlagged = result.dpd.dpd >= threshold;
        const eodFlagged = result.eod.dpd >= threshold;

        html += `
            <tr>
                <td><strong>${attr}</strong></td>
                <td><span class="badge badge-sensitive">${result.attribute_type}</span></td>
                <td>${result.n_groups}</td>
                <td style="font-weight: 700; font-variant-numeric: tabular-nums; color: ${dpdFlagged ? 'var(--accent-coral)' : 'var(--accent-emerald)'};">${result.dpd.dpd.toFixed(4)}</td>
                <td style="font-weight: 700; font-variant-numeric: tabular-nums; color: ${result.eod.eod >= threshold ? 'var(--accent-coral)' : 'var(--accent-emerald)'};">${result.eod.eod.toFixed(4)}</td>
                <td>${dpdFlagged ? '<span class="badge badge-bias">🚨 Breach</span>' : '<span class="badge badge-ok">✅ OK</span>'}</td>
                <td>${result.eod.eod >= threshold ? '<span class="badge badge-bias">🚨 Breach</span>' : '<span class="badge badge-ok">✅ OK</span>'}</td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}
