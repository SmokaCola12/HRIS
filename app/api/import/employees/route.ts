import { NextRequest, NextResponse } from 'next/server';
import { ensureInitialized, EmployeeRepository, DepartmentRepository } from '@/lib/db/models';
import type { EmploymentType } from '@/lib/db/models';
import { hashPassword } from '@/lib/auth';

interface EmployeeRecord {
  id: string;
  name: string;
  department: string;
  employment_type?: string;
  username?: string;
  tempPassword?: string;
}

interface CreatedAccount {
  employeeId: string;
  name: string;
  department: string;
  username: string;
  tempPassword: string;
}

const EMPLOYMENT_TYPES = ['Regular', 'Probationary', 'Casual', 'Casual On-Call'] as const;

function normalizeEmploymentType(value?: string): EmploymentType {
  if (String(value || '').trim().toLowerCase() === 'on-call') return 'Casual On-Call';
  const match = EMPLOYMENT_TYPES.find((type) => type.toLowerCase() === String(value || '').trim().toLowerCase());
  return match || 'Probationary';
}

// Generate a secure random password (12 chars: uppercase, lowercase, numbers, special)
function generateSecurePassword(): string {
  const upperCase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowerCase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*';
  
  let password = '';
  password += upperCase[Math.floor(Math.random() * upperCase.length)];
  password += lowerCase[Math.floor(Math.random() * lowerCase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  const all = upperCase + lowerCase + numbers + special;
  for (let i = 0; i < 8; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

export async function POST(request: NextRequest) {
  try {
    ensureInitialized();
    const { records } = await request.json();

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { error: 'No records provided' },
        { status: 400 }
      );
    }

    let imported = 0;
    let updated = 0;
    let errors = 0;
    const createdAccounts: CreatedAccount[] = [];

    for (const record of records as EmployeeRecord[]) {
      try {
        // Find or create department
        let departmentId = null;
        let departmentName = record.department || '';
        if (record.department) {
          const department = DepartmentRepository.findByName(record.department);
          if (department) {
            departmentId = department.id;
          } else {
            // Create new department
            const newDept = DepartmentRepository.create({
              name: record.department,
              code: record.department.substring(0, 3).toUpperCase(),
              description: null,
            });
            departmentId = newDept.id;
          }
        }

        // Check if employee exists
        const existingEmployee = EmployeeRepository.findByEmployeeId(record.id);

        if (existingEmployee) {
          // Update existing employee
          const updateData: Record<string, unknown> = {
            name: record.name,
            department_id: departmentId,
          };
          if (record.employment_type) updateData.employment_type = normalizeEmploymentType(record.employment_type);
          EmployeeRepository.update(existingEmployee.id, updateData);
          updated++;
        } else {
          // Create new employee with system access credentials
          const username = record.username || record.id; // Default username to Employee ID
          // Generate a secure random temporary password
          const tempPassword = generateSecurePassword();
          const passwordHash = await hashPassword(tempPassword);

          EmployeeRepository.create({
            employee_id: record.id,
            name: record.name,
            username,
            email: null,
            phone: null,
            picture: null,
            department_id: departmentId,
            position_id: null,
            area_id: null,
            status: 'Active',
            employment_type: normalizeEmploymentType(record.employment_type),
            employment_type_effective_date: new Date().toISOString().split('T')[0],
            role: 'Employee',
            password_hash: passwordHash,
            basic_salary: 0,
            hire_date: new Date().toISOString().split('T')[0],
          });
          
          // Track created account credentials
          createdAccounts.push({
            employeeId: record.id,
            name: record.name,
            department: departmentName,
            username,
            tempPassword,
          });
          
          imported++;
        }
      } catch (err) {
        console.error('[HRIS] Import employee error:', err);
        errors++;
      }
    }

    console.log(`[HRIS] Employee import: ${imported} new, ${updated} updated, ${errors} errors`);

    return NextResponse.json({
      success: true,
      imported,
      updated,
      errors,
      total: records.length,
      createdAccounts, // Return credentials for admin to download
    });
  } catch (error) {
    console.error('[HRIS] Employee import error:', error);
    return NextResponse.json(
      { error: 'Failed to import employee data' },
      { status: 500 }
    );
  }
}
