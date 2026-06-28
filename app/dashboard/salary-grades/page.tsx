'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { useAuth } from '@/lib/auth/auth-context';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, AlertTriangle, DollarSign } from 'lucide-react';
import { convertToMonthly, getAllConversionRates } from '@/lib/salary/conversion';

interface SalaryGrade {
  id: number;
  grade_name: string;
  amount: number;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type SalaryFrequency = SalaryGrade['frequency'];

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function SalaryGradesPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useSWR<{ success: boolean; grades: SalaryGrade[] }>('/api/salary-grades', fetcher);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    grade_name: '',
    amount: '',
    frequency: 'daily' as SalaryFrequency,
    description: '',
  });

  const salaryGrades = data?.grades || [];

  // Only DEV role can access this page
  if (user && user.role !== 'DEV') {
    return (
      <div className="flex flex-col h-full">
        <DashboardHeader title="Salary Grades" description="Configure salary grade definitions" />
        <div className="flex-1 p-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              Only DEV users can access salary grade configuration. Contact your system administrator.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  const handleOpenDialog = (grade?: SalaryGrade) => {
    if (grade) {
      setEditingId(grade.id);
      setFormData({
        grade_name: grade.grade_name,
        amount: grade.amount.toString(),
        frequency: grade.frequency,
        description: grade.description || '',
      });
    } else {
      setEditingId(null);
      setFormData({
        grade_name: '',
        amount: '',
        frequency: 'daily',
        description: '',
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.grade_name || !formData.amount) {
      toast.error('Grade name and amount are required');
      return;
    }

    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Amount must be a valid positive number');
      return;
    }

    try {
      if (editingId) {
        // Update existing
        const response = await fetch('/api/salary-grades', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingId,
            grade_name: formData.grade_name,
            amount,
            frequency: formData.frequency,
            description: formData.description || null,
          }),
        });

        if (!response.ok) throw new Error('Failed to update');
        toast.success('Salary grade updated successfully');
      } else {
        // Create new
        const response = await fetch('/api/salary-grades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grade_name: formData.grade_name,
            amount,
            frequency: formData.frequency,
            description: formData.description || null,
          }),
        });

        if (!response.ok) throw new Error('Failed to create');
        toast.success('Salary grade created successfully');
      }

      mutate('/api/salary-grades');
      setIsDialogOpen(false);
    } catch (err) {
      console.error('[v0] Error saving salary grade:', err);
      toast.error('Failed to save salary grade');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this salary grade?')) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/salary-grades?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete');
      
      toast.success('Salary grade deleted successfully');
      mutate('/api/salary-grades');
    } catch (err) {
      console.error('[v0] Error deleting salary grade:', err);
      toast.error('Failed to delete salary grade');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader
        title="Salary Grades"
        description="Configure pay scales and salary grade definitions (DEV only)"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Header with Add button */}
        <div className="flex justify-between items-center">
          <div>
            <p className="text-muted-foreground">
              Define salary grades that link to positions for automatic salary calculation.
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Salary Grade
          </Button>
        </div>

        {/* Salary Grades Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Active Salary Grades
            </CardTitle>
            <CardDescription>View and manage all salary grade configurations</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading salary grades...</div>
            ) : error ? (
              <div className="text-center py-8 text-red-500">Failed to load salary grades</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Grade Name</TableHead>
                      <TableHead>Base Amount</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Monthly Rate</TableHead>
                      <TableHead>Daily Rate</TableHead>
                      <TableHead>Hourly Rate</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salaryGrades.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No salary grades configured. Add your first salary grade to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      salaryGrades.map((grade) => {
                        const rates = getAllConversionRates(grade.amount, grade.frequency);
                        return (
                          <TableRow key={grade.id}>
                            <TableCell className="font-medium">{grade.grade_name}</TableCell>
                            <TableCell>
                              {grade.amount.toLocaleString('en-PH', {
                                style: 'currency',
                                currency: 'PHP',
                              })}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {grade.frequency}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {rates.monthly.toLocaleString('en-PH', {
                                style: 'currency',
                                currency: 'PHP',
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell>
                              {rates.daily.toLocaleString('en-PH', {
                                style: 'currency',
                                currency: 'PHP',
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell>
                              {rates.hourly.toLocaleString('en-PH', {
                                style: 'currency',
                                currency: 'PHP',
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                              {grade.description || '-'}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenDialog(grade)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(grade.id)}
                                  disabled={isDeleting}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Salary Grade' : 'Add New Salary Grade'}</DialogTitle>
              <DialogDescription>
                {editingId ? 'Update the salary grade details' : 'Create a new salary grade configuration'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="grade-name">Grade Name *</Label>
                <Input
                  id="grade-name"
                  value={formData.grade_name}
                  onChange={(e) => setFormData({ ...formData, grade_name: e.target.value })}
                  placeholder="e.g., Level 3-C (Senior)"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (PHP) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="25000"
                    step="0.01"
                    min="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="frequency">Frequency *</Label>
                  <Select
                    value={formData.frequency}
                    onValueChange={(value: SalaryFrequency) => 
                      setFormData({ ...formData, frequency: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Grade description (optional)"
                />
              </div>

              {formData.amount && parseFloat(formData.amount) > 0 && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <p className="text-sm font-medium mb-2">Conversion Preview:</p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Monthly:</p>
                        <p className="font-semibold">
                          {convertToMonthly(parseFloat(formData.amount), formData.frequency).toLocaleString('en-PH', {
                            style: 'currency',
                            currency: 'PHP',
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Daily (22 days):</p>
                        <p className="font-semibold">
                          {(convertToMonthly(parseFloat(formData.amount), formData.frequency) / 22).toLocaleString('en-PH', {
                            style: 'currency',
                            currency: 'PHP',
                            maximumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Hourly (8 hrs):</p>
                        <p className="font-semibold">
                          {(convertToMonthly(parseFloat(formData.amount), formData.frequency) / 22 / 8).toLocaleString('en-PH', {
                            style: 'currency',
                            currency: 'PHP',
                            maximumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {editingId ? 'Update Grade' : 'Create Grade'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
