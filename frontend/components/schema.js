/**
 * Schema Analyzer Component
 * Display AI-detected column classifications
 */

export async function renderSchema(container, api) {
    container.innerHTML = `
        <div class="animate-in">
            <div class="section-header">
                <div class="section-title">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" stroke-width="2">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                    </svg>
                    AI Schema Analyzer
                </div>
                <span class="badge badge-info">Phase 1 + Phase 2</span>
            </div>

            <!-- Target & Summary -->
            <div class="metrics-grid" id="schema-metrics">
                <div class="metric-card animate-in stagger-1">
                    <div class="metric-icon cyan">🎯</div>
                    <div class="metric-value" id="s-target">—</div>
                    <div class="metric-label">Target Column</div>
                </div>
                <div class="metric-card animate-in stagger-2">
                    <div class="metric-icon purple">🔒</div>
                    <div class="metric-value" id="s-sensitive">—</div>
                    <div class="metric-label">Sensitive Attributes</div>
                </div>
                <div class="metric-card animate-in stagger-3">
                    <div class="metric-icon blue">📊</div>
                    <div class="metric-value" id="s-total">—</div>
                    <div class="metric-label">Total Columns</div>
                </div>
                <div class="metric-card animate-in stagger-4">
                    <div class="metric-icon amber">🤖</div>
                    <div class="metric-value" id="s-ambiguous">—</div>
                    <div class="metric-label">LLM-Resolved</div>
                </div>
            </div>

            <!-- Sensitive Attributes Detail -->
            <div class="card animate-in stagger-3" style="margin-bottom: 24px;">
                <div class="card-header">
                    <div class="card-title">🔒 Detected Sensitive Attributes</div>
                    <span class="badge badge-bias">Fairness Audit Required</span>
                </div>
                <div id="sensitive-list">
                    <div class="empty-state" style="padding: 20px;">
                        <p>Run pipeline to detect sensitive attributes</p>
                    </div>
                </div>
            </div>

            <!-- Feature Groups Grid -->
            <div class="card-header" style="margin-bottom: 16px;">
                <div class="card-title">📂 Feature Groups</div>
            </div>
            <div class="schema-grid" id="feature-groups">
                <div class="empty-state" style="padding: 40px 20px;">
                    <p>Run pipeline to see feature groups</p>
                </div>
            </div>
        </div>
    `;

    loadSchemaData(api);
}

async function loadSchemaData(api) {
    try {
        const schema = await api.get('/schema');

        // Metrics
        document.getElementById('s-target').textContent = schema.target_column || '—';
        document.getElementById('s-target').style.fontSize = '1rem';
        document.getElementById('s-sensitive').textContent = schema.total_sensitive || 0;
        document.getElementById('s-total').textContent = schema.total_columns || 0;
        document.getElementById('s-ambiguous').textContent = (schema.ambiguous_columns || []).length;

        // Sensitive attributes
        renderSensitiveList(schema.sensitive_attributes || []);

        // Feature groups
        renderFeatureGroups(schema.feature_groups || {});

    } catch (e) {
        // Pipeline not run yet
    }
}

function renderSensitiveList(attributes) {
    const container = document.getElementById('sensitive-list');
    if (!container || attributes.length === 0) return;

    const typeColors = {
        gender: '#ec4899',
        socioeconomic: '#f59e0b',
        race_ethnicity: '#f43f5e',
        age: '#06b6d4',
        marital_status: '#8b5cf6',
        disability: '#10b981',
        religion: '#6366f1'
    };

    let html = '<div class="table-container"><table><thead><tr><th>Column</th><th>Type</th><th>Confidence</th><th>Action</th></tr></thead><tbody>';

    attributes.forEach(attr => {
        const color = typeColors[attr.type] || '#3b82f6';
        html += `
            <tr>
                <td><strong>${attr.column}</strong></td>
                <td><span class="badge badge-sensitive" style="border-color: ${color}30; color: ${color}; background: ${color}15;">${attr.type.replace('_', ' ')}</span></td>
                <td><span class="badge badge-info">${attr.confidence}</span></td>
                <td style="color: var(--text-tertiary); font-size: 0.78rem;">Include in fairness audit</td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function renderFeatureGroups(groups) {
    const container = document.getElementById('feature-groups');
    if (!container) return;

    const groupConfig = {
        demographic: { color: '#8b5cf6', icon: '👥' },
        financial: { color: '#f59e0b', icon: '💰' },
        temporal: { color: '#06b6d4', icon: '📅' },
        categorical: { color: '#3b82f6', icon: '🏷️' },
        numerical: { color: '#10b981', icon: '🔢' },
        identifier: { color: '#64748b', icon: '🔑' },
        behavioral: { color: '#ec4899', icon: '📈' },
        academic: { color: '#f97316', icon: '🎓' }
    };

    const entries = Object.entries(groups).filter(([_, cols]) => cols.length > 0);

    if (entries.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No feature groups detected</p></div>';
        return;
    }

    let html = '';
    entries.forEach(([group, cols]) => {
        const cfg = groupConfig[group] || { color: '#64748b', icon: '📋' };

        html += `
            <div class="schema-card">
                <div class="group-name">
                    <span class="group-dot" style="background: ${cfg.color};"></span>
                    ${cfg.icon} ${group} (${cols.length})
                </div>
                <ul class="feature-list">
                    ${cols.map(c => `<li class="feature-item">${c}</li>`).join('')}
                </ul>
            </div>
        `;
    });

    container.innerHTML = html;
}
