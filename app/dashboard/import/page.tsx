'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, Users, Clock, CheckCircle2, AlertCircle, Download, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/auth-context';

interface ParsedRecord {
  employeeId: string;
  timestamp: string;
  state: number;
  raw: string;
}

interface ParsedEmployee {
  id: string;
  name: string;
  department: string;
  raw: string;
}

interface CreatedAccount {
  employeeId: string;
  name: string;
  department: string;
  username: string;
  tempPassword: string;
}

interface ParsedDepartment {
  code: string;
  name: string;
  description?: string;
  raw: string;
}

interface ImportResult {
  imported: number;
  updated: number;
  errors: number;
  total: number;
  otRequestsCreated?: number;
}

export default function DataImportPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('departments');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [parsedData, setParsedData] = useState<ParsedRecord[] | ParsedEmployee[] | ParsedDepartment[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importedAccounts, setImportedAccounts] = useState<CreatedAccount[]>([]);
  const canAccess = user ? ['Manager', 'Admin', 'DEV'].includes(user.role) : false;

  const parseDepartmentDat = (content: string): ParsedDepartment[] => {
    const lines = content.split('\n').filter(line => line.trim());
    const departments: ParsedDepartment[] = [];

    for (const line of lines) {
      // Format: CODE [TAB] NAME [TAB] DESCRIPTION
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const code = parts[0].trim();
        const name = parts[1].trim();
        const description = parts[2]?.trim() || undefined;

        if (code && name) {
          departments.push({
            code,
            name,
            description,
            raw: line,
          });
        }
      }
    }

    return departments;
  };

  const parseAttendanceLog = (content: string): ParsedRecord[] => {
    const lines = content.split('\n').filter(line => line.trim());
    const records: ParsedRecord[] = [];

    for (const line of lines) {
      // Format: EmployeeID [TAB] YYYY-MM-DD HH:MM:SS [TAB] State
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const employeeId = parts[0].trim();
        const timestamp = parts[1].trim();
        const state = parts[2] ? parseInt(parts[2].trim()) : 0;

        if (employeeId && timestamp) {
          records.push({
            employeeId,
            timestamp,
            state,
            raw: line,
          });
        }
      }
    }

    return records;
  };

  const parseUserDat = (content: string): ParsedEmployee[] => {
    const lines = content.split('\n').filter(line => line.trim());
    const employees: ParsedEmployee[] = [];

    for (const line of lines) {
      // Format varies, but typically: ID [TAB] Name [TAB] Department
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const id = parts[0].trim();
        employees.push({
          id,
          name: parts[1].trim(),
          department: parts[2]?.trim() || '',
          raw: line,
        });
      }
    }

    return employees;
  };

  const handleFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setProgress(0);
    setParsedData([]);
    setImportResult(null);

    try {
      const content = await file.text();
      setProgress(30);

      let parsed: ParsedRecord[] | ParsedEmployee[] | ParsedDepartment[];
      
      if (activeTab === 'departments') {
        parsed = parseDepartmentDat(content);
      } else if (activeTab === 'attendance') {
        parsed = parseAttendanceLog(content);
      } else {
        parsed = parseUserDat(content);
      }

      setProgress(60);
      setParsedData(parsed);
      setProgress(100);

      toast.success(`Parsed ${parsed.length} records from ${file.name}`);
    } catch (error) {
      console.error('Parse error:', error);
      toast.error('Failed to parse file');
    } finally {
      setIsProcessing(false);
    }
  }, [activeTab]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleImport = async () => {
    if (parsedData.length === 0) {
      toast.error('No data to import');
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      let endpoint = '/api/import/attendance';
      if (activeTab === 'departments') {
        endpoint = '/api/import/departments';
      } else if (activeTab === 'employees') {
        endpoint = '/api/import/employees';
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: parsedData }),
      });

      if (!response.ok) throw new Error('Import failed');

      const result = await response.json();
      const imported = result.imported || 0;
      const updated = result.updated || 0;
      const errors = result.errors || 0;
      const total = result.total || parsedData.length;
      const otRequestsCreated = result.otRequestsCreated || 0;
      const processed = imported + updated;
      setImportResult({ imported, updated, errors, total, otRequestsCreated });
      setProgress(100);

      // If this was an employee import, store the created account credentials from API
      if (activeTab === 'employees' && result.createdAccounts && result.createdAccounts.length > 0) {
        setImportedAccounts(result.createdAccounts);
      }

      toast.success(`Processed ${processed} of ${total} records (${imported} new, ${updated} updated)`);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import data');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadSampleFile = (type: string) => {
    let content = '';
    let filename = '';

    if (type === 'departments') {
      content = 'IT\tInformation Technology\tIT Department\nHR\tHuman Resources\tHuman Resources Department\nFIN\tFinance\tFinance Department';
      filename = 'department.dat';
    } else if (type === 'attendance') {
      content = '1\t2026-05-12 08:00:00\t0\n1\t2026-05-12 17:00:00\t1\n2\t2026-05-12 08:05:00\t0\n2\t2026-05-12 16:55:00\t1';
      filename = '1_attlog.dat';
    } else {
      content = '1\tJohn Doe\tIT\n2\tJane Smith\tHR\n3\tBob Johnson\tFinance';
      filename = 'user.dat';
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadFullAttendanceTestFile = async () => {
    try {
      const response = await fetch('/api/import/attendance/sample');
      if (!response.ok) throw new Error('Failed to generate attendance test file');

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] || '1_attlog_full_app_test.dat';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Attendance test file downloaded');
    } catch (error) {
      console.error('Sample attendance download error:', error);
      toast.error('Failed to download attendance test file');
    }
  };

  const downloadCredentials = () => {
    if (importedAccounts.length === 0) return;
    
    // Create CSV content
    let csvContent = 'Employee ID,Name,Department,Username,Temporary Password\n';
    importedAccounts.forEach(account => {
      csvContent += `"${account.employeeId}","${account.name}","${account.department}","${account.username}","${account.tempPassword}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employee_credentials_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Credentials downloaded successfully');
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
              Data Import is accessible to Manager and Admin users.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Data Import</h1>
        <p className="text-muted-foreground">Import data from ZKTeco WL20 .dat files</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setParsedData([]); setImportResult(null); }}>
        <TabsList>
          <TabsTrigger value="departments" className="gap-2">
            <FileText className="h-4 w-4" />
            Departments
          </TabsTrigger>
          <TabsTrigger value="employees" className="gap-2">
            <Users className="h-4 w-4" />
            Employee Data
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-2">
            <Clock className="h-4 w-4" />
            Attendance Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="departments" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Import Departments</CardTitle>
              <CardDescription>
                Upload department.dat file from ZKTeco device. Format: Code [TAB] Name [TAB] Description
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">
                  Drop your .dat file here
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  or click to browse
                </p>
                <input
                  type="file"
                  accept=".dat,.txt,.csv"
                  onChange={handleFileInput}
                  className="hidden"
                  id="file-input-departments"
                />
                <label htmlFor="file-input-departments">
                  <Button variant="outline" asChild>
                    <span>Select File</span>
                  </Button>
                </label>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadSampleFile('departments')}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Sample File
                </Button>
              </div>

              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-muted-foreground text-center">Processing...</p>
                </div>
              )}

              {importResult && (
                <Alert variant={importResult.errors > 0 ? 'destructive' : 'default'}>
                  {importResult.errors > 0 ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <AlertTitle>Import Complete</AlertTitle>
                  <AlertDescription>
                    Processed {importResult.imported + importResult.updated} of {importResult.total} departments.
                    {' '}{importResult.imported} new, {importResult.updated} updated.
                    {importResult.errors > 0 && ` ${importResult.errors} records failed.`}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {(parsedData as ParsedDepartment[]).length > 0 && activeTab === 'departments' && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Preview Data</CardTitle>
                  <CardDescription>{parsedData.length} departments parsed</CardDescription>
                </div>
                <Button onClick={handleImport} disabled={isProcessing}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Data
                </Button>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(parsedData as ParsedDepartment[]).slice(0, 100).map((dept, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono">{dept.code}</TableCell>
                          <TableCell>{dept.name}</TableCell>
                          <TableCell>{dept.description || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="attendance" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Import Attendance Logs</CardTitle>
              <CardDescription>
                Upload 1_attlog.dat file from ZKTeco device. Format: EmployeeID [TAB] Timestamp [TAB] State
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">
                  Drop your .dat file here
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  or click to browse
                </p>
                <input
                  type="file"
                  accept=".dat,.txt,.csv"
                  onChange={handleFileInput}
                  className="hidden"
                  id="file-input"
                />
                <label htmlFor="file-input">
                  <Button variant="outline" asChild>
                    <span>Select File</span>
                  </Button>
                </label>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadSampleFile('attendance')}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Sample File
                </Button>
                <Button variant="outline" size="sm" onClick={downloadFullAttendanceTestFile}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Full App Test File
                </Button>
              </div>

              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-muted-foreground text-center">Processing...</p>
                </div>
              )}

              {importResult && (
                <Alert variant={importResult.errors > 0 ? 'destructive' : 'default'}>
                  {importResult.errors > 0 ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <AlertTitle>Import Complete</AlertTitle>
                  <AlertDescription>
                    Processed {importResult.imported + importResult.updated} of {importResult.total} attendance punches.
                    {' '}{importResult.imported} new daily attendance rows, {importResult.updated} existing punches updated.
                    {(importResult.otRequestsCreated || 0) > 0 && ` ${importResult.otRequestsCreated} OT request(s) created for approval.`}
                    {importResult.errors > 0 && ` ${importResult.errors} records failed.`}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {(parsedData as ParsedRecord[]).length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Preview Data</CardTitle>
                  <CardDescription>{parsedData.length} records parsed</CardDescription>
                </div>
                <Button onClick={handleImport} disabled={isProcessing}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Data
                </Button>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee ID</TableHead>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>State</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(parsedData as ParsedRecord[]).slice(0, 100).map((record, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono">{record.employeeId}</TableCell>
                          <TableCell>{record.timestamp}</TableCell>
                          <TableCell>
                            <Badge variant={record.state === 0 ? 'default' : 'secondary'}>
                              {record.state === 0 ? 'Check In' : 'Check Out'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {parsedData.length > 100 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Showing first 100 of {parsedData.length} records
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="employees" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Import Employee Data</CardTitle>
              <CardDescription>
                Upload user.dat file from ZKTeco device. Format: EmployeeID [TAB] Name [TAB] Department
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">
                  Drop your .dat file here
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  or click to browse
                </p>
                <input
                  type="file"
                  accept=".dat,.txt,.csv"
                  onChange={handleFileInput}
                  className="hidden"
                  id="file-input-employees"
                />
                <label htmlFor="file-input-employees">
                  <Button variant="outline" asChild>
                    <span>Select File</span>
                  </Button>
                </label>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadSampleFile('employees')}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Sample File
                </Button>
              </div>

              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-muted-foreground text-center">Processing...</p>
                </div>
              )}
            </CardContent>
          </Card>

          {(parsedData as ParsedEmployee[]).length > 0 && activeTab === 'employees' && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Preview Data</CardTitle>
                  <CardDescription>{parsedData.length} employees parsed</CardDescription>
                </div>
                <Button onClick={handleImport} disabled={isProcessing}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Data
                </Button>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Department</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(parsedData as ParsedEmployee[]).slice(0, 100).map((emp, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono">{emp.id}</TableCell>
                          <TableCell>{emp.name}</TableCell>
                          <TableCell>{emp.department || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {importedAccounts.length > 0 && activeTab === 'employees' && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Created Employee Accounts</CardTitle>
                  <CardDescription>System access credentials for {importedAccounts.length} newly imported employees</CardDescription>
                </div>
                <Button onClick={downloadCredentials} variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Download Credentials CSV
                </Button>
              </CardHeader>
              <CardContent>
                <Alert className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Important Security Notice</AlertTitle>
                  <AlertDescription>
                    Download these credentials immediately. Passwords are randomly generated and cannot be recovered. 
                    Share credentials securely with employees - they should change their password on first login.
                  </AlertDescription>
                </Alert>
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Employee ID</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Temporary Password</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importedAccounts.map((account, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{account.name}</TableCell>
                          <TableCell className="font-mono">{account.employeeId}</TableCell>
                          <TableCell>{account.department || '-'}</TableCell>
                          <TableCell className="font-mono text-blue-600">{account.username}</TableCell>
                          <TableCell className="font-mono text-red-600">{account.tempPassword}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
