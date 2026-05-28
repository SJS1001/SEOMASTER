export const GOOGLE_SCOPES = {
  openid: "openid",
  email: "https://www.googleapis.com/auth/userinfo.email",
  searchConsole: "https://www.googleapis.com/auth/webmasters.readonly",
  businessProfile: "https://www.googleapis.com/auth/business.manage",
  gmailSend: "https://www.googleapis.com/auth/gmail.send",
} as const;

export const GOOGLE_SCOPE_LIST: string[] = [
  GOOGLE_SCOPES.openid,
  GOOGLE_SCOPES.email,
  GOOGLE_SCOPES.searchConsole,
  GOOGLE_SCOPES.businessProfile,
  GOOGLE_SCOPES.gmailSend,
];
