# CSV and XLSX ingestion

The Institutional Data Ingestion Workstation accepts `.csv` and `.xlsx` files up to 5 MB. For XLSX, the first worksheet is used and its first row must contain the schema headers. The same validation and preview/commit integrity checks apply to both formats.

## XLSX dependency

Install the workbook reader in the Python environment used to run the backend:

```powershell
python -m pip install openpyxl
```

## Required columns

`aicte_permanent_id`, `institute_name`, `case_reference`, `workflow_type`, `target_date`, and `internal_owner_name`.

Optional columns include `institute_type`, `state`, `district`, `academic_period`, `current_stage`, `priority`, and `notes`. Dates should be real Excel dates or text in `YYYY-MM-DD` format. Keep the first row for headers and put records on subsequent rows.

Each preview has a short-lived, single-use token. Commit only the records returned by that preview; altered records, expired previews, and replayed commits are rejected.
