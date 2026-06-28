// @ts-nocheck
import { 
  getDatabase, 
  initializeDatabase, 
  getNextId,
  type Employee,
  type Department,
  type Position,
  type Area,
  type Shift,
  type AttendanceLog,
  type DailyAttendance,
  type OTRequest,
  type LeaveRequest,
  type SalaryAdvanceRequest,
  type Holiday,
  type Formula,
  type Payroll,
  type EmployeeShift
} from '../config';

// Re-export types
export type {
  Employee,
  Department,
  Position,
  Area,
  Shift,
  AttendanceLog,
  DailyAttendance,
  OTRequest,
  LeaveRequest,
  SalaryAdvanceRequest,
  Holiday,
  Formula,
  Payroll,
  EmployeeShift
};

// Initialize database on first import
let initialized = false;

export function ensureInitialized() {
  if (!initialized) {
    initializeDatabase();
    initialized = true;
  }
  return getDatabase();
}

// Extended employee with joined data
export interface EmployeeWithDetails extends Employee {
  department_name?: string;
  position_name?: string;
  area_name?: string;
}

// Extended types with joined data
export interface OTRequestWithDetails extends OTRequest {
  employee_name?: string;
  approver_name?: string;
}

export interface LeaveRequestWithDetails extends LeaveRequest {
  employee_name?: string;
  approver_name?: string;
}

export interface SalaryAdvanceRequestWithDetails extends SalaryAdvanceRequest {
  employee_name?: string;
  approver_name?: string;
}

export interface DailyAttendanceWithDetails extends DailyAttendance {
  employee_name?: string;
}

export interface PayrollWithDetails extends Payroll {
  employee_name?: string;
}

// Repositories
export const EmployeeRepository = {
  findAll(includePrivate = false): EmployeeWithDetails[] {
    const db = getDatabase();
    let employees = [...db.employees];
    
    if (!includePrivate) {
      employees = employees.filter(e => !['Manager', 'CEO'].includes(e.role));
    }
    
    return employees.map(e => ({
      ...e,
      department_name: db.departments.find(d => d.id === e.department_id)?.name,
      position_name: db.positions.find(p => p.id === e.position_id)?.name,
      area_name: db.areas.find(a => a.id === e.area_id)?.name,
    })).sort((a, b) => a.name.localeCompare(b.name));
  },

  findById(id: number): EmployeeWithDetails | undefined {
    const db = getDatabase();
    const employee = db.employees.find(e => e.id === id);
    if (!employee) return undefined;
    
    return {
      ...employee,
      department_name: db.departments.find(d => d.id === employee.department_id)?.name,
      position_name: db.positions.find(p => p.id === employee.position_id)?.name,
      area_name: db.areas.find(a => a.id === employee.area_id)?.name,
    };
  },

  findByEmployeeId(employeeId: string): EmployeeWithDetails | undefined {
    const db = getDatabase();
    const employee = db.employees.find(e => e.employee_id === employeeId);
    if (!employee) return undefined;
    
    return {
      ...employee,
      department_name: db.departments.find(d => d.id === employee.department_id)?.name,
      position_name: db.positions.find(p => p.id === employee.position_id)?.name,
      area_name: db.areas.find(a => a.id === employee.area_id)?.name,
    };
  },

  findByEmail(email: string): Employee | undefined {
    const db = getDatabase();
    return db.employees.find(e => e.email === email);
  },

  create(data: Partial<Employee>): { lastInsertRowid: number } {
    const db = getDatabase();
    const id = getNextId(db.employees);
    const now = new Date().toISOString();
    
    const employee: Employee = {
      id,
      employee_id: data.employee_id || `EMP${String(id).padStart(3, '0')}`,
      name: data.name || '',
      email: data.email || null,
      phone: data.phone || null,
      picture: data.picture || null,
      department_id: data.department_id || null,
      position_id: data.position_id || null,
      area_id: data.area_id || null,
      status: data.status || 'Active',
      role: data.role || 'Employee',
      password_hash: data.password_hash || null,
      basic_salary: data.basic_salary || 0,
      hire_date: data.hire_date || null,
      created_at: now,
      updated_at: now,
    };
    
    db.employees.push(employee);
    return { lastInsertRowid: id };
  },

  update(id: number, data: Partial<Employee>): { changes: number } {
    const db = getDatabase();
    const index = db.employees.findIndex(e => e.id === id);
    if (index === -1) return { changes: 0 };
    
    db.employees[index] = {
      ...db.employees[index],
      ...data,
      id, // Ensure id is not changed
      updated_at: new Date().toISOString(),
    };
    
    return { changes: 1 };
  },

  delete(id: number): { changes: number } {
    const db = getDatabase();
    const index = db.employees.findIndex(e => e.id === id);
    if (index === -1) return { changes: 0 };
    
    db.employees.splice(index, 1);
    return { changes: 1 };
  }
};

export const FormulaRepository = {
  findAll(): Formula[] {
    const db = getDatabase();
    return db.formulas.filter(f => f.is_active).sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.key.localeCompare(b.key);
    });
  },

  findByKey(key: string): Formula | undefined {
    const db = getDatabase();
    return db.formulas.find(f => f.key === key);
  },

  findByCategory(category: string): Formula[] {
    const db = getDatabase();
    return db.formulas.filter(f => f.category === category && f.is_active);
  },

  getValue(key: string, defaultValue: number = 0): number {
    const formula = this.findByKey(key);
    return formula ? parseFloat(formula.value) : defaultValue;
  },

  upsert(data: Partial<Formula>): { lastInsertRowid: number } {
    const db = getDatabase();
    const existing = db.formulas.findIndex(f => f.key === data.key);
    const now = new Date().toISOString();
    
    if (existing !== -1) {
      db.formulas[existing] = {
        ...db.formulas[existing],
        ...data,
        updated_at: now,
      };
      return { lastInsertRowid: db.formulas[existing].id };
    }
    
    const id = getNextId(db.formulas);
    const formula: Formula = {
      id,
      key: data.key || '',
      value: data.value || '',
      category: data.category || 'other',
      description: data.description || null,
      data_type: data.data_type || 'number',
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    
    db.formulas.push(formula);
    return { lastInsertRowid: id };
  }
};

export const DepartmentRepository = {
  findAll(): Department[] {
    const db = getDatabase();
    return db.departments.filter(d => d.is_active).sort((a, b) => a.name.localeCompare(b.name));
  },
  
  findById(id: number): Department | undefined {
    const db = getDatabase();
    return db.departments.find(d => d.id === id);
  },

  create(data: Partial<Department>): { lastInsertRowid: number } {
    const db = getDatabase();
    const id = getNextId(db.departments);
    const now = new Date().toISOString();
    
    db.departments.push({
      id,
      name: data.name || '',
      code: data.code || null,
      description: data.description || null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    
    return { lastInsertRowid: id };
  },

  update(id: number, data: Partial<Department>): { changes: number } {
    const db = getDatabase();
    const index = db.departments.findIndex(d => d.id === id);
    if (index === -1) return { changes: 0 };
    
    db.departments[index] = {
      ...db.departments[index],
      ...data,
      id,
      updated_at: new Date().toISOString(),
    };
    
    return { changes: 1 };
  },

  delete(id: number): { changes: number } {
    const db = getDatabase();
    const index = db.departments.findIndex(d => d.id === id);
    if (index === -1) return { changes: 0 };
    
    db.departments[index].is_active = false;
    return { changes: 1 };
  }
};

export const PositionRepository = {
  findAll(): Position[] {
    const db = getDatabase();
    return db.positions.filter(p => p.is_active).sort((a, b) => a.name.localeCompare(b.name));
  },

  create(data: Partial<Position>): { lastInsertRowid: number } {
    const db = getDatabase();
    const id = getNextId(db.positions);
    const now = new Date().toISOString();
    
    db.positions.push({
      id,
      name: data.name || '',
      code: data.code || null,
      department_id: data.department_id || null,
      description: data.description || null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    
    return { lastInsertRowid: id };
  },

  update(id: number, data: Partial<Position>): { changes: number } {
    const db = getDatabase();
    const index = db.positions.findIndex(p => p.id === id);
    if (index === -1) return { changes: 0 };
    
    db.positions[index] = {
      ...db.positions[index],
      ...data,
      id,
      updated_at: new Date().toISOString(),
    };
    
    return { changes: 1 };
  },

  delete(id: number): { changes: number } {
    const db = getDatabase();
    const index = db.positions.findIndex(p => p.id === id);
    if (index === -1) return { changes: 0 };
    
    db.positions[index].is_active = false;
    return { changes: 1 };
  }
};

export const AreaRepository = {
  findAll(): Area[] {
    const db = getDatabase();
    return db.areas.filter(a => a.is_active).sort((a, b) => a.name.localeCompare(b.name));
  },

  create(data: Partial<Area>): { lastInsertRowid: number } {
    const db = getDatabase();
    const id = getNextId(db.areas);
    const now = new Date().toISOString();
    
    db.areas.push({
      id,
      name: data.name || '',
      code: data.code || null,
      description: data.description || null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    
    return { lastInsertRowid: id };
  },

  update(id: number, data: Partial<Area>): { changes: number } {
    const db = getDatabase();
    const index = db.areas.findIndex(a => a.id === id);
    if (index === -1) return { changes: 0 };
    
    db.areas[index] = {
      ...db.areas[index],
      ...data,
      id,
      updated_at: new Date().toISOString(),
    };
    
    return { changes: 1 };
  },

  delete(id: number): { changes: number } {
    const db = getDatabase();
    const index = db.areas.findIndex(a => a.id === id);
    if (index === -1) return { changes: 0 };
    
    db.areas[index].is_active = false;
    return { changes: 1 };
  }
};

export const ShiftRepository = {
  findAll(): Shift[] {
    const db = getDatabase();
    return db.shifts.filter(s => s.is_active).sort((a, b) => a.name.localeCompare(b.name));
  },

  findById(id: number): Shift | undefined {
    const db = getDatabase();
    return db.shifts.find(s => s.id === id);
  },

  create(data: Partial<Shift>): { lastInsertRowid: number } {
    const db = getDatabase();
    const id = getNextId(db.shifts);
    const now = new Date().toISOString();
    
    db.shifts.push({
      id,
      name: data.name || '',
      code: data.code || null,
      start_time: data.start_time || '09:00',
      end_time: data.end_time || '18:00',
      break_minutes: data.break_minutes || 60,
      is_night_shift: data.is_night_shift || false,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    
    return { lastInsertRowid: id };
  },

  update(id: number, data: Partial<Shift>): { changes: number } {
    const db = getDatabase();
    const index = db.shifts.findIndex(s => s.id === id);
    if (index === -1) return { changes: 0 };
    
    db.shifts[index] = {
      ...db.shifts[index],
      ...data,
      id,
      updated_at: new Date().toISOString(),
    };
    
    return { changes: 1 };
  },

  delete(id: number): { changes: number } {
    const db = getDatabase();
    const index = db.shifts.findIndex(s => s.id === id);
    if (index === -1) return { changes: 0 };
    
    db.shifts[index].is_active = false;
    return { changes: 1 };
  }
};

export const HolidayRepository = {
  findAll(): Holiday[] {
    const db = getDatabase();
    return db.holidays.filter(h => h.is_active).sort((a, b) => b.date.localeCompare(a.date));
  },

  findByDate(date: string): Holiday | undefined {
    const db = getDatabase();
    return db.holidays.find(h => h.date === date);
  },

  create(data: Partial<Holiday>): { lastInsertRowid: number } {
    const db = getDatabase();
    const id = getNextId(db.holidays);
    const now = new Date().toISOString();
    
    db.holidays.push({
      id,
      name: data.name || '',
      date: data.date || '',
      type: data.type || 'Regular',
      pay_multiplier: data.pay_multiplier || 2.0,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    
    return { lastInsertRowid: id };
  },

  update(id: number, data: Partial<Holiday>): { changes: number } {
    const db = getDatabase();
    const index = db.holidays.findIndex(h => h.id === id);
    if (index === -1) return { changes: 0 };
    
    db.holidays[index] = {
      ...db.holidays[index],
      ...data,
      id,
      updated_at: new Date().toISOString(),
    };
    
    return { changes: 1 };
  },

  delete(id: number): { changes: number } {
    const db = getDatabase();
    const index = db.holidays.findIndex(h => h.id === id);
    if (index === -1) return { changes: 0 };
    
    db.holidays[index].is_active = false;
    return { changes: 1 };
  }
};

export const AttendanceRepository = {
  findByEmployee(employeeId: number, startDate?: string, endDate?: string): DailyAttendanceWithDetails[] {
    const db = getDatabase();
    const employee = db.employees.find(e => e.id === employeeId);
    
    return db.daily_attendance
      .filter(da => {
        if (da.employee_id !== employeeId) return false;
        if (startDate && da.date < startDate) return false;
        if (endDate && da.date > endDate) return false;
        return true;
      })
      .map(da => ({
        ...da,
        employee_name: employee?.name,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  findAll(startDate?: string, endDate?: string): DailyAttendanceWithDetails[] {
    const db = getDatabase();
    
    return db.daily_attendance
      .filter(da => {
        if (startDate && da.date < startDate) return false;
        if (endDate && da.date > endDate) return false;
        return true;
      })
      .map(da => ({
        ...da,
        employee_name: db.employees.find(e => e.id === da.employee_id)?.name,
      }))
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (a.employee_name || '').localeCompare(b.employee_name || '');
      });
  },

  upsert(data: Partial<DailyAttendance>): { lastInsertRowid: number } {
    const db = getDatabase();
    const existing = db.daily_attendance.findIndex(
      da => da.employee_id === data.employee_id && da.date === data.date
    );
    const now = new Date().toISOString();
    
    if (existing !== -1) {
      db.daily_attendance[existing] = {
        ...db.daily_attendance[existing],
        ...data,
        updated_at: now,
      };
      return { lastInsertRowid: db.daily_attendance[existing].id };
    }
    
    const id = getNextId(db.daily_attendance);
    db.daily_attendance.push({
      id,
      employee_id: data.employee_id || 0,
      date: data.date || '',
      time_in: data.time_in || null,
      time_out: data.time_out || null,
      shift_id: data.shift_id || null,
      scheduled_in: data.scheduled_in || null,
      scheduled_out: data.scheduled_out || null,
      late_minutes: data.late_minutes || 0,
      early_out_minutes: data.early_out_minutes || 0,
      overtime_minutes: data.overtime_minutes || 0,
      undertime_minutes: data.undertime_minutes || 0,
      total_hours: data.total_hours || 0,
      status: data.status || 'Present',
      remarks: data.remarks || null,
      created_at: now,
      updated_at: now,
    });
    
    return { lastInsertRowid: id };
  }
};

export const RequestRepository = {
  // OT Requests
  getOTRequests(status?: string, employeeId?: number): OTRequestWithDetails[] {
    const db = getDatabase();
    
    return db.ot_requests
      .filter(r => {
        if (status && r.status !== status) return false;
        if (employeeId && r.employee_id !== employeeId) return false;
        return true;
      })
      .map(r => ({
        ...r,
        employee_name: db.employees.find(e => e.id === r.employee_id)?.name,
        approver_name: r.approved_by ? db.employees.find(e => e.id === r.approved_by)?.name : undefined,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  createOTRequest(data: Partial<OTRequest>): { lastInsertRowid: number } {
    const db = getDatabase();
    const id = getNextId(db.ot_requests);
    const now = new Date().toISOString();
    
    db.ot_requests.push({
      id,
      employee_id: data.employee_id || 0,
      date: data.date || '',
      start_time: data.start_time || '',
      end_time: data.end_time || '',
      hours: data.hours || 0,
      reason: data.reason || null,
      status: 'Pending',
      approved_by: null,
      approved_at: null,
      rejection_reason: null,
      created_at: now,
      updated_at: now,
    });
    
    return { lastInsertRowid: id };
  },

  updateOTRequest(id: number, data: Partial<OTRequest>): { changes: number } {
    const db = getDatabase();
    const index = db.ot_requests.findIndex(r => r.id === id);
    if (index === -1) return { changes: 0 };
    
    db.ot_requests[index] = {
      ...db.ot_requests[index],
      ...data,
      id,
      updated_at: new Date().toISOString(),
    };
    
    return { changes: 1 };
  },

  // Leave Requests
  getLeaveRequests(status?: string, employeeId?: number): LeaveRequestWithDetails[] {
    const db = getDatabase();
    
    return db.leave_requests
      .filter(r => {
        if (status && r.status !== status) return false;
        if (employeeId && r.employee_id !== employeeId) return false;
        return true;
      })
      .map(r => ({
        ...r,
        employee_name: db.employees.find(e => e.id === r.employee_id)?.name,
        approver_name: r.approved_by ? db.employees.find(e => e.id === r.approved_by)?.name : undefined,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  createLeaveRequest(data: Partial<LeaveRequest>): { lastInsertRowid: number } {
    const db = getDatabase();
    const id = getNextId(db.leave_requests);
    const now = new Date().toISOString();
    
    db.leave_requests.push({
      id,
      employee_id: data.employee_id || 0,
      leave_type: data.leave_type || 'Regular',
      start_date: data.start_date || '',
      end_date: data.end_date || '',
      days: data.days || 0,
      reason: data.reason || null,
      status: 'Pending',
      approved_by: null,
      approved_at: null,
      rejection_reason: null,
      created_at: now,
      updated_at: now,
    });
    
    return { lastInsertRowid: id };
  },

  updateLeaveRequest(id: number, data: Partial<LeaveRequest>): { changes: number } {
    const db = getDatabase();
    const index = db.leave_requests.findIndex(r => r.id === id);
    if (index === -1) return { changes: 0 };
    
    db.leave_requests[index] = {
      ...db.leave_requests[index],
      ...data,
      id,
      updated_at: new Date().toISOString(),
    };
    
    return { changes: 1 };
  },

  // Salary Advance Requests
  getSalaryAdvanceRequests(status?: string, employeeId?: number): SalaryAdvanceRequestWithDetails[] {
    const db = getDatabase();
    
    return db.salary_advance_requests
      .filter(r => {
        if (status && r.status !== status) return false;
        if (employeeId && r.employee_id !== employeeId) return false;
        return true;
      })
      .map(r => ({
        ...r,
        employee_name: db.employees.find(e => e.id === r.employee_id)?.name,
        approver_name: r.approved_by ? db.employees.find(e => e.id === r.approved_by)?.name : undefined,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  createSalaryAdvanceRequest(data: Partial<SalaryAdvanceRequest>): { lastInsertRowid: number } {
    const db = getDatabase();
    const id = getNextId(db.salary_advance_requests);
    const now = new Date().toISOString();
    
    db.salary_advance_requests.push({
      id,
      employee_id: data.employee_id || 0,
      amount: data.amount || 0,
      reason: data.reason || null,
      repayment_months: data.repayment_months || 1,
      status: 'Pending',
      approved_by: null,
      approved_at: null,
      rejection_reason: null,
      created_at: now,
      updated_at: now,
    });
    
    return { lastInsertRowid: id };
  },

  updateSalaryAdvanceRequest(id: number, data: Partial<SalaryAdvanceRequest>): { changes: number } {
    const db = getDatabase();
    const index = db.salary_advance_requests.findIndex(r => r.id === id);
    if (index === -1) return { changes: 0 };
    
    db.salary_advance_requests[index] = {
      ...db.salary_advance_requests[index],
      ...data,
      id,
      updated_at: new Date().toISOString(),
    };
    
    return { changes: 1 };
  }
};

export const PayrollRepository = {
  findAll(status?: string): PayrollWithDetails[] {
    const db = getDatabase();
    
    return db.payroll
      .filter(p => !status || p.status === status)
      .map(p => ({
        ...p,
        employee_name: db.employees.find(e => e.id === p.employee_id)?.name,
      }))
      .sort((a, b) => b.period_start.localeCompare(a.period_start));
  },

  findByEmployee(employeeId: number): PayrollWithDetails[] {
    const db = getDatabase();
    const employee = db.employees.find(e => e.id === employeeId);
    
    return db.payroll
      .filter(p => p.employee_id === employeeId)
      .map(p => ({
        ...p,
        employee_name: employee?.name,
      }))
      .sort((a, b) => b.period_start.localeCompare(a.period_start));
  },

  create(data: Partial<Payroll>): { lastInsertRowid: number } {
    const db = getDatabase();
    const id = getNextId(db.payroll);
    const now = new Date().toISOString();
    
    db.payroll.push({
      id,
      employee_id: data.employee_id || 0,
      period_start: data.period_start || '',
      period_end: data.period_end || '',
      basic_salary: data.basic_salary || 0,
      days_worked: data.days_worked || 0,
      regular_hours: data.regular_hours || 0,
      overtime_hours: data.overtime_hours || 0,
      overtime_pay: data.overtime_pay || 0,
      holiday_pay: data.holiday_pay || 0,
      allowances: data.allowances || 0,
      gross_pay: data.gross_pay || 0,
      sss_deduction: data.sss_deduction || 0,
      philhealth_deduction: data.philhealth_deduction || 0,
      pagibig_deduction: data.pagibig_deduction || 0,
      tax_deduction: data.tax_deduction || 0,
      salary_advance_deduction: data.salary_advance_deduction || 0,
      other_deductions: data.other_deductions || 0,
      total_deductions: data.total_deductions || 0,
      net_pay: data.net_pay || 0,
      status: data.status || 'Draft',
      approved_by: null,
      approved_at: null,
      paid_at: null,
      created_at: now,
      updated_at: now,
    });
    
    return { lastInsertRowid: id };
  },

  update(id: number, data: Partial<Payroll>): { changes: number } {
    const db = getDatabase();
    const index = db.payroll.findIndex(p => p.id === id);
    if (index === -1) return { changes: 0 };
    
    db.payroll[index] = {
      ...db.payroll[index],
      ...data,
      id,
      updated_at: new Date().toISOString(),
    };
    
    return { changes: 1 };
  }
};

export const EmployeeShiftRepository = {
  findByEmployee(employeeId: number): EmployeeShift | undefined {
    const db = getDatabase();
    return db.employee_shifts.find(es => es.employee_id === employeeId && es.is_active);
  },

  findActiveForDate(employeeId: number, workDate = new Date().toISOString().split('T')[0]): EmployeeShift | undefined {
    const db = getDatabase();
    const weekday = new Date(`${workDate}T00:00:00`).getDay();
    return db.employee_shifts.find((es) =>
      es.employee_id === employeeId &&
      es.is_active &&
      es.effective_date <= workDate &&
      (!es.end_date || es.end_date >= workDate) &&
      ((es.work_days || [0, 1, 2, 3, 4, 5, 6]).includes(weekday))
    );
  },

  assign(data: Partial<EmployeeShift>): { lastInsertRowid: number } {
    const db = getDatabase();
    const id = getNextId(db.employee_shifts);
    const now = new Date().toISOString();
    
    // Deactivate previous shifts
    db.employee_shifts.forEach((es, index) => {
      if (es.employee_id === data.employee_id && es.is_active) {
        db.employee_shifts[index].is_active = false;
        db.employee_shifts[index].end_date = now.split('T')[0];
      }
    });
    
    db.employee_shifts.push({
      id,
      employee_id: data.employee_id || 0,
      shift_id: data.shift_id || 0,
      effective_date: data.effective_date || now.split('T')[0],
      end_date: null,
      work_days: data.work_days || [0, 1, 2, 3, 4, 5, 6],
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    
    return { lastInsertRowid: id };
  }
};
