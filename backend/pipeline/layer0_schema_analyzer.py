"""
Layer 0 · AI Schema Analyzer (Domain-Agnostic)
=================================================
Automatically analyze ANY input dataset and identify:
  - Target column (the label to predict)
  - Sensitive attributes (protected characteristics for fairness auditing)
  - Feature groups (demographic, financial, temporal, categorical, numerical)
  - Entity ID column (for Gold output)
  - Per-column data profile (dtype, cardinality, nulls, distribution)

Phase 1:   Rule-based keyword matching (fast, reliable, no API cost)
Phase 1.5: Data introspection (analyze actual values, not just names)
Phase 2:   Simulated LLM semantic reasoning (for ambiguous columns)
"""

import re
import json
import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

# ── Keyword dictionaries (domain-agnostic) ────────────────────────

TARGET_KEYWORDS = [
    "target",
    "label",
    "outcome",
    "default",
    "churn",
    "result",
    "status",
    "class",
    "prediction",
    "y",
    "dropout",
    "hired",
    "approved",
    "survived",
    "diagnosis",
    "fraud",
    "attrition",
    "income",
]

GENDER_KEYWORDS = ["gender", "sex", "male", "female"]

SOCIOECONOMIC_KEYWORDS = [
    "income",
    "fees",
    "debt",
    "tuition",
    "scholarship",
    "financial",
    "economic",
    "socioeconomic",
    "poverty",
    "wage",
    "salary",
    "displaced",
    "debtor",
    "credit_score",
    "credit score",
    "annual_income",
    "annual income",
    "household_income",
]

RACE_ETHNICITY_KEYWORDS = [
    "race",
    "ethnicity",
    "nationality",
    "nacional",
    "national",
    "international",
    "ethnic",
    "origin",
    "country",
]

AGE_KEYWORDS = ["age", "birth_year", "birth year", "dob", "date_of_birth"]

MARITAL_KEYWORDS = [
    "marital",
    "married",
    "marital_status",
    "marital status",
    "civil_status",
    "civil status",
]

DISABILITY_KEYWORDS = [
    "disability",
    "disabled",
    "special_needs",
    "special needs",
    "handicap",
    "impairment",
]

RELIGION_KEYWORDS = ["religion", "religious", "faith"]

FINANCIAL_KEYWORDS = [
    "tuition",
    "fees",
    "scholarship",
    "debtor",
    "debt",
    "loan",
    "gdp",
    "unemployment",
    "inflation",
    "income",
    "salary",
    "revenue",
    "cost",
    "price",
    "amount",
    "balance",
    "credit",
    "payment",
    "billing",
    "charge",
]

TEMPORAL_KEYWORDS = [
    "date",
    "time",
    "year",
    "month",
    "day",
    "quarter",
    "semester",
    "week",
    "period",
    "tenure",
    "duration",
    "enrollment",
    "hired_date",
]

IDENTIFIER_KEYWORDS = [
    "id",
    "key",
    "index",
    "uuid",
    "code",
    "number",
    "identifier",
    "record",
    "case",
]


def _normalize(col: str) -> str:
    """Normalize column name for keyword matching."""
    return col.lower().strip().replace("'", "").replace('"', "")


def _matches_any(col: str, keywords: List[str]) -> bool:
    """Check if column name matches any keyword (case-insensitive, partial)."""
    col_norm = _normalize(col)
    for kw in keywords:
        if kw.lower() in col_norm or col_norm in kw.lower():
            return True
    return False


def _profile_column(series: pd.Series, col_name: str) -> Dict[str, Any]:
    """Phase 1.5: Data introspection — analyze actual column values."""
    profile = {
        "column": col_name,
        "dtype": str(series.dtype),
        "total_count": len(series),
        "null_count": int(series.isnull().sum()),
        "null_pct": float(series.isnull().mean()),
        "cardinality": int(series.nunique()),
    }

    # Determine if this is likely an identifier column
    unique_ratio = series.nunique() / max(len(series), 1)
    profile["unique_ratio"] = float(unique_ratio)
    profile["is_likely_id"] = unique_ratio > 0.95 and len(series) > 10

    # Determine if binary
    profile["is_binary"] = series.nunique() <= 2

    # Determine if low cardinality categorical
    profile["is_low_cardinality"] = series.nunique() <= 15

    # Numeric stats
    if series.dtype in [np.float64, np.int64, np.float32, np.int32, float, int]:
        profile["is_numeric"] = True
        clean = series.dropna()
        if len(clean) > 0:
            profile["min"] = float(clean.min())
            profile["max"] = float(clean.max())
            profile["mean"] = float(clean.mean())
            profile["median"] = float(clean.median())
            profile["std"] = float(clean.std())
            profile["sample_values"] = [float(v) for v in clean.head(5).tolist()]
    else:
        profile["is_numeric"] = False
        profile["sample_values"] = [str(v) for v in series.dropna().head(5).tolist()]

    return profile


def _classify_column_rule_based(col: str) -> Dict[str, Any]:
    """Phase 1: Rule-based classification of a single column."""
    result = {
        "column": col,
        "is_target": False,
        "is_sensitive": False,
        "is_identifier": False,
        "sensitive_type": None,
        "feature_group": None,
        "confidence": "high",
        "method": "rule_based",
    }

    col_norm = _normalize(col)

    # Check identifier first
    if _matches_any(col, IDENTIFIER_KEYWORDS) and len(col_norm) <= 15:
        # Short column names matching ID patterns
        if col_norm in [
            "id",
            "key",
            "uuid",
            "index",
            "record_id",
            "case_id",
            "entity_id",
            "user_id",
            "customer_id",
            "applicant_id",
            "candidate_id",
            "patient_id",
            "student_id",
        ]:
            result["is_identifier"] = True
            result["feature_group"] = "identifier"
            return result

    # Check target
    if _matches_any(col, TARGET_KEYWORDS):
        result["is_target"] = True
        result["feature_group"] = "target"
        return result

    # Check sensitive attributes
    if _matches_any(col, GENDER_KEYWORDS):
        result["is_sensitive"] = True
        result["sensitive_type"] = "gender"
        result["feature_group"] = "demographic"
        return result

    if _matches_any(col, RACE_ETHNICITY_KEYWORDS):
        result["is_sensitive"] = True
        result["sensitive_type"] = "race_ethnicity"
        result["feature_group"] = "demographic"
        return result

    if _matches_any(col, MARITAL_KEYWORDS):
        result["is_sensitive"] = True
        result["sensitive_type"] = "marital_status"
        result["feature_group"] = "demographic"
        return result

    if _matches_any(col, AGE_KEYWORDS):
        result["is_sensitive"] = True
        result["sensitive_type"] = "age"
        result["feature_group"] = "demographic"
        return result

    if _matches_any(col, DISABILITY_KEYWORDS):
        result["is_sensitive"] = True
        result["sensitive_type"] = "disability"
        result["feature_group"] = "demographic"
        return result

    if _matches_any(col, RELIGION_KEYWORDS):
        result["is_sensitive"] = True
        result["sensitive_type"] = "religion"
        result["feature_group"] = "demographic"
        return result

    # Check socioeconomic (sensitive)
    if _matches_any(col, SOCIOECONOMIC_KEYWORDS):
        result["is_sensitive"] = True
        result["sensitive_type"] = "socioeconomic"
        result["feature_group"] = "financial"
        return result

    # Check feature groups (non-sensitive)
    if _matches_any(col, FINANCIAL_KEYWORDS):
        result["feature_group"] = "financial"
        return result

    if _matches_any(col, TEMPORAL_KEYWORDS):
        result["feature_group"] = "temporal"
        return result

    # Ambiguous — mark for Phase 2
    result["confidence"] = "low"
    result["method"] = "needs_llm"
    return result


def _llm_classify_column(col: str, profile: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Phase 2: Simulated LLM semantic reasoning for ambiguous columns.
    In production, this would call Gemini/Claude/GPT API.
    Uses data profile for enhanced heuristics.
    """
    col_lower = _normalize(col)

    # Parent/family related → demographic (potentially sensitive)
    if any(
        w in col_lower
        for w in ["mother", "father", "parent", "guardian", "spouse", "family"]
    ):
        return {
            "is_sensitive": True,
            "sensitive_type": "socioeconomic",
            "feature_group": "demographic",
            "confidence": "medium",
            "method": "llm_simulated",
        }

    # Education/qualification related
    if any(
        w in col_lower
        for w in [
            "education",
            "qualification",
            "degree",
            "school",
            "university",
            "grade",
            "gpa",
            "score",
            "marks",
        ]
    ):
        return {
            "is_sensitive": False,
            "sensitive_type": None,
            "feature_group": "numerical",
            "confidence": "medium",
            "method": "llm_simulated",
        }

    # Work/experience related
    if any(
        w in col_lower
        for w in [
            "experience",
            "occupation",
            "job",
            "work",
            "employment",
            "position",
            "department",
            "role",
        ]
    ):
        return {
            "is_sensitive": False,
            "sensitive_type": None,
            "feature_group": "categorical",
            "confidence": "medium",
            "method": "llm_simulated",
        }

    # Use data profile for inference
    if profile:
        if profile.get("is_likely_id"):
            return {
                "is_sensitive": False,
                "is_identifier": True,
                "sensitive_type": None,
                "feature_group": "identifier",
                "confidence": "medium",
                "method": "llm_simulated",
            }
        if profile.get("is_numeric"):
            return {
                "is_sensitive": False,
                "sensitive_type": None,
                "feature_group": "numerical",
                "confidence": "low",
                "method": "llm_simulated",
            }
        if profile.get("is_low_cardinality"):
            return {
                "is_sensitive": False,
                "sensitive_type": None,
                "feature_group": "categorical",
                "confidence": "low",
                "method": "llm_simulated",
            }

    # Default: classify as numerical feature
    return {
        "is_sensitive": False,
        "sensitive_type": None,
        "feature_group": "numerical",
        "confidence": "low",
        "method": "llm_simulated",
    }


def analyze_schema(
    columns: List[str], dataframe: pd.DataFrame = None
) -> Dict[str, Any]:
    """
    Main entry point: analyze dataset columns and produce structured schema config.

    Args:
        columns: List of column names from the dataset
        dataframe: Optional dataframe for Phase 1.5 data introspection

    Returns:
        Structured JSON schema config for all downstream layers
    """
    logger.info(f"Schema Analyzer: Processing {len(columns)} columns")

    target_column = None
    id_column = None
    sensitive_attributes = []
    feature_groups = {
        "demographic": [],
        "financial": [],
        "temporal": [],
        "categorical": [],
        "numerical": [],
        "identifier": [],
    }
    column_details = []
    data_profiles = {}
    ambiguous_columns = []

    # Phase 1.5: Data introspection (if dataframe provided)
    if dataframe is not None:
        for col in columns:
            if col in dataframe.columns:
                data_profiles[col] = _profile_column(dataframe[col], col)

    for col in columns:
        profile = data_profiles.get(col)

        # Phase 1: Rule-based
        classification = _classify_column_rule_based(col)

        # Phase 2: LLM for ambiguous
        if classification["confidence"] == "low":
            ambiguous_columns.append(col)
            llm_result = _llm_classify_column(col, profile)
            classification.update(llm_result)

        # Assign target
        if classification["is_target"]:
            target_column = col

        # Assign identifier
        if classification.get("is_identifier"):
            id_column = col

        # Assign sensitive attributes
        if classification["is_sensitive"]:
            sensitive_attributes.append(
                {
                    "column": col,
                    "type": classification["sensitive_type"],
                    "confidence": classification["confidence"],
                }
            )

        # Assign feature groups
        group = classification.get("feature_group")
        if group and group != "target" and group in feature_groups:
            feature_groups[group].append(col)

        classification["data_profile"] = profile
        column_details.append(classification)

    # Auto-detect ID column from data profiles if not found by name
    if id_column is None and data_profiles:
        for col, prof in data_profiles.items():
            if prof.get("is_likely_id") and col != target_column:
                id_column = col
                if col not in feature_groups["identifier"]:
                    feature_groups["identifier"].append(col)
                break

    # If no target found, look for the most likely candidate
    if target_column is None:
        for col in columns:
            if _normalize(col) in ["target", "y", "label", "class"]:
                target_column = col
                break
        if target_column is None:
            # Use last column as fallback (common convention)
            target_column = columns[-1]
            logger.warning(
                f"No target column detected, using last column: {target_column}"
            )

    # Detect domain from keywords for entity prefix suggestion
    entity_prefix = _detect_entity_prefix(columns, target_column)

    schema_output = {
        "target_column": target_column,
        "id_column": id_column,
        "entity_prefix": entity_prefix,
        "sensitive_attributes": sensitive_attributes,
        "sensitive_column_names": [sa["column"] for sa in sensitive_attributes],
        "feature_groups": feature_groups,
        "column_details": column_details,
        "data_profiles": data_profiles,
        "ambiguous_columns": ambiguous_columns,
        "total_columns": len(columns),
        "total_sensitive": len(sensitive_attributes),
        "analysis_method": "rule_based + data_introspection + llm_simulated",
    }

    logger.info(f"Schema Analysis Complete:")
    logger.info(f"   Target: {target_column}")
    logger.info(f"   ID Column: {id_column or 'None (auto-generated)'}")
    logger.info(f"   Entity Prefix: {entity_prefix}")
    logger.info(f"   Sensitive attributes: {len(sensitive_attributes)}")
    logger.info(f"   Ambiguous (LLM-resolved): {len(ambiguous_columns)}")

    return schema_output


def _detect_entity_prefix(columns: List[str], target_col: str) -> str:
    """Infer entity prefix from dataset context."""
    all_text = " ".join([c.lower() for c in columns]) + " " + target_col.lower()

    if any(
        w in all_text
        for w in ["student", "dropout", "enrollment", "semester", "curricular", "gpa"]
    ):
        return "STU"
    if any(w in all_text for w in ["loan", "credit", "mortgage", "default", "fico"]):
        return "APP"
    if any(
        w in all_text
        for w in ["patient", "diagnosis", "clinical", "medical", "hospital"]
    ):
        return "PAT"
    if any(
        w in all_text for w in ["employee", "hired", "candidate", "interview", "resume"]
    ):
        return "EMP"
    if any(w in all_text for w in ["customer", "churn", "subscription", "purchase"]):
        return "CUS"
    return "ENT"


def get_schema_summary(schema: Dict[str, Any]) -> str:
    """Generate a human-readable summary of the schema analysis."""
    lines = [
        f"Schema Analysis Summary",
        f"{'=' * 40}",
        f"Target Column: {schema['target_column']}",
        f"ID Column: {schema.get('id_column') or 'None (auto-generated)'}",
        f"Entity Prefix: {schema.get('entity_prefix', 'ENT')}",
        f"Total Columns Analyzed: {schema['total_columns']}",
        f"Sensitive Attributes Found: {schema['total_sensitive']}",
        "",
    ]

    if schema["sensitive_attributes"]:
        lines.append("Sensitive Attributes:")
        for sa in schema["sensitive_attributes"]:
            lines.append(
                f"   - {sa['column']} ({sa['type']}) -- Confidence: {sa['confidence']}"
            )

    lines.append("")
    lines.append("Feature Groups:")
    for group, cols in schema["feature_groups"].items():
        if cols:
            lines.append(f"   {group.title()}: {len(cols)} features")
            for c in cols[:5]:
                lines.append(f"      - {c}")
            if len(cols) > 5:
                lines.append(f"      ... and {len(cols) - 5} more")

    if schema["ambiguous_columns"]:
        lines.append("")
        lines.append(f"LLM-Resolved Columns: {len(schema['ambiguous_columns'])}")
        for c in schema["ambiguous_columns"][:5]:
            lines.append(f"   - {c}")

    return "\n".join(lines)
