import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureInitialized, NotificationRepository } from '@/lib/db/models';

function canViewNotifications(role: string) {
  return ['Manager', 'Admin', 'CEO', 'DEV'].includes(role);
}

function isEmployeeScope(request: NextRequest) {
  return new URL(request.url).searchParams.get('scope') === 'employee';
}

export async function GET(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (isEmployeeScope(request)) {
      const notifications = NotificationRepository.findUnreadForEmployee(user.id);
      return NextResponse.json({
        success: true,
        count: notifications.length,
        notifications,
      });
    }

    if (!canViewNotifications(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const notifications = NotificationRepository.findUnreadManager();
    return NextResponse.json({
      success: true,
      count: notifications.length,
      notifications,
    });
  } catch (error) {
    console.error('[HRIS] Notifications fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    ensureInitialized();
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const employeeScope = isEmployeeScope(request);
    if (!canViewNotifications(user.role)) {
      if (!employeeScope) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
    }

    if (employeeScope) {
      const { id, markAll } = await request.json();
      if (markAll) {
        return NextResponse.json({
          success: true,
          updated: NotificationRepository.markAllEmployeeRead(user.id).changes,
        });
      }

      if (!id) {
        return NextResponse.json({ error: 'Notification ID is required' }, { status: 400 });
      }

      const notification = NotificationRepository.markEmployeeRead(Number(id), user.id);
      if (!notification || !notification.is_read) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        notification,
      });
    }

    if (!canViewNotifications(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id, markAll } = await request.json();
    if (markAll) {
      return NextResponse.json({
        success: true,
        updated: NotificationRepository.markAllManagerRead().changes,
      });
    }

    if (!id) {
      return NextResponse.json({ error: 'Notification ID is required' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      notification: NotificationRepository.markRead(Number(id)),
    });
  } catch (error) {
    console.error('[HRIS] Notification update error:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}
