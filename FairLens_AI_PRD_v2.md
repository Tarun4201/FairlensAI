# FairLens AI
## Universal Fairness & Explainability Pipeline
**Domain-Agnostic · Audit-Ready · Human-Interpretable**

> Version 1.0 — Hackathon Draft
> *Anthropic Hackathon Draft — Not for Distribution*

| Field | Details |
|---|---|
| Status | Active |
| Stack | Databricks · MLflow · SHAP · XGBoost |
| Primary Dataset | Student Dropout (~30K rows) |
| Audience | Hackathon Judges + Development Team |

---

## 01 — Problem Context

Modern AI systems drive high-stakes decisions across education, finance, hiring, and healthcare. Most rely on historically biased data, producing outcomes that are unfair, opaque, and legally vulnerable. Accuracy alone is not sufficient — a model that cannot justify its decisions or prove demographic fairness is a liability, not a solution.

### Core Requirements

- Predict outcomes accurately using well-calibrated probability scores
- Explain every decision in human-readable terms via SHAP attribution
- Prove predictions are not biased across protected demographic groups

| Domain | Bias Risk | Impact |
|---|---|---|
| Education | Historical dropout patterns by socioeconomic status | Unfair dropout prediction for low-income students |
| Finance | Credit scoring biased by zip code / race proxies | Discriminatory loan rejection rates |
| Hiring | Resume screening biased by gender or name | Systematic exclusion of qualified candidates |
| Healthcare | Risk models trained on unrepresentative data | Unequal treatment recommendations by group |

---

## 02 — Domain Scope

FairLens AI is built for depth on one primary dataset but architected for cross-domain extensibility. Domain extensions are conceptual only — do not fully implement multiple pipelines.

| Education (Primary) | Finance (Extensible) | Healthcare (Extensible) |
|---|---|---|
| Student Dropout Dataset | Loan Approval Datasets | Risk Prediction Datasets |
| ~30K records · Binary classification | Conceptual extension only | Conceptual extension only |

---

## 03 — AI Schema Analyzer Layer `[KEY INNOVATION]`

The AI Schema Analyzer is the first layer of the pipeline. It eliminates the need for manual column configuration — enabling true plug-and-play deployment across any domain without data scientist intervention.

### Purpose

Automatically analyze any input dataset and identify:

- **Target column** — the label to predict (e.g., dropout, default, churn)
- **Sensitive attributes** — protected characteristics for fairness auditing
- **Feature groups** — behavioral, financial, demographic, academic

### Detection Strategy

**Phase 1 — Rule-Based Keyword Matching** *(fast, reliable, no API cost)*

| Attribute Type | Detected Keywords | Fairness Action |
|---|---|---|
| Target Column | target, label, dropout, outcome, default, churn | Set as prediction label |
| Gender | gender, sex, male, female | Include in fairness audit |
| Socioeconomic | income, fees, debt, parental_income_level | Include in fairness audit |
| Race / Ethnicity | race, ethnicity, nationality | Include in fairness audit |

**Phase 2 — LLM Semantic Reasoning** *(for ambiguous columns)*

When rule-based matching is insufficient, an LLM call classifies ambiguous column names using semantic understanding.

| Input Column Name | LLM Classification |
|---|---|
| `parental_income_level` | Socioeconomic → flag for fairness audit |
| `guardian_education_years` | Socioeconomic / Demographic → flag for fairness audit |
| `monthly_engagement_score` | Behavioral → feature group, not sensitive attribute |

### Output Schema (JSON)

```json
{
  "target_column": "dropout",
  "sensitive_attributes": ["gender", "income_level"],
  "feature_groups": {
    "behavioral": ["attendance", "engagement_score"],
    "financial": ["debt", "fees_paid"],
    "demographic": ["gender", "income_level"]
  }
}
```

### Judge Pitch

> *"Most fairness systems require a data scientist to manually declare which columns are sensitive. Our AI Schema Analyzer eliminates that — it reads any dataset, semantically understands column meanings, and auto-configures the entire fairness pipeline. This makes FairLens truly domain-agnostic at a systems level, not just in theory."*

---

## 04 — Pipeline Architecture (9-Layer)

> Build in this order. **Fairness > incomplete system.** A clean pipeline end-to-end scores higher than a partial advanced system.

### `NEW` Layer 0 · AI Schema Analyzer
Accepts raw dataset. Rule-based keyword matching + LLM semantic reasoning for ambiguous columns. Outputs structured JSON config for all downstream layers. Zero manual configuration required.

`LLM-powered · Rule-based fallback · Zero config`

---

### `B` Layer 1 · Bronze — Raw Ingestion
Ingest raw dataset into Delta table. Enforce schema integrity. No transformations — preserve source fidelity.

`Delta Lake · Unity Catalog · PySpark`

---

### `S` Layer 2 · Silver — Feature Engineering
Null handling, categorical encoding. Uses AI schema output to route column treatment. Behavioral group → trend features. Financial group → risk ratios. Sensitive attributes preserved separately for audit.

`PySpark · Schema-driven · Domain-independent features`

---

### `M` Layer 3 · Model Training
Train Logistic Regression (baseline) and XGBoost/Random Forest. Track all experiments via MLflow. Register best model by AUC score.

`MLflow · XGBoost · Logistic Regression · AUC tracking`

---

### `C` Layer 4 · Calibration
Apply Platt Scaling to ensure output probabilities are statistically meaningful — not just rank-ordered scores. Required for honest, trustworthy risk scoring.

`Platt Scaling · Calibrated probabilities`

---

### `F` Layer 5 · Fairness Audit `[CORE REQUIREMENT]`
Runs across AI-detected sensitive attributes automatically. Computes Demographic Parity Difference and Equal Opportunity Difference. Flags threshold breaches ≥ 0.05. All results logged — disparities are **NEVER** suppressed.

`DPD threshold ≥ 0.05 · EOD threshold ≥ 0.05 · MLflow-logged · Never suppress bias`

---

### `X` Layer 6 · Explainability — SHAP
Use TreeExplainer to extract the top 3 contributing features per prediction. SHAP values passed downstream to the text generation layer.

`SHAP · TreeExplainer · Top-3 features per entity`

---

### `T` Layer 7 · Text Generation
Convert SHAP values into plain-language explanations per entity. Example: *"High risk due to declining performance, low engagement, and financial stress."*

`NLG · SHAP → plain text`

---

### `G` Layer 8 · Gold Output Table
Final enriched output per entity. Unified table with all derived signals merged. Used for intervention triage and audit reporting.

`Entity ID · Risk Score · Top 3 Factors · Reason Text · Intervention Tier · Bias Flag`

---

## 05 — Fairness Audit `[CORE REQUIREMENT]`

The Fairness Audit is the non-negotiable centerpiece of FairLens AI. It must be implemented completely, with all results logged and no findings suppressed under any circumstance.

### Fairness Metrics Specification

| Metric | Definition | Threshold | Action |
|---|---|---|---|
| Demographic Parity Difference (DPD) | Difference in positive prediction rates between demographic groups. A value of 0 indicates perfect parity. | ≥ 0.05 → FLAG | Log + Alert |
| Equal Opportunity Difference (EOD) | Difference in true positive rates (recall) across protected groups. Ensures high-risk individuals are equally identified regardless of group membership. | ≥ 0.05 → FLAG | Log + Alert |

### Protected Attributes Audited

- **Gender** — binary and multi-valued gender encoding
- **Socioeconomic status** — income bracket, fee payment status, financial stress indicators
- Any additional attributes auto-detected by the AI Schema Analyzer

### Audit Execution Rules

| Requirement | Implementation Note |
|---|---|
| All disparities must be logged | Use MLflow to record DPD and EOD per attribute per run |
| Never suppress bias findings | Even if DPD/EOD is high — report it. Suppression is a disqualifying failure. |
| Bias flag must propagate to Gold Output | Every entity in the Gold table must carry a `bias_flag` boolean |
| Use AI-detected attributes automatically | No hardcoded column names — read from Schema Analyzer JSON output |

---

## 06 — Gold Output Schema

The Gold Output Table is the final unified artifact. Every entity processed by the pipeline must appear as a single enriched row. This table is the primary deliverable for downstream intervention systems and audit reports.

| Field | Type | Description | Example | Source Layer |
|---|---|---|---|---|
| `entity_id` | string | Student / applicant unique identifier | STU-00412 | Bronze |
| `risk_score` | float [0,1] | Calibrated dropout probability after Platt Scaling | 0.84 | Calibration |
| `top_factors` | array[3] | SHAP-ranked top 3 contributing feature names | `["perf_delta", "engagement", "fin_stress"]` | SHAP Layer |
| `reason_text` | string | Plain-language explanation generated from SHAP values | "High risk due to declining performance..." | Text Gen |
| `intervention_tier` | enum | Action priority level for case workers / systems | High \| Medium \| Low | Gold |
| `bias_flag` | boolean | True if fairness audit DPD or EOD threshold breached for this entity's group | true / false | Fairness Audit |

### Intervention Tier Logic

| Tier | Risk Score Range | Bias Flag | Recommended Action |
|---|---|---|---|
| High | > 0.70 | Either | Immediate intervention required |
| Medium | 0.40 – 0.70 | Either | Schedule review within 30 days |
| Low | < 0.40 | False | Monitor — no immediate action |

---

## 07 — Tech Stack

| Component | Technology | Purpose |
|---|---|---|
| Data Platform | Databricks + Delta Lake + Unity Catalog | Storage, Bronze/Silver/Gold layers |
| Data Processing | PySpark | Feature engineering, transformations |
| ML Tracking | MLflow | Experiment logging, model registry |
| Models | XGBoost + Logistic Regression | Primary classifier + interpretable baseline |
| Calibration | Platt Scaling (sklearn CalibratedClassifierCV) | Probability calibration layer |
| Explainability | SHAP (TreeExplainer) | Feature attribution per prediction |
| AI Schema Layer | Rule engine + LLM (Claude / GPT) | Automatic column classification |
| Backend (optional) | FastAPI | REST API for Gold Output serving |
| Frontend (optional) | React / JavaScript | Fairness dashboard, what-if simulation |

---

## 08 — Evaluation Criteria & Build Constraints

### Hackathon Evaluation Alignment

| Criteria | FairLens AI Coverage | Priority |
|---|---|---|
| Fairness Audit | DPD + EOD across AI-detected sensitive attributes, full MLflow logging | **CRITICAL — non-negotiable** |
| Pipeline Architecture | Clean 9-layer Bronze → Silver → Gold with AI schema layer | P1 — Core |
| Explainability | SHAP TreeExplainer + human-readable reason text per entity | P1 — Core |
| Calibration | Platt Scaling ensuring statistically meaningful probabilities | P2 — Important |
| Model Performance | MLflow-tracked experiments, model comparison, best model registered | P2 — Important |
| AI Innovation | AI Schema Analyzer — auto-config of fairness pipeline | P2 — Differentiator |
| UI Dashboard | Optional — domain selector, bias alerts, what-if simulation | P3 — Optional |

### Hard Constraints

- Use **ONE dataset** (Student Dropout) for full execution depth — do not build multiple full pipelines
- Domain extensions (Finance, Healthcare) are conceptual only — demonstrate architecture adaptability
- Bias flag threshold: DPD/EOD ≥ 0.05 triggers a flag — this value is **fixed**
- **Never suppress or hide bias findings** — reporting is mandatory regardless of severity
- UI is optional and must not delay core pipeline completion

---

## 09 — Future Scope

Post-hackathon roadmap for FairLens AI as a production Responsible AI platform:

| Feature | Description |
|---|---|
| Real-time bias monitoring | Streaming pipeline that flags bias drift as new data arrives |
| Cross-domain dataset integration | Full pipeline implementation across Finance, Healthcare, and Hiring domains |
| Automated bias mitigation | Reweighing, adversarial debiasing, and post-processing fairness correction |
| Enterprise API integration | REST API layer enabling any downstream system to consume fairness-audited predictions |
| Regulatory compliance reporting | Auto-generated audit reports aligned to EU AI Act, ECOA, and EEOC requirements |

---

## Final Positioning Statement

> *"FairLens AI is not a domain-specific tool — it is a universal fairness and explainability layer that can be integrated into any AI decision-making pipeline. Its value is in what it reveals, not just what it predicts."*
