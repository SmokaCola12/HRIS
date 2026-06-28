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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Plus, Clock, RefreshCw, Printer } from 'lucide-react';

interface OTRequest {
  id: number;
  ot_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  reason: string | null;
  status: string;
  rejection_reason?: string | null;
  created_at: string;
}

const MAX_OT_HOURS = 4;

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function getHoursBetween(startTime: string, endTime: string) {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (start === null || end === null) return 0;
  if (end <= start) end += 24 * 60;
  return Number(((end - start) / 60).toFixed(2));
}

const fetcher = async (url: string) => {
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${document.cookie.split('auth_token=')[1]?.split(';')[0] || ''}`,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
};

export default function OvertimeRequestPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    date: '',
    startTime: '18:00',
    endTime: '20:00',
    reason: '',
  });

  const { data, isLoading, mutate } = useSWR<{ requests: OTRequest[] }>('/api/requests/ot', fetcher);
  const otRequests = data?.requests || [];

  const calculateHours = () => {
    return getHoursBetween(formData.startTime, formData.endTime);
  };
  const requestedHours = calculateHours();
  const isOverMax = requestedHours > MAX_OT_HOURS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/requests/ot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${document.cookie.split('auth_token=')[1]?.split(';')[0] || ''}`,
        },
        body: JSON.stringify({
          ot_date: formData.date,
          start_time: formData.startTime,
          end_time: formData.endTime,
          hours: calculateHours(),
          reason: formData.reason,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to submit request');
      }

      toast.success('OT request submitted successfully');
      setIsDialogOpen(false);
      setFormData({ date: '', startTime: '18:00', endTime: '20:00', reason: '' });
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit OT request');
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

  const printOtUtForm = async (requestId: number) => {
    try {
      const res = await fetch('/api/forms/overtime-undertime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ot_request_id: requestId, request_type: 'Overtime' }),
      });
      if (!res.ok) throw new Error('Failed to generate form');
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch {
      toast.error('Failed to generate OT/UT form');
    }
  };

  // Calculate stats from requests
  const approvedRequests = otRequests.filter(r => r.status === 'Approved');
  const pendingRequests = otRequests.filter(r => r.status === 'Pending');
  const rejectedRequests = otRequests.filter(r => r.status === 'Rejected');
  const totalApprovedHours = approvedRequests.reduce((sum, r) => sum + r.hours, 0);

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader
        title="Overtime Request"
        description="Submit and track your overtime requests"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total OT Hours</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{totalApprovedHours}</div>
                  <p className="text-xs text-muted-foreground">Approved hours</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-yellow-600">{pendingRequests.length}</div>
                  <p className="text-xs text-muted-foreground">Awaiting approval</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-green-600">{approvedRequests.length}</div>
                  <p className="text-xs text-muted-foreground">Total approved</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-red-600">{rejectedRequests.length}</div>
                  <p className="text-xs text-muted-foreground">Total rejected</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* OT Requests Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>My OT Requests</CardTitle>
                <CardDescription>View and manage your overtime applications</CardDescription>
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
                      New OT Request
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Submit OT Request</DialogTitle>
                      <DialogDescription>
                        Fill in the details for your overtime application
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="date">OT Date</Label>
                        <Input
                          id="date"
                          type="date"
                          value={formData.date}
                          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                          required
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="startTime">Start Time</Label>
                          <Input
                            id="startTime"
                            type="time"
                            value={formData.startTime}
                            onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="endTime">End Time</Label>
                          <Input
                            id="endTime"
                            type="time"
                            value={formData.endTime}
                            onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm font-medium">Total Hours: {requestedHours.toFixed(2)} hour(s)</p>
                        <p className={`text-xs ${isOverMax ? 'text-destructive' : 'text-muted-foreground'}`}>
                          Maximum allowed per OT request is {MAX_OT_HOURS} hours.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reason">Reason</Label>
                        <Textarea
                          id="reason"
                          value={formData.reason}
                          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                          placeholder="Explain the reason for overtime..."
                          required
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting || requestedHours <= 0 || isOverMax}>
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
                  <TableHead>Time</TableHead>
                  <TableHead>Hours</TableHead>
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
                ) : otRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No OT requests yet. Click &quot;New OT Request&quot; to submit one.
                    </TableCell>
                  </TableRow>
                ) : (
                  otRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>{format(new Date(request.ot_date), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {request.start_time} - {request.end_time}
                        </span>
                      </TableCell>
                      <TableCell>{request.hours}h</TableCell>
                      <TableCell className="max-w-[200px] truncate">{request.reason || '-'}</TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {request.status === 'Rejected' && request.rejection_reason}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => printOtUtForm(request.id)}>
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
