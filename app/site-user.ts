import {
  getChatGPTUser,
  requireChatGPTUser,
  type ChatGPTUser,
} from "./chatgpt-auth";

const LOCAL_USER: ChatGPTUser = {
  displayName: "Local Preview",
  email: "local-preview@work-note.site",
  fullName: "Local Preview",
};

export async function getSiteUser(): Promise<ChatGPTUser | null> {
  const user = await getChatGPTUser();
  if (user) return user;
  return process.env.NODE_ENV === "development" ? LOCAL_USER : null;
}

export async function requireSiteUser(returnTo = "/"): Promise<ChatGPTUser> {
  const user = await getSiteUser();
  return user ?? requireChatGPTUser(returnTo);
}
