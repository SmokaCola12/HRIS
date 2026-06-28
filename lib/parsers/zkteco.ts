export interface ParsedDepartment {
  id: string;
  name: string;
}

export interface ParsedEmployee {
  id: string;
  name: string;
  department_id: string;
}

export interface ParsedAttendanceLog {
  employee_id: string;
  timestamp: string;
  state: number;
}

export function parseDepartmentDat(content: string): ParsedDepartment[] {
  const lines = content.split('\n').filter(line => line.trim());
  const departments: ParsedDepartment[] = [];

  for (const line of lines) {
    // Format: DepartmentID [TAB] DepartmentName
    const parts = line.split('\t');
    if (parts.length >= 2) {
      const id = parts[0].trim();
      const name = parts[1].trim();

      if (id && name) {
        departments.push({
          id,
          name,
        });
      }
    }
  }

  return departments;
}

export function parseUserDat(content: string): ParsedEmployee[] {
  const lines = content.split('\n').filter(line => line.trim());
  const employees: ParsedEmployee[] = [];

  for (const line of lines) {
    // Format: EmployeeID [TAB] Name [TAB] ... [TAB] DepartmentID
    const parts = line.split('\t');
    if (parts.length >= 2) {
      const id = parts[0].trim();
      const name = parts[1].trim();
      const department_id = parts[parts.length - 1].trim(); // Last field is department

      if (id && name) {
        employees.push({
          id,
          name,
          department_id: department_id || '1',
        });
      }
    }
  }

  return employees;
}

export function parseAttendanceLog(content: string): ParsedAttendanceLog[] {
  const lines = content.split('\n').filter(line => line.trim());
  const logs: ParsedAttendanceLog[] = [];

  for (const line of lines) {
    // Format: EmployeeID [TAB] YYYY-MM-DD HH:MM:SS [TAB] State
    const parts = line.split('\t');
    if (parts.length >= 2) {
      const employee_id = parts[0].trim();
      const timestamp = parts[1].trim();
      const state = parts[2] ? parseInt(parts[2].trim()) : 0;

      if (employee_id && timestamp) {
        logs.push({
          employee_id,
          timestamp,
          state,
        });
      }
    }
  }

  return logs;
}
