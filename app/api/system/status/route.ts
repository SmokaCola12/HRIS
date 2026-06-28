import { NextResponse } from 'next/server';
import { ensureInitialized } from '@/lib/db/models';
import { getSystemStatus } from '@/lib/db/database';

export async function GET() {
  try {
    ensureInitialized();
    const status = getSystemStatus();

    return NextResponse.json({
      departmentsLoaded: status.departments,
      employeesLoaded: status.employees,
      attendanceLogsLoaded: status.attendance_logs,
      payrollRecordsLoaded: status.payroll_records,
      unmappedPunches: status.unmapped_punches,
      totalData: status.employees + status.departments + status.attendance_logs + status.payroll_records,
      lastImport: status.last_import,
    });
  } catch (error) {
    console.error('[HRIS] Status check error:', error);
    return NextResponse.json(
      { error: 'Failed to get system status' },
      { status: 500 }
    );
  }
}
