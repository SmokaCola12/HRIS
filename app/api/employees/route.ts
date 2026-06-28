import { NextRequest, NextResponse } from 'next/server';
import {
  ensureInitialized,
  EmployeeRepository,
  DepartmentRepository,
  PositionRepository,
  SalaryGradeRepository,
  ShiftRepository,
  EmployeeShiftRepository,
} from '@/lib/db/models';
import type { EmploymentType } from '@/lib/db/models';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { canAccessEmployeeDirectory, canManageEmployeeRecords, canViewEmployee } from '@/lib/employees/access';
import { isFlexibleEmploymentType, resolveWorkSchedule } from '@/lib/scheduling/resolve';

interface CreateEmployeeRequest {
  id?: number;
  employee_id: string;
  name: string;
  email?: string;
  password?: string;
  department_id?: string | number;
  position_id?: string | number;
  salary_grade_id?: string | number;
  shift_id?: string | number;
  work_days?: number[];
  shift_assignments?: Array<{ shift_id?: string | number; work_days?: number[] }>;
  employment_type?: string;
  employment_type_effective_date?: string;
  role?: string;
  status?: string;
}

const EMPLOYMENT_TYPES = ['Regular', 'Probationary', 'Casual', 'Casual On-Call'] as const;
const ALL_WORK_DAYS = [0, 1, 2, 3, 4, 5, 6];

function isEmploymentType(value?: string): value is EmploymentType {
  return EMPLOYMENT_TYPES.includes(value as EmploymentType);
}

function normalizeWorkDays(value: unknown) {
  if (!Array.isArray(value)) return ALL_WORK_DAYS;
  const days = [...new Set(value
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort((a, b) => a - b);
  return days.length ? days : ALL_WORK_DAYS;
}

function normalizeShiftAssignments(body: CreateEmployeeRequest) {
  const rawAssignments = Array.isArray(body.shift_assignments)
    ? body.shift_assignments
    : body.shift_id
      ? [{ shift_id: body.shift_id, work_days: body.work_days }]
      : [];

  const assignments = rawAssignments
    .map((assignment) => ({
      shift_id: Number(assignment.shift_id),
      work_days: Array.isArray(assignment.work_days) && assignment.work_days.length === 0
        ? []
        : normalizeWorkDays(assignment.work_days),
    }))
    .filter((assignment) => Number.isInteger(assignment.shift_id) && assignment.shift_id > 0);

  const usedDays = new Set<number>();
  for (const assignment of assignments) {
    if (assignment.work_days.length === 0) {
      throw new Error('Each standing shift row needs at least one work day');
    }
    for (const day of assignment.work_days) {
      if (usedDays.has(day)) {
        throw new Error('Each work day can only be assigned to one standing shift');
      }
      usedDays.add(day);
    }
  }

  return assignments;
}

function scheduleLabel(assignments: any[]) {
  if (!assignments.length) return null;
  if (assignments.length === 1) return assignments[0].shift_name ?? null;
  return assignments
    .map((assignment) => assignment.shift_name)
    .filter(Boolean)
    .join(' / ');
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canManageEmployeeRecords(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    const {
      employee_id,
      name,
      email,
      password,
      department_id,
      position_id,
      salary_grade_id,
      shift_id,
      work_days,
      shift_assignments,
      employment_type,
      employment_type_effective_date,
      role,
    } = await request.json() as CreateEmployeeRequest;

    // Validate required fields
    if (!employee_id || !name || !password || !department_id || !position_id || !salary_grade_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (role && !['Employee', 'Manager', 'Admin'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid account role' },
        { status: 400 }
      );
    }

    if (employment_type && !isEmploymentType(employment_type)) {
      return NextResponse.json(
        { error: 'Invalid employment type' },
        { status: 400 }
      );
    }
    const normalizedEmploymentType: EmploymentType = employment_type && isEmploymentType(employment_type)
      ? employment_type
      : 'Probationary';

    let standingAssignments;
    try {
      standingAssignments = normalizeShiftAssignments({ shift_id, work_days, shift_assignments } as CreateEmployeeRequest);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid shift assignments' },
        { status: 400 }
      );
    }

    if (!isFlexibleEmploymentType(normalizedEmploymentType) && standingAssignments.length === 0) {
      return NextResponse.json(
        { error: 'Shift is required for Regular and Probationary employees' },
        { status: 400 }
      );
    }
    if (isFlexibleEmploymentType(normalizedEmploymentType) && standingAssignments.length > 0) {
      return NextResponse.json(
        { error: 'Casual and Casual On-Call employees use flexible shift assignments, not standing shifts' },
        { status: 400 }
      );
    }

    // Check if employee already exists
    const existing = EmployeeRepository.findByEmployeeId(employee_id);
    if (existing) {
      return NextResponse.json(
        { error: 'Employee with this ID already exists' },
        { status: 409 }
      );
    }

    const departmentId = Number(department_id);
    const positionId = Number(position_id);
    const salaryGradeId = Number(salary_grade_id);
    const department = DepartmentRepository.findById(departmentId);
    const position = PositionRepository.findById(positionId);
    const salaryGrade = SalaryGradeRepository.findById(salaryGradeId);
    const missingShift = standingAssignments.find((assignment) => !ShiftRepository.findById(assignment.shift_id));

    if (!department || !position || !salaryGrade || missingShift) {
      return NextResponse.json(
        { error: 'Selected department, position, salary grade, or shift does not exist' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create employee
    const employee = EmployeeRepository.create({
      employee_id,
      name,
      username: employee_id,
      email: email || null,
      phone: null,
      picture: null,
      department_id: departmentId,
      position_id: positionId,
      salary_grade_id: salaryGradeId,
      area_id: null,
      status: 'Active',
      employment_type: normalizedEmploymentType,
      employment_type_effective_date: employment_type_effective_date || new Date().toISOString().split('T')[0],
      role: (role || 'Employee') as any,
      password_hash: passwordHash,
      basic_salary: 0,
      hire_date: new Date().toISOString().split('T')[0],
    });

    if (standingAssignments.length) {
      EmployeeShiftRepository.assignMany({
        employee_id: employee.id,
        effective_date: new Date().toISOString().split('T')[0],
        end_date: null,
        assignments: standingAssignments,
      });
    }

    console.log('[HRIS] Employee created manually:', employee.id);

    return NextResponse.json({
      success: true,
      employee: {
        id: employee.id,
        employee_id: employee.employee_id,
        name: employee.name,
        username: employee.username,
        email: employee.email,
        department_id: employee.department_id,
        position_id: employee.position_id,
        salary_grade_id: employee.salary_grade_id,
        shift_id: standingAssignments[0]?.shift_id ?? null,
        work_days: standingAssignments[0]?.work_days ?? ALL_WORK_DAYS,
        shift_assignments: standingAssignments,
        employment_type: employee.employment_type,
        employment_type_effective_date: employee.employment_type_effective_date,
        role: employee.role,
        status: employee.status,
      },
    });
  } catch (error) {
    console.error('[HRIS] Create employee error:', error);
    return NextResponse.json(
      { error: 'Failed to create employee' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessEmployeeDirectory(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    const employees = EmployeeRepository.findAll(true).filter((employee) => canViewEmployee(user, employee));

    return NextResponse.json({
      employees: employees.map(e => {
        const employeeShift = EmployeeShiftRepository.findByEmployee(e.id);
        const employeeShiftAssignments = EmployeeShiftRepository.findByEmployeeAssignments(e.id);
        const shift = employeeShift?.shift_id ? ShiftRepository.findById(employeeShift.shift_id) : null;
        const standingLabel = scheduleLabel(employeeShiftAssignments);

        return {
          id: e.id,
          employee_id: e.employee_id,
          name: e.name,
          username: e.username,
          email: e.email,
          picture: e.picture,
          department_id: e.department_id,
          department_name: e.department_name,
          department: e.department_name,
          position_id: e.position_id,
          position_name: e.position_name,
          position: e.position_name,
          salary_grade_id: e.salary_grade_id,
          shift_id: employeeShift?.shift_id || null,
          work_days: employeeShift?.work_days || ALL_WORK_DAYS,
          shift_assignments: employeeShiftAssignments.map((assignment) => ({
            id: assignment.id,
            shift_id: assignment.shift_id,
            shift_name: assignment.shift_name ?? null,
            start_time: assignment.start_time ?? null,
            end_time: assignment.end_time ?? null,
            break_minutes: Number(assignment.break_minutes || 0),
            work_days: assignment.work_days || ALL_WORK_DAYS,
          })),
          shift_name: shift?.name || (isFlexibleEmploymentType(e.employment_type) ? 'Flexible assignments' : null),
          shift: shift?.name || (isFlexibleEmploymentType(e.employment_type) ? 'Flexible assignments' : null),
          schedule_label: resolveWorkSchedule(e, new Date().toISOString().split('T')[0])?.shift_name ||
            standingLabel ||
            shift?.name ||
            (isFlexibleEmploymentType(e.employment_type) ? 'Flexible assignments' : null),
          employment_type: e.employment_type || 'Probationary',
          employment_type_effective_date: e.employment_type_effective_date,
          status: e.status,
          role: e.role,
        };
      }),
    });
  } catch (error) {
    console.error('[HRIS] Get employees error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch employees' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canManageEmployeeRecords(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    const {
      id,
      employee_id,
      name,
      email,
      password,
      department_id,
      position_id,
      salary_grade_id,
      shift_id,
      work_days,
      shift_assignments,
      employment_type,
      employment_type_effective_date,
      role,
      status,
    } = await request.json() as CreateEmployeeRequest;

    if (!id) {
      return NextResponse.json(
        { error: 'Employee ID is required' },
        { status: 400 }
      );
    }

    const existingEmployee = EmployeeRepository.findById(Number(id));
    if (!existingEmployee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }
    if (!canViewEmployee(user, existingEmployee)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (employee_id && employee_id !== existingEmployee.employee_id) {
      const duplicate = EmployeeRepository.findByEmployeeId(employee_id);
      if (duplicate && duplicate.id !== existingEmployee.id) {
        return NextResponse.json(
          { error: 'Employee with this ID already exists' },
          { status: 409 }
        );
      }
    }

    if (role && !['Employee', 'Manager', 'Admin'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid account role' },
        { status: 400 }
      );
    }

    if (status && !['Active', 'Resigned', 'AWOL'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid employee status' },
        { status: 400 }
      );
    }
    if (employment_type && !isEmploymentType(employment_type)) {
      return NextResponse.json(
        { error: 'Invalid employment type' },
        { status: 400 }
      );
    }
    const nextEmploymentType = employment_type && isEmploymentType(employment_type)
      ? employment_type
      : existingEmployee.employment_type;
    let standingAssignments;
    try {
      standingAssignments = normalizeShiftAssignments({ shift_id, work_days, shift_assignments } as CreateEmployeeRequest);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid shift assignments' },
        { status: 400 }
      );
    }

    const hasSubmittedShift = shift_assignments !== undefined || standingAssignments.length > 0;
    if (isFlexibleEmploymentType(nextEmploymentType) && hasSubmittedShift) {
      return NextResponse.json(
        { error: 'Casual and Casual On-Call employees use flexible shift assignments, not standing shifts' },
        { status: 400 }
      );
    }
    if (
      ['Regular', 'Probationary'].includes(nextEmploymentType) &&
      hasSubmittedShift &&
      standingAssignments.length === 0
    ) {
      return NextResponse.json(
        { error: 'At least one standing shift row is required' },
        { status: 400 }
      );
    }
    if (
      ['Regular', 'Probationary'].includes(nextEmploymentType) &&
      !hasSubmittedShift &&
      (employment_type !== undefined || status === 'Active')
    ) {
      const activeShift = EmployeeShiftRepository.findByEmployee(Number(id));
      if (!activeShift) {
        return NextResponse.json(
          { error: `${nextEmploymentType} employees need an active standing shift before they can be scheduled` },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, any> = {};

    if (employee_id !== undefined) {
      updateData.employee_id = employee_id;
      updateData.username = employee_id;
    }
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email || null;
    if (department_id !== undefined) {
      const departmentId = Number(department_id);
      if (!DepartmentRepository.findById(departmentId)) {
        return NextResponse.json({ error: 'Selected department does not exist' }, { status: 400 });
      }
      updateData.department_id = departmentId;
    }
    if (position_id !== undefined) {
      const positionId = Number(position_id);
      if (!PositionRepository.findById(positionId)) {
        return NextResponse.json({ error: 'Selected position does not exist' }, { status: 400 });
      }
      updateData.position_id = positionId;
    }
    if (salary_grade_id !== undefined) {
      const salaryGradeId = Number(salary_grade_id);
      if (!SalaryGradeRepository.findById(salaryGradeId)) {
        return NextResponse.json({ error: 'Selected salary grade does not exist' }, { status: 400 });
      }
      updateData.salary_grade_id = salaryGradeId;
    }
    if (employment_type !== undefined) updateData.employment_type = employment_type;
    if (employment_type_effective_date !== undefined) updateData.employment_type_effective_date = employment_type_effective_date;
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;
    if (password) updateData.password_hash = await hashPassword(password);

    const employee = EmployeeRepository.update(Number(id), updateData);
    if (employee?.employment_type && isFlexibleEmploymentType(employee.employment_type)) {
      EmployeeShiftRepository.clearActive(Number(id), new Date().toISOString().split('T')[0]);
    }

    if (hasSubmittedShift && standingAssignments.length) {
      const missingShift = standingAssignments.find((assignment) => !ShiftRepository.findById(assignment.shift_id));
      if (missingShift) {
        return NextResponse.json({ error: 'Selected shift does not exist' }, { status: 400 });
      }

      EmployeeShiftRepository.assignMany({
        employee_id: Number(id),
        effective_date: new Date().toISOString().split('T')[0],
        end_date: null,
        assignments: standingAssignments,
      });
    }

    const employeeShift = EmployeeShiftRepository.findByEmployee(Number(id));
    const employeeShiftAssignments = EmployeeShiftRepository.findByEmployeeAssignments(Number(id));

    return NextResponse.json({
      success: true,
      employee: {
        id: employee?.id,
        employee_id: employee?.employee_id,
        name: employee?.name,
        username: employee?.username,
        email: employee?.email,
        department_id: employee?.department_id,
        position_id: employee?.position_id,
        salary_grade_id: employee?.salary_grade_id,
        shift_id: employeeShift?.shift_id || null,
        work_days: employeeShift?.work_days || ALL_WORK_DAYS,
        shift_assignments: employeeShiftAssignments.map((assignment) => ({
          id: assignment.id,
          shift_id: assignment.shift_id,
          shift_name: assignment.shift_name ?? null,
          start_time: assignment.start_time ?? null,
          end_time: assignment.end_time ?? null,
          break_minutes: Number(assignment.break_minutes || 0),
          work_days: assignment.work_days || ALL_WORK_DAYS,
        })),
        employment_type: employee?.employment_type,
        employment_type_effective_date: employee?.employment_type_effective_date,
        role: employee?.role,
        status: employee?.status,
      },
    });
  } catch (error) {
    console.error('[HRIS] Update employee error:', error);
    return NextResponse.json(
      { error: 'Failed to update employee' },
      { status: 500 }
    );
  }
}
