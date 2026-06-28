import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, SalaryGradeRepository } from '@/lib/db/models';

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const grades = SalaryGradeRepository.findAll();

    return NextResponse.json({
      success: true,
      grades,
    });
  } catch (error) {
    console.error('[HRIS] Get salary grades error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve salary grades' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const body = await request.json();

    const { grade_name, amount, frequency, description } = body;

    if (!grade_name || amount === undefined || !frequency) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const newGrade = SalaryGradeRepository.create({
      grade_name,
      amount: parseFloat(amount),
      frequency,
      description: description || null,
    });

    return NextResponse.json({
      success: true,
      grade: newGrade,
    });
  } catch (error) {
    console.error('[HRIS] Create salary grade error:', error);
    return NextResponse.json(
      { error: 'Failed to create salary grade' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    ensureInitialized();
    const body = await request.json();

    const { id, grade_name, amount, frequency, description } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    const updated = SalaryGradeRepository.update(id, {
      grade_name: grade_name || undefined,
      amount: amount !== undefined ? parseFloat(amount) : undefined,
      frequency: frequency || undefined,
      description: description !== undefined ? description : undefined,
    });

    if (!updated) {
      return NextResponse.json(
        { error: 'Salary grade not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      grade: updated,
    });
  } catch (error) {
    console.error('[HRIS] Update salary grade error:', error);
    return NextResponse.json(
      { error: 'Failed to update salary grade' },
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

    const deleted = SalaryGradeRepository.delete(parseInt(id));

    if (!deleted) {
      return NextResponse.json(
        { error: 'Salary grade not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('[HRIS] Delete salary grade error:', error);
    return NextResponse.json(
      { error: 'Failed to delete salary grade' },
      { status: 500 }
    );
  }
}
