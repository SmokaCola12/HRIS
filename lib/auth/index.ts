import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { ensureInitialized, EmployeeRepository } from '../db/models';

const JWT_SECRET = process.env.JWT_SECRET || 'hris-secret-key-change-in-production';
const TOKEN_EXPIRY = '24h';

export type EmployeeRole = 'Employee' | 'Manager' | 'Admin' | 'CEO' | 'DEV';

export interface AuthUser {
  id: number;
  employeeId: string;
  name: string;
  email: string | null;
  role: EmployeeRole;
  departmentId: number | null;
  positionId: number | null;
  picture: string | null;
}

export interface JWTPayload {
  userId: number;
  employeeId: string;
  role: EmployeeRole;
  iat: number;
  exp: number;
}

/**
 * Hash a password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Verify a password
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Create a JWT token
 */
export function createToken(user: AuthUser): string {
  const payload = {
    userId: user.id,
    employeeId: user.employeeId,
    role: user.role,
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * Verify a JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Get current user from cookies (Server Component)
 */
export async function getCurrentUser(request?: { cookies?: { get(name: string): { value?: string } | undefined } }): Promise<AuthUser | null> {
  try {
    const token = request?.cookies?.get('hris_token')?.value ?? (await cookies()).get('hris_token')?.value;
    
    if (!token) {
      return null;
    }

    const payload = verifyToken(token);
    if (!payload) {
      return null;
    }

    ensureInitialized();
    const employee = EmployeeRepository.findById(payload.userId);

    if (!employee) {
      return null;
    }

    return {
      id: employee.id,
      employeeId: employee.employee_id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      departmentId: employee.department_id,
      positionId: employee.position_id,
      picture: employee.picture,
    };
  } catch {
    return null;
  }
}

/**
 * Role hierarchy for permission checks
 */
const ROLE_HIERARCHY: Record<EmployeeRole, number> = {
  Employee: 1,
  Manager: 2,
  Admin: 3,
  CEO: 4,
  DEV: 5,
};

/**
 * Check if user has required role level
 */
export function hasRole(userRole: EmployeeRole, requiredRole: EmployeeRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Check if user can view another user's data
 * Privacy Rule: Manager and CEO data hidden from Admin
 */
export function canViewEmployeeData(
  viewerRole: EmployeeRole,
  targetRole: EmployeeRole
): boolean {
  // DEV can view everyone
  if (viewerRole === 'DEV') return true;
  
  // Employees can only view themselves (handled elsewhere)
  if (viewerRole === 'Employee') return false;
  
  // Admin cannot view Manager or CEO data
  if (viewerRole === 'Admin' && (targetRole === 'Manager' || targetRole === 'CEO')) {
    return false;
  }
  
  // Manager can view everyone except CEO
  if (viewerRole === 'Manager' && targetRole === 'CEO') {
    return false;
  }
  
  // CEO can view everyone except DEV
  if (viewerRole === 'CEO' && targetRole === 'DEV') {
    return false;
  }
  
  return true;
}

/**
 * Get accessible roles for a user
 */
export function getAccessibleRoles(userRole: EmployeeRole): EmployeeRole[] {
  switch (userRole) {
    case 'DEV':
      return ['Employee', 'Manager', 'Admin', 'CEO', 'DEV'];
    case 'CEO':
      return ['Employee', 'Manager', 'Admin', 'CEO'];
    case 'Manager':
      return ['Employee', 'Manager', 'Admin'];
    case 'Admin':
      return ['Employee']; // Cannot see Manager or CEO
    default:
      return [];
  }
}
