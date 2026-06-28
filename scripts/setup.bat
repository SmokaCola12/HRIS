@echo off
REM HRIS v.0 Setup Script for Windows
REM Creates database directory and initializes SQLite

echo.
echo ================================================
echo HRIS v.0 - Database Setup (Windows)
echo ================================================
echo.

REM Create database directory
if not exist "database" (
    echo Creating database directory...
    mkdir database
    echo ✓ Database directory created
) else (
    echo ✓ Database directory already exists
)

REM Install dependencies if needed
echo.
echo Checking dependencies...
if not exist "node_modules" (
    echo Installing npm packages...
    call npm install
    echo ✓ Dependencies installed
) else (
    echo ✓ Dependencies already installed
)

REM Initialize database with migrations
echo.
echo Initializing SQLite database...
node -e "const {runMigrations} = require('./lib/db/database'); runMigrations(); console.log('✓ Database initialized with migrations');"

echo.
echo ================================================
echo Setup Complete!
echo ================================================
echo.
echo Database location: database\hris_dev.sqlite
echo.
echo Next steps:
echo 1. Run 'npm run dev' to start the development server
echo 2. Login with failsafe / Knightfall1939
echo 3. Upload sample_user.dat and sample_1_attlog.dat files
echo.
