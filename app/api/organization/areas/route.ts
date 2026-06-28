import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, AreaRepository } from '@/lib/db/models';

export async function GET() {
  try {
    ensureInitialized();
    const areas = AreaRepository.findAll();
    return NextResponse.json({ areas });
  } catch (error) {
    console.error('[HRIS] Areas fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch areas' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const body = await request.json();
    
    const area = AreaRepository.create({
      name: body.name,
      code: body.code || null,
      description: body.description || null,
    });

    return NextResponse.json({ area });
  } catch (error) {
    console.error('[HRIS] Area create error:', error);
    return NextResponse.json(
      { error: 'Failed to create area' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    ensureInitialized();
    const body = await request.json();
    
    const area = AreaRepository.update(body.id, {
      name: body.name,
      code: body.code || null,
      description: body.description || null,
    });

    if (!area) {
      return NextResponse.json(
        { error: 'Area not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ area });
  } catch (error) {
    console.error('[HRIS] Area update error:', error);
    return NextResponse.json(
      { error: 'Failed to update area' },
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

    const success = AreaRepository.delete(parseInt(id));

    if (!success) {
      return NextResponse.json(
        { error: 'Area not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[HRIS] Area delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete area' },
      { status: 500 }
    );
  }
}
