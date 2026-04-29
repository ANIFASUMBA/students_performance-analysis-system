Write-Host "`n============================================================"
Write-Host "  STUDENT PERFORMANCE ANALYSIS SYSTEM - SETUP WIZARD"
Write-Host "============================================================`n"

# Check if Python is installed
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "ERROR: Python is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Python 3.10+ and add it to your system PATH."
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[1/4] Creating virtual environment..."
python -m venv venv
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to create virtual environment." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[2/4] Activating virtual environment and installing dependencies..."
& ".\venv\Scripts\Activate.ps1"
pip install -r requirements.txt --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install dependencies." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[3/4] Setting up .env file..."
if (-not (Test-Path ".env")) {
    Write-Host "Creating .env from .env.example..."
    Copy-Item ".env.example" ".env"
    Write-Host "`n! IMPORTANT: Edit .env and fill in your API keys:" -ForegroundColor Yellow
    Write-Host "  - SUPABASE_KEY (required)"
    Write-Host "  - COD_PASSWORD and DEAN_PASSWORD (optional, for demo)"
    Write-Host "  - GROQ_API_KEY (optional, for AI advisor)"
    Write-Host "  - AT_API_KEY (optional, for SMS notifications)"
    Start-Sleep -Seconds 3
} else {
    Write-Host ".env already exists, skipping template copy."
}

Write-Host "`n[4/4] Done!"
Write-Host "`n============================================================"
Write-Host "  NEXT STEPS:"
Write-Host "============================================================"
Write-Host "1. Edit .env with your API keys"
Write-Host "2. Run the backend:"
Write-Host "   python -m uvicorn backend.app.main:app --reload"
Write-Host "3. Open frontend/index.html in your browser"
Write-Host "============================================================`n"
Read-Host "Press Enter to exit"
