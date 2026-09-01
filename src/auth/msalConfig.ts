import type { Configuration } from "@azure/msal-browser";

export const TENANT_ID = "e2f6e61f-1d89-4193-82a7-b62dae532dc1";
export const CLIENT_ID = "369c616f-761a-4533-bdb7-bd6ddd9359b4";

export const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: `${window.location.origin}/`,
    postLogoutRedirectUri: `${window.location.origin}/`,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
};

export const loginRequest = {
  scopes: ["User.Read"],
};
