import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join } from "path";

export async function GET(_req: NextRequest) {
  const file = "hydrograph-source-protected.zip";
  const filePath = join("/home/z/my-project/download", file);
  try {
    const data = await readFile(filePath);
    const st = await stat(filePath);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
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
