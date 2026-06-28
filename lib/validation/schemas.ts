// HRIS Input Validation Schemas using Zod
import { z } from 'zod';

export const LeaveTypeSchema = z.enum([
  'Service Incentive Leave',
  'Maternity Leave',
  'Paternity Leave',
  'Parental Leave',
  'Leave for VAWC',
  'Special Leave for Women',
  'Sick',
  'Unpaid',
  'General',
]);

export const EmploymentTypeSchema = z.enum(['Regular', 'Probationary', 'Casual', 'Casual On-Call']);

// Employee validation
export const EmployeeCreateSchema = z.object({
  employee_id: z.string().min(1, 'Employee ID is required'),
  name: z.string().min(1, 'Name is required'),
  username: z.string().optional(),
  email: z.string().email('Invalid email format').optional().nullable(),
  phone: z.string().optional().nullable(),
  department_id: z.number().optional().nullable(),
  position_id: z.number().optional().nullable(),
  employment_type: EmploymentTypeSchema.default('Probationary'),
  employment_type_effective_date: z.string().optional().nullable(),
  role: z.enum(['Employee', 'Manager', 'Admin', 'CEO', 'DEV']).default('Employee'),
  basic_salary: z.number().min(0, 'Salary cannot be negative').default(0),
});

export const EmployeeUpdateSchema = EmployeeCreateSchema.partial();

// Department validation
export const DepartmentSchema = z.object({
  name: z.string().min(1, 'Department name is required'),
  code: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

// Position validation
export const PositionSchema = z.object({
  name: z.string().min(1, 'Position name is required'),
  code: z.string().optional().nullable(),
  department_id: z.number().optional().nullable(),
  salary_grade_id: z.number().optional().nullable(),
  description: z.string().optional().nullable(),
});

// Salary Grade validation
export const SalaryGradeSchema = z.object({
  grade_name: z.string().min(1, 'Grade name is required'),
  amount: z.number().positive('Amount must be positive'),
  frequency: z.enum(['hourly', 'daily', 'weekly', 'monthly']).default('monthly'),
  description: z.string().optional().nullable(),
});

// Attendance Log validation (from .dat file)
export const AttendanceLogSchema = z.object({
  employee_idno: z.string().min(1, 'Employee ID is required'),
  timestamp: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, 'Invalid timestamp format'),
  // ZKTeco-style states: 0 punch-in, 1 punch-out, 2 break-out, 3 break-in.
  state: z.number().int().min(0).max(3),
  device_id: z.string().optional().nullable(),
});

// Leave Request validation
export const LeaveRequestSchema = z.object({
  employee_id: z.number().positive('Employee ID is required'),
  leave_type: LeaveTypeSchema.default('Service Incentive Leave'),
  start_date: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid start date'),
  end_date: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid end date'),
  reason: z.string().optional().nullable(),
}).refine((data) => new Date(data.end_date) >= new Date(data.start_date), {
  message: 'End date must be after or equal to start date',
  path: ['end_date'],
});

// OT Request validation
export const OTRequestSchema = z.object({
  employee_id: z.number().positive('Employee ID is required'),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date'),
  start_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
  end_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
  hours: z.number().refine((hours) => hours > 0 && hours % 4 === 0, 'Overtime must be submitted in fixed 4-hour blocks'),
  reason: z.string().optional().nullable(),
});

// Salary Advance Request validation
export const SalaryAdvanceSchema = z.object({
  employee_id: z.number().positive('Employee ID is required'),
  amount: z.number().positive('Amount must be positive'),
  reason: z.string().optional().nullable(),
  repayment_months: z.number().int().min(1, 'Minimum 1 month repayment').max(12, 'Maximum 12 months repayment').default(1),
});

// Formula validation
export const FormulaSchema = z.object({
  key: z.string().min(1, 'Formula key is required'),
  value: z.string().min(1, 'Formula value is required'),
  category: z.enum(['salary', 'overtime', 'holiday', 'deduction', 'other']).default('other'),
  description: z.string().optional().nullable(),
  data_type: z.enum(['number', 'percentage', 'text', 'boolean']).default('number'),
});

// Payroll calculation input validation
export const PayrollCalculationSchema = z.object({
  employee_id: z.number().positive('Employee ID is required'),
  period_start: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid period start date'),
  period_end: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid period end date'),
}).refine((data) => new Date(data.period_end) >= new Date(data.period_start), {
  message: 'Period end must be after or equal to period start',
  path: ['period_end'],
});

// DAT File line validation
export const UserDatLineSchema = z.object({
  id: z.string().min(1, 'Employee ID is required'),
  name: z.string().min(1, 'Name is required'),
  department: z.string().optional().default(''),
});

export const AttlogDatLineSchema = z.object({
  employee_id: z.string().min(1, 'Employee ID is required'),
  timestamp: z.string().min(1, 'Timestamp is required'),
  state: z.string().transform((val) => parseInt(val, 10)),
});

export const DepartmentDatLineSchema = z.object({
  code: z.string().min(1, 'Department code is required'),
  name: z.string().min(1, 'Department name is required'),
  description: z.string().optional().default(''),
});

// Helper function to validate and return errors
export function validateWithErrors<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.errors.map((err) => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });
  
  return { success: false, errors };
}

// Helper to safely parse number with zero check
export function safeDivide(numerator: number, denominator: number, fallback: number = 0): number {
  if (denominator === 0 || isNaN(denominator) || !isFinite(denominator)) {
    console.warn(`[HRIS-VALIDATION] Division by zero prevented: ${numerator} / ${denominator}`);
    return fallback;
  }
  return numerator / denominator;
}

// Helper to get salary divisor with safety check
export function getSafeSalaryDivisor(divisor: number | string | null | undefined): number {
  const parsed = typeof divisor === 'string' ? parseFloat(divisor) : divisor;
  if (!parsed || parsed <= 0 || isNaN(parsed)) {
    console.warn('[HRIS-VALIDATION] Invalid salary divisor, using default 22');
    return 22; // Default working days per month
  }
  return parsed;
}
