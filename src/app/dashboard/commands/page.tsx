
'use client';

import PageHeader from '@/components/page-header';
import CommandList from '@/components/dashboard/commands/command-list';
import AddCommandForm from '@/components/dashboard/commands/add-command-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import CommandResultList from '@/components/dashboard/commands/command-result-list';
import SendDirectCommandForm from '@/components/dashboard/commands/send-direct-command-form';

export default function CommandsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Custom Commands"
        description="Create, manage, and send reusable commands to your devices."
      />
      
      <CommandList />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
         <Card className="lg:col-span-3">
            <CardHeader>
            <CardTitle>Direct Command</CardTitle>
            <CardDescription>
                Send a one-off command to any vehicle. Offline devices use SMS when gateway is configured in .env.
            </CardDescription>
            </CardHeader>
            <CardContent>
                <SendDirectCommandForm />
            </CardContent>
        </Card>
        <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Add New Command</CardTitle>
              <CardDescription>
                Save a command for easy reuse.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AddCommandForm />
            </CardContent>
          </Card>
      </div>

      <CommandResultList />
    </div>
  );
}
