'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth/auth-context';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Plus, Calendar, CalendarSync, Edit, Trash2 } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((response) => response.json());

interface Holiday {
  id: number;
  name: string;
  date: string;
  type: 'Regular' | 'Special';
  observance_type: 'Fixed' | 'Movable';
  pay_multiplier: number;
  multiplier?: number;
}

export default function HolidaysPage() {
  const { user } = useAuth();
  const { data, mutate } = useSWR<{ holidays?: Holiday[] }>('/api/holidays', fetcher);
  const holidays = Array.isArray(data?.holidays) ? data.holidays : [];
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    type: 'Regular' as 'Regular' | 'Special',
    observanceType: 'Fixed' as 'Fixed' | 'Movable',
    multiplier: '2.0',
  });

  const canEdit = user?.role === 'DEV' || user?.role === 'CEO' || user?.role === 'Admin';

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'Regular':
        return <Badge variant="default">Regular Holiday</Badge>;
      case 'Special':
        return <Badge variant="secondary">Special Holiday</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/holidays', {
        method: editingHoliday ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingHoliday?.id,
          name: formData.name,
          date: formData.date,
          type: formData.type,
          observance_type: formData.observanceType,
          pay_multiplier: Number(formData.multiplier),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to save holiday');
      toast.success(editingHoliday ? 'Holiday updated successfully' : 'Holiday added successfully');
      await mutate();
      setIsDialogOpen(false);
      setEditingHoliday(null);
      setFormData({ name: '', date: '', type: 'Regular', observanceType: 'Fixed', multiplier: '2.0' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save holiday');
    }
  };

  const handleEdit = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setFormData({
      name: holiday.name,
      date: holiday.date,
      type: holiday.type as 'Regular' | 'Special',
      observanceType: holiday.observance_type || 'Fixed',
      multiplier: String(holiday.pay_multiplier ?? holiday.multiplier ?? 2),
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/holidays?id=${id}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to delete holiday');
      toast.success('Holiday deleted successfully');
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete holiday');
    }
  };

  // Group holidays by month
  const upcomingHolidays = holidays
    .filter(h => new Date(h.date) >= new Date())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader
        title="Holidays"
        description="Manage fixed and movable observance dates used in payroll"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Upcoming Holidays */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Holidays</CardTitle>
            <CardDescription>Next 5 holidays</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-5">
              {upcomingHolidays.map((holiday) => (
                <div key={holiday.id} className="p-4 border border-border text-center">
                  <Calendar className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="font-medium text-sm">{holiday.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(holiday.date), 'MMM dd, yyyy')}
                  </p>
                  <Badge variant={holiday.type === 'Regular' ? 'default' : 'secondary'} className="mt-2 text-xs">
                    {holiday.pay_multiplier}x Pay
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* All Holidays */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>All Holidays</CardTitle>
                <CardDescription>{holidays.length} holidays this year</CardDescription>
              </div>
              {canEdit && (
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                  setIsDialogOpen(open);
                  if (!open) {
                    setEditingHoliday(null);
                    setFormData({ name: '', date: '', type: 'Regular', observanceType: 'Fixed', multiplier: '2.0' });
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Holiday
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingHoliday ? 'Edit Holiday' : 'Add Holiday'}</DialogTitle>
                      <DialogDescription>
                        {editingHoliday ? 'Update holiday details' : 'Add a new holiday to the calendar'}
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Holiday Name</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="e.g., New Year"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                        <Input
                          id="date"
                          type="date"
                          value={formData.date}
                          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="type">Type</Label>
                          <Select
                            value={formData.type}
                            onValueChange={(value) => {
                              setFormData({
                                ...formData,
                                type: value as 'Regular' | 'Special',
                                multiplier: value === 'Regular' ? '2.0' : '1.3',
                              });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Regular">Regular Holiday</SelectItem>
                              <SelectItem value="Special">Special Holiday</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="multiplier">Pay Multiplier</Label>
                          <Input
                            id="multiplier"
                            type="number"
                            step="0.1"
                            min="1"
                            max="3"
                            value={formData.multiplier}
                            onChange={(e) => setFormData({ ...formData, multiplier: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="observanceType">Observance</Label>
                        <Select
                          value={formData.observanceType}
                          onValueChange={(value) => setFormData({ ...formData, observanceType: value as 'Fixed' | 'Movable' })}
                        >
                          <SelectTrigger id="observanceType">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Fixed">Fixed Date</SelectItem>
                            <SelectItem value="Movable">Movable Date</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit">
                          {editingHoliday ? 'Update' : 'Add'} Holiday
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Holiday</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Observance</TableHead>
                  <TableHead>Pay Multiplier</TableHead>
                  {canEdit && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {holidays.map((holiday) => (
                  <TableRow key={holiday.id}>
                    <TableCell className="font-medium">{holiday.name}</TableCell>
                    <TableCell>{format(new Date(holiday.date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{format(new Date(holiday.date), 'EEEE')}</TableCell>
                    <TableCell>{getTypeBadge(holiday.type)}</TableCell>
                    <TableCell>
                      <Badge variant={holiday.observance_type === 'Movable' ? 'secondary' : 'outline'}>
                        {holiday.observance_type || 'Fixed'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{holiday.pay_multiplier}x</Badge>
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(holiday)}
                            title={holiday.observance_type === 'Movable' ? 'Reschedule movable holiday' : 'Edit holiday'}
                          >
                            {holiday.observance_type === 'Movable' ? <CalendarSync className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700"
                            onClick={() => handleDelete(holiday.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
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
