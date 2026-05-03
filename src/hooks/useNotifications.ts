export function useNotifications() {
  const isSupported = typeof window !== "undefined" && "Notification" in window;

  const permission = isSupported ? Notification.permission : "not-supported";

  const requestPermission = async (): Promise<NotificationPermission | "not-supported"> => {
    if (!isSupported) return "not-supported";
    if (Notification.permission === "granted") return "granted";
    return await Notification.requestPermission();
  };

  const notify = (title: string, body: string) => {
    if (!isSupported || Notification.permission !== "granted") return;
    new Notification(title, {
      body,
      icon: "/favicon.ico",
      dir: "rtl",
      lang: "he",
    });
  };

  return { requestPermission, notify, permission, isSupported };
}
