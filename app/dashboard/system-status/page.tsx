'use client';

import { useState, useEffect } from 'react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, AlertCircle, Clock, Users, Building2, BarChart3, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface SystemStatus {
  departmentsLoaded: number;
  employeesLoaded: number;
  attendanceLogsLoaded: number;
  totalData: number;
}

export default function SystemStatusPage() {
  const [status, setStatus] = useState<SystemStatus>({
    departmentsLoaded: 0,
    employeesLoaded: 0,
    attendanceLogsLoaded: 0,
    totalData: 0,
  });
  const [isResetting, setIsResetting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSystemStatus();
  }, []);

  const loadSystemStatus = async () => {
    try {
      const response = await fetch('/api/system/status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('[v0] Error loading system status:', error);
      toast.error('Failed to load system status');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset the entire system? This will delete all imported data.')) {
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch('/api/system/reset', { method: 'POST' });
      if (response.ok) {
        toast.success('System reset successfully');
        await loadSystemStatus();
      } else {
        toast.error('Failed to reset system');
      }
    } catch (error) {
      console.error('[v0] Error resetting system:', error);
      toast.error('Error resetting system');
    } finally {
      setIsResetting(false);
    }
  };

  const isDepartmentsReady = status.departmentsLoaded > 0;
  const isEmployeesReady = status.employeesLoaded > 0;
  const isAttendanceReady = status.attendanceLogsLoaded > 0;

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader
        title="System Status"
        description="Monitor HRIS system initialization and data import status"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* System Ready Checklist */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              System Ready Checklist
            </CardTitle>
            <CardDescription>
              Complete all steps to initialize the HRIS system with ZKTeco data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Departments Check */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5" />
                <div>
                  <p className="font-medium">Departments Loaded</p>
                  <p className="text-sm text-muted-foreground">Import from department.dat</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isDepartmentsReady ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                )}
                <Badge variant={isDepartmentsReady ? 'default' : 'secondary'}>
                  {status.departmentsLoaded} departments
                </Badge>
              </div>
            </div>

            {/* Employees Check */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5" />
                <div>
                  <p className="font-medium">Employees Synced</p>
                  <p className="text-sm text-muted-foreground">Import from user.dat</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isEmployeesReady ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                )}
                <Badge variant={isEmployeesReady ? 'default' : 'secondary'}>
                  {status.employeesLoaded} employees
                </Badge>
              </div>
            </div>

            {/* Attendance Check */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5" />
                <div>
                  <p className="font-medium">Attendance Records Synced</p>
                  <p className="text-sm text-muted-foreground">Import from 1_attlog.dat</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isAttendanceReady ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                )}
                <Badge variant={isAttendanceReady ? 'default' : 'secondary'}>
                  {status.attendanceLogsLoaded} logs
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Ready Alert */}
        {isDepartmentsReady && isEmployeesReady && isAttendanceReady ? (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              System is ready! All data has been successfully imported. The HRIS system is now operational.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              System is in initialization mode. Upload ZKTeco files in the Data Import section to populate the system.
            </AlertDescription>
          </Alert>
        )}

        {/* Data Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Data Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total Departments</p>
              <p className="text-2xl font-bold">{status.departmentsLoaded}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total Employees</p>
              <p className="text-2xl font-bold">{status.employeesLoaded}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Attendance Records</p>
              <p className="text-2xl font-bold">{status.attendanceLogsLoaded}</p>
            </div>
          </CardContent>
        </Card>

        {/* Reset System */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Reset System
            </CardTitle>
            <CardDescription>
              Clear all imported data and return to fresh system state
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              This action will delete all employees, attendance logs, and requests. Use this to prepare for a fresh data import.
            </p>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={isResetting}
            >
              {isResetting ? 'Resetting...' : 'Reset System for Fresh Import'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
