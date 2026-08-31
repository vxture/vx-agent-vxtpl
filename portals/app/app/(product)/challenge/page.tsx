import { redirect } from "next/navigation";

// The app is one screen (owner decision 2026-08-31): the deck lives at `/`.
// This route survives only so old links and bookmarks keep landing somewhere.
export default function ChallengeRedirect(): never {
  redirect("/");
}
