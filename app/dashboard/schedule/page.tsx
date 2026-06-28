'use client';

import { useState } from 'react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, Clock, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

// Mock schedule data
const mockSchedule = {
  shift: {
    name: 'Shift 1.0',
    startTime: '08:00',
    endTime: '17:00',
    breakStart: '12:00',
    breakEnd: '13:00',
  },
  holidays: [
    { date: '2026-05-25', name: 'Memorial Day', type: 'Regular' },
  ],
  leaves: [
    { date: '2026-05-20', type: 'Regular Leave' },
    { date: '2026-05-21', type: 'Regular Leave' },
    { date: '2026-05-22', type: 'Regular Leave' },
  ],
};

export default function SchedulePage() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 }); // Monday

  const goToPreviousWeek = () => {
    setCurrentWeek(addDays(currentWeek, -7));
  };

  const goToNextWeek = () => {
    setCurrentWeek(addDays(currentWeek, 7));
  };

  const goToThisWeek = () => {
    setCurrentWeek(new Date());
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getDayStatus = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const day = date.getDay();
    
    // Weekend
    if (day === 0 || day === 6) {
      return { type: 'weekend', label: 'Rest Day' };
    }
    
    // Holiday
    const holiday = mockSchedule.holidays.find(h => h.date === dateStr);
    if (holiday) {
      return { type: 'holiday', label: holiday.name };
    }
    
    // Leave
    const leave = mockSchedule.leaves.find(l => l.date === dateStr);
    if (leave) {
      return { type: 'leave', label: leave.type };
    }
    
    // Regular work day
    return { type: 'work', label: 'Work Day' };
  };

  return (
    <div className="flex flex-col h-full">
      <DashboardHeader
        title="My Schedule"
        description="View your work schedule and shift assignments"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Current Shift Info */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Current Shift</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mockSchedule.shift.name}</div>
              <p className="text-xs text-muted-foreground mt-1">
                <Clock className="inline h-3 w-3 mr-1" />
                {mockSchedule.shift.startTime} - {mockSchedule.shift.endTime}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Break Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">1 Hour</div>
              <p className="text-xs text-muted-foreground mt-1">
                {mockSchedule.shift.breakStart} - {mockSchedule.shift.breakEnd}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Work Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">8 Hours</div>
              <p className="text-xs text-muted-foreground mt-1">Per day (excluding break)</p>
            </CardContent>
          </Card>
        </div>

        {/* Weekly Schedule */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Weekly Schedule</CardTitle>
                <CardDescription>Your work schedule for the week</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={goToPreviousWeek}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={goToThisWeek}>
                  Today
                </Button>
                <Button variant="outline" size="icon" onClick={goToNextWeek}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-4">
              <p className="text-lg font-medium">
                {format(weekStart, 'MMMM d')} - {format(addDays(weekStart, 6), 'MMMM d, yyyy')}
              </p>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((day) => {
                const status = getDayStatus(day);
                const today = isToday(day);
                
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'p-4 border border-border text-center',
                      today && 'ring-2 ring-primary',
                      status.type === 'weekend' && 'bg-muted/50',
                      status.type === 'holiday' && 'bg-green-50 dark:bg-green-950',
                      status.type === 'leave' && 'bg-blue-50 dark:bg-blue-950'
                    )}
                  >
                    <p className="text-xs text-muted-foreground">
                      {format(day, 'EEE')}
                    </p>
                    <p className={cn('text-2xl font-bold', today && 'text-primary')}>
                      {format(day, 'd')}
                    </p>
                    <div className="mt-2">
                      {status.type === 'work' ? (
                        <div className="space-y-1">
                          <Badge variant="default" className="text-xs">
                            {mockSchedule.shift.startTime}
                          </Badge>
                          <p className="text-xs text-muted-foreground">to</p>
                          <Badge variant="default" className="text-xs">
                            {mockSchedule.shift.endTime}
                          </Badge>
                        </div>
                      ) : (
                        <Badge
                          variant={
                            status.type === 'weekend' ? 'outline' :
                            status.type === 'holiday' ? 'default' :
                            'secondary'
                          }
                          className="text-xs"
                        >
                          {status.label}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Legend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-background border border-border" />
                <span className="text-sm">Work Day</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-muted" />
                <span className="text-sm">Weekend/Rest Day</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-100 dark:bg-green-900" />
                <span className="text-sm">Holiday</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-100 dark:bg-blue-900" />
                <span className="text-sm">On Leave</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 ring-2 ring-primary" />
                <span className="text-sm">Today</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
