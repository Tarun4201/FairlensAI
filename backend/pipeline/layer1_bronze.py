"""
Layer 1 · Bronze — Raw Ingestion (Domain-Agnostic)
=====================================================
Ingest ANY CSV dataset into storage. Enforce schema integrity.
No transformations — preserve source fidelity.
Supports: CSV file upload, demo presets, or custom dataframe.
"""

import os
import logging
import pandas as pd
import numpy as np
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
BRONZE_DIR = os.path.join(DATA_DIR, "bronze")
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")


# ── Demo Dataset Presets ──────────────────────────────────────────

DEMO_DATASETS = {
    "student_dropout": {
        "source": "uci",
        "id": 697,
        "description": "UCI Student Dropout & Academic Success — 4,424 students, 36 features",
        "entity_prefix": "STU",
    },
    "adult_income": {
        "source": "uci",
        "id": 2,
        "description": "UCI Adult Income — predict >50K income, 48,842 records",
        "entity_prefix": "CIT",
    },
}


def _ensure_dirs():
    """Ensure data directories exist."""
    os.makedirs(BRONZE_DIR, exist_ok=True)
    os.makedirs(UPLOADS_DIR, exist_ok=True)


def fetch_demo_dataset(dataset_key: str = "student_dropout") -> pd.DataFrame:
    """
    Fetch a demo dataset from UCI ML Repository or other sources.
    Falls back to cached CSV if available.
    """
    if dataset_key not in DEMO_DATASETS:
        raise ValueError(
            f"Unknown demo dataset: {dataset_key}. Available: {list(DEMO_DATASETS.keys())}"
        )

    config = DEMO_DATASETS[dataset_key]
    cached_path = os.path.join(BRONZE_DIR, f"demo_{dataset_key}.csv")

    # Try cached first
    if os.path.exists(cached_path):
        logger.info(f"Loading cached demo dataset '{dataset_key}'...")
        df = pd.read_csv(cached_path)
        logger.info(f"   Loaded {len(df)} rows, {len(df.columns)} columns from cache")
        return df

    # Fetch from UCI
    if config["source"] == "uci":
        logger.info(f"Fetching dataset from UCI ML Repository (ID={config['id']})...")
        try:
            from ucimlrepo import fetch_ucirepo

            dataset = fetch_ucirepo(id=config["id"])
            X = dataset.data.features
            y = dataset.data.targets
            df = pd.concat([X, y], axis=1)
            logger.info(f"   Fetched {len(df)} rows, {len(df.columns)} columns")

            # Cache it
            df.to_csv(cached_path, index=False)
            return df
        except Exception as e:
            logger.warning(
                f"UCI fetch failed ({e}), generating minimal synthetic dataset..."
            )
            return _generate_minimal_synthetic()

    raise ValueError(f"Unsupported source: {config['source']}")


def load_csv(csv_path: str) -> pd.DataFrame:
    """Load any CSV file as a dataframe."""
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    df = pd.read_csv(csv_path)
    logger.info(f"Loaded CSV: {csv_path} ({len(df)} rows, {len(df.columns)} columns)")
    return df


def _generate_minimal_synthetic(n_rows: int = 1000) -> pd.DataFrame:
    """
    Generate a minimal synthetic dataset for testing.
    Domain-agnostic — just demonstrates the pipeline can handle generic tabular data.
    """
    np.random.seed(42)

    df = pd.DataFrame(
        {
            "entity_id": [f"ENT-{i:05d}" for i in range(n_rows)],
            "age": np.random.normal(35, 12, n_rows).clip(18, 80).astype(int),
            "gender": np.random.choice([0, 1], n_rows, p=[0.48, 0.52]),
            "income": np.random.lognormal(10.5, 0.6, n_rows)
            .clip(15000, 200000)
            .astype(int),
            "score_a": np.random.normal(50, 15, n_rows).clip(0, 100),
            "score_b": np.random.normal(55, 12, n_rows).clip(0, 100),
            "category": np.random.choice(["A", "B", "C", "D"], n_rows),
            "flag_1": np.random.choice([0, 1], n_rows, p=[0.7, 0.3]),
            "flag_2": np.random.choice([0, 1], n_rows, p=[0.85, 0.15]),
            "region": np.random.choice(range(1, 8), n_rows),
            "target": np.random.choice([0, 1], n_rows, p=[0.7, 0.3]),
        }
    )

    return df


def validate_schema(df: pd.DataFrame) -> Dict[str, Any]:
    """Validate the ingested dataset schema."""
    validation = {
        "total_rows": len(df),
        "total_columns": len(df.columns),
        "columns": list(df.columns),
        "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
        "null_counts": df.isnull().sum().to_dict(),
        "has_nulls": bool(df.isnull().any().any()),
        "total_nulls": int(df.isnull().sum().sum()),
        "valid": True,
        "issues": [],
    }

    # Check minimum rows
    if len(df) < 50:
        validation["issues"].append(
            f"Dataset too small: {len(df)} rows (minimum 50 expected)"
        )
        validation["valid"] = False

    # Check minimum columns
    if len(df.columns) < 3:
        validation["issues"].append(
            f"Too few columns: {len(df.columns)} (minimum 3 expected)"
        )
        validation["valid"] = False

    return validation


def ingest(
    csv_path: str = None,
    dataframe: pd.DataFrame = None,
    dataset_key: str = "student_dropout",
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """
    Execute Bronze layer: ingest raw data with schema validation.

    Supports three input modes:
      1. csv_path: Load from a CSV file on disk
      2. dataframe: Use an already-loaded DataFrame
      3. dataset_key: Use a demo preset (default: student_dropout)

    Returns:
        Dict with ingestion results including validation info
    """
    _ensure_dirs()

    if force_refresh and dataset_key:
        dataset_cache = os.path.join(BRONZE_DIR, f"demo_{dataset_key}.csv")
        if os.path.exists(dataset_cache):
            os.remove(dataset_cache)

    if dataframe is not None:
        df = dataframe.copy()
        source = "dataframe"
    elif csv_path:
        df = load_csv(csv_path)
        source = f"csv:{csv_path}"
        output_path = csv_path
    else:
        dataset_cache = os.path.join(BRONZE_DIR, f"demo_{dataset_key}.csv")
        if os.path.exists(dataset_cache) and not force_refresh:
            df = pd.read_csv(dataset_cache)
            source = f"cached:{dataset_key}"
            logger.info(
                f"Loading cached {dataset_key}: {len(df)} rows x {len(df.columns)} cols"
            )
        else:
            df = fetch_demo_dataset(dataset_key)
            source = f"demo:{dataset_key}"
            output_path = os.path.join(BRONZE_DIR, f"demo_{dataset_key}.csv")
            df.to_csv(output_path, index=False)
            logger.info(f"Saved {dataset_key} to cache: {output_path}")
            return {
                "layer": "bronze",
                "status": "complete",
                "source": source,
                "output_path": output_path,
                "validation": validate_schema(df),
                "dataframe": df,
            }

    validation = validate_schema(df)
    logger.info(f"Schema Validation: {len(df)} rows x {len(df.columns)} cols")
    if validation["issues"]:
        for issue in validation["issues"]:
            logger.warning(f"   {issue}")

    output_path = csv_path if csv_path else os.path.join(BRONZE_DIR, "raw_dataset.csv")
    logger.info(f"Bronze output: {output_path}")

    return {
        "layer": "bronze",
        "status": "complete",
        "source": source,
        "output_path": output_path,
        "validation": validation,
        "dataframe": df,
    }
