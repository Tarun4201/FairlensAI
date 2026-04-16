"""
Pipeline Orchestrator (Domain-Agnostic)
=========================================
Sequential execution of all 9 layers with progress tracking,
error handling, and status reporting.

Accepts configurable inputs:
  - csv_path: Path to any CSV file
  - dataset_key: Demo preset name
  - positive_class: Target positive class override
  - entity_prefix: Custom entity ID prefix
"""

import os
import sys
import time
import json
import logging
import traceback
import numpy as np
import pandas as pd
from typing import Dict, Any, Optional, Callable

from pipeline.layer0_schema_analyzer import analyze_schema, get_schema_summary
from pipeline.layer1_bronze import ingest
from pipeline.layer2_silver import transform
from pipeline.layer3_model import train
from pipeline.layer4_calibration import calibrate
from pipeline.layer5_fairness import audit
from pipeline.layer6_shap import explain
from pipeline.layer7_text_gen import generate_text
from pipeline.layer8_gold import build_gold_table

logger = logging.getLogger(__name__)

# Pipeline state (module-level for API access)
_pipeline_state = {
    "status": "idle",
    "current_layer": None,
    "progress": 0,
    "layers_completed": [],
    "errors": [],
    "results": {},
    "start_time": None,
    "end_time": None,
    "config": {}
}

LAYER_NAMES = [
    "Layer 0: AI Schema Analyzer",
    "Layer 1: Bronze — Raw Ingestion",
    "Layer 2: Silver — Feature Engineering",
    "Layer 3: Model Training",
    "Layer 4: Calibration",
    "Layer 5: Fairness Audit",
    "Layer 6: SHAP Explainability",
    "Layer 7: Text Generation",
    "Layer 8: Gold Output"
]


def get_pipeline_state() -> Dict[str, Any]:
    """Get current pipeline execution state."""
    state = _pipeline_state.copy()
    # Remove large objects for serialization
    safe_results = {}
    for key, val in state.get("results", {}).items():
        if isinstance(val, dict):
            safe_results[key] = {
                k: v for k, v in val.items()
                if not isinstance(v, (pd.DataFrame, np.ndarray))
                and k not in ("best_model", "calibrated_model", "xgb_model",
                            "lr_model", "X_train", "X_test", "y_train", "y_test",
                            "shap_values", "dataframe", "sensitive_df",
                            "uncalibrated_probs", "calibrated_probs",
                            "entity_bias_flags", "gold_df")
            }
    state["results"] = safe_results
    return state


def run_pipeline(
    csv_path: str = None,
    dataset_key: str = "student_dropout",
    positive_class: str = None,
    entity_prefix: str = None,
    force_refresh: bool = False,
    progress_callback: Optional[Callable] = None
) -> Dict[str, Any]:
    """
    Execute the complete 9-layer pipeline.

    Args:
        csv_path: Path to CSV file (overrides dataset_key)
        dataset_key: Demo dataset preset name
        positive_class: Target positive class name (auto-detected if None)
        entity_prefix: Custom entity ID prefix (auto-detected if None)
        force_refresh: Force re-download of dataset
        progress_callback: Optional callback(layer_index, layer_name, status)

    Returns:
        Complete pipeline results
    """
    global _pipeline_state

    _pipeline_state = {
        "status": "running",
        "current_layer": None,
        "progress": 0,
        "layers_completed": [],
        "errors": [],
        "results": {},
        "start_time": time.time(),
        "end_time": None,
        "config": {
            "csv_path": csv_path,
            "dataset_key": dataset_key,
            "positive_class": positive_class,
            "entity_prefix": entity_prefix
        }
    }

    def _update(layer_idx, status="running"):
        _pipeline_state["current_layer"] = LAYER_NAMES[layer_idx]
        _pipeline_state["progress"] = int((layer_idx / len(LAYER_NAMES)) * 100)
        if progress_callback:
            progress_callback(layer_idx, LAYER_NAMES[layer_idx], status)

    try:
        # ═══════════════════════════════════════════════════════
        # Layer 1: Bronze — Raw Ingestion
        # ═══════════════════════════════════════════════════════
        _update(1)
        logger.info("\n" + "="*60)
        logger.info("LAYER 1: BRONZE — RAW INGESTION")
        logger.info("="*60)
        bronze_result = ingest(
            csv_path=csv_path,
            dataset_key=dataset_key,
            force_refresh=force_refresh
        )
        _pipeline_state["layers_completed"].append("bronze")
        _pipeline_state["results"]["bronze"] = bronze_result

        bronze_df = bronze_result["dataframe"]

        # ═══════════════════════════════════════════════════════
        # Layer 0: AI Schema Analyzer
        # ═══════════════════════════════════════════════════════
        _update(0)
        logger.info("\n" + "="*60)
        logger.info("LAYER 0: AI SCHEMA ANALYZER")
        logger.info("="*60)
        schema = analyze_schema(list(bronze_df.columns), dataframe=bronze_df)

        # Apply user overrides
        if entity_prefix:
            schema["entity_prefix"] = entity_prefix

        schema_summary = get_schema_summary(schema)
        logger.info(schema_summary)
        _pipeline_state["layers_completed"].append("schema_analyzer")
        _pipeline_state["results"]["schema"] = schema

        # ═══════════════════════════════════════════════════════
        # Layer 2: Silver — Feature Engineering
        # ═══════════════════════════════════════════════════════
        _update(2)
        logger.info("\n" + "="*60)
        logger.info("LAYER 2: SILVER — FEATURE ENGINEERING")
        logger.info("="*60)
        silver_result = transform(bronze_df, schema, positive_class=positive_class)
        _pipeline_state["layers_completed"].append("silver")
        _pipeline_state["results"]["silver"] = silver_result

        silver_df = silver_result["dataframe"]

        # ═══════════════════════════════════════════════════════
        # Layer 3: Model Training
        # ═══════════════════════════════════════════════════════
        _update(3)
        logger.info("\n" + "="*60)
        logger.info("LAYER 3: MODEL TRAINING")
        logger.info("="*60)
        model_result = train(silver_result, schema)
        _pipeline_state["layers_completed"].append("model_training")
        _pipeline_state["results"]["model"] = model_result

        # ═══════════════════════════════════════════════════════
        # Layer 4: Calibration
        # ═══════════════════════════════════════════════════════
        _update(4)
        logger.info("\n" + "="*60)
        logger.info("LAYER 4: CALIBRATION (PLATT SCALING)")
        logger.info("="*60)
        calibration_result = calibrate(model_result)
        _pipeline_state["layers_completed"].append("calibration")
        _pipeline_state["results"]["calibration"] = calibration_result

        # Get predictions for fairness audit
        # Use full dataset for fairness (not just test set)
        feature_cols = model_result["feature_columns"]
        X_full = silver_df[feature_cols].fillna(0)

        # For non-numeric columns
        for col in X_full.columns:
            if X_full[col].dtype == object:
                X_full[col] = pd.Categorical(X_full[col]).codes

        calibrated_model = calibration_result["calibrated_model"]
        full_probs = calibrated_model.predict_proba(X_full)[:, 1]
        full_preds = (full_probs >= 0.5).astype(int)
        y_true = silver_df["target_binary"].values

        # ═══════════════════════════════════════════════════════
        # Layer 5: Fairness Audit
        # ═══════════════════════════════════════════════════════
        _update(5)
        logger.info("\n" + "="*60)
        logger.info("LAYER 5: FAIRNESS AUDIT [CORE REQUIREMENT]")
        logger.info("="*60)
        fairness_result = audit(
            silver_df, full_preds, y_true, schema, full_probs
        )
        _pipeline_state["layers_completed"].append("fairness_audit")
        _pipeline_state["results"]["fairness"] = fairness_result

        bias_flags = fairness_result["entity_bias_flags"]

        # ═══════════════════════════════════════════════════════
        # Layer 6: SHAP Explainability
        # ═══════════════════════════════════════════════════════
        _update(6)
        logger.info("\n" + "="*60)
        logger.info("LAYER 6: SHAP EXPLAINABILITY")
        logger.info("="*60)

        # Use the uncalibrated best model for SHAP (TreeExplainer needs it)
        best_model = model_result["best_model"]
        shap_result = explain(best_model, X_full, feature_cols)
        _pipeline_state["layers_completed"].append("shap")
        _pipeline_state["results"]["shap"] = shap_result

        # ═══════════════════════════════════════════════════════
        # Layer 7: Text Generation
        # ═══════════════════════════════════════════════════════
        _update(7)
        logger.info("\n" + "="*60)
        logger.info("LAYER 7: TEXT GENERATION")
        logger.info("="*60)
        text_result = generate_text(shap_result, full_probs, bias_flags)
        _pipeline_state["layers_completed"].append("text_generation")
        _pipeline_state["results"]["text"] = text_result

        # ═══════════════════════════════════════════════════════
        # Layer 8: Gold Output
        # ═══════════════════════════════════════════════════════
        _update(8)
        logger.info("\n" + "="*60)
        logger.info("LAYER 8: GOLD OUTPUT TABLE")
        logger.info("="*60)
        gold_result = build_gold_table(text_result, silver_df, schema)
        _pipeline_state["layers_completed"].append("gold_output")
        _pipeline_state["results"]["gold"] = gold_result

        # ═══════════════════════════════════════════════════════
        # Pipeline Complete
        # ═══════════════════════════════════════════════════════
        _pipeline_state["status"] = "complete"
        _pipeline_state["progress"] = 100
        _pipeline_state["end_time"] = time.time()

        elapsed = _pipeline_state["end_time"] - _pipeline_state["start_time"]

        logger.info("\n" + "="*60)
        logger.info("PIPELINE COMPLETE")
        logger.info(f"   Time elapsed: {elapsed:.1f}s")
        logger.info(f"   Layers completed: {len(_pipeline_state['layers_completed'])}/9")
        logger.info(f"   Gold entities: {gold_result['summary']['total_entities']}")
        logger.info("="*60)

        return _pipeline_state

    except Exception as e:
        _pipeline_state["status"] = "error"
        _pipeline_state["errors"].append({
            "layer": _pipeline_state.get("current_layer", "unknown"),
            "error": str(e),
            "traceback": traceback.format_exc()
        })
        _pipeline_state["end_time"] = time.time()

        logger.error(f"Pipeline failed at {_pipeline_state['current_layer']}: {e}")
        logger.error(traceback.format_exc())

        return _pipeline_state
