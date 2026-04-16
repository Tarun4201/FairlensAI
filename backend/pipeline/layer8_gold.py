"""
Layer 8 · Gold Output Table (Domain-Agnostic)
================================================
Final enriched output per entity. Unified table with all derived
signals merged. Used for intervention triage and audit reporting.

Schema:
  entity_id | risk_score | top_factors | reason_text | intervention_tier | bias_flag

Entity IDs: Uses detected ID column from schema, or auto-generates
with a context-aware prefix (STU/APP/PAT/CUS/ENT).
"""

import os
import logging
import pandas as pd
import numpy as np
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
GOLD_DIR = os.path.join(DATA_DIR, "gold")


def _ensure_dirs():
    os.makedirs(GOLD_DIR, exist_ok=True)


def build_gold_table(
    text_result: Dict[str, Any],
    silver_df: pd.DataFrame = None,
    schema: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Build the final Gold Output Table.

    Args:
        text_result: Output from Layer 7 (Text Generation)
        silver_df: Optional silver dataframe for additional context
        schema: Schema analyzer output (for ID column / entity prefix)

    Returns:
        Dict with Gold table dataframe and summary statistics
    """
    _ensure_dirs()

    logger.info("Layer 8: Gold Output Table")

    explanations = text_result["explanations"]

    # Determine entity ID strategy
    id_column = schema.get("id_column") if schema else None
    entity_prefix = schema.get("entity_prefix", "ENT") if schema else "ENT"

    # Build Gold records
    gold_records = []
    for exp in explanations:
        idx = exp["entity_index"]

        # Use actual ID from data if available
        if id_column and silver_df is not None and id_column in silver_df.columns:
            entity_id = str(silver_df.iloc[idx][id_column])
        else:
            entity_id = f"{entity_prefix}-{idx:05d}"

        record = {
            "entity_id": entity_id,
            "risk_score": round(exp["risk_score"], 4),
            "top_factors": str(exp["top_factors"]),
            "reason_text": exp["reason_text"],
            "intervention_tier": exp["intervention_tier"],
            "bias_flag": exp["bias_flag"]
        }

        gold_records.append(record)

    gold_df = pd.DataFrame(gold_records)

    # Summary statistics
    summary = {
        "total_entities": len(gold_df),
        "tier_distribution": gold_df["intervention_tier"].value_counts().to_dict(),
        "bias_flagged": int(gold_df["bias_flag"].sum()),
        "bias_rate": float(gold_df["bias_flag"].mean()),
        "avg_risk_score": float(gold_df["risk_score"].mean()),
        "high_risk_count": int((gold_df["intervention_tier"] == "High").sum()),
        "medium_risk_count": int((gold_df["intervention_tier"] == "Medium").sum()),
        "low_risk_count": int((gold_df["intervention_tier"] == "Low").sum()),
        "entity_prefix": entity_prefix,
        "id_source": "dataset" if id_column else "auto-generated"
    }

    # Save Gold table
    gold_path = os.path.join(GOLD_DIR, "gold_output.csv")
    gold_df.to_csv(gold_path, index=False)

    # Also save as JSON for API
    gold_json_path = os.path.join(GOLD_DIR, "gold_output.json")
    gold_df.to_json(gold_json_path, orient="records", indent=2)

    # Log to MLflow
    try:
        import mlflow
        mlflow.set_experiment("FairLens_AI")
        with mlflow.start_run(run_name="Gold_Output"):
            mlflow.log_metric("total_entities", summary["total_entities"])
            mlflow.log_metric("high_risk_count", summary["high_risk_count"])
            mlflow.log_metric("medium_risk_count", summary["medium_risk_count"])
            mlflow.log_metric("low_risk_count", summary["low_risk_count"])
            mlflow.log_metric("bias_flagged_count", summary["bias_flagged"])
            mlflow.log_metric("avg_risk_score", summary["avg_risk_score"])
            mlflow.log_artifact(gold_path)
    except Exception:
        pass

    logger.info(f"Gold table built: {len(gold_df)} entities")
    logger.info(f"   Entity ID: {summary['id_source']} (prefix: {entity_prefix})")
    logger.info(f"   Tier distribution: {summary['tier_distribution']}")
    logger.info(f"   Bias flagged: {summary['bias_flagged']} ({summary['bias_rate']*100:.1f}%)")
    logger.info(f"   Avg risk score: {summary['avg_risk_score']:.4f}")
    logger.info(f"   Gold output saved: {gold_path}")

    return {
        "layer": "gold_output",
        "status": "complete",
        "gold_df": gold_df,
        "gold_path": gold_path,
        "summary": summary,
        "gold_records": gold_records
    }
