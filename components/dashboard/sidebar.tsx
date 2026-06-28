'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth, EmployeeRole } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users,
  Clock,
  FileText,
  Calendar,
  CreditCard,
  Settings,
  LayoutDashboard,
  UserCircle,
  ClipboardList,
  CalendarDays,
  Calculator,
  Building2,
  LogOut,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Gift,
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  roles: EmployeeRole[];
}

const navItems: NavItem[] = [
  // All users
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['Employee', 'Manager', 'Admin', 'CEO', 'DEV'] },
  { title: 'My Profile', href: '/dashboard/profile', icon: UserCircle, roles: ['Employee', 'Manager', 'Admin', 'CEO', 'DEV'] },
  { title: 'My Attendance', href: '/dashboard/attendance', icon: Clock, roles: ['Employee', 'Manager', 'Admin', 'CEO', 'DEV'] },
  { title: 'My Schedule', href: '/dashboard/schedule', icon: Calendar, roles: ['Employee', 'Manager', 'Admin', 'CEO', 'DEV'] },
  { title: 'My Payslips', href: '/dashboard/payslips', icon: CreditCard, roles: ['Employee', 'Manager', 'Admin', 'CEO', 'DEV'] },
  
  // Request portals
  { title: 'OT Request', href: '/dashboard/requests/overtime', icon: FileText, roles: ['Employee', 'Manager', 'Admin', 'CEO', 'DEV'] },
  { title: 'Leave Request', href: '/dashboard/requests/leave', icon: CalendarDays, roles: ['Employee', 'Manager', 'Admin', 'CEO', 'DEV'] },
  { title: 'Salary Advance', href: '/dashboard/requests/salary-advance', icon: CreditCard, roles: ['Employee', 'Manager', 'Admin', 'CEO', 'DEV'] },
  { title: 'Incentives', href: '/dashboard/requests/incentives', icon: Gift, roles: ['Employee', 'Manager', 'Admin', 'CEO', 'DEV'] },
  
  // Manager/Admin/CEO/DEV
  { title: 'Approvals', href: '/dashboard/approvals', icon: ClipboardList, roles: ['Manager', 'Admin', 'CEO', 'DEV'] },
  { title: 'Employees', href: '/dashboard/employees', icon: Users, roles: ['Manager', 'Admin', 'CEO', 'DEV'] },
  { title: 'Attendance Report', href: '/dashboard/reports/attendance', icon: Clock, roles: ['Manager', 'Admin', 'CEO', 'DEV'] },
  { title: 'Payroll', href: '/dashboard/payroll', icon: Calculator, roles: ['Manager', 'Admin', 'CEO', 'DEV'] },
  { title: 'Holidays', href: '/dashboard/holidays', icon: CalendarDays, roles: ['Manager', 'Admin', 'CEO', 'DEV'] },
  
  // System tools
  { title: 'System Status', href: '/dashboard/system-status', icon: BarChart3, roles: ['DEV'] },
  { title: 'Data Import', href: '/dashboard/import', icon: FileText, roles: ['Manager', 'Admin', 'DEV'] },
  { title: 'Salary Grades', href: '/dashboard/salary-grades', icon: CreditCard, roles: ['DEV'] },
  { title: 'Shifts', href: '/dashboard/shifts', icon: Clock, roles: ['Manager', 'Admin', 'DEV'] },
  { title: 'Formulas', href: '/dashboard/formulas', icon: Calculator, roles: ['Manager', 'Admin', 'DEV'] },
  { title: 'Organization', href: '/dashboard/organization', icon: Building2, roles: ['Manager', 'Admin', 'DEV'] },
  { title: 'Settings', href: '/dashboard/settings', icon: Settings, roles: ['DEV'] },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  if (!user) return null;

  const filteredNavItems = navItems.filter((item) =>
    item.roles.includes(user.role)
  );

  // Group nav items
  const personalItems = filteredNavItems.filter((item) =>
    ['Dashboard', 'My Profile', 'My Attendance', 'My Schedule', 'My Payslips'].includes(item.title)
  );
  const requestItems = filteredNavItems.filter((item) =>
    ['OT Request', 'Leave Request', 'Salary Advance', 'Incentives'].includes(item.title)
  );
  const managementItems = filteredNavItems.filter((item) =>
    ['Approvals', 'Employees', 'Attendance Report', 'Payroll', 'Holidays'].includes(item.title)
  );
  const devItems = filteredNavItems.filter((item) =>
    ['System Status', 'Data Import', 'Salary Grades', 'Shifts', 'Formulas', 'Organization', 'Settings'].includes(item.title)
  );

  return (
    <div
      className={cn(
        'flex flex-col border-r border-border bg-sidebar h-screen transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6" />
            <span className="font-bold text-lg">HRIS</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(collapsed && 'mx-auto')}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-6 px-2">
          {/* Personal Section */}
          <div>
            {!collapsed && (
              <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Personal
              </p>
            )}
            <div className="space-y-1">
              {personalItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={pathname === item.href ? 'secondary' : 'ghost'}
                    className={cn('w-full', collapsed ? 'justify-center px-2' : 'justify-start')}
                    title={collapsed ? item.title : undefined}
                  >
                    <item.icon className={cn('h-4 w-4', !collapsed && 'mr-2')} />
                    {!collapsed && item.title}
                  </Button>
                </Link>
              ))}
            </div>
          </div>

          {/* Requests Section */}
          {requestItems.length > 0 && (
            <div>
              {!collapsed && (
                <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Requests
                </p>
              )}
              <div className="space-y-1">
                {requestItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={pathname === item.href ? 'secondary' : 'ghost'}
                      className={cn('w-full', collapsed ? 'justify-center px-2' : 'justify-start')}
                      title={collapsed ? item.title : undefined}
                    >
                      <item.icon className={cn('h-4 w-4', !collapsed && 'mr-2')} />
                      {!collapsed && item.title}
                    </Button>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Management Section */}
          {managementItems.length > 0 && (
            <div>
              {!collapsed && (
                <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Management
                </p>
              )}
              <div className="space-y-1">
                {managementItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={pathname === item.href ? 'secondary' : 'ghost'}
                      className={cn('w-full', collapsed ? 'justify-center px-2' : 'justify-start')}
                      title={collapsed ? item.title : undefined}
                    >
                      <item.icon className={cn('h-4 w-4', !collapsed && 'mr-2')} />
                      {!collapsed && item.title}
                    </Button>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* DEV Section */}
          {devItems.length > 0 && (
            <div>
              {!collapsed && (
                <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  System
                </p>
              )}
              <div className="space-y-1">
                {devItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={pathname === item.href ? 'secondary' : 'ghost'}
                      className={cn('w-full', collapsed ? 'justify-center px-2' : 'justify-start')}
                      title={collapsed ? item.title : undefined}
                    >
                      <item.icon className={cn('h-4 w-4', !collapsed && 'mr-2')} />
                      {!collapsed && item.title}
                    </Button>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </nav>
      </ScrollArea>

      {/* User info and logout */}
      <div className="p-4 border-t border-border">
        {!collapsed && (
          <div className="mb-3">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.role}</p>
          </div>
        )}
        <Button
          variant="ghost"
          onClick={logout}
          className={cn('w-full', collapsed ? 'justify-center px-2' : 'justify-start')}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className={cn('h-4 w-4', !collapsed && 'mr-2')} />
          {!collapsed && 'Logout'}
        </Button>
      </div>
    </div>
  );
}
