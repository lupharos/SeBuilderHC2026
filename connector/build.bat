@echo off
REM Build the Forcepoint HC Customer Connector into a single .exe.
REM
REM Prerequisites (run once on the build host):
REM   python -m pip install --upgrade pip
REM   python -m pip install -r requirements.txt pyinstaller
REM
REM Output: dist\forcepoint-hc-connector.exe  (single-file, no Python required on FSM)
REM
REM Hand the .exe to the customer together with the connector.json bundle
REM downloaded from the HC wizard's Step 3 Customer Connector card.

setlocal

echo Cleaning previous build artifacts...
if exist build           rmdir /s /q build
if exist dist            rmdir /s /q dist
if exist forcepoint-hc-connector.spec del /q forcepoint-hc-connector.spec

echo.
echo Building forcepoint-hc-connector.exe (PyInstaller --onefile)...
pyinstaller --onefile ^
            --console ^
            --name forcepoint-hc-connector ^
            --noconfirm ^
            main_v2.py

if errorlevel 1 (
    echo.
    echo BUILD FAILED. Check PyInstaller output above.
    exit /b 1
)

echo.
echo ============================================================
echo  Build complete:  dist\forcepoint-hc-connector.exe
echo.
echo  Ship to the customer alongside the connector.json bundle.
echo  Customer drops both files in the same folder and runs the .exe.
echo ============================================================
echo.

endlocal
