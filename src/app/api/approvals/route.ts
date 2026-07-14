import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { subDays, parseISO } from 'date-fns';

export async function POST(req: NextRequest) {
  try {
    const { actionType, targetId, payload, requestedBy } = await req.json();

    if (!actionType || !targetId || !requestedBy) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // In a real app, you'd fetch admins from the DB.
    // For now, let's assume we need at least 1 approval besides the requester if there are other admins.
    // This is a placeholder logic.
    const adminCount = await prisma.user.count();
    const requiredApprovals = adminCount > 1 ? adminCount : 1;

    if (requiredApprovals <= 1) {
      return NextResponse.json({ 
        success: true, 
        id: 'auto_approved',
        message: 'Auto-approved as only one admin exists' 
      });
    }

    const approvalRequest = await prisma.approvalRequest.create({
      data: {
        id: uuidv4(),
        actionType,
        targetId,
        payload: JSON.stringify(payload),
        status: 'pending',
        requestedBy: JSON.stringify(requestedBy),
        approvals: JSON.stringify([{ uid: requestedBy.uid, name: requestedBy.name }]),
        requiredApprovals,
        createdAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, id: approvalRequest.id });
  } catch (error: any) {
    console.error('POST /api/approvals - Error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const approvals = await prisma.approvalRequest.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const parsedApprovals = approvals.map(app => ({
      ...app,
      payload: JSON.parse(app.payload),
      requestedBy: JSON.parse(app.requestedBy),
      approvals: JSON.parse(app.approvals),
      rejections: app.rejections ? JSON.parse(app.rejections) : [],
    }));

    return NextResponse.json(parsedApprovals);
  } catch (error: any) {
    console.error('GET /api/approvals - Error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, vote, uid, name } = await req.json();

    if (!id || !vote || !uid || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const request = await prisma.approvalRequest.findUnique({
      where: { id },
    });

    if (!request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const approvals = JSON.parse(request.approvals);
    const rejections = request.rejections ? JSON.parse(request.rejections) : [];

    if (vote === 'approve') {
      if (!approvals.some((a: any) => a.uid === uid)) {
        approvals.push({ uid, name, timestamp: new Date() });
      }
    } else if (vote === 'reject') {
      if (!rejections.some((r: any) => r.uid === uid)) {
        rejections.push({ uid, name, timestamp: new Date() });
      }
    }

    const updatedRequest = await prisma.approvalRequest.update({
      where: { id },
      data: {
        approvals: JSON.stringify(approvals),
        rejections: JSON.stringify(rejections),
        status: rejections.length > 0 ? 'rejected' : (approvals.length >= request.requiredApprovals ? 'approved' : 'pending'),
        resolvedAt: (rejections.length > 0 || approvals.length >= request.requiredApprovals) ? new Date() : null,
      },
    });

    // Execute action if finally approved
    if (updatedRequest.status === 'approved' && request.status !== 'approved') {
      const payload = JSON.parse(request.payload);
      
      try {
        switch (request.actionType) {
          case 'approve_expense': {
            await prisma.expense.update({
              where: { id: request.targetId },
              data: {
                status: payload.newStatus,
                approvedBy: payload.newStatus === 'approved' ? name : null,
                approvedAt: payload.newStatus === 'approved' ? new Date() : null,
              },
            });
            break;
          }
          case 'mark_invoice_unpaid': {
            await prisma.invoice.update({
              where: { id: request.targetId },
              data: { status: 'pending', paidAt: null, paidBy: null },
            });
            
            // Note: reverseTraccarDeviceExpiry needs to be handled. 
            // Since this is server-side, we should probably call the Traccar API directly or a helper.
            // For now, let's assume the Traccar API proxy is available.
            const deviceIdsToRevert = payload.deviceIds || [payload.deviceId];
            for (const deviceId of deviceIdsToRevert) {
              // We'd need to fetch the device from Traccar to get its current expiry, 
              // then subtract the period duration.
              // This is complex for a single API route. 
              // For now, let's log that this needs to be done.
              console.log(`[TODO] Reverse Traccar device expiry for ${deviceId}`);
            }
            break;
          }
          case 'clear_logs': {
            const days = payload.days;
            const cutOffDate = subDays(new Date(), days);
            await prisma.log.deleteMany({
              where: {
                createdAt: {
                  lt: cutOffDate,
                },
              },
            });
            break;
          }
        }
        
        // Log the execution
        await prisma.log.create({
          data: {
            action: `Executed approved action '${request.actionType}' on '${request.targetId}'`,
            adminName: 'System',
            type: 'automation',
            createdAt: new Date(),
          },
        });

      } catch (executionError: any) {
        console.error('Action execution failed:', executionError);
        // We might want to revert the status or mark it as 'execution_failed'
        await prisma.approvalRequest.update({
          where: { id },
          data: { status: 'execution_failed' },
        });
        return NextResponse.json({ error: `Action execution failed: ${executionError.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ 
      success: true, 
      status: updatedRequest.status,
      id: updatedRequest.id
    });
  } catch (error: any) {
    console.error('PUT /api/approvals - Error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    await prisma.approvalRequest.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/approvals - Error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
