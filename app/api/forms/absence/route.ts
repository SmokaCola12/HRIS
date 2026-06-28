import { NextRequest, NextResponse } from 'next/server';
import {
  EmployeeRepository,
  LeaveRequestRepository,
  PositionRepository,
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

function mdY(date?: string | null) {
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return `${parsed.getMonth() + 1}/${parsed.getDate()}/${parsed.getFullYear()}`;
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
    const leaveRequest = body.leave_request_id ? LeaveRequestRepository.findById(Number(body.leave_request_id)) : null;
    if (leaveRequest && leaveRequest.employee_id !== user.id && !['Manager', 'Admin', 'CEO', 'DEV'].includes(user.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const employee = EmployeeRepository.findById(leaveRequest?.employee_id ?? user.id);
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const position = employee.position_id ? PositionRepository.findById(employee.position_id) : null;
    const grade = employee.salary_grade_id ? SalaryGradeRepository.findById(employee.salary_grade_id) : null;
    const leaveType = String(leaveRequest?.leave_type ?? body.leave_type ?? '');
    const reasons = [
      { label: 'Special Incentive Leave', value: 'Service Incentive Leave' },
      { label: 'Maternity Leave', value: 'Maternity Leave' },
      { label: 'Paternity Leave', value: 'Paternity Leave' },
      { label: 'Parental Leave', value: 'Parental Leave' },
      { label: 'Leave for VAWC', value: 'Leave for VAWC' },
      { label: 'Special Leave for Women', value: 'Special Leave for Women' },
      { label: 'Sickness/Personal Illness', value: 'Sickness/Personal Illness' },
      { label: "Child's Illness", value: "Child's Illness" },
      { label: 'Medical Appointment', value: 'Medical Appointment' },
      { label: 'Accident/Emergency', value: 'Accident/Emergency' },
      { label: 'Inclement Weather', value: 'Inclement Weather' },
      { label: 'Jury/Court', value: 'Jury/Court' },
      { label: 'Transportation', value: 'Transportation' },
      { label: 'Death of Loved One', value: 'Death of Loved One' },
    ];
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Absence Record Form</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; padding: 24px; }
    .page { max-width: 820px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 18px; }
    .title { font-size: 18px; font-weight: 700; margin-top: 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
    .line { border-bottom: 1px solid #111; min-height: 20px; padding: 2px 4px; }
    .label { font-size: 12px; font-weight: 700; margin-bottom: 3px; }
    .section { margin-top: 16px; }
    .options { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; font-size: 13px; }
    .box { border: 1px solid #111; min-height: 70px; padding: 8px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 38px; }
    .sig { border-top: 1px solid #111; text-align: center; padding-top: 6px; font-size: 12px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div><strong>D' NORTH RIVERSIDE RESORT AND WATERPARK CORP.</strong></div>
      <div class="title">ABSENCE RECORD FORM</div>
    </div>
    <div class="grid">
      <div><div class="label">Name of Employee</div><div class="line">${escapeHtml(employee.name)}</div></div>
      <div><div class="label">Position of Employee</div><div class="line">${escapeHtml(position?.name || '')}</div></div>
      <div><div class="label">Salary of Employee</div><div class="line">${escapeHtml(grade?.amount ?? employee.basic_salary ?? '')}</div></div>
      <div><div class="label">Date (M/D/Y)</div><div class="line">${escapeHtml(mdY(body.date || leaveRequest?.created_at?.slice(0, 10)))}</div></div>
    </div>
    <div class="section">
      <div class="label">Reason Category</div>
      <div class="options">
        ${reasons.map((reason) => `<div>${checkbox(leaveType === reason.value)} ${escapeHtml(reason.label)}</div>`).join('')}
        <div>${checkbox(Boolean(body.other_reason))} If others, please specify: ${escapeHtml(body.other_reason)}</div>
      </div>
    </div>
    <div class="section grid">
      <div><div class="label">Date(s) of Absence</div><div class="line">${escapeHtml(`${mdY(leaveRequest?.start_date || body.start_date)}${(leaveRequest?.end_date || body.end_date) && (leaveRequest?.end_date || body.end_date) !== (leaveRequest?.start_date || body.start_date) ? ` - ${mdY(leaveRequest?.end_date || body.end_date)}` : ''}`)}</div></div>
      <div><div class="label">Paid Leave/Absence vs. Unpaid Absence</div><div class="line">${checkbox(leaveType !== 'Unpaid')} Paid Leave/Absence&nbsp;&nbsp; ${checkbox(leaveType === 'Unpaid')} Unpaid Absence</div></div>
    </div>
    <div class="section">
      <div class="label">Brief Explanation</div>
      <div class="box">${escapeHtml(leaveRequest?.reason || body.explanation || '')}</div>
    </div>
    <div class="signatures">
      <div class="sig">Approved by (Resort Manager/CEO)</div>
      <div class="sig">Noted by (Officer-in-Charge)</div>
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="absence-form-${employee.employee_id}.html"`,
      },
    });
  } catch (error) {
    console.error('[HRIS] Absence form error:', error);
    return NextResponse.json({ error: 'Failed to generate absence form' }, { status: 500 });
  }
}
