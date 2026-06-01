window.addEventListener("message", async (event) => {
  if (event.source !== window) return;

  const allowedOrigins = [
    "https://jjkc-algo-blush.vercel.app",
    "https://ytalgoshare.vercel.app",
  ];

  if (!allowedOrigins.includes(event.origin)) return;

  const data = event.data;

  if (!data || data.type !== "JJKC_CONNECT_EXTENSION") {
    return;
  }

  if (!data.userId) {
    return;
  }

  await chrome.storage.local.set({
    jjkcUserId: data.userId,
  });

  window.postMessage(
    {
      type: "JJKC_CONNECT_EXTENSION_DONE",
      ok: true,
    },
    event.origin
  );
});
