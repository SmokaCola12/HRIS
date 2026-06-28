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
import { Gift, Plus, RefreshCw } from 'lucide-react';

interface IncentiveRequest {
  id: number;
  type: string;
  amount: number;
  reason: string | null;
  status: string;
  rejection_reason?: string | null;
  created_at: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
};

export default function IncentivesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ type: 'Performance Bonus', amount: '', reason: '' });
  const { data, isLoading, mutate } = useSWR<{ requests: IncentiveRequest[] }>('/api/requests/incentives', fetcher);
  const requests = data?.requests || [];

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount || 0);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/requests/incentives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, amount: Number(formData.amount) }),
      });
      if (!res.ok) throw new Error('Failed to submit request');
      toast.success('Incentive request submitted');
      setIsDialogOpen(false);
      setFormData({ type: 'Performance Bonus', amount: '', reason: '' });
      mutate();
    } catch {
      toast.error('Failed to submit incentive request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'Approved') return <Badge>Approved</Badge>;
    if (status === 'Rejected') return <Badge variant="destructive">Rejected</Badge>;
    return <Badge variant="outline">Pending</Badge>;
  };

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader title="Incentives" description="Submit and track incentive requests" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>My Incentive Requests</CardTitle>
                <CardDescription>Performance, attendance, and other incentive claims</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => mutate()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="h-4 w-4 mr-2" />New Request</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Submit Incentive Request</DialogTitle>
                      <DialogDescription>Enter the incentive details for approval</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select value={formData.type} onValueChange={(type) => setFormData({ ...formData, type })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Performance Bonus">Performance Bonus</SelectItem>
                            <SelectItem value="Attendance Incentive">Attendance Incentive</SelectItem>
                            <SelectItem value="Referral Incentive">Referral Incentive</SelectItem>
                            <SelectItem value="Other Incentive">Other Incentive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="amount">Amount</Label>
                        <Input id="amount" type="number" min="1" value={formData.amount} onChange={(event) => setFormData({ ...formData, amount: event.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reason">Reason</Label>
                        <Textarea id="reason" value={formData.reason} onChange={(event) => setFormData({ ...formData, reason: event.target.value })} required />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={isSubmitting || !formData.amount}>{isSubmitting ? 'Submitting...' : 'Submit'}</Button>
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
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="py-8"><Skeleton className="h-8 w-48 mx-auto" /></TableCell></TableRow>
                ) : requests.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No incentive requests yet.</TableCell></TableRow>
                ) : requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{format(new Date(request.created_at), 'MMM dd, yyyy')}</TableCell>
                    <TableCell><span className="flex items-center gap-1"><Gift className="h-3 w-3" />{request.type}</span></TableCell>
                    <TableCell>{formatCurrency(request.amount)}</TableCell>
                    <TableCell className="max-w-[240px] truncate">{request.reason || '-'}</TableCell>
                    <TableCell>{statusBadge(request.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

