'use client';

import { useRequireAuth } from '@/lib/auth/auth-context';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { EmployeeTardinessModal } from '@/components/dashboard/employee-tardiness-modal';
import { AssistantWidget } from '@/components/dashboard/assistant-widget';
import { NotificationBell } from '@/components/dashboard/notification-bell';
import { Spinner } from '@/components/ui/spinner';
import { ErrorBoundary } from '@/components/error-boundary';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useRequireAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Spinner className="h-8 w-8 mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        {['Manager', 'Admin', 'CEO', 'DEV'].includes(user.role) && (
          <div className="sticky top-0 z-20 flex justify-end border-b bg-background/95 px-6 py-2 backdrop-blur">
            <NotificationBell />
          </div>
        )}
        <EmployeeTardinessModal />
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <AssistantWidget />
      </main>
    </div>
  );
}
