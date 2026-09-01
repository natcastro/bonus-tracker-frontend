import { PublicClientApplication, EventType } from "@azure/msal-browser";
import type { AuthenticationResult } from "@azure/msal-browser";
import { msalConfig } from "./msalConfig";

export const msalInstance = new PublicClientApplication(msalConfig);

// Keep msal-react's "active account" pointer in sync so useMsal()/useAccount()
// resolve correctly right after a redirect sign-in completes.
msalInstance.addEventCallback((event) => {
  if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
    const result = event.payload as AuthenticationResult;
    if (result.account) msalInstance.setActiveAccount(result.account);
  }
});

const existingAccounts = msalInstance.getAllAccounts();
if (existingAccounts.length > 0 && !msalInstance.getActiveAccount()) {
  msalInstance.setActiveAccount(existingAccounts[0]);
}
