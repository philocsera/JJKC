"use client";

export function ExtensionConnectButton() {
  async function connectExtension() {

    const res =
      await fetch("/api/auth/session");

    const session =
      await res.json();

    const userId =
      session?.user?.id;

    if (!userId) {
      alert("로그인이 필요합니다.");
      return;
    }

    navigator.clipboard.writeText(
      userId
    );

    alert(
      "사용자 ID가 복사되었습니다."
    );
  }

  return (
    <button
      onClick={connectExtension}
      className="rounded-md border px-4 py-2"
    >
      📺 Chrome Extension 연결
    </button>
  );
}
