# HRIS SQLite Integration & Fixes

## Overview
This document details the three critical fixes implemented to make the HRIS system fully functional with SQLite database persistence, proper form handling, and automated data linking.

---

## Issue 1: Fix .dat File Imports

### Problem
The import pages showed preview data but clicking "Import" did nothing because:
- The backend parser wasn't actually writing to the SQLite database
- The repositories were still using in-memory arrays from `config.ts`
- Parsed .dat data wasn't persisted across page refreshes

### Solution

#### Created SQLite Repository Layer (`lib/db/repositories.ts`)
- **EmployeeRepository**: `create()`, `findAll()`, `findById()`, `findByEmployeeId()`, `update()`, `delete()`
- **DepartmentRepository**: Full CRUD with SQLite prepared statements
- **AttendanceRepository** & **AttendanceLogRepository**: Handle both daily summaries and raw biometric logs
- **PayrollRepository**: Create and retrieve payroll records with employee joins
- **LeaveRequestRepository**, **OTRequestRepository**, **SalaryAdvanceRepository**: Request tracking
- **SalaryGradeRepository**, **PositionRepository**, **AreaRepository**, **ShiftRepository**, **FormulaRepository**: Master data

#### Updated Models Export (`lib/db/models.ts`)
- Removed in-memory repository definitions
- Now exports SQLite repositories that use `better-sqlite3` with prepared statements
- All queries are parameterized to prevent SQL injection

#### API Routes Already Using Repositories
- `/api/import/employees` - Parses user.dat and creates employees with auto-generated credentials
- `/api/import/attendance` - Parses 1_attlog.dat, matches biometric IDs to employee IDs, creates daily attendance records
  - **Handles orphan logs**: Unmapped punches (employee ID not found) are logged separately, preventing crashes
  - **Validates each line**: Format validation with detailed error reporting per line number
  - **Logs processing**: Console output shows exactly which line is being processed

#### Sample Files for Testing
- `public/sample_user.dat` - 12 employees across 6 departments
- `public/sample_1_attlog.dat` - 63 attendance records with realistic punch times

### Testing
```bash
npm run setup  # Initialize SQLite database
```
1. Go to `/dashboard/import`
2. Upload sample_user.dat → Imported successfully, credentials generated
3. Upload sample_1_attlog.dat → Records created, orphan logs logged
4. Refresh page → Data persists (now in SQLite!)

---

## Issue 2: Fix Missing Employees & Salary Dropdowns

### Problem
- Manual employee form submissions showed "Success" but data disappeared on refresh
- Salary grades didn't appear in employee dropdown
- Forms were still using mock state instead of hitting the database

### Solution

#### Fixed `/app/dashboard/employees/page.tsx`
- **Removed direct repository calls** from client component (was breaking with SQLite)
- **Added SWR for data fetching**: 
  ```javascript
  const { data: employeeData, mutate: mutateEmployees } = useSWR('/api/employees', fetcher);
  const { data: salaryData } = useSWR('/api/salary-grades', fetcher);
  ```
- **Automatic refresh**: After adding an employee, `mutateEmployees()` refetches the list from API
- Data now persists because it's stored in SQLite, not local state

#### API Routes Already Configured
- `/api/employees` (GET/POST)
  - POST: Creates employee via `EmployeeRepository.create()` → stored in SQLite
  - GET: Returns all employees from database
  
- `/api/salary-grades` (GET/POST)
  - POST: Creates salary grade via `SalaryGradeRepository.create()` → stored in SQLite
  - GET: Returns all active salary grades

### Testing
```bash
1. Go to /dashboard/employees
2. Add new employee → "Success" message
3. Refresh page → Employee still there (persisted in SQLite!)
4. Check salary grades dropdown → Now populated
5. Create salary grade → Appears immediately and persists
```

---

## Issue 3: Link All Tables Together (HRIS Automation)

### Problem
- Employees weren't automatically linked to their Shifts, Salary Grades, and Organization data
- Attendance reports didn't calculate derived data correctly
- Join queries weren't implemented

### Solution

#### Implemented SQL Joins in Repositories
Example from `PayrollRepository.findByPeriod()`:
```sql
SELECT p.*, e.name as employee_name, e.employee_id
FROM payroll p
JOIN employees e ON p.employee_id = e.id
WHERE p.period_start >= ? AND p.period_end <= ?
```

#### Updated API Routes to Return Joined Data
- `/api/payroll` - Returns payroll WITH employee name and ID
- `/api/reports/attendance` - Calculates:
  - Total hours worked per employee
  - Late deductions
  - OT hours from `ot_requests` joined to attendance
- All employee endpoints auto-include department data

#### Database Schema Relationships
```
employees → departments (employee.department_id)
employees → salary_grades (via position_id → positions.salary_grade_id)
employees → shifts (employee.shift_id)
attendance_logs → employees (log.employee_id)
daily_attendance → employees (attendance.employee_id)
payroll → employees (payroll.employee_id)
leave_requests → employees
ot_requests → employees
salary_advance_requests → employees
```

#### Attendance Report Auto-Calculations
- Daily attendance → Worked hours calculation
- OT requests → Joined with employee ID for reporting
- Salary advances → Linked to payroll
- All relationships enforced with SQLite foreign keys

### Testing
```bash
1. Import employees and attendance data
2. Go to /dashboard/reports/attendance
3. View summary shows:
   - Total hours per employee
   - Department breakdown
   - OT hours from linked requests
   - All data auto-calculated from database joins
```

---

## Architecture Decisions

### SQLite Over In-Memory
- **Why**: Persistence across restarts, handles 1000s of records efficiently
- **How**: `better-sqlite3` with prepared statements (safe & fast)
- **Storage**: `./database/hris_dev.sqlite` (auto-created)

### Separated Data Layers
- **lib/db/database.ts**: Raw SQLite initialization & migrations
- **lib/db/repositories.ts**: All CRUD operations with query builders
- **lib/db/models.ts**: Public API exports all repositories
- **app/api/\***: Route handlers use repositories exclusively

### Client Components Use APIs, Not Direct DB
- **Before**: `EmployeeRepository.findAll()` called from client (broke with SQLite)
- **After**: Client uses SWR to fetch from `/api/employees` → Server-side repository calls
- **Benefit**: Proper separation of concerns, works with any database backend

### Error Handling
- Input validation via `validateWithErrors()` in each route
- Orphan log tracking for unmatched attendance records
- Division by zero protection in payroll calculator
- Detailed console logging with line numbers during import

---

## Files Modified

### Core Database
- `lib/db/database.ts` - SQLite initialization (new)
- `lib/db/repositories.ts` - All CRUD repositories (new)
- `lib/db/models.ts` - Re-exports repositories

### API Routes (Updated to use SQLite)
- `app/api/employees/route.ts`
- `app/api/salary-grades/route.ts`
- `app/api/import/employees/route.ts`
- `app/api/import/attendance/route.ts`
- `app/api/payroll/route.ts`
- All other API routes using EmployeeRepository, etc.

### Client Components (Updated to use SWR)
- `app/dashboard/employees/page.tsx`
- All other pages importing from `/api/` endpoints

### New Dependencies
```json
{
  "better-sqlite3": "^9.0.0",
  "zod": "^3.22.0"
}
```

---

## Validation & Edge Cases

### Input Validation (Zod Schemas)
- Employee records: ID, name, department required
- Attendance logs: Employee ID, timestamp, state validated
- Salary grades: Grade name, amount, frequency required
- All validation errors reported with line numbers

### Edge Cases Handled
1. **Orphan Logs**: Employee ID in attendance file doesn't exist
   - ✅ Logged as "Unmapped Punch", doesn't crash import
   - Visible in import results for investigation

2. **Duplicate Employees**: Same employee_id in user.dat
   - ✅ Returns 409 Conflict, prevents duplicates

3. **Zero Math**: Division by zero in payroll
   - ✅ `safeDivide()` returns 0 instead of NaN/Infinity

4. **Missing Fields**: Incomplete .dat lines
   - ✅ Skipped with error message, import continues

5. **Database Not Initialized**: First run missing SQLite file
   - ✅ Auto-migration runs on first `ensureInitialized()` call

---

## Performance Notes

### SQLite Optimizations
- WAL (Write-Ahead Logging) enabled for concurrent access
- Foreign keys enforced for data integrity
- Prepared statements prevent SQL injection & improve performance
- Indexes on common queries (employee_id, date ranges)

### Import Performance
- Line-by-line processing with progress tracking
- Batch insert with transaction support
- Console logging shows real-time progress

---

## Next Steps

### To Deploy Locally
```bash
npm install
npm run setup  # Initialize database
npm run dev    # Start development server
```

### To Add New Entities
1. Add table definition in `lib/db/database.ts` migrations
2. Create repository in `lib/db/repositories.ts`
3. Export from `lib/db/models.ts`
4. Create API routes in `app/api/[entity]/route.ts`

### To Scale
- Consider Postgres for multi-user environment
- Repositories abstract database backend - minimal code changes needed
- All queries use prepared statements for safe parameterization
