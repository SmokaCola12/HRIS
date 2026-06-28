import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db/database';
import { ensureInitialized } from '@/lib/db/models';
import { createToken, verifyPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    const trimmedUsername = username?.trim().toLowerCase();

    if (!trimmedUsername || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    ensureInitialized();

    // Get database connection
    const db = getConnection();

    // Query accounts table for credentials
    const account = db.prepare(`
      SELECT a.id, a.employee_id, a.username, a.password_hash, a.is_active,
             e.id as emp_id, e.employee_id as emp_code, e.name, e.email, e.role,
             e.department_id, e.position_id, e.picture, e.status
      FROM accounts a
      JOIN employees e ON a.employee_id = e.id
      WHERE LOWER(a.username) = LOWER(?)
    `).get(trimmedUsername) as any;

    if (!account) {
      console.log(`[HRIS-Auth] Login attempt with non-existent username: ${trimmedUsername}`);
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    if (!account.is_active) {
      console.log(`[HRIS-Auth] Login attempt on inactive account: ${trimmedUsername}`);
      return NextResponse.json(
        { error: 'Account is not active' },
        { status: 401 }
      );
    }

    if (account.status !== 'Active') {
      console.log(`[HRIS-Auth] Login attempt on inactive employee: ${trimmedUsername}`);
      return NextResponse.json(
        { error: 'Employee account is not active' },
        { status: 401 }
      );
    }

    // Verify password
    let isValidPassword = false;
    if (account.password_hash) {
      try {
        isValidPassword = await verifyPassword(password, account.password_hash);
      } catch (error) {
        console.error('[HRIS-Auth] Password verification error:', error);
        isValidPassword = false;
      }
    }

    if (!isValidPassword) {
      console.log(`[HRIS-Auth] Invalid password for username: ${trimmedUsername}`);
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Update last login timestamp
    db.prepare("UPDATE accounts SET last_login = datetime('now') WHERE id = ?").run(account.id);

    const user = {
      id: account.emp_id,
      employeeId: account.emp_code,
      name: account.name,
      username: account.username,
      email: account.email,
      role: account.role,
      departmentId: account.department_id,
      positionId: account.position_id,
      picture: account.picture,
    };

    const token = createToken(user);

    const response = NextResponse.json({
      success: true,
      user,
    });

    response.cookies.set('hris_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    console.log(`[HRIS-Auth] Successful login for user: ${account.username}`);
    return response;
  } catch (error) {
    console.error('[HRIS-Auth] Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
