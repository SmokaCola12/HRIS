'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend } from 'date-fns';
import { ChevronLeft, ChevronRight, Clock, Loader2 } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface AttendanceRecord {
  id?: number;
  date: string;
  check_in?: string | null;
  check_out?: string | null;
  status: string;
  late_minutes?: number;
  early_out_minutes?: number;
  undertime_minutes?: number;
  overtime_minutes?: number;
}

export default function AttendancePage() {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [view, setView] = useState<'list' | 'calendar'>('list');

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const start = format(monthStart, 'yyyy-MM-dd');
  const end = format(monthEnd, 'yyyy-MM-dd');

  const { data: attendanceData = {}, isLoading } = useSWR(
    `/api/attendance?start_date=${start}&end_date=${end}`,
    fetcher
  );
  const attendance: AttendanceRecord[] = attendanceData.records || [];

  const goToPreviousMonth = () => {
    setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Present':
        return <Badge variant="default">Present</Badge>;
      case 'Late':
        return <Badge variant="destructive">Late</Badge>;
      case 'Absent':
        return <Badge variant="destructive">Absent</Badge>;
      case 'On-leave':
      case 'On Leave':
        return <Badge variant="secondary">On Leave</Badge>;
      case 'Weekend':
        return <Badge variant="outline">Weekend</Badge>;
      case 'Holiday':
        return <Badge variant="outline">Holiday</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Calculate summary
  const summary = {
    present: attendanceData.summary?.present || 0,
    late: attendanceData.summary?.late || 0,
    absent: attendanceData.summary?.absent || 0,
    leave: attendanceData.summary?.leave || 0,
    totalLateMinutes: attendanceData.summary?.totalLateMinutes || 0,
    totalUndertimeMinutes: attendanceData.summary?.totalUndertimeMinutes || 0,
    totalEarlyOutMinutes: attendanceData.summary?.totalEarlyOutMinutes || 0,
    totalOvertimeMinutes: attendanceData.summary?.totalOvertimeMinutes || 0,
  };

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader
        title="My Attendance"
        description="View your attendance records and time logs"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Present Days</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{summary.present}</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Late Days</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{summary.late}</div>
              <p className="text-xs text-muted-foreground">{summary.totalLateMinutes} total minutes</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Leaves Taken</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.leave}</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Undertime</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {Math.floor(summary.totalUndertimeMinutes / 60)}h {summary.totalUndertimeMinutes % 60}m
              </div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Early-Out</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {Math.floor(summary.totalEarlyOutMinutes / 60)}h {summary.totalEarlyOutMinutes % 60}m
              </div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Overtime Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {Math.floor(summary.totalOvertimeMinutes / 60)}h {summary.totalOvertimeMinutes % 60}m
              </div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
        </div>

        {/* Attendance Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Attendance Records</CardTitle>
                <CardDescription>Your daily time in/out logs</CardDescription>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-medium min-w-[120px] text-center">
                    {format(selectedMonth, 'MMMM yyyy')}
                  </span>
                  <Button variant="outline" size="icon" onClick={goToNextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <Select value={view} onValueChange={(v) => setView(v as 'list' | 'calendar')}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="list">List View</SelectItem>
                    <SelectItem value="calendar">Calendar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {view === 'list' ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Late (min)</TableHead>
                    <TableHead>Undertime</TableHead>
                    <TableHead>Early-Out</TableHead>
                    <TableHead>OT (min)</TableHead>
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
                  ) : attendance.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-4 text-muted-foreground">
                        No attendance records found for this month
                      </TableCell>
                    </TableRow>
                  ) : attendance.map((record) => (
                    <TableRow key={record.id || record.date}>
                      <TableCell className="font-medium">
                        {format(new Date(record.date), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>{format(new Date(record.date), 'EEEE')}</TableCell>
                      <TableCell>
                        {record.check_in ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {record.check_in}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {record.check_out ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {record.check_out}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(record.status)}</TableCell>
                      <TableCell className={(record.late_minutes || 0) > 0 ? 'text-red-600' : ''}>
                        {(record.late_minutes || 0) > 0 ? record.late_minutes : '-'}
                      </TableCell>
                      <TableCell className={(record.undertime_minutes || 0) > 0 ? 'text-orange-600' : ''}>
                        {(record.undertime_minutes || 0) > 0 ? record.undertime_minutes : '-'}
                      </TableCell>
                      <TableCell className={(record.early_out_minutes || 0) > 0 ? 'text-amber-600' : ''}>
                        {(record.early_out_minutes || 0) > 0 ? record.early_out_minutes : '-'}
                      </TableCell>
                      <TableCell className={(record.overtime_minutes || 0) > 0 ? 'text-blue-600' : ''}>
                        {(record.overtime_minutes || 0) > 0 ? record.overtime_minutes : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                    {day}
                  </div>
                ))}
                {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                  <div key={`empty-${i}`} className="p-2" />
                ))}
                {daysInMonth.map((date) => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const record = attendance.find(a => a.date === dateStr);
                  const weekend = isWeekend(date);
                  
                  return (
                    <div
                      key={dateStr}
                      className={`p-2 border border-border min-h-[60px] ${
                        weekend ? 'bg-muted/50' : ''
                      } ${record?.status === 'Present' ? 'bg-green-50 dark:bg-green-950' : ''} ${
                        record?.status === 'Late' ? 'bg-red-50 dark:bg-red-950' : ''
                      } ${record?.status === 'On Leave' ? 'bg-blue-50 dark:bg-blue-950' : ''}`}
                    >
                      <div className="text-sm font-medium">{format(date, 'd')}</div>
                      {record && record.check_in && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {record.check_in}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
