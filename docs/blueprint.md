# **App Name**: AlmTrack Billing Hub

## Core Features:

- Traccar Authentication: Authenticate users against the Traccar API /api/session. Store session securely in the browser.
- Device Subscription Plans: Admin can define subscription plans (name, prices, duration, features) in Firestore, including defining whether device installation is included in the price. The plan can also be monthly, and the user interface shall reflect this correctly. Plans will include yearly and monthly plans, with monthly being optional. All data regarding plans shall be stored in Firestore.
- Automated Invoice Generation: Generate invoices automatically X days before subscription expiry. Store all data in Firestore. Status will be included to differentiate between pending and paid.
- Subscription Assignment: Assign a device to a subscription plan and auto-calculate expiry based on plan duration. Expiring device information can be checked on the device list. Update Traccar expiry via PUT /api/devices/{id} when invoices are marked as Paid, triggering a database call and writing the updated expiry date for the associated device.
- Robocall Expiry Alerts: Cloud Function cron job to fetch devices expiring in X days and trigger voice alert via Robocall.pk API. Log all calls to Firebase.
- Financial Reporting and Analytics: Generate revenue vs expense charts, profit margin calculation, subscription revenue breakdown, active devices, and expiring device counts, displayed in a dashboard UI with the capacity for financial data to be exported as Excel or PDF.
- AI-Powered Renewal Prediction: Employ an AI tool that will analyze device usage data and invoice payment history to predict which subscriptions are likely to renew. This prediction can provide a prompt to the billing clerk that they should call the customer to discuss renewal, etc.

## Style Guidelines:

- Primary color: Deep sky blue (#42A5F5) to evoke trust and reliability in financial management.
- Background color: Very light blue (#E3F2FD), creating a clean and professional interface.
- Accent color: Orange (#FF9800), drawing attention to calls to action.
- Body and headline font: 'Inter', a grotesque-style sans-serif, providing a modern, objective look for both headlines and body text.
- Crisp, professional icons to represent financial data, subscription types, and alert statuses.
- A clear, dashboard-style layout providing easy access to key metrics, device lists, and management functions.
- Subtle transitions and loading animations to enhance user experience without being distracting.