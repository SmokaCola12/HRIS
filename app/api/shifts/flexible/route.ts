import { NextRequest, NextResponse } from 'next/server';
import {
  CasualOnCallShiftOfferRepository,
  EmployeeRepository,
  ShiftRepository,
  ensureInitialized,
  type OnCallOfferStatus,
} from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth';

const STATUSES = ['Offered', 'Confirmed', 'Declined', 'Cancelled', 'Completed'] as const;

function canManage(role: string) {
  return ['Manager', 'Admin', 'DEV'].includes(role);
}

function isStatus(value: unknown): value is OnCallOfferStatus {
  return STATUSES.includes(value as OnCallOfferStatus);
}

function serializeAssignment(item: Record<string, any>) {
  return {
    ...item,
    break_minutes: Number(item.break_minutes || 0),
  };
}

function getSchedulableEmployees() {
  return EmployeeRepository.findAll(true)
    .filter((employee) => employee.status === 'Active' && employee.employee_id !== 'FAILSAFE001')
    .map((employee) => ({
      id: employee.id,
      employee_id: employee.employee_id,
      name: employee.name,
      employment_type: employee.employment_type,
      department: employee.department_name ?? null,
    }));
}

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canManage(user.role)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    let assignments = CasualOnCallShiftOfferRepository.findAll();
    if (startDate) assignments = assignments.filter((item) => item.work_date >= startDate);
    if (endDate) assignments = assignments.filter((item) => item.work_date <= endDate);

    return NextResponse.json({
      success: true,
      assignments: assignments.map(serializeAssignment),
      employees: getSchedulableEmployees(),
      shifts: ShiftRepository.findAll().map((shift) => ({
        id: shift.id,
        name: shift.name,
        code: shift.code,
        start_time: shift.start_time,
        end_time: shift.end_time,
        break_minutes: Number(shift.break_minutes || 0),
      })),
      statuses: STATUSES,
    });
  } catch (error) {
    console.error('[HRIS] Flexible shifts fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch flexible shift assignments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canManage(user.role)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

    const body = await request.json();
    const employeeId = Number(body.employee_id);
    const employee = EmployeeRepository.findById(employeeId);
    if (!employee || employee.status !== 'Active' || employee.employee_id === 'FAILSAFE001') {
      return NextResponse.json({ error: 'Select an active employee' }, { status: 400 });
    }

    const shift = body.shift_id ? ShiftRepository.findById(Number(body.shift_id)) : null;
    const startTime = String(body.start_time || shift?.start_time || '').slice(0, 5);
    const endTime = String(body.end_time || shift?.end_time || '').slice(0, 5);
    if (!body.work_date || !startTime || !endTime) {
      return NextResponse.json({ error: 'Work date, start time, and end time are required' }, { status: 400 });
    }

    const requestedStatus = isStatus(body.status) ? body.status : null;
    const defaultStatus: OnCallOfferStatus = 'Confirmed';
    const assignment = CasualOnCallShiftOfferRepository.createOffer({
      employee_id: employeeId,
      shift_id: shift?.id ?? null,
      work_date: String(body.work_date),
      start_time: startTime,
      end_time: endTime,
      break_minutes: Number(body.break_minutes ?? shift?.break_minutes ?? 0),
      status: requestedStatus ?? defaultStatus,
      offered_by: user.id,
      notes: body.notes ? String(body.notes).trim() : null,
    });

    return NextResponse.json({ success: true, assignment: serializeAssignment(assignment) });
  } catch (error) {
    console.error('[HRIS] Flexible shift create error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create flexible shift assignment' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canManage(user.role)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

    const body = await request.json();
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 });

    const shift = body.shift_id ? ShiftRepository.findById(Number(body.shift_id)) : null;
    const update: Record<string, any> = {};
    if (body.employee_id !== undefined) {
      const employee = EmployeeRepository.findById(Number(body.employee_id));
      if (!employee || employee.status !== 'Active' || employee.employee_id === 'FAILSAFE001') {
        return NextResponse.json({ error: 'Select an active employee' }, { status: 400 });
      }
      update.employee_id = employee.id;
    }
    if (body.shift_id !== undefined) update.shift_id = shift?.id ?? null;
    if (body.work_date !== undefined) update.work_date = String(body.work_date);
    if (body.start_time !== undefined || shift) update.start_time = String(body.start_time || shift?.start_time || '').slice(0, 5);
    if (body.end_time !== undefined || shift) update.end_time = String(body.end_time || shift?.end_time || '').slice(0, 5);
    if (body.break_minutes !== undefined || shift) update.break_minutes = Number(body.break_minutes ?? shift?.break_minutes ?? 0);
    if (body.status !== undefined) {
      if (!isStatus(body.status)) return NextResponse.json({ error: 'Invalid assignment status' }, { status: 400 });
      update.status = body.status;
    }
    if (body.notes !== undefined) update.notes = body.notes ? String(body.notes).trim() : null;

    const assignment = CasualOnCallShiftOfferRepository.update(id, update);
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    return NextResponse.json({ success: true, assignment: serializeAssignment(assignment) });
  } catch (error) {
    console.error('[HRIS] Flexible shift update error:', error);
    return NextResponse.json({ error: 'Failed to update flexible shift assignment' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canManage(user.role)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 });

    const result = CasualOnCallShiftOfferRepository.delete(id);
    if (!result.changes) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[HRIS] Flexible shift delete error:', error);
    return NextResponse.json({ error: 'Failed to delete flexible shift assignment' }, { status: 500 });
  }
}
