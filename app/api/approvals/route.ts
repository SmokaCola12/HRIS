import { NextRequest, NextResponse } from 'next/server';
import {
  EmployeeRepository,
  IncentiveRequestRepository,
  LeaveRequestRepository,
  LoanExtensionRequestRepository,
  OTRequestRepository,
  SalaryAdvanceRepository,
  ensureInitialized,
} from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth';
import { approvalPolicyMessage, canApproveRequest } from '@/lib/approvals/rules';
import { clearApprovalNotification } from '@/lib/notifications/approvals';

interface ApprovalRecord {
  request_type: 'leave' | 'ot' | 'salary_advance' | 'incentive' | 'loan_extension';
  request_id: number;
  action: 'approve' | 'reject';
  remarks?: string;
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { request_type, request_id, action, remarks } = await request.json() as ApprovalRecord;

    const now = new Date().toISOString();

    let targetRequest;
    let repository: any;
    if (request_type === 'leave') {
      const leaveRequest = LeaveRequestRepository.findById(request_id);
      if (!leaveRequest) {
        return NextResponse.json(
          { error: 'Leave request not found' },
          { status: 404 }
        );
      }
      targetRequest = leaveRequest;
      repository = LeaveRequestRepository;
    } else if (request_type === 'ot') {
      const otRequest = OTRequestRepository.findById(request_id);
      if (!otRequest) {
        return NextResponse.json(
          { error: 'OT request not found' },
          { status: 404 }
        );
      }
      targetRequest = otRequest;
      repository = OTRequestRepository;
    } else if (request_type === 'salary_advance') {
      const advanceRequest = SalaryAdvanceRepository.findById(request_id);
      if (!advanceRequest) {
        return NextResponse.json(
          { error: 'Salary advance request not found' },
          { status: 404 }
        );
      }
      targetRequest = advanceRequest;
      repository = SalaryAdvanceRepository;
    } else if (request_type === 'incentive') {
      const incentiveRequest = IncentiveRequestRepository.findById(request_id);
      if (!incentiveRequest) {
        return NextResponse.json(
          { error: 'Incentive request not found' },
          { status: 404 }
        );
      }
      targetRequest = incentiveRequest;
      repository = IncentiveRequestRepository;
    } else if (request_type === 'loan_extension') {
      const extensionRequest = LoanExtensionRequestRepository.findById(request_id);
      if (!extensionRequest) {
        return NextResponse.json(
          { error: 'Loan extension request not found' },
          { status: 404 }
        );
      }
      targetRequest = extensionRequest;
      repository = LoanExtensionRequestRepository;
    } else {
      return NextResponse.json(
        { error: 'Invalid request type' },
        { status: 400 }
      );
    }

    const requester = EmployeeRepository.findById(targetRequest.employee_id);
    if (!requester) {
      return NextResponse.json({ error: 'Request employee not found' }, { status: 404 });
    }

    if (!canApproveRequest(user, requester)) {
      return NextResponse.json(
        { error: approvalPolicyMessage(requester.role) },
        { status: 403 }
      );
    }

    const result = repository.update(request_id, {
      status: action === 'approve' ? 'Approved' : 'Rejected',
      approved_by: user.id,
      approved_at: now,
      rejection_reason: action === 'reject' ? (remarks || null) : null,
    });
    clearApprovalNotification(request_type, Number(request_id));

    console.log(`[HRIS] Request ${request_type}/${request_id} ${action}ed`);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('[HRIS] Approval error:', error);
    return NextResponse.json(
      { error: 'Failed to process approval' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get all pending requests across all types
    const enrichAndFilter = (items: any[]) => items
      .map((item) => {
        const employee = EmployeeRepository.findById(item.employee_id);
        if (!employee || !canApproveRequest(user, employee)) return null;

        return {
          ...item,
          employeeName: employee.name,
          employeeIdStr: employee.employee_id,
          employeeRole: employee.role,
        };
      })
      .filter(Boolean);

    const leaveRequests = enrichAndFilter(LeaveRequestRepository.findByStatus('Pending'));
    const otRequests = enrichAndFilter(OTRequestRepository.findByStatus('Pending'));
    const advanceRequests = enrichAndFilter(SalaryAdvanceRepository.findByStatus('Pending'));
    const incentiveRequests = enrichAndFilter(IncentiveRequestRepository.findByStatus('Pending'));
    const loanExtensionRequests = enrichAndFilter(LoanExtensionRequestRepository.findByStatus('Pending'));

    return NextResponse.json({
      pending: {
        leave: leaveRequests,
        ot: otRequests,
        salary_advance: advanceRequests,
        incentive: incentiveRequests,
        loan_extension: loanExtensionRequests,
      },
      total: leaveRequests.length + otRequests.length + advanceRequests.length + incentiveRequests.length + loanExtensionRequests.length,
    });
  } catch (error) {
    console.error('[HRIS] Get pending requests error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pending requests' },
      { status: 500 }
    );
  }
}
