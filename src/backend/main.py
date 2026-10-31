from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

try:
    from .supabase_client import supabase
    from .config import SUPABASE_URL, SUPABASE_SECRET_KEY
except ImportError:
    from supabase_client import supabase
    from config import SUPABASE_URL, SUPABASE_SECRET_KEY

app = FastAPI(
    title="VERITAS API",
    description="Evidence-first AI Research Assistant",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "VERITAS API is running"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.get("/test-supabase")
def test_supabase():
    """
    Non-destructive connectivity verification endpoint.
    Queries the 'papers' table to verify Supabase connection without leaking sensitive keys.
    """
    try:
        response = supabase.table("papers").select("id").limit(1).execute()
        return {
            "status": "connected",
            "database": "ok",
            "table_checked": "papers",
            "data": response.data,
            "message": "Successfully connected to Supabase and queried the papers table."
        }
    except Exception as exc:
        error_msg = str(exc)
        if SUPABASE_SECRET_KEY and SUPABASE_SECRET_KEY in error_msg:
            error_msg = error_msg.replace(SUPABASE_SECRET_KEY, "[REDACTED]")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "database": "failed",
                "table_checked": "papers",
                "detail": error_msg
            }
        )
