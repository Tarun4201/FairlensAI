"""
Layer 4 · Calibration — Platt Scaling
=======================================
Apply Platt Scaling to ensure output probabilities are statistically
meaningful — not just rank-ordered scores.
"""

import os
import logging
import pickle
import numpy as np
import pandas as pd
from typing import Dict, Any
from sklearn.calibration import CalibratedClassifierCV

logger = logging.getLogger(__name__)

MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")


def calibrate(model_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Apply Platt Scaling (sigmoid calibration) to the best model.

    Args:
        model_result: Output from Layer 3 (Model Training)

    Returns:
        Dict with calibrated model and probability distributions
    """
    logger.info("📐 Layer 4: Calibration (Platt Scaling)")

    best_model = model_result["best_model"]
    X_train = model_result["X_train"]
    y_train = model_result["y_train"]
    X_test = model_result["X_test"]
    y_test = model_result["y_test"]

    # Get uncalibrated probabilities
    uncalibrated_probs = best_model.predict_proba(X_test)[:, 1]

    # Apply Platt Scaling
    calibrated_model = CalibratedClassifierCV(
        estimator=best_model,
        method='sigmoid',  # Platt Scaling
        cv=5
    )
    calibrated_model.fit(X_train, y_train)

    # Get calibrated probabilities
    calibrated_probs = calibrated_model.predict_proba(X_test)[:, 1]

    # Calibration statistics
    uncal_stats = {
        "mean": float(np.mean(uncalibrated_probs)),
        "std": float(np.std(uncalibrated_probs)),
        "min": float(np.min(uncalibrated_probs)),
        "max": float(np.max(uncalibrated_probs)),
        "median": float(np.median(uncalibrated_probs)),
    }

    cal_stats = {
        "mean": float(np.mean(calibrated_probs)),
        "std": float(np.std(calibrated_probs)),
        "min": float(np.min(calibrated_probs)),
        "max": float(np.max(calibrated_probs)),
        "median": float(np.median(calibrated_probs)),
    }

    # Brier score (lower = better calibration)
    from sklearn.metrics import brier_score_loss
    uncal_brier = float(brier_score_loss(y_test, uncalibrated_probs))
    cal_brier = float(brier_score_loss(y_test, calibrated_probs))

    logger.info(f"   Uncalibrated Brier: {uncal_brier:.4f}")
    logger.info(f"   Calibrated Brier:   {cal_brier:.4f}")
    logger.info(f"   Improvement: {((uncal_brier - cal_brier) / uncal_brier * 100):.1f}%")

    # Log to MLflow
    try:
        import mlflow
        mlflow.set_experiment("FairLens_AI")
        with mlflow.start_run(run_name="Calibration"):
            mlflow.log_metric("uncalibrated_brier", uncal_brier)
            mlflow.log_metric("calibrated_brier", cal_brier)
            mlflow.log_metric("calibration_improvement_pct",
                            (uncal_brier - cal_brier) / uncal_brier * 100)
    except Exception:
        pass

    # Save calibrated model
    cal_model_path = os.path.join(MODELS_DIR, "calibrated_model.pkl")
    with open(cal_model_path, "wb") as f:
        pickle.dump(calibrated_model, f)

    logger.info(f"✅ Calibration complete")
    logger.info(f"💾 Calibrated model saved: {cal_model_path}")

    return {
        "layer": "calibration",
        "status": "complete",
        "calibrated_model": calibrated_model,
        "uncalibrated_probs": uncalibrated_probs,
        "calibrated_probs": calibrated_probs,
        "uncalibrated_stats": uncal_stats,
        "calibrated_stats": cal_stats,
        "uncalibrated_brier": uncal_brier,
        "calibrated_brier": cal_brier,
        "improvement_pct": float((uncal_brier - cal_brier) / max(uncal_brier, 1e-10) * 100)
    }
