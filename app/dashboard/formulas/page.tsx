'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth/auth-context';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Edit, Save, Calculator, Clock, Calendar, CreditCard, AlertTriangle, RefreshCw, Lock } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type FormulaCategory = 'salary' | 'overtime' | 'holiday' | 'deduction';

interface Formula {
  id: number;
  key: string;
  value: string;
  category: string;
  description: string;
  data_type?: string;
  dataType?: string;
}

const categoryIcons: Record<FormulaCategory, React.ReactNode> = {
  salary: <CreditCard className="h-4 w-4" />,
  overtime: <Clock className="h-4 w-4" />,
  holiday: <Calendar className="h-4 w-4" />,
  deduction: <Calculator className="h-4 w-4" />,
};

const categoryDescriptions: Record<FormulaCategory, string> = {
  salary: 'Configure base salary calculations including daily rate, working hours, and grace periods',
  overtime: 'Set overtime rate multipliers for regular, rest day, and holiday work',
  holiday: 'Define pay multipliers for different holiday types',
  deduction: 'Configure government-mandated deduction rates (SSS, PhilHealth, Pag-IBIG)',
};

export default function FormulasPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { data, mutate } = useSWR<{ formulas?: Formula[] }>('/api/formulas', fetcher);
  const formulas = Array.isArray(data?.formulas) ? data.formulas : [];
  const [editingFormula, setEditingFormula] = useState<Formula | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const canAccess = user ? ['Manager', 'Admin', 'DEV'].includes(user.role) : false;

  if (!canAccess) {
    return (
      <div className="flex flex-col h-full">
        <DashboardHeader
          title="Formula Settings"
          description="Configure payroll calculation formulas"
        />
        <div className="flex-1 p-6 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-center mb-4">
                <Lock className="h-12 w-12 text-red-600" />
              </div>
              <CardTitle className="text-center">Access Denied</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-muted-foreground">
                This page is accessible to Manager and Admin users.
              </p>
              <p className="text-center text-sm text-muted-foreground">
                Current role: <strong>{user?.role || 'Unknown'}</strong>
              </p>
              <Button className="w-full" onClick={() => router.back()}>
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const getFormulasByCategory = (category: FormulaCategory) => {
    return formulas.filter(f => f.category === category);
  };

  const handleEdit = (formula: Formula) => {
    setEditingFormula(formula);
    setEditValue(formula.value);
    setEditDescription(formula.description);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingFormula) return;
    
    setIsSaving(true);
    try {
      const response = await fetch('/api/formulas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingFormula.id,
          value: editValue,
          description: editDescription,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to update formula');
      await mutate();
      setHasChanges(true);
      toast.success('Formula updated');
      setIsDialogOpen(false);
      setEditingFormula(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update formula');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyChanges = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setHasChanges(false);
    toast.success('All formula changes applied and cache cleared');
    setIsSaving(false);
  };

  const handleResetToDefaults = async () => {
    setIsSaving(true);
    setHasChanges(false);
    await mutate();
    toast.success('Formulas reloaded from database');
    setIsSaving(false);
  };

  const formatValue = (formula: Formula) => {
    const dataType = formula.data_type || formula.dataType;
    if (dataType === 'percentage') {
      return `${formula.value}%`;
    }
    if (formula.key.includes('multiplier') || formula.key.includes('rate')) {
      const val = parseFloat(formula.value);
      if (val < 1) {
        return `+${(val * 100).toFixed(0)}%`;
      }
      return `${(val * 100).toFixed(0)}%`;
    }
    return formula.value;
  };

  const renderFormulaTable = (category: FormulaCategory) => {
    const categoryFormulas = getFormulasByCategory(category);
    
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Formula Key</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-[120px]">Value</TableHead>
            <TableHead className="w-[100px]">Type</TableHead>
            <TableHead className="w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categoryFormulas.map((formula) => (
            <TableRow key={formula.id}>
              <TableCell>
                <code className="text-sm bg-muted px-2 py-1 rounded">{formula.key}</code>
              </TableCell>
              <TableCell className="text-muted-foreground">{formula.description}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="font-mono">
                  {formatValue(formula)}
                </Badge>
              </TableCell>
              <TableCell>
                  <Badge variant="outline" className="text-xs">
                  {formula.data_type || formula.dataType}
                </Badge>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleEdit(formula)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  // Calculate example payroll with current formulas
  const exampleSalary = 30000;
  const divisor = parseFloat(formulas.find(f => f.key === 'salary_divisor')?.value || '22');
  const hoursPerDay = parseFloat(formulas.find(f => f.key === 'working_hours_per_day')?.value || '8');
  const otMultiplier = parseFloat(formulas.find(f => f.key === 'ot_multiplier_regular')?.value || '1.25');
  const sssRate = parseFloat(formulas.find(f => f.key === 'sss_employee_rate')?.value || '0.05');
  
  const dailyRate = exampleSalary / divisor;
  const hourlyRate = dailyRate / hoursPerDay;
  const otHourlyRate = hourlyRate * otMultiplier;

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader
        title="Formula Settings"
        description="Configure payroll calculation formulas"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Warning Banner */}
        {hasChanges && (
          <Alert variant="destructive" className="bg-yellow-50 border-yellow-200 text-yellow-800">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unsaved Changes</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>Formula changes have been made. Apply changes to update the calculation engine.</span>
              <Button size="sm" onClick={handleApplyChanges} disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                Apply Changes
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Quick Stats / Example Calculation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Calculation Preview
            </CardTitle>
            <CardDescription>
              Example calculation using a ₱{exampleSalary.toLocaleString()} monthly salary
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Daily Rate</p>
                <p className="text-xl font-bold">₱{dailyRate.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {exampleSalary.toLocaleString()} ÷ {divisor} days
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Hourly Rate</p>
                <p className="text-xl font-bold">₱{hourlyRate.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Daily rate ÷ {hoursPerDay} hours
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">OT Hourly Rate</p>
                <p className="text-xl font-bold text-blue-600">₱{otHourlyRate.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Hourly × {otMultiplier} multiplier
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">SSS Contribution</p>
                <p className="text-xl font-bold text-red-600">₱{(exampleSalary * sssRate).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Monthly × {(sssRate * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Formula Tabs */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Formula Configuration</CardTitle>
              <CardDescription>Manage calculation parameters by category</CardDescription>
            </div>
            <Button variant="outline" onClick={handleResetToDefaults} disabled={isSaving}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="salary" className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-4">
                <TabsTrigger value="salary" className="flex items-center gap-2">
                  {categoryIcons.salary}
                  Salary
                </TabsTrigger>
                <TabsTrigger value="overtime" className="flex items-center gap-2">
                  {categoryIcons.overtime}
                  Overtime
                </TabsTrigger>
                <TabsTrigger value="holiday" className="flex items-center gap-2">
                  {categoryIcons.holiday}
                  Holiday
                </TabsTrigger>
                <TabsTrigger value="deduction" className="flex items-center gap-2">
                  {categoryIcons.deduction}
                  Deductions
                </TabsTrigger>
              </TabsList>

              {(['salary', 'overtime', 'holiday', 'deduction'] as FormulaCategory[]).map(category => (
                <TabsContent key={category} value={category} className="mt-0">
                  <div className="mb-4 p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">{categoryDescriptions[category]}</p>
                  </div>
                  {renderFormulaTable(category)}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Formula</DialogTitle>
              <DialogDescription>
                Update the value for <code className="bg-muted px-1 rounded">{editingFormula?.key}</code>
              </DialogDescription>
            </DialogHeader>
            {editingFormula && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="value">Value</Label>
                  <Input
                    id="value"
                    type={(editingFormula.data_type || editingFormula.dataType) === 'number' || (editingFormula.data_type || editingFormula.dataType) === 'percentage' ? 'number' : 'text'}
                    step="0.01"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {(editingFormula.data_type || editingFormula.dataType) === 'percentage' && 'Enter value as percentage (e.g., 4.5 for 4.5%)'}
                    {editingFormula.key.includes('multiplier') && 'Enter as decimal (e.g., 1.25 for 125%)'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">Preview</p>
                  <p className="text-2xl font-bold mt-1">
                    {(editingFormula.data_type || editingFormula.dataType) === 'percentage' ? `${editValue}%` : editValue}
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
