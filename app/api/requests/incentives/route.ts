import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, EmployeeRepository, IncentiveRequestRepository } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth';
import { approvalPolicyMessage, canApproveRequest } from '@/lib/approvals/rules';
import { createApprovalNotification } from '@/lib/notifications/approvals';

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const requests = IncentiveRequestRepository.findAll().filter((item) => item.employee_id === user.id);

    return NextResponse.json({
      success: true,
      requests: requests.map((item) => {
        const employee = EmployeeRepository.findById(item.employee_id);
        return {
          ...item,
          employeeName: employee?.name || 'Unknown',
          employeeIdStr: employee?.employee_id || 'N/A',
        };
      }),
    });
  } catch (error) {
    console.error('[HRIS] Get incentive requests error:', error);
    return NextResponse.json({ error: 'Failed to retrieve incentive requests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { type, amount, reason } = await request.json();
    if (!type || !amount || Number(amount) <= 0) {
      return NextResponse.json({ error: 'Type and a positive amount are required' }, { status: 400 });
    }

    const newRequest = IncentiveRequestRepository.create({
      employee_id: user.id,
      type,
      amount: Number(amount),
      reason: reason || null,
    });
    createApprovalNotification('incentive', newRequest);

    return NextResponse.json({ success: true, request: newRequest });
  } catch (error) {
    console.error('[HRIS] Create incentive request error:', error);
    return NextResponse.json({ error: 'Failed to create incentive request' }, { status: 500 });
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
    const existing = IncentiveRequestRepository.findById(Number(id));
    if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    const requester = EmployeeRepository.findById(existing.employee_id);
    if (!requester) return NextResponse.json({ error: 'Request employee not found' }, { status: 404 });
    if (!canApproveRequest(user, requester)) {
      return NextResponse.json({ error: approvalPolicyMessage(requester.role) }, { status: 403 });
    }

    const updated = IncentiveRequestRepository.update(Number(id), {
      status,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      rejection_reason: status === 'Rejected' ? rejection_reason || null : null,
    });
    return NextResponse.json({ success: true, request: updated });
  } catch (error) {
    console.error('[HRIS] Update incentive request error:', error);
    return NextResponse.json({ error: 'Failed to update incentive request' }, { status: 500 });
  }
}
