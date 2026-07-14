'use server';

/**
 * @fileOverview An AI tool that analyzes device usage data and invoice payment history to predict which subscriptions are likely to renew.
 *
 * - predictSubscriptionRenewal - A function that predicts subscription renewals.
 * - PredictSubscriptionRenewalInput - The input type for the predictSubscriptionRenewal function.
 * - PredictSubscriptionRenewalOutput - The return type for the predictSubscriptionRenewal function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const PredictSubscriptionRenewalInputSchema = z.object({
  deviceUsageData: z
    .string()
    .describe('A description of the device usage data, in JSON format.'),
  invoicePaymentHistory: z
    .string()
    .describe('A description of the invoice payment history, in JSON format.'),
});
export type PredictSubscriptionRenewalInput = z.infer<
  typeof PredictSubscriptionRenewalInputSchema
>;

const PredictSubscriptionRenewalOutputSchema = z.object({
  renewalLikelihood: z
    .string()
    .describe(
      'The likelihood of renewal, as a percentage, and the reasoning behind the prediction.'
    ),
  recommendedAction: z
    .string()
    .describe(
      'A recommended action for the billing clerk, such as calling the customer.'
    ),
});
export type PredictSubscriptionRenewalOutput = z.infer<
  typeof PredictSubscriptionRenewalOutputSchema
>;

export async function predictSubscriptionRenewal(
  input: PredictSubscriptionRenewalInput
): Promise<PredictSubscriptionRenewalOutput> {
  return predictSubscriptionRenewalFlow(input);
}

const prompt = ai.definePrompt({
  name: 'predictSubscriptionRenewalPrompt',
  input: {schema: PredictSubscriptionRenewalInputSchema},
  output: {schema: PredictSubscriptionRenewalOutputSchema},
  prompt: `You are an AI assistant that analyzes device usage data and invoice payment history to predict which subscriptions are likely to renew.

Analyze the following device usage data:
{{{deviceUsageData}}}

Analyze the following invoice payment history:
{{{invoicePaymentHistory}}}

Based on this information, provide the likelihood of renewal as a percentage, and the reasoning behind the prediction.  Also provide a recommended action for the billing clerk, such as calling the customer to discuss renewal.

Output the likelihood of renewal as a percentage and reasoning in the renewalLikelihood field and the recommended action in the recommendedAction field.
`,
});

const predictSubscriptionRenewalFlow = ai.defineFlow(
  {
    name: 'predictSubscriptionRenewalFlow',
    inputSchema: PredictSubscriptionRenewalInputSchema,
    outputSchema: PredictSubscriptionRenewalOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
