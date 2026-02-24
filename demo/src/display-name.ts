/**
 * Extracts the display name from a user claim JSON string.
 * Falls back to the clientId if the claim is missing or invalid.
 */
export function displayNameFromClaim(userClaim: string | undefined, clientId: string): string {
  if (!userClaim) {
    return clientId;
  }
  try {
    const parsed = JSON.parse(userClaim) as { display_name?: string };
    return parsed.display_name || clientId;
  } catch {
    return clientId;
  }
}
