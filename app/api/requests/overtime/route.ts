import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, OTRequestRepository, EmployeeRepository } from '@/lib/db/models';

interface OTRequestRecord {
  ot_type: string;
  date: string;
  hours: number;
  reason: string;
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const { ot_type, date, hours, reason } = await request.json() as OTRequestRecord;

    // Get employee from auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const employees = EmployeeRepository.findAll();
    const employee = employees.find(e => e.employee_id !== 'FAILSAFE001');

    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    if (!ot_type || !date || !hours) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const otRequest = OTRequestRepository.create({
      employee_id: employee.id,
      ot_type,
      date,
      hours,
      reason: reason || null,
      status: 'Pending',
      approver_id: null,
      approval_date: null,
      remarks: null,
    });

    console.log('[HRIS] OT request created:', otRequest.id);

    return NextResponse.json({
      success: true,
      request: otRequest,
    });
  } catch (error) {
    console.error('[HRIS] OT request error:', error);
    return NextResponse.json(
      { error: 'Failed to create OT request' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const otRequests = OTRequestRepository.findAll();

    return NextResponse.json({
      requests: otRequests,
    });
  } catch (error) {
    console.error('[HRIS] Get OT requests error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch OT requests' },
      { status: 500 }
    );
  }
}
