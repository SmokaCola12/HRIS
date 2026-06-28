import bcrypt from 'bcryptjs';
import {
  AreaRepository,
  AttendanceLogRepository,
  AttendanceRepository,
  CasualOnCallShiftOfferRepository,
  DepartmentRepository,
  EmployeeRepository,
  EmployeeShiftRepository,
  HolidayRepository,
  IncentiveRequestRepository,
  LeaveRequestRepository,
  LoanExtensionRequestRepository,
  OTRequestRepository,
  PayrollRepository,
  PositionRepository,
  SalaryAdvanceRepository,
  SalaryGradeRepository,
  ShiftRepository,
  type Employee,
} from '@/lib/db/models';
import { getConnection } from '@/lib/db/database';
import { finalizeAttendanceForRange } from '@/lib/attendance/finalization';
import { calculateStatutoryPayroll } from '@/lib/payroll/statutory';
import { createApprovalNotification } from '@/lib/notifications/approvals';

const START_DATE = '2026-06-01';
const DRIVER_PASSWORD = 'Race@2026!';

type DriverSeed = {
  team: string;
  name: string;
  role: 'Admin' | 'Employee';
  position: 'P1' | 'Veteran' | 'Rookie' | 'Noob';
  employment_type: 'Regular' | 'Probationary' | 'Casual' | 'Casual On-Call';
};

const drivers: DriverSeed[] = [
  { team: 'Oracle Red Bull Racing', name: 'Max Verstappen', role: 'Admin', position: 'P1', employment_type: 'Regular' },
  { team: 'Oracle Red Bull Racing', name: 'Isack Hadjar', role: 'Employee', position: 'Rookie', employment_type: 'Casual On-Call' },
  { team: 'Scuderia Ferrari HP', name: 'Charles Leclerc', role: 'Admin', position: 'Veteran', employment_type: 'Regular' },
  { team: 'Scuderia Ferrari HP', name: 'Lewis Hamilton', role: 'Admin', position: 'P1', employment_type: 'Regular' },
  { team: 'McLaren Mastercard F1 Team', name: 'Lando Norris', role: 'Employee', position: 'Noob', employment_type: 'Casual' },
  { team: 'McLaren Mastercard F1 Team', name: 'Oscar Piastri', role: 'Employee', position: 'P1', employment_type: 'Probationary' },
  { team: 'Mercedes-AMG', name: 'George Russell', role: 'Employee', position: 'Veteran', employment_type: 'Regular' },
  { team: 'Mercedes-AMG', name: 'Andrea Kimi Antonelli', role: 'Admin', position: 'Rookie', employment_type: 'Probationary' },
  { team: 'Aston Martin Aramco', name: 'Fernando Alonso', role: 'Admin', position: 'Veteran', employment_type: 'Regular' },
  { team: 'Aston Martin Aramco', name: 'Lance Stroll', role: 'Employee', position: 'Noob', employment_type: 'Casual' },
  { team: 'Williams F1 Team', name: 'Alex Albon', role: 'Admin', position: 'Veteran', employment_type: 'Regular' },
  { team: 'Williams F1 Team', name: 'Carlos Sainz', role: 'Admin', position: 'Veteran', employment_type: 'Regular' },
  { team: 'BWT Alpine F1 Team', name: 'Pierre Gasly', role: 'Employee', position: 'Veteran', employment_type: 'Casual' },
  { team: 'BWT Alpine F1 Team', name: 'Franco Colapinto', role: 'Employee', position: 'Rookie', employment_type: 'Casual On-Call' },
  { team: 'TGR Haas F1 Team', name: 'Esteban Ocon', role: 'Employee', position: 'Veteran', employment_type: 'Casual' },
  { team: 'TGR Haas F1 Team', name: 'Oliver Bearman', role: 'Employee', position: 'Rookie', employment_type: 'Casual On-Call' },
  { team: 'Visa Cash App Racing Bulls', name: 'Liam Lawson', role: 'Employee', position: 'Rookie', employment_type: 'Casual' },
  { team: 'Visa Cash App Racing Bulls', name: 'Arvid Lindblad', role: 'Employee', position: 'Rookie', employment_type: 'Casual On-Call' },
  { team: 'Audi F1 Team', name: 'Nico Hulkenberg', role: 'Admin', position: 'Veteran', employment_type: 'Regular' },
  { team: 'Audi F1 Team', name: 'Gabriel Bortoleto', role: 'Employee', position: 'Rookie', employment_type: 'Probationary' },
  { team: 'Cadillac F1 Team', name: 'Sergio Perez', role: 'Admin', position: 'Veteran', employment_type: 'Regular' },
  { team: 'Cadillac F1 Team', name: 'Valtteri Bottas', role: 'Admin', position: 'Veteran', employment_type: 'Regular' },
];

function localDate(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return localDate(next);
}

function eachDate(startDate: string, endDate: string) {
  const dates: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function isSunday(date: string) {
  return new Date(`${date}T00:00:00`).getDay() === 0;
}

function dateIndex(date: string) {
  return Math.floor((new Date(`${date}T00:00:00`).getTime() - new Date(`${START_DATE}T00:00:00`).getTime()) / 86400000);
}

function addMinutes(time: string, minutes: number) {
  const [hours, mins] = time.split(':').map(Number);
  const total = ((hours * 60 + mins + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function timestamp(date: string, time: string) {
  return `${date} ${time.length === 5 ? `${time}:00` : time}`;
}

function safeCode(name: string) {
  return name.replace(/[^A-Z0-9]/gi, '').slice(0, 10).toUpperCase();
}

function createLog(employee: Employee, date: string, time: string, state: number) {
  AttendanceLogRepository.create({
    employee_id: employee.id,
    employee_idno: employee.employee_id,
    timestamp: timestamp(date, time),
    state,
    device_id: 'f1-demo-seed',
  });
}

function createAttendance(employee: Employee, date: string, timeIn: string, timeOut: string | null, includeBreak = false) {
  AttendanceRepository.create({
    employee_id: employee.id,
    date,
    check_in: timeIn,
    check_out: timeOut,
    status: 'Present',
  });
  createLog(employee, date, timeIn, 0);
  if (includeBreak) {
    createLog(employee, date, '12:00', 2);
    createLog(employee, date, '13:00', 3);
  }
  if (timeOut) createLog(employee, date, timeOut, 1);
}

function maybeNotify(requestType: 'leave' | 'ot' | 'salary_advance' | 'incentive' | 'loan_extension', request: Record<string, any>) {
  if (request.status === 'Pending') createApprovalNotification(requestType, request);
}

function countTable(table: string) {
  const row = getConnection().prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
  return Number(row?.count || 0);
}

export async function seedF1Demo() {
  const today = localDate();
  const endDate = today < START_DATE ? START_DATE : today;
  const dates = eachDate(START_DATE, endDate);
  const passwordHash = bcrypt.hashSync(DRIVER_PASSWORD, 10);

  const area = AreaRepository.create({ name: 'Paddock', code: 'PAD', description: 'F1 demo work area' });
  const teamIds = new Map<string, number>();
  for (const team of [...new Set(drivers.map((driver) => driver.team))]) {
    const department = DepartmentRepository.create({
      name: team,
      code: safeCode(team),
      description: `${team} organization`,
    });
    teamIds.set(team, department.id);
  }

  const salaryGrades = {
    Noob: SalaryGradeRepository.create({ grade_name: 'Minimum / Noob', amount: 610, frequency: 'daily', description: 'Minimum demo driver rate' }),
    Rookie: SalaryGradeRepository.create({ grade_name: 'Rookie', amount: 850, frequency: 'daily', description: 'Rookie demo driver rate' }),
    Veteran: SalaryGradeRepository.create({ grade_name: 'Veteran', amount: 1250, frequency: 'daily', description: 'Veteran demo driver rate' }),
    P1: SalaryGradeRepository.create({ grade_name: 'P1', amount: 2000, frequency: 'daily', description: 'Top-ranked demo driver rate' }),
  };

  const positions = {
    Noob: PositionRepository.create({ name: 'Noob', code: 'NOOB', salary_grade_id: salaryGrades.Noob.id, description: 'Development driver' }),
    Rookie: PositionRepository.create({ name: 'Rookie', code: 'ROOKIE', salary_grade_id: salaryGrades.Rookie.id, description: 'Rookie driver' }),
    Veteran: PositionRepository.create({ name: 'Veteran', code: 'VET', salary_grade_id: salaryGrades.Veteran.id, description: 'Experienced driver' }),
    P1: PositionRepository.create({ name: 'P1', code: 'P1', salary_grade_id: salaryGrades.P1.id, description: 'Power ranking leader' }),
  };

  const dayShift = ShiftRepository.create({ name: 'Grand Prix Day Shift', code: 'GP-DAY', start_time: '08:00', end_time: '17:00', break_minutes: 60 });
  const earlyShift = ShiftRepository.create({ name: 'Garage Early Shift', code: 'GAR-E', start_time: '06:00', end_time: '15:00', break_minutes: 60 });
  const nightShift = ShiftRepository.create({ name: 'Night Setup Shift', code: 'NIGHT', start_time: '22:00', end_time: '06:00', break_minutes: 60, is_night_shift: true });
  const flexShift = ShiftRepository.create({ name: 'Race Weekend Flex', code: 'FLEX', start_time: '10:00', end_time: '18:00', break_minutes: 30 });
  const standingShifts = [dayShift, earlyShift, nightShift];

  HolidayRepository.create({
    name: 'Independence Day',
    date: '2026-06-12',
    type: 'Regular',
    observance_type: 'Fixed',
    pay_multiplier: 2,
  });

  const employees = drivers.map((driver, index) => {
    const employee = EmployeeRepository.create({
      employee_id: `F${String(1001 + index)}`,
      name: driver.name,
      username: `F${String(1001 + index)}`,
      email: `${driver.name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@f1.demo`,
      phone: `09${String(170000000 + index).slice(0, 9)}`,
      picture: null,
      department_id: teamIds.get(driver.team) ?? null,
      position_id: positions[driver.position].id,
      salary_grade_id: salaryGrades[driver.position].id,
      area_id: area.id,
      status: 'Active',
      employment_type: driver.employment_type,
      employment_type_effective_date: START_DATE,
      role: driver.role,
      password_hash: passwordHash,
      basic_salary: 0,
      hire_date: START_DATE,
    });

    if (driver.employment_type === 'Regular' || driver.employment_type === 'Probationary') {
      EmployeeShiftRepository.assign({
        employee_id: employee.id,
        shift_id: standingShifts[index % standingShifts.length].id,
        effective_date: START_DATE,
        end_date: null,
      });
    }

    return employee;
  });

  const employeeByName = new Map(employees.map((employee) => [employee.name, employee]));
  const approver = employeeByName.get('Max Verstappen') || employees.find((employee) => employee.role === 'Admin') || employees[0];
  const leaveDates = new Set(['2026-06-10', '2026-06-11']);

  for (const [index, employee] of employees.entries()) {
    if (employee.employment_type === 'Casual' || employee.employment_type === 'Casual On-Call') {
      for (const date of dates) {
        if (isSunday(date)) continue;
        const idx = dateIndex(date);
        if ((idx + index) % 2 !== 0) continue;
        const status = employee.employment_type === 'Casual'
          ? 'Confirmed'
          : date === endDate && index % 4 === 0
            ? 'Offered'
            : idx % 4 === 0
              ? 'Completed'
              : 'Confirmed';
        CasualOnCallShiftOfferRepository.createOffer({
          employee_id: employee.id,
          shift_id: flexShift.id,
          work_date: date,
          start_time: flexShift.start_time,
          end_time: flexShift.end_time,
          break_minutes: flexShift.break_minutes,
          status,
          offered_by: approver.id,
          notes: `${employee.employment_type} demo assignment`,
        });
      }
    }
  }

  for (const [index, employee] of employees.entries()) {
    for (const date of dates) {
      if (isSunday(date)) continue;
      const idx = dateIndex(date);
      const flexibleAssignments = CasualOnCallShiftOfferRepository.findByEmployee(employee.id, date, date);
      const flexibleAssignment = flexibleAssignments.find((assignment) => ['Confirmed', 'Completed'].includes(String(assignment.status)));
      const shift = employee.employment_type === 'Casual' || employee.employment_type === 'Casual On-Call'
        ? flexibleAssignment
        : standingShifts[index % standingShifts.length];
      if (!shift) continue;
      if (employee.name === 'Lando Norris' && leaveDates.has(date)) continue;
      if (date === '2026-06-12' && index % 3 !== 0) continue;
      if ((idx + index) % 17 === 0) continue;

      const start = String(shift.start_time);
      const end = String(shift.end_time);
      const isMissingOut = employee.name === 'Charles Leclerc' && date === '2026-06-08';
      const isGrace = (idx + index) % 11 === 0;
      const isLate = (idx + index) % 7 === 0;
      const hasOvertime = (idx + index) % 13 === 0;
      const timeIn = isGrace ? addMinutes(start, 4) : isLate ? addMinutes(start, 18) : start;
      const timeOut = isMissingOut ? null : hasOvertime ? addMinutes(end, 120) : end;
      createAttendance(employee, date, timeIn, timeOut, (idx + index) % 5 === 0);
    }
  }

  const lando = employeeByName.get('Lando Norris')!;
  const leave = LeaveRequestRepository.create({
    employee_id: lando.id,
    leave_type: 'Service Incentive Leave',
    start_date: '2026-06-10',
    end_date: '2026-06-11',
    days: 2,
    reason: 'Simulator recovery day',
    status: 'Approved',
  });
  LeaveRequestRepository.update(leave.id, { approved_by: approver.id, approved_at: '2026-06-09T09:00:00.000Z' });

  const requestSeeds = [
    { type: 'leave' as const, employee: 'Fernando Alonso', data: { leave_type: 'Service Incentive Leave', start_date: '2026-06-24', end_date: '2026-06-24', days: 1, reason: 'Media day', status: 'Pending' } },
    { type: 'ot' as const, employee: 'Max Verstappen', data: { ot_date: '2026-06-05', start_time: '17:00', end_time: '21:00', hours: 4, reason: 'Race strategy review', status: 'Approved' } },
    { type: 'ot' as const, employee: 'Oscar Piastri', data: { ot_date: '2026-06-18', start_time: '17:00', end_time: '21:00', hours: 4, reason: 'Setup testing', status: 'Pending' } },
    { type: 'salary_advance' as const, employee: 'Lance Stroll', data: { amount: 3500, reason: 'Travel advance', repayment_months: 2, status: 'Approved' } },
    { type: 'salary_advance' as const, employee: 'Isack Hadjar', data: { amount: 2500, reason: 'Helmet fitting', repayment_months: 1, status: 'Pending' } },
    { type: 'incentive' as const, employee: 'Andrea Kimi Antonelli', data: { type: 'Performance Bonus', amount: 1800, reason: 'Clean sprint weekend', status: 'Pending' } },
    { type: 'incentive' as const, employee: 'Carlos Sainz', data: { type: 'Reliability Bonus', amount: 2200, reason: 'Zero incident streak', status: 'Rejected' } },
  ];

  let approvedAdvanceId: number | null = null;
  for (const [index, seed] of requestSeeds.entries()) {
    const employee = employeeByName.get(seed.employee)!;
    let request: Record<string, any>;
    if (seed.type === 'leave') request = LeaveRequestRepository.create({ employee_id: employee.id, ...seed.data });
    else if (seed.type === 'ot') request = OTRequestRepository.create({ employee_id: employee.id, ...seed.data });
    else if (seed.type === 'salary_advance') request = SalaryAdvanceRepository.create({ employee_id: employee.id, ...seed.data });
    else request = IncentiveRequestRepository.create({ employee_id: employee.id, ...seed.data });

    if (request.status === 'Approved' || request.status === 'Rejected') {
      const repository = seed.type === 'leave'
        ? LeaveRequestRepository
        : seed.type === 'ot'
          ? OTRequestRepository
          : seed.type === 'salary_advance'
            ? SalaryAdvanceRepository
            : IncentiveRequestRepository;
      repository.update(request.id, {
        approved_by: approver.id,
        approved_at: `2026-06-${String(8 + index).padStart(2, '0')}T10:00:00.000Z`,
        rejection_reason: request.status === 'Rejected' ? 'Demo rejected request' : null,
      });
    }
    maybeNotify(seed.type, request);
    if (seed.type === 'salary_advance' && request.status === 'Approved') approvedAdvanceId = request.id;
  }

  if (approvedAdvanceId) {
    const lance = employeeByName.get('Lance Stroll')!;
    const extension = LoanExtensionRequestRepository.create({
      salary_advance_id: approvedAdvanceId,
      employee_id: lance.id,
      requested_extra_months: 1,
      reason: 'Spread deduction over another month',
      status: 'Pending',
    });
    maybeNotify('loan_extension', extension);
  }

  finalizeAttendanceForRange({
    startDate: START_DATE,
    endDate,
    employeeIds: employees.map((employee) => employee.id),
  });

  const periods = [
    { start: START_DATE, end: '2026-06-15' },
    { start: '2026-06-16', end: endDate },
  ].filter((period) => period.start <= period.end);

  for (const [periodIndex, period] of periods.entries()) {
    for (const [employeeIndex, employee] of employees.entries()) {
      const payrollData = calculateStatutoryPayroll(employee.id, period.start, period.end);
      if (!payrollData) continue;
      const payrollStatus = (employeeIndex + periodIndex) % 3 === 0
        ? 'Draft'
        : (employeeIndex + periodIndex) % 3 === 1
          ? 'Approved'
          : 'Paid';
      const payroll = PayrollRepository.create({ ...payrollData, payroll_type: 'Regular', status: payrollStatus });
      if (payrollStatus === 'Approved') {
        PayrollRepository.update(payroll.id, {
          approved_by: approver.id,
          approved_at: `${period.end}T15:00:00.000Z`,
        });
      }
      if (payrollStatus === 'Paid') {
        PayrollRepository.update(payroll.id, {
          status: 'Paid',
          approved_by: approver.id,
          approved_at: `${period.end}T15:00:00.000Z`,
          paid_at: `${period.end}T17:00:00.000Z`,
          claimed_at: (employeeIndex + periodIndex) % 2 === 0 ? `${period.end}T18:00:00.000Z` : null,
        });
      }
    }
  }

  return {
    period_start: START_DATE,
    period_end: endDate,
    defaultPassword: DRIVER_PASSWORD,
    counts: {
      departments: countTable('departments'),
      positions: countTable('positions'),
      salary_grades: countTable('salary_grades'),
      shifts: countTable('shifts'),
      employees: countTable('employees'),
      attendance_records: countTable('daily_attendance'),
      attendance_logs: countTable('attendance_logs'),
      requests: countTable('leave_requests') + countTable('ot_requests') + countTable('salary_advance_requests') + countTable('incentive_requests') + countTable('loan_extension_requests'),
      notifications: countTable('notifications'),
      payroll_records: countTable('payroll'),
      flexible_assignments: countTable('casual_on_call_shift_offers'),
    },
    sampleLogins: {
      admin: 'F1001',
      employee: 'F1002',
    },
  };
}
