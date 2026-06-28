'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { Search, Download, Calendar, Clock, UserCheck, UserX, AlertTriangle, Loader2, Camera } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface AttendanceReportEmployee {
  employee_id: number;
  employee_name: string;
  employee_idno: string;
  department_id: number | null;
  stats: {
    present: number;
    absent: number;
    late: number;
    leave: number;
    total_hours: number;
    overtime_hours: number;
  };
}

interface KioskPhoto {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_idno: string;
  timestamp: string;
  action: string;
  name: string;
  src: string;
}

const months = Array.from({ length: 12 }, (_, index) => {
  const date = addMonths(new Date(), -index);
  return {
    value: format(date, 'yyyy-MM'),
    label: format(date, 'MMMM yyyy'),
  };
});

export default function AttendanceReportPage() {
  const [selectedMonth, setSelectedMonth] = useState(months[0].value);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [photoStartDate, setPhotoStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [photoEndDate, setPhotoEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [photoSearchQuery, setPhotoSearchQuery] = useState('');
  const [photoPunchType, setPhotoPunchType] = useState('all');

  // Parse selected month to get date range
  const getDateRange = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(`${year}-${month}-01`);
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    };
  };

  const { start, end } = getDateRange(selectedMonth);

  // Fetch attendance report data
  const { data: reportData = {}, isLoading } = useSWR(
    `/api/reports/attendance?start_date=${start}&end_date=${end}`,
    fetcher
  );
  const { data: photoReportData = {}, isLoading: isPhotoLoading } = useSWR(
    photoDialogOpen ? `/api/reports/attendance?start_date=${photoStartDate}&end_date=${photoEndDate}` : null,
    fetcher
  );

  const { summary = {}, report = [] } = reportData as {
    summary?: Record<string, number>;
    report?: AttendanceReportEmployee[];
  };
  const photos = (photoReportData as { photos?: KioskPhoto[] }).photos || [];

  // Get unique departments from report data
  const departments = [...new Set(report.map((emp) => emp.department_id).filter(Boolean))];

  const filteredEmployees = report.filter((emp) => {
    const matchesSearch = emp.employee_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         emp.employee_idno.includes(searchQuery);
    const matchesDepartment = departmentFilter === 'all' || emp.department_id?.toString() === departmentFilter;
    return matchesSearch && matchesDepartment;
  });
  const filteredPhotos = photos.filter((photo) => {
    const query = photoSearchQuery.trim().toLowerCase();
    const matchesSearch = !query ||
      photo.employee_idno.toLowerCase().includes(query) ||
      photo.employee_name.toLowerCase().includes(query) ||
      photo.name.toLowerCase().includes(query);
    const matchesPunchType = photoPunchType === 'all' || photo.action === photoPunchType;
    return matchesSearch && matchesPunchType;
  });

  const handleExport = () => {
    const csvContent = [
      ['Employee ID', 'Name', 'Department', 'Present', 'Absent', 'Late', 'Leave', 'OT Hours', 'Total Hours'],
      ...filteredEmployees.map((e) => [
        e.employee_idno, e.employee_name, e.department_id, 
        e.stats.present, e.stats.absent, e.stats.late, e.stats.leave, 
        e.stats.overtime_hours.toFixed(2), e.stats.total_hours.toFixed(2)
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-report-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPhoto = (photo: KioskPhoto) => {
    const a = document.createElement('a');
    a.href = photo.src;
    a.download = `${photo.name}.jpg`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader
        title="Attendance Report"
        description="View and analyze employee attendance data"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-green-600" />
                Total Present Days
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{summary.total_present || 0}</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <UserX className="h-4 w-4 text-red-600" />
                Total Absent Days
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{summary.total_absent || 0}</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                Late Instances
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{summary.total_late || 0}</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                Overtime Hours
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{(summary.total_overtime || 0).toFixed(1)}</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
        </div>

        {/* Employee Report Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Employee Attendance Summary</CardTitle>
                <CardDescription>Individual attendance breakdown</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-[150px]">
                    <Calendar className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Dialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Camera className="h-4 w-4 mr-2" />
                      Kiosk Photos
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[88vh] max-w-6xl overflow-hidden rounded-none p-0">
                    <DialogHeader className="border-b p-5 pb-4">
                      <DialogTitle>Kiosk Photos</DialogTitle>
                      <DialogDescription>
                        Filter verification photos by date range, employee ID/name, and punch type.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 overflow-auto p-5">
                      <div className="grid gap-3 md:grid-cols-5">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Start Date</p>
                          <Input
                            type="date"
                            value={photoStartDate}
                            onChange={(event) => setPhotoStartDate(event.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">End Date</p>
                          <Input
                            type="date"
                            value={photoEndDate}
                            onChange={(event) => setPhotoEndDate(event.target.value)}
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <p className="text-xs text-muted-foreground">Employee ID / Name</p>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              value={photoSearchQuery}
                              onChange={(event) => setPhotoSearchQuery(event.target.value)}
                              placeholder="Search ID, name, or photo name"
                              className="pl-10"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Punch Type</p>
                          <Select value={photoPunchType} onValueChange={setPhotoPunchType}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Types</SelectItem>
                              <SelectItem value="Punch In">Punch In</SelectItem>
                              <SelectItem value="Punch Out">Punch Out</SelectItem>
                              <SelectItem value="Break In">Break In</SelectItem>
                              <SelectItem value="Break Out">Break Out</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="rounded-md border">
                        <div className="max-h-[52vh] overflow-auto">
                          <Table>
                            <TableHeader className="sticky top-0 bg-background">
                              <TableRow>
                                <TableHead>Photo</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Employee</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Timestamp</TableHead>
                                <TableHead className="w-20" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {isPhotoLoading ? (
                                <TableRow>
                                  <TableCell colSpan={6} className="py-8 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Loading kiosk photos...
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ) : filteredPhotos.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                                    No kiosk photos match the filters
                                  </TableCell>
                                </TableRow>
                              ) : (
                                filteredPhotos.map((photo) => (
                                  <TableRow key={photo.id}>
                                    <TableCell>
                                      <button
                                        type="button"
                                        className="h-16 w-16 overflow-hidden border bg-muted"
                                        onClick={() => window.open(photo.src, '_blank')}
                                        title="Open photo"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={photo.src} alt="" className="h-full w-full object-cover" />
                                      </button>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{photo.name}</TableCell>
                                    <TableCell>
                                      <div>
                                        <p className="font-medium">{photo.employee_name}</p>
                                        <p className="text-xs text-muted-foreground">ID: {photo.employee_idno}</p>
                                      </div>
                                    </TableCell>
                                    <TableCell>{photo.action}</TableCell>
                                    <TableCell>{photo.timestamp}</TableCell>
                                    <TableCell>
                                      <Button type="button" variant="outline" size="sm" onClick={() => downloadPhoto(photo)}>
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        Showing {filteredPhotos.length} of {photos.length} kiosk photo(s).
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button variant="outline" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={String(dept)}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-center">Present</TableHead>
                  <TableHead className="text-center">Absent</TableHead>
                  <TableHead className="text-center">Late</TableHead>
                  <TableHead className="text-center">Leave</TableHead>
                  <TableHead className="text-center">OT (hrs)</TableHead>
                  <TableHead className="text-center">Total Hrs</TableHead>
                  <TableHead>Attendance %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-4">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading attendance data...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-4 text-muted-foreground">
                      No employees found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEmployees.map((employee) => {
                    const totalDays = employee.stats.present + employee.stats.absent;
                    const attendanceRate = totalDays > 0 ? (employee.stats.present / totalDays) * 100 : 0;
                    
                    return (
                      <TableRow key={employee.employee_id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{employee.employee_name}</p>
                            <p className="text-xs text-muted-foreground">ID: {employee.employee_idno}</p>
                          </div>
                        </TableCell>
                        <TableCell>{employee.department_id || '-'}</TableCell>
                        <TableCell className="text-center">
                          <span className="text-green-600 font-medium">{employee.stats.present}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={employee.stats.absent > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                            {employee.stats.absent}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={employee.stats.late > 0 ? 'text-yellow-600 font-medium' : 'text-muted-foreground'}>
                            {employee.stats.late}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-muted-foreground">{employee.stats.leave}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={employee.stats.overtime_hours > 0 ? 'text-blue-600 font-medium' : 'text-muted-foreground'}>
                            {employee.stats.overtime_hours.toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-medium">{employee.stats.total_hours.toFixed(1)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${attendanceRate >= 90 ? 'bg-green-500' : attendanceRate >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{ width: `${attendanceRate}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">{attendanceRate.toFixed(0)}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
