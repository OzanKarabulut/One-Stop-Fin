import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  return {
    locale: "tr",
    messages: (await import("../messages/tr.json")).default,
  };
});
