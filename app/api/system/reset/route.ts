import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureInitialized } from '@/lib/db/models';
import { nuclearReset } from '@/lib/db/database';
import { seedF1Demo } from '@/lib/db/demo-seed';

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'DEV') {
      return NextResponse.json({ error: 'Only DEV users can reset and seed the demo database' }, { status: 403 });
    }

    nuclearReset();
    const seed = await seedF1Demo();

    console.log('[HRIS] System reset completed with F1 demo seed');

    return NextResponse.json({
      success: true,
      message: 'System reset complete. F1 demo data has been seeded.',
      failsafeUsername: 'failsafe',
      ...seed,
    });
  } catch (error) {
    console.error('[HRIS] Reset error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reset system' },
      { status: 500 }
    );
  }
}
