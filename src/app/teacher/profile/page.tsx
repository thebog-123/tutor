import type { Metadata } from "next";
import { requireTeacher } from "@/lib/auth";
import { updateTeacherProfile } from "@/app/teacher/actions";
import { ActionForm } from "@/components/portal/ActionForm";
import { Badge, Card, CardHeader, PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "My profile" };

export default async function TeacherProfilePage() {
  const { profile, teacher } = await requireTeacher();

  return (
    <>
      <PageHeading
        title="My profile"
        description="What your students see, and what appears on the agency homepage."
      />

      <Card>
        <CardHeader
          title={profile.full_name}
          description={profile.email}
          action={
            <Badge tone={teacher.is_published ? "sage" : "neutral"}>
              {teacher.is_published ? "Shown on the homepage" : "Not on the homepage"}
            </Badge>
          }
        />
        <div className="p-5">
          <ActionForm action={updateTeacherProfile} submitLabel="Save profile" variant="sage">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="specialty">
                  Subject specialty
                </label>
                <input
                  id="specialty"
                  name="subject_specialty"
                  defaultValue={teacher.subject_specialty ?? ""}
                  maxLength={120}
                  placeholder="e.g. A Level Physics & Maths"
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="years">
                  Years tutoring
                </label>
                <input
                  id="years"
                  name="years_experience"
                  type="number"
                  min={0}
                  max={70}
                  step={1}
                  defaultValue={teacher.years_experience ?? ""}
                  className="field-input"
                />
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="headline">
                Headline
              </label>
              <input
                id="headline"
                name="headline"
                defaultValue={teacher.headline ?? ""}
                maxLength={160}
                placeholder="One line on what you're like to work with."
                className="field-input"
              />
              <p className="mt-1 text-xs text-ink-400">
                Shown in bold above your bio on your students&apos; &ldquo;My tutor&rdquo; page.
              </p>
            </div>

            <div>
              <label className="field-label" htmlFor="bio">
                Bio
              </label>
              <textarea
                id="bio"
                name="bio"
                rows={6}
                maxLength={1200}
                defaultValue={teacher.bio ?? ""}
                placeholder="Your background, how you teach, and who you're best with."
                className="field-input resize-y"
              />
            </div>
          </ActionForm>
        </div>
      </Card>

      <p className="mt-4 text-xs text-ink-400">
        Your name, email and hourly rate are held by the agency — contact them to change those.
        Whether your profile appears on the public homepage is the agency&apos;s call too.
      </p>
    </>
  );
}
