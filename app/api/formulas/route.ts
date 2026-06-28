import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, FormulaRepository } from '@/lib/db/models';

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let formulas = FormulaRepository.findAll();
    if (category) {
      formulas = formulas.filter(f => f.category === category);
    }

    return NextResponse.json({
      success: true,
      formulas,
    });
  } catch (error) {
    console.error('[HRIS] Get formulas error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve formulas' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    ensureInitialized();
    const body = await request.json();

    const { id, value, description } = body;

    if (!id || value === undefined) {
      return NextResponse.json(
        { error: 'ID and value are required' },
        { status: 400 }
      );
    }

    const formula = FormulaRepository.findById(id);
    if (!formula) {
      return NextResponse.json(
        { error: 'Formula not found' },
        { status: 404 }
      );
    }

    const updated = FormulaRepository.update(id, {
      value: String(value),
      description: description !== undefined ? description : formula.description,
    });

    return NextResponse.json({
      success: true,
      formula: updated,
    });
  } catch (error) {
    console.error('[HRIS] Update formula error:', error);
    return NextResponse.json(
      { error: 'Failed to update formula' },
      { status: 500 }
    );
  }
}
