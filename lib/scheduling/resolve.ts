import {
  CasualOnCallShiftOfferRepository,
  EmployeeRepository,
  EmployeeShiftRepository,
} from '@/lib/db/models';

export type ResolvedSchedule = {
  employee_id: number;
  date: string;
  source: 'standing' | 'flexible';
  assignment_id: number | null;
  shift_id: number | null;
  shift_name: string | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
  status?: string | null;
};

export function isFlexibleEmploymentType(value?: string | null) {
  return value === 'Casual' || value === 'Casual On-Call';
}

export function isStandingEmploymentType(value?: string | null) {
  return value === 'Regular' || value === 'Probationary';
}

function dateSpecificSchedule(employeeId: number, date: string): ResolvedSchedule | null {
  const assignment = CasualOnCallShiftOfferRepository.findByEmployee(employeeId, date, date)
    .find((item) => ['Confirmed', 'Completed'].includes(String(item.status)));
  if (!assignment?.start_time || !assignment?.end_time) return null;

  return {
    employee_id: employeeId,
    date,
    source: 'flexible',
    assignment_id: Number(assignment.id),
    shift_id: assignment.shift_id ?? null,
    shift_name: assignment.shift_name ?? null,
    start_time: assignment.start_time,
    end_time: assignment.end_time,
    break_minutes: Number(assignment.break_minutes || 0),
    status: assignment.status ?? null,
  };
}

function standingSchedule(employeeId: number, date: string): ResolvedSchedule | null {
  const shift = EmployeeShiftRepository.findActiveForDate(employeeId, date);
  if (!shift?.start_time || !shift?.end_time) return null;

  return {
    employee_id: employeeId,
    date,
    source: 'standing',
    assignment_id: Number(shift.id),
    shift_id: Number(shift.shift_id),
    shift_name: shift.shift_name ?? null,
    start_time: shift.start_time,
    end_time: shift.end_time,
    break_minutes: Number(shift.break_minutes || 0),
    status: null,
  };
}

export function resolveWorkSchedule(employeeOrId: number | Record<string, any>, date: string): ResolvedSchedule | null {
  const employee = typeof employeeOrId === 'number'
    ? EmployeeRepository.findById(employeeOrId)
    : employeeOrId;
  if (!employee) return null;

  const employmentType = String(employee.employment_type || 'Probationary');
  const override = dateSpecificSchedule(Number(employee.id), date);
  if (override) return override;
  if (isFlexibleEmploymentType(employmentType)) return null;
  if (isStandingEmploymentType(employmentType)) return standingSchedule(Number(employee.id), date);
  return null;
}

export function validateScheduleForDate(employeeId: number, date: string) {
  const employee = EmployeeRepository.findById(employeeId);
  if (!employee) {
    return { valid: false, reason: 'Employee not found', employee: null, schedule: null };
  }

  const schedule = resolveWorkSchedule(employee, date);
  if (schedule) return { valid: true, reason: null, employee, schedule };

  if (isStandingEmploymentType(employee.employment_type)) {
    return {
      valid: false,
      reason: `${employee.employment_type} employees need an active standing shift before they can be scheduled`,
      employee,
      schedule: null,
    };
  }

  if (isFlexibleEmploymentType(employee.employment_type)) {
    return {
      valid: false,
      reason: `${employee.employment_type} employees need a confirmed flexible shift assignment for this date`,
      employee,
      schedule: null,
    };
  }

  return { valid: true, reason: null, employee, schedule: null };
}
