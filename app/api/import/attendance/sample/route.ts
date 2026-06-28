import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, EmployeeRepository } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth';
import { resolveWorkSchedule } from '@/lib/scheduling/resolve';

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function normalizeTime(time: string | null | undefined, fallback: string) {
  return (time || fallback).slice(0, 5);
}

function addHours(time: string, hours: number) {
  const [rawHours, rawMinutes] = time.split(':').map(Number);
  const total = ((rawHours * 60 + rawMinutes + hours * 60) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function addMinutes(time: string, minutes: number) {
  const [rawHours, rawMinutes] = time.split(':').map(Number);
  const total = ((rawHours * 60 + rawMinutes + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);

    if (!user || !['Manager', 'Admin', 'DEV'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const employees = EmployeeRepository.findAll(true)
      .filter((employee) => employee.status === 'Active' && employee.employee_id !== 'FAILSAFE001')
      .slice(0, 20);

    if (employees.length === 0) {
      return NextResponse.json({ error: 'No active employees found for sample attendance log' }, { status: 404 });
    }

    const today = new Date();
    const baseDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const lines: string[] = [];

    employees.forEach((employee, employeeIndex) => {
      const dates = [formatDate(baseDate), formatDate(addDays(baseDate, 1)), formatDate(addDays(baseDate, 2))];
      const shift = resolveWorkSchedule(employee, dates[0]);
      const startTime = normalizeTime(shift?.start_time, '08:00');
      const endTime = normalizeTime(shift?.end_time, '17:00');
      const otEndTime = addHours(endTime, 2);
      const lateMinutes = employeeIndex % 2 === 0 ? 15 : 5;
      const lateTime = addMinutes(startTime, lateMinutes);

      lines.push(`${employee.employee_id}\t${dates[0]} ${startTime}:00\t0`);
      lines.push(`${employee.employee_id}\t${dates[0]} ${otEndTime}:00\t1`);
      lines.push(`${employee.employee_id}\t${dates[1]} ${lateTime}:00\t0`);
      lines.push(`${employee.employee_id}\t${dates[1]} ${endTime}:00\t1`);
      lines.push(`${employee.employee_id}\t${dates[2]} ${startTime}:00\t0`);
      lines.push(`${employee.employee_id}\t${dates[2]} ${endTime}:00\t1`);
    });

    const content = `${lines.join('\n')}\n`;

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="1_attlog_full_app_test_${formatDate(baseDate)}.dat"`,
      },
    });
  } catch (error) {
    console.error('[HRIS] Generate attendance sample error:', error);
    return NextResponse.json({ error: 'Failed to generate attendance sample file' }, { status: 500 });
  }
}
