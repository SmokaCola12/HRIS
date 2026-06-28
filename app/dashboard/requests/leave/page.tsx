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
import { format, differenceInDays } from 'date-fns';
import { Plus, Calendar, RefreshCw, Printer } from 'lucide-react';

interface LeaveRequest {
  id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: string;
  rejection_reason?: string | null;
  created_at: string;
}

const leaveTypes = [
  { value: 'Service Incentive Leave', label: 'Service Incentive Leave', description: '5 days/year after 1 year tenure' },
  { value: 'Maternity Leave', label: 'Maternity Leave', description: 'Statutory maternity leave' },
  { value: 'Paternity Leave', label: 'Paternity Leave', description: '7 days' },
  { value: 'Parental Leave', label: 'Parental Leave', description: 'Solo parent leave' },
  { value: 'Leave for VAWC', label: 'Leave for VAWC', description: '10 days' },
  { value: 'Special Leave for Women', label: 'Special Leave for Women', description: 'Gynecological surgery' },
  { value: 'Sick', label: 'Sick Leave', description: 'Health-related absence' },
  { value: 'Unpaid', label: 'Unpaid Absence', description: 'No-work-no-pay absence' },
  { value: 'General', label: 'General Leave', description: 'Other non-statutory absence' },
];

const fetcher = async (url: string) => {
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${document.cookie.split('auth_token=')[1]?.split(';')[0] || ''}`,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
};

export default function LeaveRequestPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    leaveType: '',
    startDate: '',
    endDate: '',
    reason: '',
  });

  const { data, isLoading, mutate } = useSWR<{ requests: LeaveRequest[] }>('/api/requests/leave', fetcher);
  const leaveRequests = data?.requests || [];

  const calculateDays = () => {
    if (!formData.startDate || !formData.endDate) return 0;
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    return Math.max(1, differenceInDays(end, start) + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/requests/leave', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${document.cookie.split('auth_token=')[1]?.split(';')[0] || ''}`,
        },
        body: JSON.stringify({
          leave_type: formData.leaveType,
          start_date: formData.startDate,
          end_date: formData.endDate,
          days: calculateDays(),
          reason: formData.reason,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit request');

      toast.success('Leave request submitted successfully');
      setIsDialogOpen(false);
      setFormData({ leaveType: '', startDate: '', endDate: '', reason: '' });
      mutate();
    } catch (error) {
      toast.error('Failed to submit leave request');
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

  const printAbsenceForm = async (requestId: number) => {
    try {
      const res = await fetch('/api/forms/absence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leave_request_id: requestId }),
      });
      if (!res.ok) throw new Error('Failed to generate form');
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch {
      toast.error('Failed to generate absence form');
    }
  };

  // Calculate leave balance from requests
  const approvedLeave = leaveRequests.filter(r => r.status === 'Approved');
  const leaveBalance = {
    service: {
      used: approvedLeave.filter(r => r.leave_type === 'Service Incentive Leave').reduce((sum, r) => sum + r.days, 0),
      total: 5
    },
    sick: { 
      used: approvedLeave.filter(r => r.leave_type === 'Sick').reduce((sum, r) => sum + r.days, 0), 
      total: 10 
    },
  };

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader
        title="Leave Request"
        description="Submit and track your leave requests"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Leave Balance Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Service Incentive Leave</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {leaveBalance.service.total - leaveBalance.service.used}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {leaveBalance.service.used} used of {leaveBalance.service.total} days
                  </p>
                  <div className="mt-2 h-2 bg-muted rounded overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${(leaveBalance.service.used / leaveBalance.service.total) * 100}%` }}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Statutory Leave</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {approvedLeave.filter(r => !['Service Incentive Leave', 'Sick', 'Unpaid', 'General'].includes(r.leave_type)).reduce((sum, r) => sum + r.days, 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Maternity, paternity, parental, VAWC, women
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Sick Leave</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {leaveBalance.sick.total - leaveBalance.sick.used}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {leaveBalance.sick.used} used of {leaveBalance.sick.total} days
                  </p>
                  <div className="mt-2 h-2 bg-muted rounded overflow-hidden">
                    <div
                      className="h-full bg-red-500"
                      style={{ width: `${(leaveBalance.sick.used / leaveBalance.sick.total) * 100}%` }}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Leave Requests Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>My Leave Requests</CardTitle>
                <CardDescription>View and manage your leave applications</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => mutate()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      New Leave Request
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Submit Leave Request</DialogTitle>
                      <DialogDescription>
                        Fill in the details for your leave application
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="leaveType">Leave Type</Label>
                        <Select
                          value={formData.leaveType}
                          onValueChange={(value) => setFormData({ ...formData, leaveType: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select leave type" />
                          </SelectTrigger>
                          <SelectContent>
                            {leaveTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                <div>
                                  <span>{type.label}</span>
                                  <span className="text-xs text-muted-foreground ml-2">
                                    ({type.description})
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="startDate">Start Date</Label>
                          <Input
                            id="startDate"
                            type="date"
                            value={formData.startDate}
                            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="endDate">End Date</Label>
                          <Input
                            id="endDate"
                            type="date"
                            value={formData.endDate}
                            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm font-medium">Total Days: {calculateDays()} day(s)</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reason">Reason</Label>
                        <Textarea
                          id="reason"
                          value={formData.reason}
                          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                          placeholder="Explain the reason for your leave..."
                          required
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting || !formData.leaveType}>
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
                  <TableHead>Type</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Days</TableHead>
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
                ) : leaveRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No leave requests yet. Click &quot;New Leave Request&quot; to submit one.
                    </TableCell>
                  </TableRow>
                ) : (
                  leaveRequests.map((request) => (
                    <TableRow key={request.id}>
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
                      <TableCell className="max-w-[200px] truncate">{request.reason || '-'}</TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {request.status === 'Rejected' && request.rejection_reason}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => printAbsenceForm(request.id)}>
                          <Printer className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
