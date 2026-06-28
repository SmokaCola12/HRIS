import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureInitialized, PayrollRepository } from '@/lib/db/models';

export async function PATCH(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(_request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    const payroll = PayrollRepository.findById(Number(id));
    if (!payroll) return NextResponse.json({ error: 'Payslip not found' }, { status: 404 });
    if (payroll.employee_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (payroll.status !== 'Paid') {
      return NextResponse.json({ error: 'Only paid payslips can be claimed' }, { status: 400 });
    }

    const updated = payroll.claimed_at
      ? payroll
      : PayrollRepository.update(payroll.id, { claimed_at: new Date().toISOString() });

    return NextResponse.json({
      success: true,
      payslip: updated,
    });
  } catch (error) {
    console.error('[HRIS] Payslip claim error:', error);
    return NextResponse.json({ error: 'Failed to confirm receipt' }, { status: 500 });
  }
}

