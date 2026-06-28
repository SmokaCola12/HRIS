import type { AuthUser } from '@/lib/auth';
import type { Employee } from '@/lib/db/models';

export function canAccessEmployeeDirectory(role: AuthUser['role']) {
  return ['Manager', 'Admin', 'CEO', 'DEV'].includes(role);
}

export function canManageEmployeeRecords(role: AuthUser['role']) {
  return ['Admin', 'CEO', 'DEV'].includes(role);
}

export function canViewEmployee(viewer: AuthUser, target: Employee) {
  if (!canAccessEmployeeDirectory(viewer.role)) return false;

  if (viewer.role === 'DEV') return true;
  if (viewer.role === 'CEO') return target.role !== 'DEV';
  if (viewer.role === 'Admin') return !['Manager', 'CEO', 'DEV'].includes(target.role);

  if (viewer.role === 'Manager') {
    if (['CEO', 'DEV'].includes(target.role)) return false;
    return target.id === viewer.id || (viewer.departmentId !== null && target.department_id === viewer.departmentId);
  }

  return false;
}
