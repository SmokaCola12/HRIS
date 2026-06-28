import { EmployeeRepository, NotificationRepository } from '@/lib/db/models';

export type ApprovalRequestType = 'leave' | 'ot' | 'salary_advance' | 'incentive' | 'loan_extension';

const approvalLabels: Record<ApprovalRequestType, string> = {
  leave: 'leave request',
  ot: 'overtime request',
  salary_advance: 'salary advance request',
  incentive: 'incentive request',
  loan_extension: 'loan extension request',
};

export function createApprovalNotification(requestType: ApprovalRequestType, requestRecord: Record<string, any>) {
  const employee = EmployeeRepository.findById(Number(requestRecord.employee_id));
  const employeeName = employee?.name || 'An employee';
  const label = approvalLabels[requestType];

  return NotificationRepository.createOnce({
    employee_id: Number(requestRecord.employee_id),
    type: `approval_${requestType}`,
    request_type: requestType,
    request_id: Number(requestRecord.id),
    target_url: '/dashboard/approvals',
    message: `${employeeName} submitted a ${label} for approval.`,
  });
}

export function clearApprovalNotification(requestType: ApprovalRequestType, requestId: number) {
  return NotificationRepository.markApprovalRead(requestType, requestId);
}
