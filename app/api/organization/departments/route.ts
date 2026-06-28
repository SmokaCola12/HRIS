import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, DepartmentRepository } from '@/lib/db/models';

export async function GET() {
  try {
    ensureInitialized();
    const departments = DepartmentRepository.findAll();
    return NextResponse.json({ departments });
  } catch (error) {
    console.error('[HRIS] Departments fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch departments' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const body = await request.json();
    
    const department = DepartmentRepository.create({
      name: body.name,
      code: body.code || null,
      description: body.description || null,
    });

    return NextResponse.json({ department });
  } catch (error) {
    console.error('[HRIS] Department create error:', error);
    return NextResponse.json(
      { error: 'Failed to create department' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    ensureInitialized();
    const body = await request.json();
    
    const department = DepartmentRepository.update(body.id, {
      name: body.name,
      code: body.code || null,
      description: body.description || null,
    });

    if (!department) {
      return NextResponse.json(
        { error: 'Department not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ department });
  } catch (error) {
    console.error('[HRIS] Department update error:', error);
    return NextResponse.json(
      { error: 'Failed to update department' },
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

    const success = DepartmentRepository.delete(parseInt(id));

    if (!success) {
      return NextResponse.json(
        { error: 'Department not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[HRIS] Department delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete department' },
      { status: 500 }
    );
  }
}
