import { NextRequest, NextResponse } from 'next/server';
import { canApproveRequest, approvalPolicyMessage } from '@/lib/approvals/rules';
import { getCurrentUser, canViewEmployeeData } from '@/lib/auth';
import { clearApprovalNotification } from '@/lib/notifications/approvals';
import {
  EmployeeRepository,
  EmployeeShiftRepository,
  IncentiveRequestRepository,
  LeaveRequestRepository,
  LoanExtensionRequestRepository,
  NotificationRepository,
  OTRequestRepository,
  SalaryAdvanceRepository,
  ShiftRepository,
  TardinessPointRepository,
  ensureInitialized,
} from '@/lib/db/models';

export const runtime = 'nodejs';

type AssistantAction =
  | {
      type: 'create_tardiness_acknowledgements';
      employeeIds: number[];
    }
  | {
      type: 'approve_request' | 'reject_request';
      requestType: 'leave' | 'ot' | 'salary_advance' | 'incentive' | 'loan_extension';
      requestId: number;
      remarks?: string;
    }
  | {
      type: 'assign_shift';
      employeeId: number;
      shiftId: number;
      effectiveDate: string;
    };

const ASSISTANT_ROLES = ['Manager', 'Admin', 'CEO', 'DEV'];
type ApprovalRequestType = 'leave' | 'ot' | 'salary_advance' | 'incentive' | 'loan_extension';

function requestRepository(requestType: ApprovalRequestType) {
  if (requestType === 'leave') return LeaveRequestRepository;
  if (requestType === 'ot') return OTRequestRepository;
  if (requestType === 'salary_advance') return SalaryAdvanceRepository;
  if (requestType === 'incentive') return IncentiveRequestRepository;
  if (requestType === 'loan_extension') return LoanExtensionRequestRepository;
  return null;
}

function createTardinessAcknowledgements(userRole: string, employeeIds: number[]) {
  const year = new Date().getFullYear();
  const uniqueIds = [...new Set(employeeIds.map(Number).filter(Number.isFinite))];
  const results = [];

  for (const employeeId of uniqueIds) {
    const employee = EmployeeRepository.findById(employeeId);
    if (!employee || !canViewEmployeeData(userRole as any, employee.role)) continue;

    const points = TardinessPointRepository.getAnnualPoints(employee.id, year);
    if (points < 0.4) continue;

    const managerMessage = `${employee.name} has ${points} annual tardiness point(s). Please review and document the warning.`;
    const employeeMessage = `Your current tardiness total is ${points} point(s). Please confirm that you have been informed.`;

    NotificationRepository.createOnce({
      employee_id: employee.id,
      type: 'tardiness_warning',
      message: managerMessage,
      target_url: `/dashboard/employees/${employee.id}`,
    });

    NotificationRepository.createOnce({
      employee_id: employee.id,
      type: 'employee_tardiness_ack',
      message: employeeMessage,
      target_url: '/dashboard/attendance',
    });

    results.push({
      employee_id: employee.id,
      name: employee.name,
      points,
    });
  }

  return results;
}

function processApproval(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  action: Extract<AssistantAction, { type: 'approve_request' | 'reject_request' }>
) {
  const repository = requestRepository(action.requestType);
  if (!repository) {
    return { error: 'Invalid request type', status: 400 as const };
  }

  const request = repository.findById(action.requestId);
  if (!request) {
    return { error: 'Request not found', status: 404 as const };
  }

  const employee = EmployeeRepository.findById(request.employee_id);
  if (!employee) {
    return { error: 'Request employee not found', status: 404 as const };
  }

  if (!canApproveRequest(user, employee)) {
    return { error: approvalPolicyMessage(employee.role), status: 403 as const };
  }

  if (request.status !== 'Pending') {
    return { error: 'Only pending requests can be changed', status: 400 as const };
  }

  const result = repository.update(action.requestId, {
    status: action.type === 'approve_request' ? 'Approved' : 'Rejected',
    approved_by: user.id,
    approved_at: new Date().toISOString(),
    rejection_reason: action.type === 'reject_request' ? action.remarks || null : null,
  });

  clearApprovalNotification(action.requestType, action.requestId);
  return { result, employee, status: 200 as const };
}

function assignShift(
  userRole: string,
  action: Extract<AssistantAction, { type: 'assign_shift' }>
) {
  const employee = EmployeeRepository.findById(action.employeeId);
  if (!employee || !canViewEmployeeData(userRole as any, employee.role)) {
    return { error: 'Employee not found or not visible to this role', status: 404 as const };
  }

  const shift = ShiftRepository.findById(action.shiftId);
  if (!shift) {
    return { error: 'Shift not found', status: 404 as const };
  }

  const result = EmployeeShiftRepository.assign({
    employee_id: employee.id,
    shift_id: shift.id,
    effective_date: action.effectiveDate,
  });

  return { result, employee, shift, status: 200 as const };
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ASSISTANT_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Assistant actions are available to managers and admins only' }, { status: 403 });
    }

    const { action } = await request.json().catch(() => ({})) as { action?: AssistantAction };
    if (!action || typeof action !== 'object') {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    if (action.type === 'create_tardiness_acknowledgements') {
      const results = createTardinessAcknowledgements(user.role, action.employeeIds || []);
      return NextResponse.json({
        success: true,
        message: `Created or refreshed tardiness warning notifications for ${results.length} employee(s).`,
        results,
      });
    }

    if (action.type === 'approve_request' || action.type === 'reject_request') {
      const outcome = processApproval(user, action);
      if ('error' in outcome) {
        return NextResponse.json({ error: outcome.error }, { status: outcome.status });
      }
      return NextResponse.json({
        success: true,
        message: `${action.type === 'approve_request' ? 'Approved' : 'Rejected'} ${action.requestType} request #${action.requestId}.`,
        result: outcome.result,
      });
    }

    if (action.type === 'assign_shift') {
      const outcome = assignShift(user.role, action);
      if ('error' in outcome) {
        return NextResponse.json({ error: outcome.error }, { status: outcome.status });
      }
      return NextResponse.json({
        success: true,
        message: `Assigned ${outcome.shift.name} to ${outcome.employee.name} effective ${action.effectiveDate}.`,
        result: outcome.result,
      });
    }

    return NextResponse.json({ error: 'Unsupported assistant action' }, { status: 400 });
  } catch (error) {
    console.error('[HRIS] Assistant action error:', error);
    return NextResponse.json({ error: 'Failed to run assistant action' }, { status: 500 });
  }
}
