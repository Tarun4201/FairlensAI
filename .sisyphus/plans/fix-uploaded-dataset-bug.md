# Fix: Uploaded Dataset Pipeline Bug

## TL;DR

> **Quick Summary**: Fix bug where selected dataset (adult_income/uploaded) is ignored and cached student dropout data is always used instead.
> 
> **Deliverables**: Fix dataset selection logic in main.py and caching in layer1_bronze.py
> - [ ] Fix main.py to pass force_refresh=True for uploaded datasets
> - [ ] Fix layer1_bronze.py to detect source changes
> - [ ] Verify adult_income runs correctly
> 
> **Estimated Effort**: Short (2-3 files, ~30 min)
> **Parallel Execution**: NO - sequential fixes
> **Critical Path**: Fix main.py → Fix layer1_bronze.py → Verify

---

## Context

### Original Problem
User selects "adult_income" or uploads a CSV, runs pipeline, but fairness audit shows "student dropout" data instead.

### Root Causes Identified
1. **main.py:183** - `dataset_key = dataset_key or "student_dropout"` overwrites None with "student_dropout"
2. **layer1_bronze.py:178-186** - Cache checking always loads from raw_dataset.csv 
3. **layer1_bronze.py:196-198** - All data saves to same cache file, breaking subsequent runs

### Screenshots Confirmed
User selects adult_income → Fairness Audit shows "Student dropout" → Bug confirmed!

---

## Work Objectives

### Core Objective
Pipeline must process the actual selected dataset, not ignore selection and use cached data.

### Must Fix
- [ ] main.py - Pass force_refresh=True for uploaded/demo datasets to bypass cache
- [ ] layer1_bronze.py - Detect source changes or save to source-specific cache file

### Must NOT Change
- [ ] Demo dataset fetching logic (should still work)
- [ ] Upload API (works correctly)
- [ ] Schema analyzer (works correctly)

---

## Fix Implementation

### Task 1: Fix main.py (main.py)

**What to do**:
- Line ~182-183: Pass force_refresh=True when dataset is NOT "student_dropout" (the default cached one)
- Keep force_refresh=request.force_refresh for user overrides

**Code to change**:
```python
# In run_pipeline_endpoint(), around line 181:
force = request.force_refresh
if request.dataset == "uploaded" or request.dataset != "student_dropout":
    force = True  # Bypass cache for non-default datasets

result = run_pipeline(
    csv_path=csv_path,
    dataset_key=dataset_key or "student_dropout",
    positive_class=request.positive_class,
    entity_prefix=request.entity_prefix,
    force_refresh=force  # Use calculated force, not request.force_refresh alone
)
```

**Alternative - Simpler fix**:
```python
# Just always force refresh when NOT using default:
force_refresh = request.force_refresh or (request.dataset not in ["student_dropout", "adult_income"])
```

---

### Task 2: Fix layer1_bronze.py caching (layer1_bronze.py)

**What to do**:
- Lines ~178-186: Add source-specific caching or detect changes
- Save uploaded data to source-specific file (e.g., bronze/uploaded.csv)

**Code to change**:
```python
# Around line 177, after csv_path check:
elif csv_path:
    df = load_csv(csv_path)
    source = f"csv:{csv_path}"
    # Save to source-specific file, not raw_dataset.csv
    # This prevents uploaded data from overwriting demo cache
else:
    # Existing cache logic for demos
    ...
```

**Better approach** - don't save to raw_dataset.csv at all for uploaded data:
```python
# In ingest() output section (lines 196-198):
if source.startswith("csv:"):
    # Don't cache uploaded data to raw_dataset.csv
    # Just keep it in memory OR save to separate path
    output_path = csv_path  # Use original path
else:
    output_path = os.path.join(BRONZE_DIR, "raw_dataset.csv")
    df.to_csv(output_path, index=False)
```

---

### Task 3: Verify with adult_income

**QA Scenarios**:

Scenario: Run with adult_income dataset
  Tool: Bash
  Preconditions: Server running, no force_refresh
  Steps:
    1. Run pipeline with dataset="adult_income"
    2. Check fairness audit shows "Adult Income" or UCI Adult data columns
  Expected Result: Fairness audit shows adult income columns (age, education, occupation, etc.)
  Evidence: Screenshot of fairness audit showing correct dataset

Scenario: Run with uploaded CSV
  Tool: Bash
  Preconditions: uploaded_dataset.csv exists
  Steps:
    1. Upload a CSV
    2. Run pipeline with dataset="uploaded"
    3. Check schema shows correct columns
  Expected Result: Schema analyzer shows uploaded CSV columns
  Evidence: Screenshot of schema tab

---

## Final Verification

- [ ] Run pipeline with adult_income → Verify shows Adult Income data
- [ ] Run pipeline with uploaded CSV → Verify shows uploaded columns
- [ ] Run pipeline again with student_dropout → Verify still works (no regression)