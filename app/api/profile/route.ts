import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  AreaRepository,
  DepartmentRepository,
  EmployeeRepository,
  PositionRepository,
  SalaryGradeRepository,
  ensureInitialized,
} from '@/lib/db/models';
import { resolveWorkSchedule } from '@/lib/scheduling/resolve';

const MAX_PHOTO_LENGTH = 2_500_000;

function isValidPhoto(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  if (!value.trim()) return true;
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value) && value.length <= MAX_PHOTO_LENGTH;
}

function profilePayload(employee: Record<string, any>) {
  const department = employee.department_id ? DepartmentRepository.findById(employee.department_id) : null;
  const position = employee.position_id ? PositionRepository.findById(employee.position_id) : null;
  const area = employee.area_id ? AreaRepository.findById(employee.area_id) : null;
  const salaryGrade = employee.salary_grade_id ? SalaryGradeRepository.findById(employee.salary_grade_id) : null;
  const today = new Date().toISOString().slice(0, 10);
  const schedule = resolveWorkSchedule(employee, today);

  return {
    id: employee.id,
    employee_id: employee.employee_id,
    name: employee.name,
    username: employee.username,
    email: employee.email,
    phone: employee.phone,
    picture: employee.picture,
    role: employee.role,
    status: employee.status,
    employment_type: employee.employment_type,
    hire_date: employee.hire_date,
    department: department?.name || employee.department_name || null,
    position: position?.name || employee.position_name || null,
    area: area?.name || employee.area_name || null,
    salary_grade: salaryGrade ? {
      name: salaryGrade.grade_name,
      amount: Number(salaryGrade.amount || 0),
      frequency: salaryGrade.frequency,
    } : null,
    schedule: schedule ? {
      name: schedule.shift_name || (schedule.source === 'flexible' ? 'Flexible assignment' : 'Standing shift'),
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      source: schedule.source,
    } : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const employee = EmployeeRepository.findById(user.id);
    if (!employee) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    return NextResponse.json({ success: true, profile: profilePayload(employee) });
  } catch (error) {
    console.error('[HRIS] Profile fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const update: Record<string, any> = {};

    if (body.email !== undefined) update.email = String(body.email || '').trim() || null;
    if (body.phone !== undefined) update.phone = String(body.phone || '').trim() || null;
    if (body.picture !== undefined) {
      if (!isValidPhoto(body.picture)) {
        return NextResponse.json({ error: 'Profile photo must be a JPEG, PNG, or WebP data URL under 2.5MB' }, { status: 400 });
      }
      update.picture = body.picture ? String(body.picture) : null;
    }

    const employee = EmployeeRepository.update(user.id, update);
    if (!employee) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    return NextResponse.json({ success: true, profile: profilePayload(employee) });
  } catch (error) {
    console.error('[HRIS] Profile update error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
