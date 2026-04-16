"""
FairLens AI — FastAPI Backend (Domain-Agnostic)
=================================================
REST API for pipeline execution, fairness audit results,
explainability queries, what-if simulation, and CSV upload.

Supports any dataset — not tied to a specific domain.
"""

import os
import sys
import json
import logging
import threading
import shutil
import numpy as np
import pandas as pd
import pickle
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# Add parent to path
sys.path.insert(0, os.path.dirname(__file__))

from pipeline.orchestrator import run_pipeline, get_pipeline_state
from pipeline.layer1_bronze import DEMO_DATASETS

# ── Data directories ────────────────────────────────────────────────
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
GOLD_DIR = os.path.join(DATA_DIR, "gold")
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")

# Ensure dirs exist
os.makedirs(UPLOADS_DIR, exist_ok=True)

# ── Pipeline results cache ──────────────────────────────────────────
_cache = {"pipeline_result": None, "running": False}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("FairLens AI API starting...")
    logger.info(f"   Frontend dir: {FRONTEND_DIR}")
    yield
    logger.info("FairLens AI API shutting down")


app = FastAPI(
    title="FairLens AI",
    description="Universal Fairness & Explainability Pipeline — works with any tabular dataset",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request/Response Models ─────────────────────────────────────────


class PipelineRunRequest(BaseModel):
    force_refresh: bool = False
    dataset: str = "student_dropout"  # demo preset key or "uploaded"
    positive_class: Optional[str] = None
    entity_prefix: Optional[str] = None


class WhatIfRequest(BaseModel):
    feature_values: Dict[str, float]


# ── API Endpoints ───────────────────────────────────────────────────


@app.post("/api/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """
    Upload a CSV dataset to run the pipeline on.
    Returns a preview of the data and detected columns.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(400, "Only CSV files are supported")

    # Save uploaded file
    upload_path = os.path.join(UPLOADS_DIR, "uploaded_dataset.csv")
    with open(upload_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Read and preview
    try:
        df = pd.read_csv(upload_path)
    except Exception as e:
        raise HTTPException(400, f"Failed to parse CSV: {str(e)}")

    return {
        "status": "uploaded",
        "filename": file.filename,
        "rows": len(df),
        "columns": list(df.columns),
        "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
        "preview": df.head(5).to_dict(orient="records"),
        "path": upload_path,
    }


@app.get("/api/datasets")
async def list_datasets():
    """List available demo datasets and uploaded datasets."""
    datasets = {}

    # Demo presets
    for key, config in DEMO_DATASETS.items():
        datasets[key] = {
            "type": "demo",
            "description": config["description"],
            "entity_prefix": config["entity_prefix"],
        }

    # Check for uploaded dataset
    upload_path = os.path.join(UPLOADS_DIR, "uploaded_dataset.csv")
    if os.path.exists(upload_path):
        try:
            df = pd.read_csv(upload_path, nrows=1)
            datasets["uploaded"] = {
                "type": "uploaded",
                "description": f"Uploaded CSV — {len(pd.read_csv(upload_path))} rows, {len(df.columns)} columns",
                "columns": list(df.columns),
            }
        except Exception:
            pass

    return {"datasets": datasets}


@app.post("/api/pipeline/run")
async def run_pipeline_endpoint(request: PipelineRunRequest = PipelineRunRequest()):
    """Execute the full 9-layer pipeline on any dataset."""
    if _cache["running"]:
        return {
            "status": "already_running",
            "message": "Pipeline is currently executing",
        }

    # Determine CSV path
    csv_path = None
    dataset_key = request.dataset

    if request.dataset == "uploaded":
        csv_path = os.path.join(UPLOADS_DIR, "uploaded_dataset.csv")
        if not os.path.exists(csv_path):
            raise HTTPException(
                400, "No dataset uploaded. Upload a CSV first via /api/upload"
            )
        dataset_key = None
    elif request.dataset not in DEMO_DATASETS:
        raise HTTPException(
            400,
            f"Unknown dataset: {request.dataset}. Available: {list(DEMO_DATASETS.keys()) + ['uploaded']}",
        )

    force_refresh = request.force_refresh or (request.dataset != "student_dropout")

    ds_key = dataset_key if dataset_key else request.dataset
    if ds_key == "uploaded":
        ds_key = None

    def _run():
        _cache["running"] = True
        try:
            result = run_pipeline(
                csv_path=csv_path,
                dataset_key=ds_key or "student_dropout",
                positive_class=request.positive_class,
                entity_prefix=request.entity_prefix,
                force_refresh=force_refresh,
            )
            _cache["pipeline_result"] = result
        finally:
            _cache["running"] = False

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return {
        "status": "started",
        "message": f"Pipeline execution started on dataset: {request.dataset}",
    }


@app.get("/api/pipeline/status")
async def get_status():
    """Get current pipeline execution status."""
    state = get_pipeline_state()
    return {
        "status": state["status"],
        "current_layer": state["current_layer"],
        "progress": state["progress"],
        "layers_completed": state["layers_completed"],
        "errors": state["errors"],
        "config": state.get("config", {}),
        "elapsed": (
            (state.get("end_time") or __import__("time").time()) - state["start_time"]
            if state.get("start_time")
            else 0
        ),
    }


@app.get("/api/schema")
async def get_schema():
    """Get schema analyzer results."""
    state = get_pipeline_state()
    results = state.get("results", {})

    if "schema" not in results:
        raise HTTPException(
            404, "Schema analysis not yet available. Run pipeline first."
        )

    schema = results["schema"]
    # Remove data_profiles (too large for API response)
    safe_schema = {k: v for k, v in schema.items() if k != "data_profiles"}
    # Include profile summary instead
    if "data_profiles" in schema:
        safe_schema["profiled_columns"] = len(schema["data_profiles"])
    return safe_schema


@app.get("/api/gold")
async def get_gold(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    tier: Optional[str] = None,
    bias_only: bool = False,
    sort_by: str = "risk_score",
    sort_desc: bool = True,
):
    """Get Gold output table with pagination and filtering."""
    gold_path = os.path.join(GOLD_DIR, "gold_output.csv")

    if not os.path.exists(gold_path):
        raise HTTPException(404, "Gold output not available. Run pipeline first.")

    df = pd.read_csv(gold_path)

    # Filters
    if tier:
        df = df[df["intervention_tier"] == tier]
    if bias_only:
        df = df[df["bias_flag"] == True]

    # Sort
    if sort_by in df.columns:
        df = df.sort_values(sort_by, ascending=not sort_desc)

    # Pagination
    total = len(df)
    start = (page - 1) * page_size
    end = start + page_size
    page_df = df.iloc[start:end]

    return {
        "data": page_df.to_dict(orient="records"),
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
        },
        "summary": {
            "total_entities": total,
            "tier_distribution": df["intervention_tier"].value_counts().to_dict()
            if len(df) > 0
            else {},
            "bias_flagged": int(df["bias_flag"].sum()) if len(df) > 0 else 0,
            "avg_risk_score": float(df["risk_score"].mean()) if len(df) > 0 else 0,
        },
    }


@app.get("/api/fairness")
async def get_fairness():
    """Get fairness audit results (DPD/EOD per attribute)."""
    state = get_pipeline_state()
    results = state.get("results", {})

    if "fairness" not in results:
        raise HTTPException(404, "Fairness audit not available. Run pipeline first.")

    fairness = results["fairness"]
    return {
        "threshold": fairness.get("threshold", 0.05),
        "total_breaches": fairness.get("total_breaches", 0),
        "entities_flagged": fairness.get("entities_flagged_count", 0),
        "entities_total": fairness.get("entities_total", 0),
        "audit_results": fairness.get("audit_results", {}),
        "all_findings_reported": True,
    }


@app.get("/api/explainability/{entity_id}")
async def get_explainability(entity_id: str):
    """Get SHAP explanation for a specific entity."""
    gold_path = os.path.join(GOLD_DIR, "gold_output.csv")

    if not os.path.exists(gold_path):
        raise HTTPException(404, "Gold output not available. Run pipeline first.")

    df = pd.read_csv(gold_path)
    entity = df[df["entity_id"] == entity_id]

    if entity.empty:
        raise HTTPException(404, f"Entity {entity_id} not found")

    record = entity.iloc[0].to_dict()

    # Get SHAP details if available
    state = get_pipeline_state()
    shap_result = state.get("results", {}).get("shap", {})

    # Extract entity index from ID
    try:
        # Try extracting index from prefixed IDs like "ENT-00042"
        idx = int(entity_id.split("-")[-1])
        if (
            shap_result
            and "per_entity" in shap_result
            and idx < len(shap_result["per_entity"])
        ):
            record["shap_details"] = shap_result["per_entity"][idx]
    except (IndexError, ValueError):
        pass

    return record


@app.get("/api/explainability")
async def get_all_explainability(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)
):
    """Get SHAP explanations for all entities (paginated)."""
    state = get_pipeline_state()
    shap_result = state.get("results", {}).get("shap", {})

    if not shap_result:
        raise HTTPException(404, "SHAP results not available. Run pipeline first.")

    per_entity = shap_result.get("per_entity", [])
    global_importance = shap_result.get("global_importance", [])

    total = len(per_entity)
    start = (page - 1) * page_size
    end = start + page_size

    return {
        "entities": per_entity[start:end],
        "global_importance": global_importance[:20],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
        },
    }


@app.get("/api/model/metrics")
async def get_model_metrics():
    """Get model performance metrics."""
    state = get_pipeline_state()
    results = state.get("results", {})

    model_result = results.get("model", {})
    cal_result = results.get("calibration", {})

    if not model_result:
        raise HTTPException(404, "Model metrics not available. Run pipeline first.")

    return {
        "best_model": model_result.get("best_model_name", "Unknown"),
        "best_metrics": model_result.get("best_metrics", {}),
        "model_comparison": model_result.get("model_comparison", {}),
        "calibration": {
            "uncalibrated_brier": cal_result.get("uncalibrated_brier"),
            "calibrated_brier": cal_result.get("calibrated_brier"),
            "improvement_pct": cal_result.get("improvement_pct"),
            "uncalibrated_stats": cal_result.get("uncalibrated_stats"),
            "calibrated_stats": cal_result.get("calibrated_stats"),
        },
    }


@app.post("/api/whatif")
async def what_if_simulation(request: WhatIfRequest):
    """
    What-If simulation: modify features, get new prediction.
    """
    # Load calibrated model
    cal_model_path = os.path.join(MODELS_DIR, "calibrated_model.pkl")
    feature_cols_path = os.path.join(MODELS_DIR, "feature_columns.json")

    if not os.path.exists(cal_model_path) or not os.path.exists(feature_cols_path):
        raise HTTPException(404, "Model not available. Run pipeline first.")

    with open(cal_model_path, "rb") as f:
        model = pickle.load(f)
    with open(feature_cols_path, "r") as f:
        feature_cols = json.load(f)

    # Create input vector
    input_values = np.zeros(len(feature_cols))
    for i, col in enumerate(feature_cols):
        if col in request.feature_values:
            input_values[i] = request.feature_values[col]

    input_df = pd.DataFrame([input_values], columns=feature_cols)

    # Predict
    prob = model.predict_proba(input_df)[0][1]
    pred = int(prob >= 0.5)

    # Determine tier
    if prob > 0.70:
        tier = "High"
    elif prob >= 0.40:
        tier = "Medium"
    else:
        tier = "Low"

    # SHAP explanation for this input
    shap_details = None
    try:
        # Load the base model for SHAP
        best_model_path = os.path.join(MODELS_DIR, "best_model.pkl")
        if os.path.exists(best_model_path):
            import shap

            with open(best_model_path, "rb") as f:
                base_model = pickle.load(f)
            explainer = shap.TreeExplainer(base_model)
            shap_values = explainer.shap_values(input_df)
            if isinstance(shap_values, list):
                shap_values = shap_values[1] if len(shap_values) > 1 else shap_values[0]

            entity_shap = shap_values[0]
            top_indices = np.argsort(np.abs(entity_shap))[-3:][::-1]

            shap_details = []
            for idx in top_indices:
                shap_details.append(
                    {
                        "feature": feature_cols[idx],
                        "shap_value": float(entity_shap[idx]),
                        "direction": "increases risk"
                        if entity_shap[idx] > 0
                        else "decreases risk",
                    }
                )
    except Exception as e:
        logger.warning(f"What-If SHAP failed: {e}")

    return {
        "risk_score": float(prob),
        "prediction": pred,
        "intervention_tier": tier,
        "shap_explanation": shap_details,
        "input_features": request.feature_values,
    }


@app.get("/api/features")
async def get_feature_info():
    """Get available features and their statistics for What-If simulator."""
    feature_cols_path = os.path.join(MODELS_DIR, "feature_columns.json")

    if not os.path.exists(feature_cols_path):
        raise HTTPException(404, "Features not available. Run pipeline first.")

    with open(feature_cols_path, "r") as f:
        feature_cols = json.load(f)

    # Try to get stats from silver data
    silver_path = os.path.join(DATA_DIR, "silver", "features.csv")
    stats = {}
    if os.path.exists(silver_path):
        df = pd.read_csv(silver_path)
        for col in feature_cols:
            if col in df.columns and df[col].dtype in [
                np.float64,
                np.int64,
                float,
                int,
            ]:
                stats[col] = {
                    "min": float(df[col].min()),
                    "max": float(df[col].max()),
                    "mean": float(df[col].mean()),
                    "median": float(df[col].median()),
                    "std": float(df[col].std()),
                }

    return {"features": feature_cols, "stats": stats, "total": len(feature_cols)}


# ── Serve Frontend ──────────────────────────────────────────────────

# Serve static files from frontend directory
if os.path.exists(FRONTEND_DIR):
    assets_dir = os.path.join(FRONTEND_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    async def serve_frontend():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    @app.get("/{filename}")
    async def serve_static(filename: str):
        filepath = os.path.join(FRONTEND_DIR, filename)
        if os.path.exists(filepath):
            media_type = None
            if filename.endswith(".js"):
                media_type = "application/javascript"
            elif filename.endswith(".css"):
                media_type = "text/css"
            return FileResponse(filepath, media_type=media_type)
        raise HTTPException(404, f"File not found: {filename}")

    @app.get("/components/{filename}")
    async def serve_components(filename: str):
        filepath = os.path.join(FRONTEND_DIR, "components", filename)
        if os.path.exists(filepath):
            media_type = None
            if filename.endswith(".js"):
                media_type = "application/javascript"
            return FileResponse(filepath, media_type=media_type)
        raise HTTPException(404, f"Component not found: {filename}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
