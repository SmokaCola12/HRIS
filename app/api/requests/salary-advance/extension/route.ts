import { NextRequest, NextResponse } from 'next/server';
import {
  EmployeeRepository,
  LoanExtensionRequestRepository,
  SalaryAdvanceRepository,
  ensureInitialized,
} from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth';
import { approvalPolicyMessage, canApproveRequest } from '@/lib/approvals/rules';
import { createApprovalNotification } from '@/lib/notifications/approvals';

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { salary_advance_id, requested_extra_months, reason } = await request.json();
    const advance = SalaryAdvanceRepository.findById(Number(salary_advance_id));
    if (!advance || advance.employee_id !== user.id || advance.status !== 'Approved') {
      return NextResponse.json({ error: 'Approved salary advance not found for this employee' }, { status: 404 });
    }

    const extraMonths = Number(requested_extra_months);
    if (!Number.isInteger(extraMonths) || extraMonths < 1 || extraMonths > 12) {
      return NextResponse.json({ error: 'Requested extra months must be between 1 and 12' }, { status: 400 });
    }

    const extension = LoanExtensionRequestRepository.create({
      salary_advance_id: advance.id,
      employee_id: user.id,
      requested_extra_months: extraMonths,
      reason: reason || null,
    });
    createApprovalNotification('loan_extension', extension);

    return NextResponse.json({ success: true, request: extension });
  } catch (error) {
    console.error('[HRIS] Create loan extension request error:', error);
    return NextResponse.json({ error: 'Failed to create loan extension request' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['Manager', 'Admin', 'CEO', 'DEV'].includes(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id, status, rejection_reason } = await request.json();
    const existing = LoanExtensionRequestRepository.findById(Number(id));
    if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

    const requester = EmployeeRepository.findById(existing.employee_id);
    if (!requester) return NextResponse.json({ error: 'Request employee not found' }, { status: 404 });
    if (!canApproveRequest(user, requester)) {
      return NextResponse.json({ error: approvalPolicyMessage(requester.role) }, { status: 403 });
    }

    const updated = LoanExtensionRequestRepository.update(Number(id), {
      status,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      rejection_reason: status === 'Rejected' ? rejection_reason || null : null,
    });

    return NextResponse.json({ success: true, request: updated });
  } catch (error) {
    console.error('[HRIS] Update loan extension request error:', error);
    return NextResponse.json({ error: 'Failed to update loan extension request' }, { status: 500 });
  }
}
