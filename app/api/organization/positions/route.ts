import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, PositionRepository } from '@/lib/db/models';

export async function GET() {
  try {
    ensureInitialized();
    const positions = PositionRepository.findAll();
    return NextResponse.json({ positions });
  } catch (error) {
    console.error('[HRIS] Positions fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const body = await request.json();
    
    const position = PositionRepository.create({
      name: body.name,
      code: body.code || null,
      department_id: body.department_id ? parseInt(body.department_id) : null,
      description: body.description || null,
    });

    return NextResponse.json({ position });
  } catch (error) {
    console.error('[HRIS] Position create error:', error);
    return NextResponse.json(
      { error: 'Failed to create position' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    ensureInitialized();
    const body = await request.json();
    
    const position = PositionRepository.update(body.id, {
      name: body.name,
      code: body.code || null,
      department_id: body.department_id ? parseInt(body.department_id) : null,
      description: body.description || null,
    });

    if (!position) {
      return NextResponse.json(
        { error: 'Position not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ position });
  } catch (error) {
    console.error('[HRIS] Position update error:', error);
    return NextResponse.json(
      { error: 'Failed to update position' },
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

    const success = PositionRepository.delete(parseInt(id));

    if (!success) {
      return NextResponse.json(
        { error: 'Position not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[HRIS] Position delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete position' },
      { status: 500 }
    );
  }
}
