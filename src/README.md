# AlmTrack Billing Hub

This is a NextJS starter project for managing subscriptions and billing for GPS devices.

## Getting Started

To get started, take a look at `src/app/page.tsx`. You will need to log in with your credentials to access the dashboard.

## How It Works

The application fetches your devices from your server instance and provides a dashboard to visualize your business metrics. It includes features for:

-   Viewing active devices and their subscription status.
-   Automated invoice generation for expiring subscriptions.
-   Logging and tracking business expenses.
-   AI-powered predictions for subscription renewals.

## Configuring Devices for Invoicing

For the automated invoice generation to work correctly, you must set specific attributes on each device within your server instance.

You can add these under **Settings -> Attributes** for each device.

### Required Attributes:

-   **`expirationTime`**: This is a standard field. Ensure it is set for every device you wish to bill.

-   **`renewalFee`**: (Number) The base fee for the subscription. The system uses this fee to determine the billing cycle.
    -   **Rule**: If `renewalFee` is greater than 2000, it's considered a **yearly** plan. If it's 2000 or less, it's a **monthly** plan.
    -   *Example*: `4500` (This would be treated as a yearly plan)

### Optional Attributes:

-   **`simCharges`**: (Number, Optional) Any additional charges for the SIM card to be included in the invoice.
    -   *Example*: `500`

-   **`discount`**: (Number, Optional) A discount amount to be subtracted from the invoice total.
    -   *Example*: `200`

-   **`phoneRobocall`**: (String, Optional) The customer's phone number. Used to send automated robocall reminders before the subscription expires.
    -   *Example*: `+923001234567`
