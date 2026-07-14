
'use client';

import PageHeader from '@/components/page-header';
import ApprovalList from '@/components/dashboard/approvals/approval-list';

export default function ApprovalsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval Requests"
        description="Review and act on pending critical actions."
      />
      <ApprovalList />
    </div>
  );
}
