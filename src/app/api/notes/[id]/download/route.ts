import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NOTES_BUCKET } from "@/lib/env";

/**
 * Mints a short-lived signed URL for a lesson note. The lookup runs through
 * the caller's own Supabase session, so row level security decides whether
 * they can see the note at all — an unauthorised id is simply "not found".
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: note } = await supabase
    .from("notes")
    .select("file_path, file_name")
    .eq("id", id)
    .maybeSingle<{ file_path: string | null; file_name: string | null }>();

  if (!note?.file_path) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from(NOTES_BUCKET)
    .createSignedUrl(note.file_path, 60, { download: note.file_name ?? undefined });

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Could not open that file" }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
