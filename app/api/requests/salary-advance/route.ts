import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, SalaryAdvanceRepository, EmployeeRepository } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth';
import { approvalPolicyMessage, canApproveRequest } from '@/lib/approvals/rules';
import { createApprovalNotification } from '@/lib/notifications/approvals';
import { salaryAdvanceLimit } from '@/lib/payroll/rates';

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const employeeForLimit = EmployeeRepository.findById(user.id);
    const limit = employeeForLimit ? salaryAdvanceLimit(employeeForLimit) : null;
    const requests = SalaryAdvanceRepository.findAll().filter(r => r.employee_id === user.id);

    // Enrich with employee info
    const enrichedRequests = requests.map(req => {
      const employee = EmployeeRepository.findById(req.employee_id);
      return {
        ...req,
        employeeName: employee?.name || 'Unknown',
        employeeIdStr: employee?.employee_id || 'N/A',
      };
    });

    return NextResponse.json({
      success: true,
      requests: enrichedRequests,
      limit,
    });
  } catch (error) {
    console.error('[HRIS] Get salary advance requests error:', error);
    return NextResponse.json({ error: 'Failed to retrieve salary advance requests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { amount, reason, repayment_months } = body;

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: 'Amount is required' }, { status: 400 });
    }
    const employee = EmployeeRepository.findById(user.id);
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }
    const limit = salaryAdvanceLimit(employee);
    if (numericAmount > limit.available_amount) {
      return NextResponse.json({
        error: `Amount exceeds available salary advance limit of ${limit.available_amount.toFixed(2)}`,
        limit,
      }, { status: 400 });
    }

    const newRequest = SalaryAdvanceRepository.create({
      employee_id: user.id,
      amount: numericAmount,
      reason: reason || null,
      repayment_months: repayment_months || 1,
    });
    createApprovalNotification('salary_advance', newRequest);

    return NextResponse.json({
      success: true,
      request: newRequest,
    });
  } catch (error) {
    console.error('[HRIS] Create salary advance request error:', error);
    return NextResponse.json({ error: 'Failed to create salary advance request' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['Manager', 'Admin', 'CEO', 'DEV'].includes(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { id, status, rejection_reason } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'ID and status are required' }, { status: 400 });
    }

    const existing = SalaryAdvanceRepository.findById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const requester = EmployeeRepository.findById(existing.employee_id);
    if (!requester) {
      return NextResponse.json({ error: 'Request employee not found' }, { status: 404 });
    }

    if (!canApproveRequest(user, requester)) {
      return NextResponse.json({ error: approvalPolicyMessage(requester.role) }, { status: 403 });
    }

    if (status === 'Approved') {
      const limit = salaryAdvanceLimit(requester);
      const reservedWithoutThis = SalaryAdvanceRepository.findAll()
        .filter((advance) =>
          advance.employee_id === requester.id &&
          advance.id !== existing.id &&
          ['Pending', 'Approved'].includes(String(advance.status))
        )
        .reduce((sum, advance) => sum + Number(advance.amount || 0), 0);
      if (reservedWithoutThis + Number(existing.amount || 0) > limit.max_advance) {
        return NextResponse.json({
          error: 'Approving this request would exceed the employee salary advance cap',
          limit: {
            ...limit,
            reserved_amount: reservedWithoutThis,
            available_amount: Math.max(0, limit.max_advance - reservedWithoutThis),
          },
        }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = {
      status,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    };

    if (status === 'Rejected' && rejection_reason) {
      updateData.rejection_reason = rejection_reason;
    }

    const updated = SalaryAdvanceRepository.update(id, updateData);

    if (!updated) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      request: updated,
    });
  } catch (error) {
    console.error('[HRIS] Update salary advance request error:', error);
    return NextResponse.json({ error: 'Failed to update salary advance request' }, { status: 500 });
  }
}
