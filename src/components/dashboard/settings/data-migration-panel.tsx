'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { USE_POSTGRES } from '@/lib/data-config';

export default function DataMigrationPanel() {
  const [isMigrating, setIsMigrating] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const { toast } = useToast();

  const handleMigrate = async () => {
    setIsMigrating(true);
    setLastResult(null);
    try {
      const response = await fetch('/api/traccar/sync/migrate', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Migration failed');
      }
      const output = data.stdout || 'Migration completed successfully.';
      setLastResult(output);
      toast({
        title: 'Firestore sync complete',
        description: 'Data has been copied from Firestore into PostgreSQL.',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Migration failed';
      toast({
        title: 'Migration failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsMigrating(false);
    }
  };

  if (!USE_POSTGRES) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Data Migration (Testing)
        </CardTitle>
        <CardDescription>
          The app reads and writes PostgreSQL. Use this to re-sync Firestore data into PostgreSQL
          while testing, before fully retiring Firebase.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTitle>PostgreSQL is active</AlertTitle>
          <AlertDescription>
            Dashboard operations use PostgreSQL. Run a Firestore sync whenever you need the latest
            Firebase data copied over for comparison or testing.
          </AlertDescription>
        </Alert>
        <Button onClick={handleMigrate} disabled={isMigrating}>
          {isMigrating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Syncing from Firestore...
            </>
          ) : (
            'Sync Firestore → PostgreSQL'
          )}
        </Button>
        {lastResult ? (
          <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
            {lastResult}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}
