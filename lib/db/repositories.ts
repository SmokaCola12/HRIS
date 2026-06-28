// @ts-nocheck
// HRIS SQLite Repositories
// All database operations use better-sqlite3 with prepared statements
// This module is server-only and should only be imported in API routes

import { getConnection } from './database';
import type {
  Employee,
  Department,
  SalaryGrade,
  Position,
  AttendanceLog,
  Payroll,
  LeaveRequest,
  OTRequest,
  SalaryAdvanceRequest,
} from './database';

// Helper to handle NULL values
const NULL = undefined;

// EMPLOYEE REPOSITORY
export const EmployeeRepository = {
  findAll(): Employee[] {
    const db = getConnection();
    const stmt = db.prepare(`
      SELECT * FROM employees ORDER BY id ASC
    `);
    return stmt.all() as Employee[];
  },

  findById(id: number): Employee | undefined {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM employees WHERE id = ?');
    return stmt.get(id) as Employee | undefined;
  },

  findByEmployeeId(employeeId: string): Employee | undefined {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM employees WHERE employee_id = ?');
    return stmt.get(employeeId) as Employee | undefined;
  },

  findByUsername(username: string): Employee | undefined {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM employees WHERE LOWER(username) = LOWER(?)');
    return stmt.get(username) as Employee | undefined;
  },

  findByEmail(email: string): Employee | undefined {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM employees WHERE LOWER(email) = LOWER(?)');
    return stmt.get(email) as Employee | undefined;
  },

  create(data: Omit<Employee, 'id' | 'created_at' | 'updated_at'>): Employee {
    const db = getConnection();
    const stmt = db.prepare(`
      INSERT INTO employees (
        employee_id, name, username, password_hash, email, phone, picture,
        department_id, position_id, area_id, shift_id, status, employment_type,
        employment_type_effective_date, role, basic_salary, hire_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      data.employee_id,
      data.name,
      data.username,
      data.password_hash,
      data.email || null,
      data.phone || null,
      data.picture || null,
      data.department_id || null,
      data.position_id || null,
      data.area_id || null,
      data.shift_id || null,
      data.status,
      data.employment_type || 'Probationary',
      data.employment_type_effective_date || data.hire_date || new Date().toISOString().split('T')[0],
      data.role,
      data.basic_salary,
      data.hire_date
    );

    console.log(`[HRIS-DB] Created employee ID ${info.lastInsertRowid}: ${data.name}`);
    return this.findById(Number(info.lastInsertRowid))!;
  },

  update(id: number, data: Partial<Employee>): Employee | undefined {
    const db = getConnection();
    const existing = this.findById(id);
    if (!existing) return undefined;

    const updates: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        updates.push(`${key} = ?`);
        values.push(value ?? null);
      }
    }

    values.push(id);
    const stmt = db.prepare(`UPDATE employees SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`);
    stmt.run(...values);

    console.log(`[HRIS-DB] Updated employee ID ${id}`);
    return this.findById(id);
  },

  delete(id: number): boolean {
    const db = getConnection();
    const stmt = db.prepare('DELETE FROM employees WHERE id = ?');
    stmt.run(id);
    return true;
  },
};

// DEPARTMENT REPOSITORY
export const DepartmentRepository = {
  findAll(): Department[] {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM departments ORDER BY name ASC');
    return stmt.all() as Department[];
  },

  findById(id: number): Department | undefined {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM departments WHERE id = ?');
    return stmt.get(id) as Department | undefined;
  },

  findByName(name: string): Department | undefined {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM departments WHERE LOWER(name) = LOWER(?)');
    return stmt.get(name) as Department | undefined;
  },

  create(data: Omit<Department, 'id' | 'is_active' | 'created_at' | 'updated_at'>): Department {
    const db = getConnection();
    const stmt = db.prepare(`
      INSERT INTO departments (name, code, description)
      VALUES (?, ?, ?)
    `);

    const info = stmt.run(data.name, data.code || null, data.description || null);
    console.log(`[HRIS-DB] Created department: ${data.name}`);
    return this.findById(Number(info.lastInsertRowid))!;
  },

  update(id: number, data: Partial<Department>): Department | undefined {
    const db = getConnection();
    const existing = this.findById(id);
    if (!existing) return undefined;

    const updates: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        updates.push(`${key} = ?`);
        values.push(value ?? null);
      }
    }

    values.push(id);
    const stmt = db.prepare(`UPDATE departments SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`);
    stmt.run(...values);

    return this.findById(id);
  },
};

// SALARY GRADE REPOSITORY
export const SalaryGradeRepository = {
  findAll(): SalaryGrade[] {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM salary_grades WHERE is_active = 1 ORDER BY amount ASC');
    return stmt.all() as SalaryGrade[];
  },

  findById(id: number): SalaryGrade | undefined {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM salary_grades WHERE id = ?');
    return stmt.get(id) as SalaryGrade | undefined;
  },

  create(data: Omit<SalaryGrade, 'id' | 'is_active' | 'created_at' | 'updated_at'>): SalaryGrade {
    const db = getConnection();
    const stmt = db.prepare(`
      INSERT INTO salary_grades (grade_name, amount, frequency, description)
      VALUES (?, ?, ?, ?)
    `);

    const info = stmt.run(data.grade_name, data.amount, data.frequency, data.description || null);
    console.log(`[HRIS-DB] Created salary grade: ${data.grade_name}`);
    return this.findById(Number(info.lastInsertRowid))!;
  },

  update(id: number, data: Partial<SalaryGrade>): SalaryGrade | undefined {
    const db = getConnection();
    const existing = this.findById(id);
    if (!existing) return undefined;

    const updates: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        updates.push(`${key} = ?`);
        values.push(value ?? null);
      }
    }

    values.push(id);
    const stmt = db.prepare(`UPDATE salary_grades SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`);
    stmt.run(...values);

    return this.findById(id);
  },
};

// ATTENDANCE LOG REPOSITORY
export const AttendanceRepository = {
  findAll(): AttendanceLog[] {
    const db = getConnection();
    const stmt = db.prepare(`
      SELECT * FROM attendance_logs 
      ORDER BY log_timestamp DESC
    `);
    return stmt.all() as AttendanceLog[];
  },

  findByEmployeeAndDate(employeeId: number, date: string): any {
    const db = getConnection();
    const stmt = db.prepare(`
      SELECT * FROM daily_attendance
      WHERE employee_id = ? AND date = ?
    `);
    return stmt.get(employeeId, date);
  },

  findByEmployeeAndPeriod(employeeId: number, startDate: string, endDate: string): AttendanceLog[] {
    const db = getConnection();
    const stmt = db.prepare(`
      SELECT * FROM attendance_logs
      WHERE employee_id = ? AND DATE(log_timestamp) BETWEEN ? AND ?
      ORDER BY log_timestamp ASC
    `);
    return stmt.all(employeeId, startDate, endDate) as AttendanceLog[];
  },

  create(data: any): any {
    const db = getConnection();
    
    // Create daily attendance record
    const stmt = db.prepare(`
      INSERT INTO daily_attendance (employee_id, date, check_in, check_out, status, worked_hours)
      VALUES (?, ?, ?, ?, ?, 0)
    `);

    const info = stmt.run(
      data.employee_id,
      data.date,
      data.check_in || null,
      data.check_out || null,
      data.status || 'Present'
    );

    console.log(`[HRIS-DB] Created daily attendance for employee ${data.employee_id} on ${data.date}`);
    return {
      id: Number(info.lastInsertRowid),
      ...data,
      created_at: new Date().toISOString(),
    };
  },

  update(id: number, data: any): any {
    const db = getConnection();
    const updates: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        updates.push(`${key} = ?`);
        values.push(value ?? null);
      }
    }

    values.push(id);
    const stmt = db.prepare(`UPDATE daily_attendance SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`);
    stmt.run(...values);

    console.log(`[HRIS-DB] Updated daily attendance ID ${id}`);
    const getStmt = db.prepare('SELECT * FROM daily_attendance WHERE id = ?');
    return getStmt.get(id);
  },
};

// ATTENDANCE LOG REPOSITORY (raw biometric logs)
export const AttendanceLogRepository = {
  findAll(): AttendanceLog[] {
    const db = getConnection();
    const stmt = db.prepare(`
      SELECT * FROM attendance_logs 
      ORDER BY log_timestamp DESC
    `);
    return stmt.all() as AttendanceLog[];
  },

  findByEmployeeAndPeriod(employeeId: number, startDate: string, endDate: string): AttendanceLog[] {
    const db = getConnection();
    const stmt = db.prepare(`
      SELECT * FROM attendance_logs
      WHERE employee_id = ? AND DATE(log_timestamp) BETWEEN ? AND ?
      ORDER BY log_timestamp ASC
    `);
    return stmt.all(employeeId, startDate, endDate) as AttendanceLog[];
  },

  create(data: Omit<AttendanceLog, 'id' | 'created_at'>): AttendanceLog {
    const db = getConnection();
    const stmt = db.prepare(`
      INSERT INTO attendance_logs (employee_id, log_timestamp, punch_type, biometric_id, device_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      data.employee_id,
      data.log_timestamp,
      data.punch_type,
      data.biometric_id || null,
      data.device_id || null
    );

    console.log(`[HRIS-DB] Created attendance log for employee ${data.employee_id}`);
    return {
      id: Number(info.lastInsertRowid),
      ...data,
      created_at: new Date().toISOString(),
    } as AttendanceLog;
  },
};

// PAYROLL REPOSITORY
export const PayrollRepository = {
  findAll(): Payroll[] {
    const db = getConnection();
    const stmt = db.prepare(`
      SELECT p.*, e.name as employee_name, e.employee_id
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      ORDER BY p.period_start DESC
    `);
    return stmt.all() as Payroll[];
  },

  findByPeriod(startDate: string, endDate: string): Payroll[] {
    const db = getConnection();
    const stmt = db.prepare(`
      SELECT p.*, e.name as employee_name, e.employee_id
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      WHERE p.period_start >= ? AND p.period_end <= ?
      ORDER BY p.period_start DESC, e.name ASC
    `);
    return stmt.all(startDate, endDate) as Payroll[];
  },

  create(data: Omit<Payroll, 'id' | 'created_at' | 'updated_at'>): Payroll {
    const db = getConnection();
    const stmt = db.prepare(`
      INSERT INTO payroll (
        employee_id, period_start, period_end, gross_pay, total_deductions, net_pay,
        days_worked, ot_hours, late_deduction_minutes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      data.employee_id,
      data.period_start,
      data.period_end,
      data.gross_pay,
      data.total_deductions,
      data.net_pay,
      data.days_worked,
      data.ot_hours,
      data.late_deduction_minutes,
      data.status || 'Draft'
    );

    console.log(`[HRIS-DB] Created payroll for employee ${data.employee_id}`);
    return {
      id: Number(info.lastInsertRowid),
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Payroll;
  },

  update(id: number, data: Partial<Payroll>): Payroll | undefined {
    const db = getConnection();
    const updates: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        updates.push(`${key} = ?`);
        values.push(value ?? null);
      }
    }

    values.push(id);
    const stmt = db.prepare(`UPDATE payroll SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`);
    stmt.run(...values);

    const getStmt = db.prepare('SELECT * FROM payroll WHERE id = ?');
    return getStmt.get(id) as Payroll | undefined;
  },
};

// LEAVE REQUEST REPOSITORY
export const LeaveRequestRepository = {
  findAll(): LeaveRequest[] {
    const db = getConnection();
    const stmt = db.prepare(`
      SELECT * FROM leave_requests ORDER BY created_at DESC
    `);
    return stmt.all() as LeaveRequest[];
  },

  findPending(): LeaveRequest[] {
    const db = getConnection();
    const stmt = db.prepare(`
      SELECT * FROM leave_requests WHERE status = 'Pending' ORDER BY created_at DESC
    `);
    return stmt.all() as LeaveRequest[];
  },

  create(data: Omit<LeaveRequest, 'id' | 'created_at' | 'updated_at'>): LeaveRequest {
    const db = getConnection();
    const stmt = db.prepare(`
      INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      data.employee_id,
      data.leave_type,
      data.start_date,
      data.end_date,
      data.days,
      data.reason || null,
      data.status || 'Pending'
    );

    return {
      id: Number(info.lastInsertRowid),
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as LeaveRequest;
  },

  update(id: number, data: Partial<LeaveRequest>): LeaveRequest | undefined {
    const db = getConnection();
    const updates: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        updates.push(`${key} = ?`);
        values.push(value ?? null);
      }
    }

    values.push(id);
    const stmt = db.prepare(`UPDATE leave_requests SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`);
    stmt.run(...values);

    const getStmt = db.prepare('SELECT * FROM leave_requests WHERE id = ?');
    return getStmt.get(id) as LeaveRequest | undefined;
  },
};

// OT REQUEST REPOSITORY
export const OTRequestRepository = {
  findAll(): OTRequest[] {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM ot_requests ORDER BY created_at DESC');
    return stmt.all() as OTRequest[];
  },

  findPending(): OTRequest[] {
    const db = getConnection();
    const stmt = db.prepare(`
      SELECT * FROM ot_requests WHERE status = 'Pending' ORDER BY created_at DESC
    `);
    return stmt.all() as OTRequest[];
  },

  create(data: Omit<OTRequest, 'id' | 'created_at' | 'updated_at'>): OTRequest {
    const db = getConnection();
    const stmt = db.prepare(`
      INSERT INTO ot_requests (employee_id, date, start_time, end_time, hours, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      data.employee_id,
      data.date,
      data.start_time,
      data.end_time,
      data.hours,
      data.reason || null,
      data.status || 'Pending'
    );

    return {
      id: Number(info.lastInsertRowid),
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as OTRequest;
  },

  update(id: number, data: Partial<OTRequest>): OTRequest | undefined {
    const db = getConnection();
    const updates: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        updates.push(`${key} = ?`);
        values.push(value ?? null);
      }
    }

    values.push(id);
    const stmt = db.prepare(`UPDATE ot_requests SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`);
    stmt.run(...values);

    const getStmt = db.prepare('SELECT * FROM ot_requests WHERE id = ?');
    return getStmt.get(id) as OTRequest | undefined;
  },
};

// SALARY ADVANCE REPOSITORY
export const SalaryAdvanceRepository = {
  findAll(): SalaryAdvanceRequest[] {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM salary_advance_requests ORDER BY created_at DESC');
    return stmt.all() as SalaryAdvanceRequest[];
  },

  findPending(): SalaryAdvanceRequest[] {
    const db = getConnection();
    const stmt = db.prepare(`
      SELECT * FROM salary_advance_requests WHERE status = 'Pending' ORDER BY created_at DESC
    `);
    return stmt.all() as SalaryAdvanceRequest[];
  },

  create(data: Omit<SalaryAdvanceRequest, 'id' | 'created_at' | 'updated_at'>): SalaryAdvanceRequest {
    const db = getConnection();
    const stmt = db.prepare(`
      INSERT INTO salary_advance_requests (employee_id, amount, reason, status)
      VALUES (?, ?, ?, ?)
    `);

    const info = stmt.run(
      data.employee_id,
      data.amount,
      data.reason || null,
      data.status || 'Pending'
    );

    return {
      id: Number(info.lastInsertRowid),
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as SalaryAdvanceRequest;
  },

  update(id: number, data: Partial<SalaryAdvanceRequest>): SalaryAdvanceRequest | undefined {
    const db = getConnection();
    const updates: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        updates.push(`${key} = ?`);
        values.push(value ?? null);
      }
    }

    values.push(id);
    const stmt = db.prepare(`UPDATE salary_advance_requests SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`);
    stmt.run(...values);

    const getStmt = db.prepare('SELECT * FROM salary_advance_requests WHERE id = ?');
    return getStmt.get(id) as SalaryAdvanceRequest | undefined;
  },
};

// POSITION REPOSITORY
export const PositionRepository = {
  findAll(): Position[] {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM positions WHERE is_active = 1 ORDER BY name ASC');
    return stmt.all() as Position[];
  },

  findById(id: number): Position | undefined {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM positions WHERE id = ?');
    return stmt.get(id) as Position | undefined;
  },

  create(data: any): Position {
    const db = getConnection();
    const stmt = db.prepare(`
      INSERT INTO positions (name, code, department_id, salary_grade_id, description)
      VALUES (?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      data.name,
      data.code || null,
      data.department_id || null,
      data.salary_grade_id || null,
      data.description || null
    );

    return this.findById(Number(info.lastInsertRowid))!;
  },
};

// AREA REPOSITORY
export const AreaRepository = {
  findAll(): Area[] {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM areas WHERE is_active = 1 ORDER BY name ASC');
    return stmt.all() as Area[];
  },

  findById(id: number): Area | undefined {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM areas WHERE id = ?');
    return stmt.get(id) as Area | undefined;
  },

  create(data: any): Area {
    const db = getConnection();
    const stmt = db.prepare(`
      INSERT INTO areas (name, code, description)
      VALUES (?, ?, ?)
    `);

    const info = stmt.run(data.name, data.code || null, data.description || null);
    return this.findById(Number(info.lastInsertRowid))!;
  },
};

// SHIFT REPOSITORY
export const ShiftRepository = {
  findAll(): Shift[] {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM shifts WHERE is_active = 1 ORDER BY name ASC');
    return stmt.all() as Shift[];
  },

  findById(id: number): Shift | undefined {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM shifts WHERE id = ?');
    return stmt.get(id) as Shift | undefined;
  },

  create(data: any): Shift {
    const db = getConnection();
    const stmt = db.prepare(`
      INSERT INTO shifts (name, code, start_time, end_time, break_minutes)
      VALUES (?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      data.name,
      data.code || null,
      data.start_time,
      data.end_time,
      data.break_minutes || 60
    );

    return this.findById(Number(info.lastInsertRowid))!;
  },
};

// FORMULA REPOSITORY
export const FormulaRepository = {
  findAll(): Formula[] {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM formulas ORDER BY category ASC');
    return stmt.all() as Formula[];
  },

  findById(id: number): Formula | undefined {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM formulas WHERE id = ?');
    return stmt.get(id) as Formula | undefined;
  },

  findByKey(key: string): Formula | undefined {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM formulas WHERE key = ?');
    return stmt.get(key) as Formula | undefined;
  },

  create(data: any): Formula {
    const db = getConnection();
    const stmt = db.prepare(`
      INSERT INTO formulas (key, value, category, description)
      VALUES (?, ?, ?, ?)
    `);

    const info = stmt.run(
      data.key,
      data.value,
      data.category || 'General',
      data.description || null
    );

    return this.findById(Number(info.lastInsertRowid))!;
  },

  update(id: number, data: any): Formula | undefined {
    const db = getConnection();
    const updates: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        updates.push(`${key} = ?`);
        values.push(value ?? null);
      }
    }

    values.push(id);
    const stmt = db.prepare(`UPDATE formulas SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`);
    stmt.run(...values);

    return this.findById(id);
  },
};

// ACCOUNT REPOSITORY
export const AccountRepository = {
  findByUsername(username: string): any {
    const db = getConnection();
    const stmt = db.prepare(`
      SELECT a.*, e.id as employee_id, e.name, e.email, e.status
      FROM accounts a
      LEFT JOIN employees e ON a.employee_id = e.id
      WHERE LOWER(a.username) = LOWER(?)
    `);
    return stmt.get(username) as any;
  },

  findByEmployeeId(employeeId: number): any {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM accounts WHERE employee_id = ?');
    return stmt.get(employeeId) as any;
  },

  findById(id: number): any {
    const db = getConnection();
    const stmt = db.prepare('SELECT * FROM accounts WHERE id = ?');
    return stmt.get(id) as any;
  },

  findAll(): any[] {
    const db = getConnection();
    const stmt = db.prepare(`
      SELECT a.*, e.id as emp_id, e.name, e.employee_id
      FROM accounts a
      JOIN employees e ON a.employee_id = e.id
      ORDER BY a.created_at DESC
    `);
    return stmt.all() as any[];
  },

  create(data: { employee_id: number; username: string; password_hash: string; email?: string }): any {
    const db = getConnection();
    
    // Check if account already exists for this employee
    const existing = db.prepare('SELECT id FROM accounts WHERE employee_id = ?').get(data.employee_id);
    if (existing) {
      console.log(`[HRIS-DB] Account already exists for employee ID ${data.employee_id}`);
      return this.findByEmployeeId(data.employee_id);
    }

    const stmt = db.prepare(`
      INSERT INTO accounts (employee_id, username, password_hash, email, is_active)
      VALUES (?, ?, ?, ?, 1)
    `);

    const info = stmt.run(
      data.employee_id,
      data.username,
      data.password_hash,
      data.email || null
    );

    console.log(`[HRIS-DB] Account created for employee ID ${data.employee_id} with username ${data.username}`);
    return this.findById(Number(info.lastInsertRowid));
  },

  update(id: number, data: any): any {
    const db = getConnection();
    const updates: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at' && key !== 'employee_id') {
        updates.push(`${key} = ?`);
        values.push(value ?? null);
      }
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    const stmt = db.prepare(`UPDATE accounts SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`);
    stmt.run(...values);

    console.log(`[HRIS-DB] Account ID ${id} updated`);
    return this.findById(id);
  },

  delete(id: number): boolean {
    const db = getConnection();
    const stmt = db.prepare('DELETE FROM accounts WHERE id = ?');
    const info = stmt.run(id);
    
    if (info.changes > 0) {
      console.log(`[HRIS-DB] Account ID ${id} deleted`);
      return true;
    }
    return false;
  },

  setActive(id: number, isActive: boolean): any {
    return this.update(id, { is_active: isActive ? 1 : 0 });
  },

  updateLastLogin(id: number): any {
    const db = getConnection();
    db.prepare('UPDATE accounts SET last_login = datetime("now") WHERE id = ?').run(id);
    return this.findById(id);
  },
};
