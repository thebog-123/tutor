import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppUser, Student, Teacher, UserRole } from "@/lib/database.types";

export const ROLE_HOME: Record<UserRole, string> = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/student",
};

export async function getCurrentProfile(): Promise<AppUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<AppUser>();

  return data ?? null;
}

/**
 * Gate a page on a role. Sends anonymous visitors to the right login screen
 * and anyone with the wrong role to their own dashboard rather than a 403.
 */
async function requireRole(role: UserRole): Promise<AppUser> {
  const profile = await getCurrentProfile();
  if (!profile) redirect(role === "admin" ? "/login/admin" : "/login");
  if (profile.role !== role) redirect(ROLE_HOME[profile.role]);
  return profile;
}

export async function requireAdmin() {
  return requireRole("admin");
}

export async function requireTeacher(): Promise<{ profile: AppUser; teacher: Teacher }> {
  const profile = await requireRole("teacher");
  const supabase = await createSupabaseServerClient();
  const { data: teacher } = await supabase
    .from("teachers")
    .select("*")
    .eq("user_id", profile.id)
    .maybeSingle<Teacher>();

  if (!teacher) {
    // The auth account exists but the admin never finished the tutor profile.
    redirect("/login?error=profile_incomplete");
  }
  return { profile, teacher };
}

export async function requireStudent(): Promise<{ profile: AppUser; student: Student }> {
  const profile = await requireRole("student");
  const supabase = await createSupabaseServerClient();
  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("user_id", profile.id)
    .maybeSingle<Student>();

  if (!student) {
    redirect("/login?error=profile_incomplete");
  }
  return { profile, student };
}
