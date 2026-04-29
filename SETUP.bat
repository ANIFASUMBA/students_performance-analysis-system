@echo off
echo.
echo ============================================================
echo   STUDENT PERFORMANCE ANALYSIS SYSTEM - SETUP WIZARD
echo ============================================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH.
    echo Please install Python 3.10+ and add it to your system PATH.
    pause
    exit /b 1
)

echo [1/4] Creating virtual environment...
python -m venv venv
if errorlevel 1 (
    echo ERROR: Failed to create virtual environment.
    pause
    exit /b 1
)

echo [2/4] Activating virtual environment and installing dependencies...
call venv\Scripts\activate.bat
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo ERROR: Failed to install dependencies.
    pause
    exit /b 1
)

echo [3/4] Setting up .env file...
if not exist .env (
    echo Creating .env from .env.example...
    copy .env.example .env >nul
    echo.
    echo ^^! IMPORTANT: Edit .env and fill in your API keys:
    echo   - SUPABASE_KEY (required)
    echo   - COD_PASSWORD and DEAN_PASSWORD (optional, for demo)
    echo   - GROQ_API_KEY (optional, for AI advisor)
    echo   - AT_API_KEY (optional, for SMS notifications)
    echo.
    timeout /t 3 >nul
) else (
    echo .env already exists, skipping template copy.
)

echo [4/4] Done!
echo.
echo ============================================================
echo   NEXT STEPS:
echo ============================================================
echo 1. Edit .env with your API keys
echo 2. Run the backend:
echo    python -m uvicorn backend.app.main:app --reload
echo 3. Open frontend/index.html in your browser
echo ============================================================
echo.
pause
