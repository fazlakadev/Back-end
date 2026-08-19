export function userSelect() {
  return {
    id: true,
    name: true,
    username: true,
    avatarUrl: true,
    bio: true,
  } as const;
}
