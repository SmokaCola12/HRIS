import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, HolidayRepository } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth';

function canManage(role: string) {
  return ['Admin', 'CEO', 'DEV'].includes(role);
}

export async function GET() {
  try {
    ensureInitialized();
    return NextResponse.json({
      success: true,
      holidays: HolidayRepository.findAll(),
    });
  } catch (error) {
    console.error('[HRIS] Get holidays error:', error);
    return NextResponse.json({ error: 'Failed to retrieve holidays' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user || !canManage(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    if (!body.name || !body.date) {
      return NextResponse.json({ error: 'Holiday name and date are required' }, { status: 400 });
    }
    if (body.observance_type && !['Fixed', 'Movable'].includes(body.observance_type)) {
      return NextResponse.json({ error: 'Invalid observance type' }, { status: 400 });
    }
    const holiday = HolidayRepository.create({
      name: body.name,
      date: body.date,
      type: body.type || 'Regular',
      observance_type: body.observance_type || 'Fixed',
      pay_multiplier: Number(body.pay_multiplier ?? body.multiplier ?? 2),
    });

    return NextResponse.json({ success: true, holiday });
  } catch (error) {
    console.error('[HRIS] Create holiday error:', error);
    return NextResponse.json({ error: 'Failed to create holiday' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user || !canManage(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    if (body.observance_type && !['Fixed', 'Movable'].includes(body.observance_type)) {
      return NextResponse.json({ error: 'Invalid observance type' }, { status: 400 });
    }

    const holiday = HolidayRepository.update(Number(body.id), {
      name: body.name,
      date: body.date,
      type: body.type,
      observance_type: body.observance_type,
      pay_multiplier: body.pay_multiplier !== undefined || body.multiplier !== undefined
        ? Number(body.pay_multiplier ?? body.multiplier)
        : undefined,
    });

    if (!holiday) return NextResponse.json({ error: 'Holiday not found' }, { status: 404 });
    return NextResponse.json({ success: true, holiday });
  } catch (error) {
    console.error('[HRIS] Update holiday error:', error);
    return NextResponse.json({ error: 'Failed to update holiday' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user || !canManage(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    HolidayRepository.delete(Number(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[HRIS] Delete holiday error:', error);
    return NextResponse.json({ error: 'Failed to delete holiday' }, { status: 500 });
  }
}
