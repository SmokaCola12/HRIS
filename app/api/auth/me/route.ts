import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { ensureInitialized, EmployeeRepository } from '@/lib/db/models';

export async function GET() {
  try {
    ensureInitialized();
    
    const cookieStore = await cookies();
    const token = cookieStore.get('hris_token')?.value;
    
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);
    
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const employee = EmployeeRepository.findById(payload.userId);

    if (!employee) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    const user = {
      id: employee.id,
      employeeId: employee.employee_id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      departmentId: employee.department_id,
      positionId: employee.position_id,
      picture: employee.picture,
    };

    return NextResponse.json({ user });
  } catch (error) {
    console.error('[HRIS] Auth check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
