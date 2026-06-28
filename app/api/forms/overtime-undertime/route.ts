import { NextRequest, NextResponse } from 'next/server';
import {
  AttendanceRepository,
  EmployeeRepository,
  OTRequestRepository,
  SalaryGradeRepository,
  ensureInitialized,
} from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth';

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function checkbox(checked: boolean) {
  return checked ? '&#9745;' : '&#9744;';
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const otRequest = body.ot_request_id ? OTRequestRepository.findById(Number(body.ot_request_id)) : null;
    if (otRequest && otRequest.employee_id !== user.id && !['Manager', 'Admin', 'CEO', 'DEV'].includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const employee = EmployeeRepository.findById(otRequest?.employee_id ?? user.id);
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const attendance = body.attendance_id
      ? AttendanceRepository.findAll().find((record) => record.id === Number(body.attendance_id))
      : otRequest
        ? AttendanceRepository.findByEmployeeAndDate(employee.id, otRequest.ot_date)
        : null;
    const grade = employee.salary_grade_id ? SalaryGradeRepository.findById(employee.salary_grade_id) : null;
    const hourly = Number(grade?.frequency === 'hourly' ? grade.amount : 0);
    const hours = Number(otRequest?.hours ?? body.hours ?? 0);
    const totalAmount = hourly > 0 && hours > 0 ? hourly * hours : '';
    const requestType = String(body.request_type || 'Overtime');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>OT/UT Form</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; padding: 24px; }
    .page { max-width: 820px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 18px; }
    .title { font-size: 18px; font-weight: 700; margin-top: 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
    .line { border-bottom: 1px solid #111; min-height: 20px; padding: 2px 4px; }
    .label { font-size: 12px; font-weight: 700; margin-bottom: 3px; }
    .section { margin-top: 16px; }
    .box { border: 1px solid #111; min-height: 82px; padding: 8px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 38px; }
    .sig { border-top: 1px solid #111; text-align: center; padding-top: 6px; font-size: 12px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div><strong>D' NORTH RIVERSIDE RESORT AND WATERPARK CORP.</strong></div>
      <div class="title">UNDERTIME / OVERTIME FORM</div>
    </div>
    <div class="grid">
      <div><div class="label">No.</div><div class="line">${escapeHtml(body.form_no || otRequest?.id || '')}</div></div>
      <div><div class="label">Date</div><div class="line">${escapeHtml(otRequest?.ot_date || attendance?.date || body.date || '')}</div></div>
      <div><div class="label">Name</div><div class="line">${escapeHtml(employee.name)}</div></div>
      <div><div class="label">Overtime / Undertime</div><div class="line">${checkbox(requestType === 'Overtime')} Overtime&nbsp;&nbsp; ${checkbox(requestType === 'Undertime')} Undertime</div></div>
      <div><div class="label">Work Started</div><div class="line">${escapeHtml(otRequest?.start_time || attendance?.check_in || body.work_started || '')}</div></div>
      <div><div class="label">Work Ended</div><div class="line">${escapeHtml(otRequest?.end_time || attendance?.check_out || body.work_ended || '')}</div></div>
      <div><div class="label">Total Hours and Minutes Worked</div><div class="line">${escapeHtml(hours ? `${hours} hour(s)` : body.total_worked || '')}</div></div>
      <div><div class="label">Total Salary Amount</div><div class="line">${escapeHtml(totalAmount === '' ? body.total_salary_amount || '' : totalAmount.toFixed(2))}</div></div>
    </div>
    <div class="section">
      <div class="label">Reason for Undertime/Overtime</div>
      <div class="box">${escapeHtml(otRequest?.reason || body.reason || '')}</div>
    </div>
    <div class="signatures">
      <div class="sig">Noted by</div>
      <div class="sig">Approved by</div>
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="ot-ut-form-${employee.employee_id}.html"`,
      },
    });
  } catch (error) {
    console.error('[HRIS] OT/UT form error:', error);
    return NextResponse.json({ error: 'Failed to generate OT/UT form' }, { status: 500 });
  }
}

