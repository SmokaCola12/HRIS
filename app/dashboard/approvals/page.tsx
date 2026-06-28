'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CheckCircle, XCircle, Clock, Calendar, CreditCard, RefreshCw } from 'lucide-react';

interface LeaveRequest {
  id: number;
  employee_id: number;
  employeeName: string;
  employeeIdStr: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: string;
  created_at: string;
}

interface OTRequest {
  id: number;
  employee_id: number;
  employeeName: string;
  employeeIdStr: string;
  ot_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  reason: string | null;
  status: string;
  created_at: string;
}

interface SalaryAdvanceRequest {
  id: number;
  employee_id: number;
  employeeName: string;
  employeeIdStr: string;
  amount: number;
  reason: string | null;
  repayment_months: number;
  status: string;
  created_at: string;
}

interface IncentiveRequest {
  id: number;
  employee_id: number;
  employeeName: string;
  employeeIdStr: string;
  type: string;
  amount: number;
  reason: string | null;
  status: string;
  created_at: string;
}

interface LoanExtensionRequest {
  id: number;
  employee_id: number;
  employeeName: string;
  employeeIdStr: string;
  salary_advance_id: number;
  requested_extra_months: number;
  reason: string | null;
  status: string;
  created_at: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
};

export default function ApprovalsPage() {
  const [selectedRequest, setSelectedRequest] = useState<{ type: string; data: LeaveRequest | OTRequest | SalaryAdvanceRequest | IncentiveRequest | LoanExtensionRequest } | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [remarks, setRemarks] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: approvalsData, isLoading, mutate } = useSWR<{
    pending: {
      leave: LeaveRequest[];
      ot: OTRequest[];
      salary_advance: SalaryAdvanceRequest[];
      incentive: IncentiveRequest[];
      loan_extension: LoanExtensionRequest[];
    };
  }>('/api/approvals', fetcher);

  // Filter only pending requests
  const pendingLeave = approvalsData?.pending?.leave || [];
  const pendingOT = approvalsData?.pending?.ot || [];
  const pendingAdvance = approvalsData?.pending?.salary_advance || [];
  const pendingIncentive = approvalsData?.pending?.incentive || [];
  const pendingLoanExtension = approvalsData?.pending?.loan_extension || [];

  const handleAction = async () => {
    if (!selectedRequest || !actionType) return;
    
    setIsProcessing(true);
    try {
      const requestType =
        selectedRequest.type === 'OT'
          ? 'ot'
          : selectedRequest.type === 'Leave'
            ? 'leave'
            : selectedRequest.type === 'Incentive'
              ? 'incentive'
              : selectedRequest.type === 'Loan Extension'
                ? 'loan_extension'
                : 'salary_advance';

      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request_type: requestType,
          request_id: selectedRequest.data.id,
          action: actionType,
          remarks: actionType === 'reject' ? remarks : undefined,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update request');
      }

      toast.success(`Request ${actionType === 'approve' ? 'approved' : 'rejected'} successfully`);
      
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to process request');
    } finally {
      setSelectedRequest(null);
      setActionType(null);
      setRemarks('');
      setIsProcessing(false);
    }
  };

  const openActionDialog = (type: string, data: LeaveRequest | OTRequest | SalaryAdvanceRequest | IncentiveRequest | LoanExtensionRequest, action: 'approve' | 'reject') => {
    setSelectedRequest({ type, data });
    setActionType(action);
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'Sick':
        return <Badge variant="destructive">{type}</Badge>;
      case 'Paid':
        return <Badge variant="default">{type}</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount);
  };

  const totalPending = pendingOT.length + pendingLeave.length + pendingAdvance.length + pendingIncentive.length + pendingLoanExtension.length;

  const refreshAll = () => {
    mutate();
  };

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader
        title="Approvals"
        description="Review and approve pending requests"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Summary */}
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Pending</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-yellow-600">{totalPending}</div>
                  <p className="text-xs text-muted-foreground">Requests need action</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">OT Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{pendingOT.length}</div>
                  <p className="text-xs text-muted-foreground">Pending approval</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Leave Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{pendingLeave.length}</div>
                  <p className="text-xs text-muted-foreground">Pending approval</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Salary Advances</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{pendingAdvance.length}</div>
                  <p className="text-xs text-muted-foreground">Pending approval</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Incentives</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{pendingIncentive.length}</div>
                  <p className="text-xs text-muted-foreground">Pending approval</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Extensions</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{pendingLoanExtension.length}</div>
                  <p className="text-xs text-muted-foreground">Pending approval</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Card>
          <Tabs defaultValue="ot" className="w-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <TabsList className="grid w-full max-w-3xl grid-cols-5">
                  <TabsTrigger value="ot">
                    OT ({pendingOT.length})
                  </TabsTrigger>
                  <TabsTrigger value="leave">
                    Leave ({pendingLeave.length})
                  </TabsTrigger>
                  <TabsTrigger value="advance">
                    Advance ({pendingAdvance.length})
                  </TabsTrigger>
                  <TabsTrigger value="incentive">
                    Incentives ({pendingIncentive.length})
                  </TabsTrigger>
                  <TabsTrigger value="loan-extension">
                    Extensions ({pendingLoanExtension.length})
                  </TabsTrigger>
                </TabsList>
                <Button variant="outline" size="sm" onClick={refreshAll}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* OT Requests */}
              <TabsContent value="ot" className="mt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Submitted</TableHead>
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
                    ) : pendingOT.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No pending OT requests
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingOT.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium">
                            <div>
                              <p>{request.employeeName}</p>
                              <p className="text-xs text-muted-foreground">{request.employeeIdStr}</p>
                            </div>
                          </TableCell>
                          <TableCell>{format(new Date(request.ot_date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {request.start_time} - {request.end_time}
                            </span>
                          </TableCell>
                          <TableCell>{request.hours}h</TableCell>
                          <TableCell className="max-w-[150px] truncate">{request.reason || '-'}</TableCell>
                          <TableCell>{format(new Date(request.created_at), 'MMM dd')}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => openActionDialog('OT', request, 'approve')}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => openActionDialog('OT', request, 'reject')}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              {/* Leave Requests */}
              <TabsContent value="leave" className="mt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Submitted</TableHead>
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
                    ) : pendingLeave.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No pending leave requests
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingLeave.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium">
                            <div>
                              <p>{request.employeeName}</p>
                              <p className="text-xs text-muted-foreground">{request.employeeIdStr}</p>
                            </div>
                          </TableCell>
                          <TableCell>{getTypeBadge(request.leave_type)}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(request.start_date), 'MMM dd')}
                              {request.start_date !== request.end_date && (
                                <> - {format(new Date(request.end_date), 'MMM dd')}</>
                              )}
                            </span>
                          </TableCell>
                          <TableCell>{request.days} day(s)</TableCell>
                          <TableCell className="max-w-[150px] truncate">{request.reason || '-'}</TableCell>
                          <TableCell>{format(new Date(request.created_at), 'MMM dd')}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => openActionDialog('Leave', request, 'approve')}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => openActionDialog('Leave', request, 'reject')}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              {/* Salary Advance */}
              <TabsContent value="advance" className="mt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Repayment</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <div className="flex justify-center py-8">
                            <Skeleton className="h-8 w-48" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : pendingAdvance.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No pending salary advance requests
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingAdvance.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium">
                            <div>
                              <p>{request.employeeName}</p>
                              <p className="text-xs text-muted-foreground">{request.employeeIdStr}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1 font-medium">
                              <CreditCard className="h-3 w-3" />
                              {formatCurrency(request.amount)}
                            </span>
                          </TableCell>
                          <TableCell>{request.repayment_months} month(s)</TableCell>
                          <TableCell className="max-w-[200px] truncate">{request.reason || '-'}</TableCell>
                          <TableCell>{format(new Date(request.created_at), 'MMM dd')}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => openActionDialog('Salary Advance', request, 'approve')}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => openActionDialog('Salary Advance', request, 'reject')}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="incentive" className="mt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={6}><div className="flex justify-center py-8"><Skeleton className="h-8 w-48" /></div></TableCell></TableRow>
                    ) : pendingIncentive.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No pending incentive requests</TableCell></TableRow>
                    ) : pendingIncentive.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium"><div><p>{request.employeeName}</p><p className="text-xs text-muted-foreground">{request.employeeIdStr}</p></div></TableCell>
                        <TableCell>{request.type}</TableCell>
                        <TableCell>{formatCurrency(request.amount)}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{request.reason || '-'}</TableCell>
                        <TableCell>{format(new Date(request.created_at), 'MMM dd')}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={() => openActionDialog('Incentive', request, 'approve')}><CheckCircle className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => openActionDialog('Incentive', request, 'reject')}><XCircle className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="loan-extension" className="mt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Advance ID</TableHead>
                      <TableHead>Extra Months</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={6}><div className="flex justify-center py-8"><Skeleton className="h-8 w-48" /></div></TableCell></TableRow>
                    ) : pendingLoanExtension.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No pending loan extension requests</TableCell></TableRow>
                    ) : pendingLoanExtension.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium"><div><p>{request.employeeName}</p><p className="text-xs text-muted-foreground">{request.employeeIdStr}</p></div></TableCell>
                        <TableCell>#{request.salary_advance_id}</TableCell>
                        <TableCell>{request.requested_extra_months} month(s)</TableCell>
                        <TableCell className="max-w-[200px] truncate">{request.reason || '-'}</TableCell>
                        <TableCell>{format(new Date(request.created_at), 'MMM dd')}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={() => openActionDialog('Loan Extension', request, 'approve')}><CheckCircle className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => openActionDialog('Loan Extension', request, 'reject')}><XCircle className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        {/* Action Dialog */}
        <Dialog open={!!selectedRequest && !!actionType} onOpenChange={() => { setSelectedRequest(null); setActionType(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {actionType === 'approve' ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                {actionType === 'approve' ? 'Approve' : 'Reject'} {selectedRequest?.type} Request
              </DialogTitle>
              <DialogDescription>
                {actionType === 'approve'
                  ? 'Are you sure you want to approve this request?'
                  : 'Please provide a reason for rejecting this request.'}
              </DialogDescription>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Employee:</span>{' '}
                    <span className="font-medium">
                      {'employeeName' in selectedRequest.data ? selectedRequest.data.employeeName : 'Unknown'}
                    </span>
                  </p>
                  {selectedRequest.type === 'OT' && 'ot_date' in selectedRequest.data && (
                    <>
                      <p className="text-sm">
                        <span className="text-muted-foreground">Date:</span>{' '}
                        {format(new Date(selectedRequest.data.ot_date), 'MMM dd, yyyy')}
                      </p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">Hours:</span>{' '}
                        {selectedRequest.data.hours}h
                      </p>
                    </>
                  )}
                  {selectedRequest.type === 'Leave' && 'days' in selectedRequest.data && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Duration:</span>{' '}
                      {selectedRequest.data.days} day(s)
                    </p>
                  )}
                  {selectedRequest.type === 'Salary Advance' && 'amount' in selectedRequest.data && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Amount:</span>{' '}
                      {formatCurrency(selectedRequest.data.amount)}
                    </p>
                  )}
                  {selectedRequest.type === 'Incentive' && 'amount' in selectedRequest.data && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Amount:</span>{' '}
                      {formatCurrency(selectedRequest.data.amount)}
                    </p>
                  )}
                  {selectedRequest.type === 'Loan Extension' && 'requested_extra_months' in selectedRequest.data && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Extra Months:</span>{' '}
                      {selectedRequest.data.requested_extra_months}
                    </p>
                  )}
                  <p className="text-sm">
                    <span className="text-muted-foreground">Reason:</span>{' '}
                    {selectedRequest.data.reason || '-'}
                  </p>
                </div>
                {actionType === 'reject' && (
                  <div className="space-y-2">
                    <Label htmlFor="remarks">Rejection Reason</Label>
                    <Textarea
                      id="remarks"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Enter reason for rejection..."
                      required
                    />
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setSelectedRequest(null); setActionType(null); }}>
                Cancel
              </Button>
              <Button
                variant={actionType === 'approve' ? 'default' : 'destructive'}
                onClick={handleAction}
                disabled={isProcessing || (actionType === 'reject' && !remarks.trim())}
              >
                {isProcessing ? 'Processing...' : actionType === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
