// HRIS Database Models and Repositories
// Single source of truth: SQLite via better-sqlite3.

import { getConnection, initializeDatabase } from './database';

export type EmployeeRole = 'Employee' | 'Manager' | 'Admin' | 'CEO' | 'DEV';
export type RequestStatus = 'Pending' | 'Approved' | 'Rejected';
export type EmploymentType = 'Regular' | 'Probationary' | 'Casual' | 'Casual On-Call';
export type OnCallOfferStatus = 'Offered' | 'Confirmed' | 'Declined' | 'Cancelled' | 'Completed';

export type Employee = Record<string, any> & {
  id: number;
  employee_id: string;
  name: string;
  username: string | null;
  email: string | null;
  department_id: number | null;
  position_id: number | null;
  salary_grade_id: number | null;
  area_id: number | null;
  status: 'Active' | 'Resigned' | 'AWOL';
  employment_type: EmploymentType;
  employment_type_effective_date: string | null;
  role: EmployeeRole;
  basic_salary: number;
};

export type Department = Record<string, any>;
export type Position = Record<string, any>;
export type Area = Record<string, any>;
export type Shift = Record<string, any>;
export type AttendanceLog = Record<string, any>;
export type DailyAttendance = Record<string, any> & {
  id: number;
  employee_id: number;
  date: string;
  status: string;
  total_hours: number;
  overtime_minutes: number;
  late_minutes: number;
};
export type OTRequest = Record<string, any>;
export type LeaveRequest = Record<string, any>;
export type SalaryAdvanceRequest = Record<string, any>;
export type IncentiveRequest = Record<string, any>;
export type LoanExtensionRequest = Record<string, any>;
export type TardinessPoint = Record<string, any>;
export type Notification = Record<string, any>;
export type Holiday = Record<string, any>;
export type Formula = Record<string, any>;
export type Payroll = Record<string, any>;
export type PayrollOtCarryover = Record<string, any>;
export type EmployeeShift = Record<string, any>;
export type CasualOnCallShiftOffer = Record<string, any>;
export type SalaryGrade = Record<string, any>;

let initialized = false;

export function ensureInitialized() {
  if (!initialized) {
    initializeDatabase();
    backfillAccountsFromEmployees();
    backfillDailyAttendanceFromLogs();
    initialized = true;
  }
  return getConnection();
}

function db() {
  return getConnection();
}

function active(value: unknown): number {
  return value === false || value === 0 ? 0 : 1;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPLOYMENT_TYPE_LIMITS: Partial<Record<EmploymentType, number>> = {
  Probationary: 180,
  Casual: 365,
};

function dateOnly(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

const ALL_WORK_DAYS = [0, 1, 2, 3, 4, 5, 6];

function normalizeWorkDays(value: unknown): number[] {
  let raw = value;
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value);
    } catch {
      raw = value.split(',');
    }
  }

  if (!Array.isArray(raw)) return [...ALL_WORK_DAYS];

  const days = [...new Set(raw
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort((a, b) => a - b);

  return days.length ? days : [...ALL_WORK_DAYS];
}

function serializeWorkDays(value: unknown): string {
  return JSON.stringify(normalizeWorkDays(value));
}

function weekdayForDate(workDate: string) {
  const date = new Date(`${workDate}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getDay();
}

function isWorkdayForAssignment(assignment: Record<string, any>, workDate: string) {
  const weekday = weekdayForDate(workDate);
  return weekday === null || normalizeWorkDays(assignment.work_days).includes(weekday);
}

function daysSince(startDate?: string | null, asOf = dateOnly()) {
  if (!startDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${asOf}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1);
}

function normalizeEmploymentType(value?: string | null): EmploymentType {
  if (value === 'On-call') return 'Casual On-Call';
  if (value === 'Regular' || value === 'Probationary' || value === 'Casual' || value === 'Casual On-Call') return value;
  return 'Probationary';
}

function isFlexibleEmploymentType(value?: string | null) {
  const normalized = normalizeEmploymentType(value);
  return normalized === 'Casual' || normalized === 'Casual On-Call';
}

function boolishRows<T extends Record<string, any>>(rows: T[]): T[] {
  return rows.map(boolishRow);
}

function boolishRow<T extends Record<string, any> | undefined>(row: T): T {
  if (!row) return row;
  for (const key of ['is_active', 'is_night_shift']) {
    if (key in row) row[key] = Boolean(row[key]);
  }
  if ('work_days' in row) {
    row.work_days = normalizeWorkDays(row.work_days);
  }
  return row;
}

function setClause(data: Record<string, any>, allowed: string[], aliases: Record<string, string> = {}) {
  const sets: string[] = [];
  const values: any[] = [];
  for (const [rawKey, rawValue] of Object.entries(data)) {
    const key = aliases[rawKey] || rawKey;
    if (!allowed.includes(key)) continue;
    sets.push(`${key} = ?`);
    values.push(rawValue ?? null);
  }
  return { sets, values };
}

function runUpdate(table: string, id: number, data: Record<string, any>, allowed: string[], aliases: Record<string, string> = {}) {
  const { sets, values } = setClause(data, allowed, aliases);
  if (!sets.length) return { changes: 0 };
  values.push(id);
  return db().prepare(`UPDATE ${table} SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...values);
}

function getById(table: string, id: number): any {
  return boolishRow(db().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as any);
}

function normalizeEmployee(row: any): Employee | undefined {
  if (!row) return undefined;
  return {
    ...row,
    salary_grade_id: row.salary_grade_id ?? null,
    department_name: row.department_name ?? null,
    position_name: row.position_name ?? null,
    area_name: row.area_name ?? null,
    employment_type: normalizeEmploymentType(row.employment_type),
    employment_type_effective_date: row.employment_type_effective_date ?? row.hire_date ?? null,
  };
}

function employeeSelect(where = '', order = 'ORDER BY e.name ASC') {
  return `
    SELECT e.*,
      d.name as department_name,
      p.name as position_name,
      a.name as area_name,
      COALESCE(acc.username, e.username) as username
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN positions p ON p.id = e.position_id
    LEFT JOIN areas a ON a.id = e.area_id
    LEFT JOIN accounts acc ON acc.employee_id = e.id
    ${where}
    ${order}
  `;
}

function syncAccount(employee: any) {
  if (!employee?.username || !employee?.password_hash) return;
  db().prepare(`
    INSERT INTO accounts (employee_id, username, password_hash, email, is_active)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(employee_id) DO UPDATE SET
      username = excluded.username,
      password_hash = excluded.password_hash,
      email = excluded.email,
      is_active = excluded.is_active,
      updated_at = datetime('now')
  `).run(employee.id, employee.username, employee.password_hash, employee.email ?? null, employee.status === 'Active' ? 1 : 0);
}

function backfillAccountsFromEmployees() {
  const employees = db().prepare(`
    SELECT e.* FROM employees e
    LEFT JOIN accounts a ON a.employee_id = e.id
    WHERE e.username IS NOT NULL AND e.password_hash IS NOT NULL AND a.id IS NULL
  `).all();
  for (const employee of employees as any[]) syncAccount(employee);
}

function backfillDailyAttendanceFromLogs() {
  const rawDays = db().prepare(`
    SELECT
      employee_id,
      date(timestamp) as date,
      min(time(timestamp)) as time_in,
      max(time(timestamp)) as time_out,
      count(*) as punch_count
    FROM attendance_logs
    WHERE employee_id IS NOT NULL
    GROUP BY employee_id, date(timestamp)
  `).all() as Array<{
    employee_id: number;
    date: string;
    time_in: string;
    time_out: string;
    punch_count: number;
  }>;

  const upsert = db().prepare(`
    INSERT INTO daily_attendance (employee_id, date, time_in, time_out, total_hours, status)
    VALUES (?, ?, ?, ?, ?, 'Present')
    ON CONFLICT(employee_id, date) DO UPDATE SET
      time_in = excluded.time_in,
      time_out = excluded.time_out,
      total_hours = excluded.total_hours,
      status = CASE
        WHEN daily_attendance.status IN ('Absent', 'Holiday') THEN excluded.status
        ELSE daily_attendance.status
      END,
      updated_at = datetime('now')
  `);

  for (const day of rawDays) {
    const timeOut = day.punch_count > 1 && day.time_out !== day.time_in ? day.time_out : null;
    upsert.run(
      day.employee_id,
      day.date,
      day.time_in,
      timeOut,
      calculateHours(day.time_in, timeOut),
    );
  }
}

export const EmployeeRepository = {
  findAll(includePrivate = false): Employee[] {
    const rows = db().prepare(employeeSelect()).all() as any[];
    const employees = rows.map(normalizeEmployee).filter(Boolean) as Employee[];
    return includePrivate ? employees : employees.filter((e) => !['Manager', 'CEO'].includes(e.role));
  },

  findById(id: number): Employee | undefined {
    return normalizeEmployee(db().prepare(employeeSelect('WHERE e.id = ?', '')).get(id));
  },

  findByEmployeeId(employeeId: string): Employee | undefined {
    return normalizeEmployee(db().prepare(employeeSelect('WHERE e.employee_id = ?', '')).get(employeeId));
  },

  findByEmail(email: string): Employee | undefined {
    return normalizeEmployee(db().prepare(employeeSelect('WHERE LOWER(e.email) = LOWER(?)', '')).get(email));
  },

  create(data: Partial<Employee>): Employee {
    const effectiveDate = data.employment_type_effective_date ?? data.hire_date ?? dateOnly();
    const info = db().prepare(`
      INSERT INTO employees (
        employee_id, name, username, email, phone, picture, department_id, position_id,
        salary_grade_id, area_id, status, employment_type, employment_type_effective_date,
        role, password_hash, basic_salary, hire_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.employee_id,
      data.name,
      data.username ?? null,
      data.email ?? null,
      data.phone ?? null,
      data.picture ?? null,
      data.department_id ?? null,
      data.position_id ?? null,
      data.salary_grade_id ?? null,
      data.area_id ?? null,
      data.status ?? 'Active',
      normalizeEmploymentType(data.employment_type),
      effectiveDate,
      data.role ?? 'Employee',
      data.password_hash ?? null,
      data.basic_salary ?? 0,
      data.hire_date ?? null
    );
    const employee = this.findById(Number(info.lastInsertRowid))!;
    syncAccount(employee);
    return employee;
  },

  update(id: number, data: Partial<Employee>): Employee | undefined {
    const existing = this.findById(id);
    const payload: Record<string, any> = { ...data };
    if (payload.employment_type !== undefined) {
      payload.employment_type = normalizeEmploymentType(payload.employment_type);
      if (
        payload.employment_type !== existing?.employment_type &&
        payload.employment_type_effective_date === undefined
      ) {
        payload.employment_type_effective_date = dateOnly();
      }
    }
    runUpdate('employees', id, payload, [
      'employee_id', 'name', 'username', 'email', 'phone', 'picture', 'department_id',
      'position_id', 'salary_grade_id', 'area_id', 'status', 'employment_type', 'employment_type_effective_date', 'role', 'password_hash',
      'basic_salary', 'hire_date'
    ]);
    const employee = this.findById(id);
    syncAccount(employee);
    return employee;
  },

  getEmploymentTypeFlag(employeeId: number, asOf = dateOnly(), warningWindowDays = 30) {
    const employee = this.findById(employeeId);
    if (!employee) return null;
    const employmentType = normalizeEmploymentType(employee.employment_type);
    const limitDays = EMPLOYMENT_TYPE_LIMITS[employmentType];
    if (!limitDays) return null;

    const effectiveDate = employee.employment_type_effective_date ?? employee.hire_date ?? asOf;
    const daysInType = daysSince(effectiveDate, asOf);
    const daysRemaining = limitDays - daysInType;
    const flag = daysRemaining < 0
      ? 'exceeded'
      : daysRemaining <= warningWindowDays
        ? 'approaching'
        : 'ok';

    return {
      employee,
      employment_type: employmentType,
      effective_date: effectiveDate,
      days_in_type: daysInType,
      limit_days: limitDays,
      days_remaining: daysRemaining,
      flag,
      message: flag === 'exceeded'
        ? `${employmentType} limit exceeded by ${Math.abs(daysRemaining)} day(s)`
        : flag === 'approaching'
          ? `${employmentType} limit reaches ${limitDays} days in ${daysRemaining} day(s)`
          : `${employmentType} is within the ${limitDays}-day limit`,
    };
  },

  findEmploymentTypeFlags(asOf = dateOnly(), warningWindowDays = 30) {
    return this.findAll(true)
      .filter((employee) => employee.status === 'Active')
      .map((employee) => this.getEmploymentTypeFlag(employee.id, asOf, warningWindowDays))
      .filter((flag): flag is NonNullable<typeof flag> => !!flag && flag.flag !== 'ok');
  },

  validateSchedulable(employeeId: number, workDate = dateOnly()) {
    const employee = this.findById(employeeId);
    if (!employee) {
      return { valid: false, reason: 'Employee not found', employee: null, shift: null };
    }
    const employmentType = normalizeEmploymentType(employee.employment_type);
    if (!['Regular', 'Probationary'].includes(employmentType)) {
      return { valid: true, reason: null, employee, shift: null };
    }

    const shifts = db().prepare(`
      SELECT es.*, s.name as shift_name, s.start_time, s.end_time, s.break_minutes
      FROM employee_shifts es
      LEFT JOIN shifts s ON s.id = es.shift_id
      WHERE es.employee_id = ?
        AND es.is_active = 1
        AND es.effective_date <= ?
        AND (es.end_date IS NULL OR es.end_date >= ?)
      ORDER BY es.effective_date DESC
    `).all(employeeId, workDate, workDate) as EmployeeShift[];
    const shift = shifts.find((assignment) => isWorkdayForAssignment(assignment, workDate));

    if (!shift) {
      return {
        valid: false,
        reason: `${employmentType} employees need an active standing shift for this work day before they can be scheduled`,
        employee,
        shift: null,
      };
    }
    return { valid: true, reason: null, employee, shift: boolishRow(shift) };
  },

  delete(id: number): { changes: number } {
    const result = db().prepare(`UPDATE employees SET status = 'Resigned', updated_at = datetime('now') WHERE id = ?`).run(id);
    db().prepare(`UPDATE accounts SET is_active = 0, updated_at = datetime('now') WHERE employee_id = ?`).run(id);
    return { changes: result.changes };
  },
};

export const DepartmentRepository = {
  findAll(): Department[] {
    return boolishRows(db().prepare('SELECT * FROM departments WHERE is_active = 1 ORDER BY name ASC').all() as any[]);
  },
  findById(id: number): Department | undefined {
    return getById('departments', id);
  },
  findByName(name: string): Department | undefined {
    return boolishRow(db().prepare('SELECT * FROM departments WHERE LOWER(name) = LOWER(?) AND is_active = 1').get(name) as any);
  },
  create(data: Partial<Department>): Department {
    const info = db().prepare('INSERT INTO departments (name, code, description, is_active) VALUES (?, ?, ?, 1)')
      .run(data.name, data.code ?? null, data.description ?? null);
    return this.findById(Number(info.lastInsertRowid))!;
  },
  update(id: number, data: Partial<Department>): Department | undefined {
    runUpdate('departments', id, data, ['name', 'code', 'description', 'is_active']);
    return this.findById(id);
  },
  delete(id: number): { changes: number } {
    const result = db().prepare("UPDATE departments SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
    return { changes: result.changes };
  },
};

export const SalaryGradeRepository = {
  findAll(): SalaryGrade[] {
    return (db().prepare('SELECT *, amount as basic_salary FROM salary_grades WHERE is_active = 1 ORDER BY amount ASC').all() as any[]).map(boolishRow);
  },
  findById(id: number): SalaryGrade | undefined {
    return boolishRow(db().prepare('SELECT *, amount as basic_salary FROM salary_grades WHERE id = ?').get(id) as any);
  },
  create(data: Partial<SalaryGrade>): SalaryGrade {
    const info = db().prepare('INSERT INTO salary_grades (grade_name, amount, frequency, description, is_active) VALUES (?, ?, ?, ?, 1)')
      .run(data.grade_name, Number(data.amount ?? data.basic_salary ?? 0), data.frequency ?? 'monthly', data.description ?? null);
    return this.findById(Number(info.lastInsertRowid))!;
  },
  update(id: number, data: Partial<SalaryGrade>): SalaryGrade | undefined {
    const payload = { ...data, amount: data.amount ?? data.basic_salary };
    runUpdate('salary_grades', id, payload, ['grade_name', 'amount', 'frequency', 'description', 'is_active']);
    return this.findById(id);
  },
  delete(id: number): { changes: number } {
    const result = db().prepare("UPDATE salary_grades SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
    return { changes: result.changes };
  },
};

export const PositionRepository = {
  findAll(): Position[] {
    return boolishRows(db().prepare('SELECT * FROM positions WHERE is_active = 1 ORDER BY name ASC').all() as any[]);
  },
  findById(id: number): Position | undefined {
    return getById('positions', id);
  },
  create(data: Partial<Position>): Position {
    const info = db().prepare('INSERT INTO positions (name, code, department_id, salary_grade_id, description, is_active) VALUES (?, ?, ?, ?, ?, 1)')
      .run(data.name, data.code ?? null, data.department_id ?? null, data.salary_grade_id ?? null, data.description ?? null);
    return this.findById(Number(info.lastInsertRowid))!;
  },
  update(id: number, data: Partial<Position>): Position | undefined {
    runUpdate('positions', id, data, ['name', 'code', 'department_id', 'salary_grade_id', 'description', 'is_active']);
    return this.findById(id);
  },
  delete(id: number): { changes: number } {
    const result = db().prepare("UPDATE positions SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
    return { changes: result.changes };
  },
};

export const AreaRepository = {
  findAll(): Area[] {
    return boolishRows(db().prepare('SELECT * FROM areas WHERE is_active = 1 ORDER BY name ASC').all() as any[]);
  },
  findById(id: number): Area | undefined {
    return getById('areas', id);
  },
  create(data: Partial<Area>): Area {
    const info = db().prepare('INSERT INTO areas (name, code, description, is_active) VALUES (?, ?, ?, 1)')
      .run(data.name, data.code ?? null, data.description ?? null);
    return this.findById(Number(info.lastInsertRowid))!;
  },
  update(id: number, data: Partial<Area>): Area | undefined {
    runUpdate('areas', id, data, ['name', 'code', 'description', 'is_active']);
    return this.findById(id);
  },
  delete(id: number): { changes: number } {
    const result = db().prepare("UPDATE areas SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
    return { changes: result.changes };
  },
};

export const ShiftRepository = {
  findAll(includeInactive = false): Shift[] {
    const where = includeInactive ? '' : 'WHERE is_active = 1';
    return boolishRows(db().prepare(`SELECT * FROM shifts ${where} ORDER BY name ASC`).all() as any[]);
  },
  findById(id: number): Shift | undefined {
    return getById('shifts', id);
  },
  create(data: Partial<Shift>): Shift {
    const info = db().prepare(`
      INSERT INTO shifts (name, code, start_time, end_time, break_minutes, is_night_shift, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      data.name,
      data.code ?? null,
      data.start_time ?? '08:00',
      data.end_time ?? '17:00',
      data.break_minutes ?? 60,
      data.is_night_shift === true || data.is_night_shift === 1 ? 1 : 0
    );
    return this.findById(Number(info.lastInsertRowid))!;
  },
  update(id: number, data: Partial<Shift>): Shift | undefined {
    runUpdate('shifts', id, {
      ...data,
      is_night_shift: data.is_night_shift === undefined ? undefined : active(data.is_night_shift),
      is_active: data.is_active === undefined ? undefined : active(data.is_active),
    }, [
      'name', 'code', 'start_time', 'end_time', 'break_minutes', 'is_night_shift', 'is_active'
    ]);
    return this.findById(id);
  },
  delete(id: number): { changes: number } {
    const result = db().prepare("UPDATE shifts SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
    return { changes: result.changes };
  },
};

export const HolidayRepository = {
  findAll(): Holiday[] {
    return boolishRows(db().prepare('SELECT * FROM holidays WHERE is_active = 1 ORDER BY date DESC').all() as any[]);
  },
  findByDate(date: string): Holiday | undefined {
    return boolishRow(db().prepare('SELECT * FROM holidays WHERE date = ? AND is_active = 1').get(date) as any);
  },
  create(data: Partial<Holiday>): Holiday {
    const info = db().prepare('INSERT INTO holidays (name, date, type, observance_type, pay_multiplier, is_active) VALUES (?, ?, ?, ?, ?, 1)')
      .run(data.name, data.date, data.type ?? 'Regular', data.observance_type ?? 'Fixed', data.pay_multiplier ?? 2.0);
    return getById('holidays', Number(info.lastInsertRowid))!;
  },
  update(id: number, data: Partial<Holiday>): Holiday | undefined {
    runUpdate('holidays', id, data, ['name', 'date', 'type', 'observance_type', 'pay_multiplier', 'is_active']);
    return getById('holidays', id);
  },
  delete(id: number): { changes: number } {
    const result = db().prepare("UPDATE holidays SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
    return { changes: result.changes };
  },
};

function normalizeAttendance(row: any) {
  if (!row) return row;
  return {
    ...row,
    check_in: row.time_in,
    check_out: row.time_out,
    worked_hours: row.total_hours,
  };
}

function calculateHours(timeIn?: string | null, timeOut?: string | null) {
  if (!timeIn || !timeOut) return 0;
  const [inH, inM] = timeIn.split(':').map(Number);
  const [outH, outM] = timeOut.split(':').map(Number);
  let minutes = outH * 60 + outM - (inH * 60 + inM);
  if (minutes < 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}

export const AttendanceRepository = {
  findAll(startDate?: string, endDate?: string): DailyAttendance[] {
    const params: any[] = [];
    let where = '';
    if (startDate) {
      where += ' AND da.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      where += ' AND da.date <= ?';
      params.push(endDate);
    }
    return (db().prepare(`
      SELECT da.*, e.name as employee_name
      FROM daily_attendance da
      LEFT JOIN employees e ON e.id = da.employee_id
      WHERE 1 = 1 ${where}
      ORDER BY da.date DESC, e.name ASC
    `).all(...params) as any[]).map(normalizeAttendance);
  },

  findByEmployeeId(employeeId: number): DailyAttendance[] {
    return this.findByEmployeeAndDateRange(employeeId);
  },

  findByEmployee(employeeId: number, startDate?: string, endDate?: string): DailyAttendance[] {
    return this.findByEmployeeAndDateRange(employeeId, startDate, endDate);
  },

  findByEmployeeAndDateRange(employeeId: number, startDate?: string, endDate?: string): DailyAttendance[] {
    const params: any[] = [employeeId];
    let where = 'WHERE da.employee_id = ?';
    if (startDate) {
      where += ' AND da.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      where += ' AND da.date <= ?';
      params.push(endDate);
    }
    return (db().prepare(`
      SELECT da.*, e.name as employee_name
      FROM daily_attendance da
      LEFT JOIN employees e ON e.id = da.employee_id
      ${where}
      ORDER BY da.date DESC
    `).all(...params) as any[]).map(normalizeAttendance);
  },

  findByEmployeeAndDate(employeeId: number, date: string): DailyAttendance | undefined {
    return normalizeAttendance(db().prepare('SELECT * FROM daily_attendance WHERE employee_id = ? AND date = ?').get(employeeId, date));
  },

  findById(id: number): DailyAttendance | undefined {
    return normalizeAttendance(getById('daily_attendance', id));
  },

  findByEmployeeAndPeriod(employeeId: number, startDate: string, endDate: string): DailyAttendance[] {
    return this.findByEmployeeAndDateRange(employeeId, startDate, endDate);
  },

  create(data: Partial<DailyAttendance>): DailyAttendance {
    return this.upsert(data) as DailyAttendance;
  },

  upsert(data: Partial<DailyAttendance>): { lastInsertRowid: number } | DailyAttendance {
    const timeIn = data.time_in ?? data.check_in ?? null;
    const timeOut = data.time_out ?? data.check_out ?? null;
    const totalHours = data.total_hours ?? data.worked_hours ?? calculateHours(timeIn, timeOut);
    const existing = this.findByEmployeeAndDate(Number(data.employee_id), String(data.date));
    if (existing) {
      this.update(existing.id, { ...data, time_in: timeIn, time_out: timeOut, total_hours: totalHours });
      return this.findByEmployeeAndDate(Number(data.employee_id), String(data.date))!;
    }
    const info = db().prepare(`
      INSERT INTO daily_attendance (
        employee_id, date, time_in, time_out, shift_id, scheduled_in, scheduled_out,
        late_minutes, early_out_minutes, overtime_minutes, undertime_minutes, total_hours, status, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.employee_id, data.date, timeIn, timeOut, data.shift_id ?? null,
      data.scheduled_in ?? null, data.scheduled_out ?? null, data.late_minutes ?? 0,
      data.early_out_minutes ?? 0, data.overtime_minutes ?? 0, data.undertime_minutes ?? 0,
      totalHours, data.status ?? 'Present', data.remarks ?? null
    );
    return this.findByEmployeeAndDate(Number(data.employee_id), String(data.date)) ?? { lastInsertRowid: Number(info.lastInsertRowid) };
  },

  update(id: number, data: Partial<DailyAttendance>): DailyAttendance | undefined {
    const existing = getById('daily_attendance', id);
    const payload: Record<string, any> = { ...data };
    const nextTimeIn = data.time_in ?? data.check_in;
    const nextTimeOut = data.time_out ?? data.check_out;
    if (nextTimeIn !== undefined) payload.time_in = nextTimeIn;
    if (nextTimeOut !== undefined) payload.time_out = nextTimeOut;
    if (payload.total_hours === undefined && (payload.time_in || payload.time_out)) {
      payload.total_hours = calculateHours(payload.time_in ?? existing?.time_in, payload.time_out ?? existing?.time_out);
    }
    runUpdate('daily_attendance', id, payload, [
      'employee_id', 'date', 'time_in', 'time_out', 'shift_id', 'scheduled_in', 'scheduled_out',
      'late_minutes', 'early_out_minutes', 'overtime_minutes', 'undertime_minutes', 'total_hours',
      'status', 'remarks'
    ], { check_in: 'time_in', check_out: 'time_out', worked_hours: 'total_hours' });
    return normalizeAttendance(getById('daily_attendance', id));
  },
};

export const AttendanceLogRepository = {
  findAll(): AttendanceLog[] {
    return db().prepare('SELECT * FROM attendance_logs ORDER BY timestamp DESC').all() as any[];
  },
  findByEmployeeAndPeriod(employeeId: number, startDate: string, endDate: string): AttendanceLog[] {
    return db().prepare(`
      SELECT * FROM attendance_logs
      WHERE employee_id = ? AND date(timestamp) BETWEEN ? AND ?
      ORDER BY timestamp ASC
    `).all(employeeId, startDate, endDate) as any[];
  },
  findLatestByEmployeeStateOnDate(employeeId: number, state: number, date: string): AttendanceLog | undefined {
    return db().prepare(`
      SELECT * FROM attendance_logs
      WHERE employee_id = ?
        AND state = ?
        AND date(timestamp) = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(employeeId, state, date) as AttendanceLog | undefined;
  },
  create(data: Partial<AttendanceLog>): AttendanceLog {
    const info = db().prepare(`
      INSERT INTO attendance_logs (employee_id, employee_idno, timestamp, state, device_id, photo)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.employee_id ?? null, data.employee_idno ?? null, data.timestamp, data.state ?? 0, data.device_id ?? null, data.photo ?? null);
    return getById('attendance_logs', Number(info.lastInsertRowid))!;
  },
};

function normalizeOT(row: any) {
  return row ? { ...row, ot_date: row.date } : row;
}

function normalizeRequest(row: any) {
  return row ? { ...row, approval_date: row.approved_at, remarks: row.rejection_reason } : row;
}

function requestRepo(table: string, dateAliases: Record<string, string> = {}) {
  return {
    findAll(): any[] {
      return (db().prepare(`
        SELECT r.*, e.name as employee_name, approver.name as approver_name
        FROM ${table} r
        LEFT JOIN employees e ON e.id = r.employee_id
        LEFT JOIN employees approver ON approver.id = r.approved_by
        ORDER BY r.created_at DESC
      `).all() as any[]).map((row) => table === 'ot_requests' ? normalizeOT(normalizeRequest(row)) : normalizeRequest(row));
    },
    findById(id: number): any {
      const row = db().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
      return table === 'ot_requests' ? normalizeOT(normalizeRequest(row)) : normalizeRequest(row);
    },
    findByStatus(status: RequestStatus): any[] {
      return this.findAll().filter((request: any) => request.status === status);
    },
    create(data: Record<string, any>): any {
      const payload = { ...data };
      for (const [from, to] of Object.entries(dateAliases)) payload[to] = payload[to] ?? payload[from];
      const columns = table === 'salary_advance_requests'
        ? ['employee_id', 'amount', 'reason', 'repayment_months', 'status']
        : table === 'incentive_requests'
          ? ['employee_id', 'type', 'amount', 'reason', 'status']
          : table === 'loan_extension_requests'
            ? ['salary_advance_id', 'employee_id', 'requested_extra_months', 'reason', 'status']
        : table === 'leave_requests'
          ? ['employee_id', 'leave_type', 'start_date', 'end_date', 'days', 'reason', 'status']
          : ['employee_id', 'date', 'start_time', 'end_time', 'hours', 'reason', 'status'];
      const values = columns.map((column) => payload[column] ?? (column === 'status' ? 'Pending' : null));
      const info = db().prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...values);
      return this.findById(Number(info.lastInsertRowid));
    },
    update(id: number, data: Record<string, any>): any {
      const aliases = { ...dateAliases, approval_date: 'approved_at', remarks: 'rejection_reason' };
      runUpdate(table, id, data, [
        'employee_id', 'date', 'start_time', 'end_time', 'hours', 'leave_type', 'start_date', 'end_date',
        'days', 'type', 'amount', 'reason', 'repayment_months', 'salary_advance_id', 'requested_extra_months',
        'status', 'approved_by', 'approved_at', 'rejection_reason'
      ], aliases);
      return this.findById(id);
    },
  };
}

export const OTRequestRepository = requestRepo('ot_requests', { ot_date: 'date' });
export const LeaveRequestRepository = requestRepo('leave_requests');
export const SalaryAdvanceRepository = requestRepo('salary_advance_requests');
export const IncentiveRequestRepository = requestRepo('incentive_requests');
export const LoanExtensionRequestRepository = requestRepo('loan_extension_requests');

export const TardinessPointRepository = {
  findByEmployeeYear(employeeId: number, year: number): TardinessPoint[] {
    return db().prepare(`
      SELECT * FROM tardiness_points
      WHERE employee_id = ? AND year = ?
      ORDER BY date ASC
    `).all(employeeId, year) as TardinessPoint[];
  },
  findByEmployeeAndDate(employeeId: number, date: string): TardinessPoint | undefined {
    return db().prepare('SELECT * FROM tardiness_points WHERE employee_id = ? AND date = ?')
      .get(employeeId, date) as TardinessPoint | undefined;
  },
  upsert(data: Partial<TardinessPoint>): TardinessPoint {
    const year = Number(data.year ?? String(data.date).slice(0, 4));
    db().prepare(`
      INSERT INTO tardiness_points (employee_id, date, late_minutes, points, year)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, date) DO UPDATE SET
        late_minutes = excluded.late_minutes,
        points = excluded.points,
        year = excluded.year,
        updated_at = datetime('now')
    `).run(
      data.employee_id,
      data.date,
      data.late_minutes ?? 0,
      data.points ?? 0,
      year
    );
    return this.findByEmployeeAndDate(Number(data.employee_id), String(data.date))!;
  },
  deleteByEmployeeAndDate(employeeId: number, date: string): { changes: number } {
    return db().prepare('DELETE FROM tardiness_points WHERE employee_id = ? AND date = ?').run(employeeId, date);
  },
  getAnnualPoints(employeeId: number, year: number): number {
    const row = db().prepare(`
      SELECT COALESCE(SUM(points), 0) as total
      FROM tardiness_points
      WHERE employee_id = ? AND year = ?
    `).get(employeeId, year) as { total: number };
    return Number(row?.total || 0);
  },
};

export function getAnnualTardinessPoints(employeeId: number, year: number): number {
  return TardinessPointRepository.getAnnualPoints(employeeId, year);
}

export const NotificationRepository = {
  findUnread(): Notification[] {
    return this.findUnreadManager();
  },
  findUnreadManager(): Notification[] {
    return (db().prepare(`
      SELECT n.*, e.name as employee_name
      FROM notifications n
      LEFT JOIN employees e ON e.id = n.employee_id
      WHERE n.is_read = 0
        AND n.type != 'employee_tardiness_ack'
      ORDER BY n.created_at DESC
    `).all() as any[]).map(boolishRow);
  },
  findUnreadForEmployee(employeeId: number): Notification[] {
    return (db().prepare(`
      SELECT n.*, e.name as employee_name
      FROM notifications n
      LEFT JOIN employees e ON e.id = n.employee_id
      WHERE n.is_read = 0
        AND n.employee_id = ?
        AND n.type = 'employee_tardiness_ack'
      ORDER BY n.created_at DESC
    `).all(employeeId) as any[]).map(boolishRow);
  },
  findById(id: number): Notification | undefined {
    return getById('notifications', id);
  },
  create(data: Partial<Notification>): Notification {
    const info = db().prepare(`
      INSERT INTO notifications (employee_id, type, message, target_url, request_type, request_id, is_read)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.employee_id ?? null,
      data.type,
      data.message,
      data.target_url ?? null,
      data.request_type ?? null,
      data.request_id ?? null,
      data.is_read ? 1 : 0
    );
    return getById('notifications', Number(info.lastInsertRowid))!;
  },
  createOnce(data: Partial<Notification>): Notification | undefined {
    if (data.request_type && data.request_id) {
      const existing = db().prepare(`
        SELECT * FROM notifications
        WHERE type = ? AND request_type = ? AND request_id = ?
        LIMIT 1
      `).get(data.type, data.request_type, data.request_id) as Notification | undefined;
      if (existing) return boolishRow(existing);
      return this.create(data);
    }

    const existing = db().prepare(`
      SELECT * FROM notifications
      WHERE (employee_id = ? OR (? IS NULL AND employee_id IS NULL))
        AND type = ? AND message = ?
      LIMIT 1
    `).get(data.employee_id ?? null, data.employee_id ?? null, data.type, data.message) as Notification | undefined;
    if (existing) return boolishRow(existing);
    return this.create(data);
  },
  markRead(id: number): Notification | undefined {
    db().prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
    return getById('notifications', id);
  },
  markApprovalRead(requestType: string, requestId: number): { changes: number } {
    return db().prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE is_read = 0 AND request_type = ? AND request_id = ?
    `).run(requestType, requestId);
  },
  markEmployeeRead(id: number, employeeId: number): Notification | undefined {
    db().prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE id = ? AND employee_id = ? AND type = 'employee_tardiness_ack'
    `).run(id, employeeId);
    return getById('notifications', id);
  },
  markAllRead(): { changes: number } {
    return this.markAllManagerRead();
  },
  markAllManagerRead(): { changes: number } {
    return db().prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE is_read = 0 AND type != 'employee_tardiness_ack'
    `).run();
  },
  markAllEmployeeRead(employeeId: number): { changes: number } {
    return db().prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE is_read = 0 AND employee_id = ? AND type = 'employee_tardiness_ack'
    `).run(employeeId);
  },
};

export const FormulaRepository = {
  findAll(): Formula[] {
    return boolishRows(db().prepare('SELECT * FROM formulas WHERE is_active = 1 ORDER BY category ASC, key ASC').all() as any[]);
  },
  findById(id: number): Formula | undefined {
    return getById('formulas', id);
  },
  findByKey(key: string): Formula | undefined {
    return boolishRow(db().prepare('SELECT * FROM formulas WHERE key = ?').get(key) as any);
  },
  findByCategory(category: string): Formula[] {
    return boolishRows(db().prepare('SELECT * FROM formulas WHERE category = ? AND is_active = 1 ORDER BY key ASC').all(category) as any[]);
  },
  getValue(key: string, defaultValue = 0): number {
    const formula = this.findByKey(key);
    const value = Number(formula?.value);
    return Number.isFinite(value) ? value : defaultValue;
  },
  upsert(data: Partial<Formula>): Formula {
    const existing = data.key ? this.findByKey(data.key) : undefined;
    if (existing) return this.update(existing.id, data)!;
    const info = db().prepare(`
      INSERT INTO formulas (key, value, category, description, data_type, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(data.key, data.value, data.category ?? 'other', data.description ?? null, data.data_type ?? 'number');
    return this.findById(Number(info.lastInsertRowid))!;
  },
  update(id: number, data: Partial<Formula>): Formula | undefined {
    runUpdate('formulas', id, data, ['key', 'value', 'category', 'description', 'data_type', 'is_active']);
    return this.findById(id);
  },
};

function normalizePayroll(row: any) {
  if (!row) return row;
  const sss = row.sss ?? row.sss_deduction ?? 0;
  const philhealth = row.philhealth ?? row.philhealth_deduction ?? 0;
  const pagibig = row.pagibig ?? row.pagibig_deduction ?? 0;
  const tax = row.tax ?? row.tax_deduction ?? 0;
  const advanceDeduction = row.advance_deduction ?? row.salary_advance_deduction ?? 0;
  const otherDeductions = row.other_deductions ?? 0;
  return {
    ...row,
    basic_pay: row.basic_pay ?? row.basic_salary ?? 0,
    ot_hours: row.ot_hours ?? row.overtime_hours ?? 0,
    ot_pay: row.ot_pay ?? row.overtime_pay ?? 0,
    night_shift_pay: row.night_shift_pay ?? 0,
    sss,
    philhealth,
    pagibig,
    tax,
    advance_deduction: advanceDeduction,
    other_deductions: otherDeductions,
  };
}

const payrollAliases = {
  basic_pay: 'basic_salary',
  ot_hours: 'overtime_hours',
  ot_pay: 'overtime_pay',
  sss: 'sss_deduction',
  philhealth: 'philhealth_deduction',
  pagibig: 'pagibig_deduction',
  tax: 'tax_deduction',
  advance_deduction: 'salary_advance_deduction',
  late_deduction: 'other_deductions',
};

export const PayrollOtCarryoverRepository = {
  findByPayablePeriod(employeeId: number, periodStart: string, periodEnd: string): PayrollOtCarryover[] {
    return db().prepare(`
      SELECT c.*, e.name as employee_name
      FROM payroll_ot_carryovers c
      LEFT JOIN employees e ON e.id = c.employee_id
      WHERE c.employee_id = ?
        AND c.payable_period_start = ?
        AND c.payable_period_end = ?
      ORDER BY c.source_date ASC, c.start_time ASC
    `).all(employeeId, periodStart, periodEnd) as PayrollOtCarryover[];
  },
  upsert(data: Partial<PayrollOtCarryover>): PayrollOtCarryover {
    db().prepare(`
      INSERT INTO payroll_ot_carryovers (
        employee_id, source_attendance_id, source_date, cutoff_at, start_time, end_time,
        hours, payable_period_start, payable_period_end, payroll_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, source_date, cutoff_at) DO UPDATE SET
        source_attendance_id = excluded.source_attendance_id,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        hours = excluded.hours,
        payable_period_start = excluded.payable_period_start,
        payable_period_end = excluded.payable_period_end,
        status = CASE
          WHEN payroll_ot_carryovers.status = 'Applied' THEN payroll_ot_carryovers.status
          ELSE excluded.status
        END,
        updated_at = datetime('now')
    `).run(
      data.employee_id,
      data.source_attendance_id ?? null,
      data.source_date,
      data.cutoff_at,
      data.start_time,
      data.end_time,
      data.hours,
      data.payable_period_start,
      data.payable_period_end,
      data.payroll_id ?? null,
      data.status ?? 'Pending'
    );
    return db().prepare(`
      SELECT * FROM payroll_ot_carryovers
      WHERE employee_id = ? AND source_date = ? AND cutoff_at = ?
    `).get(data.employee_id, data.source_date, data.cutoff_at) as PayrollOtCarryover;
  },
  deleteBySource(employeeId: number, sourceDate: string, cutoffAt: string): { changes: number } {
    return db().prepare(`
      DELETE FROM payroll_ot_carryovers
      WHERE employee_id = ? AND source_date = ? AND cutoff_at = ? AND status != 'Applied'
    `).run(employeeId, sourceDate, cutoffAt);
  },
  markApplied(employeeId: number, periodStart: string, periodEnd: string, payrollId: number): { changes: number } {
    return db().prepare(`
      UPDATE payroll_ot_carryovers
      SET payroll_id = ?, status = 'Applied', updated_at = datetime('now')
      WHERE employee_id = ?
        AND payable_period_start = ?
        AND payable_period_end = ?
    `).run(payrollId, employeeId, periodStart, periodEnd);
  },
};

export const PayrollRepository = {
  findAll(status?: string): Payroll[] {
    const params: any[] = [];
    let where = '';
    if (status) {
      where = 'WHERE p.status = ?';
      params.push(status);
    }
    return (db().prepare(`
      SELECT p.*, e.name as employee_name, e.employee_id as employee_code
      FROM payroll p
      LEFT JOIN employees e ON e.id = p.employee_id
      ${where}
      ORDER BY p.period_start DESC, e.name ASC
    `).all(...params) as any[]).map(normalizePayroll);
  },
  findById(id: number): Payroll | undefined {
    return normalizePayroll(db().prepare('SELECT * FROM payroll WHERE id = ?').get(id));
  },
  findByEmployee(employeeId: number): Payroll[] {
    return this.findAll().filter((payroll) => payroll.employee_id === employeeId);
  },
  findByPeriod(startDate: string, endDate: string): Payroll[] {
    return this.findAll().filter((payroll) => payroll.period_start === startDate && payroll.period_end === endDate);
  },
  create(data: Partial<Payroll>): Payroll {
    const payload = { ...data };
    for (const [from, to] of Object.entries(payrollAliases)) payload[to] = payload[to] ?? payload[from];
    const columns = [
      'employee_id', 'payroll_type', 'period_mode', 'period_start', 'period_end', 'basic_salary', 'days_worked', 'regular_hours',
      'overtime_hours', 'overtime_pay', 'night_shift_pay', 'holiday_pay', 'allowances', 'gross_pay', 'sss_deduction',
      'philhealth_deduction', 'pagibig_deduction', 'tax_deduction', 'salary_advance_deduction',
      'late_deduction_minutes', 'late_absence_equivalents', 'other_deductions', 'total_deductions', 'net_pay', 'status'
    ];
    const values = columns.map((column) => {
      if (column === 'status') return payload[column] ?? 'Draft';
      if (column === 'payroll_type') return payload[column] ?? 'Regular';
      if (column === 'period_mode') return payload[column] ?? 'standard';
      return payload[column] ?? 0;
    });
    const info = db().prepare(`
      INSERT INTO payroll (${columns.join(', ')})
      VALUES (${columns.map(() => '?').join(', ')})
      ON CONFLICT(employee_id, period_start, period_end) DO UPDATE SET
        payroll_type = excluded.payroll_type,
        period_mode = excluded.period_mode,
        basic_salary = excluded.basic_salary,
        days_worked = excluded.days_worked,
        regular_hours = excluded.regular_hours,
        overtime_hours = excluded.overtime_hours,
        overtime_pay = excluded.overtime_pay,
        night_shift_pay = excluded.night_shift_pay,
        holiday_pay = excluded.holiday_pay,
        allowances = excluded.allowances,
        gross_pay = excluded.gross_pay,
        sss_deduction = excluded.sss_deduction,
        philhealth_deduction = excluded.philhealth_deduction,
        pagibig_deduction = excluded.pagibig_deduction,
        tax_deduction = excluded.tax_deduction,
        salary_advance_deduction = excluded.salary_advance_deduction,
        late_deduction_minutes = excluded.late_deduction_minutes,
        late_absence_equivalents = excluded.late_absence_equivalents,
        other_deductions = excluded.other_deductions,
        total_deductions = excluded.total_deductions,
        net_pay = excluded.net_pay,
        status = excluded.status,
        updated_at = datetime('now')
    `).run(...values);
    return normalizePayroll(getById('payroll', Number(info.lastInsertRowid)) ?? this.findByPeriod(String(data.period_start), String(data.period_end)).find((p) => p.employee_id === data.employee_id));
  },
  update(id: number, data: Partial<Payroll>): Payroll | undefined {
    const payload = { ...data };
    for (const [from, to] of Object.entries(payrollAliases)) payload[to] = payload[to] ?? payload[from];
    runUpdate('payroll', id, payload, [
      'employee_id', 'payroll_type', 'period_mode', 'period_start', 'period_end', 'basic_salary', 'days_worked', 'regular_hours',
      'overtime_hours', 'overtime_pay', 'night_shift_pay', 'holiday_pay', 'allowances', 'gross_pay', 'sss_deduction',
      'philhealth_deduction', 'pagibig_deduction', 'tax_deduction', 'salary_advance_deduction',
      'late_deduction_minutes', 'late_absence_equivalents', 'other_deductions', 'total_deductions', 'net_pay', 'status',
      'approved_by', 'approved_at', 'paid_at', 'claimed_at'
    ], payrollAliases);
    return this.findById(id);
  },
  deleteGenerated(id: number, reason: string, deletedBy: number): { changes: number } {
    const payroll = this.findById(id);
    if (!payroll || payroll.status === 'Paid') return { changes: 0 };

    db().prepare(`
      INSERT INTO payroll_deletion_logs (
        payroll_id, employee_id, period_start, period_end, payroll_type, status,
        gross_pay, net_pay, reason, deleted_by, snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payroll.id,
      payroll.employee_id,
      payroll.period_start,
      payroll.period_end,
      payroll.payroll_type ?? 'Regular',
      payroll.status,
      payroll.gross_pay ?? 0,
      payroll.net_pay ?? 0,
      reason,
      deletedBy,
      JSON.stringify(payroll)
    );

    return db().prepare('DELETE FROM payroll WHERE id = ?').run(id);
  },
};

export const PayrollDeletionLogRepository = {
  findAll(): any[] {
    return db().prepare(`
      SELECT l.*, deleter.name as deleted_by_name, e.name as employee_name, e.employee_id as employee_code
      FROM payroll_deletion_logs l
      LEFT JOIN employees deleter ON deleter.id = l.deleted_by
      LEFT JOIN employees e ON e.id = l.employee_id
      ORDER BY l.deleted_at DESC
    `).all() as any[];
  },
};

export const EmployeeShiftRepository = {
  findByEmployee(employeeId: number): EmployeeShift | undefined {
    return boolishRow(db().prepare('SELECT * FROM employee_shifts WHERE employee_id = ? AND is_active = 1 ORDER BY effective_date DESC LIMIT 1').get(employeeId) as any);
  },
  findByEmployeeAssignments(employeeId: number): EmployeeShift[] {
    return boolishRows(db().prepare(`
      SELECT es.*, s.name as shift_name, s.start_time, s.end_time, s.break_minutes
      FROM employee_shifts es
      LEFT JOIN shifts s ON s.id = es.shift_id
      WHERE es.employee_id = ? AND es.is_active = 1
      ORDER BY es.effective_date DESC, es.id ASC
    `).all(employeeId) as any[]);
  },
  findActiveForDate(employeeId: number, workDate = dateOnly()): EmployeeShift | undefined {
    const assignments = db().prepare(`
      SELECT es.*, s.name as shift_name, s.start_time, s.end_time, s.break_minutes
      FROM employee_shifts es
      LEFT JOIN shifts s ON s.id = es.shift_id
      WHERE es.employee_id = ?
        AND es.is_active = 1
        AND es.effective_date <= ?
        AND (es.end_date IS NULL OR es.end_date >= ?)
      ORDER BY es.effective_date DESC
    `).all(employeeId, workDate, workDate) as any[];
    return boolishRow(assignments.find((assignment) => isWorkdayForAssignment(assignment, workDate)) as any);
  },
  assign(data: Partial<EmployeeShift>): { lastInsertRowid: number } {
    db().prepare(`
      UPDATE employee_shifts
      SET is_active = 0, end_date = ?, updated_at = datetime('now')
      WHERE employee_id = ? AND is_active = 1
    `).run(data.effective_date ?? new Date().toISOString().split('T')[0], data.employee_id);

    const info = db().prepare(`
      INSERT INTO employee_shifts (employee_id, shift_id, effective_date, end_date, work_days, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(data.employee_id, data.shift_id, data.effective_date, data.end_date ?? null, serializeWorkDays(data.work_days));
    return { lastInsertRowid: Number(info.lastInsertRowid) };
  },
  assignMany(data: {
    employee_id: number;
    effective_date?: string;
    end_date?: string | null;
    assignments: Array<{ shift_id: number; work_days: unknown }>;
  }): { changes: number; ids: number[] } {
    const effectiveDate = data.effective_date ?? dateOnly();
    const insert = db().prepare(`
      INSERT INTO employee_shifts (employee_id, shift_id, effective_date, end_date, work_days, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const ids: number[] = [];

    db().transaction(() => {
      this.clearActive(data.employee_id, effectiveDate);
      for (const assignment of data.assignments) {
        const info = insert.run(
          data.employee_id,
          assignment.shift_id,
          effectiveDate,
          data.end_date ?? null,
          serializeWorkDays(assignment.work_days)
        );
        ids.push(Number(info.lastInsertRowid));
      }
    })();

    return { changes: ids.length, ids };
  },
  clearActive(employeeId: number, endDate = dateOnly()): { changes: number } {
    return db().prepare(`
      UPDATE employee_shifts
      SET is_active = 0, end_date = ?, updated_at = datetime('now')
      WHERE employee_id = ? AND is_active = 1
    `).run(endDate, employeeId);
  },
};

export const CasualOnCallShiftOfferRepository = {
  findAll(): CasualOnCallShiftOffer[] {
    return db().prepare(`
      SELECT o.*, e.name as employee_name, e.employee_id as employee_code, s.name as shift_name
      FROM casual_on_call_shift_offers o
      LEFT JOIN employees e ON e.id = o.employee_id
      LEFT JOIN shifts s ON s.id = o.shift_id
      ORDER BY o.work_date DESC, o.start_time ASC
    `).all() as CasualOnCallShiftOffer[];
  },

  findById(id: number): CasualOnCallShiftOffer | undefined {
    return getById('casual_on_call_shift_offers', id);
  },

  findByEmployee(employeeId: number, startDate?: string, endDate?: string): CasualOnCallShiftOffer[] {
    const params: any[] = [employeeId];
    let where = 'WHERE o.employee_id = ?';
    if (startDate) {
      where += ' AND o.work_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      where += ' AND o.work_date <= ?';
      params.push(endDate);
    }
    return db().prepare(`
      SELECT o.*, s.name as shift_name
      FROM casual_on_call_shift_offers o
      LEFT JOIN shifts s ON s.id = o.shift_id
      ${where}
      ORDER BY o.work_date DESC, o.start_time ASC
    `).all(...params) as CasualOnCallShiftOffer[];
  },

  findByDate(workDate: string, status?: OnCallOfferStatus): CasualOnCallShiftOffer[] {
    const params: any[] = [workDate];
    let where = 'WHERE o.work_date = ?';
    if (status) {
      where += ' AND o.status = ?';
      params.push(status);
    }
    return db().prepare(`
      SELECT o.*, e.name as employee_name, e.employee_id as employee_code, s.name as shift_name
      FROM casual_on_call_shift_offers o
      LEFT JOIN employees e ON e.id = o.employee_id
      LEFT JOIN shifts s ON s.id = o.shift_id
      ${where}
      ORDER BY o.start_time ASC, e.name ASC
    `).all(...params) as CasualOnCallShiftOffer[];
  },

  createOffer(data: Partial<CasualOnCallShiftOffer>): CasualOnCallShiftOffer {
    const employee = EmployeeRepository.findById(Number(data.employee_id));
    if (!employee) throw new Error('Employee not found');

    const shift = data.shift_id ? ShiftRepository.findById(Number(data.shift_id)) : null;
    const startTime = data.start_time ?? shift?.start_time;
    const endTime = data.end_time ?? shift?.end_time;
    if (!data.work_date || !startTime || !endTime) {
      throw new Error('Work date, start time, and end time are required');
    }

    const status = data.status ?? 'Offered';
    const confirmedAt = ['Confirmed', 'Completed'].includes(String(status)) ? new Date().toISOString() : null;
    const info = db().prepare(`
      INSERT INTO casual_on_call_shift_offers (
        employee_id, shift_id, work_date, start_time, end_time, break_minutes,
        status, offered_by, confirmed_at, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.employee_id,
      data.shift_id ?? null,
      data.work_date,
      startTime,
      endTime,
      data.break_minutes ?? shift?.break_minutes ?? 0,
      status,
      data.offered_by ?? null,
      confirmedAt,
      data.notes ?? null
    );
    return this.findById(Number(info.lastInsertRowid))!;
  },

  updateStatus(id: number, status: OnCallOfferStatus): CasualOnCallShiftOffer | undefined {
    const confirmedAt = ['Confirmed', 'Completed'].includes(status) ? new Date().toISOString() : null;
    db().prepare(`
      UPDATE casual_on_call_shift_offers
      SET status = ?, confirmed_at = COALESCE(?, confirmed_at), updated_at = datetime('now')
      WHERE id = ?
    `).run(status, confirmedAt, id);
    return this.findById(id);
  },

  update(id: number, data: Partial<CasualOnCallShiftOffer>): CasualOnCallShiftOffer | undefined {
    const payload = { ...data };
    if (payload.status === 'Confirmed' && payload.confirmed_at === undefined) {
      payload.confirmed_at = new Date().toISOString();
    }
    if (payload.status && payload.status !== 'Confirmed' && payload.confirmed_at === undefined) {
      payload.confirmed_at = null;
    }
    runUpdate('casual_on_call_shift_offers', id, payload, [
      'employee_id', 'shift_id', 'work_date', 'start_time', 'end_time', 'break_minutes',
      'status', 'offered_by', 'confirmed_at', 'notes'
    ]);
    return this.findById(id);
  },

  delete(id: number): { changes: number } {
    return db().prepare('DELETE FROM casual_on_call_shift_offers WHERE id = ?').run(id);
  },

  confirm(id: number): CasualOnCallShiftOffer | undefined {
    return this.updateStatus(id, 'Confirmed');
  },

  cancel(id: number): CasualOnCallShiftOffer | undefined {
    return this.updateStatus(id, 'Cancelled');
  },
};

export const AccountRepository = {
  findByEmployeeId(employeeId: number): any {
    return db().prepare('SELECT * FROM accounts WHERE employee_id = ?').get(employeeId);
  },
  findByUsername(username: string): any {
    return db().prepare('SELECT * FROM accounts WHERE LOWER(username) = LOWER(?)').get(username);
  },
};
