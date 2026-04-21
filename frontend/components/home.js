/**
 * Home — Landing Page
 * Visual explainer of how FairLens AI works + capabilities overview
 */

export function renderHome(container, api) {
    container.innerHTML = `
    <div class="animate-in" style="padding-bottom: 60px;">

        <!-- ── HERO ─────────────────────────────────────────── -->
        <div style="
            background: linear-gradient(135deg, #1e3a8a 0%, #4f46e5 50%, #7c3aed 100%);
            border-radius: 28px;
            padding: 60px 48px;
            margin-bottom: 36px;
            color: white;
            position: relative;
            overflow: hidden;
        ">
            <!-- Background decoration -->
            <div style="position:absolute;top:-80px;right:-80px;width:360px;height:360px;border-radius:50%;background:rgba(255,255,255,0.05);pointer-events:none;"></div>
            <div style="position:absolute;bottom:-60px;left:-60px;width:260px;height:260px;border-radius:50%;background:rgba(255,255,255,0.04);pointer-events:none;"></div>

            <div style="position:relative;z-index:1;">
                <div style="display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,0.15);border-radius:20px;padding:8px 18px;font-size:0.85rem;font-weight:600;margin-bottom:24px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#4ade80;display:inline-block;"></span>
                    AI-Powered · Bias-Aware · Beginner-Friendly
                </div>
                <h1 style="font-family:var(--font-display);font-size:clamp(2rem,4vw,3.2rem);font-weight:900;line-height:1.15;margin:0 0 20px;letter-spacing:-0.03em;">
                    Understand AI Decisions.<br>Trust Them Fairly.
                </h1>
                <p style="font-size:1.1rem;opacity:0.85;max-width:580px;line-height:1.7;margin:0 0 36px;">
                    FairLens AI analyses your data, trains a prediction model, checks it for bias, and explains every single decision in plain English — all in one click.
                </p>
                <div style="display:flex;gap:14px;flex-wrap:wrap;">
                    <button class="btn" onclick="window.fairlensNavigate('pipeline')"
                        style="background:white;color:#2563eb;font-weight:800;font-size:1rem;padding:14px 28px;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,0.15);">
                        ▶ Run the Analysis
                    </button>
                    <button class="btn" onclick="window.fairlensNavigate('dashboard')"
                        style="background:rgba(255,255,255,0.15);color:white;font-weight:700;font-size:1rem;padding:14px 28px;border-radius:14px;border:2px solid rgba(255,255,255,0.3);">
                        📊 View Results
                    </button>
                </div>
            </div>
        </div>

        <!-- ── WHAT WE DO ────────────────────────────────────── -->
        <h2 style="font-family:var(--font-display);font-size:1.8rem;font-weight:800;margin:0 0 8px;letter-spacing:-0.02em;">What FairLens AI Does</h2>
        <p style="color:var(--text-secondary);font-size:1rem;margin:0 0 28px;">Everything you need to understand your AI model — without writing a single line of code.</p>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-bottom:48px;">
            ${[
                { icon:'🔮', color:'#eff6ff', accent:'#2563eb', title:'Smart Predictions', desc:'Upload any dataset and FairLens will automatically build an AI model that predicts which people are at risk.' },
                { icon:'⚖️', color:'#fff1f2', accent:'#e11d48', title:'Fairness Guarantee', desc:'Every model is tested for bias. We check whether the AI treats all groups equally — by age, gender, or any other attribute.' },
                { icon:'💡', color:'#f5f3ff', accent:'#7c3aed', title:'Plain-English Explanations', desc:'No jargon. For every prediction, you see exactly which factors drove the result — in sentences anyone can understand.' },
                { icon:'🎛️', color:'#ecfdf5', accent:'#059669', title:'What-If Simulator', desc:'Curious what would happen if someone\'s age changed, or their grades improved? Adjust any factor and see the prediction update live.' },
            ].map(c => `
                <div style="background:${c.color};border-radius:20px;padding:28px;border:1.5px solid rgba(0,0,0,0.04);transition:transform 0.2s,box-shadow 0.2s;" onmouseenter="this.style.transform='translateY(-4px)';this.style.boxShadow='0 16px 40px rgba(0,0,0,0.08)'" onmouseleave="this.style.transform='';this.style.boxShadow=''">
                    <div style="font-size:2.2rem;margin-bottom:14px;">${c.icon}</div>
                    <h3 style="font-family:var(--font-display);font-size:1.15rem;font-weight:800;color:#0f172a;margin:0 0 8px;">${c.title}</h3>
                    <p style="font-size:0.88rem;color:#475569;line-height:1.6;margin:0;">${c.desc}</p>
                </div>
            `).join('')}
        </div>

        <!-- ── HOW IT WORKS ───────────────────────────────────── -->
        <div style="background:white;border-radius:28px;padding:40px 44px;box-shadow:0 12px 40px -12px rgba(0,0,0,0.07);margin-bottom:36px;">
            <div style="text-align:center;margin-bottom:40px;">
                <h2 style="font-family:var(--font-display);font-size:1.8rem;font-weight:800;margin:0 0 10px;letter-spacing:-0.02em;">How It Works</h2>
                <p style="color:var(--text-secondary);font-size:0.95rem;max-width:500px;margin:0 auto;line-height:1.6;">
                    Your data flows through 9 automated steps — each one building on the last. Here's what happens behind the scenes:
                </p>
            </div>

            <!-- Pipeline Diagram -->
            <div style="display:flex;align-items:flex-start;justify-content:center;gap:0;flex-wrap:nowrap;overflow-x:auto;padding-bottom:8px;">
                ${[
                    { step:'01', icon:'📂', label:'Load Data',      desc:'Upload CSV or choose a sample dataset',              color:'#eff6ff', accent:'#2563eb' },
                    { step:'02', icon:'🧹', label:'Clean & Prep',   desc:'Fix missing values, standardise format',             color:'#f0fdf4', accent:'#16a34a' },
                    { step:'03', icon:'🤖', label:'Train AI',       desc:'Build a model that learns from patterns',            color:'#f5f3ff', accent:'#7c3aed' },
                    { step:'04', icon:'🎯', label:'Fine-Tune',      desc:'Calibrate so percentages are accurate',              color:'#fef3c7', accent:'#d97706' },
                    { step:'05', icon:'⚖️', label:'Fairness Check', desc:'Detect bias across all groups',                      color:'#fff1f2', accent:'#e11d48' },
                    { step:'06', icon:'💡', label:'Explain',        desc:'Find top factors for each person',                   color:'#ecfdf5', accent:'#059669' },
                    { step:'07', icon:'📝', label:'Summarise',      desc:'Write plain-English descriptions',                   color:'#f0f9ff', accent:'#0284c7' },
                    { step:'08', icon:'📊', label:'Final Report',   desc:'Output complete table of predictions',               color:'#fdf4ff', accent:'#9333ea' },
                ].map((s, i, arr) => `
                <div style="display:flex;align-items:flex-start;flex-shrink:0;">
                    <div style="display:flex;flex-direction:column;align-items:center;width:110px;text-align:center;">
                        <div style="width:60px;height:60px;border-radius:18px;background:${s.color};display:flex;align-items:center;justify-content:center;font-size:1.6rem;border:2px solid ${s.accent}22;box-shadow:0 4px 14px ${s.accent}20;margin-bottom:10px;position:relative;">
                            ${s.icon}
                            <div style="position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:${s.accent};color:white;font-size:0.6rem;font-weight:800;display:flex;align-items:center;justify-content:center;">${s.step}</div>
                        </div>
                        <div style="font-weight:700;font-size:0.82rem;color:#0f172a;margin-bottom:4px;">${s.label}</div>
                        <div style="font-size:0.72rem;color:#64748b;line-height:1.4;">${s.desc}</div>
                    </div>
                    ${i < arr.length - 1 ? `
                    <div style="display:flex;align-items:flex-start;padding-top:28px;flex-shrink:0;">
                        <svg width="32" height="24" viewBox="0 0 32 24" fill="none" style="opacity:0.35;">
                            <path d="M4 12 H26 M20 6 L28 12 L20 18" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>` : ''}
                </div>
                `).join('')}
            </div>

            <!-- Auto CTA label -->
            <div style="text-align:center;margin-top:32px;">
                <div style="display:inline-flex;align-items:center;gap:8px;background:#f1f5f9;border-radius:12px;padding:10px 20px;font-size:0.85rem;color:#475569;">
                    <span style="font-size:1rem;">⚡</span>
                    All 9 steps run automatically when you click <strong style="color:#2563eb;">▶ Start Analysis</strong>
                </div>
            </div>
        </div>

        <!-- ── STATS STRIP ────────────────────────────────────── -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:36px;">
            ${[
                { icon:'🗃️', stat:'Any Dataset',   label:'Upload your own CSV or use our samples' },
                { icon:'⚡', stat:'< 4 Minutes',   label:'Full pipeline runs on most datasets' },
                { icon:'0️⃣',  stat:'Zero Code',     label:'No programming required — ever' },
                { icon:'🌍', stat:'Domain-Free',   label:'Works for students, income, healthcare & more' },
            ].map(s => `
                <div style="background:white;border-radius:18px;padding:22px 24px;box-shadow:0 4px 16px rgba(0,0,0,0.05);display:flex;align-items:center;gap:16px;">
                    <div style="font-size:2rem;flex-shrink:0;">${s.icon}</div>
                    <div>
                        <div style="font-family:var(--font-display);font-size:1.3rem;font-weight:800;color:#0f172a;">${s.stat}</div>
                        <div style="font-size:0.8rem;color:#64748b;line-height:1.4;margin-top:2px;">${s.label}</div>
                    </div>
                </div>
            `).join('')}
        </div>

        <!-- ── CTA FOOTER ─────────────────────────────────────── -->
        <div style="background:linear-gradient(135deg,#f8fafc,#eff6ff);border-radius:24px;padding:40px;border:1.5px solid #dbeafe;text-align:center;">
            <div style="font-size:3rem;margin-bottom:16px;">🚀</div>
            <h3 style="font-family:var(--font-display);font-size:1.6rem;font-weight:800;margin:0 0 10px;">Ready to get started?</h3>
            <p style="color:var(--text-secondary);font-size:0.95rem;max-width:480px;margin:0 auto 28px;line-height:1.6;">
                Pick a sample dataset, click Run, and get a full fairness report with explanations in minutes.
            </p>
            <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="window.fairlensNavigate('pipeline')"
                    style="font-size:1rem;padding:14px 32px;border-radius:14px;">
                    ▶ Start Analysis Now
                </button>
                <button class="btn btn-secondary" onclick="window.fairlensNavigate('dashboard')"
                    style="font-size:1rem;padding:14px 28px;border-radius:14px;">
                    📊 View Dashboard
                </button>
            </div>
        </div>

    </div>
    `;
}
