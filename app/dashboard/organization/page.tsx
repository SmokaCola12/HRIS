'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Building2, Briefcase, MapPin, Lock } from 'lucide-react';
import { toast } from 'sonner';
import useSWR, { mutate } from 'swr';
import { useAuth } from '@/lib/auth/auth-context';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface Department {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
}

interface Position {
  id: number;
  name: string;
  code: string | null;
  department_id: number | null;
  salary_grade_id: number | null;
  description: string | null;
}

interface SalaryGrade {
  id: number;
  grade_name: string;
  amount: number;
  frequency: string;
}

interface Area {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
}

export default function OrganizationPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('departments');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Department | Position | Area | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    department_id: '',
    salary_grade_id: '',
  });

  const { data: departmentsData } = useSWR('/api/organization/departments', fetcher);
  const { data: positionsData } = useSWR('/api/organization/positions', fetcher);
  const { data: areasData } = useSWR('/api/organization/areas', fetcher);

  const departments: Department[] = departmentsData?.departments || [];
  const positions: Position[] = positionsData?.positions || [];
  const areas: Area[] = areasData?.areas || [];
  const canAccess = user ? ['Manager', 'Admin', 'DEV'].includes(user.role) : false;

  const resetForm = () => {
    setFormData({ name: '', code: '', description: '', department_id: '', salary_grade_id: '' });
    setEditingItem(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (item: Department | Position | Area) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      code: item.code || '',
      description: item.description || '',
      department_id: 'department_id' in item ? String(item.department_id || '') : '',
      salary_grade_id: 'salary_grade_id' in item ? String(item.salary_grade_id || '') : '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }

    const endpoint = activeTab === 'departments' 
      ? '/api/organization/departments'
      : activeTab === 'positions'
      ? '/api/organization/positions'
      : '/api/organization/areas';

    const method = editingItem ? 'PUT' : 'POST';
    const body = editingItem 
      ? { ...formData, id: editingItem.id }
      : formData;

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error('Failed to save');

      toast.success(editingItem ? 'Updated successfully' : 'Created successfully');
      setIsDialogOpen(false);
      resetForm();
      mutate(endpoint);
    } catch {
      toast.error('Failed to save');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    const endpoint = activeTab === 'departments' 
      ? '/api/organization/departments'
      : activeTab === 'positions'
      ? '/api/organization/positions'
      : '/api/organization/areas';

    try {
      const response = await fetch(`${endpoint}?id=${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');

      toast.success('Deleted successfully');
      mutate(endpoint);
    } catch {
      toast.error('Failed to delete');
    }
  };

  const getDepartmentName = (id: number | null) => {
    if (!id) return '-';
    const dept = departments.find(d => d.id === id);
    return dept?.name || '-';
  };

  if (!canAccess) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center justify-center mb-4">
              <Lock className="h-12 w-12 text-red-600" />
            </div>
            <CardTitle className="text-center">Access Denied</CardTitle>
            <CardDescription className="text-center">
              Organization Structure is accessible to Manager and Admin users.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organization Structure</h1>
        <p className="text-muted-foreground">Manage departments, positions, and areas</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="departments" className="gap-2">
              <Building2 className="h-4 w-4" />
              Departments
            </TabsTrigger>
            <TabsTrigger value="positions" className="gap-2">
              <Briefcase className="h-4 w-4" />
              Positions
            </TabsTrigger>
            <TabsTrigger value="areas" className="gap-2">
              <MapPin className="h-4 w-4" />
              Areas
            </TabsTrigger>
          </TabsList>

          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add {activeTab === 'departments' ? 'Department' : activeTab === 'positions' ? 'Position' : 'Area'}
          </Button>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingItem ? 'Edit' : 'Add'} {activeTab === 'departments' ? 'Department' : activeTab === 'positions' ? 'Position' : 'Area'}
                </DialogTitle>
                <DialogDescription>
                  Fill in the details below
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="Enter code (e.g., IT, HR)"
                  />
                </div>
                {activeTab === 'positions' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="department">Department</Label>
                      <Select
                        value={formData.department_id}
                        onValueChange={(value) => setFormData({ ...formData, department_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((dept) => (
                            <SelectItem key={dept.id} value={String(dept.id)}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="salary-grade">Salary Grade</Label>
                      <Select
                        value={formData.salary_grade_id}
                        onValueChange={(value) => setFormData({ ...formData, salary_grade_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select salary grade" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Salary grades would be loaded from API in production */}
                          <SelectItem value="1">Level 1-A (Entry) - PHP 500/day</SelectItem>
                          <SelectItem value="2">Level 2-B (Junior) - PHP 650/day</SelectItem>
                          <SelectItem value="3">Level 3-C (Senior) - PHP 850/day</SelectItem>
                          <SelectItem value="4">Level 4-D (Manager) - PHP 2,500/day</SelectItem>
                          <SelectItem value="5">Level 5-E (Executive) - PHP 4,500/day</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Enter description"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit}>{editingItem ? 'Update' : 'Create'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <TabsContent value="departments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Departments</CardTitle>
              <CardDescription>Manage company departments</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No departments found
                      </TableCell>
                    </TableRow>
                  ) : (
                    departments.map((dept) => (
                      <TableRow key={dept.id}>
                        <TableCell className="font-medium">{dept.name}</TableCell>
                        <TableCell>
                          {dept.code && <Badge variant="outline">{dept.code}</Badge>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{dept.description || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog(dept);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(dept.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Positions</CardTitle>
              <CardDescription>Manage job positions</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No positions found
                      </TableCell>
                    </TableRow>
                  ) : (
                    positions.map((pos) => (
                      <TableRow key={pos.id}>
                        <TableCell className="font-medium">{pos.name}</TableCell>
                        <TableCell>
                          {pos.code && <Badge variant="outline">{pos.code}</Badge>}
                        </TableCell>
                        <TableCell>{getDepartmentName(pos.department_id)}</TableCell>
                        <TableCell className="text-muted-foreground">{pos.description || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog(pos);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(pos.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="areas" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Areas</CardTitle>
              <CardDescription>Manage work areas/locations</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {areas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No areas found
                      </TableCell>
                    </TableRow>
                  ) : (
                    areas.map((area) => (
                      <TableRow key={area.id}>
                        <TableCell className="font-medium">{area.name}</TableCell>
                        <TableCell>
                          {area.code && <Badge variant="outline">{area.code}</Badge>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{area.description || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog(area);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(area.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
