"""
Layer 7 · Text Generation (Domain-Agnostic)
==============================================
Convert SHAP values into plain-language explanations per entity.
Template-based NLG with risk-level-aware language.

No hardcoded feature display names — auto-generates from column names.
No domain-specific wording (no "student", "loan", "patient" etc).
"""

import re
import logging
import numpy as np
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


def _auto_display_name(feature: str) -> str:
    """
    Auto-generate a human-readable display name from any column name.
    Works with: snake_case, camelCase, PascalCase, spaces, abbreviations.
    """
    name = feature

    # Handle camelCase / PascalCase
    name = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', name)

    # Replace underscores, hyphens with spaces
    name = name.replace("_", " ").replace("-", " ")

    # Clean up multiple spaces
    name = re.sub(r'\s+', ' ', name).strip()

    # Lowercase
    name = name.lower()

    return name


def _generate_reason_text(
    top_features: List[Dict],
    risk_score: float,
    intervention_tier: str
) -> str:
    """Generate a plain-language explanation from SHAP top features."""

    # Get readable feature names with direction
    factors = []
    for feat in top_features:
        name = _auto_display_name(feat["feature"])

        if feat["shap_value"] > 0:
            factors.append(name)
        else:
            factors.append(f"(mitigating) {name}")

    # Domain-neutral risk-level-aware language
    if intervention_tier == "High":
        if len(factors) >= 3:
            text = f"High risk due to {factors[0]}, {factors[1]}, and {factors[2]}."
        elif len(factors) == 2:
            text = f"High risk due to {factors[0]} and {factors[1]}."
        else:
            text = f"High risk primarily due to {factors[0]}."
        text += " Immediate review recommended."

    elif intervention_tier == "Medium":
        if len(factors) >= 3:
            text = f"Moderate risk influenced by {factors[0]}, {factors[1]}, and {factors[2]}."
        elif len(factors) == 2:
            text = f"Moderate risk influenced by {factors[0]} and {factors[1]}."
        else:
            text = f"Moderate risk influenced by {factors[0]}."
        text += " Review within 30 days advised."

    else:  # Low
        if len(factors) >= 3:
            text = f"Low risk. Key factors: {factors[0]}, {factors[1]}, and {factors[2]}."
        elif len(factors) == 2:
            text = f"Low risk. Key factors: {factors[0]} and {factors[1]}."
        else:
            text = f"Low risk. Primary factor: {factors[0]}."
        text += " No immediate action required."

    return text


def _get_intervention_tier(risk_score: float, bias_flag: bool = False) -> str:
    """Determine intervention tier from risk score."""
    if risk_score > 0.70:
        return "High"
    elif risk_score >= 0.40:
        return "Medium"
    else:
        return "Low"


def generate_text(
    shap_result: Dict[str, Any],
    risk_scores: np.ndarray,
    bias_flags: np.ndarray = None
) -> Dict[str, Any]:
    """
    Generate plain-language explanations for all entities.

    Args:
        shap_result: Output from Layer 6 (SHAP)
        risk_scores: Calibrated probability scores
        bias_flags: Per-entity bias flags (optional)

    Returns:
        Dict with text explanations per entity
    """
    logger.info("Layer 7: Text Generation (SHAP -> Plain Language)")

    per_entity = shap_result["per_entity"]
    explanations = []
    tier_counts = {"High": 0, "Medium": 0, "Low": 0}

    n_entities = min(len(per_entity), len(risk_scores))

    for i in range(n_entities):
        entity = per_entity[i]
        risk_score = float(risk_scores[i])
        bias_flag = bool(bias_flags[i]) if bias_flags is not None and i < len(bias_flags) else False

        tier = _get_intervention_tier(risk_score, bias_flag)
        tier_counts[tier] += 1

        reason_text = _generate_reason_text(
            entity["top_features"],
            risk_score,
            tier
        )

        explanations.append({
            "entity_index": i,
            "risk_score": risk_score,
            "intervention_tier": tier,
            "bias_flag": bias_flag,
            "reason_text": reason_text,
            "top_factors": entity["top_feature_names"],
            "top_features_detailed": entity["top_features"]
        })

    logger.info(f"Generated {len(explanations)} explanations")
    logger.info(f"   Tier distribution: {tier_counts}")

    return {
        "layer": "text_generation",
        "status": "complete",
        "explanations": explanations,
        "tier_distribution": tier_counts,
        "total_entities": len(explanations)
    }
