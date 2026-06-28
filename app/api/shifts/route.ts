import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, ShiftRepository } from '@/lib/db/models';

function serializeShift(shift: any) {
  return {
    ...shift,
    startTime: shift.start_time,
    endTime: shift.end_time,
    breakMinutes: shift.break_minutes,
    isNightShift: Boolean(shift.is_night_shift),
    isActive: Boolean(shift.is_active),
  };
}

export async function GET() {
  try {
    ensureInitialized();
    const shifts = ShiftRepository.findAll(true).map(serializeShift);
    return NextResponse.json({ shifts });
  } catch (error) {
    console.error('[HRIS] Shifts fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shifts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const body = await request.json();

    if (!body.name || !body.startTime || !body.endTime) {
      return NextResponse.json(
        { error: 'Name, start time, and end time are required' },
        { status: 400 }
      );
    }

    const shift = ShiftRepository.create({
      name: body.name,
      code: body.code || null,
      start_time: body.startTime,
      end_time: body.endTime,
      break_minutes: Number(body.breakMinutes ?? 60),
      is_night_shift: Boolean(body.isNightShift),
    });

    return NextResponse.json({ shift: serializeShift(shift) });
  } catch (error) {
    console.error('[HRIS] Shift create error:', error);
    return NextResponse.json(
      { error: 'Failed to create shift' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    ensureInitialized();
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    const existingShift = ShiftRepository.findById(Number(body.id));
    if (!existingShift) {
      return NextResponse.json(
        { error: 'Shift not found' },
        { status: 404 }
      );
    }

    const nextName = body.name !== undefined ? String(body.name).trim() : existingShift.name;
    const nextCode = body.code !== undefined ? String(body.code || '').trim() : existingShift.code;
    const nextStartTime = body.startTime !== undefined ? String(body.startTime).slice(0, 5) : existingShift.start_time;
    const nextEndTime = body.endTime !== undefined ? String(body.endTime).slice(0, 5) : existingShift.end_time;
    const nextBreakMinutes = body.breakMinutes !== undefined ? Number(body.breakMinutes) : Number(existingShift.break_minutes || 0);

    if (!nextName || !nextStartTime || !nextEndTime) {
      return NextResponse.json(
        { error: 'Name, start time, and end time are required' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(nextBreakMinutes) || nextBreakMinutes < 0 || nextBreakMinutes > 180) {
      return NextResponse.json(
        { error: 'Break duration must be between 0 and 180 minutes' },
        { status: 400 }
      );
    }

    const shift = ShiftRepository.update(Number(body.id), {
      name: nextName,
      code: nextCode || null,
      start_time: nextStartTime,
      end_time: nextEndTime,
      break_minutes: nextBreakMinutes,
      is_night_shift: body.isNightShift === undefined ? existingShift.is_night_shift : Boolean(body.isNightShift),
      is_active: body.isActive === undefined ? existingShift.is_active : Boolean(body.isActive),
    });

    return NextResponse.json({ shift: serializeShift(shift) });
  } catch (error) {
    console.error('[HRIS] Shift update error:', error);
    return NextResponse.json(
      { error: 'Failed to update shift' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    ensureInitialized();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    const result = ShiftRepository.delete(Number(id));

    if (!result.changes) {
      return NextResponse.json(
        { error: 'Shift not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[HRIS] Shift delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete shift' },
      { status: 500 }
    );
  }
}
