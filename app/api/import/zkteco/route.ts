import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, DepartmentRepository, EmployeeRepository, AttendanceLogRepository, AttendanceRepository } from '@/lib/db/models';
import { parseDepartmentDat, parseUserDat, parseAttendanceLog } from '@/lib/parsers/zkteco';
import bcryptjs from 'bcryptjs';

function applyPunchToDailyAttendance(employeeId: number, timestamp: string) {
  const [date, time] = timestamp.split(' ');
  if (!date || !time) return;

  const existingAttendance = AttendanceRepository.findByEmployeeAndDate(employeeId, date);
  if (!existingAttendance) {
    AttendanceRepository.create({
      employee_id: employeeId,
      date,
      check_in: time,
      check_out: null,
      status: 'Present',
    });
    return;
  }

  const punches = [existingAttendance.check_in, existingAttendance.check_out, time]
    .filter(Boolean)
    .sort();

  AttendanceRepository.update(existingAttendance.id, {
    check_in: punches[0] ?? null,
    check_out: punches.length > 1 ? punches[punches.length - 1] : null,
  });
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const fileType = formData.get('fileType') as string;

    if (!file || !fileType) {
      return NextResponse.json(
        { error: 'File and fileType are required' },
        { status: 400 }
      );
    }

    const content = await file.text();
    let successCount = 0;
    let errorCount = 0;

    if (fileType === 'department') {
      const departments = parseDepartmentDat(content);
      for (const dept of departments) {
        try {
          DepartmentRepository.create({
            name: dept.name,
            code: dept.id,
            description: `Imported from ZKTeco`,
          });
          successCount++;
        } catch (error) {
          console.error('[HRIS] Error importing department:', error);
          errorCount++;
        }
      }
    } else if (fileType === 'employee') {
      const employees = parseUserDat(content);
      for (const emp of employees) {
        try {
          // Generate temporary password
          const tempPassword = `temp_${emp.id}`;
          const passwordHash = await bcryptjs.hash(tempPassword, 10);

          // Create employee
          EmployeeRepository.create({
            employee_id: emp.id,
            name: emp.name,
            email: `${emp.id}@company.local`,
            phone: null,
            picture: null,
            department_id: parseInt(emp.department_id) || null,
            position_id: null,
            area_id: null,
            status: 'Active',
            employment_type: 'Probationary',
            employment_type_effective_date: new Date().toISOString().split('T')[0],
            role: 'Employee',
            password_hash: passwordHash,
            basic_salary: 0,
            hire_date: new Date().toISOString().split('T')[0],
          });
          successCount++;
        } catch (error) {
          console.error('[HRIS] Error importing employee:', error);
          errorCount++;
        }
      }
    } else if (fileType === 'attendance') {
      const logs = parseAttendanceLog(content);
      for (const log of logs) {
        try {
          // Find employee by employee_id
          const employee = EmployeeRepository.findByEmployeeId(log.employee_id);
          if (employee) {
            AttendanceLogRepository.create({
              employee_id: employee.id,
              employee_idno: log.employee_id,
              timestamp: log.timestamp,
              state: log.state,
              device_id: null,
            });
            applyPunchToDailyAttendance(employee.id, log.timestamp);
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error('[HRIS] Error importing attendance log:', error);
          errorCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      successCount,
      errorCount,
      message: `Imported ${successCount} records with ${errorCount} errors`,
    });
  } catch (error) {
    console.error('[HRIS] Import error:', error);
    return NextResponse.json(
      { error: 'Import failed' },
      { status: 500 }
    );
  }
}
