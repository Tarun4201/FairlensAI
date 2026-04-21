/**
 * FairLens AI — Main Application
 * SPA Router + API Client + Component Manager
 */

// ── API Client ──────────────────────────────────────────────────
const API_BASE = window.location.origin + '/api';

const api = {
    async get(endpoint) {
        try {
            const res = await fetch(`${API_BASE}${endpoint}`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || `HTTP ${res.status}`);
            }
            return await res.json();
        } catch (e) {
            console.warn(`API GET ${endpoint}:`, e.message);
            throw e;
        }
    },
    async post(endpoint, body = {}) {
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || `HTTP ${res.status}`);
            }
            return await res.json();
        } catch (e) {
            console.warn(`API POST ${endpoint}:`, e.message);
            throw e;
        }
    }
};

// ── Component Imports ───────────────────────────────────────────
import { renderHome } from './components/home.js';
import { renderDashboard } from './components/dashboard.js';
import { renderPipeline } from './components/pipeline.js';
import { renderSchema } from './components/schema.js';
import { renderFairness } from './components/fairness.js';
import { renderExplainability } from './components/explainability.js';
import { renderWhatIf } from './components/whatif.js';

// ── State ───────────────────────────────────────────────────────
let currentTab = 'home';
let pollingInterval = null;
let pipelineStatus = 'idle';

// ── Tab Configuration ───────────────────────────────────────────
const TABS = {
    home: { title: 'Home', render: renderHome },
    dashboard: { title: 'Dashboard', render: renderDashboard },
    pipeline: { title: 'Pipeline', render: renderPipeline },
    schema: { title: 'Data Quality', render: renderSchema },
    fairness: { title: 'Fairness Check', render: renderFairness },
    explainability: { title: 'AI Decision Factors', render: renderExplainability },
    whatif: { title: 'Simulator', render: renderWhatIf }
};

// ── Router ──────────────────────────────────────────────────────
function navigateTo(tab) {
    if (!TABS[tab]) return;

    currentTab = tab;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tab);
    });

    // Update title
    document.getElementById('page-title').textContent = TABS[tab].title;

    // Render content
    const area = document.getElementById('content-area');
    area.innerHTML = '';

    try {
        TABS[tab].render(area, api);
    } catch (e) {
        console.error(`Error rendering ${tab}:`, e);
        area.innerHTML = `
            <div class="empty-state">
                <h3>Error loading view</h3>
                <p>${e.message}</p>
            </div>
        `;
    }

    // Update URL hash
    window.location.hash = tab;
}

// ── Pipeline Status Polling ─────────────────────────────────────
async function pollPipelineStatus() {
    try {
        const status = await api.get('/pipeline/status');
        updateStatusUI(status);
        pipelineStatus = status.status;

        // Stop polling if complete or error
        if (status.status === 'complete' || status.status === 'error') {
            stopPolling();
            // Refresh current view
            if (currentTab !== 'pipeline') {
                navigateTo(currentTab);
            }
        }
    } catch (e) {
        // API not ready yet — that's fine
    }
}

function startPolling() {
    if (pollingInterval) return;
    pollingInterval = setInterval(pollPipelineStatus, 1500);
    pollPipelineStatus();
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

function updateStatusUI(status) {
    const badge = document.getElementById('pipeline-badge');
    const sidebarStatus = document.getElementById('sidebar-status');

    if (!badge) return;

    const dot = badge.querySelector('.status-dot');
    const text = badge.querySelector('.status-text');

    // Remove all status classes
    dot.className = 'status-dot ' + status.status;

    const labels = {
        idle: 'Idle',
        running: `Running (${status.progress}%)`,
        complete: 'Complete',
        error: 'Error'
    };
    text.textContent = labels[status.status] || status.status;

    // Update sidebar status
    if (sidebarStatus) {
        const sDot = sidebarStatus.querySelector('.status-dot');
        const sText = sidebarStatus.querySelector('span:last-child');
        sDot.className = 'status-dot ' + status.status;
        sText.textContent = status.current_layer || labels[status.status] || 'Pipeline Idle';
    }
}

// ── Global function for components to use ───────────────────────
window.fairlensAPI = api;
window.fairlensNavigate = navigateTo;
window.fairlensStartPolling = startPolling;
window.fairlensPipelineStatus = () => pipelineStatus;

// ── Init ────────────────────────────────────────────────────────
function init() {
    // Nav click handlers
    document.querySelectorAll('.nav-item').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(el.dataset.tab);
        });
    });

    // Sidebar toggle (mobile)
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    if (toggle && sidebar) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    // Route from hash
    const hash = window.location.hash.replace('#', '') || 'home';
    navigateTo(hash);

    // Check initial pipeline status
    pollPipelineStatus();

    // Hash change
    window.addEventListener('hashchange', () => {
        const tab = window.location.hash.replace('#', '') || 'home';
        if (tab !== currentTab) navigateTo(tab);
    });
}

document.addEventListener('DOMContentLoaded', init);
