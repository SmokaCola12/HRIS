'use client';

import useSWR from 'swr';
import { useAuth } from '@/lib/auth/auth-context';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  FileText,
  Upload,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

type DashboardData = {
  initialized: boolean;
  user: {
    todayStatus: string | null;
    monthAttendanceRecords: number;
    monthLateRecords: number;
    monthLateMinutes: number;
  };
  manager: {
    activeEmployees: number;
    presentToday: number;
    lateToday: number;
    onLeaveToday: number;
    pendingApprovals: number;
    payrollStatus: string | null;
  } | null;
  recentAttendance: Array<{
    id: number;
    employee_name?: string | null;
    date: string;
    status: string;
    late_minutes?: number;
  }>;
};

const fetcher = async (url: string): Promise<DashboardData> => {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to load dashboard');
  return response.json();
};

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: typeof Clock;
  accent?: string;
}) {
  return (
    <Card className={accent ? `border-l-4 ${accent}` : undefined}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { data, isLoading } = useSWR('/api/dashboard', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });

  if (!user) return null;

  const isManager = ['Manager', 'Admin', 'CEO', 'DEV'].includes(user.role);

  if (!isLoading && data && !data.initialized) {
    return (
      <div className="flex h-full flex-col">
        <DashboardHeader
          title="System Initialization"
          description="Welcome to HRIS v.0. The system is ready for data import."
        />

        <div className="flex-1 space-y-6 overflow-auto p-6">
          <Alert className="border-blue-200 bg-blue-50">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900">
              No employee or attendance data has been imported yet. Import ZKTeco files to populate the dashboard.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Quick Start: Import ZKTeco Data
              </CardTitle>
              <CardDescription>
                Import department.dat first, then user.dat, then attendance logs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => router.push('/dashboard/import')} className="w-full sm:w-auto">
                <Upload className="h-4 w-4" />
                Go to Data Import
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const todayStatus = data?.user.todayStatus ?? 'No punch yet';
  const monthRecords = data?.user.monthAttendanceRecords ?? 0;
  const manager = data?.manager;

  return (
    <div className="flex h-full flex-col">
      <DashboardHeader
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        description="Here is an overview of your HRIS dashboard"
      />

      <div className="flex-1 space-y-6 overflow-auto p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Today's Status"
            value={isLoading ? '...' : todayStatus}
            description={todayStatus === 'No punch yet' ? 'No attendance record for today' : 'Latest attendance status'}
            icon={Clock}
          />
          <StatCard
            title="This Month"
            value={isLoading ? '...' : monthRecords}
            description={`${data?.user.monthLateRecords ?? 0} late records, ${data?.user.monthLateMinutes ?? 0} late minutes`}
            icon={Calendar}
          />
          <StatCard
            title="Pending Requests"
            value={isLoading ? '...' : (manager?.pendingApprovals ?? 0)}
            description={isManager ? 'Requests awaiting action' : 'Use request pages to submit forms'}
            icon={FileText}
          />
          <StatCard
            title="Late Warnings"
            value={isLoading ? '...' : (data?.user.monthLateRecords ?? 0)}
            description="Your late records this month"
            icon={AlertCircle}
          />
        </div>

        {isManager && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Active Employees"
              value={isLoading ? '...' : (manager?.activeEmployees ?? 0)}
              description="Imported active employees"
              icon={Users}
              accent="border-l-green-500"
            />
            <StatCard
              title="Present Today"
              value={isLoading ? '...' : (manager?.presentToday ?? 0)}
              description={`${manager?.lateToday ?? 0} late today`}
              icon={CheckCircle}
              accent="border-l-blue-500"
            />
            <StatCard
              title="On Leave"
              value={isLoading ? '...' : (manager?.onLeaveToday ?? 0)}
              description="Employees marked on leave today"
              icon={Calendar}
              accent="border-l-yellow-500"
            />
            <StatCard
              title="Payroll Status"
              value={isLoading ? '...' : (manager?.payrollStatus ?? 'No active run')}
              description="Latest payroll batch status"
              icon={CreditCard}
              accent="border-l-purple-500"
            />
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent Attendance</CardTitle>
            <CardDescription>
              {isManager ? 'Latest imported attendance activity' : 'Your latest attendance activity'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading dashboard data...</p>
            ) : data?.recentAttendance.length ? (
              <div className="divide-y rounded-md border">
                {data.recentAttendance.map((record) => (
                  <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{record.employee_name || user.name}</p>
                      <p className="text-xs text-muted-foreground">{record.date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{record.status}</p>
                      <p className="text-xs text-muted-foreground">{Number(record.late_minutes || 0)} late minutes</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No attendance activity has been imported yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
