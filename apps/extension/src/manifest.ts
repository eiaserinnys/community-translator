export const TRANSLATED_SITE_MATCHES = [
  "https://discord.com/*",
  "https://www.reddit.com/*",
  "https://old.reddit.com/*",
  "https://x.com/*",
  "https://www.x.com/*",
  "https://twitter.com/*",
  "https://www.twitter.com/*",
] as const;

export const SERVER_OPTIONAL_HOST_PERMISSIONS = [
  "https://*/*",
  "http://localhost/*",
  "http://127.0.0.1/*",
  "http://[::1]/*",
] as const;

// The toolbar action has no popup: clicking it opens the single settings page so
// the extension keeps one canonical settings surface.
export const extensionManifest = {
  name: "커뮤니티 번역",
  description: "Discord · Reddit · X의 영어 아래 한국어, 보내기 전에 영어 미리보기.",
  permissions: ["storage"],
  optional_host_permissions: [...SERVER_OPTIONAL_HOST_PERMISSIONS],
  action: {
    default_title: "커뮤니티 번역 설정",
  },
};
