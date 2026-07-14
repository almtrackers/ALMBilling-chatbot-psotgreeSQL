
'use client';
import PageHeader from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import SettingsForm from '@/components/dashboard/settings/settings-form';
import ProfileSettings from '@/components/dashboard/settings/profile-settings';
import SecuritySettings from '@/components/dashboard/settings/security-settings';
import DataMigrationPanel from '@/components/dashboard/settings/data-migration-panel';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure application settings and integrations."
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
           <Card>
            <CardHeader>
              <CardTitle>Application Configuration</CardTitle>
              <CardDescription>
                Manage global settings for theme, automation, and finances.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SettingsForm />
            </CardContent>
          </Card>
          <SecuritySettings />
          <DataMigrationPanel />
        </div>
        <div className="lg:col-span-1">
          <ProfileSettings />
        </div>
      </div>
    </div>
  );
}
