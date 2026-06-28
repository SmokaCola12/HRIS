import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureInitialized, AttendanceRepository } from '@/lib/db/models';
import { finalizeAttendanceForRange } from '@/lib/attendance/finalization';

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date') ?? undefined;
    const endDate = searchParams.get('end_date') ?? undefined;

    if (startDate && endDate) {
      finalizeAttendanceForRange({ startDate, endDate, employeeIds: [user.id] });
    }

    const records = AttendanceRepository.findByEmployeeAndDateRange(
      user.id,
      startDate,
      endDate
    );

    const summary = {
      present: records.filter((record) => record.status === 'Present').length,
      late: records.filter((record) => record.status === 'Late').length,
      absent: records.filter((record) => record.status === 'Absent').length,
      leave: records.filter((record) => record.status === 'On Leave').length,
      totalLateMinutes: records.reduce((sum, record) => sum + (record.late_minutes || 0), 0),
      totalUndertimeMinutes: records.reduce((sum, record) => sum + (record.undertime_minutes || 0), 0),
      totalEarlyOutMinutes: records.reduce((sum, record) => sum + (record.early_out_minutes || 0), 0),
      totalOvertimeMinutes: records.reduce((sum, record) => sum + (record.overtime_minutes || 0), 0),
    };

    return NextResponse.json({
      success: true,
      records,
      summary,
    });
  } catch (error) {
    console.error('[HRIS] Attendance fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
  }
}
