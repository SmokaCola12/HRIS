'use client';

import { FormEvent, useMemo, useState } from 'react';
import useSWR from 'swr';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Clock, Moon, Sun, Lock, CalendarDays } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface Shift {
  id: number;
  name: string;
  code: string | null;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  isNightShift: boolean;
  isActive: boolean;
}

interface ShiftFormData {
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  isNightShift: boolean;
  isActive: boolean;
}

interface FlexibleEmployee {
  id: number;
  employee_id: string;
  name: string;
  employment_type: string;
  department: string | null;
}

interface FlexibleAssignment {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_code?: string;
  shift_id: number | null;
  shift_name?: string | null;
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  status: string;
  notes?: string | null;
}

const initialFormData: ShiftFormData = {
  name: '',
  code: '',
  startTime: '08:00',
  endTime: '17:00',
  breakMinutes: '60',
  isNightShift: false,
  isActive: true,
};

const initialFlexibleForm = {
  id: null as number | null,
  employee_id: '',
  shift_id: 'custom',
  work_date: new Date().toISOString().slice(0, 10),
  start_time: '08:00',
  end_time: '17:00',
  break_minutes: '0',
  status: 'Confirmed',
  notes: '',
};

export default function ShiftsPage() {
  const { user } = useAuth();
  const { data, mutate } = useSWR('/api/shifts', fetcher);
  const { data: flexibleData, mutate: mutateFlexible } = useSWR('/api/shifts/flexible', fetcher);
  const shifts: Shift[] = data?.shifts || [];
  const flexibleEmployees: FlexibleEmployee[] = flexibleData?.employees || [];
  const flexibleAssignments: FlexibleAssignment[] = flexibleData?.assignments || [];
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [formData, setFormData] = useState<ShiftFormData>(initialFormData);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [isFlexibleDialogOpen, setIsFlexibleDialogOpen] = useState(false);
  const [flexibleForm, setFlexibleForm] = useState(initialFlexibleForm);
  const [isSavingFlexible, setIsSavingFlexible] = useState(false);

  const flexibleEmployeeMap = useMemo(() => new Map(flexibleEmployees.map((employee) => [employee.id, employee])), [flexibleEmployees]);

  const calculateWorkHours = (start: string, end: string, breakMins: number) => {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    
    let startMins = startH * 60 + startM;
    let endMins = endH * 60 + endM;
    
    // Handle night shift (end time is next day)
    if (endMins < startMins) {
      endMins += 24 * 60;
    }
    
    const totalMins = endMins - startMins - breakMins;
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    
    return `${hours}h ${mins > 0 ? `${mins}m` : ''}`.trim();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    try {
      const payload = {
        id: editingShift?.id,
        name: formData.name,
        code: formData.code,
        startTime: formData.startTime,
        endTime: formData.endTime,
        breakMinutes: parseInt(formData.breakMinutes),
        isNightShift: formData.isNightShift,
        isActive: formData.isActive,
      };

      const response = await fetch('/api/shifts', {
        method: editingShift ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save shift');

      await mutate(undefined, { revalidate: true });
      toast.success(editingShift ? 'Shift updated successfully' : 'Shift created successfully');
      setIsDialogOpen(false);
      setEditingShift(null);
      setFormData(initialFormData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save shift');
    }
  };

  const handleEdit = (shift: Shift) => {
    setEditingShift(shift);
    setFormData({
      name: shift.name,
      code: shift.code || '',
      startTime: shift.startTime,
      endTime: shift.endTime,
      breakMinutes: shift.breakMinutes.toString(),
      isNightShift: shift.isNightShift,
      isActive: shift.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      setIsDeleting(id);
      const response = await fetch(`/api/shifts?id=${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to delete shift');
      await mutate(undefined, { revalidate: true });
      toast.success('Shift deleted successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete shift');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleToggleActive = async (id: number) => {
    const shift = shifts.find(s => s.id === id);
    if (!shift) return;

    try {
      const response = await fetch('/api/shifts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...shift, isActive: !shift.isActive }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to update shift');
      await mutate();
      toast.success('Shift status updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update shift');
    }
  };

  const resetFlexibleForm = () => {
    setFlexibleForm(initialFlexibleForm);
  };

  const openFlexibleDialog = (assignment?: FlexibleAssignment) => {
    if (assignment) {
      setFlexibleForm({
        id: assignment.id,
        employee_id: String(assignment.employee_id),
        shift_id: assignment.shift_id ? String(assignment.shift_id) : 'custom',
        work_date: assignment.work_date,
        start_time: assignment.start_time,
        end_time: assignment.end_time,
        break_minutes: String(assignment.break_minutes || 0),
        status: assignment.status || 'Confirmed',
        notes: assignment.notes || '',
      });
    } else {
      resetFlexibleForm();
    }
    setIsFlexibleDialogOpen(true);
  };

  const applyShiftTemplate = (value: string) => {
    if (value === 'custom') {
      setFlexibleForm((current) => ({ ...current, shift_id: value }));
      return;
    }
    const selectedShift = shifts.find((shift) => String(shift.id) === value);
    setFlexibleForm((current) => ({
      ...current,
      shift_id: value,
      start_time: selectedShift?.startTime || current.start_time,
      end_time: selectedShift?.endTime || current.end_time,
      break_minutes: selectedShift ? String(selectedShift.breakMinutes || 0) : current.break_minutes,
    }));
  };

  const saveFlexibleAssignment = async () => {
    if (!flexibleForm.employee_id || !flexibleForm.work_date || !flexibleForm.start_time || !flexibleForm.end_time) {
      toast.error('Employee, date, start time, and end time are required');
      return;
    }

    try {
      setIsSavingFlexible(true);
      const response = await fetch('/api/shifts/flexible', {
        method: flexibleForm.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: flexibleForm.id || undefined,
          employee_id: flexibleForm.employee_id,
          shift_id: flexibleForm.shift_id === 'custom' ? null : flexibleForm.shift_id,
          work_date: flexibleForm.work_date,
          start_time: flexibleForm.start_time,
          end_time: flexibleForm.end_time,
          break_minutes: Number(flexibleForm.break_minutes || 0),
          status: flexibleForm.status,
          notes: flexibleForm.notes,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to save date-specific assignment');

      await mutateFlexible();
      toast.success(flexibleForm.id ? 'Date-specific assignment updated' : 'Date-specific assignment created');
      setIsFlexibleDialogOpen(false);
      resetFlexibleForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save date-specific assignment');
    } finally {
      setIsSavingFlexible(false);
    }
  };

  const updateFlexibleStatus = async (assignment: FlexibleAssignment, status: string) => {
    try {
      const response = await fetch('/api/shifts/flexible', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: assignment.id, status }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to update assignment');
      await mutateFlexible();
      toast.success('Date-specific assignment status updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update assignment');
    }
  };

  const deleteFlexibleAssignment = async (id: number) => {
    try {
      const response = await fetch(`/api/shifts/flexible?id=${id}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to delete assignment');
      await mutateFlexible();
      toast.success('Date-specific assignment deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete assignment');
    }
  };

  const activeShifts = shifts.filter(s => s.isActive);
  const inactiveShifts = shifts.filter(s => !s.isActive);
  const canAccess = user ? ['Manager', 'Admin', 'DEV'].includes(user.role) : false;

  if (!canAccess) {
    return (
      <div className="flex flex-col h-full">
        <DashboardHeader
          title="Shift Management"
          description="Configure work shifts and schedules"
        />
        <div className="flex-1 p-6 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-center mb-4">
                <Lock className="h-12 w-12 text-red-600" />
              </div>
              <CardTitle className="text-center">Access Denied</CardTitle>
              <CardDescription className="text-center">
                Shift Management is accessible to Manager and Admin users.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader
        title="Shift Management"
        description="Configure work shifts and schedules"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Shifts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{shifts.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active Shifts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{activeShifts.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Day Shifts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{shifts.filter(s => !s.isNightShift).length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Night Shifts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{shifts.filter(s => s.isNightShift).length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Shifts Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Work Shifts</CardTitle>
                <CardDescription>Manage employee work schedules</CardDescription>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) {
                  setEditingShift(null);
                  setFormData(initialFormData);
                }
              }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Shift
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingShift ? 'Edit Shift' : 'Add Shift'}</DialogTitle>
                    <DialogDescription>
                      {editingShift ? 'Update shift details' : 'Create a new work shift'}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Shift Name</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="e.g., Morning Shift"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="code">Code</Label>
                        <Input
                          id="code"
                          value={formData.code}
                          onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                          placeholder="e.g., AM"
                          maxLength={10}
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
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
                    <div className="space-y-2">
                      <Label htmlFor="breakMinutes">Break Duration (minutes)</Label>
                      <Input
                        id="breakMinutes"
                        type="number"
                        min="0"
                        max="120"
                        value={formData.breakMinutes}
                        onChange={(e) => setFormData({ ...formData, breakMinutes: e.target.value })}
                        required
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="isNightShift"
                          checked={formData.isNightShift}
                          onCheckedChange={(checked) => setFormData({ ...formData, isNightShift: checked })}
                        />
                        <Label htmlFor="isNightShift" className="flex items-center gap-1">
                          <Moon className="h-4 w-4" />
                          Night Shift
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="isActive"
                          checked={formData.isActive}
                          onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                        />
                        <Label htmlFor="isActive">Active</Label>
                      </div>
                    </div>
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm text-muted-foreground">
                        Work Hours: <span className="font-medium text-foreground">
                          {calculateWorkHours(formData.startTime, formData.endTime, parseInt(formData.breakMinutes) || 0)}
                        </span>
                      </p>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit">
                        {editingShift ? 'Update' : 'Create'} Shift
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shift Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Work Hours</TableHead>
                  <TableHead>Break</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((shift) => (
                  <TableRow key={shift.id} className={!shift.isActive ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">{shift.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{shift.code}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {shift.startTime} - {shift.endTime}
                      </span>
                    </TableCell>
                    <TableCell>
                      {calculateWorkHours(shift.startTime, shift.endTime, shift.breakMinutes)}
                    </TableCell>
                    <TableCell>{shift.breakMinutes} min</TableCell>
                    <TableCell>
                      {shift.isNightShift ? (
                        <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                          <Moon className="h-3 w-3" />
                          Night
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="flex items-center gap-1 w-fit">
                          <Sun className="h-3 w-3" />
                          Day
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={shift.isActive}
                        onCheckedChange={() => handleToggleActive(shift.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(shift)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(shift.id)}
                          disabled={isDeleting === shift.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {shifts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No shifts configured
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Date-Specific Shift Assignments
                </CardTitle>
                <CardDescription>Set manual one-day schedules or overrides for any active employee</CardDescription>
              </div>
              <Dialog open={isFlexibleDialogOpen} onOpenChange={(open) => {
                setIsFlexibleDialogOpen(open);
                if (!open) resetFlexibleForm();
              }}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" onClick={() => openFlexibleDialog()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Assignment
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[560px]">
                  <DialogHeader>
                    <DialogTitle>{flexibleForm.id ? 'Edit Assignment' : 'Add Assignment'}</DialogTitle>
                    <DialogDescription>Assign a date-specific shift or override for an employee.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Employee</Label>
                        <Select value={flexibleForm.employee_id} onValueChange={(value) => setFlexibleForm({ ...flexibleForm, employee_id: value })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select employee" />
                          </SelectTrigger>
                          <SelectContent>
                            {flexibleEmployees.length === 0 ? (
                              <SelectItem value="no-employees" disabled>No active employees</SelectItem>
                            ) : (
                              flexibleEmployees.map((employee) => (
                                <SelectItem key={employee.id} value={String(employee.id)}>
                              {employee.name} ({employee.employment_type})
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="flex-date">Work Date</Label>
                        <Input
                          id="flex-date"
                          type="date"
                          value={flexibleForm.work_date}
                          onChange={(event) => setFlexibleForm({ ...flexibleForm, work_date: event.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Shift Template</Label>
                      <Select value={flexibleForm.shift_id} onValueChange={applyShiftTemplate}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select template" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Custom time</SelectItem>
                          {shifts.map((shift) => (
                            <SelectItem key={shift.id} value={String(shift.id)}>
                              {shift.name} ({shift.startTime}-{shift.endTime})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="flex-start">Start</Label>
                        <Input
                          id="flex-start"
                          type="time"
                          value={flexibleForm.start_time}
                          onChange={(event) => setFlexibleForm({ ...flexibleForm, start_time: event.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="flex-end">End</Label>
                        <Input
                          id="flex-end"
                          type="time"
                          value={flexibleForm.end_time}
                          onChange={(event) => setFlexibleForm({ ...flexibleForm, end_time: event.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="flex-break">Break</Label>
                        <Input
                          id="flex-break"
                          type="number"
                          min="0"
                          max="180"
                          value={flexibleForm.break_minutes}
                          onChange={(event) => setFlexibleForm({ ...flexibleForm, break_minutes: event.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={flexibleForm.status} onValueChange={(value) => setFlexibleForm({ ...flexibleForm, status: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {['Offered', 'Confirmed', 'Declined', 'Cancelled', 'Completed'].map((status) => (
                            <SelectItem key={status} value={status}>{status}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="flex-notes">Notes</Label>
                      <Textarea
                        id="flex-notes"
                        value={flexibleForm.notes}
                        onChange={(event) => setFlexibleForm({ ...flexibleForm, notes: event.target.value })}
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsFlexibleDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={saveFlexibleAssignment} disabled={isSavingFlexible}>
                      {isSavingFlexible ? 'Saving...' : 'Save Assignment'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Break</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flexibleAssignments.map((assignment) => {
                  const employee = flexibleEmployeeMap.get(assignment.employee_id);
                  return (
                    <TableRow key={assignment.id}>
                      <TableCell className="font-medium">{assignment.work_date}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{assignment.employee_name || employee?.name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{assignment.employee_code || employee?.employee_id || ''}</p>
                        </div>
                      </TableCell>
                      <TableCell>{assignment.start_time} - {assignment.end_time}</TableCell>
                      <TableCell>{assignment.break_minutes} min</TableCell>
                      <TableCell><Badge variant={assignment.status === 'Cancelled' || assignment.status === 'Declined' ? 'destructive' : assignment.status === 'Offered' ? 'outline' : 'default'}>{assignment.status}</Badge></TableCell>
                      <TableCell className="max-w-56 truncate" title={assignment.notes || undefined}>{assignment.notes || '-'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {assignment.status === 'Offered' && (
                            <Button type="button" size="sm" variant="outline" onClick={() => updateFlexibleStatus(assignment, 'Confirmed')}>Confirm</Button>
                          )}
                          {assignment.status === 'Confirmed' && (
                            <Button type="button" size="sm" variant="outline" onClick={() => updateFlexibleStatus(assignment, 'Completed')}>Complete</Button>
                          )}
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => openFlexibleDialog(assignment)} title="Edit assignment">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => deleteFlexibleAssignment(assignment.id)} title="Delete assignment">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {flexibleAssignments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No date-specific shift assignments configured
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
