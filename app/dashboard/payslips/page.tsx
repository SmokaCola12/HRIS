'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Download, Eye, CreditCard, Printer, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type Payslip = {
  id: number;
  payroll_id: number;
  period: string;
  period_start: string;
  period_end: string;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  status: string;
  claimed_at: string | null;
  days_worked: number;
  earnings: {
    basic_pay: number;
    overtime_pay: number;
    night_shift_pay: number;
    holiday_pay: number;
    allowances: number;
  };
  deductions: {
    sss: number;
    philhealth: number;
    pagibig: number;
    tax: number;
    salary_advance: number;
    other: number;
    recorded_total?: number;
    component_total?: number;
    itemized_total?: number;
    reconciliation_difference?: number;
    is_balanced?: boolean;
    warnings?: string[];
    line_items?: DeductionLineItem[];
  };
};

type PayslipsResponse = {
  success?: boolean;
  payslips?: Payslip[];
  error?: string;
};

type DeductionLineItem = {
  key: string;
  label: string;
  category: string;
  amount: number;
  source: string;
  basis: string;
  note?: string;
  is_reconciliation?: boolean;
};

const years = ['2026', '2025', '2024'];

export default function PayslipsPage() {
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
  const { data, isLoading, mutate } = useSWR<PayslipsResponse>(`/api/payslips?year=${selectedYear}`, fetcher);
  const payslips = Array.isArray(data?.payslips) ? data.payslips : [];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount || 0);
  };
  const formatDeduction = (amount: number) => amount > 0 ? `-${formatCurrency(amount)}` : formatCurrency(0);

  const getDeductionLines = (payslip: Payslip): DeductionLineItem[] => {
    if (Array.isArray(payslip.deductions.line_items) && payslip.deductions.line_items.length > 0) {
      return payslip.deductions.line_items;
    }

    const fallbackLines: DeductionLineItem[] = [
      { key: 'sss', label: 'SSS Contribution', category: 'Statutory', amount: payslip.deductions.sss || 0, source: 'payroll.sss_deduction', basis: 'Employee statutory contribution recorded for this payroll period' },
      { key: 'philhealth', label: 'PhilHealth Contribution', category: 'Statutory', amount: payslip.deductions.philhealth || 0, source: 'payroll.philhealth_deduction', basis: 'Employee statutory health contribution recorded for this payroll period' },
      { key: 'pagibig', label: 'Pag-IBIG Contribution', category: 'Statutory', amount: payslip.deductions.pagibig || 0, source: 'payroll.pagibig_deduction', basis: 'Employee statutory housing fund contribution recorded for this payroll period' },
      { key: 'tax', label: 'Withholding Tax', category: 'Statutory', amount: payslip.deductions.tax || 0, source: 'payroll.tax_deduction', basis: 'Withholding tax recorded for this payroll period' },
      { key: 'salary_advance', label: 'Salary Advance Repayment', category: 'Repayment', amount: payslip.deductions.salary_advance || 0, source: 'payroll.salary_advance_deduction', basis: 'Approved salary advance repayment deducted in this period' },
      { key: 'other', label: 'Other / Manual Deduction', category: 'Other', amount: payslip.deductions.other || 0, source: 'payroll.other_deductions', basis: 'Manual, legacy, or imported deduction balance recorded in payroll' },
    ];
    return fallbackLines;
  };

  const latestPayslip = payslips[0];
  const ytdGross = payslips.reduce((sum, payslip) => sum + (payslip.gross_pay || 0), 0);
  const ytdDeductions = payslips.reduce((sum, payslip) => sum + (payslip.total_deductions || 0), 0);

  const confirmReceipt = async (payslip: Payslip) => {
    try {
      const res = await fetch(`/api/payslips/${payslip.payroll_id}/claim`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to confirm receipt');
      toast.success('Payslip receipt confirmed');
      mutate();
    } catch {
      toast.error('Failed to confirm receipt');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader
        title="My Payslips"
        description="View and download your payroll history"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Latest Net Pay</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(latestPayslip?.net_pay || 0)}
              </div>
              <p className="text-xs text-muted-foreground">{latestPayslip?.period || 'No released payslip'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">YTD Gross Pay</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(ytdGross)}
              </div>
              <p className="text-xs text-muted-foreground">Year to date</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">YTD Deductions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(ytdDeductions)}
              </div>
              <p className="text-xs text-muted-foreground">Year to date</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Payroll History</CardTitle>
                <CardDescription>Released payroll appears here as payslips</CardDescription>
              </div>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pay Period</TableHead>
                  <TableHead>Gross Pay</TableHead>
                  <TableHead>Deductions</TableHead>
                  <TableHead>Net Pay</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading payslips...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : payslips.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                      No released payslips for this year.
                    </TableCell>
                  </TableRow>
                ) : (
                  payslips.map((payslip) => (
                    <TableRow key={payslip.id}>
                      <TableCell className="font-medium">{payslip.period}</TableCell>
                      <TableCell>{formatCurrency(payslip.gross_pay)}</TableCell>
                      <TableCell className="text-red-600">-{formatCurrency(payslip.total_deductions)}</TableCell>
                      <TableCell className="font-bold text-green-600">{formatCurrency(payslip.net_pay)}</TableCell>
                      <TableCell>
                        <Badge variant="default">{payslip.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`View payslip ${payslip.period}`}
                            title={`View payslip ${payslip.period}`}
                            onClick={() => setSelectedPayslip(payslip)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Download payslip ${payslip.period}`}
                            title={`Download payslip ${payslip.period}`}
                            onClick={() => window.open(`/api/payroll/${payslip.payroll_id}/payslip`, '_blank')}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {payslip.status === 'Paid' && (
                            payslip.claimed_at ? (
                              <Badge variant="secondary">
                                Claimed {new Date(payslip.claimed_at).toLocaleDateString()}
                              </Badge>
                            ) : (
                              <Button variant="outline" size="sm" onClick={() => confirmReceipt(payslip)}>
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Confirm Receipt
                              </Button>
                            )
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={!!selectedPayslip} onOpenChange={() => setSelectedPayslip(null)}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payslip - {selectedPayslip?.period}
              </DialogTitle>
            </DialogHeader>
            {selectedPayslip && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Pay Period</p>
                    <p className="font-medium">{selectedPayslip.period}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Days Worked</p>
                    <p className="font-medium">{selectedPayslip.days_worked} days</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-semibold mb-3">Earnings</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Basic Pay</span>
                      <span>{formatCurrency(selectedPayslip.earnings.basic_pay)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Overtime Pay</span>
                      <span>{formatCurrency(selectedPayslip.earnings.overtime_pay)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Night Shift Pay</span>
                      <span>{formatCurrency(selectedPayslip.earnings.night_shift_pay)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Holiday Pay</span>
                      <span>{formatCurrency(selectedPayslip.earnings.holiday_pay)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Allowances</span>
                      <span>{formatCurrency(selectedPayslip.earnings.allowances)}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between font-semibold">
                      <span>Gross Pay</span>
                      <span>{formatCurrency(selectedPayslip.gross_pay)}</span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="font-semibold">Deductions</h4>
                    <Badge variant={selectedPayslip.deductions.is_balanced === false ? 'destructive' : 'secondary'}>
                      {selectedPayslip.deductions.is_balanced === false ? 'Review Required' : 'Balanced'}
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    {getDeductionLines(selectedPayslip).map((line) => (
                      <div key={line.key} className="space-y-1">
                        <div className="flex items-start justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <div className="font-medium">{line.label}</div>
                            {line.note && <div className="text-xs text-muted-foreground">{line.note}</div>}
                          </div>
                          <span className="shrink-0 font-medium text-red-600">{formatDeduction(line.amount)}</span>
                        </div>
                        <div className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                          <span>{line.basis}</span>
                          {line.amount === 0 && (
                            <span className="block">No deduction recorded for this payroll period.</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {(selectedPayslip.deductions.warnings || []).map((warning) => (
                    <div key={warning} className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {warning}
                    </div>
                  ))}
                  <div className="mt-3 space-y-2 rounded-md bg-muted p-3 text-sm">
                    <div className="flex justify-between">
                      <span>Reconciliation Difference</span>
                      <span>{formatCurrency(Math.abs(selectedPayslip.deductions.reconciliation_difference ?? 0))}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between font-semibold">
                      <span>Recorded Total Deductions</span>
                      <span className="text-red-600">{formatDeduction(selectedPayslip.deductions.recorded_total ?? selectedPayslip.total_deductions)}</span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-between items-center p-4 bg-muted">
                  <span className="text-lg font-bold">NET PAY</span>
                  <span className="text-2xl font-bold text-green-600">
                    {formatCurrency(selectedPayslip.net_pay)}
                  </span>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => window.open(`/api/payroll/${selectedPayslip.payroll_id}/payslip`, '_blank')}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </Button>
                  <Button onClick={() => window.open(`/api/payroll/${selectedPayslip.payroll_id}/payslip`, '_blank')}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
