import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma/client';
import { requireAdminSession } from '@/lib/client-documents/auth';
import { isDocKind } from '@/lib/client-documents/validate';
import { readUploadFile, replaceUploadFile } from '@/lib/client-documents/store';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; kind: string }> };

export async function GET(req: NextRequest, context: Ctx) {
  const auth = await requireAdminSession(req);
  if ('error' in auth) return auth.error;

  const { id, kind } = await context.params;
  if (kind !== 'cnic_front' && kind !== 'cnic_back') {
    return NextResponse.json({ success: false, message: 'Invalid document kind.' }, { status: 400 });
  }

  const userId = Number(id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ success: false, message: 'Invalid client id.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ success: false, message: 'Client not found.' }, { status: 404 });
  }

  const relativePath = kind === 'cnic_front' ? user.cnicFrontPath : user.cnicBackPath;
  if (!relativePath) {
    return NextResponse.json(
      { success: false, message: 'No document uploaded' },
      { status: 404 }
    );
  }

  try {
    const file = await readUploadFile(relativePath);
    const download = req.nextUrl.searchParams.get('download') === '1';
    return new NextResponse(new Uint8Array(file.data), {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${file.fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to read document';
    return NextResponse.json({ success: false, message }, { status: 404 });
  }
}

export async function PUT(req: NextRequest, context: Ctx) {
  const auth = await requireAdminSession(req);
  if ('error' in auth) return auth.error;

  const { id, kind } = await context.params;
  if (!isDocKind(kind) || (kind !== 'cnic_front' && kind !== 'cnic_back')) {
    return NextResponse.json({ success: false, message: 'Invalid document kind.' }, { status: 400 });
  }

  const userId = Number(id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ success: false, message: 'Invalid client id.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ success: false, message: 'Client not found.' }, { status: 404 });
  }
  if (!user.cnic) {
    return NextResponse.json(
      { success: false, message: 'Client has no CNIC on file. Cannot store documents.' },
      { status: 400 }
    );
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ success: false, message: 'File is required.' }, { status: 400 });
  }

  try {
    const previous =
      kind === 'cnic_front' ? user.cnicFrontPath : user.cnicBackPath;
    const stored = await replaceUploadFile({
      previousRelativePath: previous,
      cnic: user.cnic,
      customerName: user.name,
      kind,
      file,
      actor: auth.user.name,
    });

    const updated = await prisma.user.update({
      where: { id: userId },
      data:
        kind === 'cnic_front'
          ? { cnicFrontPath: stored.relativePath }
          : { cnicBackPath: stored.relativePath },
    });

    return NextResponse.json({ success: true, client: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
