// HRIS Database - In-Memory Store for Development
// For production, connect to Supabase/Neon/etc.

export interface Employee {
  id: number;
  employee_id: string;
  name: string;
  username: string | null; // Unique identifier for login
  email: string | null;
  phone: string | null;
  picture: string | null;
  department_id: number | null;
  position_id: number | null;
  area_id: number | null;
  status: 'Active' | 'Resigned' | 'AWOL';
  employment_type: 'Regular' | 'Probationary' | 'Casual' | 'Casual On-Call';
  employment_type_effective_date: string | null;
  role: 'Employee' | 'Manager' | 'Admin' | 'CEO' | 'DEV';
  password_hash: string | null;
  basic_salary: number;
  hire_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: number;
  name: string;
  code: string | null;
  department_id: number | null;
  salary_grade_id: number | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalaryGrade {
  id: number;
  grade_name: string;
  amount: number;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Area {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Shift {
  id: number;
  name: string;
  code: string | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
  is_night_shift: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AttendanceLog {
  id: number;
  employee_id: number;
  timestamp: string;
  state: number;
  device_id: string | null;
  created_at: string;
}

export interface DailyAttendance {
  id: number;
  employee_id: number;
  date: string;
  time_in: string | null;
  time_out: string | null;
  shift_id: number | null;
  scheduled_in: string | null;
  scheduled_out: string | null;
  late_minutes: number;
  early_out_minutes: number;
  overtime_minutes: number;
  undertime_minutes: number;
  total_hours: number;
  status: 'Present' | 'Absent' | 'Late' | 'Half-day' | 'On Leave' | 'Holiday';
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface OTRequest {
  id: number;
  employee_id: number;
  date: string;
  start_time: string;
  end_time: string;
  hours: number;
  reason: string | null;
  status: 'Pending' | 'Approved' | 'Rejected';
  approved_by: number | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveRequest {
  id: number;
  employee_id: number;
  leave_type:
    | 'Service Incentive Leave'
    | 'Maternity Leave'
    | 'Paternity Leave'
    | 'Parental Leave'
    | 'Leave for VAWC'
    | 'Special Leave for Women'
    | 'Sick'
    | 'Unpaid'
    | 'General';
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: 'Pending' | 'Approved' | 'Rejected';
  approved_by: number | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalaryAdvanceRequest {
  id: number;
  employee_id: number;
  amount: number;
  reason: string | null;
  repayment_months: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  approved_by: number | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Holiday {
  id: number;
  name: string;
  date: string;
  type: 'Regular' | 'Special';
  pay_multiplier: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Formula {
  id: number;
  key: string;
  value: string;
  category: 'salary' | 'overtime' | 'holiday' | 'deduction' | 'other';
  description: string | null;
  data_type: 'number' | 'percentage' | 'text' | 'boolean';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Payroll {
  id: number;
  employee_id: number;
  period_start: string;
  period_end: string;
  basic_salary: number;
  days_worked: number;
  regular_hours: number;
  overtime_hours: number;
  overtime_pay: number;
  night_shift_pay: number;
  holiday_pay: number;
  allowances: number;
  gross_pay: number;
  sss_deduction: number;
  philhealth_deduction: number;
  pagibig_deduction: number;
  tax_deduction: number;
  salary_advance_deduction: number;
  other_deductions: number;
  total_deductions: number;
  net_pay: number;
  status: 'Draft' | 'Pending' | 'Approved' | 'Paid';
  approved_by: number | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeShift {
  id: number;
  employee_id: number;
  shift_id: number;
  effective_date: string;
  end_date: string | null;
  work_days: number[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CasualOnCallShiftOffer {
  id: number;
  employee_id: number;
  shift_id: number | null;
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  status: 'Offered' | 'Confirmed' | 'Declined' | 'Cancelled' | 'Completed';
  offered_by: number | null;
  confirmed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// In-memory database store
interface Database {
  employees: Employee[];
  departments: Department[];
  positions: Position[];
  salary_grades: SalaryGrade[];
  areas: Area[];
  shifts: Shift[];
  attendance_logs: AttendanceLog[];
  daily_attendance: DailyAttendance[];
  ot_requests: OTRequest[];
  leave_requests: LeaveRequest[];
  salary_advance_requests: SalaryAdvanceRequest[];
  holidays: Holiday[];
  formulas: Formula[];
  payroll: Payroll[];
  employee_shifts: EmployeeShift[];
  casual_on_call_shift_offers: CasualOnCallShiftOffer[];
}

// Global database instance
const globalForDb = globalThis as unknown as { db: Database | undefined };

function createInitialDatabase(): Database {
  const now = new Date().toISOString();
  
  // Initialize empty database with failsafe account - all other data populated via file imports
  const db: Database = {
    departments: [],
    salary_grades: [],
    positions: [],
    areas: [],
    shifts: [],
    employees: [
      {
        id: 1,
        employee_id: 'FAILSAFE001',
        name: 'System Failsafe',
        username: 'failsafe',
        email: null,
        phone: null,
        picture: null,
        department_id: null,
        position_id: null,
        area_id: null,
        status: 'Active',
        employment_type: 'Regular',
        employment_type_effective_date: now,
        role: 'DEV',
        // Hash for "Knightfall1939" - generated with bcryptjs (verified working)
        password_hash: '$2b$10$BgbBjZPc2g8Pu2tsrN7sPOjbLkVo.jReSoffidtc2EuMwPBjiFd5i',
        basic_salary: 0,
        hire_date: null,
        created_at: now,
        updated_at: now,
      },
    ],
    attendance_logs: [],
    daily_attendance: [],
    ot_requests: [],
    leave_requests: [],
    salary_advance_requests: [],
    holidays: [],
    formulas: [
      // Keep formula definitions but no mock data
      { id: 1, key: 'working_days_per_month', value: '22', category: 'salary', description: 'Number of working days per month', data_type: 'number', is_active: true, created_at: now, updated_at: now },
      { id: 2, key: 'working_hours_per_day', value: '8', category: 'salary', description: 'Number of working hours per day', data_type: 'number', is_active: true, created_at: now, updated_at: now },
      { id: 3, key: 'ot_multiplier_regular', value: '1.25', category: 'overtime', description: 'OT multiplier for regular days', data_type: 'number', is_active: true, created_at: now, updated_at: now },
      { id: 4, key: 'ot_multiplier_restday', value: '1.30', category: 'overtime', description: 'OT multiplier for rest days', data_type: 'number', is_active: true, created_at: now, updated_at: now },
      { id: 5, key: 'ot_multiplier_holiday', value: '2.00', category: 'overtime', description: 'OT multiplier for holidays', data_type: 'number', is_active: true, created_at: now, updated_at: now },
      { id: 6, key: 'holiday_pay_regular', value: '2.00', category: 'holiday', description: 'Pay multiplier for regular holidays', data_type: 'number', is_active: true, created_at: now, updated_at: now },
      { id: 7, key: 'holiday_pay_special', value: '1.30', category: 'holiday', description: 'Pay multiplier for special holidays', data_type: 'number', is_active: true, created_at: now, updated_at: now },
      { id: 8, key: 'sss_rate', value: '4.5', category: 'deduction', description: 'SSS contribution rate (%)', data_type: 'percentage', is_active: true, created_at: now, updated_at: now },
      { id: 9, key: 'philhealth_rate', value: '2.0', category: 'deduction', description: 'PhilHealth contribution rate (%)', data_type: 'percentage', is_active: true, created_at: now, updated_at: now },
      { id: 10, key: 'pagibig_rate', value: '2.0', category: 'deduction', description: 'Pag-IBIG contribution rate (%)', data_type: 'percentage', is_active: true, created_at: now, updated_at: now },
      { id: 11, key: 'night_diff_multiplier', value: '1.10', category: 'overtime', description: 'Night differential multiplier', data_type: 'number', is_active: true, created_at: now, updated_at: now },
      { id: 12, key: 'late_deduction_per_minute', value: '10', category: 'deduction', description: 'Deduction per minute late (PHP)', data_type: 'number', is_active: true, created_at: now, updated_at: now },
    ],
    payroll: [],
    employee_shifts: [],
    casual_on_call_shift_offers: [],
  };
  
  return db;
}

export function getDatabase(): Database {
  if (!globalForDb.db) {
    globalForDb.db = createInitialDatabase();
    console.log('[HRIS] In-memory database initialized');
  }
  return globalForDb.db;
}

export function initializeDatabase(): Database {
  return getDatabase();
}

// Helper to generate next ID
export function getNextId<T extends { id: number }>(items: T[]): number {
  if (items.length === 0) return 1;
  return Math.max(...items.map(item => item.id)) + 1;
}
