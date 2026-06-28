import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getCurrentUser } from '@/lib/auth';
import { canViewEmployee } from '@/lib/employees/access';
import { EmployeeRepository, ensureInitialized } from '@/lib/db/models';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const employeeId = Number((await params).id);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return NextResponse.json({ error: 'Invalid employee ID' }, { status: 400 });
    }

    const employee = EmployeeRepository.findById(employeeId);
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }
    if (!canViewEmployee(user, employee)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Generated on demand so every employee automatically has a kiosk QR after creation.
    const svg = await QRCode.toString(JSON.stringify({ employee_id: employee.employee_id }), {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[HRIS] Employee QR code error:', error);
    return NextResponse.json({ error: 'Failed to generate employee QR code' }, { status: 500 });
  }
}
