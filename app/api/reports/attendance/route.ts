import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, EmployeeRepository, AttendanceRepository, AttendanceLogRepository } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth';
import { canAccessEmployeeDirectory, canViewEmployee } from '@/lib/employees/access';
import { finalizeAttendanceForRange } from '@/lib/attendance/finalization';

interface ReportParams {
  start_date: string;
  end_date: string;
  department_id?: number;
  employee_id?: number;
}

const STATE_LABEL: Record<number, string> = {
  0: 'Punch In',
  1: 'Punch Out',
  2: 'Break Out',
  3: 'Break In',
};

const STATE_PIN: Record<number, string> = {
  0: 'PIN',
  1: 'POUT',
  2: 'BOUT',
  3: 'BIN',
};

function parsePhoto(raw: unknown, fallbackName: string) {
  const value = String(raw || '').trim();
  if (!value) return null;

  if (value.startsWith('data:image/')) {
    return { name: fallbackName, src: value };
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed?.src && String(parsed.src).startsWith('data:image/')) {
      return {
        name: String(parsed.name || fallbackName),
        src: String(parsed.src),
      };
    }
  } catch {
    return null;
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessEmployeeDirectory(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const departmentId = searchParams.get('department_id');
    const employeeId = searchParams.get('employee_id');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'start_date and end_date are required' },
        { status: 400 }
      );
    }

    // Get all employees
    let employees = EmployeeRepository.findAll(true)
      .filter(e => e.employee_id !== 'FAILSAFE001')
      .filter(e => canViewEmployee(user, e));

    // Filter by department if specified
    if (departmentId) {
      employees = employees.filter(e => e.department_id === parseInt(departmentId));
    }

    // Filter by employee if specified
    if (employeeId) {
      employees = employees.filter(e => e.id === parseInt(employeeId));
    }

    finalizeAttendanceForRange({
      startDate,
      endDate,
      employeeIds: employees.map((employee) => employee.id),
    });

    // Generate attendance report for each employee
    const report = employees.map(employee => {
      const attendanceRecords = AttendanceRepository.findByEmployeeAndDateRange(
        employee.id,
        startDate,
        endDate
      );
      const photoRecords = AttendanceLogRepository.findByEmployeeAndPeriod(employee.id, startDate, endDate)
        .map((log) => {
          const date = String(log.timestamp || '').slice(0, 10);
          const state = Number(log.state ?? 0);
          const photo = parsePhoto(log.photo, `${employee.employee_id}_${date}_${STATE_PIN[state] || 'LOG'}`);
          if (!photo) return null;
          return {
            id: log.id,
            employee_id: employee.id,
            employee_idno: employee.employee_id,
            employee_name: employee.name,
            timestamp: log.timestamp,
            state,
            action: STATE_LABEL[state] || 'Attendance',
            name: photo.name,
            src: photo.src,
          };
        })
        .filter(Boolean);

      const stats = {
        present: attendanceRecords.filter(a => a.status === 'Present').length,
        absent: attendanceRecords.filter(a => a.status === 'Absent').length,
        late: attendanceRecords.filter(a => a.status === 'Late').length,
        leave: attendanceRecords.filter(a => a.status === 'On Leave').length,
        total_hours: attendanceRecords.reduce((sum, a) => sum + (a.total_hours || 0), 0),
        overtime_hours: attendanceRecords.reduce((sum, a) => sum + (a.overtime_minutes || 0) / 60, 0),
      };

      return {
        employee_id: employee.id,
        employee_name: employee.name,
        employee_idno: employee.employee_id,
        department_id: employee.department_id,
        stats,
        records: attendanceRecords,
        photos: photoRecords,
      };
    });

    // Calculate summary statistics
    const summary = {
      total_employees: employees.length,
      total_present: report.reduce((sum, e) => sum + e.stats.present, 0),
      total_absent: report.reduce((sum, e) => sum + e.stats.absent, 0),
      total_late: report.reduce((sum, e) => sum + e.stats.late, 0),
      total_leave: report.reduce((sum, e) => sum + e.stats.leave, 0),
      total_hours: report.reduce((sum, e) => sum + e.stats.total_hours, 0),
      total_overtime: report.reduce((sum, e) => sum + e.stats.overtime_hours, 0),
    };

    return NextResponse.json({
      success: true,
      period: { start_date: startDate, end_date: endDate },
      summary,
      report,
      photos: report.flatMap((employee) => employee.photos),
    });
  } catch (error) {
    console.error('[HRIS] Attendance report error:', error);
    return NextResponse.json(
      { error: 'Failed to generate attendance report' },
      { status: 500 }
    );
  }
}
