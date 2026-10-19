const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Destiny 2 reinicia los martes a las 17:00 UTC. */
export function getResetWindow(now = new Date()): { startsAt: Date; endsAt: Date; resetId: string } {
  const candidate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    17,
    0,
    0,
    0
  ));
  const daysSinceTuesday = (candidate.getUTCDay() - 2 + 7) % 7;
  candidate.setUTCDate(candidate.getUTCDate() - daysSinceTuesday);
  if (now.getTime() < candidate.getTime()) candidate.setUTCDate(candidate.getUTCDate() - 7);

  const startsAt = candidate;
  const endsAt = new Date(startsAt.getTime() + WEEK_MS);
  return { startsAt, endsAt, resetId: startsAt.toISOString().slice(0, 10) };
}

export function discordTimestamp(date: Date, style: "f" | "R" = "f"): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}
