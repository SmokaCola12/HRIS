import type { AuthUser } from '@/lib/auth';

type RequestEmployee = {
  id: number;
  role: string;
};

export function canApproveRequest(approver: AuthUser, requester: RequestEmployee): boolean {
  if (approver.id === requester.id) return false;
  return ['Admin', 'Manager', 'CEO', 'DEV'].includes(approver.role);
}

export function approvalPolicyMessage(requesterRole: string): string {
  return `${requesterRole} requests must be approved from the Approval page by another authorized approver`;
}
