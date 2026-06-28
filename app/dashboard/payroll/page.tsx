'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { addDays, format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { Calculator, Send, Printer, Loader2, Trash2, Gift, FileText, CheckCircle2, RotateCcw } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type PayrollRecord = {
  id: number;
  employee_id: number;
  payroll_type?: 'Regular' | '13th Month' | string;
  employeeName?: string;
  employeeIdStr?: string;
  departmentName?: string;
  period_start?: string;
  period_end?: string;
  days_worked?: number;
  late_deduction_minutes?: number;
  late_absence_equivalents?: number;
  ot_hours?: number;
  overtime_hours?: number;
  basic_pay?: number;
  gross_pay?: number;
  total_deductions?: number;
  net_pay?: number;
  status?: 'Draft' | 'Pending' | 'Approved' | 'Paid' | string;
  claimed_at?: string | null;
};

type PayrollResponse = {
  payrolls?: PayrollRecord[];
  error?: string;
};

type PayrollDeletionLog = {
  id: number;
  payroll_id: number;
  employee_name?: string;
  employee_code?: string;
  payroll_type?: string;
  period_start?: string;
  period_end?: string;
  status?: string;
  net_pay?: number;
  reason?: string;
  deleted_by_name?: string;
  deleted_at?: string;
};

type DeletionLogResponse = {
  logs?: PayrollDeletionLog[];
  error?: string;
};

type PeriodMode = 'monthly' | 'first-half' | 'second-half' | 'weekly' | 'sunday-cutoff-weekly' | 'custom';
type PayrollView = 'generated' | 'released' | 'thirteenth';

function getPresetPeriod(mode: PeriodMode) {
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  switch (mode) {
    case 'first-half':
      return { start: format(monthStart, 'yyyy-MM-dd'), end: format(new Date(today.getFullYear(), today.getMonth(), 15), 'yyyy-MM-dd') };
    case 'second-half':
      return { start: format(new Date(today.getFullYear(), today.getMonth(), 16), 'yyyy-MM-dd'), end: format(monthEnd, 'yyyy-MM-dd') };
    case 'weekly':
      return {
        start: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        end: format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      };
    case 'sunday-cutoff-weekly': {
      const weekSunday = startOfWeek(today, { weekStartsOn: 0 });
      const end = today.getDay() === 0 ? weekSunday : addDays(weekSunday, 7);
      return {
        start: format(addDays(end, -7), 'yyyy-MM-dd'),
        end: format(end, 'yyyy-MM-dd'),
      };
    }
    case 'monthly':
    case 'custom':
    default:
      return { start: format(monthStart, 'yyyy-MM-dd'), end: format(monthEnd, 'yyyy-MM-dd') };
  }
}

export default function PayrollPage() {
  const { user } = useAuth();
  const initialPeriod = getPresetPeriod('monthly');
  const [view, setView] = useState<PayrollView>('generated');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('monthly');
  const [periodStart, setPeriodStart] = useState(initialPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.end);
  const [selectedPayrolls, setSelectedPayrolls] = useState<number[]>([]);
  const [confirmAction, setConfirmAction] = useState<'generate' | 'release' | 'generate-13th' | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PayrollRecord | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const canManagePayroll = user ? ['Admin', 'Manager', 'CEO', 'DEV'].includes(user.role) : false;
  const invalidPeriod = new Date(`${periodStart}T00:00:00`) > new Date(`${periodEnd}T00:00:00`);
  const selectedPeriodLabel = `${format(new Date(`${periodStart}T00:00:00`), 'MMM d, yyyy')} - ${format(new Date(`${periodEnd}T00:00:00`), 'MMM d, yyyy')}`;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const generatedUrl = `/api/payroll?payroll_type=Regular&status=Draft,Pending,Approved&period_start=${periodStart}&period_end=${periodEnd}`;
  const releasedUrl = `/api/payroll?payroll_type=Regular&status=Paid&period_start=${periodStart}&period_end=${periodEnd}`;
  const thirteenthUrl = `/api/payroll?payroll_type=13th%20Month&period_start=${yearStart}&period_end=${yearEnd}`;

  const { data: generatedData, isLoading: generatedLoading, mutate: mutateGenerated } = useSWR<PayrollResponse>(generatedUrl, fetcher);
  const { data: releasedData, isLoading: releasedLoading, mutate: mutateReleased } = useSWR<PayrollResponse>(releasedUrl, fetcher);
  const { data: thirteenthData, isLoading: thirteenthLoading, mutate: mutateThirteenth } = useSWR<PayrollResponse>(thirteenthUrl, fetcher);
  const { data: deletionLogData, mutate: mutateDeletionLogs } = useSWR<DeletionLogResponse>(
    canManagePayroll ? '/api/payroll?report=deletion-logs' : null,
    fetcher
  );

  const generatedPayrolls = Array.isArray(generatedData?.payrolls) ? generatedData.payrolls : [];
  const releasedPayrolls = Array.isArray(releasedData?.payrolls) ? releasedData.payrolls : [];
  const thirteenthPayrolls = Array.isArray(thirteenthData?.payrolls) ? thirteenthData.payrolls : [];
  const deletionLogs = Array.isArray(deletionLogData?.logs) ? deletionLogData.logs : [];
  const activeRecords = view === 'generated' ? generatedPayrolls : view === 'released' ? releasedPayrolls : thirteenthPayrolls;
  const selectableRecords = activeRecords.filter((payroll) => payroll.status !== 'Paid');
  const isLoading = view === 'generated' ? generatedLoading : view === 'released' ? releasedLoading : thirteenthLoading;

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount || 0);

  const refreshAll = async () => {
    await Promise.all([mutateGenerated(), mutateReleased(), mutateThirteenth(), mutateDeletionLogs()]);
  };

  const handlePeriodModeChange = (mode: PeriodMode) => {
    setPeriodMode(mode);
    if (mode !== 'custom') {
      const preset = getPresetPeriod(mode);
      setPeriodStart(preset.start);
      setPeriodEnd(preset.end);
    }
    setSelectedPayrolls([]);
  };

  const handleGeneratePayroll = async () => {
    await postPayroll({
      period_start: periodStart,
      period_end: periodEnd,
      period_mode: periodMode === 'sunday-cutoff-weekly' ? 'sunday-cutoff-weekly' : 'standard',
    }, 'Payroll generated successfully');
  };

  const handleGenerate13thMonth = async () => {
    await postPayroll({ action: '13th-month', year: Number(year) }, '13th-month payroll generated successfully');
  };

  const postPayroll = async (payload: Record<string, unknown>, successMessage: string) => {
    try {
      setIsBusy(true);
      const response = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Payroll action failed');
      toast.success(successMessage);
      setSelectedPayrolls([]);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Payroll action failed');
    } finally {
      setIsBusy(false);
      setIsConfirmDialogOpen(false);
      setConfirmAction(null);
    }
  };

  const handleReleasePayroll = async () => {
    try {
      setIsBusy(true);
      const response = await fetch('/api/payroll', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedPayrolls, status: 'Paid' }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to release payroll');
      toast.success('Payroll released successfully');
      setSelectedPayrolls([]);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to release payroll');
    } finally {
      setIsBusy(false);
      setIsConfirmDialogOpen(false);
      setConfirmAction(null);
    }
  };

  const handleToggleClaimed = async (payroll: PayrollRecord) => {
    try {
      setIsBusy(true);
      const response = await fetch('/api/payroll', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle-claimed', id: payroll.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to update claim status');
      toast.success(payroll.claimed_at ? 'Payslip marked unclaimed' : 'Payslip marked claimed');
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update claim status');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteGenerated = async () => {
    if (!deleteTarget) return;
    try {
      setIsBusy(true);
      const response = await fetch('/api/payroll', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id, reason: deleteReason }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to remove payroll');
      toast.success('Generated payroll removed and logged');
      setIsDeleteDialogOpen(false);
      setDeleteTarget(null);
      setDeleteReason('');
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove payroll');
    } finally {
      setIsBusy(false);
    }
  };

  const selectedNetTotal = activeRecords
    .filter((payroll) => selectedPayrolls.includes(payroll.id))
    .reduce((sum, payroll) => sum + (payroll.net_pay || 0), 0);

  const generatedGross = generatedPayrolls.reduce((sum, p) => sum + (p.gross_pay || 0), 0);
  const releasedNet = releasedPayrolls.reduce((sum, p) => sum + (p.net_pay || 0), 0);
  const thirteenthNet = thirteenthPayrolls.reduce((sum, p) => sum + (p.net_pay || 0), 0);

  useEffect(() => {
    setSelectedPayrolls([]);
  }, [view, periodStart, periodEnd, year]);

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader
        title="Payroll Management"
        description="Generate, release, audit, and report payroll separately"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Generated Payroll</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(generatedGross)}</div>
              <p className="text-xs text-muted-foreground">{generatedPayrolls.length} unreleased record(s)</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Released Payroll Report</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(releasedNet)}</div>
              <p className="text-xs text-muted-foreground">{releasedPayrolls.length} paid record(s)</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">13th Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{formatCurrency(thirteenthNet)}</div>
              <p className="text-xs text-muted-foreground">Year {year}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>Payroll Workspace</CardTitle>
                <CardDescription>
                  Generated records stay separate until released. Released payroll is read-only history.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {view !== 'thirteenth' ? (
                  <>
                    <Select value={periodMode} onValueChange={(value) => handlePeriodModeChange(value as PeriodMode)}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="first-half">1st-15th</SelectItem>
                        <SelectItem value="second-half">16th-End</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="sunday-cutoff-weekly">Weekly - Sunday 3 PM Cutoff</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="date" value={periodStart} onChange={(event) => { setPeriodMode('custom'); setPeriodStart(event.target.value); }} className="w-[150px]" />
                    <Input type="date" value={periodEnd} onChange={(event) => { setPeriodMode('custom'); setPeriodEnd(event.target.value); }} className="w-[150px]" />
                  </>
                ) : (
                  <Input type="number" min="1975" value={year} onChange={(event) => setYear(event.target.value)} className="w-[120px]" />
                )}
                {canManagePayroll && view === 'generated' && (
                  <>
                    <Button variant="outline" onClick={() => { setConfirmAction('generate'); setIsConfirmDialogOpen(true); }} disabled={invalidPeriod}>
                      <Calculator className="h-4 w-4 mr-2" />
                      Generate
                    </Button>
                    <Button onClick={() => { setConfirmAction('release'); setIsConfirmDialogOpen(true); }} disabled={selectedPayrolls.length === 0 || invalidPeriod}>
                      <Send className="h-4 w-4 mr-2" />
                      Release ({selectedPayrolls.length})
                    </Button>
                  </>
                )}
                {canManagePayroll && view === 'thirteenth' && (
                  <>
                    <Button variant="outline" onClick={() => { setConfirmAction('generate-13th'); setIsConfirmDialogOpen(true); }}>
                      <Gift className="h-4 w-4 mr-2" />
                      Generate 13th Month
                    </Button>
                    <Button onClick={() => { setConfirmAction('release'); setIsConfirmDialogOpen(true); }} disabled={selectedPayrolls.length === 0}>
                      <Send className="h-4 w-4 mr-2" />
                      Release ({selectedPayrolls.length})
                    </Button>
                  </>
                )}
              </div>
            </div>
            {invalidPeriod && view !== 'thirteenth' && (
              <p className="text-sm text-red-600">Start date must be before or equal to end date.</p>
            )}
            {periodMode === 'sunday-cutoff-weekly' && view !== 'thirteenth' && (
              <p className="text-sm text-muted-foreground">
                Cutoff mode uses Sunday 3:00 PM to Sunday 3:00 PM. Work after the ending Sunday 3:00 PM is carried as OT to the next Sunday payroll.
              </p>
            )}
          </CardHeader>
          <CardContent>
            <Tabs value={view} onValueChange={(value) => { setView(value as PayrollView); setSelectedPayrolls([]); }}>
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="generated">Generated</TabsTrigger>
                <TabsTrigger value="released">Released Report</TabsTrigger>
                <TabsTrigger value="thirteenth">13th Month</TabsTrigger>
              </TabsList>
              <TabsContent value={view} className="mt-0">
                <PayrollTable
                  records={activeRecords}
                  isLoading={isLoading}
                  selectable={view === 'generated' || view === 'thirteenth'}
                  removable={view === 'generated' || view === 'thirteenth'}
                  selectedPayrolls={selectedPayrolls}
                  onSelect={(id, checked) => setSelectedPayrolls((current) => checked ? [...current, id] : current.filter((payrollId) => payrollId !== id))}
                  onSelectAll={(checked) => setSelectedPayrolls(checked ? selectableRecords.map((p) => p.id) : [])}
                  onRemove={(record) => { setDeleteTarget(record); setDeleteReason(''); setIsDeleteDialogOpen(true); }}
                  showClaimStatus={view === 'released'}
                  claimEditable={canManagePayroll && view === 'released'}
                  onToggleClaim={handleToggleClaimed}
                  isBusy={isBusy}
                  formatCurrency={formatCurrency}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {confirmAction === 'release' ? 'Release Payroll' : confirmAction === 'generate-13th' ? 'Generate 13th-Month Payroll' : 'Generate Payroll'}
              </DialogTitle>
              <DialogDescription>
                {confirmAction === 'release'
                  ? `This will move ${selectedPayrolls.length} generated record(s) into the released payroll report.`
                  : confirmAction === 'generate-13th'
                    ? 'This uses the statutory 13th-month formula: paid regular basic salary earned during the calendar year divided by 12.'
                    : 'This will calculate generated payroll from attendance, approved OT, holiday rules, and editable statutory variables.'}
              </DialogDescription>
            </DialogHeader>
            <div className="p-4 bg-muted text-sm">
              {confirmAction === 'generate-13th' ? `Payroll Year: ${year}` : `Pay Period: ${selectedPeriodLabel}`}
              {confirmAction === 'release' && (
                <div className="mt-2">
                  Net to release: <span className="font-bold text-green-600">{formatCurrency(selectedNetTotal)}</span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsConfirmDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={confirmAction === 'release' ? handleReleasePayroll : confirmAction === 'generate-13th' ? handleGenerate13thMonth : handleGeneratePayroll}
                disabled={isBusy}
              >
                {isBusy ? 'Processing...' : 'Confirm'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Generated Payroll</DialogTitle>
              <DialogDescription>
                Released payroll cannot be removed. This generated record will be deleted only after recording your reason for payroll audit documentation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {deleteTarget?.employeeName} - {formatCurrency(deleteTarget?.net_pay || 0)}
              </div>
              <Textarea
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder="Reason for removal..."
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteGenerated} disabled={isBusy || deleteReason.trim().length < 5}>
                Remove and Log
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {canManagePayroll && (
          <Card>
            <CardHeader>
              <CardTitle>Removal Audit Log</CardTitle>
              <CardDescription>Generated payroll removed with documented reasons for payroll security review.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deleted At</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Net</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Deleted By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deletionLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                        No removed generated payroll records.
                      </TableCell>
                    </TableRow>
                  ) : deletionLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{log.deleted_at || 'N/A'}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{log.employee_name || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">ID: {log.employee_code || 'N/A'}</p>
                        </div>
                      </TableCell>
                      <TableCell>{log.payroll_type || 'Regular'}</TableCell>
                      <TableCell>{log.period_start} to {log.period_end}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(log.net_pay || 0)}</TableCell>
                      <TableCell>{log.reason || 'N/A'}</TableCell>
                      <TableCell>{log.deleted_by_name || 'N/A'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function PayrollTable({
  records,
  isLoading,
  selectable,
  removable,
  selectedPayrolls,
  onSelect,
  onSelectAll,
  onRemove,
  showClaimStatus,
  claimEditable,
  onToggleClaim,
  isBusy,
  formatCurrency,
}: {
  records: PayrollRecord[];
  isLoading: boolean;
  selectable: boolean;
  removable: boolean;
  selectedPayrolls: number[];
  onSelect: (id: number, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onRemove: (record: PayrollRecord) => void;
  showClaimStatus: boolean;
  claimEditable: boolean;
  onToggleClaim: (record: PayrollRecord) => void;
  isBusy: boolean;
  formatCurrency: (amount: number) => string;
}) {
  const removableRecords = records.filter((payroll) => payroll.status !== 'Paid');
  const columnCount = 11 + (selectable ? 1 : 0) + (showClaimStatus ? 1 : 0);
  const getStatusBadge = (status: string) => {
    if (status === 'Paid') return <Badge variant="default">Paid</Badge>;
    if (status === 'Approved') return <Badge variant="default">Approved</Badge>;
    if (status === 'Pending') return <Badge variant="secondary">Pending</Badge>;
    return <Badge variant="outline">{status || 'Draft'}</Badge>;
  };
  const formatClaimDate = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString();
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {selectable && (
            <TableHead className="w-12">
              <Checkbox checked={selectedPayrolls.length === removableRecords.length && removableRecords.length > 0} onCheckedChange={(checked) => onSelectAll(Boolean(checked))} />
            </TableHead>
          )}
          <TableHead>Employee</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Period</TableHead>
          <TableHead>Days</TableHead>
          <TableHead>Late Eq.</TableHead>
          <TableHead>OT</TableHead>
          <TableHead>Gross</TableHead>
          <TableHead>Deductions</TableHead>
          <TableHead>Net</TableHead>
          <TableHead>Status</TableHead>
          {showClaimStatus && <TableHead>Claim</TableHead>}
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={columnCount} className="text-center py-4">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading payroll data...
              </div>
            </TableCell>
          </TableRow>
        ) : records.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columnCount} className="text-center py-4 text-muted-foreground">
              No records found.
            </TableCell>
          </TableRow>
        ) : records.map((payroll) => (
          <TableRow key={payroll.id}>
            {selectable && (
              <TableCell>
                <Checkbox
                  checked={selectedPayrolls.includes(payroll.id)}
                  disabled={payroll.status === 'Paid'}
                  onCheckedChange={(checked) => onSelect(payroll.id, Boolean(checked))}
                />
              </TableCell>
            )}
            <TableCell>
              <div>
                <p className="font-medium">{payroll.employeeName || 'N/A'}</p>
                <p className="text-xs text-muted-foreground">ID: {payroll.employeeIdStr || 'N/A'}</p>
              </div>
            </TableCell>
            <TableCell>{payroll.payroll_type || 'Regular'}</TableCell>
            <TableCell>{payroll.period_start} to {payroll.period_end}</TableCell>
            <TableCell>{payroll.days_worked || 0}</TableCell>
            <TableCell>{payroll.late_absence_equivalents || 0}</TableCell>
            <TableCell>{(payroll.ot_hours || payroll.overtime_hours || 0).toFixed(2)}</TableCell>
            <TableCell>{formatCurrency(payroll.gross_pay || 0)}</TableCell>
            <TableCell className="text-red-600">-{formatCurrency(payroll.total_deductions || 0)}</TableCell>
            <TableCell className="font-bold text-green-600">{formatCurrency(payroll.net_pay || 0)}</TableCell>
            <TableCell>{getStatusBadge(payroll.status || 'Draft')}</TableCell>
            {showClaimStatus && (
              <TableCell>
                {payroll.claimed_at ? (
                  <Badge variant="secondary">Claimed {formatClaimDate(payroll.claimed_at)}</Badge>
                ) : (
                  <Badge variant="outline">Unclaimed</Badge>
                )}
              </TableCell>
            )}
            <TableCell>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(`/api/payroll/${payroll.id}/payslip`, '_blank')}>
                  <Printer className="h-4 w-4" />
                </Button>
                {claimEditable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs"
                    disabled={isBusy}
                    onClick={() => onToggleClaim(payroll)}
                  >
                    {payroll.claimed_at ? (
                      <RotateCcw className="h-3.5 w-3.5" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    {payroll.claimed_at ? 'Clear' : 'Claim'}
                  </Button>
                )}
                {removable && payroll.status !== 'Paid' && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => onRemove(payroll)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                {!removable && !claimEditable && (
                  <FileText className="h-4 w-4 text-muted-foreground mt-2" />
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
