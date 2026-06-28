# HRIS v.0 - Local Development Setup Guide

## Overview

HRIS v.0 is a comprehensive Human Resource Information System built with Next.js and SQLite. This guide walks you through setting up the application locally for development and testing.

## Prerequisites

- **Node.js**: v18.0.0 or higher
- **pnpm**: v8.0.0 or higher (or npm/yarn as alternatives)
- **Git**: For version control
- **SQLite**: Built-in (uses better-sqlite3 npm package)

## Installation Steps

### 1. Clone or Prepare the Project

```bash
# Navigate to project directory
cd /path/to/hris-v0-project
```

### 2. Install Dependencies

```bash
# Install all required packages
pnpm install

# Or if using npm:
npm install

# Or if using yarn:
yarn install
```

### 3. Initialize the Database

Run the setup script to create the database directory and initialize SQLite:

```bash
# Using npm script (recommended)
npm run setup

# Or manually:
bash scripts/setup.sh
```

This script will:
- Create the `./database` directory
- Initialize `hris_dev.sqlite` file
- Run migrations to create all tables
- Seed the failsafe account

### 4. Start the Development Server

```bash
npm run dev
```

The application will start on `http://localhost:3000`

## Database Configuration

### Database Location

- **File Path**: `./database/hris_dev.sqlite`
- **Auto-Migration**: Enabled on startup
- **Failsafe Account**: Always re-seeded during initialization

### Failsafe Credentials

```
Username: failsafe
Password: Knightfall1939
Role: DEV (Full System Access)
```

Use this account to access the system and reset data if needed.

## Testing with Sample Data

### Step 1: Access the Import Page

1. Login with failsafe credentials
2. Navigate to `/dashboard/import`

### Step 2: Download Sample Files

Sample DAT files are provided in the `public/` directory:

```
- public/sample_user.dat    (12 employees)
- public/sample_1_attlog.dat (63 attendance records)
```

Download these files to your local machine.

### Step 3: Import Employee Data

1. Go to **Import** → **Employees** tab
2. Upload `sample_user.dat`
3. System will:
   - Parse employee records
   - Create user accounts
   - Generate secure temporary passwords
   - Display credentials for download as CSV

**Important**: Download the credentials CSV immediately. Passwords cannot be recovered.

### Step 4: Import Attendance Data

1. Go to **Import** → **Attendance Logs** tab
2. Upload `sample_1_attlog.dat`
3. System will:
   - Parse punch records
   - Calculate daily attendance
   - Flag unmapped punches (orphan logs)
   - Update system status

### Step 5: Verify Import Success

1. Navigate to **System Status** page
2. Confirm record counts:
   - Employees: 12
   - Attendance Records: 63
   - Unmapped Punches: Should be 0 (if using sample data)

## Database Reset

To completely reset the database and re-seed the failsafe account:

```bash
npm run db:reset
```

**Warning**: This will delete all data and reset the system to initial state.

## Common Workflows

### Generate Payroll

1. Go to **Payroll** page
2. Select a period (e.g., "May 2026")
3. Click **Generate Payroll**
4. System calculates from attendance data using formulas
5. Review and approve payroll
6. Download payslips as PDF

### Submit Leave Request

1. Go to **Requests** → **Leave**
2. Fill in date range and reason
3. Submit (goes to manager/admin for approval)
4. Check status on **Approvals** page

### View Attendance Reports

1. Go to **Reports** → **Attendance**
2. Select date range and filters (department, employee)
3. View statistics:
   - Present/Absent/Late counts
   - Overtime hours
   - Attendance percentage
4. Export to CSV

### Configure Salary Grades (DEV Only)

1. Go to **Salary Grades** page
2. Add grades with:
   - Grade name (e.g., "Junior Developer")
   - Monthly amount
   - Frequency (Hourly/Daily/Weekly/Monthly)
3. System auto-calculates basic salary using salary_divisor (22 days)

## File Structure

```
hris-v0-project/
├── app/
│   ├── api/                 # API endpoints (import, payroll, requests, etc.)
│   ├── dashboard/           # Dashboard pages and features
│   └── (auth)/             # Authentication pages (login)
├── lib/
│   ├── db/
│   │   ├── database.ts      # SQLite configuration & migrations
│   │   ├── models.ts        # Data repositories
│   │   └── config.ts        # Database helpers
│   ├── auth/                # Authentication logic
│   ├── payroll/             # Payroll calculation engine
│   ├── validation/          # Zod schemas for validation
│   └── utils/               # Utility functions
├── components/              # React components
├── public/                  # Sample DAT files
├── database/                # SQLite database (created on setup)
├── scripts/
│   ├── setup.sh            # Database initialization script
│   └── db-reset.js         # Database reset script
└── SETUP.md                # This file
```

## Logging & Debugging

### Import Logging

During DAT file imports, detailed logs are output showing:
- Line number being processed
- Employee/attendance record parsed
- Any validation errors
- Unmapped records

Check browser console (F12) for real-time import status.

### Error Boundary

If a page encounters an error, the Error Boundary will catch it and display:
- "System Recovery" message
- Error details
- Retry button

Check browser console for full error stack trace.

## Troubleshooting

### Database File Already Exists

If you want to start fresh:

```bash
npm run db:reset
```

### Port 3000 Already in Use

```bash
# Use a different port
npm run dev -- -p 3001
```

### Sample Files Not Found

Download them directly from the import page, or access via:
```
http://localhost:3000/sample_user.dat
http://localhost:3000/sample_1_attlog.dat
```

### Import Fails with Validation Error

Common causes:
- Malformed DAT file (check tab/newline formatting)
- Missing required columns
- Invalid data types

Check the import error toast for specific details.

### Orphan Attendance Records

If `1_attlog.dat` contains employee IDs not in `user.dat`:
- Records are logged as "Unmapped Punches"
- Visible in System Status page
- Not added to employee records
- Can be fixed by importing employee data first

### Zero Payroll Calculation

Ensure:
1. Employees have a position assigned
2. Position is linked to a salary grade
3. Salary divisor is not 0 (default: 22)
4. Attendance records exist for the period

## Performance Tips

- First startup may be slower due to database initialization
- Subsequent startups are faster
- Large DAT imports (100+ records) show progress in real-time
- Payroll generation takes 2-5 seconds depending on employee count

## Next Steps

After setup, try:

1. **Login**: Use failsafe account to explore the system
2. **Import Data**: Test with sample files
3. **Create Requests**: Submit leave/OT/salary advance requests
4. **Approve Requests**: Switch to approver role on approvals page
5. **Generate Payroll**: Calculate and review payroll for a period
6. **View Reports**: Check attendance and analytics

## Support

For issues or questions:
- Check the error toast messages
- Review console logs (browser F12)
- Verify sample files are correctly formatted
- Ensure failsafe account has DEV role for full access

## Key Features

- ✅ SQLite persistence with auto-migration
- ✅ Secure password hashing (bcrypt)
- ✅ Zod-validated inputs on all APIs
- ✅ Error boundary preventing UI crashes
- ✅ Orphan log tracking for data integrity
- ✅ Zero-math protection in payroll engine
- ✅ Role-based access control (Employee/Manager/Admin/DEV)
- ✅ Complete payroll workflow (draft → approve → paid)
- ✅ Attendance reports with filtering and export
- ✅ Request workflow (submit → approve → complete)

---

**Last Updated**: May 2026  
**Version**: v0.1.0  
**Status**: Production-Ready for Local Development
