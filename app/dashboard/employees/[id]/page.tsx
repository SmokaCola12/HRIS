'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Banknote,
  CalendarCheck,
  Clock3,
  Edit,
  ExternalLink,
  FileText,
  QrCode,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { DashboardHeader } from '@/components/dashboard/header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Failed to load employee overview');
  return data;
};

type OverviewData = {
  employee: {
    id: number;
    employee_id: string;
    name: string;
    username: string | null;
    email: string | null;
    phone: string | null;
    picture: string | null;
    hire_date: string | null;
    status: string;
    employment_type: string;
    employment_type_effective_date: string | null;
    role: string;
    department: string | null;
    position: string | null;
    area: string | null;
    salary_grade: { name: string; amount: number; frequency: string } | null;
    shift: { name: string; start_time: string; end_time: string } | null;
  };
  summary: {
    attendance_records: number;
    present: number;
    late: number;
    absent: number;
    leave_days: number;
    approved_overtime_hours: number;
    paid_payslips: number;
    lifetime_net_pay: number;
  };
  attendance: Array<Record<string, any>>;
  leaves: Array<Record<string, any>>;
  overtime: Array<Record<string, any>>;
  salary_advances: Array<Record<string, any>>;
  payrolls: Array<Record<string, any>>;
};

function formatDate(value?: string | null) {
  if (!value) return 'N/A';
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, 'MMM dd, yyyy');
}

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'Rejected' || status === 'Absent' || status === 'AWOL'
    ? 'destructive'
    : status === 'Pending' || status === 'Draft'
      ? 'outline'
      : status === 'Paid' || status === 'Approved' || status === 'Present' || status === 'Active'
        ? 'default'
        : 'secondary';
  return <Badge variant={variant}>{status}</Badge>;
}

function EmptyRow({ columns, label }: { columns: number; label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={columns} className="py-10 text-center text-muted-foreground">
        {label}
      </TableCell>
    </TableRow>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 truncate text-sm font-medium">{value || 'N/A'}</div>
    </div>
  );
}

export default function EmployeeOverviewPage() {
  const [correctionTarget, setCorrectionTarget] = useState<Record<string, any> | null>(null);
  const [correctionForm, setCorrectionForm] = useState({ time_in: '', time_out: '', remarks: '', password: '' });
  const [isCorrecting, setIsCorrecting] = useState(false);
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const canAccess = !!user && ['Manager', 'Admin', 'CEO', 'DEV'].includes(user.role);
  const { data, error, isLoading, mutate } = useSWR<OverviewData>(
    canAccess ? `/api/employees/${params.id}/overview` : null,
    fetcher,
  );

  const openCorrection = (record: Record<string, any>) => {
    setCorrectionTarget(record);
    setCorrectionForm({
      time_in: record.time_in || '',
      time_out: record.time_out || '',
      remarks: '',
      password: '',
    });
  };

  const closeCorrection = () => {
    setCorrectionTarget(null);
    setCorrectionForm({ time_in: '', time_out: '', remarks: '', password: '' });
  };

  const useScheduledTimes = () => {
    if (!correctionTarget) return;
    setCorrectionForm((current) => ({
      ...current,
      time_in: current.time_in || correctionTarget.scheduled_in || employee?.shift?.start_time || '',
      time_out: correctionTarget.scheduled_out || employee?.shift?.end_time || current.time_out || '',
    }));
  };

  const saveCorrection = async () => {
    if (!correctionTarget) return;
    const remarks = correctionForm.remarks.trim();
    if (!remarks) {
      toast.error('Correction remarks are required');
      return;
    }
    if (!correctionForm.password.trim()) {
      toast.error('Manager/Admin password is required');
      return;
    }

    try {
      setIsCorrecting(true);
      const response = await fetch('/api/attendance/corrections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: correctionTarget.id,
          time_in: correctionForm.time_in,
          time_out: correctionForm.time_out,
          remarks,
          password: correctionForm.password,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to correct attendance');
      toast.success('Attendance corrected');
      closeCorrection();
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to correct attendance');
    } finally {
      setIsCorrecting(false);
    }
  };

  if (user && !canAccess) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        You don&apos;t have permission to access employee records.
      </div>
    );
  }

  if (isLoading || !user) {
    return (
      <div className="p-6 space-y-5">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 space-y-4">
        <Button variant="outline" onClick={() => router.push('/dashboard/employees')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Employee Masterlist
        </Button>
        <p className="text-destructive">{error?.message || 'Employee record not found'}</p>
      </div>
    );
  }

  const { employee, summary } = data;
  const metrics = [
    { label: 'Present', value: summary.present, icon: UserCheck },
    { label: 'Absent', value: summary.absent, icon: UserX },
    { label: 'Late', value: summary.late, icon: Clock3 },
    { label: 'Approved Leave', value: `${summary.leave_days} days`, icon: CalendarCheck },
    { label: 'Approved OT', value: `${summary.approved_overtime_hours.toFixed(2)} hrs`, icon: Clock3 },
    { label: 'Paid Payslips', value: summary.paid_payslips, icon: FileText },
  ];

  return (
    <div className="flex min-h-full flex-col bg-background">
      <DashboardHeader title="Employee Overview" description={`${employee.employee_id} · ${employee.name}`} />

      <div className="flex-1 space-y-5 overflow-auto p-4 md:p-6">
        <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/employees')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Employee Masterlist
        </Button>

        <Card>
          <CardContent className="p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
              <div className="flex min-w-0 items-center gap-4 lg:w-72">
                <Avatar className="h-16 w-16 shrink-0">
                  <AvatarImage src={employee.picture || undefined} />
                  <AvatarFallback>{employee.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold">{employee.name}</h2>
                  <p className="truncate text-sm text-muted-foreground">{employee.position || 'Position not assigned'}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge status={employee.status} />
                    <Badge variant="outline">{employee.employment_type || 'Probationary'}</Badge>
                    <Badge variant="outline">{employee.role}</Badge>
                  </div>
                </div>
              </div>

              <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-5">
                <Detail label="Employee ID" value={employee.employee_id} />
                <Detail label="Department" value={employee.department} />
                <Detail label="Email" value={employee.email} />
                <Detail label="Phone" value={employee.phone} />
                <Detail label="Hire Date" value={formatDate(employee.hire_date)} />
                <Detail label="Employment Type" value={employee.employment_type || 'Probationary'} />
                <Detail label="Type Since" value={formatDate(employee.employment_type_effective_date)} />
                <Detail label="Area" value={employee.area} />
                <Detail label="Shift" value={employee.shift ? `${employee.shift.name} (${employee.shift.start_time}-${employee.shift.end_time})` : null} />
                <Detail label="Salary Grade" value={employee.salary_grade?.name} />
                <Detail label="Grade Rate" value={employee.salary_grade ? `${formatCurrency(employee.salary_grade.amount)} / ${employee.salary_grade.frequency}` : null} />
                <Detail label="Username" value={employee.username} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <QrCode className="h-4 w-4" />
              Attendance QR Code
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-44 w-44 shrink-0 items-center justify-center border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/employees/${employee.id}/qr-code`}
                alt={`Attendance QR code for ${employee.name}`}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-sm font-medium">{employee.name}</p>
              <p className="text-sm text-muted-foreground">{employee.employee_id}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(`/api/employees/${employee.id}/qr-code`, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
                Open QR
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {metrics.map((metric) => (
            <Card key={metric.label}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground">{metric.label}</p>
                  <p className="mt-1 text-xl font-semibold">{metric.value}</p>
                </div>
                <metric.icon className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="attendance" className="space-y-4">
          <TabsList className="h-auto w-full justify-start overflow-x-auto">
            <TabsTrigger value="attendance">Attendance ({data.attendance.length})</TabsTrigger>
            <TabsTrigger value="leaves">Leaves ({data.leaves.length})</TabsTrigger>
            <TabsTrigger value="overtime">Overtime ({data.overtime.length})</TabsTrigger>
            <TabsTrigger value="advances">Salary Advances ({data.salary_advances.length})</TabsTrigger>
            <TabsTrigger value="payroll">Payroll & Payslips ({data.payrolls.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="attendance" className="rounded-md border">
            <div className="max-h-[560px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Date</TableHead><TableHead>Time In</TableHead><TableHead>Break Out</TableHead><TableHead>Break In</TableHead><TableHead>Time Out</TableHead>
                    <TableHead>Status</TableHead><TableHead>Hours</TableHead><TableHead>Late</TableHead>
                    <TableHead>Undertime</TableHead><TableHead>OT</TableHead><TableHead>Remarks</TableHead><TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.attendance.length === 0 ? <EmptyRow columns={12} label="No attendance records" /> : data.attendance.map((record) => (
                    <TableRow key={record.id || record.date}>
                      <TableCell className="font-medium">{formatDate(record.date)}</TableCell>
                      <TableCell>{record.time_in || '-'}</TableCell>
                      <TableCell>{record.break_out || '-'}</TableCell>
                      <TableCell>{record.break_in || '-'}</TableCell>
                      <TableCell>{record.time_out || '-'}</TableCell>
                      <TableCell><StatusBadge status={record.status} /></TableCell>
                      <TableCell>{Number(record.total_hours || 0).toFixed(2)}</TableCell>
                      <TableCell>{record.late_minutes || 0} min</TableCell>
                      <TableCell>{record.undertime_minutes || 0} min</TableCell>
                      <TableCell>{record.overtime_minutes || 0} min</TableCell>
                      <TableCell className="max-w-56 truncate" title={record.remarks || undefined}>{record.remarks || '-'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" title="Correct attendance" onClick={() => openCorrection(record)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="leaves" className="rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Type</TableHead><TableHead>Days</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.leaves.length === 0 ? <EmptyRow columns={6} label="No leave requests" /> : data.leaves.map((record) => (
                  <TableRow key={record.id}><TableCell>{formatDate(record.start_date)}</TableCell><TableCell>{formatDate(record.end_date)}</TableCell><TableCell>{record.leave_type}</TableCell><TableCell>{record.days}</TableCell><TableCell className="max-w-72 truncate">{record.reason || '-'}</TableCell><TableCell><StatusBadge status={record.status} /></TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="overtime" className="rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Hours</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.overtime.length === 0 ? <EmptyRow columns={6} label="No overtime requests" /> : data.overtime.map((record) => (
                  <TableRow key={record.id}><TableCell>{formatDate(record.date)}</TableCell><TableCell>{record.start_time}</TableCell><TableCell>{record.end_time}</TableCell><TableCell>{Number(record.hours || 0).toFixed(2)}</TableCell><TableCell className="max-w-72 truncate">{record.reason || '-'}</TableCell><TableCell><StatusBadge status={record.status} /></TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="advances" className="rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>Requested</TableHead><TableHead>Amount</TableHead><TableHead>Repayment</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.salary_advances.length === 0 ? <EmptyRow columns={5} label="No salary advance requests" /> : data.salary_advances.map((record) => (
                  <TableRow key={record.id}><TableCell>{formatDate(record.created_at)}</TableCell><TableCell>{formatCurrency(record.amount)}</TableCell><TableCell>{record.repayment_months || 1} month(s)</TableCell><TableCell className="max-w-72 truncate">{record.reason || '-'}</TableCell><TableCell><StatusBadge status={record.status} /></TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="payroll" className="rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Type</TableHead><TableHead>Basic</TableHead><TableHead>OT</TableHead><TableHead>Gross</TableHead><TableHead>Deductions</TableHead><TableHead>Net Pay</TableHead><TableHead>Status</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
              <TableBody>
                {data.payrolls.length === 0 ? <EmptyRow columns={9} label="No payroll records" /> : data.payrolls.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{formatDate(record.period_start)} - {formatDate(record.period_end)}</TableCell>
                    <TableCell>{record.payroll_type || 'Regular'}</TableCell><TableCell>{formatCurrency(record.basic_salary)}</TableCell><TableCell>{formatCurrency(record.overtime_pay)}</TableCell><TableCell>{formatCurrency(record.gross_pay)}</TableCell><TableCell>{formatCurrency(record.total_deductions)}</TableCell><TableCell className="font-semibold">{formatCurrency(record.net_pay)}</TableCell><TableCell><StatusBadge status={record.status} /></TableCell>
                    <TableCell>{record.status === 'Paid' && <Button variant="ghost" size="icon" title="Open payslip" onClick={() => window.open(`/api/payroll/${record.id}/payslip`, '_blank')}><ExternalLink className="h-4 w-4" /></Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Banknote className="h-4 w-4" />Released Net Pay</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{formatCurrency(summary.lifetime_net_pay)}</CardContent>
        </Card>
      </div>

      <Dialog open={!!correctionTarget} onOpenChange={(open) => !open && closeCorrection()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct Attendance</DialogTitle>
            <DialogDescription>
              Update missed or incorrect time entries for {correctionTarget ? formatDate(correctionTarget.date) : 'this record'}.
            </DialogDescription>
          </DialogHeader>
          {correctionTarget && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              Current: Time In {correctionTarget.time_in || '-'} &middot; Time Out {correctionTarget.time_out || '-'} &middot; Status {correctionTarget.status || '-'}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="time-in">Time In</Label>
              <Input
                id="time-in"
                type="time"
                value={correctionForm.time_in}
                onChange={(event) => setCorrectionForm((current) => ({ ...current, time_in: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time-out">Time Out</Label>
              <Input
                id="time-out"
                type="time"
                value={correctionForm.time_out}
                onChange={(event) => setCorrectionForm((current) => ({ ...current, time_out: event.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="correction-note">Correction Note</Label>
              <Textarea
                id="correction-note"
                value={correctionForm.remarks}
                onChange={(event) => setCorrectionForm((current) => ({ ...current, remarks: event.target.value }))}
                placeholder="Forgot punch out, approved manual correction..."
                rows={3}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="correction-password">Manager/Admin Password</Label>
              <Input
                id="correction-password"
                type="password"
                value={correctionForm.password}
                onChange={(event) => setCorrectionForm((current) => ({ ...current, password: event.target.value }))}
                autoComplete="current-password"
                required
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="secondary" onClick={useScheduledTimes}>
              Use Schedule
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={closeCorrection}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={saveCorrection}
                disabled={isCorrecting || !correctionForm.time_in || !correctionForm.remarks.trim() || !correctionForm.password.trim()}
              >
                {isCorrecting ? 'Saving...' : 'Save Correction'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
