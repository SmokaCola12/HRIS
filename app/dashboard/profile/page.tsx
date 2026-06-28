'use client';

import { ChangeEvent, ReactNode, useRef, useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth/auth-context';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Briefcase, Building2, Camera, Mail, MapPin, Phone, Save, Trash2 } from 'lucide-react';

const MAX_PHOTO_LENGTH = 2_500_000;

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Failed to load profile');
  return data;
};

type ProfileData = {
  profile: {
    id: number;
    employee_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    picture: string | null;
    role: string;
    status: string;
    employment_type: string;
    hire_date: string | null;
    department: string | null;
    position: string | null;
    area: string | null;
    salary_grade: { name: string; amount: number; frequency: string } | null;
    schedule: { name: string; start_time: string; end_time: string; source: string } | null;
  };
};

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function readResizedImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      reject(new Error('Choose a JPEG, PNG, or WebP image'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Failed to load image'));
      image.onload = () => {
        const maxSize = 512;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Unable to resize image'));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.86);
        if (dataUrl.length > MAX_PHOTO_LENGTH) {
          reject(new Error('Profile photo is too large after resizing'));
          return;
        }
        resolve(dataUrl);
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { data, mutate } = useSWR<ProfileData>(user ? '/api/profile' : null, fetcher);
  const profile = data?.profile;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({ phone: '', email: '', picture: null as string | null });

  if (!user) return null;
  const displayName = profile?.name || user.name;
  const displayPicture = isEditing ? formData.picture : profile?.picture ?? user.picture ?? null;

  const beginEdit = () => {
    setFormData({
      phone: profile?.phone || '',
      email: profile?.email || user.email || '',
      picture: profile?.picture || user.picture || null,
    });
    setIsEditing(true);
  };

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const picture = await readResizedImage(file);
      setFormData((current) => ({ ...current, picture }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load profile photo');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to update profile');

      await mutate();
      await refreshUser();
      toast.success('Profile updated successfully');
      setIsEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <DashboardHeader title="My Profile" description="View and update your personal information" />

      <div className="flex-1 space-y-6 overflow-auto p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={displayPicture || undefined} alt={displayName} />
                    <AvatarFallback className="text-2xl">{getInitials(displayName)}</AvatarFallback>
                  </Avatar>
                  {isEditing && (
                    <>
                      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
                      <Button
                        type="button"
                        size="icon"
                        className="absolute bottom-0 right-0 h-9 w-9 rounded-full"
                        onClick={() => fileInputRef.current?.click()}
                        title="Change profile photo"
                      >
                        <Camera className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
                {isEditing && displayPicture && (
                  <Button type="button" variant="ghost" size="sm" className="mt-3 text-destructive" onClick={() => setFormData((current) => ({ ...current, picture: null }))}>
                    <Trash2 className="h-4 w-4" />
                    Remove Photo
                  </Button>
                )}
                <h2 className="mt-4 text-xl font-bold">{displayName}</h2>
                <p className="text-sm text-muted-foreground">Employee ID: {profile?.employee_id || user.employeeId}</p>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  <Badge>{profile?.role || user.role}</Badge>
                  {profile?.employment_type && <Badge variant="outline">{profile.employment_type}</Badge>}
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{profile?.email || user.email || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{profile?.phone || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{profile?.department || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <span>{profile?.position || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{profile?.area || 'N/A'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>Update your contact information</CardDescription>
                </div>
                {!isEditing && <Button onClick={beginEdit}>Edit Profile</Button>}
              </div>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSave} disabled={isSaving}>
                      <Save className="h-4 w-4" />
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button variant="outline" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <Detail label="Full Name" value={displayName} />
                  <Detail label="Employee ID" value={profile?.employee_id || user.employeeId} />
                  <Detail label="Email Address" value={profile?.email || user.email || 'N/A'} />
                  <Detail label="Phone Number" value={profile?.phone || 'N/A'} />
                  <Detail label="Department" value={profile?.department || 'N/A'} />
                  <Detail label="Position" value={profile?.position || 'N/A'} />
                  <Detail label="Area" value={profile?.area || 'N/A'} />
                  <Detail label="Status" value={<Badge variant="default">{profile?.status || 'Active'}</Badge>} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Employment Details</CardTitle>
            <CardDescription>Your employment information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <Detail label="Role Level" value={profile?.role || user.role} />
              <Detail label="Employment Type" value={profile?.employment_type || 'N/A'} />
              <Detail
                label="Shift Schedule"
                value={profile?.schedule ? `${profile.schedule.name} (${profile.schedule.start_time}-${profile.schedule.end_time})` : 'Flexible / not scheduled today'}
              />
              <Detail label="Salary Grade" value={profile?.salary_grade?.name || 'N/A'} />
              <Detail label="Hire Date" value={profile?.hire_date || 'N/A'} />
              <Detail label="Area" value={profile?.area || 'N/A'} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}
