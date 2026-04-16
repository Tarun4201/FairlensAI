"""
Layer 2 · Silver — Feature Engineering (Domain-Agnostic)
==========================================================
Generic null handling, categorical encoding, and universal feature
engineering. Uses AI schema output to route column treatment.
Sensitive attributes preserved separately for audit.

No hardcoded column names — all strategies driven by schema + data profile.
"""

import os
import re
import logging
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
SILVER_DIR = os.path.join(DATA_DIR, "silver")


def _ensure_dirs():
    os.makedirs(SILVER_DIR, exist_ok=True)


def _prepare_target(
    df: pd.DataFrame,
    target_col: str,
    positive_class: Optional[str] = None
) -> pd.DataFrame:
    """
    Convert target to binary.
    Domain-agnostic: auto-detects positive class from data if not specified.
    """
    df = df.copy()

    if df[target_col].dtype == object or df[target_col].dtype.name == 'category':
        unique_vals = df[target_col].unique()
        n_unique = len(unique_vals)

        if positive_class:
            # User-specified positive class
            df["target_binary"] = (df[target_col] == positive_class).astype(int)
            logger.info(f"   Target: '{positive_class}' = 1 (user-specified)")
        elif n_unique == 2:
            # Binary: use minority class as positive (risk convention)
            counts = df[target_col].value_counts()
            positive = counts.idxmin()
            df["target_binary"] = (df[target_col] == positive).astype(int)
            logger.info(f"   Target: '{positive}' = 1 (minority class)")
        elif n_unique <= 5:
            # Multi-class: look for common positive indicators
            positive_indicators = ["yes", "true", "1", "positive", "default",
                                   "dropout", "churn", "fraud", "bad", "fail",
                                   "hired", "approved", "survived"]
            matched = None
            for val in unique_vals:
                if str(val).lower().strip() in positive_indicators:
                    matched = val
                    break
            if matched:
                df["target_binary"] = (df[target_col] == matched).astype(int)
                logger.info(f"   Target: '{matched}' = 1 (keyword match)")
            else:
                # Fallback: combine non-majority as positive
                majority = df[target_col].value_counts().idxmax()
                df["target_binary"] = (df[target_col] != majority).astype(int)
                logger.info(f"   Target: NOT '{majority}' = 1 (non-majority)")
        else:
            # Too many classes — binarize by median
            logger.warning(f"   Target has {n_unique} unique values, binarizing by median")
            try:
                numeric_vals = pd.to_numeric(df[target_col], errors='coerce')
                df["target_binary"] = (numeric_vals > numeric_vals.median()).astype(int)
            except Exception:
                counts = df[target_col].value_counts()
                positive = counts.idxmin()
                df["target_binary"] = (df[target_col] == positive).astype(int)
    else:
        # Already numeric
        if df[target_col].nunique() == 2:
            vals = sorted(df[target_col].unique())
            df["target_binary"] = (df[target_col] == vals[1]).astype(int)
        else:
            # Binarize: above median = 1
            df["target_binary"] = (df[target_col] > df[target_col].median()).astype(int)

    logger.info(f"   Target distribution: {df['target_binary'].value_counts().to_dict()}")
    return df


def _handle_nulls(df: pd.DataFrame) -> pd.DataFrame:
    """Impute missing values based on column type."""
    df = df.copy()
    imputed_count = 0
    for col in df.columns:
        if df[col].isnull().any():
            n_nulls = df[col].isnull().sum()
            if df[col].dtype in [np.float64, np.int64, np.float32, np.int32, float, int]:
                median_val = df[col].median()
                df[col].fillna(median_val, inplace=True)
            else:
                mode_val = df[col].mode()[0] if len(df[col].mode()) > 0 else "Unknown"
                df[col].fillna(mode_val, inplace=True)
            imputed_count += 1

    if imputed_count > 0:
        logger.info(f"   Imputed nulls in {imputed_count} columns")
    return df


def _encode_categoricals(df: pd.DataFrame, exclude_cols: set) -> pd.DataFrame:
    """Encode categorical columns using ordinal encoding."""
    df = df.copy()
    encoded = []
    for col in df.columns:
        if col in exclude_cols:
            continue
        if df[col].dtype == object or df[col].dtype.name == 'category':
            df[col] = pd.Categorical(df[col]).codes
            encoded.append(col)

    if encoded:
        logger.info(f"   Encoded {len(encoded)} categorical columns")
    return df


def _engineer_generic_features(
    df: pd.DataFrame,
    schema: Dict[str, Any]
) -> pd.DataFrame:
    """
    Generic feature engineering strategies.
    No hardcoded column names — driven by schema data profiles.
    """
    df = df.copy()
    new_features = []

    numeric_cols = [col for col in df.columns
                    if df[col].dtype in [np.float64, np.int64, np.float32, np.int32, float, int]
                    and col not in {"target_binary"}]

    # Strategy 1: Detect paired temporal columns and create deltas
    # Look for columns with similar names that differ by a number/period
    paired = _find_paired_columns(numeric_cols)
    for col_a, col_b, pair_name in paired:
        delta_name = f"delta_{pair_name}"
        df[delta_name] = df[col_b] - df[col_a]
        new_features.append(delta_name)

    # Strategy 2: Create ratio features for semantically paired columns
    # e.g., if we have X_approved and X_enrolled, create X_approval_rate
    ratio_pairs = _find_ratio_pairs(numeric_cols)
    for numerator, denominator, ratio_name in ratio_pairs:
        denominator_vals = df[denominator].replace(0, np.nan)
        df[ratio_name] = df[numerator] / denominator_vals
        df[ratio_name].fillna(0, inplace=True)
        new_features.append(ratio_name)

    # Strategy 3: Binary flag aggregation
    binary_cols = [col for col in numeric_cols if df[col].nunique() == 2]
    if len(binary_cols) >= 3:
        df["binary_flag_sum"] = df[binary_cols].sum(axis=1)
        new_features.append("binary_flag_sum")

    if new_features:
        logger.info(f"   Engineered {len(new_features)} new features: {new_features[:5]}")

    return df


def _find_paired_columns(cols: List[str]) -> List[tuple]:
    """Find pairs of columns that differ by a number (temporal pattern)."""
    pairs = []
    seen = set()

    # Pattern: "X 1st sem (Y)" and "X 2nd sem (Y)" or "column_1" and "column_2"
    for i, col_a in enumerate(cols):
        for col_b in cols[i+1:]:
            key = (col_a, col_b)
            if key in seen:
                continue

            # Check if they differ by exactly one number
            norm_a = re.sub(r'\d+', '#', col_a.lower())
            norm_b = re.sub(r'\d+', '#', col_b.lower())

            if norm_a == norm_b and norm_a.count('#') >= 1:
                # Extract the differing numbers
                nums_a = re.findall(r'\d+', col_a)
                nums_b = re.findall(r'\d+', col_b)
                if nums_a and nums_b and nums_a != nums_b:
                    # Create a clean pair name
                    base = re.sub(r'\d+', '', col_a.lower()).strip().replace('  ', ' ')
                    base = re.sub(r'[^a-z0-9]+', '_', base).strip('_')
                    pairs.append((col_a, col_b, base))
                    seen.add(key)

            if len(pairs) >= 10:  # Limit to avoid combinatorial explosion
                return pairs

    return pairs


def _find_ratio_pairs(cols: List[str]) -> List[tuple]:
    """Find pairs where one is semantically a subset of another (e.g., approved/enrolled)."""
    ratio_keywords = {
        "approved": "enrolled",
        "success": "total",
        "passed": "attempted",
        "correct": "total",
        "completed": "started",
        "won": "played",
        "positive": "total"
    }

    pairs = []
    col_lower_map = {c.lower(): c for c in cols}

    for numer_kw, denom_kw in ratio_keywords.items():
        numer_cols = [c for c in cols if numer_kw in c.lower()]
        denom_cols = [c for c in cols if denom_kw in c.lower()]

        for nc in numer_cols:
            for dc in denom_cols:
                # Check they share a common prefix
                nc_base = nc.lower().replace(numer_kw, "").strip()
                dc_base = dc.lower().replace(denom_kw, "").strip()
                if nc_base and dc_base and (nc_base in dc_base or dc_base in nc_base):
                    ratio_name = f"ratio_{re.sub(r'[^a-z0-9]+', '_', nc_base).strip('_')}"
                    pairs.append((nc, dc, ratio_name))

    return pairs[:5]  # Limit


def transform(
    bronze_df: pd.DataFrame,
    schema: Dict[str, Any],
    positive_class: Optional[str] = None
) -> Dict[str, Any]:
    """
    Execute Silver layer: feature engineering and transformation.

    Args:
        bronze_df: Raw dataframe from Bronze layer
        schema: Output from Schema Analyzer (Layer 0)
        positive_class: Optional name of positive class for target binarization

    Returns:
        Dict with Silver layer results
    """
    _ensure_dirs()

    logger.info("Silver Layer: Starting feature engineering...")

    target_col = schema["target_column"]
    sensitive_cols = schema["sensitive_column_names"]
    id_column = schema.get("id_column")

    df = bronze_df.copy()

    # 1. Prepare binary target
    df = _prepare_target(df, target_col, positive_class)

    # 2. Handle nulls
    df = _handle_nulls(df)

    # 3. Generic feature engineering (driven by schema)
    df = _engineer_generic_features(df, schema)

    # 4. Encode categoricals
    exclude_from_encoding = {target_col, "target_binary"}
    if id_column:
        exclude_from_encoding.add(id_column)
    df = _encode_categoricals(df, exclude_from_encoding)

    # 5. Identify feature columns (exclude target, binary target, and ID)
    exclude_cols = {target_col, "target_binary"}
    if id_column:
        exclude_cols.add(id_column)
    feature_cols = [c for c in df.columns if c not in exclude_cols]

    # 6. Separate sensitive attributes for audit
    available_sensitive = [c for c in sensitive_cols if c in df.columns]
    sensitive_df = df[available_sensitive].copy() if available_sensitive else pd.DataFrame()

    # 7. Save Silver data
    silver_path = os.path.join(SILVER_DIR, "features.csv")
    df.to_csv(silver_path, index=False)

    sensitive_path = os.path.join(SILVER_DIR, "sensitive_attributes.csv")
    sensitive_df.to_csv(sensitive_path, index=False)

    logger.info(f"Silver layer complete: {len(df)} rows, {len(feature_cols)} features")
    logger.info(f"   Sensitive attributes preserved: {len(available_sensitive)} columns")
    logger.info(f"   Silver data saved: {silver_path}")

    return {
        "layer": "silver",
        "status": "complete",
        "output_path": silver_path,
        "dataframe": df,
        "sensitive_df": sensitive_df,
        "feature_columns": feature_cols,
        "target_column": "target_binary",
        "original_target": target_col,
        "id_column": id_column,
        "engineered_features": [c for c in df.columns if c not in bronze_df.columns and c != "target_binary"],
        "total_features": len(feature_cols)
    }
