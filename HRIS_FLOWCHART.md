# HRIS v.0 - Complete Application Flowchart & Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    HRIS v.0 System Architecture                 │
└─────────────────────────────────────────────────────────────────┘

                           ┌──────────────┐
                           │   USER LOGIN │
                           └──────┬───────┘
                                  │
                  ┌───────────────┴───────────────┐
                  │                               │
           ┌──────▼──────┐            ┌──────────▼──────┐
           │   Failsafe  │            │  Regular User   │
           │  (Admin)    │            │  (Employee)     │
           └──────┬──────┘            └──────────┬──────┘
                  │                               │
                  │                               │
       ┌──────────▼──────────────────────────────▼──────────┐
       │           DASHBOARD (Main Hub)                     │
       │  - Overview Stats                                 │
       │  - Quick Links                                    │
       │  - System Initialization (for Admin)              │
       └──────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┼─────────────────────────────────┐
        │             │                                 │
        │             │                                 │
   ┌────▼────┐  ┌────▼────┐  ┌─────────┴────┐  ┌──────▼──────┐
   │ ADMIN   │  │EMPLOYEE │  │   REPORTS    │  │   SYSTEM    │
   │ MODULES │  │ MODULES │  │   MODULES    │  │   SETTINGS  │
   └────┬────┘  └────┬────┘  └──────┬───────┘  └──────┬──────┘
        │             │              │                 │
        │             │              │                 │
   ┌────▼──────────┐ ┌▼────────────┐ ┌▼──────────────┐ ┌▼─────────┐
   │ 1. SYSTEM     │ │ 1. PROFILE  │ │1. ATTENDANCE │ │• DATA    │
   │  └ Data       │ │  └ View     │ │  └ Daily     │ │ IMPORT   │
   │    Import     │ │  └ Edit     │ │  └ Monthly   │ │  └ Upload│
   │  └ Organization│ │  └ Photo    │ │  └ Trends    │ │    Files │
   │    Setup      │ │             │ │             │ │• STATUS  │
   │  └ System     │ │ 2. REQUESTS │ │2. PAYROLL    │ │  └ Check │
   │    Status     │ │  └ Leave    │ │  └ Slips     │ │    Import│
   │             │ │  └ OT        │ │  └ Deduction │ │• FORMULAS│
   │ 2.MANAGE     │ │  └ Salary   │ │  └ Summary   │ │  └ Config│
   │  EMPLOYEES   │ │    Advance  │ │             │ │• RULES   │
   │  └ List      │ │  └ Status   │ │3. LEAVES     │ │  └ Add   │
   │  └ Add/Edit  │ │  └ Tracking │ │  └ Balance   │ │    Rules │
   │  └ Details   │ │             │ │  └ Calendar  │ │         │
   │             │ │ 3. PROFILE   │ │             │ │         │
   │ 3. APPROVALS │ │  └ Settings │ │4. ALLOWANCES│ │         │
   │  └ View All  │ │  └ Password │ │  └ Summary   │ │         │
   │  └ Approve   │ │             │ │             │ │         │
   │  └ Reject    │ │ 4. DOWNLOADS│ │5. DEDUCTIONS│ │         │
   │             │ │  └ Payslips │ │  └ Summary   │ │         │
   │ 4. PAYROLL   │ │  └ Docs     │ │             │ │         │
   │  └ Period    │ │             │ │6. EMPLOYEES │ │         │
   │  └ Salary    │ │             │ │  └ List      │ │         │
   │    Slips     │ │             │ │  └ Details   │ │         │
   │  └ Payoff    │ │             │ │             │ │         │
   │             │ │             │ │7. ATTENDANCE│ │         │
   │ 5. ORGANIZE │ │             │ │  └ Records   │ │         │
   │  └ Depart    │ │             │ │  └ Summary   │ │         │
   │  └ Positions │ │             │ │             │ │         │
   │  └ Areas     │ │             │ │             │ │         │
   │  └ Shifts    │ │             │ │             │ │         │
   │             │ │             │ │             │ │         │
   └────┬────────┘ └──────┬──────┘ └──────┬──────┘ └─────┬────┘
        │                 │               │             │
        └─────────────────┼───────────────┴─────────────┘
                          │
                          │
                    ┌─────▼──────┐
                    │  LOGOUT    │
                    └────────────┘
```

---

## Feature Matrix by User Role

### Admin User (failsafe)

| Module | Features | Purpose |
|--------|----------|---------|
| **Data Import** | Upload department.dat, user.dat, 1_attlog.dat | Populate system from ZKTeco files |
| **Organization** | Manage Departments, Positions, Areas, Shifts | Define company structure |
| **Employee Management** | Add/Edit/Delete employees, assign roles | Manage workforce |
| **Approvals** | Review all pending requests (Leave, OT, Advance) | Approve/Reject employee requests |
| **Payroll** | Create payroll period, generate payslips, payoff | Calculate salaries |
| **Reports** | Attendance, Payroll, Leave analytics | Monitor KPIs |
| **System** | Status checks, formula configuration, rule setup | System configuration |

### Employee User (Regular)

| Module | Features | Purpose |
|--------|----------|---------|
| **Profile** | View details, edit personal info, upload photo | Manage personal data |
| **Requests** | Submit leave, OT, salary advance requests | Request time off/money |
| **Attendance** | View daily records, monthly summary, clock in/out | Track working hours |
| **Payroll** | View payslips, breakdown, deductions | Monitor salary |
| **Leave** | View balance, calendar, request history | Manage leave |
| **Downloads** | Download payslips, documents | Get official records |

---

## Data Flow Diagrams

### 1. LOGIN FLOW

```
┌──────────────────┐
│  User enters     │
│  credentials     │
│  (test/test123)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────┐
│ POST /api/auth/login         │
│ - Hash password              │
│ - Compare with DB hash       │
│ - Create session cookie      │
└────────┬─────────────────────┘
         │
    ┌────┴──────┐
    │            │
    ▼            ▼
┌─────────┐  ┌──────────┐
│ SUCCESS │  │  FAILED  │
│ Set     │  │ Show     │
│ cookie  │  │ Error    │
│ Redirect│  │ message  │
│ to /dash│  │          │
└────┬────┘  └──────────┘
     │
     ▼
┌──────────────────┐
│ Auth context     │
│ updates user     │
│ state            │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Dashboard page   │
│ loads with user  │
│ data             │
└──────────────────┘
```

### 2. DATA IMPORT FLOW

```
┌──────────────────────────┐
│ Admin navigates to       │
│ System → Data Import     │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Step 1: Upload department.dat    │
│ - Parse file                     │
│ - Insert into departments table  │
│ - Show success/error             │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Step 2: Upload user.dat          │
│ - Parse file                     │
│ - Create employee records        │
│ - Hash default passwords         │
│ - Assign to departments          │
└────────┬─────────────────────────┘
         │
         ▼
┌────────────────────────────────────┐
│ Step 3: Upload 1_attlog.dat        │
│ - Parse attendance logs           │
│ - Create attendance records       │
│ - Link to employees               │
│ - Generate daily summaries        │
└────────┬───────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Step 4: Verify Status    │
│ System → System Status   │
│ - Show record counts     │
│ - Check for errors       │
│ - Ready for use          │
└──────────────────────────┘
```

### 3. LEAVE REQUEST FLOW

```
┌──────────────────────┐
│ Employee goes to:    │
│ Requests → Leave     │
└────────┬─────────────┘
         │
         ▼
┌─────────────────────────┐
│ Check Leave Balance     │
│ - Regular: 10 days      │
│ - Paid: 5 days          │
│ - Sick: 10 days         │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Submit Leave Request Form       │
│ - Select type                   │
│ - Choose dates                  │
│ - Add reason                    │
│ - Verify available balance      │
└────────┬────────────────────────┘
         │
         ▼
┌──────────────────────┐
│ Request Created      │
│ Status: Pending      │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Manager notified             │
│ Can approve/reject           │
│ in Approvals section         │
└────────┬─────────────────────┘
         │
    ┌────┴──────┐
    │            │
    ▼            ▼
┌───────────┐ ┌──────────┐
│ APPROVED  │ │ REJECTED │
│ Deduct    │ │ Stays in │
│ from      │ │ pending  │
│ balance   │ │ request  │
│ Update    │ │ history  │
│ calendar  │ │          │
└───────────┘ └──────────┘
```

### 4. PAYROLL CYCLE FLOW

```
┌──────────────────────────┐
│ Admin creates payroll    │
│ period (e.g., May 1-31)  │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ System calculates for each       │
│ employee:                        │
│ - Days worked (from attendance)  │
│ - Basic salary (from salary      │
│   grade)                         │
│ - Allowances                     │
│ - Deductions (loans, taxes)      │
│ - Net pay                        │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Generate Payslips        │
│ One per employee         │
│ Shows breakdown          │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Employee views in        │
│ Reports → Payroll        │
│ or downloads PDF         │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Admin can release        │
│ or hold payoff           │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Payroll period closed    │
│ Records locked           │
└──────────────────────────┘
```

### 5. ATTENDANCE TRACKING FLOW

```
┌─────────────────────────┐
│ Employee clock in/out   │
│ at ZKTeco device        │
└────────┬────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ ZKTeco stores record in      │
│ 1_attlog.dat file            │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Admin imports via Data       │
│ Import → 1_attlog.dat        │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ System parses and stores:        │
│ - User ID                        │
│ - Clock in/out time              │
│ - Date                           │
│ - Creates daily summary          │
└────────┬───────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ Employee views attendance: │
│ - In Reports → Attendance  │
│ - Daily log                │
│ - Monthly summary          │
│ - Trends                   │
└────────────────────────────┘
```

---

## Database Schema Overview

```
┌──────────────────┐
│    USERS         │
├──────────────────┤
│ id (PK)          │
│ email (Unique)   │
│ password (Hash)  │
│ role             │
│ name             │
│ created_at       │
└──────────────────┘
        │
        ├─────────────────────┐
        │                     │
        ▼                     ▼
┌──────────────────┐  ┌──────────────────┐
│  EMPLOYEES       │  │   LEAVE_REQUESTS │
├──────────────────┤  ├──────────────────┤
│ id (PK)          │  │ id (PK)          │
│ user_id (FK)     │  │ employee_id (FK) │
│ department_id    │  │ type             │
│ position_id      │  │ start_date       │
│ salary_grade_id  │  │ end_date         │
│ hire_date        │  │ status           │
└──────────────────┘  │ created_at       │
        │             └──────────────────┘
        │
        ▼
┌──────────────────┐
│  ATTENDANCE      │
├──────────────────┤
│ id (PK)          │
│ employee_id (FK) │
│ date             │
│ check_in         │
│ check_out        │
│ status           │
└──────────────────┘
```

---

## Module Breakdown

### 1. **Employee Management**
- Import employees from ZKTeco user.dat
- Create/Edit/Delete employee profiles
- Assign departments, positions, salary grades
- Track hire dates, contract info

### 2. **Attendance Tracking**
- Import from ZKTeco 1_attlog.dat
- Daily clock in/out records
- Monthly summaries
- Late/Absent detection
- Attendance reports and trends

### 3. **Leave Management**
- 3 types: Regular, Paid, Sick
- Balance tracking per type
- Request submission by employees
- Manager approval/rejection
- Leave calendar view

### 4. **Overtime (OT) Management**
- Submit OT requests with hours
- Manager approval
- Track cumulative OT
- Calculate OT pay (time and a half)

### 5. **Payroll**
- Monthly salary calculation
- Allowances (housing, transportation, etc.)
- Deductions (loans, insurance, taxes)
- Payslip generation and download
- Salary advance requests

### 6. **Organization Setup**
- Departments (create hierarchy)
- Positions (roles within departments)
- Salary grades (pay bands)
- Work areas
- Shifts (schedule patterns)

### 7. **Reports & Analytics**
- Attendance reports (daily, monthly)
- Payroll reports (salary, deductions)
- Leave analytics (usage, trends)
- Employee attendance by department
- Payroll summary

### 8. **System Administration**
- Data import (departments, employees, attendance)
- Formula configuration (OT, deductions)
- Rule setup (allowances, cutoff dates)
- System status monitoring
- Role-based access control

---

## API Endpoints Structure

```
/api/auth/
  ├── POST /login              → Authenticate user
  ├── POST /logout             → Clear session
  └── GET  /me                 → Get current user

/api/import/
  ├── POST /zkteco             → Import ZKTeco file
  ├── POST /employees          → Import employees
  └── POST /attendance         → Import attendance logs

/api/organization/
  ├── GET  /departments        → List departments
  ├── POST /departments        → Create department
  ├── GET  /positions          → List positions
  └── POST /positions          → Create position

/api/system/
  ├── GET  /status             → Check system data status
  └── POST /reset              → Reset system (dev only)
```

---

## User Permissions Matrix

| Feature | Employee | Manager | Admin | Failsafe |
|---------|----------|---------|-------|----------|
| View Own Profile | ✓ | ✓ | ✓ | ✓ |
| Submit Leave Request | ✓ | ✓ | ✓ | ✓ |
| Submit OT Request | ✓ | ✓ | ✓ | ✓ |
| View Own Payslip | ✓ | ✓ | ✓ | ✓ |
| View Team Attendance | ✗ | ✓ | ✓ | ✓ |
| Approve Requests | ✗ | ✓ | ✓ | ✓ |
| Generate Payroll | ✗ | ✗ | ✓ | ✓ |
| Data Import | ✗ | ✗ | ✓ | ✓ |
| System Configuration | ✗ | ✗ | ✗ | ✓ |

---

## Key Business Flows

### Flow A: New Employee Onboarding
1. Admin imports employee list via department.dat, user.dat
2. System creates employee records
3. Employee logs in with default credentials
4. Employee completes profile (photo, etc.)
5. Manager assigns to shifts/schedules
6. Attendance tracking begins

### Flow B: Monthly Payroll Processing
1. Attendance data imported from device
2. Admin creates payroll period
3. System calculates salary, allowances, deductions
4. Admin generates payslips
5. Employees view payslips (Reports → Payroll)
6. Admin releases or holds payoff

### Flow C: Leave Request Processing
1. Employee submits leave request
2. Manager receives notification (via approvals page)
3. Manager reviews and approves/rejects
4. Employee notified of decision
5. If approved, leave deducted from balance
6. Calendar updated

---

## Technology Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS v4, shadcn/ui
- **Database**: SQLite (development), scalable to PostgreSQL
- **Auth**: Custom session-based with bcrypt hashing
- **Date Handling**: date-fns
- **UI Components**: shadcn/ui (cards, tables, dialogs, forms)
- **Notifications**: Sonner (toast)

---

## System Status & Monitoring

The System Status page shows:
- Total employees imported
- Total departments
- Attendance records count
- Pending requests count
- Last import timestamp
- Data integrity checks

This helps admins verify that all data has been properly imported and the system is ready for use.

---

## Future Enhancements

- [ ] Real-time biometric clock in/out
- [ ] Mobile app for employees
- [ ] Email notifications for approvals
- [ ] Advanced analytics & dashboards
- [ ] Integration with accounting software
- [ ] Multi-company support
- [ ] Workflow automation
- [ ] Document management system
