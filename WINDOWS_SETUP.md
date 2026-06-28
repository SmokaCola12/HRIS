# HRIS v.0 - Windows Setup Guide

## Quick Start for Windows

### Step 1: Install Node.js
Download and install from: https://nodejs.org/ (LTS version recommended)

Verify installation:
```powershell
node --version
npm --version
```

### Step 2: Clone/Download Project
Navigate to your project directory:
```powershell
cd C:\Users\YourName\Documents\hris
```

### Step 3: Install Dependencies
```powershell
npm install
```

### Step 4: Initialize Database

**Option A: Using Batch Script (Recommended for Command Prompt)**
```cmd
scripts\setup.bat
```

**Option B: Using PowerShell**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

**Option C: Using npm command (auto-detects OS)**
```powershell
npm run setup
```

### Step 5: Start Development Server
```powershell
npm run dev
```

This will start the server at `http://localhost:3000`

### Step 6: Login
- Username: `failsafe`
- Password: `Knightfall1939`

### Step 7: Test with Sample Data
1. Go to `/dashboard/import`
2. Download sample files:
   - `sample_user.dat` (from `/public` folder)
   - `sample_1_attlog.dat` (from `/public` folder)
3. Upload them to test the import functionality

## Checking Your Database

### View Database File
After setup, your database will be at: `database\hris_dev.sqlite`

Check if it exists:
```powershell
# Using PowerShell
Get-ChildItem database\

# Or using Command Prompt
dir database\
```

### Query Database (Optional - requires SQLite CLI)
If you have SQLite3 installed, you can query directly:
```powershell
sqlite3 database\hris_dev.sqlite ".tables"
```

## Troubleshooting

### Issue: "bash is not recognized"
**Solution:** Use one of the Windows-specific commands above:
- `scripts\setup.bat` (Command Prompt)
- `powershell -ExecutionPolicy Bypass -File scripts\setup.ps1` (PowerShell)

### Issue: Database file not created
**Solution:** The database is created automatically on first app startup. Make sure:
1. The `database/` directory exists
2. The app is running (`npm run dev`)
3. Check for errors in the console

### Issue: PowerShell execution policy error
**Solution:** Run PowerShell as Administrator and execute:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Issue: Permission denied on database
**Solution:** Windows might lock the database file if the app is still running. 
1. Stop the dev server (Ctrl+C)
2. Close any other HRIS windows
3. Try again

## File Structure

```
C:\Users\YourName\Documents\hris\
├── database\                    # SQLite database location
│   └── hris_dev.sqlite         # Your actual database file
├── scripts\
│   ├── setup.bat               # Windows Batch setup
│   ├── setup.ps1               # PowerShell setup
│   └── setup.sh                # Linux/Mac setup
├── public\
│   ├── sample_user.dat         # Sample employee data
│   └── sample_1_attlog.dat     # Sample attendance data
├── app\
│   ├── api\                    # API routes
│   └── dashboard\              # Dashboard pages
├── lib\
│   └── db\
│       ├── database.ts         # SQLite configuration
│       └── repositories.ts     # Database operations
└── package.json
```

## Common Commands

```powershell
# Development
npm run dev                      # Start dev server

# Database
npm run setup                    # Initialize database (auto-detects Windows)
npm run db:reset                # Reset database to fresh state

# Build
npm run build                    # Production build
npm start                        # Run production server

# Code Quality
npm run lint                     # Run ESLint
```

## Next Steps

1. Test the import functionality with sample DAT files
2. Create employees and salary grades
3. Test payroll generation
4. Verify attendance reporting

## Support

If you encounter issues:
1. Check the console output for error messages
2. Verify the `database\hris_dev.sqlite` file exists
3. Make sure no other instance of the app is running
4. Restart the dev server with `npm run dev`
