"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ROLE_HOME } from "@/lib/auth";
import type { UserRole } from "@/lib/database.types";

export type LoginState = { error: string | null };

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const expectedRole = String(formData.get("role") ?? "") as UserRole | "";

  if (!email || !password) {
    return { error: "Enter your email address and password." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: "That email and password don't match an account." };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle<{ role: UserRole }>();

  if (!profile) {
    await supabase.auth.signOut();
    return {
      error: "Your account isn't set up yet. Ask the agency to finish your profile.",
    };
  }

  // The teacher/student toggle and the separate admin route are both just
  // filters on the same credentials — a mismatch is a wrong-door error.
  if (expectedRole && profile.role !== expectedRole) {
    await supabase.auth.signOut();
    return expectedRole === "admin"
      ? { error: "That account isn't an agency admin account." }
      : { error: `That account isn't a ${expectedRole} account. Check the toggle above.` };
  }

  revalidatePath("/", "layout");
  redirect(ROLE_HOME[profile.role]);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
