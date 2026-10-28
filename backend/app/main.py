from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base, SessionLocal
from .routers import workspace, dashboard, ingestion, cases, documents, compliance, alerts, reports, tasks, audit, lineage, obligations
from .routers.workspace import get_or_create_default_workspace

# Create DB tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AIClear API",
    description="Backend API for AIClear: Integrated AICTE Approval Workflow Automation, Compliance Monitoring, and Alert Management System",
    version="1.0.0"
)

# Enable CORS for local Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(workspace.router)
app.include_router(dashboard.router)
app.include_router(ingestion.router)
app.include_router(cases.router)
app.include_router(documents.router)
app.include_router(compliance.router)
app.include_router(alerts.router)
app.include_router(reports.router)
app.include_router(tasks.router)
app.include_router(audit.router)
app.include_router(lineage.router)
app.include_router(obligations.router)

@app.on_event("startup")
def startup_event():
    # Ensure default workspace and initial data exist on startup
    db = SessionLocal()
    try:
        get_or_create_default_workspace(db)
    finally:
        db.close()

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "AIClear Backend API",
        "version": "1.0.0",
        "database": "SQLite/PostgreSQL Dual Compatible",
        "compliance_engine": "Deterministic APH 2024-27 Specification"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
