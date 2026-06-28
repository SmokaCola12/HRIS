import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, DepartmentRepository } from '@/lib/db/models';

interface DepartmentRecord {
  code: string;
  name: string;
  description?: string;
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const { records } = await request.json();

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { error: 'No records provided' },
        { status: 400 }
      );
    }

    let imported = 0;
    let updated = 0;
    let errors = 0;

    for (const record of records as DepartmentRecord[]) {
      try {
        // Check if department exists by name or code
        let existingDept = DepartmentRepository.findByName(record.name);

        if (existingDept) {
          // Update existing department
          DepartmentRepository.update(existingDept.id, {
            code: record.code || existingDept.code,
            description: record.description || existingDept.description,
          });
          updated++;
        } else {
          // Create new department
          DepartmentRepository.create({
            name: record.name,
            code: record.code,
            description: record.description || null,
          });
          imported++;
        }
      } catch (err) {
        console.error('[HRIS] Import department error:', err);
        errors++;
      }
    }

    console.log(`[HRIS] Department import: ${imported} new, ${updated} updated, ${errors} errors`);

    return NextResponse.json({
      success: true,
      imported,
      updated,
      errors,
      total: records.length,
    });
  } catch (error) {
    console.error('[HRIS] Department import error:', error);
    return NextResponse.json(
      { error: 'Failed to import department data' },
      { status: 500 }
    );
  }
}
