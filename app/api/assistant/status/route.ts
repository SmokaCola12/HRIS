import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureInitialized } from '@/lib/db/models';
import { getOllamaStatus } from '@/lib/assistant/ollama';

export const runtime = 'nodejs';

const ASSISTANT_ROLES = ['Manager', 'Admin', 'CEO', 'DEV'];

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ASSISTANT_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Assistant is available to managers and admins only' }, { status: 403 });
    }

    const status = await getOllamaStatus();
    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (error) {
    console.error('[HRIS] Assistant status error:', error);
    return NextResponse.json({ error: 'Failed to check assistant status' }, { status: 500 });
  }
}
