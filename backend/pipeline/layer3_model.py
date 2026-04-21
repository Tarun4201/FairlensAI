"""
Layer 3 · Model Training
=========================
Train Logistic Regression (baseline) and XGBoost (primary).
Track all experiments via MLflow. Register best model by AUC.
"""

import os
import logging
import json
import pickle
import pandas as pd
import numpy as np
from typing import Dict, Any, Tuple
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    roc_auc_score, accuracy_score, precision_score,
    recall_score, f1_score, classification_report,
    confusion_matrix
)

logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")


def _ensure_dirs():
    os.makedirs(MODELS_DIR, exist_ok=True)


def _prepare_data(
    df: pd.DataFrame,
    target_col: str,
    sensitive_cols: list,
    original_target: str
) -> Tuple:
    """Prepare train/test split, excluding non-feature columns."""
    exclude = {target_col, original_target}

    # Get all numeric columns as features
    feature_cols = [c for c in df.columns
                    if c not in exclude
                    and df[c].dtype in [np.float64, np.int64, np.float32, np.int32, float, int]
                    and c != original_target]

    X = df[feature_cols].copy()
    y = df[target_col].copy()

    # Handle any remaining non-numeric
    for col in X.columns:
        if X[col].dtype == object:
            X[col] = pd.Categorical(X[col]).codes

    # Fill any NaN
    X = X.fillna(0)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    logger.info(f"   Train: {len(X_train)} | Test: {len(X_test)}")
    logger.info(f"   Features: {len(feature_cols)}")

    return X_train, X_test, y_train, y_test, feature_cols


def _evaluate_model(model, X_test, y_test, model_name: str) -> Dict[str, float]:
    """Evaluate a model and return metrics."""
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1] if hasattr(model, 'predict_proba') else y_pred

    metrics = {
        "auc": float(roc_auc_score(y_test, y_prob)),
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred, zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, zero_division=0)),
        "f1": float(f1_score(y_test, y_pred, zero_division=0)),
    }

    cm = confusion_matrix(y_test, y_pred).tolist()
    metrics["confusion_matrix"] = cm

    logger.info(f"   {model_name} — AUC: {metrics['auc']:.4f} | Acc: {metrics['accuracy']:.4f} | F1: {metrics['f1']:.4f}")

    return metrics


def _train_logistic_regression(X_train, y_train, X_test, y_test) -> Tuple:
    """Train Logistic Regression baseline."""
    logger.info("📈 Training Logistic Regression (baseline)...")

    lr = LogisticRegression(
        max_iter=1000,
        random_state=42,
        class_weight='balanced',
        C=1.0,
        solver='lbfgs'
    )
    lr.fit(X_train, y_train)

    metrics = _evaluate_model(lr, X_test, y_test, "Logistic Regression")
    return lr, metrics


def _train_xgboost(X_train, y_train, X_test, y_test) -> Tuple:
    """Train XGBoost primary classifier."""
    logger.info("🌲 Training XGBoost (primary)...")

    try:
        from xgboost import XGBClassifier

        # Calculate scale_pos_weight for imbalanced dataset
        n_neg = (y_train == 0).sum()
        n_pos = (y_train == 1).sum()
        scale_weight = n_neg / max(n_pos, 1)

        xgb = XGBClassifier(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.1,
            scale_pos_weight=scale_weight,
            random_state=42,
            eval_metric='auc',
            use_label_encoder=False,
            verbosity=0
        )
        xgb.fit(X_train, y_train)

        metrics = _evaluate_model(xgb, X_test, y_test, "XGBoost")
        return xgb, metrics

    except Exception as e:
        logger.warning(f"⚠️ XGBoost not available ({str(e)}), using Random Forest as fallback...")
        from sklearn.ensemble import RandomForestClassifier

        rf = RandomForestClassifier(
            n_estimators=200,
            max_depth=10,
            random_state=42,
            class_weight='balanced'
        )
        rf.fit(X_train, y_train)

        metrics = _evaluate_model(rf, X_test, y_test, "Random Forest")
        return rf, metrics


def _log_to_mlflow(model_name, model, metrics, feature_cols):
    """Log experiment to MLflow (best effort)."""
    try:
        import mlflow
        import mlflow.sklearn

        mlflow.set_experiment("FairLens_AI")

        with mlflow.start_run(run_name=model_name):
            # Log metrics
            for key, val in metrics.items():
                if isinstance(val, (int, float)):
                    mlflow.log_metric(key, val)

            # Log model params
            params = model.get_params() if hasattr(model, 'get_params') else {}
            for key, val in params.items():
                try:
                    mlflow.log_param(key, str(val)[:250])
                except Exception:
                    pass

            # Log feature count
            mlflow.log_param("n_features", len(feature_cols))

            # Log model
            mlflow.sklearn.log_model(model, model_name)

            logger.info(f"   📊 MLflow: logged {model_name}")

    except Exception as e:
        logger.warning(f"   ⚠️ MLflow logging skipped: {e}")


def train(silver_result: Dict[str, Any], schema: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute Model Training layer.

    Args:
        silver_result: Output from Silver layer
        schema: Schema analyzer output

    Returns:
        Dict with training results, models, and metrics
    """
    _ensure_dirs()

    logger.info("🎯 Layer 3: Model Training")

    df = silver_result["dataframe"]
    target_col = silver_result["target_column"]
    sensitive_cols = schema["sensitive_column_names"]
    original_target = silver_result["original_target"]

    # Prepare data
    X_train, X_test, y_train, y_test, feature_cols = _prepare_data(
        df, target_col, sensitive_cols, original_target
    )

    # Train models
    lr_model, lr_metrics = _train_logistic_regression(X_train, y_train, X_test, y_test)
    xgb_model, xgb_metrics = _train_xgboost(X_train, y_train, X_test, y_test)

    # Determine best model by AUC
    if xgb_metrics["auc"] >= lr_metrics["auc"]:
        best_model = xgb_model
        best_name = "XGBoost"
        best_metrics = xgb_metrics
    else:
        best_model = lr_model
        best_name = "LogisticRegression"
        best_metrics = lr_metrics

    logger.info(f"🏆 Best model: {best_name} (AUC: {best_metrics['auc']:.4f})")

    # Log to MLflow
    _log_to_mlflow("LogisticRegression", lr_model, lr_metrics, feature_cols)
    _log_to_mlflow("XGBoost", xgb_model, xgb_metrics, feature_cols)

    # Save models
    lr_path = os.path.join(MODELS_DIR, "logistic_regression.pkl")
    xgb_path = os.path.join(MODELS_DIR, "xgboost.pkl")
    best_path = os.path.join(MODELS_DIR, "best_model.pkl")

    with open(lr_path, "wb") as f:
        pickle.dump(lr_model, f)
    with open(xgb_path, "wb") as f:
        pickle.dump(xgb_model, f)
    with open(best_path, "wb") as f:
        pickle.dump(best_model, f)

    # Save feature columns
    feature_path = os.path.join(MODELS_DIR, "feature_columns.json")
    with open(feature_path, "w") as f:
        json.dump(feature_cols, f)

    logger.info(f"💾 Models saved to {MODELS_DIR}")

    return {
        "layer": "model_training",
        "status": "complete",
        "best_model_name": best_name,
        "best_model": best_model,
        "xgb_model": xgb_model,
        "lr_model": lr_model,
        "best_metrics": best_metrics,
        "model_comparison": {
            "LogisticRegression": lr_metrics,
            "XGBoost": xgb_metrics
        },
        "feature_columns": feature_cols,
        "X_train": X_train,
        "X_test": X_test,
        "y_train": y_train,
        "y_test": y_test,
    }
