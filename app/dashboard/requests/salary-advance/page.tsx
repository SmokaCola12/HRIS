'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Plus, CreditCard, AlertTriangle, RefreshCw } from 'lucide-react';

interface SalaryAdvanceRequest {
  id: number;
  amount: number;
  reason: string | null;
  repayment_months: number;
  status: string;
  rejection_reason?: string | null;
  created_at: string;
}

type SalaryAdvanceLimit = {
  salary_grade: { id: number; name: string; amount: number; frequency: string } | null;
  monthly_equivalent: number;
  max_advance: number;
  reserved_amount: number;
  available_amount: number;
  cap_rate: number;
  working_days_per_month: number;
};

const fetcher = async (url: string) => {
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${document.cookie.split('auth_token=')[1]?.split(';')[0] || ''}`,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
};

export default function SalaryAdvancePage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [extensionTarget, setExtensionTarget] = useState<SalaryAdvanceRequest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [extensionData, setExtensionData] = useState({ requestedExtraMonths: '1', reason: '' });
  const [formData, setFormData] = useState({
    amount: '',
    reason: '',
    repaymentMonths: '1',
  });

  const { data, isLoading, mutate } = useSWR<{ requests: SalaryAdvanceRequest[]; limit: SalaryAdvanceLimit | null }>('/api/requests/salary-advance', fetcher);
  const advanceRequests = data?.requests || [];
  const limit = data?.limit;
  const baseSalary = limit?.monthly_equivalent ?? 0;
  const maxAdvance = limit?.max_advance ?? 0;
  const outstandingBalance = limit?.reserved_amount ?? 0;
  const available = limit?.available_amount ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const amount = parseFloat(formData.amount);
    if (amount > available) {
      toast.error('Amount exceeds available limit');
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/requests/salary-advance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${document.cookie.split('auth_token=')[1]?.split(';')[0] || ''}`,
        },
        body: JSON.stringify({
          amount,
          reason: formData.reason,
          repayment_months: parseInt(formData.repaymentMonths),
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Failed to submit request');

      toast.success('Salary advance request submitted successfully');
      setIsDialogOpen(false);
      setFormData({ amount: '', reason: '', repaymentMonths: '1' });
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit salary advance request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExtensionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extensionTarget) return;
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/requests/salary-advance/extension', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salary_advance_id: extensionTarget.id,
          requested_extra_months: Number(extensionData.requestedExtraMonths),
          reason: extensionData.reason,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit extension request');

      toast.success('Extension request submitted successfully');
      setExtensionTarget(null);
      setExtensionData({ requestedExtraMonths: '1', reason: '' });
    } catch {
      toast.error('Failed to submit extension request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending':
        return <Badge variant="outline">Pending</Badge>;
      case 'Approved':
        return <Badge variant="default">Approved</Badge>;
      case 'Rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount);
  };

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader
        title="Salary Advance"
        description="Request and track salary advances"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Info Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Base Salary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(baseSalary)}</div>
              <p className="text-xs text-muted-foreground">
                {limit?.salary_grade ? `${limit.salary_grade.name} / ${limit.salary_grade.frequency}` : 'Monthly equivalent'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Max Advance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(maxAdvance)}</div>
              <p className="text-xs text-muted-foreground">50% of monthly equivalent</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-yellow-600">{formatCurrency(outstandingBalance)}</div>
                  <p className="text-xs text-muted-foreground">Pending and approved</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Available</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-green-600">{formatCurrency(available)}</div>
                  <p className="text-xs text-muted-foreground">Can request</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Warning if low available */}
        {!isLoading && available < maxAdvance * 0.25 && outstandingBalance > 0 && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm font-medium text-yellow-800">Outstanding Balance</p>
                <p className="text-xs text-yellow-700">
                  You have {formatCurrency(outstandingBalance)} in outstanding advances that will be deducted from payroll.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Salary Advance Requests Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>My Salary Advance Requests</CardTitle>
                <CardDescription>View and manage your salary advance applications</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => mutate()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button disabled={available <= 0}>
                      <Plus className="h-4 w-4 mr-2" />
                      Request Advance
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Request Salary Advance</DialogTitle>
                      <DialogDescription>
                        Fill in the details for your salary advance request
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm">
                          <span className="text-muted-foreground">Available to request:</span>{' '}
                          <span className="font-bold text-green-600">{formatCurrency(available)}</span>
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="amount">Amount (PHP)</Label>
                        <Input
                          id="amount"
                          type="number"
                          min="1000"
                          max={available}
                          step="100"
                          value={formData.amount}
                          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                          placeholder="Enter amount"
                          required
                        />
                        <p className="text-xs text-muted-foreground">
                          Minimum: PHP 1,000 | Maximum: {formatCurrency(available)}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="repaymentMonths">Repayment Period</Label>
                        <Select
                          value={formData.repaymentMonths}
                          onValueChange={(value) => setFormData({ ...formData, repaymentMonths: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 Month</SelectItem>
                            <SelectItem value="2">2 Months</SelectItem>
                            <SelectItem value="3">3 Months</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {formData.amount && (
                        <div className="p-3 bg-blue-50 rounded-lg">
                          <p className="text-sm text-blue-800">
                            Monthly deduction: {formatCurrency(parseFloat(formData.amount) / parseInt(formData.repaymentMonths))}
                          </p>
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor="reason">Reason</Label>
                        <Textarea
                          id="reason"
                          value={formData.reason}
                          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                          placeholder="Explain the reason for your salary advance request..."
                          required
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={isSubmitting || !formData.amount || parseFloat(formData.amount) > available}
                        >
                          {isSubmitting ? 'Submitting...' : 'Submit Request'}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Repayment</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <div className="flex justify-center py-8">
                        <Skeleton className="h-8 w-48" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : advanceRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No salary advance requests yet. Click &quot;Request Advance&quot; to submit one.
                    </TableCell>
                  </TableRow>
                ) : (
                  advanceRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>{format(new Date(request.created_at), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 font-medium">
                          <CreditCard className="h-3 w-3" />
                          {formatCurrency(request.amount)}
                        </span>
                      </TableCell>
                      <TableCell>{request.repayment_months} month(s)</TableCell>
                      <TableCell className="max-w-[200px] truncate">{request.reason || '-'}</TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {request.status === 'Rejected' && request.rejection_reason}
                      </TableCell>
                      <TableCell>
                        {request.status === 'Approved' && (
                          <Button variant="outline" size="sm" onClick={() => setExtensionTarget(request)}>
                            Request Extension
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={!!extensionTarget} onOpenChange={(open) => !open && setExtensionTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Loan Extension</DialogTitle>
              <DialogDescription>
                Extend the repayment term for {extensionTarget ? formatCurrency(extensionTarget.amount) : 'this advance'}.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleExtensionSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Extra Months</Label>
                <Select
                  value={extensionData.requestedExtraMonths}
                  onValueChange={(value) => setExtensionData({ ...extensionData, requestedExtraMonths: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6].map((month) => (
                      <SelectItem key={month} value={String(month)}>{month} month(s)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="extensionReason">Reason</Label>
                <Textarea
                  id="extensionReason"
                  value={extensionData.reason}
                  onChange={(e) => setExtensionData({ ...extensionData, reason: e.target.value })}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setExtensionTarget(null)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting || !extensionData.reason.trim()}>
                  {isSubmitting ? 'Submitting...' : 'Submit Extension'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
