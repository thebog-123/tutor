"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markRepliesRead } from "@/app/student/actions";

/**
 * Opening the questions page counts as reading the replies, which clears the
 * unread badge in the sidebar. Runs once per mount, only when there is
 * actually something unread.
 */
export function MarkRepliesRead({ unreadCount }: { unreadCount: number }) {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (unreadCount === 0 || done.current) return;
    done.current = true;
    void markRepliesRead().then(() => router.refresh());
  }, [unreadCount, router]);

  return null;
}
