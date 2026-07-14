'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Sparkles, Lightbulb, ServerCrash } from 'lucide-react';
import { getRenewalPrediction } from '@/app/actions';
import type { PredictSubscriptionRenewalOutput } from '@/ai/flows/predict-subscription-renewals';

type PredictionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: PredictSubscriptionRenewalOutput }
  | { status: 'error'; message: string };

export default function RenewalPredictions() {
  const [prediction, setPrediction] = useState<PredictionState>({ status: 'idle' });

  const handleAnalysis = async () => {
    setPrediction({ status: 'loading' });
    const result = await getRenewalPrediction();
    if (result.success && result.data) {
      setPrediction({ status: 'success', data: result.data });
    } else {
      setPrediction({ status: 'error', message: result.error || 'An unknown error occurred' });
    }
  };

  const renderContent = () => {
    switch (prediction.status) {
      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center text-muted-foreground p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p>Analyzing renewal patterns...</p>
          </div>
        );
      case 'error':
        return (
           <Alert variant="destructive" className="mt-4">
             <ServerCrash className="h-4 w-4" />
             <AlertTitle>Analysis Failed</AlertTitle>
             <AlertDescription>{prediction.message}</AlertDescription>
           </Alert>
        );
      case 'success':
        return (
          <div className="mt-4 space-y-4">
            <Alert>
              <Lightbulb className="h-4 w-4" />
              <AlertTitle>Renewal Likelihood</AlertTitle>
              <AlertDescription>
                {prediction.data.renewalLikelihood}
              </AlertDescription>
            </Alert>
             <Alert>
              <Sparkles className="h-4 w-4 text-accent" />
              <AlertTitle>Recommended Action</AlertTitle>
              <AlertDescription>
                {prediction.data.recommendedAction}
              </AlertDescription>
            </Alert>
          </div>
        );
      case 'idle':
      default:
        return (
          <div className="text-center text-muted-foreground p-8">
            <p>Click the button to analyze subscription renewal likelihood for a sample customer.</p>
          </div>
        );
    }
  };

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
            <div>
                <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    AI Renewal Prediction
                </CardTitle>
                <CardDescription>
                    Predict which subscriptions are likely to renew.
                </CardDescription>
            </div>
            <Button onClick={handleAnalysis} disabled={prediction.status === 'loading'} size="sm">
                {prediction.status === 'loading' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    'Analyze'
                )}
            </Button>
        </div>
      </CardHeader>
      <CardContent>
        {renderContent()}
      </CardContent>
    </Card>
  );
}
