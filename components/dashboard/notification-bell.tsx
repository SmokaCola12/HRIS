'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, Bell, Check, CheckCheck, ClipboardList, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

type AttendanceNotification = {
  id: number;
  employee_id: number | null;
  employee_name?: string | null;
  type: string;
  message: string;
  target_url?: string | null;
  request_type?: string | null;
  request_id?: number | null;
  is_read: boolean | number;
  created_at: string;
};

type NotificationsResponse = {
  success: boolean;
  count: number;
  notifications: AttendanceNotification[];
};

const fetcher = async (url: string): Promise<NotificationsResponse> => {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to load notifications');
  return response.json();
};

function formatNotificationTime(value: string) {
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return format(date, 'MMM d, h:mm a');
}

function getNotificationTitle(notification: AttendanceNotification) {
  if (notification.type.startsWith('approval_')) return 'Approval request';
  if (notification.type === 'tardiness_warning' || notification.type === 'tardiness_0.4') return 'Tardiness warning';
  return 'Notification';
}

function getNotificationBadge(notification: AttendanceNotification) {
  if (notification.type.startsWith('approval_')) return 'Approval';
  if (notification.type === 'tardiness_warning' || notification.type === 'tardiness_0.4') return '0.4+ pts';
  return 'Unread';
}

function getNotificationLink(notification: AttendanceNotification) {
  if (notification.target_url) {
    return {
      href: notification.target_url,
      label: notification.type.startsWith('approval_') ? 'Open approvals' : 'Open',
    };
  }

  if (notification.employee_id) {
    return {
      href: `/dashboard/employees/${notification.employee_id}`,
      label: 'Review employee',
    };
  }

  return null;
}

export function NotificationBell() {
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const [isClearingAll, setIsClearingAll] = useState(false);
  const { data, isLoading, mutate } = useSWR('/api/notifications', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.count ?? notifications.length;

  const updateOptimistically = (nextNotifications: AttendanceNotification[]) => {
    return mutate(
      {
        success: true,
        count: nextNotifications.length,
        notifications: nextNotifications,
      },
      { revalidate: false },
    );
  };

  const markRead = async (id: number) => {
    const previous = data;
    setPendingIds((current) => new Set(current).add(id));
    await updateOptimistically(notifications.filter((notification) => notification.id !== id));

    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id }),
      });

      if (!response.ok) throw new Error('Failed to mark notification read');
      await mutate();
    } catch {
      await mutate(previous, { revalidate: false });
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const markAllRead = async () => {
    const previous = data;
    setIsClearingAll(true);
    await updateOptimistically([]);

    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ markAll: true }),
      });

      if (!response.ok) throw new Error('Failed to mark notifications read');
      await mutate();
    } catch {
      await mutate(previous, { revalidate: false });
    } finally {
      setIsClearingAll(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative text-muted-foreground"
          aria-label={`${unreadCount} unread notifications`}
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex h-[min(32rem,calc(100vh-5rem))] w-[min(calc(100vw-2rem),26rem)] flex-col overflow-hidden p-0">
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Notifications</h2>
            <p className="text-xs text-muted-foreground">
              {unreadCount === 1 ? '1 unread item' : `${unreadCount} unread items`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={unreadCount === 0 || isClearingAll}
            onClick={markAllRead}
          >
            {isClearingAll ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Mark all read
          </Button>
        </div>
        <Separator />
        <ScrollArea className="min-h-0 flex-1">
          {isLoading ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading alerts...
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <CheckCheck className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">No unread notifications</p>
              <p className="mt-1 text-xs text-muted-foreground">
                New approval requests and attendance alerts will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const isPending = pendingIds.has(notification.id);
                const isApproval = notification.type.startsWith('approval_');
                const actionLink = getNotificationLink(notification);

                return (
                  <div key={notification.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className={isApproval
                        ? 'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'
                        : 'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive'}
                      >
                        {isApproval ? (
                          <ClipboardList className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{getNotificationTitle(notification)}</p>
                          <Badge variant="outline" className="text-[10px]">
                            {getNotificationBadge(notification)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">
                          {notification.message}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {actionLink && (
                            <Button asChild variant="secondary" size="sm" className="h-8 px-2 text-xs">
                              <Link href={actionLink.href}>{actionLink.label}</Link>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            disabled={isPending}
                            onClick={() => markRead(notification.id)}
                          >
                            {isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Mark read
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            {formatNotificationTime(notification.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
