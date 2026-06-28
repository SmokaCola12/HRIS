'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { DashboardHeader } from '@/components/dashboard/header';

const fetcher = (url: string) => fetch(url).then(res => res.json());
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Search, Plus, Eye, Edit, UserX, Users, UserCheck, AlertTriangle, Trash2 } from 'lucide-react';

type ScheduleAssignmentForm = {
  shift_id: string;
  work_days: number[];
};

type EmployeeRecord = {
  id: number;
  employee_id: string;
  name: string;
  username?: string | null;
  email: string | null;
  picture?: string | null;
  department_id: number | null;
  department?: string | null;
  department_name?: string | null;
  position_id: number | null;
  position?: string | null;
  position_name?: string | null;
  salary_grade_id: number | null;
  shift_id?: number | null;
  work_days?: number[];
  shift_assignments?: Array<{
    id?: number;
    shift_id: number;
    shift_name?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    break_minutes?: number;
    work_days: number[];
  }>;
  shift?: string | null;
  shift_name?: string | null;
  schedule_label?: string | null;
  employment_type?: string | null;
  status: string;
  role: string;
};

type Department = {
  id: number;
  name: string;
};

type Position = {
  id: number;
  name: string;
  department_id: number | null;
  salary_grade_id?: number | null;
};

type SalaryGrade = {
  id: number;
  grade_name: string;
  amount: number;
  frequency: string;
};

type Shift = {
  id: number;
  name: string;
  code?: string | null;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

const emptyEmployeeForm = {
  employee_id: '',
  name: '',
  email: '',
  department_id: '',
  position_id: '',
  salary_grade_id: '',
  shift_id: '',
  work_days: [0, 1, 2, 3, 4, 5, 6],
  shift_assignments: [{ shift_id: '', work_days: [0, 1, 2, 3, 4, 5, 6] }] as ScheduleAssignmentForm[],
  password: '',
  employment_type: 'Probationary',
  role: 'Employee',
};

const employmentTypes = ['Regular', 'Probationary', 'Casual', 'Casual On-Call'];
const weekDays = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

function isFlexibleType(type?: string | null) {
  return type === 'Casual' || type === 'Casual On-Call';
}

function toggleWorkDay(days: number[], day: number, checked: boolean) {
  const next = new Set(days);
  if (checked) next.add(day);
  if (!checked) next.delete(day);
  return Array.from(next).sort((a, b) => a - b);
}

function defaultScheduleAssignments(employee?: EmployeeRecord): ScheduleAssignmentForm[] {
  if (employee?.shift_assignments?.length) {
    return employee.shift_assignments.map((assignment) => ({
      shift_id: assignment.shift_id ? String(assignment.shift_id) : '',
      work_days: assignment.work_days?.length ? assignment.work_days : [0, 1, 2, 3, 4, 5, 6],
    }));
  }

  return [{
    shift_id: employee?.shift_id ? String(employee.shift_id) : '',
    work_days: employee?.work_days?.length ? employee.work_days : [0, 1, 2, 3, 4, 5, 6],
  }];
}

function hasValidSchedule(assignments: ScheduleAssignmentForm[]) {
  if (!assignments.length) return false;
  const usedDays = new Set<number>();

  for (const assignment of assignments) {
    if (!assignment.shift_id || assignment.work_days.length === 0) return false;
    for (const day of assignment.work_days) {
      if (usedDays.has(day)) return false;
      usedDays.add(day);
    }
  }

  return true;
}

export default function EmployeesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [newEmployee, setNewEmployee] = useState(emptyEmployeeForm);
  const [editEmployee, setEditEmployee] = useState(emptyEmployeeForm);

  // Fetch all employees from API
  const { data: employeeData, mutate: mutateEmployees } = useSWR('/api/employees', fetcher);
  const { data: salaryData } = useSWR('/api/salary-grades', fetcher);
  const { data: departmentData } = useSWR('/api/organization/departments', fetcher);
  const { data: positionData } = useSWR('/api/organization/positions', fetcher);
  const { data: shiftData } = useSWR('/api/shifts', fetcher);

  const allEmployees = useMemo<EmployeeRecord[]>(() => employeeData?.employees || [], [employeeData]);
  const salaryGrades = useMemo<SalaryGrade[]>(() => salaryData?.grades || [], [salaryData]);
  const departments = useMemo<Department[]>(() => departmentData?.departments || [], [departmentData]);
  const positions = useMemo<Position[]>(() => positionData?.positions || [], [positionData]);
  const shifts = useMemo<Shift[]>(() => (shiftData?.shifts || []).filter((shift: Shift) => shift.isActive), [shiftData]);
  const canEditEmployees = !!user && ['Admin', 'CEO', 'DEV'].includes(user.role);
  const availablePositions = useMemo(() => {
    if (!newEmployee.department_id) return positions;
    const selectedDepartmentId = Number(newEmployee.department_id);
    return positions.filter((position) => !position.department_id || position.department_id === selectedDepartmentId);
  }, [positions, newEmployee.department_id]);
  const availableEditPositions = useMemo(() => {
    if (!editEmployee.department_id) return positions;
    const selectedDepartmentId = Number(editEmployee.department_id);
    return positions.filter((position) => !position.department_id || position.department_id === selectedDepartmentId);
  }, [positions, editEmployee.department_id]);

  // Filter employees based on privacy rules
  const getVisibleEmployees = () => {
    if (!user) return [];
    
    return allEmployees.filter((emp) => {
      // DEV can see everyone
      if (user.role === 'DEV') return true;
      
      // CEO can see everyone except DEV
      if (user.role === 'CEO') return emp.role !== 'DEV';
      
      // Manager can see everyone except CEO and DEV
      if (user.role === 'Manager') return !['CEO', 'DEV'].includes(emp.role);
      
      // Admin cannot see Manager, CEO, or DEV (privacy rule)
      if (user.role === 'Admin') return !['Manager', 'CEO', 'DEV'].includes(emp.role);
      
      return false;
    });
  };

  const visibleEmployees = useMemo(() => getVisibleEmployees(), [allEmployees, user]);

  // Filter employees
  const filteredEmployees = useMemo(() => {
    return visibleEmployees.filter((emp) => {
      const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (emp.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          emp.employee_id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || emp.status === statusFilter;
      const matchesEmploymentType = employmentTypeFilter === 'all' || (emp.employment_type || 'Probationary') === employmentTypeFilter;
      const matchesDept = departmentFilter === 'all' || String(emp.department_id || '') === departmentFilter;
      
      return matchesSearch && matchesStatus && matchesEmploymentType && matchesDept;
    });
  }, [visibleEmployees, searchQuery, statusFilter, employmentTypeFilter, departmentFilter]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      Active: 'default',
      Resigned: 'secondary',
      AWOL: 'destructive',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const getEmploymentTypeBadge = (type?: string | null) => {
    const normalizedType = type || 'Probationary';
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      Regular: 'default',
      Probationary: 'secondary',
      Casual: 'outline',
      'Casual On-Call': 'outline',
    };
    return <Badge variant={variants[normalizedType] || 'outline'}>{normalizedType}</Badge>;
  };

  const getSalaryGradeName = (gradeId: number | null) => {
    if (!gradeId) return 'Not Set';
    const grade = salaryGrades.find(sg => sg.id === gradeId);
    return grade ? `${grade.grade_name} - PHP ${grade.amount}/${grade.frequency}` : 'Not Set';
  };

  const handleAddEmployee = async () => {
    if (
      !newEmployee.employee_id ||
      !newEmployee.name ||
      !newEmployee.department_id ||
      !newEmployee.position_id ||
      !newEmployee.salary_grade_id ||
      (!isFlexibleType(newEmployee.employment_type) && !hasValidSchedule(newEmployee.shift_assignments)) ||
      !newEmployee.password
    ) {
      toast.error('Employee ID, full name, department, position, salary grade, weekly schedule, and password are required. Each day can only be used once.');
      return;
    }
    
    try {
      const response = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: newEmployee.employee_id,
          name: newEmployee.name,
          email: newEmployee.email,
          password: newEmployee.password,
          department_id: newEmployee.department_id,
          position_id: newEmployee.position_id,
          salary_grade_id: newEmployee.salary_grade_id,
          shift_assignments: isFlexibleType(newEmployee.employment_type) ? undefined : newEmployee.shift_assignments,
          employment_type: newEmployee.employment_type,
          role: newEmployee.role,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to add employee');
      
      await mutateEmployees();
      toast.success(`${newEmployee.name} was added to the employee masterlist`);
      setIsAddDialogOpen(false);
      setNewEmployee(emptyEmployeeForm);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add employee');
      console.log('[v0] Error adding employee:', error);
    }
  };

  const handleViewEmployee = (employee: any) => {
    router.push(`/dashboard/employees/${employee.id}`);
  };

  const handleEditEmployee = (employee: EmployeeRecord) => {
    setSelectedEmployee(employee);
    setEditEmployee({
      employee_id: employee.employee_id,
      name: employee.name,
      email: employee.email || '',
      department_id: employee.department_id ? String(employee.department_id) : '',
      position_id: employee.position_id ? String(employee.position_id) : '',
      salary_grade_id: employee.salary_grade_id ? String(employee.salary_grade_id) : '',
      shift_id: employee.shift_id ? String(employee.shift_id) : '',
      work_days: employee.work_days?.length ? employee.work_days : [0, 1, 2, 3, 4, 5, 6],
      shift_assignments: defaultScheduleAssignments(employee),
      password: '',
      employment_type: employee.employment_type || 'Probationary',
      role: employee.role || 'Employee',
    });
    setIsEditDialogOpen(true);
  };

  const handleSaveEmployee = async () => {
    if (!selectedEmployee) return;

    if (
      !editEmployee.employee_id ||
      !editEmployee.name ||
      !editEmployee.department_id ||
      !editEmployee.position_id ||
      !editEmployee.salary_grade_id ||
      (!isFlexibleType(editEmployee.employment_type) && !hasValidSchedule(editEmployee.shift_assignments))
    ) {
      toast.error('Employee ID, full name, department, position, salary grade, and weekly schedule are required. Each day can only be used once.');
      return;
    }

    try {
      const response = await fetch('/api/employees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedEmployee.id,
          employee_id: editEmployee.employee_id,
          name: editEmployee.name,
          email: editEmployee.email,
          password: editEmployee.password || undefined,
          department_id: editEmployee.department_id,
          position_id: editEmployee.position_id,
          salary_grade_id: editEmployee.salary_grade_id,
          shift_assignments: isFlexibleType(editEmployee.employment_type) ? undefined : editEmployee.shift_assignments,
          employment_type: editEmployee.employment_type,
          role: editEmployee.role,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to update employee');

      await mutateEmployees();
      toast.success('Employee updated successfully');
      setIsEditDialogOpen(false);
      setSelectedEmployee(null);
      setEditEmployee(emptyEmployeeForm);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update employee');
      console.log('[v0] Error updating employee:', error);
    }
  };

  const handleChangeStatus = (employee: any) => {
    setSelectedEmployee(employee);
    setNewStatus(employee.status);
    setIsStatusDialogOpen(true);
  };

  const handleStatusChange = async () => {
    if (!selectedEmployee || !newStatus) return;
    
    try {
      const response = await fetch('/api/employees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedEmployee.id,
          status: newStatus,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to update status');

      await mutateEmployees();
      toast.success(`Employee status updated to ${newStatus}`);
      setIsStatusDialogOpen(false);
      setSelectedEmployee(null);
      setNewStatus('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update status');
      console.log('[v0] Error updating status:', error);
    }
  };

  const handleDelete = async (id: string) => {
    toast.success('Employee deleted successfully');
  };

  const renderScheduleAssignments = (
    assignments: ScheduleAssignmentForm[],
    onChange: (assignments: ScheduleAssignmentForm[]) => void,
    idPrefix: string
  ) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Weekly Schedule *</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...assignments, { shift_id: '', work_days: [] }])}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Row
        </Button>
      </div>
      <div className="space-y-3">
        {assignments.map((assignment, index) => (
          <div key={`${idPrefix}-${index}`} className="space-y-3 rounded-md border p-3">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor={`${idPrefix}-shift-${index}`}>Shift</Label>
                <Select
                  value={assignment.shift_id}
                  onValueChange={(value) => onChange(assignments.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, shift_id: value } : item
                  ))}
                >
                  <SelectTrigger id={`${idPrefix}-shift-${index}`}>
                    <SelectValue placeholder="Select shift" />
                  </SelectTrigger>
                  <SelectContent>
                    {shifts.length === 0 ? (
                      <SelectItem value="no-shifts" disabled>No shifts added</SelectItem>
                    ) : (
                      shifts.map((shift) => (
                        <SelectItem key={shift.id} value={String(shift.id)}>
                          {shift.name} ({shift.startTime} - {shift.endTime})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-red-600 hover:text-red-700"
                onClick={() => onChange(assignments.filter((_, itemIndex) => itemIndex !== index))}
                disabled={assignments.length === 1}
                title="Remove schedule row"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((day) => (
                <label
                  key={day.value}
                  className="flex flex-col items-center gap-2 rounded-md border p-2 text-xs"
                >
                  <Checkbox
                    checked={assignment.work_days.includes(day.value)}
                    onCheckedChange={(checked) => onChange(assignments.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, work_days: toggleWorkDay(item.work_days, day.value, Boolean(checked)) }
                        : item
                    ))}
                  />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (!user || !['Manager', 'Admin', 'CEO', 'DEV'].includes(user.role)) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">You don&apos;t have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader title="Employees" description="Manage employee records and information" />
      
      <div className="p-8 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Employee Masterlist
              </CardTitle>
              <CardDescription>Total: {filteredEmployees.length} employees</CardDescription>
            </div>
            {canEditEmployees && (
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Employee
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="min-w-64 flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Resigned">Resigned</SelectItem>
                  <SelectItem value="AWOL">AWOL</SelectItem>
                </SelectContent>
              </Select>
              <Select value={employmentTypeFilter} onValueChange={setEmploymentTypeFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {employmentTypes.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filteredEmployees.length === 0 ? (
              <div className="rounded-md border py-10 text-center text-muted-foreground">
                No employees found
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Salary Grade</TableHead>
                      <TableHead>Shift</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployees.map((employee) => (
                      <TableRow
                        key={employee.id}
                        className="cursor-pointer"
                        onClick={() => handleViewEmployee(employee)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={employee.picture || undefined} />
                              <AvatarFallback>{employee.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            {employee.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{employee.email || 'N/A'}</TableCell>
                        <TableCell>{employee.department_name || employee.department || 'N/A'}</TableCell>
                        <TableCell>{employee.position_name || employee.position || 'N/A'}</TableCell>
                        <TableCell className="text-sm">{getSalaryGradeName(employee.salary_grade_id)}</TableCell>
                        <TableCell>{employee.schedule_label || employee.shift_name || employee.shift || 'N/A'}</TableCell>
                        <TableCell>{getEmploymentTypeBadge(employee.employment_type)}</TableCell>
                        <TableCell>{getStatusBadge(employee.status)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{employee.role}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewEmployee(employee);
                              }}
                              title="Open employee overview"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canEditEmployees && (
                              <>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditEmployee(employee);
                                  }}
                                  title="Edit Employee"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleChangeStatus(employee);
                                  }}
                                  title="Change Status"
                                >
                                  <UserX className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Employee Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Employee</DialogTitle>
              <DialogDescription>
                Create the employee profile and login account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="employee_id">Employee ID *</Label>
                  <Input
                    id="employee_id"
                    value={newEmployee.employee_id}
                    onChange={(e) => setNewEmployee({ ...newEmployee, employee_id: e.target.value })}
                    placeholder="EMP-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Fullname *</Label>
                  <Input
                    id="name"
                    value={newEmployee.name}
                    onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                    placeholder="Juan Dela Cruz"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email (Optional)</Label>
                <Input
                  id="email"
                  type="email"
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                  placeholder="name@company.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="employment_type">Employment Type *</Label>
                <Select
                  value={newEmployee.employment_type}
                  onValueChange={(value) => setNewEmployee({
                    ...newEmployee,
                    employment_type: value,
                    shift_id: isFlexibleType(value) ? '' : newEmployee.shift_id,
                    shift_assignments: isFlexibleType(value)
                      ? []
                      : newEmployee.shift_assignments.length
                        ? newEmployee.shift_assignments
                        : [{ shift_id: '', work_days: [0, 1, 2, 3, 4, 5, 6] }],
                  })}
                >
                  <SelectTrigger id="employment_type">
                    <SelectValue placeholder="Select employment type" />
                  </SelectTrigger>
                  <SelectContent>
                    {employmentTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="department">Department *</Label>
                  <Select
                    value={newEmployee.department_id}
                    onValueChange={(value) => setNewEmployee({ ...newEmployee, department_id: value, position_id: '' })}
                  >
                    <SelectTrigger id="department">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.length === 0 ? (
                        <SelectItem value="no-departments" disabled>No departments added</SelectItem>
                      ) : (
                        departments.map((department) => (
                          <SelectItem key={department.id} value={String(department.id)}>
                            {department.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="position">Position *</Label>
                  <Select
                    value={newEmployee.position_id}
                    onValueChange={(value) => setNewEmployee({ ...newEmployee, position_id: value })}
                  >
                    <SelectTrigger id="position">
                      <SelectValue placeholder="Select position" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePositions.length === 0 ? (
                        <SelectItem value="no-positions" disabled>No positions added</SelectItem>
                      ) : (
                        availablePositions.map((position) => (
                          <SelectItem key={position.id} value={String(position.id)}>
                            {position.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="salary_grade">Salary Grade *</Label>
                <Select
                  value={newEmployee.salary_grade_id}
                  onValueChange={(value) => setNewEmployee({ ...newEmployee, salary_grade_id: value })}
                >
                  <SelectTrigger id="salary_grade">
                    <SelectValue placeholder="Select salary grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {salaryGrades.length === 0 ? (
                      <SelectItem value="no-salary-grades" disabled>No salary grades added</SelectItem>
                    ) : (
                      salaryGrades.map((grade) => (
                        <SelectItem key={grade.id} value={String(grade.id)}>
                          {grade.grade_name} - PHP {grade.amount}/{grade.frequency}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {!isFlexibleType(newEmployee.employment_type) && renderScheduleAssignments(
                newEmployee.shift_assignments,
                (shift_assignments) => setNewEmployee({ ...newEmployee, shift_assignments }),
                'new-schedule'
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={newEmployee.password}
                    onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
                    placeholder="Set login password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Account Role *</Label>
                  <Select
                    value={newEmployee.role}
                    onValueChange={(value) => setNewEmployee({ ...newEmployee, role: value })}
                  >
                    <SelectTrigger id="role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Employee">Employee</SelectItem>
                      <SelectItem value="Manager">Manager</SelectItem>
                      <SelectItem value="Admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsAddDialogOpen(false);
              }}>
                Cancel
              </Button>
              <Button onClick={handleAddEmployee}>
                Add Employee
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Employee Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Employee</DialogTitle>
              <DialogDescription>
                Update details for {selectedEmployee?.name}
              </DialogDescription>
            </DialogHeader>
            {selectedEmployee && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_employee_id">Employee ID *</Label>
                    <Input
                      id="edit_employee_id"
                      value={editEmployee.employee_id}
                      onChange={(e) => setEditEmployee({ ...editEmployee, employee_id: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_name">Fullname *</Label>
                    <Input
                      id="edit_name"
                      value={editEmployee.name}
                      onChange={(e) => setEditEmployee({ ...editEmployee, name: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_email">Email (Optional)</Label>
                  <Input
                    id="edit_email"
                    type="email"
                    value={editEmployee.email}
                    onChange={(e) => setEditEmployee({ ...editEmployee, email: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_employment_type">Employment Type *</Label>
                  <Select
                    value={editEmployee.employment_type}
                    onValueChange={(value) => setEditEmployee({
                      ...editEmployee,
                      employment_type: value,
                      shift_id: isFlexibleType(value) ? '' : editEmployee.shift_id,
                      shift_assignments: isFlexibleType(value)
                        ? []
                        : editEmployee.shift_assignments.length
                          ? editEmployee.shift_assignments
                          : [{ shift_id: '', work_days: [0, 1, 2, 3, 4, 5, 6] }],
                    })}
                  >
                    <SelectTrigger id="edit_employment_type">
                      <SelectValue placeholder="Select employment type" />
                    </SelectTrigger>
                    <SelectContent>
                      {employmentTypes.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_department">Department *</Label>
                    <Select
                      value={editEmployee.department_id}
                      onValueChange={(value) => setEditEmployee({ ...editEmployee, department_id: value, position_id: '' })}
                    >
                      <SelectTrigger id="edit_department">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.length === 0 ? (
                          <SelectItem value="no-departments" disabled>No departments added</SelectItem>
                        ) : (
                          departments.map((department) => (
                            <SelectItem key={department.id} value={String(department.id)}>
                              {department.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_position">Position *</Label>
                    <Select
                      value={editEmployee.position_id}
                      onValueChange={(value) => setEditEmployee({ ...editEmployee, position_id: value })}
                    >
                      <SelectTrigger id="edit_position">
                        <SelectValue placeholder="Select position" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableEditPositions.length === 0 ? (
                          <SelectItem value="no-positions" disabled>No positions added</SelectItem>
                        ) : (
                          availableEditPositions.map((position) => (
                            <SelectItem key={position.id} value={String(position.id)}>
                              {position.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_salary_grade">Salary Grade *</Label>
                  <Select
                    value={editEmployee.salary_grade_id}
                    onValueChange={(value) => setEditEmployee({ ...editEmployee, salary_grade_id: value })}
                  >
                    <SelectTrigger id="edit_salary_grade">
                      <SelectValue placeholder="Select salary grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {salaryGrades.length === 0 ? (
                        <SelectItem value="no-salary-grades" disabled>No salary grades added</SelectItem>
                      ) : (
                        salaryGrades.map((grade) => (
                          <SelectItem key={grade.id} value={String(grade.id)}>
                            {grade.grade_name} - PHP {grade.amount}/{grade.frequency}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {!isFlexibleType(editEmployee.employment_type) && renderScheduleAssignments(
                  editEmployee.shift_assignments,
                  (shift_assignments) => setEditEmployee({ ...editEmployee, shift_assignments }),
                  'edit-schedule'
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_password">Password</Label>
                    <Input
                      id="edit_password"
                      type="password"
                      value={editEmployee.password}
                      onChange={(e) => setEditEmployee({ ...editEmployee, password: e.target.value })}
                      placeholder="Leave blank to keep current"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_role">Account Role *</Label>
                    <Select
                      value={editEmployee.role}
                      onValueChange={(value) => setEditEmployee({ ...editEmployee, role: value })}
                    >
                      <SelectTrigger id="edit_role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Employee">Employee</SelectItem>
                        <SelectItem value="Manager">Manager</SelectItem>
                        <SelectItem value="Admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEmployee}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Status Change Dialog */}
        <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Change Employee Status
              </DialogTitle>
              <DialogDescription>
                Update the employment status for {selectedEmployee?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>New Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Resigned">Resigned</SelectItem>
                    <SelectItem value="AWOL">AWOL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsStatusDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleStatusChange} disabled={!newStatus}>
                Update Status
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
