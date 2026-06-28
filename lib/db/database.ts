// HRIS SQLite Database Configuration
// Local development uses SQLite for persistence at ./database/hris_dev.sqlite
// This module is server-only and should only be imported in API routes and server components

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database file path
const DB_DIR = path.join(process.cwd(), 'database');
const DB_PATH = path.join(DB_DIR, 'hris_dev.sqlite');

// Singleton database connection
let db: Database.Database | null = null;

// Ensure database directory exists
function ensureDatabaseDirectory(): void {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    console.log('[HRIS-DB] Created database directory:', DB_DIR);
  }
}

// Get or create database connection
export function getConnection(): Database.Database {
  if (db) return db;

  ensureDatabaseDirectory();
  
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  
  console.log('[HRIS-DB] Connected to SQLite database:', DB_PATH);
  
  return db;
}

// Run database migrations
export function runMigrations(): void {
  const conn = getConnection();
  
  console.log('[HRIS-DB] Running database migrations...');

  // Create tables
  conn.exec(`
    -- Departments
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Accounts (Authentication Credentials - separate from employee data)
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email TEXT,
      is_active INTEGER DEFAULT 1,
      last_login TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Salary Grades
    CREATE TABLE IF NOT EXISTS salary_grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade_name TEXT NOT NULL,
      amount REAL NOT NULL,
      frequency TEXT CHECK(frequency IN ('hourly', 'daily', 'weekly', 'monthly')) DEFAULT 'monthly',
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Positions
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      department_id INTEGER REFERENCES departments(id),
      salary_grade_id INTEGER REFERENCES salary_grades(id),
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Areas
    CREATE TABLE IF NOT EXISTS areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Shifts
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      break_minutes INTEGER DEFAULT 60,
      is_night_shift INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Employees
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      username TEXT UNIQUE,
      email TEXT,
      phone TEXT,
      picture TEXT,
      department_id INTEGER REFERENCES departments(id),
      position_id INTEGER REFERENCES positions(id),
      salary_grade_id INTEGER REFERENCES salary_grades(id),
      area_id INTEGER REFERENCES areas(id),
      status TEXT CHECK(status IN ('Active', 'Resigned', 'AWOL')) DEFAULT 'Active',
      employment_type TEXT CHECK(employment_type IN ('Regular', 'Probationary', 'Casual', 'Casual On-Call')) DEFAULT 'Probationary',
      employment_type_effective_date TEXT,
      role TEXT CHECK(role IN ('Employee', 'Manager', 'Admin', 'CEO', 'DEV')) DEFAULT 'Employee',
      password_hash TEXT,
      basic_salary REAL DEFAULT 0,
      hire_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Attendance Logs (raw ZKTeco data)
    CREATE TABLE IF NOT EXISTS attendance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER REFERENCES employees(id),
      employee_idno TEXT,
      timestamp TEXT NOT NULL,
      state INTEGER NOT NULL,
      device_id TEXT,
      photo TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Daily Attendance (processed records)
    CREATE TABLE IF NOT EXISTS daily_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER REFERENCES employees(id),
      date TEXT NOT NULL,
      time_in TEXT,
      time_out TEXT,
      shift_id INTEGER REFERENCES shifts(id),
      scheduled_in TEXT,
      scheduled_out TEXT,
      late_minutes INTEGER DEFAULT 0,
      early_out_minutes INTEGER DEFAULT 0,
      overtime_minutes INTEGER DEFAULT 0,
      undertime_minutes INTEGER DEFAULT 0,
      total_hours REAL DEFAULT 0,
      status TEXT CHECK(status IN ('Present', 'Absent', 'Late', 'Half-day', 'On Leave', 'Holiday')) DEFAULT 'Present',
      remarks TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(employee_id, date)
    );

    -- OT Requests
    CREATE TABLE IF NOT EXISTS ot_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER REFERENCES employees(id),
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      hours REAL NOT NULL,
      reason TEXT,
      status TEXT CHECK(status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
      approved_by INTEGER REFERENCES employees(id),
      approved_at TEXT,
      rejection_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Leave Requests
    -- leave_type intentionally has no CHECK constraint: handbook/statutory
    -- leave categories change over time and SQLite cannot alter CHECKs in place.
    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER REFERENCES employees(id),
      leave_type TEXT DEFAULT 'Service Incentive Leave',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days INTEGER NOT NULL,
      reason TEXT,
      status TEXT CHECK(status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
      approved_by INTEGER REFERENCES employees(id),
      approved_at TEXT,
      rejection_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Salary Advance Requests
    CREATE TABLE IF NOT EXISTS salary_advance_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER REFERENCES employees(id),
      amount REAL NOT NULL,
      reason TEXT,
      repayment_months INTEGER DEFAULT 1,
      status TEXT CHECK(status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
      approved_by INTEGER REFERENCES employees(id),
      approved_at TEXT,
      rejection_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Incentive Requests
    CREATE TABLE IF NOT EXISTS incentive_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER REFERENCES employees(id),
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT,
      status TEXT CHECK(status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
      approved_by INTEGER REFERENCES employees(id),
      approved_at TEXT,
      rejection_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Loan Extension Requests
    CREATE TABLE IF NOT EXISTS loan_extension_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      salary_advance_id INTEGER REFERENCES salary_advance_requests(id),
      employee_id INTEGER REFERENCES employees(id),
      requested_extra_months INTEGER NOT NULL,
      reason TEXT,
      status TEXT CHECK(status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
      approved_by INTEGER REFERENCES employees(id),
      approved_at TEXT,
      rejection_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Tardiness Points Ledger
    CREATE TABLE IF NOT EXISTS tardiness_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER REFERENCES employees(id),
      date TEXT NOT NULL,
      late_minutes INTEGER DEFAULT 0,
      points REAL DEFAULT 0,
      year INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(employee_id, date)
    );

    -- Notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER REFERENCES employees(id),
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      target_url TEXT,
      request_type TEXT,
      request_id INTEGER,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Holidays
    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT NOT NULL UNIQUE,
      type TEXT CHECK(type IN ('Regular', 'Special')) DEFAULT 'Regular',
      observance_type TEXT CHECK(observance_type IN ('Fixed', 'Movable')) DEFAULT 'Fixed',
      pay_multiplier REAL DEFAULT 2.0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Formulas (payroll calculation variables)
    CREATE TABLE IF NOT EXISTS formulas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      category TEXT CHECK(category IN ('salary', 'overtime', 'holiday', 'deduction', 'other')) DEFAULT 'other',
      description TEXT,
      data_type TEXT CHECK(data_type IN ('number', 'percentage', 'text', 'boolean')) DEFAULT 'number',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Payroll
    CREATE TABLE IF NOT EXISTS payroll (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER REFERENCES employees(id),
      payroll_type TEXT CHECK(payroll_type IN ('Regular', '13th Month')) DEFAULT 'Regular',
      period_mode TEXT DEFAULT 'standard',
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      basic_salary REAL DEFAULT 0,
      days_worked INTEGER DEFAULT 0,
      regular_hours REAL DEFAULT 0,
      overtime_hours REAL DEFAULT 0,
      overtime_pay REAL DEFAULT 0,
      night_shift_pay REAL DEFAULT 0,
      holiday_pay REAL DEFAULT 0,
      allowances REAL DEFAULT 0,
      gross_pay REAL DEFAULT 0,
      sss_deduction REAL DEFAULT 0,
      philhealth_deduction REAL DEFAULT 0,
      pagibig_deduction REAL DEFAULT 0,
      tax_deduction REAL DEFAULT 0,
      salary_advance_deduction REAL DEFAULT 0,
      late_deduction_minutes INTEGER DEFAULT 0,
      late_absence_equivalents INTEGER DEFAULT 0,
      other_deductions REAL DEFAULT 0,
      total_deductions REAL DEFAULT 0,
      net_pay REAL DEFAULT 0,
      status TEXT CHECK(status IN ('Draft', 'Pending', 'Approved', 'Paid')) DEFAULT 'Draft',
      approved_by INTEGER REFERENCES employees(id),
      approved_at TEXT,
      paid_at TEXT,
      claimed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(employee_id, period_start, period_end)
    );

    -- Payroll OT Carryovers
    CREATE TABLE IF NOT EXISTS payroll_ot_carryovers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      source_attendance_id INTEGER REFERENCES daily_attendance(id),
      source_date TEXT NOT NULL,
      cutoff_at TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      hours REAL NOT NULL,
      payable_period_start TEXT NOT NULL,
      payable_period_end TEXT NOT NULL,
      payroll_id INTEGER REFERENCES payroll(id),
      status TEXT CHECK(status IN ('Pending', 'Applied')) DEFAULT 'Pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(employee_id, source_date, cutoff_at)
    );

    -- Payroll Deletion Logs
    CREATE TABLE IF NOT EXISTS payroll_deletion_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payroll_id INTEGER NOT NULL,
      employee_id INTEGER REFERENCES employees(id),
      period_start TEXT,
      period_end TEXT,
      payroll_type TEXT,
      status TEXT,
      gross_pay REAL DEFAULT 0,
      net_pay REAL DEFAULT 0,
      reason TEXT NOT NULL,
      deleted_by INTEGER REFERENCES employees(id),
      deleted_at TEXT DEFAULT (datetime('now')),
      snapshot TEXT
    );

    -- Employee Shifts
    CREATE TABLE IF NOT EXISTS employee_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER REFERENCES employees(id),
      shift_id INTEGER REFERENCES shifts(id),
      effective_date TEXT NOT NULL,
      end_date TEXT,
      work_days TEXT DEFAULT '[0,1,2,3,4,5,6]',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Casual On-Call Shift Offers
    CREATE TABLE IF NOT EXISTS casual_on_call_shift_offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      shift_id INTEGER REFERENCES shifts(id),
      work_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      break_minutes INTEGER DEFAULT 0,
      status TEXT CHECK(status IN ('Offered', 'Confirmed', 'Declined', 'Cancelled', 'Completed')) DEFAULT 'Offered',
      offered_by INTEGER REFERENCES employees(id),
      confirmed_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(employee_id, work_date, start_time)
    );

    -- Unmapped Punches (for orphan attendance logs)
    CREATE TABLE IF NOT EXISTS unmapped_punches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_idno TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      state INTEGER NOT NULL,
      device_id TEXT,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Import Logs (for tracking imports)
    CREATE TABLE IF NOT EXISTS import_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_type TEXT NOT NULL,
      file_name TEXT,
      records_processed INTEGER DEFAULT 0,
      records_imported INTEGER DEFAULT 0,
      records_updated INTEGER DEFAULT 0,
      records_failed INTEGER DEFAULT 0,
      error_details TEXT,
      imported_by INTEGER REFERENCES employees(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON employees(employee_id);
    CREATE INDEX IF NOT EXISTS idx_employees_username ON employees(username);
    CREATE INDEX IF NOT EXISTS idx_accounts_username ON accounts(username);
    CREATE INDEX IF NOT EXISTS idx_accounts_employee_id ON accounts(employee_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee_id ON attendance_logs(employee_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_logs_timestamp ON attendance_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_daily_attendance_employee_date ON daily_attendance(employee_id, date);
    CREATE INDEX IF NOT EXISTS idx_tardiness_points_employee_year ON tardiness_points(employee_id, year);
    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read, created_at);
    CREATE INDEX IF NOT EXISTS idx_payroll_employee_period ON payroll(employee_id, period_start, period_end);
    CREATE INDEX IF NOT EXISTS idx_payroll_carryovers_employee_payable ON payroll_ot_carryovers(employee_id, payable_period_start, payable_period_end);
    CREATE INDEX IF NOT EXISTS idx_payroll_carryovers_status ON payroll_ot_carryovers(status);
    CREATE INDEX IF NOT EXISTS idx_on_call_offers_employee_date ON casual_on_call_shift_offers(employee_id, work_date);
    CREATE INDEX IF NOT EXISTS idx_on_call_offers_date_status ON casual_on_call_shift_offers(work_date, status);
  `);

  ensureColumn('employees', 'salary_grade_id', 'INTEGER REFERENCES salary_grades(id)');
  ensureColumn('employees', 'employment_type', "TEXT CHECK(employment_type IN ('Regular', 'Probationary', 'Casual', 'Casual On-Call')) DEFAULT 'Probationary'");
  ensureColumn('employees', 'employment_type_effective_date', 'TEXT');
  ensureColumn('attendance_logs', 'photo', 'TEXT');
  ensureColumn('notifications', 'target_url', 'TEXT');
  ensureColumn('notifications', 'request_type', 'TEXT');
  ensureColumn('notifications', 'request_id', 'INTEGER');
  migrateEmployeesEmploymentTypeConstraint();
  ensureColumn('payroll', 'payroll_type', "TEXT CHECK(payroll_type IN ('Regular', '13th Month')) DEFAULT 'Regular'");
  ensureColumn('payroll', 'period_mode', "TEXT DEFAULT 'standard'");
  ensureColumn('payroll', 'night_shift_pay', 'REAL DEFAULT 0');
  ensureColumn('payroll', 'claimed_at', 'TEXT');
  ensureColumn('payroll', 'late_absence_equivalents', 'INTEGER DEFAULT 0');
  ensureColumn('holidays', 'observance_type', "TEXT CHECK(observance_type IN ('Fixed', 'Movable')) DEFAULT 'Fixed'");
  ensureColumn('employee_shifts', 'work_days', "TEXT DEFAULT '[0,1,2,3,4,5,6]'");
  conn.prepare(`
    UPDATE employee_shifts
    SET work_days = '[0,1,2,3,4,5,6]'
    WHERE work_days IS NULL OR TRIM(work_days) = ''
  `).run();
  migrateLeaveRequestsConstraint();

  conn.exec(`
    CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON employees(employee_id);
    CREATE INDEX IF NOT EXISTS idx_employees_username ON employees(username);
    CREATE INDEX IF NOT EXISTS idx_payroll_type_status ON payroll(payroll_type, status);
    CREATE INDEX IF NOT EXISTS idx_payroll_carryovers_employee_payable ON payroll_ot_carryovers(employee_id, payable_period_start, payable_period_end);
    CREATE INDEX IF NOT EXISTS idx_payroll_carryovers_status ON payroll_ot_carryovers(status);
    CREATE INDEX IF NOT EXISTS idx_on_call_offers_employee_date ON casual_on_call_shift_offers(employee_id, work_date);
    CREATE INDEX IF NOT EXISTS idx_on_call_offers_date_status ON casual_on_call_shift_offers(work_date, status);
  `);

  console.log('[HRIS-DB] Database migrations completed');
}

function migrateEmployeesEmploymentTypeConstraint(): void {
  const conn = getConnection();
  const table = conn.prepare(`
    SELECT sql FROM sqlite_master
    WHERE type = 'table' AND name = 'employees'
  `).get() as { sql?: string } | undefined;

  const hasCurrentConstraint = table?.sql?.includes("'Casual On-Call'") &&
    table.sql.includes("DEFAULT 'Probationary'") &&
    table.sql.includes('employment_type_effective_date');

  if (hasCurrentConstraint) {
    conn.prepare(`
      UPDATE employees
      SET
        employment_type = CASE
          WHEN employment_type = 'On-call' THEN 'Casual On-Call'
          WHEN employment_type IS NULL OR TRIM(employment_type) = '' THEN 'Probationary'
          ELSE employment_type
        END,
        employment_type_effective_date = COALESCE(employment_type_effective_date, hire_date, date('now'))
    `).run();
    return;
  }

  console.log('[HRIS-DB] Rebuilding employees for employment_type constraint/default');
  conn.pragma('foreign_keys = OFF');
  try {
    conn.transaction(() => {
      conn.exec(`
        CREATE TABLE employees_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          username TEXT UNIQUE,
          email TEXT,
          phone TEXT,
          picture TEXT,
          department_id INTEGER REFERENCES departments(id),
          position_id INTEGER REFERENCES positions(id),
          salary_grade_id INTEGER REFERENCES salary_grades(id),
          area_id INTEGER REFERENCES areas(id),
          status TEXT CHECK(status IN ('Active', 'Resigned', 'AWOL')) DEFAULT 'Active',
          employment_type TEXT CHECK(employment_type IN ('Regular', 'Probationary', 'Casual', 'Casual On-Call')) DEFAULT 'Probationary',
          employment_type_effective_date TEXT,
          role TEXT CHECK(role IN ('Employee', 'Manager', 'Admin', 'CEO', 'DEV')) DEFAULT 'Employee',
          password_hash TEXT,
          basic_salary REAL DEFAULT 0,
          hire_date TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        INSERT INTO employees_new (
          id, employee_id, name, username, email, phone, picture, department_id,
          position_id, salary_grade_id, area_id, status, employment_type,
          employment_type_effective_date, role, password_hash, basic_salary,
          hire_date, created_at, updated_at
        )
        SELECT
          id, employee_id, name, username, email, phone, picture, department_id,
          position_id, salary_grade_id, area_id, status,
          CASE
            WHEN employment_type = 'On-call' THEN 'Casual On-Call'
            WHEN employment_type IS NULL OR TRIM(employment_type) = '' THEN 'Probationary'
            ELSE employment_type
          END,
          COALESCE(employment_type_effective_date, hire_date, date('now')),
          role, password_hash, basic_salary, hire_date, created_at, updated_at
        FROM employees;

        DROP TABLE employees;
        ALTER TABLE employees_new RENAME TO employees;
      `);
    })();
  } finally {
    conn.pragma('foreign_keys = ON');
  }
}

function ensureColumn(table: string, column: string, definition: string): void {
  const conn = getConnection();
  const columns = conn.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((existing) => existing.name === column)) {
    conn.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    console.log(`[HRIS-DB] Added missing column ${table}.${column}`);
  }
}

function migrateLeaveRequestsConstraint(): void {
  const conn = getConnection();
  const table = conn.prepare(`
    SELECT sql FROM sqlite_master
    WHERE type = 'table' AND name = 'leave_requests'
  `).get() as { sql?: string } | undefined;

  if (!table?.sql?.includes("CHECK(leave_type IN ('Regular', 'Paid', 'Sick'))")) {
    return;
  }

  console.log('[HRIS-DB] Rebuilding leave_requests without legacy leave_type CHECK');
  conn.pragma('foreign_keys = OFF');
  try {
    conn.transaction(() => {
      conn.exec(`
        ALTER TABLE leave_requests RENAME TO leave_requests_legacy;

        CREATE TABLE leave_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id INTEGER REFERENCES employees(id),
          leave_type TEXT DEFAULT 'Service Incentive Leave',
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          days INTEGER NOT NULL,
          reason TEXT,
          status TEXT CHECK(status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
          approved_by INTEGER REFERENCES employees(id),
          approved_at TEXT,
          rejection_reason TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        INSERT INTO leave_requests (
          id, employee_id, leave_type, start_date, end_date, days, reason, status,
          approved_by, approved_at, rejection_reason, created_at, updated_at
        )
        SELECT
          id, employee_id, leave_type, start_date, end_date, days, reason, status,
          approved_by, approved_at, rejection_reason, created_at, updated_at
        FROM leave_requests_legacy;

        DROP TABLE leave_requests_legacy;
      `);
    })();
  } finally {
    conn.pragma('foreign_keys = ON');
  }
}

// Seed default formulas
export function seedFormulas(): void {
  const conn = getConnection();
  
  const formulas = [
    { key: 'working_days_per_month', value: '22', category: 'salary', description: 'Number of working days per month', data_type: 'number' },
    { key: 'working_hours_per_day', value: '8', category: 'salary', description: 'Number of working hours per day', data_type: 'number' },
    { key: 'ot_multiplier_regular', value: '1.25', category: 'overtime', description: 'OT multiplier for regular days', data_type: 'number' },
    { key: 'ot_multiplier_premium_day', value: '1.30', category: 'overtime', description: 'OT multiplier for rest days, special days, and holidays', data_type: 'number' },
    { key: 'ot_multiplier_restday', value: '1.30', category: 'overtime', description: 'OT multiplier for rest days', data_type: 'number' },
    { key: 'ot_multiplier_holiday', value: '2.00', category: 'overtime', description: 'OT multiplier for holidays', data_type: 'number' },
    { key: 'night_shift_multiplier', value: '1.10', category: 'overtime', description: 'Night shift differential multiplier for 22:00 to 06:00', data_type: 'number' },
    { key: 'night_shift_start_hour', value: '22', category: 'overtime', description: 'Night shift differential start hour using 24-hour clock', data_type: 'number' },
    { key: 'night_shift_end_hour', value: '6', category: 'overtime', description: 'Night shift differential end hour using 24-hour clock', data_type: 'number' },
    { key: 'holiday_pay_regular', value: '2.00', category: 'holiday', description: 'Pay multiplier for regular holidays', data_type: 'number' },
    { key: 'holiday_pay_special', value: '1.30', category: 'holiday', description: 'Pay multiplier for special holidays', data_type: 'number' },
    { key: 'day_factor_ordinary', value: '1.00', category: 'holiday', description: 'Ordinary working day base factor', data_type: 'number' },
    { key: 'day_factor_rest_day', value: '1.30', category: 'holiday', description: 'Scheduled rest day base factor', data_type: 'number' },
    { key: 'day_factor_special_holiday', value: '1.30', category: 'holiday', description: 'Special non-working day base factor', data_type: 'number' },
    { key: 'day_factor_special_rest', value: '1.50', category: 'holiday', description: 'Special non-working day falling on rest day factor', data_type: 'number' },
    { key: 'day_factor_double_special', value: '1.50', category: 'holiday', description: 'Double special non-working day factor', data_type: 'number' },
    { key: 'day_factor_double_special_rest', value: '1.95', category: 'holiday', description: 'Double special non-working day falling on rest day factor', data_type: 'number' },
    { key: 'day_factor_regular_holiday', value: '2.00', category: 'holiday', description: 'Regular holiday worked day factor', data_type: 'number' },
    { key: 'day_factor_regular_rest', value: '2.60', category: 'holiday', description: 'Regular holiday falling on rest day factor', data_type: 'number' },
    { key: 'day_factor_double_regular', value: '3.00', category: 'holiday', description: 'Double regular holiday factor', data_type: 'number' },
    { key: 'day_factor_double_regular_rest', value: '3.90', category: 'holiday', description: 'Double regular holiday falling on rest day factor', data_type: 'number' },
    { key: 'default_rest_day_iso', value: '0', category: 'salary', description: 'Default weekly rest day: 0 Sunday through 6 Saturday', data_type: 'number' },
    { key: 'sss_employee_rate', value: '0.05', category: 'deduction', description: 'SSS employee share rate based on MSC', data_type: 'number' },
    { key: 'sss_employer_rate', value: '0.10', category: 'deduction', description: 'SSS employer share rate based on MSC', data_type: 'number' },
    { key: 'sss_msc_floor', value: '5000', category: 'deduction', description: 'SSS monthly salary credit floor', data_type: 'number' },
    { key: 'sss_msc_ceiling', value: '35000', category: 'deduction', description: 'SSS monthly salary credit ceiling', data_type: 'number' },
    { key: 'philhealth_total_rate', value: '0.05', category: 'deduction', description: 'PhilHealth total premium rate', data_type: 'number' },
    { key: 'philhealth_employee_share', value: '0.50', category: 'deduction', description: 'PhilHealth employee share of total premium', data_type: 'number' },
    { key: 'philhealth_salary_floor', value: '10000', category: 'deduction', description: 'PhilHealth monthly salary floor', data_type: 'number' },
    { key: 'philhealth_salary_ceiling', value: '100000', category: 'deduction', description: 'PhilHealth monthly salary ceiling', data_type: 'number' },
    { key: 'pagibig_compensation_ceiling', value: '10000', category: 'deduction', description: 'Pag-IBIG compensation basis ceiling', data_type: 'number' },
    { key: 'pagibig_low_salary_threshold', value: '1500', category: 'deduction', description: 'Pag-IBIG low-salary threshold', data_type: 'number' },
    { key: 'pagibig_employee_low_rate', value: '0.01', category: 'deduction', description: 'Pag-IBIG employee rate for compensation up to low threshold', data_type: 'number' },
    { key: 'pagibig_employee_high_rate', value: '0.02', category: 'deduction', description: 'Pag-IBIG employee rate above low threshold', data_type: 'number' },
    { key: 'pagibig_employee_cap', value: '200', category: 'deduction', description: 'Pag-IBIG employee contribution cap', data_type: 'number' },
    { key: 'de_minimis_exempt_allowances', value: '0', category: 'deduction', description: 'Exempt de minimis allowances deducted from taxable compensation', data_type: 'number' },
    { key: 'late_deduction_per_minute', value: '10', category: 'deduction', description: 'Deduction per minute late (PHP)', data_type: 'number' },
    { key: 'salary_divisor', value: '22', category: 'salary', description: 'Days to divide monthly salary (prevents division by zero)', data_type: 'number' },
    { key: 'weeks_per_month', value: '4.333333', category: 'salary', description: 'Average weeks per month for weekly salary conversion', data_type: 'number' },
    { key: 'service_incentive_leave_days', value: '5', category: 'salary', description: 'Annual service incentive leave days after one year of service', data_type: 'number' },
    { key: 'service_incentive_leave_tenure_days', value: '365', category: 'salary', description: 'Tenure threshold before SIL allocation', data_type: 'number' },
    { key: 'thirteenth_month_divisor', value: '12', category: 'salary', description: '13th month formula divisor for annual basic salary earned', data_type: 'number' },
    { key: 'max_regular_pay_interval_days', value: '16', category: 'salary', description: 'DOLE Article 103 maximum regular wage payment interval in calendar days', data_type: 'number' },
  ];

  const stmt = conn.prepare(`
    INSERT OR IGNORE INTO formulas (key, value, category, description, data_type)
    VALUES (@key, @value, @category, @description, @data_type)
  `);

  for (const formula of formulas) {
    stmt.run(formula);
  }

  console.log('[HRIS-DB] Default formulas seeded');
}

// Seed failsafe account
export function seedFailsafeAccount(): void {
  const conn = getConnection();

  // Check if failsafe exists
  const existing = conn.prepare('SELECT id FROM employees WHERE username = ?').get('failsafe') as { id: number } | undefined;
  const passwordHash = '$2b$10$BgbBjZPc2g8Pu2tsrN7sPOjbLkVo.jReSoffidtc2EuMwPBjiFd5i';
  
  if (!existing) {
    conn.prepare(`
      INSERT INTO employees (
        employee_id, name, username, status, employment_type,
        employment_type_effective_date, role, password_hash, basic_salary
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'FAILSAFE001',
      'System Failsafe',
      'failsafe',
      'Active',
      'Regular',
      new Date().toISOString().split('T')[0],
      'DEV',
      // Hash for "Knightfall1939"
      passwordHash,
      0
    );
    console.log('[HRIS-DB] Failsafe account created');
  } else {
    console.log('[HRIS-DB] Failsafe account already exists');
  }

  const employee = conn.prepare('SELECT id, email FROM employees WHERE username = ?').get('failsafe') as { id: number; email: string | null } | undefined;
  if (employee) {
    conn.prepare(`
      INSERT INTO accounts (employee_id, username, password_hash, email, is_active)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(employee_id) DO UPDATE SET
        username = excluded.username,
        password_hash = excluded.password_hash,
        email = excluded.email,
        is_active = 1,
        updated_at = datetime('now')
    `).run(employee.id, 'failsafe', passwordHash, employee.email);
  }
}

// Nuclear reset - drops all data except failsafe
export function nuclearReset(): void {
  const conn = getConnection();
  
  console.log('[HRIS-DB] NUCLEAR RESET initiated...');

  // Delete all data from tables in correct order (respecting FK constraints)
  conn.exec(`
    DELETE FROM import_logs;
    DELETE FROM unmapped_punches;
    DELETE FROM employee_shifts;
    DELETE FROM casual_on_call_shift_offers;
    DELETE FROM payroll;
    DELETE FROM loan_extension_requests;
    DELETE FROM salary_advance_requests;
    DELETE FROM incentive_requests;
    DELETE FROM leave_requests;
    DELETE FROM ot_requests;
    DELETE FROM notifications;
    DELETE FROM tardiness_points;
    DELETE FROM daily_attendance;
    DELETE FROM attendance_logs;
    DELETE FROM employees WHERE username != 'failsafe';
    DELETE FROM positions;
    DELETE FROM salary_grades;
    DELETE FROM areas;
    DELETE FROM shifts;
    DELETE FROM departments;
    DELETE FROM holidays;
  `);

  // Reset auto-increment counters
  conn.exec(`
    DELETE FROM sqlite_sequence WHERE name IN (
      'departments', 'positions', 'salary_grades', 'areas', 'shifts',
      'attendance_logs', 'daily_attendance', 'ot_requests', 'leave_requests',
      'salary_advance_requests', 'incentive_requests', 'loan_extension_requests',
      'tardiness_points', 'notifications', 'holidays', 'payroll', 'employee_shifts',
      'casual_on_call_shift_offers',
      'unmapped_punches', 'import_logs'
    );
  `);

  // Re-seed failsafe
  seedFailsafeAccount();
  
  console.log('[HRIS-DB] NUCLEAR RESET completed - database is clean');
}

// Initialize database (run on startup)
export function initializeDatabase(): void {
  runMigrations();
  seedFormulas();
  seedFailsafeAccount();
  console.log('[HRIS-DB] Database initialization complete');
}

// Get system status (counts)
export function getSystemStatus(): {
  departments: number;
  employees: number;
  attendance_logs: number;
  unmapped_punches: number;
  payroll_records: number;
  last_import: string | null;
} {
  const conn = getConnection();
  
  const counts = conn.prepare(`
    SELECT
      (SELECT COUNT(*) FROM departments) as departments,
      (SELECT COUNT(*) FROM employees WHERE username != 'failsafe') as employees,
      (SELECT COUNT(*) FROM attendance_logs) as attendance_logs,
      (SELECT COUNT(*) FROM unmapped_punches) as unmapped_punches,
      (SELECT COUNT(*) FROM payroll) as payroll_records,
      (SELECT MAX(created_at) FROM import_logs) as last_import
  `).get() as {
    departments: number;
    employees: number;
    attendance_logs: number;
    unmapped_punches: number;
    payroll_records: number;
    last_import: string | null;
  };

  return counts;
}

// Close database connection
export function closeConnection(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[HRIS-DB] Database connection closed');
  }
}
