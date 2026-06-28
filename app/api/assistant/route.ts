import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, canViewEmployeeData } from '@/lib/auth';
import { canApproveRequest } from '@/lib/approvals/rules';
import {
  AttendanceRepository,
  EmployeeRepository,
  EmployeeShiftRepository,
  IncentiveRequestRepository,
  LeaveRequestRepository,
  LoanExtensionRequestRepository,
  OTRequestRepository,
  PayrollRepository,
  SalaryAdvanceRepository,
  TardinessPointRepository,
  ensureInitialized,
} from '@/lib/db/models';
import { ensureOllamaRunning, getOllamaStatus, OLLAMA_BASE_URL, OLLAMA_MODEL } from '@/lib/assistant/ollama';

export const runtime = 'nodejs';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const MANAGER_ROLES = ['Manager', 'Admin', 'CEO', 'DEV'];
type PendingAction =
  | {
      type: 'create_tardiness_acknowledgements';
      label: string;
      summary: string;
      employeeIds: number[];
    }
  | {
      type: 'approve_request' | 'reject_request';
      label: string;
      summary: string;
      requestType: 'leave' | 'ot' | 'salary_advance' | 'incentive' | 'loan_extension';
      requestId: number;
      remarks?: string;
    };

type ApprovalRequestType = 'leave' | 'ot' | 'salary_advance' | 'incentive' | 'loan_extension';

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start: dateKey(start),
    end: dateKey(end),
  };
}

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((message): message is ChatMessage =>
      message &&
      typeof message === 'object' &&
      (message as ChatMessage).role !== undefined &&
      ['user', 'assistant'].includes((message as ChatMessage).role) &&
      typeof (message as ChatMessage).content === 'string'
    )
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 1200),
    }))
    .slice(-8);
}

function pendingRequestsForUser(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  const repositories = [
    { type: 'Leave', rows: LeaveRequestRepository.findByStatus('Pending') },
    { type: 'Overtime', rows: OTRequestRepository.findByStatus('Pending') },
    { type: 'Salary advance', rows: SalaryAdvanceRepository.findByStatus('Pending') },
    { type: 'Incentive', rows: IncentiveRequestRepository.findByStatus('Pending') },
    { type: 'Loan extension', rows: LoanExtensionRequestRepository.findByStatus('Pending') },
  ];

  return repositories.flatMap(({ type, rows }) =>
    rows
      .filter((request) => {
        const employee = EmployeeRepository.findById(Number(request.employee_id));
        return employee ? canApproveRequest(user, employee) : false;
      })
      .map((request) => ({
        id: request.id,
        type,
        employee_id: request.employee_id,
        employee_name: request.employee_name,
        created_at: request.created_at,
        status: request.status,
      }))
  );
}

function buildAssistantSnapshot(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  const today = dateKey();
  const year = Number(today.slice(0, 4));
  const month = monthRange();
  const employees = EmployeeRepository.findAll(true)
    .filter((employee) =>
      employee.status === 'Active' &&
      employee.employee_id !== 'FAILSAFE001' &&
      canViewEmployeeData(user.role, employee.role)
    );

  const attendanceToday = AttendanceRepository.findAll(today, today)
    .filter((record) => employees.some((employee) => employee.id === record.employee_id));
  const pendingApprovals = pendingRequestsForUser(user);
  const payrollRows = PayrollRepository.findAll();
  const missingSchedules = employees
    .filter((employee) => !EmployeeShiftRepository.findActiveForDate(employee.id, today))
    .map((employee) => ({
      employee_id: employee.id,
      employee_code: employee.employee_id,
      name: employee.name,
      role: employee.role,
      employment_type: employee.employment_type,
    }))
    .slice(0, 15);

  const tardiness = employees
    .map((employee) => {
      const monthRecords = AttendanceRepository.findByEmployeeAndDateRange(employee.id, month.start, month.end);
      const lateRecords = monthRecords.filter((record) => Number(record.late_minutes || 0) > 0);
      return {
        employee_id: employee.id,
        employee_code: employee.employee_id,
        name: employee.name,
        role: employee.role,
        annual_points: TardinessPointRepository.getAnnualPoints(employee.id, year),
        month_late_records: lateRecords.length,
        month_late_minutes: lateRecords.reduce((sum, record) => sum + Number(record.late_minutes || 0), 0),
      };
    })
    .filter((employee) => employee.annual_points > 0 || employee.month_late_records > 0)
    .sort((a, b) => b.annual_points - a.annual_points || b.month_late_minutes - a.month_late_minutes)
    .slice(0, 12);

  return {
    generated_at: new Date().toISOString(),
    current_user: {
      id: user.id,
      name: user.name,
      role: user.role,
    },
    attendance: {
      today,
      visible_active_employees: employees.length,
      present_today: attendanceToday.filter((record) => ['Present', 'Late'].includes(record.status)).length,
      late_today: attendanceToday.filter((record) => record.status === 'Late').length,
      absent_today: attendanceToday.filter((record) => record.status === 'Absent').length,
    },
    tardiness,
    approvals: {
      pending_count: pendingApprovals.length,
      pending_by_type: pendingApprovals.reduce<Record<string, number>>((counts, request) => {
        counts[request.type] = (counts[request.type] || 0) + 1;
        return counts;
      }, {}),
      recent_pending: pendingApprovals.slice(0, 8),
    },
    payroll: {
      total_records: payrollRows.length,
      latest_status: payrollRows[0]?.status ?? null,
      latest_period_start: payrollRows[0]?.period_start ?? null,
      latest_period_end: payrollRows[0]?.period_end ?? null,
      draft_count: payrollRows.filter((row) => row.status === 'Draft').length,
      released_count: payrollRows.filter((row) => row.status === 'Released').length,
      paid_count: payrollRows.filter((row) => row.status === 'Paid').length,
    },
    scheduling: {
      missing_active_schedule_count: missingSchedules.length,
      missing_active_schedules: missingSchedules,
    },
  };
}

function requestTypeFromText(text: string): ApprovalRequestType | null {
  if (text.includes('leave')) return 'leave';
  if (text.includes('overtime') || text.includes(' ot ')) return 'ot';
  if (text.includes('salary advance') || text.includes('advance')) return 'salary_advance';
  if (text.includes('incentive')) return 'incentive';
  if (text.includes('loan extension') || text.includes('extension')) return 'loan_extension';
  return null;
}

function findPendingAction(question: string, snapshot: ReturnType<typeof buildAssistantSnapshot>): PendingAction | null {
  const text = ` ${question.toLowerCase()} `;
  const wantsWarningAction = (
    text.includes(' notify ') ||
    text.includes(' create warning') ||
    text.includes(' send warning') ||
    text.includes(' acknowledge') ||
    text.includes(' acknowledgement')
  ) && (text.includes('late') || text.includes('tardin') || text.includes('point'));

  if (wantsWarningAction) {
    const employees = snapshot.tardiness.filter((employee) => employee.annual_points >= 0.4);
    if (employees.length === 0) return null;
    return {
      type: 'create_tardiness_acknowledgements',
      label: 'Create tardiness warning notifications',
      summary: `Create manager warning notifications and employee acknowledgement prompts for ${employees.length} employee(s) with 0.4+ annual tardiness points.`,
      employeeIds: employees.map((employee) => employee.employee_id),
    };
  }

  const approvalAction = text.includes(' approve ') || text.includes(' reject ');
  if (approvalAction) {
    const requestType = requestTypeFromText(text);
    const requestId = Number(text.match(/#?\s*(\d+)/)?.[1]);
    if (!requestType || !Number.isFinite(requestId)) return null;

    const isReject = text.includes(' reject ');
    return {
      type: isReject ? 'reject_request' : 'approve_request',
      label: `${isReject ? 'Reject' : 'Approve'} request`,
      summary: `${isReject ? 'Reject' : 'Approve'} ${requestType.replace('_', ' ')} request #${requestId}.`,
      requestType,
      requestId,
      remarks: isReject ? 'Rejected through HRIS Assistant confirmation.' : undefined,
    };
  }

  return null;
}

function canAnswerFromSnapshot(question: string) {
  const text = question.toLowerCase();
  return (
    text.includes('late') ||
    text.includes('tardin') ||
    text.includes('point') ||
    text.includes('approval') ||
    text.includes('pending') ||
    text.includes('request') ||
    text.includes('payroll') ||
    text.includes('pay') ||
    text.includes('schedule') ||
    text.includes('shift')
  );
}

function fallbackAnswer(question: string, snapshot: ReturnType<typeof buildAssistantSnapshot>, pendingAction?: PendingAction | null) {
  const text = question.toLowerCase();

  if (pendingAction) {
    return `${pendingAction.summary}\n\nPlease review the confirmation card before I make any change.`;
  }

  if (text.includes('late') || text.includes('tardin') || text.includes('point')) {
    if (snapshot.tardiness.length === 0) {
      return 'I do not see any visible employees with tardiness points or late records in the current month.';
    }
    const rows = snapshot.tardiness
      .slice(0, 5)
      .map((employee) =>
        `${employee.name}: ${employee.annual_points} annual point(s), ${employee.month_late_records} late record(s) this month`
      )
      .join('\n');
    return `Here are the top visible tardiness records:\n${rows}`;
  }

  if (text.includes('approval') || text.includes('pending') || text.includes('request')) {
    const byType = Object.entries(snapshot.approvals.pending_by_type)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
    return snapshot.approvals.pending_count > 0
      ? `You have ${snapshot.approvals.pending_count} pending approval(s). ${byType || 'No type breakdown is available.'}`
      : 'You do not have visible pending approvals right now.';
  }

  if (text.includes('payroll') || text.includes('pay')) {
    return `Payroll has ${snapshot.payroll.total_records} record(s). Latest status: ${snapshot.payroll.latest_status || 'none'}. Draft: ${snapshot.payroll.draft_count}, released: ${snapshot.payroll.released_count}, paid: ${snapshot.payroll.paid_count}.`;
  }

  if (text.includes('schedule') || text.includes('shift')) {
    if (snapshot.scheduling.missing_active_schedule_count === 0) {
      return 'I do not see visible active employees missing an active schedule today.';
    }
    const rows = snapshot.scheduling.missing_active_schedules
      .slice(0, 8)
      .map((employee) => `${employee.name} (${employee.employment_type})`)
      .join('\n');
    return `I found ${snapshot.scheduling.missing_active_schedule_count} visible employee(s) missing an active schedule today:\n${rows}`;
  }

  return 'I can help with HRIS questions about attendance, tardiness points, pending approvals, payroll status, employee records, schedules, imports, and where to do tasks in the dashboard. I can also prepare warning notifications and approve or reject explicit request IDs, but I will ask for confirmation before changing data.';
}

async function askOllama(messages: ChatMessage[], snapshot: ReturnType<typeof buildAssistantSnapshot>) {
  const system = [
    'You are the local HRIS assistant inside this website.',
    'You answer only from the provided HRIS snapshot and the conversation.',
    'Be concise, practical, and clear.',
    'You may explain what action to take in the website, but you cannot claim to have changed data.',
    'For any data-changing task, say you can prepare it and that the manager/admin must use the confirmation card before changes are applied.',
    'Supported confirmed actions include creating tardiness acknowledgement notifications and approving or rejecting explicit pending request IDs.',
    'If the snapshot does not contain enough data, say what is missing.',
  ].join(' ');

  await ensureOllamaRunning();

  const response = await fetch(`${OLLAMA_BASE_URL.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      options: {
        temperature: 0.2,
        num_predict: 500,
      },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Current HRIS snapshot:\n${JSON.stringify(snapshot, null, 2)}` },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}`);
  }

  const data = await response.json() as { message?: { content?: string } };
  const content = data.message?.content?.trim();
  if (!content) throw new Error('Ollama returned an empty response');
  return content;
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!MANAGER_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Assistant is available to managers and admins only' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const messages = normalizeMessages(body.messages);
    const latestQuestion = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    const snapshot = buildAssistantSnapshot(user);
    const pendingAction = findPendingAction(latestQuestion, snapshot);

    if (pendingAction || canAnswerFromSnapshot(latestQuestion)) {
      return NextResponse.json({
        success: true,
        answer: fallbackAnswer(latestQuestion, snapshot, pendingAction),
        provider: 'local-data',
        model: OLLAMA_MODEL,
        pendingAction,
      });
    }

    try {
      const answer = await askOllama(messages, snapshot);
      return NextResponse.json({
        success: true,
        answer: pendingAction
          ? `${answer}\n\nI prepared a confirmation card for this action. Please review it before I change anything.`
          : answer,
        provider: 'ollama',
        model: OLLAMA_MODEL,
        pendingAction,
      });
    } catch (error) {
      console.warn('[HRIS] Local assistant unavailable:', error);
      const status = await getOllamaStatus().catch(() => null);
      const localModelReady = Boolean(status?.running && status.hasModel);
      return NextResponse.json({
        success: true,
        answer: fallbackAnswer(latestQuestion, snapshot, pendingAction),
        provider: localModelReady ? 'local-data' : 'fallback',
        model: localModelReady ? OLLAMA_MODEL : null,
        pendingAction,
        warning: localModelReady
          ? null
          : `Local AI is starting or not connected. Install Ollama and pull the model once with: ollama pull ${OLLAMA_MODEL}`,
      });
    }
  } catch (error) {
    console.error('[HRIS] Assistant error:', error);
    return NextResponse.json({ error: 'Failed to run assistant' }, { status: 500 });
  }
}
