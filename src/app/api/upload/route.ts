import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "BLOB_READ_WRITE_TOKEN is not configured. Add it to .env.local to enable uploads.",
      },
      { status: 500 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const folder = String(form.get("folder") ?? "uploads");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const blob = await put(
    `${folder}/${user.id}/${Date.now()}-${file.name}`,
    file,
    { access: "public", token: process.env.BLOB_READ_WRITE_TOKEN },
  );

  return NextResponse.json({ url: blob.url });
}
