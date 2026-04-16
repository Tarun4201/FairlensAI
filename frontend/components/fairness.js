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

            <!-- DPD / EOD Charts -->
            <div class="grid-2" style="margin-bottom: 24px;">
                <div class="card animate-in stagger-2">
                    <div class="card-header">
                        <div>
                            <div class="card-title">Demographic Parity Difference (DPD)</div>
                            <div class="card-subtitle">Difference in positive prediction rates across groups</div>
                        </div>
                    </div>
                    <div id="dpd-chart" class="chart-container" style="min-height: 200px;">
                        <div class="empty-state" style="padding: 20px;"><p>Run pipeline to see DPD metrics</p></div>
                    </div>
                </div>
                <div class="card animate-in stagger-3">
                    <div class="card-header">
                        <div>
                            <div class="card-title">Equal Opportunity Difference (EOD)</div>
                            <div class="card-subtitle">Difference in true positive rates across groups</div>
                        </div>
                    </div>
                    <div id="eod-chart" class="chart-container" style="min-height: 200px;">
                        <div class="empty-state" style="padding: 20px;"><p>Run pipeline to see EOD metrics</p></div>
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
    const container = document.getElementById('dpd-chart');
    if (!container) return;

    const entries = Object.entries(auditResults);
    const barH = 32;
    const gap = 12;
    const labelW = 160;
    const chartW = 400;
    const maxVal = Math.max(...entries.map(([_, r]) => r.dpd.dpd), threshold * 2, 0.15);
    const svgH = entries.length * (barH + gap) + 30;

    let svg = `<svg viewBox="0 0 ${chartW + labelW + 80} ${svgH}" width="100%" preserveAspectRatio="xMinYMin meet">`;

    entries.forEach(([attr, result], i) => {
        const y = i * (barH + gap) + 10;
        const dpd = result.dpd.dpd;
        const barW = (dpd / maxVal) * chartW;
        const color = dpd >= threshold ? '#f43f5e' : '#10b981';

        // Label
        const label = attr.length > 20 ? attr.substring(0, 20) + '…' : attr;
        svg += `<text x="${labelW - 10}" y="${y + barH/2 + 4}" text-anchor="end" fill="var(--text-secondary)" font-size="11" font-family="Inter, sans-serif">${label}</text>`;

        // Bar
        svg += `<rect x="${labelW}" y="${y}" width="${Math.max(barW, 2)}" height="${barH}" rx="4" fill="${color}" opacity="0.8"/>`;

        // Value
        svg += `<text x="${labelW + barW + 8}" y="${y + barH/2 + 4}" fill="var(--text-primary)" font-size="12" font-weight="600" font-family="Inter, sans-serif">${dpd.toFixed(4)}</text>`;

        // Flag
        if (dpd >= threshold) {
            svg += `<text x="${labelW + barW + 68}" y="${y + barH/2 + 4}" fill="#f43f5e" font-size="11" font-weight="600" font-family="Inter, sans-serif">🚨 FLAGGED</text>`;
        }
    });

    // Threshold line
    const threshX = labelW + (threshold / maxVal) * chartW;
    svg += `<line x1="${threshX}" y1="0" x2="${threshX}" y2="${svgH}" class="threshold-line"/>`;
    svg += `<text x="${threshX}" y="${svgH - 2}" text-anchor="middle" fill="#f43f5e" font-size="9" font-family="Inter, sans-serif">THRESHOLD (${threshold})</text>`;

    svg += '</svg>';
    container.innerHTML = svg;
}

function renderEODChart(auditResults, threshold) {
    const container = document.getElementById('eod-chart');
    if (!container) return;

    const entries = Object.entries(auditResults);
    const barH = 32;
    const gap = 12;
    const labelW = 160;
    const chartW = 400;
    const maxVal = Math.max(...entries.map(([_, r]) => r.eod.eod), threshold * 2, 0.15);
    const svgH = entries.length * (barH + gap) + 30;

    let svg = `<svg viewBox="0 0 ${chartW + labelW + 80} ${svgH}" width="100%" preserveAspectRatio="xMinYMin meet">`;

    entries.forEach(([attr, result], i) => {
        const y = i * (barH + gap) + 10;
        const eod = result.eod.eod;
        const barW = (eod / maxVal) * chartW;
        const color = eod >= threshold ? '#f43f5e' : '#10b981';

        const label = attr.length > 20 ? attr.substring(0, 20) + '…' : attr;
        svg += `<text x="${labelW - 10}" y="${y + barH/2 + 4}" text-anchor="end" fill="var(--text-secondary)" font-size="11" font-family="Inter, sans-serif">${label}</text>`;
        svg += `<rect x="${labelW}" y="${y}" width="${Math.max(barW, 2)}" height="${barH}" rx="4" fill="${color}" opacity="0.8"/>`;
        svg += `<text x="${labelW + barW + 8}" y="${y + barH/2 + 4}" fill="var(--text-primary)" font-size="12" font-weight="600" font-family="Inter, sans-serif">${eod.toFixed(4)}</text>`;

        if (eod >= threshold) {
            svg += `<text x="${labelW + barW + 68}" y="${y + barH/2 + 4}" fill="#f43f5e" font-size="11" font-weight="600" font-family="Inter, sans-serif">🚨 FLAGGED</text>`;
        }
    });

    const threshX = labelW + (threshold / maxVal) * chartW;
    svg += `<line x1="${threshX}" y1="0" x2="${threshX}" y2="${svgH}" class="threshold-line"/>`;
    svg += `<text x="${threshX}" y="${svgH - 2}" text-anchor="middle" fill="#f43f5e" font-size="9" font-family="Inter, sans-serif">THRESHOLD (${threshold})</text>`;

    svg += '</svg>';
    container.innerHTML = svg;
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
                        <th>DPD</th>
                        <th>EOD</th>
                        <th>DPD Status</th>
                        <th>EOD Status</th>
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
