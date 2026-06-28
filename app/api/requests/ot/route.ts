import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, OTRequestRepository, EmployeeRepository } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth';
import { approvalPolicyMessage, canApproveRequest } from '@/lib/approvals/rules';
import { createApprovalNotification } from '@/lib/notifications/approvals';

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function blockHours(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (end <= start) end += 1440;
  return (end - start) / 60;
}

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requests = OTRequestRepository.findAll().filter(r => r.employee_id === user.id);

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
    });
  } catch (error) {
    console.error('[HRIS] Get OT requests error:', error);
    return NextResponse.json({ error: 'Failed to retrieve OT requests' }, { status: 500 });
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
    const { ot_date, start_time, end_time, hours, reason } = body;

    if (!ot_date || !start_time || !end_time || !hours) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const numericHours = Number(hours);
    if (!Number.isFinite(numericHours) || numericHours <= 0 || numericHours > 4) {
      return NextResponse.json({ error: 'OT requests must be greater than 0 and no more than 4 hours' }, { status: 400 });
    }

    if (Math.abs(blockHours(start_time, end_time) - numericHours) > 0.01) {
      return NextResponse.json({ error: 'Start and end time must match the requested OT hours' }, { status: 400 });
    }

    const newRequest = OTRequestRepository.create({
      employee_id: user.id,
      ot_date,
      start_time,
      end_time,
      hours: numericHours,
      reason: reason || null,
    });
    createApprovalNotification('ot', newRequest);

    return NextResponse.json({
      success: true,
      request: newRequest,
    });
  } catch (error) {
    console.error('[HRIS] Create OT request error:', error);
    return NextResponse.json({ error: 'Failed to create OT request' }, { status: 500 });
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

    const existing = OTRequestRepository.findById(id);
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

    const updateData: Record<string, unknown> = {
      status,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    };

    if (status === 'Rejected' && rejection_reason) {
      updateData.rejection_reason = rejection_reason;
    }

    const updated = OTRequestRepository.update(id, updateData);

    if (!updated) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      request: updated,
    });
  } catch (error) {
    console.error('[HRIS] Update OT request error:', error);
    return NextResponse.json({ error: 'Failed to update OT request' }, { status: 500 });
  }
}
