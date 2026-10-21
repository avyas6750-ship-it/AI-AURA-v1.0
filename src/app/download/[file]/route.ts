import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join } from "path";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const ALLOWED = new Set([
    "hydrograph-vercel-source.zip",
    "hydrograph-source-protected.zip",
    "hydrograph-source.zip",
    "hydrograph-source.tar.gz",
  ]);
  if (!ALLOWED.has(file)) return new NextResponse("Not found", { status: 404 });

  const filePath = join("/home/z/my-project/download", file);
  try {
    const data = await readFile(filePath);
    const st = await stat(filePath);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": file.endsWith(".tar.gz") ? "application/gzip" : "application/zip",
        "Content-Length": String(st.size),
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new NextResponse(`Failed: ${e}`, { status: 500 });
  }
}
