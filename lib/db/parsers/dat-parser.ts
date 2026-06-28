/**
 * Parser for ZKTeco .dat files
 * Handles:
 * - 1_attlog.dat: Attendance logs (Tab-separated: EmployeeID, Timestamp, State)
 * - user.dat: User data
 * - department.dat: Department data
 */

export interface AttendanceLog {
  employeeId: string;
  timestamp: Date;
  state: number;
}

export interface UserData {
  id: string;
  name: string;
  department?: string;
}

export interface DepartmentData {
  id: string;
  name: string;
}

/**
 * Parse attendance log file (1_attlog.dat)
 * Format: EmployeeID [TAB] YYYY-MM-DD HH:MM:SS [TAB] State
 */
export function parseAttendanceLog(content: string): AttendanceLog[] {
  const lines = content.trim().split('\n');
  const logs: AttendanceLog[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    
    const parts = line.split('\t');
    if (parts.length >= 3) {
      const employeeId = parts[0].trim();
      const timestampStr = parts[1].trim();
      const state = parseInt(parts[2].trim(), 10);

      // Parse timestamp
      const timestamp = new Date(timestampStr);
      
      if (!isNaN(timestamp.getTime()) && !isNaN(state)) {
        logs.push({
          employeeId,
          timestamp,
          state,
        });
      }
    }
  }

  return logs;
}

/**
 * Parse user data file (user.dat)
 * Format varies, common: ID [TAB] Name [TAB] ... [TAB] Department
 */
export function parseUserData(content: string): UserData[] {
  const lines = content.trim().split('\n');
  const users: UserData[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    
    const parts = line.split('\t');
    if (parts.length >= 2) {
      users.push({
        id: parts[0].trim(),
        name: parts[1].trim(),
        department: parts.length > 2 ? parts[2].trim() : undefined,
      });
    }
  }

  return users;
}

/**
 * Parse department data file (department.dat)
 * Format: ID [TAB] Name
 */
export function parseDepartmentData(content: string): DepartmentData[] {
  const lines = content.trim().split('\n');
  const departments: DepartmentData[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    
    const parts = line.split('\t');
    if (parts.length >= 2) {
      departments.push({
        id: parts[0].trim(),
        name: parts[1].trim(),
      });
    }
  }

  return departments;
}

/**
 * Parse CSV file
 */
export function parseCSV(content: string, hasHeader: boolean = true): Record<string, string>[] {
  const lines = content.trim().split('\n');
  if (lines.length === 0) return [];

  const headers = hasHeader 
    ? lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
    : lines[0].split(',').map((_, i) => `column_${i}`);

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const records: Record<string, string>[] = [];

  for (const line of dataLines) {
    if (!line.trim()) continue;
    
    const values = line.split(',');
    const record: Record<string, string> = {};
    
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim() || '';
    });
    
    records.push(record);
  }

  return records;
}
