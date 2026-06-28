# HRIS v.0 Setup Script for Windows PowerShell
# Creates database directory and initializes SQLite

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "HRIS v.0 - Database Setup (PowerShell)" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Create database directory
if (-not (Test-Path "database")) {
    Write-Host "Creating database directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "database" | Out-Null
    Write-Host "✓ Database directory created" -ForegroundColor Green
} else {
    Write-Host "✓ Database directory already exists" -ForegroundColor Green
}

# Install dependencies if needed
Write-Host ""
Write-Host "Checking dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing npm packages..." -ForegroundColor Yellow
    npm install
    Write-Host "✓ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "✓ Dependencies already installed" -ForegroundColor Green
}

# Initialize database with migrations
Write-Host ""
Write-Host "Initializing SQLite database..." -ForegroundColor Yellow
node -e "const {runMigrations} = require('./lib/db/database'); runMigrations(); console.log('✓ Database initialized with migrations');"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Database location: database\hris_dev.sqlite" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Run 'npm run dev' to start the development server" -ForegroundColor White
Write-Host "2. Login with failsafe / Knightfall1939" -ForegroundColor White
Write-Host "3. Upload sample_user.dat and sample_1_attlog.dat files" -ForegroundColor White
Write-Host ""
