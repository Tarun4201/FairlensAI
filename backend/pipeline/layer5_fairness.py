"""
Layer 5 · Fairness Audit [CORE REQUIREMENT]
=============================================
Computes Demographic Parity Difference (DPD) and Equal Opportunity
Difference (EOD) across AI-detected sensitive attributes.
Flags threshold breaches ≥ 0.05. All results logged — disparities
are NEVER suppressed.
"""

import os
import logging
import numpy as np
import pandas as pd
from typing import Dict, Any, List
from itertools import combinations

logger = logging.getLogger(__name__)

BIAS_THRESHOLD = 0.05  # Fixed per PRD — DPD/EOD ≥ 0.05 triggers flag


def _compute_dpd(y_pred: np.ndarray, groups: np.ndarray) -> Dict[str, Any]:
    """
    Compute Demographic Parity Difference.
    DPD = max difference in positive prediction rates between groups.
    A value of 0 indicates perfect parity.
    """
    unique_groups = np.unique(groups)
    group_rates = {}

    for g in unique_groups:
        mask = groups == g
        if mask.sum() > 0:
            rate = y_pred[mask].mean()
            group_rates[str(g)] = float(rate)

    if len(group_rates) < 2:
        return {
            "dpd": 0.0,
            "group_rates": group_rates,
            "max_group": None,
            "min_group": None,
            "flagged": False
        }

    max_rate = max(group_rates.values())
    min_rate = min(group_rates.values())
    dpd = max_rate - min_rate

    max_group = [k for k, v in group_rates.items() if v == max_rate][0]
    min_group = [k for k, v in group_rates.items() if v == min_rate][0]

    return {
        "dpd": float(dpd),
        "group_rates": group_rates,
        "max_group": max_group,
        "min_group": min_group,
        "flagged": dpd >= BIAS_THRESHOLD
    }


def _compute_eod(
    y_pred: np.ndarray,
    y_true: np.ndarray,
    groups: np.ndarray
) -> Dict[str, Any]:
    """
    Compute Equal Opportunity Difference.
    EOD = max difference in true positive rates (recall) across groups.
    Ensures high-risk individuals are equally identified regardless of group.
    """
    unique_groups = np.unique(groups)
    group_tpr = {}

    for g in unique_groups:
        mask = groups == g
        true_pos_mask = mask & (y_true == 1)

        if true_pos_mask.sum() > 0:
            tpr = y_pred[true_pos_mask].mean()
            group_tpr[str(g)] = float(tpr)
        else:
            group_tpr[str(g)] = 0.0

    if len(group_tpr) < 2:
        return {
            "eod": 0.0,
            "group_tpr": group_tpr,
            "max_group": None,
            "min_group": None,
            "flagged": False
        }

    max_tpr = max(group_tpr.values())
    min_tpr = min(group_tpr.values())
    eod = max_tpr - min_tpr

    max_group = [k for k, v in group_tpr.items() if v == max_tpr][0]
    min_group = [k for k, v in group_tpr.items() if v == min_tpr][0]

    return {
        "eod": float(eod),
        "group_tpr": group_tpr,
        "max_group": max_group,
        "min_group": min_group,
        "flagged": eod >= BIAS_THRESHOLD
    }


def _compute_group_bias_flags(
    y_pred: np.ndarray,
    groups: np.ndarray,
    dpd_result: Dict,
    eod_result: Dict
) -> np.ndarray:
    """
    Generate per-entity bias flags.
    An entity is flagged if it belongs to a group where DPD or EOD
    exceeds the threshold.
    """
    flags = np.zeros(len(y_pred), dtype=bool)

    if dpd_result["flagged"] or eod_result["flagged"]:
        # Flag all entities — bias affects the entire attribute
        flags[:] = True

    return flags


def audit(
    silver_df: pd.DataFrame,
    y_pred: np.ndarray,
    y_true: np.ndarray,
    schema: Dict[str, Any],
    calibrated_probs: np.ndarray = None
) -> Dict[str, Any]:
    """
    Execute Fairness Audit across all AI-detected sensitive attributes.

    CRITICAL: All disparities are logged. Findings are NEVER suppressed.

    Args:
        silver_df: Silver dataframe with sensitive columns
        y_pred: Binary predictions
        y_true: Ground truth labels
        schema: Schema analyzer output
        calibrated_probs: Calibrated probability scores (optional)

    Returns:
        Dict with comprehensive fairness audit results
    """
    logger.info("⚖️ Layer 5: Fairness Audit [CORE REQUIREMENT]")
    logger.info(f"   Bias threshold: DPD/EOD ≥ {BIAS_THRESHOLD}")

    sensitive_attrs = schema["sensitive_attributes"]
    audit_results = {}
    all_flags = np.zeros(len(y_pred), dtype=bool)
    total_breaches = 0

    for attr_info in sensitive_attrs:
        col = attr_info["column"]
        attr_type = attr_info["type"]

        if col not in silver_df.columns:
            logger.warning(f"   ⚠️ Sensitive column '{col}' not found in data, skipping")
            continue

        groups = silver_df[col].values

        # For continuous attributes (like age), bin them
        if silver_df[col].dtype in [np.float64, np.float32]:
            groups = pd.qcut(silver_df[col], q=4, labels=False, duplicates='drop').values
        elif silver_df[col].nunique() > 10:
            groups = pd.qcut(silver_df[col], q=4, labels=False, duplicates='drop').values

        logger.info(f"\n   🔍 Auditing: {col} ({attr_type})")
        logger.info(f"      Groups: {np.unique(groups).tolist()}")

        # Compute DPD
        dpd = _compute_dpd(y_pred, groups)
        logger.info(f"      DPD: {dpd['dpd']:.4f} {'🚨 FLAGGED' if dpd['flagged'] else '✅ OK'}")
        for g, r in dpd["group_rates"].items():
            logger.info(f"         Group {g}: {r:.4f} positive rate")

        # Compute EOD
        eod = _compute_eod(y_pred, y_true, groups)
        logger.info(f"      EOD: {eod['eod']:.4f} {'🚨 FLAGGED' if eod['flagged'] else '✅ OK'}")
        for g, r in eod["group_tpr"].items():
            logger.info(f"         Group {g}: {r:.4f} TPR")

        # Per-entity bias flags
        entity_flags = _compute_group_bias_flags(y_pred, groups, dpd, eod)
        all_flags |= entity_flags

        if dpd["flagged"]:
            total_breaches += 1
        if eod["flagged"]:
            total_breaches += 1

        audit_results[col] = {
            "attribute_type": attr_type,
            "dpd": dpd,
            "eod": eod,
            "n_groups": len(np.unique(groups)),
            "group_sizes": {str(g): int((groups == g).sum()) for g in np.unique(groups)},
            "any_breach": dpd["flagged"] or eod["flagged"]
        }

    # Log to MLflow
    try:
        import mlflow
        mlflow.set_experiment("FairLens_AI")
        with mlflow.start_run(run_name="Fairness_Audit"):
            for col, result in audit_results.items():
                mlflow.log_metric(f"dpd_{col}", result["dpd"]["dpd"])
                mlflow.log_metric(f"eod_{col}", result["eod"]["eod"])
                mlflow.log_metric(f"flagged_{col}", int(result["any_breach"]))
            mlflow.log_metric("total_breaches", total_breaches)
            mlflow.log_metric("entities_flagged", int(all_flags.sum()))
            mlflow.log_metric("bias_threshold", BIAS_THRESHOLD)
    except Exception as e:
        logger.warning(f"   ⚠️ MLflow logging skipped: {e}")

    logger.info(f"\n   ════════════════════════════════════")
    logger.info(f"   FAIRNESS AUDIT SUMMARY")
    logger.info(f"   Attributes audited:  {len(audit_results)}")
    logger.info(f"   Total breaches:      {total_breaches}")
    logger.info(f"   Entities flagged:    {int(all_flags.sum())} / {len(y_pred)}")
    logger.info(f"   ════════════════════════════════════")

    return {
        "layer": "fairness_audit",
        "status": "complete",
        "threshold": BIAS_THRESHOLD,
        "audit_results": audit_results,
        "total_breaches": total_breaches,
        "entity_bias_flags": all_flags,
        "entities_flagged_count": int(all_flags.sum()),
        "entities_total": len(y_pred),
        "all_findings_reported": True  # NEVER suppress
    }
