'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type EmployeeNotification = {
  id: number;
  type: string;
  message: string;
  created_at: string;
};

type EmployeeNotificationsResponse = {
  success: boolean;
  count: number;
  notifications: EmployeeNotification[];
};

const fetcher = async (url: string): Promise<EmployeeNotificationsResponse> => {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to load employee alerts');
  return response.json();
};

export function EmployeeTardinessModal() {
  const [isConfirming, setIsConfirming] = useState(false);
  const { data, mutate } = useSWR('/api/notifications?scope=employee', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });

  const alert = data?.notifications[0];
  const isOpen = Boolean(alert);

  const confirmInformed = async () => {
    if (!alert) return;

    const previous = data;
    setIsConfirming(true);
    await mutate(
      {
        success: true,
        count: Math.max(0, (data?.count ?? 1) - 1),
        notifications: (data?.notifications ?? []).filter((notification) => notification.id !== alert.id),
      },
      { revalidate: false },
    );

    try {
      const response = await fetch('/api/notifications?scope=employee', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: alert.id }),
      });

      if (!response.ok) throw new Error('Failed to confirm tardiness alert');
      await mutate();
    } catch {
      await mutate(previous, { revalidate: false });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog open={isOpen}>
      <DialogContent showCloseButton={false} className="flex max-h-[min(90vh,32rem)] flex-col overflow-hidden sm:max-w-md">
        <DialogHeader className="shrink-0">
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle>Tardiness warning</DialogTitle>
          <DialogDescription>
            HR has recorded a tardiness warning that needs your acknowledgement.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1 rounded-md border bg-muted/30">
          <div className="p-3 text-sm leading-6">
            {alert?.message}
          </div>
        </ScrollArea>
        <DialogFooter className="shrink-0">
          <Button onClick={confirmInformed} disabled={isConfirming} className="w-full sm:w-auto">
            {isConfirming && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            I have been informed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
